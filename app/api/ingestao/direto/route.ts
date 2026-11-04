import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveUnit, invalidateImpressorasCache } from '@/lib/business';
import { timingSafeCompare } from '@/lib/auth';
import { detectColumnMapping, detectCsvSeparator, type ColumnMapping } from '@/lib/csvColumnMapper';
import { checkRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

interface RemotingResult {
  success: boolean;
  unidade: string | null;
  unidadeCriada: boolean;
  novaLinha: boolean;
  newReadings: number;
  atualizadas: number;
  duplicadas: number;
  arquivo: string | null;
  statusArquivo: string | null;
  erros: string[];
}

function validarApiKey(req: Request): boolean {
  const envKey = (process.env.INGESTAO_API_KEY || '').trim();
  if (!envKey) {
    console.error('[INGESTAO] INGESTAO_API_KEY ausente no ambiente — requisição bloqueada.');
    return false;
  }
  const headerKey = (
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  ).trim();
  if (!headerKey) return false;
  return timingSafeCompare(headerKey, envKey);
}

function parseSafeDate(raw: unknown): Date {
  if (!raw) return new Date();
  const str = String(raw).trim();
  if (!str) return new Date();

  // Suporta formato brasileiro DD/MM/YYYY [HH:mm[:ss]]
  const brMatch = str.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );
  if (brMatch) {
    const [, dd, mm, yyyy, hh = '0', min = '0', ss = '0'] = brMatch;
    const d = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      Number(ss)
    );
    if (!Number.isNaN(d.getTime())) return d;
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function computeSafeIpOffset(ip: string): number {
  if (!ip) return 0;
  return ip
    .split(/[.:]/)
    .reduce((sum, part) => sum + (parseInt(part, 10) || 0), 0);
}

function novoResult(): RemotingResult {
  return {
    success: true,
    unidade: null,
    unidadeCriada: false,
    novaLinha: false,
    newReadings: 0,
    atualizadas: 0,
    duplicadas: 0,
    arquivo: null,
    statusArquivo: null,
    erros: [],
  };
}

export async function POST(req: Request) {
  const result = novoResult();

  if (!validarApiKey(req)) {
    return NextResponse.json({ success: false, error: 'API key invalida.' }, { status: 401 });
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      { success: false, error: 'Payload excede o limite permitido (10 MB).' },
      { status: 413 }
    );
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'direct';
  // Limite generoso para conexões diretas onde várias filiais podem sair pelo mesmo gateway/NAT
  const rateLimit = checkRateLimit(`ingestao_${ip}`, 300, 60_000);

  if (!rateLimit.success) {
    return NextResponse.json(
      { success: false, error: 'Muitas requisições (Rate limit exceeded).' },
      { status: 429 }
    );
  }

  const contentType = req.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      const rawText = await req.text();
      if (Buffer.byteLength(rawText, 'utf8') > MAX_PAYLOAD_BYTES) {
        return NextResponse.json(
          { success: false, error: 'JSON excede o limite de 10 MB.' },
          { status: 413 }
        );
      }
      const body = JSON.parse(rawText);
      await runarJson(body, Buffer.byteLength(rawText, 'utf8'), result);
    } else if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const unidade = String(form.get('unidade') || '').trim();
      const file = form.get('arquivo');
      if (!unidade) throw new Error('Campo "unidade" obrigatorio.');
      if (!file || !(file instanceof File)) {
        throw new Error('Arquivo "arquivo" obrigatorio (multipart).');
      }
      if (file.size > MAX_PAYLOAD_BYTES) {
        return NextResponse.json(
          { success: false, error: 'Arquivo CSV excede o limite de 10 MB.' },
          { status: 413 }
        );
      }
      const content = await file.text();
      const nomeArquivo = file.name || `upload_${Date.now()}.csv`;
      await runarCsv(unidade, nomeArquivo, content, result);
    } else {
      return NextResponse.json(
        { success: false, error: 'Envie multipart/form-data ou application/json.' },
        { status: 400 }
      );
    }

    invalidateImpressorasCache();

    if (result.erros.length > 0) result.success = false;
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.erros.push(msg);
    result.success = false;
    return NextResponse.json(result, { status: 400 });
  }
}

const LeituraSchema = z
  .object({
    ip: z.string().nullish(),
    serial: z.string().nullish(),
    modelo: z.string().nullish(),
    dataHora: z.string().nullish(),
    paginasTotal: z.union([z.number(), z.string()]).nullish(),
    paginasPB: z.union([z.number(), z.string()]).nullish(),
    paginasColor: z.union([z.number(), z.string()]).nullish(),
    status: z.string().nullish(),
  })
  .passthrough();

const PayloadSchema = z.object({
  unidade: z.string().min(1, 'Campo "unidade" obrigatorio.'),
  leituras: z.array(LeituraSchema).min(1, 'Nenhuma leitura presente em "leituras".'),
});

async function runarJson(body: unknown, byteLength: number, result: RemotingResult) {
  if (!body || typeof body !== 'object') throw new Error('JSON invalido.');

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    const msgs = parsed.error.issues.map((i) => i.message).join('; ');
    throw new Error(`Payload invalido: ${msgs}`);
  }

  const unidade = parsed.data.unidade.trim();
  const linhas = parsed.data.leituras;

  const existedBefore = await prisma.unidade.findFirst({
    where: { nomeSanitizado: { equals: unidade.replace(/_/g, ' '), mode: 'insensitive' } },
    select: { id: true },
  });
  const unit = await resolveUnit(prisma, unidade);
  if (!existedBefore) {
    result.unidadeCriada = true;
    result.novaLinha = true;
  }
  result.unidade = unit.nome;

  const touchedPrinterIds = new Set<string>();

  for (const row of linhas) {
    try {
      const { tipo, impressoraId } = await processarLinhaDireta(
        prisma,
        row as Record<string, unknown>,
        unit
      );
      if (impressoraId) touchedPrinterIds.add(impressoraId);
      if (tipo === 'nova') result.newReadings++;
      if (tipo === 'atualizada') result.atualizadas++;
      if (tipo === 'duplicada') result.duplicadas++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('P2002') || msg.includes('Unique constraint')) {
        result.duplicadas++;
        continue;
      }
      result.erros.push(`Linha invalida: ${msg}`);
    }
  }

  // Avalia quebraPorTipo apenas 1 vez por impressora tocada no lote
  await Promise.all([...touchedPrinterIds].map((id) => checkQuebraPorTipo(prisma, id)));

  const temRegistros = result.newReadings + result.atualizadas > 0;
  let statusArquivo = 'PROCESSADO';
  if (!temRegistros) statusArquivo = 'DUPLICADO';
  if (result.erros.length > 0) statusArquivo = 'ERRO';

  const now = new Date();
  const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const nomeArquivo = `relatorio_impressoras_${unit.nomeSanitizado}_${localDateStr}_${Date.now()}.json`;
  result.arquivo = nomeArquivo;
  result.statusArquivo = statusArquivo;

  await prisma.arquivoIngerido.create({
    data: {
      nomeArquivo,
      tamanhoBytes: BigInt(byteLength),
      status: statusArquivo,
      erroMensagem: result.erros.length > 0 ? result.erros.join('; ') : null,
      novas: result.newReadings,
      atualizadas: result.atualizadas,
    },
  });
}

function parsearCsvCompleto(content: string): {
  linhas: Record<string, unknown>[];
  headers: string[];
  sample: Record<string, unknown>[];
} {
  const cleanContent = content.replace(/^\uFEFF/, '');
  const separator = detectCsvSeparator(cleanContent);
  const res = Papa.parse<Record<string, unknown>>(cleanContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    delimiter: separator,
  });
  const linhas = res.data || [];
  const headers = res.meta.fields || [];
  const sample = linhas.slice(0, 10);
  return { linhas, headers, sample };
}

async function runarCsv(unidade: string, nomeArquivo: string, content: string, result: RemotingResult) {
  const jaExiste = await prisma.arquivoIngerido.findUnique({ where: { nomeArquivo } });
  result.arquivo = nomeArquivo;
  const reenvio = !!(jaExiste && jaExiste.status !== 'ERRO');

  const { linhas, headers, sample } = parsearCsvCompleto(content);
  if (!linhas || linhas.length === 0) throw new Error('CSV vazio ou invalido.');

  const mapping = detectColumnMapping(headers, sample);
  const unit = await resolveUnit(prisma, unidade);
  result.unidade = unit.nome;

  const touchedPrinterIds = new Set<string>();

  for (const row of linhas) {
    try {
      const { tipo, impressoraId } = await processarLinhaCsv(prisma, row, unit, mapping);
      if (impressoraId) touchedPrinterIds.add(impressoraId);
      if (tipo === 'nova') result.newReadings++;
      if (tipo === 'atualizada') result.atualizadas++;
      if (tipo === 'duplicada') result.duplicadas++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('P2002') || msg.includes('Unique constraint')) {
        result.duplicadas++;
        continue;
      }
      result.erros.push(`Linha invalida: ${msg}`);
    }
  }

  await Promise.all([...touchedPrinterIds].map((id) => checkQuebraPorTipo(prisma, id)));

  const temRegistros = result.newReadings + result.atualizadas > 0;
  let statusArquivo: string;
  if (!temRegistros) {
    statusArquivo = 'DUPLICADO';
    if (!reenvio) {
      result.erros.push('Nenhuma leitura nova ou atualizada (arquivo ja existente sem alteracoes).');
    }
  } else if (reenvio || result.atualizadas > 0) {
    statusArquivo = 'ATUALIZADO';
  } else {
    statusArquivo = 'PROCESSADO';
  }
  if (result.erros.length > 0) statusArquivo = 'ERRO';
  result.statusArquivo = statusArquivo;

  const byteLen = BigInt(Buffer.byteLength(content, 'utf8'));
  await prisma.arquivoIngerido.upsert({
    where: { nomeArquivo },
    update: {
      status: statusArquivo,
      tamanhoBytes: byteLen,
      erroMensagem: result.erros.length > 0 ? result.erros.join('; ') : null,
      novas: result.newReadings,
      atualizadas: result.atualizadas,
    },
    create: {
      nomeArquivo,
      tamanhoBytes: byteLen,
      status: statusArquivo,
      erroMensagem: result.erros.length > 0 ? result.erros.join('; ') : null,
      novas: result.newReadings,
      atualizadas: result.atualizadas,
    },
  });
}

function detectReset(
  newTotal: number,
  newPB: number,
  prevTotal: number,
  prevPB: number
): boolean {
  if (prevPB > 0 && newPB > 0 && newPB < prevPB) return true;
  if (prevTotal > 0 && newTotal > 0 && newTotal < prevTotal) return true;
  return false;
}

async function processarLinhaCsv(
  p: PrismaClient,
  row: Record<string, unknown>,
  unit: Prisma.UnidadeGetPayload<{ include: { aliases: true; perfilFranquia: true } }>,
  mapping: ColumnMapping
): Promise<{ tipo: 'nova' | 'atualizada' | 'duplicada'; impressoraId?: string }> {
  const ip = String(row[mapping.ip] ?? row.IP ?? row.ip ?? '').trim();
  const serial = String(row[mapping.serial] ?? row.Serial ?? row.serial ?? row.SN ?? '').trim();
  const modelo = String(row[mapping.modelo] ?? row.Modelo ?? row.modelo ?? '').trim();
  const dataStr = String(row[mapping.dataHora] ?? row.DataHora ?? row.dataHora ?? row.Data ?? '').trim();
  const status = String(row[mapping.status] ?? row.Status ?? row.status ?? 'Online').trim();

  const paginasTotal = lerNumerico(row, mapping.paginasTotal, [
    'Paginas_Total',
    'PaginasTotal',
    'Total',
    'paginasTotal',
  ]);
  const paginasPB = lerNumerico(row, mapping.paginasPB, ['Paginas_PB', 'PaginasPB', 'PB', 'paginasPB']);
  let paginasColor = lerNumerico(row, mapping.paginasColor, [
    'Paginas_Color',
    'PaginasColor',
    'Color',
    'paginasColor',
  ]);

  const modeloLower = modelo.toLowerCase();
  if (modeloLower.includes('c3300i') && paginasPB > 0 && paginasPB === paginasColor) {
    paginasColor = 0;
  }

  const dataHora = parseSafeDate(dataStr);

  // Se serial vier N/A (ex.: impressora offline), tenta associar pela impressora já cadastrada com o mesmo IP na unidade
  if (serial === 'N/A' || !serial) {
    const porIp = ip
      ? await p.impressora.findFirst({ where: { ip, unidadeId: unit.id } })
      : null;

    if (porIp) {
      const ultima = await p.leituraImpressora.findFirst({
        where: { impressoraId: porIp.id },
        orderBy: { dataHora: 'desc' },
      });
      const ipOffset = computeSafeIpOffset(ip);
      const uniqueDataHora = new Date(dataHora.getTime() + ipOffset);
      await p.leituraImpressora.create({
        data: {
          ip: ip || porIp.ip,
          serial: porIp.serial,
          impressoraId: porIp.id,
          unidadeId: unit.id,
          dataHora: uniqueDataHora,
          paginasTotal: ultima?.paginasTotal ?? 0,
          paginasPB: ultima?.paginasPB ?? 0,
          paginasColor: ultima?.paginasColor ?? 0,
          status: status || 'Offline',
          resetPlaca: false,
        },
      });
      return { tipo: 'nova', impressoraId: porIp.id };
    }

    const ipOffset = computeSafeIpOffset(ip);
    const uniqueDataHora = new Date(dataHora.getTime() + ipOffset);
    await p.leituraImpressora.create({
      data: {
        ip: ip || '0.0.0.0',
        serial: 'N/A',
        impressoraId: null,
        unidadeId: unit.id,
        dataHora: uniqueDataHora,
        paginasTotal: 0,
        paginasPB: 0,
        paginasColor: 0,
        status: status || 'Offline',
        resetPlaca: false,
      },
    });
    return { tipo: 'nova' };
  }

  const impressora = await p.impressora.upsert({
    where: { serial },
    update: {
      ip: ip || undefined,
      modelo: modelo && modelo !== 'Desconhecido' ? modelo : undefined,
      unidadeId: unit.id,
    },
    create: {
      serial,
      ip: ip || '0.0.0.0',
      modelo: modelo || 'Desconhecido',
      apelido: null,
      unidadeId: unit.id,
      preExistente: true,
    },
  });

  const existente = await p.leituraImpressora.findFirst({
    where: { ip: ip || '0.0.0.0', serial, dataHora },
    orderBy: { dataHora: 'desc' },
  });

  if (existente) {
    const novoMaior =
      paginasTotal > existente.paginasTotal ||
      paginasPB > existente.paginasPB ||
      paginasColor > existente.paginasColor ||
      (status && status !== existente.status);
    if (!novoMaior) {
      return { tipo: 'duplicada' };
    }
    const resetPlaca = detectReset(
      paginasTotal,
      paginasPB,
      existente.paginasTotal,
      existente.paginasPB
    );
    await p.leituraImpressora.update({
      where: { id: existente.id },
      data: {
        paginasTotal: paginasTotal || existente.paginasTotal,
        paginasPB: paginasPB || existente.paginasPB,
        paginasColor: paginasColor || existente.paginasColor,
        status: status || 'Online',
        resetPlaca,
        ip: ip || existente.ip,
        impressoraId: impressora.id,
      },
    });
    return { tipo: 'atualizada', impressoraId: impressora.id };
  }

  const ultima = await p.leituraImpressora.findFirst({
    where: { impressoraId: impressora.id },
    orderBy: { dataHora: 'desc' },
  });

  // Se estiver Offline com contadores zerados, preserva último odômetro conhecido para não gerar falso resetPlaca
  const isOfflineZero =
    status.toLowerCase() !== 'online' && paginasTotal === 0 && paginasPB === 0 && paginasColor === 0;
  const effTotal = isOfflineZero && ultima ? ultima.paginasTotal : paginasTotal;
  const effPB = isOfflineZero && ultima ? ultima.paginasPB : paginasPB;
  const effCol = isOfflineZero && ultima ? ultima.paginasColor : paginasColor;

  const resetPlaca = ultima
    ? detectReset(effTotal, effPB, ultima.paginasTotal, ultima.paginasPB)
    : false;

  await p.leituraImpressora.create({
    data: {
      dataHora,
      paginasTotal: effTotal,
      paginasPB: effPB,
      paginasColor: effCol,
      status: status || 'Online',
      resetPlaca,
      ip: ip || '0.0.0.0',
      serial,
      impressoraId: impressora.id,
      unidadeId: unit.id,
    },
  });

  return { tipo: 'nova', impressoraId: impressora.id };
}

async function processarLinhaDireta(
  p: PrismaClient,
  row: Record<string, unknown>,
  unit: Prisma.UnidadeGetPayload<{ include: { aliases: true; perfilFranquia: true } }>
): Promise<{ tipo: 'nova' | 'atualizada' | 'duplicada'; impressoraId?: string }> {
  const ip = String(row.ip ?? row.IP ?? '').trim();
  const serial = String(row.serial ?? row.Serial ?? row.SN ?? '').trim();
  const modelo = String(row.modelo ?? '').trim();
  const dataHora = parseSafeDate(row.dataHora);
  const status = String(row.status ?? 'Online').trim();
  let total = Math.max(0, Number(row.paginasTotal ?? row.total ?? 0) || 0);
  let pb = Math.max(0, Number(row.paginasPB ?? row.pb ?? 0) || 0);
  let color = Math.max(0, Number(row.paginasColor ?? row.color ?? 0) || 0);

  const modeloLower = modelo.toLowerCase();
  if (modeloLower.includes('c3300i') && pb > 0 && pb === color) {
    color = 0;
  }

  if (serial === 'N/A' || !serial) {
    const porIp = ip
      ? await p.impressora.findFirst({ where: { ip, unidadeId: unit.id } })
      : null;

    if (porIp) {
      const ultima = await p.leituraImpressora.findFirst({
        where: { impressoraId: porIp.id },
        orderBy: { dataHora: 'desc' },
      });
      const ipOffset = computeSafeIpOffset(ip);
      const uniqueDataHora = new Date(dataHora.getTime() + ipOffset);
      await p.leituraImpressora.create({
        data: {
          ip: ip || porIp.ip,
          serial: porIp.serial,
          impressoraId: porIp.id,
          unidadeId: unit.id,
          dataHora: uniqueDataHora,
          paginasTotal: ultima?.paginasTotal ?? 0,
          paginasPB: ultima?.paginasPB ?? 0,
          paginasColor: ultima?.paginasColor ?? 0,
          status: status || 'Offline',
          resetPlaca: false,
        },
      });
      return { tipo: 'nova', impressoraId: porIp.id };
    }

    const ipOffset = computeSafeIpOffset(ip);
    const uniqueDataHora = new Date(dataHora.getTime() + ipOffset);
    await p.leituraImpressora.create({
      data: {
        ip: ip || '0.0.0.0',
        serial: 'N/A',
        impressoraId: null,
        unidadeId: unit.id,
        dataHora: uniqueDataHora,
        paginasTotal: 0,
        paginasPB: 0,
        paginasColor: 0,
        status: status || 'Offline',
        resetPlaca: false,
      },
    });
    return { tipo: 'nova' };
  }

  const impressora = await p.impressora.upsert({
    where: { serial },
    update: {
      ip: ip || undefined,
      modelo: modelo && modelo !== 'Desconhecido' ? modelo : undefined,
      unidadeId: unit.id,
    },
    create: {
      serial,
      ip: ip || '0.0.0.0',
      modelo: modelo || 'Desconhecido',
      apelido: null,
      unidadeId: unit.id,
      preExistente: true,
    },
  });

  const existente = await p.leituraImpressora.findFirst({
    where: { ip: ip || '0.0.0.0', serial, dataHora },
    orderBy: { dataHora: 'desc' },
  });

  if (existente) {
    const novoMaior =
      total > existente.paginasTotal ||
      pb > existente.paginasPB ||
      color > existente.paginasColor ||
      (status && status !== existente.status);
    if (!novoMaior) return { tipo: 'duplicada' };

    const resetPlaca = detectReset(total, pb, existente.paginasTotal, existente.paginasPB);
    await p.leituraImpressora.update({
      where: { id: existente.id },
      data: {
        paginasTotal: total || existente.paginasTotal,
        paginasPB: pb || existente.paginasPB,
        paginasColor: color || existente.paginasColor,
        status: status || 'Online',
        resetPlaca,
        ip: ip || existente.ip,
        impressoraId: impressora.id,
      },
    });
    return { tipo: 'atualizada', impressoraId: impressora.id };
  }

  const ultima = await p.leituraImpressora.findFirst({
    where: { impressoraId: impressora.id },
    orderBy: { dataHora: 'desc' },
  });

  const isOfflineZero =
    status.toLowerCase() !== 'online' && total === 0 && pb === 0 && color === 0;
  if (isOfflineZero && ultima) {
    total = ultima.paginasTotal;
    pb = ultima.paginasPB;
    color = ultima.paginasColor;
  }

  const resetPlaca = ultima
    ? detectReset(total, pb, ultima.paginasTotal, ultima.paginasPB)
    : false;

  await p.leituraImpressora.create({
    data: {
      dataHora,
      paginasTotal: total,
      paginasPB: pb,
      paginasColor: color,
      status: status || 'Online',
      resetPlaca,
      ip: ip || '0.0.0.0',
      serial,
      impressoraId: impressora.id,
      unidadeId: unit.id,
    },
  });

  return { tipo: 'nova', impressoraId: impressora.id };
}

async function checkQuebraPorTipo(p: PrismaClient, impressoraId: string) {
  const N = 3;
  const recent = await p.leituraImpressora.findMany({
    where: { impressoraId, status: 'Online' },
    orderBy: { dataHora: 'desc' },
    take: N,
    select: { paginasPB: true, paginasColor: true, paginasTotal: true },
  });
  if (recent.length < N) return;
  const pbTravado = new Set(recent.map((r) => r.paginasPB)).size === 1;
  const colTravado = new Set(recent.map((r) => r.paginasColor)).size === 1;
  const totalAvancou = new Set(recent.map((r) => r.paginasTotal)).size > 1;
  const indisponivel = pbTravado && colTravado && totalAvancou;

  await p.impressora.update({
    where: { id: impressoraId },
    data: { quebraPorTipoIndisponivel: indisponivel },
  });
}

function lerNumerico(row: Record<string, unknown>, mapa: string, fallbacks: string[]): number {
  if (mapa) {
    const v = Number(row[mapa]);
    if (!Number.isNaN(v)) return Math.max(0, v);
  }
  for (const fb of fallbacks) {
    const v = Number(row[fb]);
    if (!Number.isNaN(v)) return Math.max(0, v);
  }
  return 0;
}

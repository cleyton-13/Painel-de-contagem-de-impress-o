import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { sanitizeUnitName, resolveUnit } from '@/lib/business';
import { detectColumnMapping, detectCsvSeparator, type ColumnMapping } from '@/lib/csvColumnMapper';
import { checkRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ENDPOINT DE PRODUCAO - Ingestao Remota por HTTP
 *
 * A unidade envia os dados diretamente para este endpoint. Dois formatos:
 *
 *  1) multipart/form-data:
 *     - campo: unidade   (ex: "AE_PERUS")
 *     - campo: arquivo   (arquivo CSV no padrao das impressoras)
 *
 *  2) application/json:
 *     { "unidade": "...", "leituras": [ { "ip","serial","modelo","dataHora",
 *       "paginasTotal","paginasPB","paginasColor","status" } ] }
 *
 * REGRA DE REENVIO (mesmo nome de arquivo/linha):
 *  - Se a leitura nao existe -> cria (nova).
 *  - Se existe (mesmo IP+serial+dataHora) e os contadores do reenvio sao
 *    MAIORES que os gravados -> ATUALIZA a leitura existente.
 *  - Se existente e contadores iguais ou menores -> ignorada (duplicada).
 *
 * Seguranca: header "x-api-key" deve bater com INGESTAO_API_KEY (se definida).
 */

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
  const envKey = process.env.INGESTAO_API_KEY || '';
  if (!envKey) return true; // sem chave configurada => aceita (nao recomendado em producao)
  return req.headers.get('x-api-key') === envKey;
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

  // Rate Limiting (100 requisições por minuto por IP)
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const rateLimit = checkRateLimit(`ingestao_${ip}`, 100, 60000);
  
  if (!rateLimit.success) {
    return NextResponse.json({ success: false, error: 'Muitas requisições (Rate limit exceeded).' }, { status: 429 });
  }

  const contentType = req.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      const body = await req.json();
      await runarJson(body, result);
    } else if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const unidade = String(form.get('unidade') || '').trim();
      const file = form.get('arquivo');
      if (!unidade) throw new Error('Campo "unidade" obrigatorio.');
      if (!file || !(file instanceof File)) {
        throw new Error('Arquivo "arquivo" obrigatorio (multipart).');
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

    if (result.erros.length > 0) result.success = false;
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.erros.push(msg);
    result.success = false;
    return NextResponse.json(result, { status: 400 });
  }
}

// ---------------------------------------------------------------- JSON direto
const LeituraSchema = z.object({
  ip: z.string().nullish(),
  serial: z.string().nullish(),
  modelo: z.string().nullish(),
  dataHora: z.string().nullish(),
  paginasTotal: z.union([z.number(), z.string()]).nullish(),
  paginasPB: z.union([z.number(), z.string()]).nullish(),
  paginasColor: z.union([z.number(), z.string()]).nullish(),
  status: z.string().nullish(),
}).passthrough();

const PayloadSchema = z.object({
  unidade: z.string().min(1, 'Campo "unidade" obrigatorio.'),
  leituras: z.array(LeituraSchema).min(1, 'Nenhuma leitura presente em "leituras".'),
});

async function runarJson(body: unknown, result: RemotingResult) {
  if (!body || typeof body !== 'object') throw new Error('JSON invalido.');
  
  // Validação segura do payload com Zod
  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    const msgs = parsed.error.issues.map(i => i.message).join('; ');
    throw new Error(`Payload invalido: ${msgs}`);
  }
  
  const unidade = parsed.data.unidade.trim();
  const linhas = parsed.data.leituras;

  const countBefore = await prisma.unidade.count();
  const unit = await resolveUnit(prisma, unidade);
  const countAfter = await prisma.unidade.count();
  if (countAfter > countBefore) { result.unidadeCriada = true; result.novaLinha = true; }
  result.unidade = unit.nome;

  for (const row of linhas) {
    try {
      const tipo = await processarLinhaDireta(prisma, row as Record<string, unknown>, unit);
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

  const temRegistros = result.newReadings + result.atualizadas > 0;
  let statusArquivo = 'PROCESSADO';
  if (!temRegistros) statusArquivo = 'DUPLICADO';
  if (result.erros.length > 0) statusArquivo = 'ERRO';

  const dateStr = new Date().toISOString().split('T')[0];
  const nomeArquivo = `relatorio_impressoras_${unit.nomeSanitizado}_${dateStr}_${Date.now()}.json`;
  result.arquivo = nomeArquivo;
  result.statusArquivo = statusArquivo;

  await prisma.arquivoIngerido.create({
    data: {
      nomeArquivo,
      tamanhoBytes: BigInt(JSON.stringify(body).length),
      status: statusArquivo,
      erroMensagem: result.erros.length > 0 ? result.erros.join('; ') : null,
      novas: result.newReadings,
      atualizadas: result.atualizadas,
    },
  });
}

// ---------------------------------------------------------------- CSV (multipart)
// Parse unico: retorna linhas, headers e sample numa so passada
function parsearCsvCompleto(content: string): { linhas: Record<string, unknown>[]; headers: string[]; sample: Record<string, unknown>[] } {
  const separator = detectCsvSeparator(content);
  const res = Papa.parse<Record<string, unknown>>(content, {
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

  const countBefore = await prisma.unidade.count();
  const unit = await resolveUnit(prisma, unidade);
  const countAfter = await prisma.unidade.count();
  if (countAfter > countBefore) { result.unidadeCriada = true; result.novaLinha = true; }
  result.unidade = unit.nome;

  for (const row of linhas) {
    try {
      const tipo = await processarLinhaCsv(prisma, row, unit, mapping);
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

  const temRegistros = result.newReadings + result.atualizadas > 0;
  let statusArquivo: string;
  if (!temRegistros) {
    statusArquivo = 'DUPLICADO';
    if (!reenvio) {
      result.erros.push(`Nenhuma leitura nova ou atualizada (arquivo ja existente sem alteracoes).`);
    }
  } else if (reenvio || result.atualizadas > 0) {
    statusArquivo = 'ATUALIZADO';
  } else {
    statusArquivo = 'PROCESSADO';
  }
  if (result.erros.length > 0) statusArquivo = 'ERRO';
  result.statusArquivo = statusArquivo;

  await prisma.arquivoIngerido.upsert({
    where: { nomeArquivo },
    update: {
      status: statusArquivo,
      tamanhoBytes: BigInt(Buffer.byteLength(content, 'utf-8')),
      erroMensagem: result.erros.length > 0 ? result.erros.join('; ') : null,
      novas: result.newReadings,
      atualizadas: result.atualizadas,
    },
    create: {
      nomeArquivo,
      tamanhoBytes: BigInt(Buffer.byteLength(content, 'utf8')),
      status: statusArquivo,
      erroMensagem: result.erros.length > 0 ? result.erros.join('; ') : null,
      novas: result.newReadings,
      atualizadas: result.atualizadas,
    },
  });
}

// ---------------------------------------------------------------- impressora
async function processarLinhaCsv(
  p: PrismaClient,
  row: Record<string, unknown>,
  unit: Prisma.UnidadeGetPayload<{ include: { aliases: true; perfilFranquia: true } }>,
  mapping: ColumnMapping
): Promise<'nova' | 'atualizada' | 'duplicada'> {
  const ip = String(row[mapping.ip] ?? row.IP ?? row.ip ?? '').trim();
  const serial = String(row[mapping.serial] ?? row.Serial ?? row.serial ?? row.SN ?? '').trim();
  const modelo = String(row[mapping.modelo] ?? row.Modelo ?? row.modelo ?? '').trim();
  const dataStr = String(row[mapping.dataHora] ?? row.DataHora ?? row.dataHora ?? row.Data ?? '').trim();
  const status = String(row[mapping.status] ?? row.Status ?? row.status ?? 'Online').trim();

  let paginasTotal = lerNumerico(row, mapping.paginasTotal, ['Paginas_Total', 'PaginasTotal', 'Total', 'paginasTotal']);
  let paginasPB = lerNumerico(row, mapping.paginasPB, ['Paginas_PB', 'PaginasPB', 'PB', 'paginasPB']);
  let paginasColor = lerNumerico(row, mapping.paginasColor, ['Paginas_Color', 'PaginasColor', 'Color', 'paginasColor']);

  const modeloLower = modelo.toLowerCase();
  if (modeloLower.includes('c3300i') && paginasPB > 0 && paginasPB === paginasColor) {
    paginasColor = 0;
  }

  const dataHora = dataStr ? new Date(dataStr) : new Date();

  // Serial "N/A" -> log isolado
  if (serial === 'N/A' || !serial) {
    // Adiciona offset de milissegundos baseado no IP para evitar violacao de constraint unique
    const ipOffset = ip.split('.').reduce((s, n) => s + parseInt(n, 10), 0);
    const uniqueDataHora = new Date(dataHora.getTime() + ipOffset);
    await p.leituraImpressora.create({
      data: {
        ip: ip || '0.0.0.0', serial: 'N/A', impressoraId: null, unidadeId: unit.id,
        dataHora: uniqueDataHora, paginasTotal: 0, paginasPB: 0, paginasColor: 0,
        status: status || 'Offline', resetPlaca: false,
      },
    });
    return 'nova';
  }

  const impressora = await p.impressora.upsert({
    where: { serial },
    update: { ip, modelo, unidadeId: unit.id },
    create: { serial, ip, modelo, apelido: null, unidadeId: unit.id, preExistente: true },
  });

  // Regra de reenvio: mesma impressora + mesma dataHora (unique: ip+serial+dataHora)
  const existente = await p.leituraImpressora.findFirst({
    where: { ip: ip || '0.0.0.0', serial, dataHora },
    orderBy: { dataHora: 'desc' },
  });

  if (existente) {
    const novoMaior =
      paginasTotal > existente.paginasTotal ||
      paginasPB > existente.paginasPB ||
      paginasColor > existente.paginasColor;
    if (!novoMaior) {
      return 'duplicada'; // contadores iguais ou menores => reenvio sem novidade
    }
    const resetPlaca = paginasPB < existente.paginasPB;
    await p.leituraImpressora.update({
      where: { id: existente.id },
      data: {
        paginasTotal, paginasPB, paginasColor,
        status: status || 'Online', resetPlaca,
        ip, impressoraId: impressora.id,
      },
    });
    await checkQuebraPorTipo(p, impressora.id);
    return 'atualizada';
  }

  let resetPlaca = false;
  const ultima = await p.leituraImpressora.findFirst({
    where: { serial, unidadeId: unit.id },
    orderBy: { dataHora: 'desc' },
  });
  if (ultima && paginasPB < ultima.paginasPB) resetPlaca = true;

  await p.leituraImpressora.create({
    data: {
      dataHora, paginasTotal, paginasPB, paginasColor, status: status || 'Online',
      resetPlaca, ip, serial, impressoraId: impressora.id, unidadeId: unit.id,
    },
  });

  await checkQuebraPorTipo(p, impressora.id);
  return 'nova';
}

// Processamento de uma leitura que chega pronta em JSON
async function processarLinhaDireta(
  p: PrismaClient,
  row: Record<string, unknown>,
  unit: Prisma.UnidadeGetPayload<{ include: { aliases: true; perfilFranquia: true } }>
): Promise<'nova' | 'atualizada' | 'duplicada'> {
  const ip = String(row.ip ?? row.IP ?? '').trim();
  const serial = String(row.serial ?? row.Serial ?? row.SN ?? '').trim();
  const modelo = String(row.modelo ?? '').trim();
  const dataHora = row.dataHora ? new Date(String(row.dataHora)) : new Date();
  const status = String(row.status ?? 'Online').trim();
  let total = Number(row.paginasTotal ?? row.total ?? 0);
  let pb = Number(row.paginasPB ?? row.pb ?? 0);
  let color = Number(row.paginasColor ?? row.color ?? 0);
  if (isNaN(total)) total = 0;
  if (isNaN(pb)) pb = 0;
  if (isNaN(color)) color = 0;

  // Regra c3300i: PB e Color iguais indica leitura espelhada (nao e realmente color)
  const modeloLower = modelo.toLowerCase();
  if (modeloLower.includes('c3300i') && pb > 0 && pb === color) {
    color = 0;
  }

  if (serial === 'N/A' || !serial) {
    const ipOffset = ip.split('.').reduce((s: number, n: string) => s + parseInt(n, 10), 0);
    const uniqueDataHora = new Date(dataHora.getTime() + ipOffset);
    await p.leituraImpressora.create({
      data: {
        ip: ip || '0.0.0.0', serial: 'N/A', impressoraId: null, unidadeId: unit.id,
        dataHora: uniqueDataHora, paginasTotal: 0, paginasPB: 0, paginasColor: 0,
        status: status || 'Offline', resetPlaca: false,
      },
    });
    return 'nova';
  }

  const impressora = await p.impressora.upsert({
    where: { serial },
    update: { ip, modelo, unidadeId: unit.id },
    create: { serial, ip, modelo, apelido: null, unidadeId: unit.id, preExistente: true },
  });

  const existente = await p.leituraImpressora.findFirst({
    where: { ip: ip || '0.0.0.0', serial, dataHora },
    orderBy: { dataHora: 'desc' },
  });

  if (existente) {
    const novoMaior =
      total > existente.paginasTotal ||
      pb > existente.paginasPB ||
      color > existente.paginasColor;
    if (!novoMaior) return 'duplicada';
    const resetPlaca = pb < existente.paginasPB;
    await p.leituraImpressora.update({
      where: { id: existente.id },
      data: {
        paginasTotal: total, paginasPB: pb, paginasColor: color,
        status: status || 'Online', resetPlaca, ip,
        impressoraId: impressora.id,
      },
    });
    await checkQuebraPorTipo(p, impressora.id);
    return 'atualizada';
  }

  const ultima = await p.leituraImpressora.findFirst({
    where: { serial, unidadeId: unit.id },
    orderBy: { dataHora: 'desc' },
  });
  const resetPlaca = !!(ultima && pb < ultima.paginasPB);

  await p.leituraImpressora.create({
    data: {
      dataHora, paginasTotal: total, paginasPB: pb, paginasColor: color,
      status: status || 'Online', resetPlaca, ip, serial,
      impressoraId: impressora.id, unidadeId: unit.id,
    },
  });

  await checkQuebraPorTipo(p, impressora.id);
  return 'nova';
}

async function checkQuebraPorTipo(p: PrismaClient, impressoraId: string) {
  const N = 3;
  const recent = await p.leituraImpressora.findMany({
    where: { impressoraId },
    orderBy: { dataHora: 'desc' },
    take: N,
    select: { paginasPB: true, paginasColor: true, paginasTotal: true },
  });
  if (recent.length < N) return;
  const pbTravado = new Set(recent.map(r => r.paginasPB)).size === 1;
  const colTravado = new Set(recent.map(r => r.paginasColor)).size === 1;
  const totalAvancou = new Set(recent.map(r => r.paginasTotal)).size > 1;
  await p.impressora.update({
    where: { id: impressoraId },
    data: { quebraPorTipoIndisponivel: pbTravado && colTravado && totalAvancou },
  });
}

function lerNumerico(row: Record<string, unknown>, mapa: string, fallbacks: string[]): number {
  if (mapa) {
    const v = Number(row[mapa]);
    if (!isNaN(v)) return v;
  }
  for (const fb of fallbacks) {
    const v = Number(row[fb]);
    if (!isNaN(v)) return v;
  }
  return 0;
}
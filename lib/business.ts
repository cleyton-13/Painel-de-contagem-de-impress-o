import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import {
  Unidade,
  Impressora,
  DashboardKPIs,
  TimelineDataPoint,
  BranchRankingItem,
  FinancialProjection,
  ContagemDiariaItem,
  ContagemDiariaAgrupada,
  ContagemDiariaDiaItem,
} from './types';
import { getConfigContagem } from './config';

type UnidadeWithRelations = Prisma.UnidadeGetPayload<{
  include: { aliases: true; perfilFranquia: true };
}>;

type CounterSnapshot = {
  pb: number;
  col: number;
  total: number;
};

export async function toUnidadeView(u: UnidadeWithRelations): Promise<Unidade> {
  return {
    id: u.id,
    nome: u.nome,
    nomeSanitizado: u.nomeSanitizado,
    emailContato: u.emailContato,
    perfilFranquiaId: u.perfilFranquiaId,
    perfilFranquia: u.perfilFranquia
      ? {
          id: u.perfilFranquia.id,
          nome: u.perfilFranquia.nome,
          tarifaAvulsaPB: Number(u.perfilFranquia.tarifaAvulsaPB),
          tarifaAvulsaColor: Number(u.perfilFranquia.tarifaAvulsaColor),
          temFranquiaFixa: u.perfilFranquia.temFranquiaFixa,
          valorFixoMensal: u.perfilFranquia.valorFixoMensal,
          cotaPB: u.perfilFranquia.cotaPB,
          cotaColor: u.perfilFranquia.cotaColor,
          excedentePB: u.perfilFranquia.excedentePB,
          excedenteColor: u.perfilFranquia.excedenteColor,
          precoResmaPapel: Number(u.perfilFranquia.precoResmaPapel),
          createdAt: u.perfilFranquia.createdAt.toISOString(),
          updatedAt: u.perfilFranquia.updatedAt.toISOString(),
        }
      : null,
    aliases: u.aliases.map((a) => ({
      id: a.id,
      alias: a.alias,
      unidadeId: a.unidadeId,
      createdAt: a.createdAt.toISOString(),
    })),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

// Normaliza nome da unidade (NFD, Uppercase, underscores -> espaços, trim)
export function sanitizeUnitName(rawName: string): string {
  return rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Resolve ou cria unidade por nome sanitizado/alias (à prova de condição de corrida P2002)
export async function resolveUnit(prisma: PrismaClient, rawUnitName: string): Promise<UnidadeWithRelations> {
  const sanitized = sanitizeUnitName(rawUnitName);
  const trimmedRaw = rawUnitName.trim();

  const findExisting = async (): Promise<UnidadeWithRelations | null> => {
    const unit = await prisma.unidade.findFirst({
      where: {
        OR: [
          { nomeSanitizado: sanitized },
          { nome: trimmedRaw },
          { nomeSanitizado: { equals: sanitized, mode: 'insensitive' } },
          { nome: { equals: trimmedRaw, mode: 'insensitive' } },
        ],
      },
      include: { aliases: true, perfilFranquia: true },
    });
    if (unit) return unit;

    const alias = await prisma.unidadeAlias.findFirst({
      where: { alias: { equals: sanitized, mode: 'insensitive' } },
      include: { unidade: { include: { aliases: true, perfilFranquia: true } } },
    });
    return alias ? alias.unidade : null;
  };

  const existing = await findExisting();
  if (existing) return existing;

  try {
    return await prisma.unidade.create({
      data: {
        nome: trimmedRaw,
        nomeSanitizado: sanitized,
      },
      include: { aliases: true, perfilFranquia: true },
    });
  } catch (err) {
    // Caso outro envio simultâneo tenha acabado de criar a mesma unidade
    const afterRace = await findExisting();
    if (afterRace) return afterRace;
    throw err;
  }
}

// Cache em memória com deduplicação de Promises em voo e invalidação explícita
const impressorasViewCache = new Map<string, { data: Impressora[]; timestamp: number }>();
const inFlightImpressoras = new Map<string, Promise<Impressora[]>>();
const CACHE_TTL = 15_000;
const MAX_CACHE_ENTRIES = 200;

export function invalidateImpressorasCache(): void {
  impressorasViewCache.clear();
  inFlightImpressoras.clear();
}

function setBoundedCache(key: string, data: Impressora[]) {
  if (impressorasViewCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = impressorasViewCache.keys().next().value;
    if (firstKey) impressorasViewCache.delete(firstKey);
  }
  impressorasViewCache.set(key, { data, timestamp: Date.now() });
}

export type PeriodoContagem = 'hoje' | '7dias' | '30dias' | 'trimestre' | 'ano';

function periodoToDateRange(periodo: PeriodoContagem): Date {
  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999);
  const inicio = new Date(hoje);
  switch (periodo) {
    case 'hoje':
      inicio.setHours(0, 0, 0, 0);
      return inicio;
    case '7dias':
      inicio.setDate(inicio.getDate() - 6);
      break;
    case '30dias':
      inicio.setDate(inicio.getDate() - 29);
      break;
    case 'trimestre':
      inicio.setDate(inicio.getDate() - 89);
      break;
    case 'ano':
      inicio.setFullYear(inicio.getFullYear() - 1);
      inicio.setDate(inicio.getDate() + 1);
      break;
  }
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeStatus(raw?: string | null): 'Online' | 'Offline' | 'Erro SNMP' {
  if (!raw) return 'Offline';
  const lower = raw.trim().toLowerCase();
  if (lower === 'online') return 'Online';
  if (lower.includes('snmp') || lower.includes('erro')) return 'Erro SNMP';
  return 'Offline';
}

// Busca em 1 única query SQL a última leitura anterior a `inicio` por impressoraId
async function fetchBaselineBeforePeriod(
  prisma: PrismaClient,
  printerIds: string[],
  inicio: Date
): Promise<Map<string, CounterSnapshot>> {
  const map = new Map<string, CounterSnapshot>();
  if (printerIds.length === 0) return map;

  type BaselineRow = {
    impressoraId: string;
    paginasPB: number | bigint;
    paginasColor: number | bigint;
    paginasTotal: number | bigint;
  };

  const rows = await prisma.$queryRaw<BaselineRow[]>`
    SELECT DISTINCT ON ("impressoraId")
      "impressoraId",
      "paginasPB",
      "paginasColor",
      "paginasTotal"
    FROM "LeituraImpressora"
    WHERE "impressoraId" IN (${Prisma.join(printerIds)})
      AND "dataHora" < ${inicio}
    ORDER BY "impressoraId", "dataHora" DESC
  `;

  for (const r of rows) {
    if (!r.impressoraId) continue;
    map.set(r.impressoraId, {
      pb: Number(r.paginasPB),
      col: Number(r.paginasColor),
      total: Number(r.paginasTotal),
    });
  }

  return map;
}

function computeStepDelta(
  cur: CounterSnapshot,
  base: CounterSnapshot | null | undefined,
  usarTotal: boolean
): { dpb: number; dcol: number; reset: boolean } {
  if (!base) {
    if (usarTotal) {
      return { dpb: Math.max(0, cur.total), dcol: 0, reset: false };
    }
    return {
      dpb: Math.max(0, cur.pb),
      dcol: Math.max(0, cur.col),
      reset: false,
    };
  }

  if (usarTotal) {
    if (cur.total < base.total) {
      return { dpb: Math.max(0, cur.total), dcol: 0, reset: true };
    }
    return { dpb: cur.total - base.total, dcol: 0, reset: false };
  }

  let reset = false;
  let dpb = 0;
  let dcol = 0;

  if (cur.pb < base.pb) {
    reset = true;
    dpb = Math.max(0, cur.pb);
  } else {
    dpb = cur.pb - base.pb;
  }

  if (cur.col < base.col) {
    reset = true;
    dcol = Math.max(0, cur.col);
  } else {
    dcol = cur.col - base.col;
  }

  return { dpb, dcol, reset };
}

export async function getImpressorasView(
  prisma: PrismaClient,
  unidadeId?: string,
  search?: string,
  periodo: PeriodoContagem = '30dias'
): Promise<Impressora[]> {
  const { usarSeparacaoCores, faturamentoHabilitado, tarifaUnica } = await getConfigContagem();
  const cfgSig = `${usarSeparacaoCores ? 1 : 0}_${faturamentoHabilitado ? 1 : 0}_${tarifaUnica}`;
  const cacheKey = `${unidadeId || 'ALL'}_${(search || '').trim().toLowerCase()}_${periodo}_${cfgSig}`;

  const cached = impressorasViewCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const existingPromise = inFlightImpressoras.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = computeImpressorasView(
    prisma,
    unidadeId,
    search,
    periodo,
    usarSeparacaoCores,
    faturamentoHabilitado,
    tarifaUnica
  )
    .then((data) => {
      setBoundedCache(cacheKey, data);
      return data;
    })
    .finally(() => {
      inFlightImpressoras.delete(cacheKey);
    });

  inFlightImpressoras.set(cacheKey, promise);
  return promise;
}

async function computeImpressorasView(
  prisma: PrismaClient,
  unidadeId: string | undefined,
  search: string | undefined,
  periodo: PeriodoContagem,
  usarSeparacaoCores: boolean,
  faturamentoHabilitado: boolean,
  tarifaUnica: number
): Promise<Impressora[]> {
  const inicio = periodoToDateRange(periodo);
  const where: Prisma.ImpressoraWhereInput = {};
  if (unidadeId && unidadeId !== 'ALL') where.unidade = { id: unidadeId };

  const impressoras = await prisma.impressora.findMany({
    where,
    include: { unidade: { include: { perfilFranquia: true } } },
    orderBy: { modelo: 'asc' },
  });

  if (impressoras.length === 0) return [];

  type RawReadingRow = {
    id: string;
    impressoraId: string | null;
    serial: string;
    paginasTotal: number | bigint;
    paginasPB: number | bigint;
    paginasColor: number | bigint;
    status: string;
    dataHora: Date | string;
    rn_asc: number | bigint;
    rn_desc: number | bigint;
    row_kind: number | bigint; // 1 = baseline before period, 2 = in period, 3 = latest global status
  };

  type ReadingMapped = {
    id: string;
    paginasTotal: number;
    paginasPB: number;
    paginasColor: number;
    status: string;
    dataHora: Date;
  };

  const printerIds = impressoras.map((i) => i.id);
  const serials = impressoras.map((i) => i.serial);
  const baselineMap = new Map<string, ReadingMapped>();
  const firstInPeriodMap = new Map<string, ReadingMapped>();
  const lastInPeriodMap = new Map<string, ReadingMapped>();
  const latestGlobalMap = new Map<string, ReadingMapped>();

  const readings = await prisma.$queryRaw<RawReadingRow[]>`
    WITH LastBefore AS (
      SELECT id, "impressoraId", serial, "paginasTotal", "paginasPB", "paginasColor", status, "dataHora",
             ROW_NUMBER() OVER(PARTITION BY COALESCE("impressoraId", serial) ORDER BY "dataHora" DESC) as rn_desc,
             0 as rn_asc,
             1 as row_kind
      FROM "LeituraImpressora"
      WHERE ("impressoraId" IN (${Prisma.join(printerIds)}) OR serial IN (${Prisma.join(serials)}))
        AND "dataHora" < ${inicio}
    ),
    InPeriod AS (
      SELECT id, "impressoraId", serial, "paginasTotal", "paginasPB", "paginasColor", status, "dataHora",
             ROW_NUMBER() OVER(PARTITION BY COALESCE("impressoraId", serial) ORDER BY "dataHora" DESC) as rn_desc,
             ROW_NUMBER() OVER(PARTITION BY COALESCE("impressoraId", serial) ORDER BY "dataHora" ASC) as rn_asc,
             2 as row_kind
      FROM "LeituraImpressora"
      WHERE ("impressoraId" IN (${Prisma.join(printerIds)}) OR serial IN (${Prisma.join(serials)}))
        AND "dataHora" >= ${inicio}
    ),
    LatestGlobal AS (
      SELECT id, "impressoraId", serial, "paginasTotal", "paginasPB", "paginasColor", status, "dataHora",
             ROW_NUMBER() OVER(PARTITION BY COALESCE("impressoraId", serial) ORDER BY "dataHora" DESC) as rn_desc,
             0 as rn_asc,
             3 as row_kind
      FROM "LeituraImpressora"
      WHERE ("impressoraId" IN (${Prisma.join(printerIds)}) OR serial IN (${Prisma.join(serials)}))
    )
    SELECT id, "impressoraId", serial, "paginasTotal", "paginasPB", "paginasColor", status, "dataHora", rn_asc, rn_desc, row_kind
    FROM LastBefore WHERE rn_desc = 1
    UNION ALL
    SELECT id, "impressoraId", serial, "paginasTotal", "paginasPB", "paginasColor", status, "dataHora", rn_asc, rn_desc, row_kind
    FROM InPeriod WHERE rn_asc = 1 OR rn_desc = 1
    UNION ALL
    SELECT id, "impressoraId", serial, "paginasTotal", "paginasPB", "paginasColor", status, "dataHora", rn_asc, rn_desc, row_kind
    FROM LatestGlobal WHERE rn_desc = 1
  `;

  const serialToId = new Map(impressoras.map((i) => [i.serial, i.id]));

  for (const r of readings) {
    const key = r.impressoraId || serialToId.get(r.serial) || r.serial;
    const mapped: ReadingMapped = {
      id: r.id,
      paginasTotal: Number(r.paginasTotal),
      paginasPB: Number(r.paginasPB),
      paginasColor: Number(r.paginasColor),
      status: r.status,
      dataHora: r.dataHora instanceof Date ? r.dataHora : new Date(r.dataHora),
    };

    const kind = Number(r.row_kind);
    if (kind === 1) {
      baselineMap.set(key, mapped);
    } else if (kind === 2) {
      if (Number(r.rn_asc) === 1) firstInPeriodMap.set(key, mapped);
      if (Number(r.rn_desc) === 1) lastInPeriodMap.set(key, mapped);
    } else if (kind === 3) {
      latestGlobalMap.set(key, mapped);
    }
  }

  const result: Impressora[] = [];
  const searchTerm = search?.trim().toLowerCase() || '';

  for (const imp of impressoras) {
    const baseline = baselineMap.get(imp.id) || null;
    const firstInPeriod = firstInPeriodMap.get(imp.id) || null;
    const last = lastInPeriodMap.get(imp.id) || null;
    const latestGlobal = latestGlobalMap.get(imp.id) || last;

    const first = baseline || firstInPeriod;
    const usarTotal = !usarSeparacaoCores || imp.quebraPorTipoIndisponivel;

    let consumoPBDelta = 0;
    let consumoColorDelta = 0;
    let resetPlaca = false;

    if (last) {
      if (first && first.id !== last.id) {
        const step = computeStepDelta(
          { pb: last.paginasPB, col: last.paginasColor, total: last.paginasTotal },
          { pb: first.paginasPB, col: first.paginasColor, total: first.paginasTotal },
          usarTotal
        );
        consumoPBDelta = step.dpb;
        consumoColorDelta = step.dcol;
        resetPlaca = step.reset;
      } else {
        // Apenas 1 leitura no período e nenhuma leitura anterior ao período
        if (imp.preExistente) {
          consumoPBDelta = 0;
          consumoColorDelta = 0;
        } else if (imp.leituraReferenciaPB != null || imp.leituraReferenciaColor != null) {
          const refPB = imp.leituraReferenciaPB ?? 0;
          const refCol = imp.leituraReferenciaColor ?? 0;
          if (usarTotal) {
            consumoPBDelta = Math.max(0, last.paginasTotal - (refPB + refCol));
            consumoColorDelta = 0;
          } else {
            consumoPBDelta = Math.max(0, last.paginasPB - refPB);
            consumoColorDelta = Math.max(0, last.paginasColor - refCol);
          }
        } else {
          if (usarTotal) {
            consumoPBDelta = Math.max(0, last.paginasTotal);
            consumoColorDelta = 0;
          } else {
            consumoPBDelta = Math.max(0, last.paginasPB);
            consumoColorDelta = Math.max(0, last.paginasColor);
          }
        }
      }
    }

    // Status atual real da impressora baseado na última leitura global
    const status = normalizeStatus(latestGlobal?.status);
    const totalImpresso = consumoPBDelta + consumoColorDelta;

    let custo = 0;
    if (faturamentoHabilitado) {
      const perfil = imp.unidade.perfilFranquia;
      const tarifaPB = perfil ? Number(perfil.tarifaAvulsaPB) : 0.04;
      const tarifaColor = perfil ? Number(perfil.tarifaAvulsaColor) : 0.25;

      if (!usarSeparacaoCores) {
        custo = totalImpresso * tarifaUnica;
      } else if (imp.quebraPorTipoIndisponivel) {
        const tarifaFallback = tarifaUnica > 0 ? tarifaUnica : tarifaPB;
        custo = totalImpresso * tarifaFallback;
      } else {
        custo = consumoPBDelta * tarifaPB + consumoColorDelta * tarifaColor;
      }
    }

    const view: Impressora = {
      id: imp.id,
      serial: imp.serial,
      modelo: imp.modelo,
      ip: imp.ip,
      apelido: imp.apelido,
      unidadeId: imp.unidadeId,
      unidadeNome: imp.unidade.nome,
      status,
      consumoPBDelta,
      consumoColorDelta,
      totalImpresso,
      custoEstimado: parseFloat(custo.toFixed(2)),
      resetPlaca,
      preExistente: imp.preExistente,
      leituraReferenciaPB: imp.leituraReferenciaPB,
      leituraReferenciaColor: imp.leituraReferenciaColor,
      quebraPorTipoIndisponivel: imp.quebraPorTipoIndisponivel,
      createdAt: imp.createdAt.toISOString(),
      updatedAt: imp.updatedAt.toISOString(),
    };

    if (
      searchTerm &&
      !(
        view.serial.toLowerCase().includes(searchTerm) ||
        view.modelo.toLowerCase().includes(searchTerm) ||
        view.ip.toLowerCase().includes(searchTerm) ||
        (view.apelido && view.apelido.toLowerCase().includes(searchTerm)) ||
        (view.unidadeNome && view.unidadeNome.toLowerCase().includes(searchTerm))
      )
    ) {
      continue;
    }

    result.push(view);
  }

  return result;
}

// KPIs consolidados do dashboard
export async function getDashboardKPIs(
  prisma: PrismaClient,
  unidadeId?: string,
  periodo: PeriodoContagem = '30dias'
): Promise<DashboardKPIs> {
  const whereUnidade: Prisma.UnidadeWhereInput = {};
  if (unidadeId && unidadeId !== 'ALL') whereUnidade.id = unidadeId;

  const [impressoras, { usarSeparacaoCores }, unidadesPendentesSLA, unidadesComContrato] =
    await Promise.all([
      getImpressorasView(prisma, unidadeId, undefined, periodo),
      getConfigContagem(),
      getUnidadesPendentesSLA(prisma),
      prisma.unidade.findMany({
        where: whereUnidade,
        select: {
          id: true,
          perfilFranquia: {
            select: { temFranquiaFixa: true, cotaPB: true, cotaColor: true },
          },
        },
      }),
    ]);

  let totalPB = 0;
  let totalColor = 0;
  let totalImpresso = 0;
  let custoTotal = 0;
  let impressorasOnline = 0;
  let impressorasOffline = 0;
  let impressorasReset = 0;

  impressoras.forEach((imp) => {
    totalPB += imp.consumoPBDelta;
    totalColor += imp.consumoColorDelta;
    totalImpresso += imp.totalImpresso;
    custoTotal += imp.custoEstimado;
    if (imp.status === 'Online') impressorasOnline++;
    else impressorasOffline++;
    if (imp.resetPlaca) impressorasReset++;
  });

  const proporcaoPB =
    usarSeparacaoCores && totalPB + totalColor > 0
      ? Math.round((totalPB / (totalPB + totalColor)) * 100)
      : 0;
  const proporcaoColor =
    usarSeparacaoCores && totalPB + totalColor > 0
      ? 100 - proporcaoPB
      : 0;

  // Soma real das cotas contratuais vinculadas às unidades filtradas
  let cotaTotalPB = 0;
  let cotaTotalColor = 0;
  for (const u of unidadesComContrato) {
    if (u.perfilFranquia?.temFranquiaFixa) {
      cotaTotalPB += u.perfilFranquia.cotaPB ?? 0;
      cotaTotalColor += u.perfilFranquia.cotaColor ?? 0;
    }
  }

  // Unidade líder
  const branchTotals: Record<string, { total: number; custo: number }> = {};
  impressoras.forEach((imp) => {
    const nome = imp.unidadeNome || 'Outras';
    if (!branchTotals[nome]) branchTotals[nome] = { total: 0, custo: 0 };
    branchTotals[nome].total += imp.totalImpresso;
    branchTotals[nome].custo += imp.custoEstimado;
  });

  let leader = { nome: 'Nenhuma', total: 0, custo: 0 };
  Object.entries(branchTotals).forEach(([nome, data]) => {
    if (data.total > leader.total) leader = { nome, total: data.total, custo: data.custo };
  });

  const topImpressoras = impressoras
    .map((imp) => ({
      serial: imp.serial,
      modelo: imp.modelo,
      unidade: imp.unidadeNome || 'Outras',
      total: imp.totalImpresso,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const diasPeriodo =
    periodo === 'hoje'
      ? 1
      : periodo === '7dias'
      ? 7
      : periodo === '30dias'
      ? 30
      : periodo === 'trimestre'
      ? 90
      : 365;

  const mediaDiariaFrota = Math.round(totalImpresso / diasPeriodo);
  const projecaoMensal =
    custoTotal > 0 ? parseFloat(((custoTotal / diasPeriodo) * 30).toFixed(2)) : 0;
  const cppMedio =
    totalImpresso > 0 ? parseFloat((custoTotal / totalImpresso).toFixed(4)) : 0;
  const resmasEquivalentes = Math.round(totalImpresso / 500);

  return {
    totalImpresso,
    totalPB,
    totalColor,
    custoTotal: parseFloat(custoTotal.toFixed(2)),
    proporcaoPB,
    proporcaoColor,
    cotaTotalPB,
    cotaTotalColor,
    unidadeLider: {
      nome: leader.nome,
      total: leader.total,
      custo: parseFloat(leader.custo.toFixed(2)),
    },
    topImpressoras,
    mediaDiariaFrota,
    projecaoMensal,
    cppMedio,
    resmasEquivalentes,
    totalImpressoras: impressoras.length,
    impressorasOnline,
    impressorasOffline,
    impressorasReset,
    unidadesPendentesSLA,
  };
}

function resolveEffectiveBaseline(
  imp: {
    preExistente: boolean;
    leituraReferenciaPB: number | null;
    leituraReferenciaColor: number | null;
  },
  printerId: string,
  firstByPrinter: Map<string, CounterSnapshot>,
  baselineBeforePeriod?: CounterSnapshot | null
): CounterSnapshot | null {
  if (baselineBeforePeriod) return baselineBeforePeriod;
  if (imp.leituraReferenciaPB != null || imp.leituraReferenciaColor != null) {
    const pb = imp.leituraReferenciaPB ?? 0;
    const col = imp.leituraReferenciaColor ?? 0;
    return { pb, col, total: pb + col };
  }
  if (imp.preExistente) {
    return firstByPrinter.get(printerId) ?? null;
  }
  return null;
}

function buildEmptyTimeline(days: number): TimelineDataPoint[] {
  const result: TimelineDataPoint[] = [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    result.push({
      data: dayKey(d),
      paginasPB: 0,
      paginasColor: 0,
      total: 0,
      custo: 0,
    });
  }
  return result;
}

// Timeline de consumo por dia (com ponteiro contínuo lastSeenByPrinter contra lacunas em domingos/feriados)
export async function getTimelineData(
  prisma: PrismaClient,
  unidadeId?: string,
  periodo: PeriodoContagem = '30dias'
): Promise<TimelineDataPoint[]> {
  const { usarSeparacaoCores, faturamentoHabilitado, tarifaUnica } = await getConfigContagem();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias =
    periodo === 'hoje'
      ? 1
      : periodo === '7dias'
      ? 7
      : periodo === '30dias'
      ? 30
      : periodo === 'trimestre'
      ? 90
      : 365;
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - (dias - 1));
  inicio.setHours(0, 0, 0, 0);

  const where: Prisma.ImpressoraWhereInput = {};
  if (unidadeId && unidadeId !== 'ALL') where.unidade = { id: unidadeId };
  const impressoras = await prisma.impressora.findMany({
    where,
    select: {
      id: true,
      preExistente: true,
      leituraReferenciaPB: true,
      leituraReferenciaColor: true,
      quebraPorTipoIndisponivel: true,
      unidade: {
        select: {
          perfilFranquia: {
            select: { tarifaAvulsaPB: true, tarifaAvulsaColor: true },
          },
        },
      },
    },
  });

  if (impressoras.length === 0) return buildEmptyTimeline(dias);

  const printerIds = impressoras.map((i) => i.id);
  const impMap = new Map(impressoras.map((i) => [i.id, i]));

  const [baselineBeforePeriod, readings] = await Promise.all([
    fetchBaselineBeforePeriod(prisma, printerIds, inicio),
    prisma.leituraImpressora.findMany({
      where: {
        impressoraId: { in: printerIds },
        dataHora: { gte: inicio },
      },
      select: {
        dataHora: true,
        paginasPB: true,
        paginasColor: true,
        paginasTotal: true,
        impressoraId: true,
      },
      orderBy: { dataHora: 'asc' },
    }),
  ]);

  const lastByDay = new Map<string, Map<string, CounterSnapshot>>();
  const firstByPrinter = new Map<string, CounterSnapshot>();

  for (const r of readings) {
    if (!r.impressoraId) continue;
    const snap: CounterSnapshot = {
      pb: r.paginasPB,
      col: r.paginasColor,
      total: r.paginasTotal,
    };
    if (!firstByPrinter.has(r.impressoraId)) {
      firstByPrinter.set(r.impressoraId, snap);
    }
    const k = dayKey(r.dataHora);
    let byPrinter = lastByDay.get(k);
    if (!byPrinter) {
      byPrinter = new Map();
      lastByDay.set(k, byPrinter);
    }
    byPrinter.set(r.impressoraId, snap);
  }

  // Inicializa o último estado visto por impressora com seu baseline anterior ao período
  const lastSeenByPrinter = new Map<string, CounterSnapshot | null>();
  for (const imp of impressoras) {
    lastSeenByPrinter.set(
      imp.id,
      resolveEffectiveBaseline(imp, imp.id, firstByPrinter, baselineBeforePeriod.get(imp.id))
    );
  }

  const result: TimelineDataPoint[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const dia = new Date(hoje);
    dia.setDate(hoje.getDate() - i);
    const key = dayKey(dia);
    const byPrinter = lastByDay.get(key);

    let pb = 0;
    let col = 0;
    let custoDia = 0;

    if (byPrinter) {
      for (const [printerId, cur] of byPrinter.entries()) {
        const imp = impMap.get(printerId);
        if (!imp) continue;
        const prev = lastSeenByPrinter.get(printerId);
        const usarTotal = !usarSeparacaoCores || imp.quebraPorTipoIndisponivel;
        const { dpb, dcol } = computeStepDelta(cur, prev, usarTotal);

        lastSeenByPrinter.set(printerId, cur);
        pb += dpb;
        col += dcol;

        if (faturamentoHabilitado) {
          const pf = imp.unidade.perfilFranquia;
          const tPB = pf ? Number(pf.tarifaAvulsaPB) : 0.04;
          const tCol = pf ? Number(pf.tarifaAvulsaColor) : 0.25;
          if (!usarSeparacaoCores) {
            custoDia += (dpb + dcol) * tarifaUnica;
          } else if (imp.quebraPorTipoIndisponivel) {
            custoDia += (dpb + dcol) * (tarifaUnica > 0 ? tarifaUnica : tPB);
          } else {
            custoDia += dpb * tPB + dcol * tCol;
          }
        }
      }
    }

    result.push({
      data: key,
      paginasPB: pb,
      paginasColor: col,
      total: pb + col,
      custo: parseFloat(custoDia.toFixed(2)),
    });
  }

  return result;
}

// Ranking de unidades (bar chart)
export async function getBranchRanking(
  prisma: PrismaClient,
  unidadeId?: string,
  periodo: PeriodoContagem = '30dias'
): Promise<BranchRankingItem[]> {
  const imps = await getImpressorasView(prisma, unidadeId, undefined, periodo);
  const byUnit = new Map<string, { pb: number; col: number; custo: number }>();
  for (const imp of imps) {
    const nome = imp.unidadeNome || 'Outras';
    const cur = byUnit.get(nome) || { pb: 0, col: 0, custo: 0 };
    cur.pb += imp.consumoPBDelta;
    cur.col += imp.consumoColorDelta;
    cur.custo += imp.custoEstimado;
    byUnit.set(nome, cur);
  }

  return [...byUnit.entries()]
    .map(([unidade, d]) => ({
      unidade,
      paginasPB: d.pb,
      paginasColor: d.col,
      total: d.pb + d.col,
      custo: parseFloat(d.custo.toFixed(2)),
    }))
    .sort((a, b) => b.total - a.total);
}

// Unidades pendentes de SLA (sem leitura hoje) — otimizada em 2 queries indexadas (zero N+1)
export async function getUnidadesPendentesSLA(prisma: PrismaClient) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [todasUnidades, ultimasPorUnidade] = await Promise.all([
    prisma.unidade.findMany({
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    }),
    prisma.leituraImpressora.groupBy({
      by: ['unidadeId'],
      _max: { dataHora: true },
    }),
  ]);

  const maxPorUnidade = new Map<string, Date | null>();
  for (const row of ultimasPorUnidade) {
    maxPorUnidade.set(row.unidadeId, row._max.dataHora);
  }

  const pendentes: DashboardKPIs['unidadesPendentesSLA'] = [];
  for (const u of todasUnidades) {
    const ultimaData = maxPorUnidade.get(u.id) || null;
    if (!ultimaData || ultimaData < hoje) {
      pendentes.push({
        id: u.id,
        nome: u.nome,
        ultimaLeitura: ultimaData ? ultimaData.toISOString() : undefined,
      });
    }
  }

  return pendentes;
}

// Projeções financeiras respeitando franquias fixas, cotas e excedentes sem dupla cobrança
export async function getFinancialProjections(
  prisma: PrismaClient,
  unidadeId?: string,
  periodo: PeriodoContagem = '30dias'
): Promise<FinancialProjection[]> {
  const { usarSeparacaoCores, faturamentoHabilitado, tarifaUnica } = await getConfigContagem();
  const [impressoras, unidades] = await Promise.all([
    getImpressorasView(prisma, unidadeId, undefined, periodo),
    prisma.unidade.findMany({
      where: unidadeId && unidadeId !== 'ALL' ? { id: unidadeId } : {},
      include: { perfilFranquia: true },
    }),
  ]);

  const diasPeriodo =
    periodo === 'hoje'
      ? 1
      : periodo === '7dias'
      ? 7
      : periodo === '30dias'
      ? 30
      : periodo === 'trimestre'
      ? 90
      : 365;

  // Consumo diário por unidade para projetar cotas/excedentes por contrato
  const consumoPorUnidade = new Map<string, { pbDia: number; colDia: number; totalDia: number }>();
  let totalPBGlobal = 0;
  let totalColGlobal = 0;
  let totalImpGlobal = 0;

  for (const imp of impressoras) {
    totalPBGlobal += imp.consumoPBDelta;
    totalColGlobal += imp.consumoColorDelta;
    totalImpGlobal += imp.totalImpresso;
    const prev = consumoPorUnidade.get(imp.unidadeId) || { pbDia: 0, colDia: 0, totalDia: 0 };
    prev.pbDia += imp.consumoPBDelta / diasPeriodo;
    prev.colDia += imp.consumoColorDelta / diasPeriodo;
    prev.totalDia += imp.totalImpresso / diasPeriodo;
    consumoPorUnidade.set(imp.unidadeId, prev);
  }

  const pbDaily = totalPBGlobal / diasPeriodo;
  const colDaily = totalColGlobal / diasPeriodo;
  const totalDaily = totalImpGlobal / diasPeriodo;

  const perfis = unidades.filter((u) => u.perfilFranquia).map((u) => u.perfilFranquia!);
  const avgPrecoPapel =
    perfis.length > 0
      ? perfis.reduce((s, pf) => s + Number(pf.precoResmaPapel), 0) / perfis.length
      : 28.0;

  const periods: Array<{ name: FinancialProjection['periodo']; days: number }> = [
    { name: 'Diário', days: 1 },
    { name: 'Semanal', days: 7 },
    { name: 'Mensal', days: 30 },
    { name: 'Trimestral', days: 90 },
    { name: 'Semestral', days: 180 },
    { name: 'Anual', days: 365 },
  ];

  return periods.map((p) => {
    const pb = Math.round(pbDaily * p.days);
    const col = Math.round(colDaily * p.days);
    const totalProjetado = Math.round(totalDaily * p.days);
    const monthFactor = p.days / 30;

    let custoPB = 0;
    let custoCol = 0;
    let franquiaFixa = 0;

    if (faturamentoHabilitado) {
      for (const u of unidades) {
        const cons = consumoPorUnidade.get(u.id) || { pbDia: 0, colDia: 0, totalDia: 0 };
        const uPB = cons.pbDia * p.days;
        const uCol = cons.colDia * p.days;
        const pf = u.perfilFranquia;

        if (pf && pf.temFranquiaFixa) {
          franquiaFixa += Number(pf.valorFixoMensal ?? 0) * monthFactor;
          if (usarSeparacaoCores) {
            const cotaPBPeriodo = Number(pf.cotaPB ?? 0) * monthFactor;
            const cotaColPeriodo = Number(pf.cotaColor ?? 0) * monthFactor;
            const excPB = Math.max(0, uPB - cotaPBPeriodo);
            const excCol = Math.max(0, uCol - cotaColPeriodo);
            custoPB += excPB * Number(pf.excedentePB ?? pf.tarifaAvulsaPB ?? 0.05);
            custoCol += excCol * Number(pf.excedenteColor ?? pf.tarifaAvulsaColor ?? 0.3);
          }
        } else {
          const tPB = pf ? Number(pf.tarifaAvulsaPB) : 0.04;
          const tCol = pf ? Number(pf.tarifaAvulsaColor) : 0.25;
          if (usarSeparacaoCores) {
            custoPB += uPB * tPB;
            custoCol += uCol * tCol;
          }
        }
      }
    }

    const totalPages = usarSeparacaoCores ? pb + col : totalProjetado;
    const resmas = Math.ceil(totalPages / 500);
    const caixas = Math.ceil(resmas / 5);
    const custoPapel = resmas * avgPrecoPapel;

    const custoImpressao = faturamentoHabilitado
      ? usarSeparacaoCores
        ? custoPB + custoCol
        : totalProjetado * tarifaUnica
      : 0;

    return {
      periodo: p.name,
      dias: p.days,
      paginasEstimadasPB: usarSeparacaoCores ? pb : 0,
      paginasEstimadasColor: usarSeparacaoCores ? col : 0,
      paginasEstimadasTotal: usarSeparacaoCores ? undefined : totalProjetado,
      custoEstimadoPB: usarSeparacaoCores ? parseFloat(custoPB.toFixed(2)) : 0,
      custoEstimadoColor: usarSeparacaoCores ? parseFloat(custoCol.toFixed(2)) : 0,
      custoFranquiaFixa: faturamentoHabilitado ? parseFloat(franquiaFixa.toFixed(2)) : 0,
      custoTotalEstimado: faturamentoHabilitado
        ? parseFloat((custoImpressao + franquiaFixa).toFixed(2))
        : 0,
      resmasEstimadas: resmas,
      caixasEstimadas: caixas,
      custoPapelEstimado: parseFloat(custoPapel.toFixed(2)),
    };
  });
}

// Contagem diária resumida por impressora (sem N+1 e sem salto de lacuna)
export async function getContagemDiaria(
  prisma: PrismaClient,
  unidadeId?: string,
  periodo: PeriodoContagem = '30dias',
  impressoraId?: string
): Promise<ContagemDiariaItem[]> {
  const agrupadas = await getContagemDiariaComDias(prisma, unidadeId, periodo, impressoraId);
  return agrupadas.map((item) => {
    const diasCount = item.dias.length || 1;
    return {
      data: `${diasCount} dia${diasCount > 1 ? 's' : ''}`,
      unidadeId: item.unidadeId,
      unidadeNome: item.unidadeNome,
      impressoraId: item.impressoraId,
      serial: item.serial,
      modelo: item.modelo,
      apelido: item.apelido,
      ip: item.ip,
      paginasPBDia: item.paginasPBDia,
      paginasColorDia: item.paginasColorDia,
      totalDia: item.totalDia,
      paginasPBTotal: item.paginasPBTotal,
      paginasColorTotal: item.paginasColorTotal,
      totalPeriodo: item.totalPeriodo,
    };
  });
}

// Contagem diária com detalhamento dia-a-dia por impressora
export async function getContagemDiariaComDias(
  prisma: PrismaClient,
  unidadeId?: string,
  periodo: PeriodoContagem = '30dias',
  impressoraId?: string
): Promise<ContagemDiariaAgrupada[]> {
  const inicio = periodoToDateRange(periodo);
  const { usarSeparacaoCores } = await getConfigContagem();

  const whereImp: Prisma.ImpressoraWhereInput = {};
  if (unidadeId && unidadeId !== 'ALL') whereImp.unidade = { id: unidadeId };
  if (impressoraId && impressoraId !== 'ALL') whereImp.id = impressoraId;

  const impressoras = await prisma.impressora.findMany({
    where: whereImp,
    select: {
      id: true,
      serial: true,
      modelo: true,
      apelido: true,
      ip: true,
      unidade: { select: { id: true, nome: true } },
      preExistente: true,
      leituraReferenciaPB: true,
      leituraReferenciaColor: true,
      quebraPorTipoIndisponivel: true,
    },
  });

  if (impressoras.length === 0) return [];

  const printerIds = impressoras.map((i) => i.id);
  const impMap = new Map(impressoras.map((i) => [i.id, i]));

  const [baselineBeforePeriod, readings] = await Promise.all([
    fetchBaselineBeforePeriod(prisma, printerIds, inicio),
    prisma.leituraImpressora.findMany({
      where: {
        impressoraId: { in: printerIds },
        dataHora: { gte: inicio },
      },
      select: {
        dataHora: true,
        paginasPB: true,
        paginasColor: true,
        paginasTotal: true,
        impressoraId: true,
      },
      orderBy: { dataHora: 'asc' },
    }),
  ]);

  const lastByDay = new Map<string, Map<string, CounterSnapshot>>();
  const firstByPrinter = new Map<string, CounterSnapshot>();

  for (const r of readings) {
    if (!r.impressoraId) continue;
    const snap: CounterSnapshot = {
      pb: r.paginasPB,
      col: r.paginasColor,
      total: r.paginasTotal,
    };
    if (!firstByPrinter.has(r.impressoraId)) {
      firstByPrinter.set(r.impressoraId, snap);
    }
    const key = dayKey(r.dataHora);
    let byPrinter = lastByDay.get(key);
    if (!byPrinter) {
      byPrinter = new Map();
      lastByDay.set(key, byPrinter);
    }
    byPrinter.set(r.impressoraId, snap);
  }

  const lastSeenByPrinter = new Map<string, CounterSnapshot | null>();
  for (const imp of impressoras) {
    lastSeenByPrinter.set(
      imp.id,
      resolveEffectiveBaseline(imp, imp.id, firstByPrinter, baselineBeforePeriod.get(imp.id))
    );
  }

  const sortedDays = [...lastByDay.keys()].sort();
  const printerDays = new Map<
    string,
    { pb: number; col: number; total: number; dias: ContagemDiariaDiaItem[] }
  >();

  for (const day of sortedDays) {
    const byPrinter = lastByDay.get(day)!;

    for (const [printerId, cur] of byPrinter) {
      const imp = impMap.get(printerId);
      if (!imp) continue;

      const usarTotal = !usarSeparacaoCores || imp.quebraPorTipoIndisponivel;
      const base = lastSeenByPrinter.get(printerId);
      const { dpb, dcol } = computeStepDelta(cur, base, usarTotal);
      lastSeenByPrinter.set(printerId, cur);

      const diaItem: ContagemDiariaDiaItem = {
        data: day,
        unidadeId: imp.unidade.id,
        unidadeNome: imp.unidade.nome,
        impressoraId: imp.id,
        serial: imp.serial,
        modelo: imp.modelo,
        apelido: imp.apelido,
        ip: imp.ip,
        paginasPB: dpb,
        paginasColor: dcol,
        total: dpb + dcol,
      };

      const existing = printerDays.get(printerId);
      if (existing) {
        existing.pb += dpb;
        existing.col += dcol;
        existing.total += dpb + dcol;
        existing.dias.push(diaItem);
      } else {
        printerDays.set(printerId, {
          pb: dpb,
          col: dcol,
          total: dpb + dcol,
          dias: [diaItem],
        });
      }
    }
  }

  const result: ContagemDiariaAgrupada[] = [];

  for (const [printerId, agg] of printerDays) {
    const imp = impMap.get(printerId);
    if (!imp) continue;
    const dias = agg.dias.length || 1;
    result.push({
      unidadeId: imp.unidade.id,
      unidadeNome: imp.unidade.nome,
      impressoraId: imp.id,
      serial: imp.serial,
      modelo: imp.modelo,
      apelido: imp.apelido,
      ip: imp.ip,
      paginasPBDia: Math.round(agg.pb / dias),
      paginasColorDia: Math.round(agg.col / dias),
      totalDia: Math.round(agg.total / dias),
      paginasPBTotal: agg.pb,
      paginasColorTotal: agg.col,
      totalPeriodo: agg.total,
      quebraPorTipo: !imp.quebraPorTipoIndisponivel,
      dias: agg.dias,
    });
  }

  return result.sort((a, b) => b.totalDia - a.totalDia);
}

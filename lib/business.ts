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

// Tipos do Prisma para reaproveitar nas queries
type UnidadeWithRelations = Prisma.UnidadeGetPayload<{
  include: { aliases: true; perfilFranquia: true };
}>;

export async function toUnidadeView(u: UnidadeWithRelations): Promise<Unidade> {
  return {
    id: u.id,
    nome: u.nome,
    nomeSanitizado: u.nomeSanitizado,
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

// Utility: Sanitize Unit name (NFD, Uppercase, Underscores to spaces, trim)
export function sanitizeUnitName(rawName: string): string {
  return rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Find or create a unit by sanitized name (com aliases) - used by ingestion
export async function resolveUnit(prisma: PrismaClient, rawUnitName: string): Promise<UnidadeWithRelations> {
  const sanitized = sanitizeUnitName(rawUnitName);
  
  // Tenta nome principal (Sanitizado ou Nome real, case insensitive)
  const unit = await prisma.unidade.findFirst({
    where: {
      OR: [
        { nomeSanitizado: sanitized },
        { nome: rawUnitName.trim() },
        { nomeSanitizado: { equals: sanitized, mode: 'insensitive' } },
        { nome: { equals: rawUnitName.trim(), mode: 'insensitive' } }
      ]
    },
    include: { aliases: true, perfilFranquia: true },
  });
  if (unit) return unit;

  // Tenta alias
  const alias = await prisma.unidadeAlias.findFirst({
    where: { alias: { equals: sanitized, mode: 'insensitive' } },
    include: { unidade: { include: { aliases: true, perfilFranquia: true } } },
  });
  if (alias) return alias.unidade;

  // Cria nova unidade
  return await prisma.unidade.create({
    data: {
      nome: rawUnitName.trim(),
      nomeSanitizado: sanitized,
    },
    include: { aliases: true, perfilFranquia: true },
  });
}

// Cache em memória para getImpressorasView (TTL = 15s)
const impressorasViewCache = new Map<string, { data: Impressora[], timestamp: number }>();
const CACHE_TTL = 15000;

// Calcula impressoras com delta de leitura para o período
export async function getImpressorasView(prisma: PrismaClient, unidadeId?: string, search?: string, periodo: PeriodoContagem = '30dias') {
  const cacheKey = `${unidadeId || 'ALL'}_${search || ''}_${periodo}`;
  const cached = impressorasViewCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  const inicio = periodoToDateRange(periodo);
  const { usarSeparacaoCores, faturamentoHabilitado, tarifaUnica } = await getConfigContagem();
  const where: Prisma.ImpressoraWhereInput = {};
  if (unidadeId && unidadeId !== 'ALL') where.unidade = { id: unidadeId };
  const impressoras = await prisma.impressora.findMany({
    where,
    include: { unidade: { include: { perfilFranquia: true } } },
    orderBy: { modelo: 'asc' },
  });

  const result: Impressora[] = [];

  const serials = impressoras.map(i => i.serial);
  const firstMap = new Map<string, any>();
  const lastMap = new Map<string, any>();

  if (serials.length > 0) {
    const readings = await prisma.$queryRaw<any[]>`
      WITH LastBefore AS (
        SELECT id, serial, "unidadeId", "paginasTotal", "paginasPB", "paginasColor", status, "dataHora",
               ROW_NUMBER() OVER(PARTITION BY serial, "unidadeId" ORDER BY "dataHora" DESC) as rn,
               0 as rn_asc, 0 as rn_desc, 1 as is_baseline
        FROM "LeituraImpressora"
        WHERE serial IN (${Prisma.join(serials)}) AND "dataHora" < ${inicio}
      ),
      InPeriod AS (
        SELECT id, serial, "unidadeId", "paginasTotal", "paginasPB", "paginasColor", status, "dataHora",
               ROW_NUMBER() OVER(PARTITION BY serial, "unidadeId" ORDER BY "dataHora" DESC) as rn,
               ROW_NUMBER() OVER(PARTITION BY serial, "unidadeId" ORDER BY "dataHora" ASC) as rn_asc,
               ROW_NUMBER() OVER(PARTITION BY serial, "unidadeId" ORDER BY "dataHora" DESC) as rn_desc,
               0 as is_baseline
        FROM "LeituraImpressora"
        WHERE serial IN (${Prisma.join(serials)}) AND "dataHora" >= ${inicio}
      )
      SELECT * FROM LastBefore WHERE rn = 1
      UNION ALL
      SELECT * FROM InPeriod WHERE rn_asc = 1 OR rn_desc = 1
    `;
    
    for (const r of readings) {
      const key = `${r.serial}_${r.unidadeId}`;
      const mapped = {
        id: r.id,
        paginasTotal: Number(r.paginasTotal),
        paginasPB: Number(r.paginasPB),
        paginasColor: Number(r.paginasColor),
        status: r.status,
        dataHora: r.dataHora instanceof Date ? r.dataHora : new Date(r.dataHora)
      };
      
      if (Number(r.is_baseline) === 1) {
        firstMap.set(key, mapped);
      } else {
        // Se não tem firstMap ainda (sem baseline), usa o primeiro do periodo
        if (Number(r.rn_asc) === 1 && !firstMap.has(key)) firstMap.set(key, mapped);
        if (Number(r.rn_desc) === 1) lastMap.set(key, mapped);
      }
    }
  }

  for (const imp of impressoras) {
    const key = `${imp.serial}_${imp.unidadeId}`;
    const first = firstMap.get(key) || null;
    const last = lastMap.get(key) || null;

    // Modo Total: contadores PB/Color ignorados, usa apenas o odômetro paginasTotal
    const usarTotal = !usarSeparacaoCores || imp.quebraPorTipoIndisponivel;

    let consumoPBDelta = 0;
    let consumoColorDelta = 0;
    let resetPlaca = false;

    if (usarTotal) {
      if (first && last && first.id !== last.id) {
        // Delta do odômetro total (protege contra reset: usa a leitura inteira se cair)
        const deltaTotal = last.paginasTotal - first.paginasTotal;
        if (deltaTotal < 0) {
          resetPlaca = true;
          consumoColorDelta = last.paginasTotal;
        } else {
          consumoColorDelta = deltaTotal;
        }
      } else if (last) {
        if (imp.preExistente) {
          consumoColorDelta = 0;
        } else if (imp.leituraReferenciaPB != null || imp.leituraReferenciaColor != null) {
          const ref = (imp.leituraReferenciaPB ?? 0) + (imp.leituraReferenciaColor ?? 0);
          consumoColorDelta = Math.max(0, last.paginasTotal - ref);
        } else {
          consumoColorDelta = last.paginasTotal;
        }
      }
    } else if (first && last && first.id !== last.id) {
      if (last.paginasPB < first.paginasPB) {
        resetPlaca = true;
        consumoPBDelta = last.paginasPB;
      } else {
        consumoPBDelta = last.paginasPB - first.paginasPB;
      }
      if (last.paginasColor < first.paginasColor) {
        resetPlaca = true;
        consumoColorDelta = last.paginasColor;
      } else {
        consumoColorDelta = last.paginasColor - first.paginasColor;
      }
    } else if (last) {
      // Só uma leitura no sistema
      if (imp.preExistente) {
        // Marca zero — primeira leitura não gera consumo
        consumoPBDelta = 0;
        consumoColorDelta = 0;
      } else if (imp.leituraReferenciaPB != null || imp.leituraReferenciaColor != null) {
        // Baseline manual definido
        const refPB = imp.leituraReferenciaPB ?? last.paginasPB;
        const refCol = imp.leituraReferenciaColor ?? last.paginasColor;
        consumoPBDelta = Math.max(0, last.paginasPB - refPB);
        consumoColorDelta = Math.max(0, last.paginasColor - refCol);
      } else {
        // Impressora nova — consumo = leitura inteira
        consumoPBDelta = last.paginasPB;
        consumoColorDelta = last.paginasColor;
      }
    }

    // Status baseado na ultima leitura
    const status: 'Online' | 'Offline' | 'Erro SNMP' =
      last ? (last.status as 'Online' | 'Offline' | 'Erro SNMP') : 'Offline';

    const totalImpresso = consumoPBDelta + consumoColorDelta;
    let custo = 0;
    if (faturamentoHabilitado) {
      const perfil = imp.unidade.perfilFranquia;
      const tarifaPB = perfil ? Number(perfil.tarifaAvulsaPB) : 0.04;
      const tarifaColor = perfil ? Number(perfil.tarifaAvulsaColor) : 0.25;
      custo = usarTotal
        ? totalImpresso * tarifaUnica
        : consumoPBDelta * tarifaPB + consumoColorDelta * tarifaColor;
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
      quebraPorTipoIndisponivel: imp.quebraPorTipoIndisponivel,
      createdAt: imp.createdAt.toISOString(),
      updatedAt: imp.updatedAt.toISOString(),
    };

    // filtro search
    if (
      search &&
      search.trim() !== '' &&
      !(
        view.serial.toLowerCase().includes(search.toLowerCase()) ||
        view.modelo.toLowerCase().includes(search.toLowerCase()) ||
        view.ip.toLowerCase().includes(search.toLowerCase()) ||
        (view.apelido && view.apelido.toLowerCase().includes(search.toLowerCase())) ||
        (view.unidadeNome && view.unidadeNome.toLowerCase().includes(search.toLowerCase()))
      )
    ) {
      continue;
    }
    result.push(view);
  }
  
  impressorasViewCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

// KPIs do dashboard
export async function getDashboardKPIs(prisma: PrismaClient, unidadeId?: string, periodo: PeriodoContagem = '30dias'): Promise<DashboardKPIs> {
  const impressoras = await getImpressorasView(prisma, unidadeId, undefined, periodo);
  const { usarSeparacaoCores } = await getConfigContagem();

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

  const proporcaoPB = usarSeparacaoCores && totalPB + totalColor > 0 ? Math.round((totalPB / (totalPB + totalColor)) * 100) : 0;
  const proporcaoColor = usarSeparacaoCores && totalPB + totalColor > 0 ? Math.round((totalColor / (totalPB + totalColor)) * 100) : 0;

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

  // Verifica unidades pendentes de SLA (sem leitura hoje)
  const unidadesPendentesSLA = await getUnidadesPendentesSLA(prisma);

  // Top 3 Impressoras
  const topImpressoras = impressoras
    .map((imp) => ({
      serial: imp.serial,
      modelo: imp.modelo,
      unidade: imp.unidadeNome || 'Outras',
      total: imp.totalImpresso,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const diasPeriodo = periodo === 'hoje' ? 1 : periodo === '7dias' ? 7 : periodo === '30dias' ? 30 : periodo === 'trimestre' ? 90 : 365;

  // Média Diária da Frota
  const mediaDiariaFrota = Math.round(totalImpresso / diasPeriodo);

  // Projeção Mensal de Custos
  const projecaoMensal = custoTotal > 0 ? parseFloat(((custoTotal / diasPeriodo) * 30).toFixed(2)) : 0; 
  
  // Custo por Página
  const cppMedio = totalImpresso > 0 ? parseFloat((custoTotal / totalImpresso).toFixed(4)) : 0;

  // Resmas Equivalentes
  const resmasEquivalentes = Math.round(totalImpresso / 500);

  return {
    totalImpresso,
    totalPB,
    totalColor,
    custoTotal: parseFloat(custoTotal.toFixed(2)),
    proporcaoPB,
    proporcaoColor,
    unidadeLider: { nome: leader.nome, total: leader.total, custo: parseFloat(leader.custo.toFixed(2)) },
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

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Resolve o baseline efetivo para uma impressora.
 * Prioridade:
 * 1. Leitura anterior ao período (quando disponível)
 * 2. leituraReferenciaPB/Color (definido manualmente)
 * 3. firstByPrinter (primeira leitura no período) — quando preExistente=true
 * 4. null — quando !preExistente e sem referência → delta dia1 = leitura inteira
 */
function resolveEffectiveBaseline(
  imp: { preExistente: boolean; leituraReferenciaPB: number | null; leituraReferenciaColor: number | null },
  printerId: string,
  firstByPrinter: Map<string, { pb: number; col: number; total: number }>,
  baselineBeforePeriod?: { pb: number; col: number; total: number } | null,
): { pb: number; col: number; total: number } | null {
  if (baselineBeforePeriod) return baselineBeforePeriod;
  if (imp.leituraReferenciaPB != null || imp.leituraReferenciaColor != null) {
    return { pb: imp.leituraReferenciaPB ?? 0, col: imp.leituraReferenciaColor ?? 0, total: (imp.leituraReferenciaPB ?? 0) + (imp.leituraReferenciaColor ?? 0) };
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

// Timeline de consumo por dia (últimos 30 dias) - usa DELTAS entre leituras,
// pois paginasPB/paginasColor são contadores acumulados (odômetro), não consumo diário.
export async function getTimelineData(prisma: PrismaClient, unidadeId?: string, periodo: PeriodoContagem = '30dias'): Promise<TimelineDataPoint[]> {
  const { usarSeparacaoCores, faturamentoHabilitado, tarifaUnica } = await getConfigContagem();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = periodo === 'hoje' ? 1 : periodo === '7dias' ? 7 : periodo === '30dias' ? 30 : periodo === 'trimestre' ? 90 : 365;
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - (dias - 1));
  const inicioBaseline = new Date(inicio);
  inicioBaseline.setDate(inicioBaseline.getDate() - 1);

  const where: Prisma.ImpressoraWhereInput = {};
  if (unidadeId && unidadeId !== 'ALL') where.unidade = { id: unidadeId };
  const impressoras = await prisma.impressora.findMany({
    where,
    select: { id: true, preExistente: true, leituraReferenciaPB: true, leituraReferenciaColor: true, quebraPorTipoIndisponivel: true },
  });
  if (impressoras.length === 0) return buildEmptyTimeline(dias);
  const impMap = new Map(impressoras.map((i) => [i.id, i]));

  const readings = await prisma.leituraImpressora.findMany({
    where: {
      impressoraId: { in: impressoras.map((i) => i.id) },
      dataHora: { gte: inicioBaseline },
    },
    select: { dataHora: true, paginasPB: true, paginasColor: true, paginasTotal: true, impressoraId: true },
  });

  // Última leitura de cada dia, por impressora
  const lastByDay = new Map<string, Map<string, { dt: Date; pb: number; col: number; total: number }>>();
  for (const r of readings) {
    if (!r.impressoraId) continue;
    const key = dayKey(r.dataHora);
    let m = lastByDay.get(r.impressoraId);
    if (!m) {
      m = new Map();
      lastByDay.set(r.impressoraId, m);
    }
    const cur = m.get(key);
    if (!cur || r.dataHora > cur.dt) {
      m.set(key, { dt: r.dataHora, pb: r.paginasPB, col: r.paginasColor, total: r.paginasTotal });
    }
  }

  // Primeira leitura de cada impressora (baseline geral)
  const firstByPrinter = new Map<string, { pb: number; col: number; total: number }>();
  for (const r of readings) {
    if (!r.impressoraId) continue;
    if (!firstByPrinter.has(r.impressoraId)) {
      firstByPrinter.set(r.impressoraId, { pb: r.paginasPB, col: r.paginasColor, total: r.paginasTotal });
    }
  }

  const result: TimelineDataPoint[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const dia = new Date(hoje);
    dia.setDate(hoje.getDate() - i);
    const key = dayKey(dia);
    const diaAnt = new Date(dia);
    diaAnt.setDate(dia.getDate() - 1);
    const prevKey = dayKey(diaAnt);

    let pb = 0;
    let col = 0;
    for (const [printerId, m] of lastByDay.entries()) {
      const cur = m.get(key);
      if (!cur) continue;
      const imp = impMap.get(printerId);
      if (!imp) continue;
      const prev = m.get(prevKey);
      // Modo Total: usa apenas o odômetro paginasTotal (PB/Color zerados)
      const usarTotal = !usarSeparacaoCores || imp.quebraPorTipoIndisponivel;
      let dpb: number;
      let dcol: number;
      if (prev) {
        if (usarTotal) {
          dpb = 0;
          dcol = cur.total < prev.total ? cur.total : cur.total - prev.total;
        } else {
          dpb = cur.pb < prev.pb ? cur.pb : cur.pb - prev.pb;
          dcol = cur.col < prev.col ? cur.col : cur.col - prev.col;
        }
      } else {
        const baseline = resolveEffectiveBaseline(imp, printerId, firstByPrinter);
        if (!baseline) {
          dpb = usarTotal ? 0 : cur.pb;
          dcol = usarTotal ? cur.total : cur.col;
        } else {
          if (usarTotal) {
            dpb = 0;
            dcol = cur.total < baseline.total ? cur.total : cur.total - baseline.total;
          } else {
            dpb = cur.pb < baseline.pb ? cur.pb : cur.pb - baseline.pb;
            dcol = cur.col < baseline.col ? cur.col : cur.col - baseline.col;
          }
        }
      }
      pb += dpb;
      col += dcol;
    }

    const totalDia = pb + col;
    let custoDia = 0;
    if (faturamentoHabilitado) {
      // Usa tarifaUnica para modo total; para modo separação sem perfil individual, usa defaults
      custoDia = usarSeparacaoCores
        ? pb * 0.04 + col * 0.25
        : totalDia * tarifaUnica;
    }
    result.push({
      data: key,
      paginasPB: pb,
      paginasColor: col,
      total: totalDia,
      custo: parseFloat(custoDia.toFixed(2)),
    });
  }
  return result;
}

// Ranking de unidades (bar chart) - agrega os DELTAS das impressoras por unidade
export async function getBranchRanking(prisma: PrismaClient, unidadeId?: string, periodo: PeriodoContagem = '30dias'): Promise<BranchRankingItem[]> {
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

// Unidades pendentes de SLA (sem leitura hoje) - reutilizada no dashboard e nos e-mails de alerta
export async function getUnidadesPendentesSLA(prisma: PrismaClient) {
  const todasUnidades = await prisma.unidade.findMany({
    include: { aliases: true, perfilFranquia: true },
  });
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const pendentes: DashboardKPIs['unidadesPendentesSLA'] = [];
  for (const u of todasUnidades) {
    const ultima = await prisma.leituraImpressora.findFirst({
      where: { unidadeId: u.id, dataHora: { gte: hoje } },
      orderBy: { dataHora: 'desc' },
    });
    if (!ultima) {
      const last = await prisma.leituraImpressora.findFirst({
        where: { unidadeId: u.id },
        orderBy: { dataHora: 'desc' },
      });
      pendentes.push({
        id: u.id,
        nome: u.nome,
        ultimaLeitura: last ? last.dataHora.toISOString() : undefined,
      });
    }
  }
  return pendentes;
}

// Projeções financeiras
export async function getFinancialProjections(
  prisma: PrismaClient,
  unidadeId?: string,
  periodo: PeriodoContagem = '30dias'
): Promise<FinancialProjection[]> {
  const { usarSeparacaoCores, faturamentoHabilitado, tarifaUnica } = await getConfigContagem();
  const kpis = await getDashboardKPIs(prisma, unidadeId, periodo);
  const diasPeriodo = periodo === 'hoje' ? 1 : periodo === '7dias' ? 7 : periodo === '30dias' ? 30 : periodo === 'trimestre' ? 90 : 365;
  const totalDaily = kpis.totalImpresso / diasPeriodo;
  const pbDaily = kpis.totalPB / diasPeriodo;
  const colDaily = kpis.totalColor / diasPeriodo;

  // Busca tarifas reais dos perfis de franquia das unidades ativas
  const whereUnidade: Prisma.UnidadeWhereInput = {};
  if (unidadeId && unidadeId !== 'ALL') whereUnidade.id = unidadeId;
  const unidades = await prisma.unidade.findMany({
    where: whereUnidade,
    include: { perfilFranquia: true },
  });
  // Calcula médias ponderadas das tarifas (fallback para defaults)
  const perfis = unidades.filter((u) => u.perfilFranquia).map((u) => u.perfilFranquia!);
  const avgTarifaPB = perfis.length > 0
    ? perfis.reduce((s, pf) => s + Number(pf.tarifaAvulsaPB), 0) / perfis.length
    : 0.04;
  const avgTarifaColor = perfis.length > 0
    ? perfis.reduce((s, pf) => s + Number(pf.tarifaAvulsaColor), 0) / perfis.length
    : 0.25;
  const avgFranquiaFixa = perfis.length > 0
    ? perfis.filter((pf) => pf.temFranquiaFixa && pf.valorFixoMensal != null)
        .reduce((s, pf) => s + Number(pf.valorFixoMensal!), 0)
    : 0;
  const avgPrecoPapel = perfis.length > 0
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
    const custoPB = pb * avgTarifaPB;
    const custoCol = col * avgTarifaColor;
    const franquiaFixa = (p.days / 30) * avgFranquiaFixa;
    const totalPages = usarSeparacaoCores ? pb + col : totalProjetado;
    const resmas = Math.ceil(totalPages / 500);
    const caixas = Math.ceil(resmas / 5);
    const custoPapel = resmas * avgPrecoPapel;

    const custoImpressao = faturamentoHabilitado
      ? (usarSeparacaoCores ? custoPB + custoCol : totalProjetado * tarifaUnica)
      : 0;

    return {
      periodo: p.name,
      dias: p.days,
      paginasEstimadasPB: usarSeparacaoCores ? pb : 0,
      paginasEstimadasColor: usarSeparacaoCores ? col : 0,
      paginasEstimadasTotal: usarSeparacaoCores ? undefined : totalProjetado,
      custoEstimadoPB: usarSeparacaoCores ? parseFloat(custoPB.toFixed(2)) : 0,
      custoEstimadoColor: usarSeparacaoCores ? parseFloat(custoCol.toFixed(2)) : 0,
      custoFranquiaFixa: parseFloat(franquiaFixa.toFixed(2)),
      custoTotalEstimado: parseFloat((custoImpressao + franquiaFixa).toFixed(2)),
      resmasEstimadas: resmas,
      caixasEstimadas: caixas,
      custoPapelEstimado: parseFloat(custoPapel.toFixed(2)),
    };
  });
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

export async function getContagemDiaria(
  prisma: PrismaClient,
  unidadeId?: string,
  periodo: PeriodoContagem = '30dias',
  impressoraId?: string
): Promise<ContagemDiariaItem[]> {
  const inicio = periodoToDateRange(periodo);
  const { usarSeparacaoCores } = await getConfigContagem();

  const whereImp: Prisma.ImpressoraWhereInput = {};
  if (unidadeId && unidadeId !== 'ALL') whereImp.unidade = { id: unidadeId };
  if (impressoraId && impressoraId !== 'ALL') whereImp.id = impressoraId;

  const impressoras = await prisma.impressora.findMany({
    where: whereImp,
    select: { id: true, serial: true, modelo: true, apelido: true, ip: true, unidade: { select: { id: true, nome: true } }, preExistente: true, leituraReferenciaPB: true, leituraReferenciaColor: true, quebraPorTipoIndisponivel: true },
  });

  if (impressoras.length === 0) return [];

  const readings = await prisma.leituraImpressora.findMany({
    where: {
      impressoraId: { in: impressoras.map((i) => i.id) },
      dataHora: { gte: inicio },
    },
    select: { dataHora: true, paginasPB: true, paginasColor: true, paginasTotal: true, impressoraId: true },
    orderBy: { dataHora: 'asc' },
  });

  // Busca a ultima leitura ANTES do periodo para cada impressora (baseline anterior)
  const baselineBeforePeriod = new Map<string, { pb: number; col: number; total: number }>();
  for (const imp of impressoras) {
    const lastBefore = await prisma.leituraImpressora.findFirst({
      where: { impressoraId: imp.id, dataHora: { lt: inicio } },
      orderBy: { dataHora: 'desc' },
      select: { paginasPB: true, paginasColor: true, paginasTotal: true },
    });
    if (lastBefore) {
      baselineBeforePeriod.set(imp.id, { pb: lastBefore.paginasPB, col: lastBefore.paginasColor, total: lastBefore.paginasTotal });
    }
  }

  const impMap = new Map(impressoras.map((i) => [i.id, i]));

  // Última leitura de cada dia por impressora (mesmo approach do getTimelineData)
  const lastByDay = new Map<string, Map<string, { pb: number; col: number; total: number }>>();
  for (const r of readings) {
    if (!r.impressoraId) continue;
    const key = dayKey(r.dataHora);
    let byPrinter = lastByDay.get(key);
    if (!byPrinter) {
      byPrinter = new Map();
      lastByDay.set(key, byPrinter);
    }
    // Sobrescreve com a leitura mais recente do dia
    byPrinter.set(r.impressoraId, { pb: r.paginasPB, col: r.paginasColor, total: r.paginasTotal });
  }

  // Primeira leitura de cada impressora no período (baseline dentro do periodo)
  const firstByPrinter = new Map<string, { pb: number; col: number; total: number }>();
  for (const r of readings) {
    if (!r.impressoraId) continue;
    if (!firstByPrinter.has(r.impressoraId)) {
      firstByPrinter.set(r.impressoraId, { pb: r.paginasPB, col: r.paginasColor, total: r.paginasTotal });
    }
  }

  // Combina baseline: usa a leitura anterior ao periodo se disponivel, senao usa a primeira do periodo
  const effectiveBaseline = new Map<string, { pb: number; col: number; total: number }>();
  for (const imp of impressoras) {
    const before = baselineBeforePeriod.get(imp.id);
    if (before) {
      effectiveBaseline.set(imp.id, { pb: before.pb, col: before.col, total: before.total });
    } else if (imp.leituraReferenciaPB != null || imp.leituraReferenciaColor != null) {
      effectiveBaseline.set(imp.id, {
        pb: imp.leituraReferenciaPB ?? 0,
        col: imp.leituraReferenciaColor ?? 0,
        total: (imp.leituraReferenciaPB ?? 0) + (imp.leituraReferenciaColor ?? 0),
      });
    } else if (imp.preExistente) {
      const first = firstByPrinter.get(imp.id);
      if (first) effectiveBaseline.set(imp.id, first);
    }
    // se !preExistente e sem referência → não entra no effectiveBaseline (baseline = 0)
  }

  // Ordena dias do período
  const sortedDays = [...lastByDay.keys()].sort();

  // Calcula consumo entre-dias por impressora
  const printerAgg = new Map<string, { pb: number; col: number; dias: number; imp: (typeof impressoras)[0] }>();

  for (let dayIdx = 0; dayIdx < sortedDays.length; dayIdx++) {
    const day = sortedDays[dayIdx];
    const byPrinter = lastByDay.get(day)!;
    const prevDay = dayIdx > 0 ? sortedDays[dayIdx - 1] : null;

    for (const [printerId, cur] of byPrinter) {
      const imp = impMap.get(printerId);
      if (!imp) continue;

      let dpb: number;
      let dcol: number;
      // Modo Total: usa apenas o odômetro paginasTotal (PB/Color zerados)
      const usarTotal = !usarSeparacaoCores || imp.quebraPorTipoIndisponivel;

      // Base de comparação: leitura do dia anterior (ou baseline do período)
      const base = prevDay
        ? (lastByDay.get(prevDay)?.get(printerId) ?? effectiveBaseline.get(printerId))
        : effectiveBaseline.get(printerId);

      if (base) {
        if (usarTotal) {
          dpb = 0;
          dcol = cur.total < base.total ? cur.total : cur.total - base.total;
        } else {
          dpb = cur.pb < base.pb ? cur.pb : cur.pb - base.pb;
          dcol = cur.col < base.col ? cur.col : cur.col - base.col;
        }
      } else {
        dpb = usarTotal ? 0 : cur.pb;
        dcol = usarTotal ? cur.total : cur.col;
      }

      const existing = printerAgg.get(printerId);
      if (existing) {
        existing.pb += dpb;
        existing.col += dcol;
        existing.dias += 1;
      } else {
        printerAgg.set(printerId, { pb: dpb, col: dcol, dias: 1, imp });
      }
    }
  }

  const result: ContagemDiariaItem[] = [];

  for (const [, agg] of printerAgg) {
    const dias = agg.dias || 1;
    result.push({
      data: `${dias} dia${dias > 1 ? 's' : ''}`,
      unidadeId: agg.imp.unidade.id,
      unidadeNome: agg.imp.unidade.nome,
      impressoraId: agg.imp.id,
      serial: agg.imp.serial,
      modelo: agg.imp.modelo,
      apelido: agg.imp.apelido,
      ip: agg.imp.ip,
      paginasPBDia: Math.round(agg.pb / dias),
      paginasColorDia: Math.round(agg.col / dias),
      totalDia: Math.round((agg.pb + agg.col) / dias),
      paginasPBTotal: agg.pb,
      paginasColorTotal: agg.col,
      totalPeriodo: agg.pb + agg.col,
    });
  }

  return result.sort((a, b) => b.totalDia - a.totalDia);
}

// Contagem diária com detalhamento dia-a-dia por impressora (para visualização expandida)
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
    select: { id: true, serial: true, modelo: true, apelido: true, ip: true, unidade: { select: { id: true, nome: true } }, preExistente: true, leituraReferenciaPB: true, leituraReferenciaColor: true, quebraPorTipoIndisponivel: true },
  });

  if (impressoras.length === 0) return [];

  const readings = await prisma.leituraImpressora.findMany({
    where: {
      impressoraId: { in: impressoras.map((i) => i.id) },
      dataHora: { gte: inicio },
    },
    select: { dataHora: true, paginasPB: true, paginasColor: true, paginasTotal: true, impressoraId: true },
    orderBy: { dataHora: 'asc' },
  });

  // Busca a ultima leitura ANTES do periodo para cada impressora (baseline anterior)
  const baselineBeforePeriod = new Map<string, { pb: number; col: number; total: number }>();
  for (const imp of impressoras) {
    const lastBefore = await prisma.leituraImpressora.findFirst({
      where: { impressoraId: imp.id, dataHora: { lt: inicio } },
      orderBy: { dataHora: 'desc' },
      select: { paginasPB: true, paginasColor: true, paginasTotal: true },
    });
    if (lastBefore) {
      baselineBeforePeriod.set(imp.id, { pb: lastBefore.paginasPB, col: lastBefore.paginasColor, total: lastBefore.paginasTotal });
    }
  }

  const impMap = new Map(impressoras.map((i) => [i.id, i]));

  // Última leitura de cada dia por impressora
  const lastByDay = new Map<string, Map<string, { pb: number; col: number; total: number }>>();
  for (const r of readings) {
    if (!r.impressoraId) continue;
    const key = dayKey(r.dataHora);
    let byPrinter = lastByDay.get(key);
    if (!byPrinter) {
      byPrinter = new Map();
      lastByDay.set(key, byPrinter);
    }
    byPrinter.set(r.impressoraId, { pb: r.paginasPB, col: r.paginasColor, total: r.paginasTotal });
  }

  // Primeira leitura de cada impressora no período (baseline dentro do periodo)
  const firstByPrinter = new Map<string, { pb: number; col: number; total: number }>();
  for (const r of readings) {
    if (!r.impressoraId) continue;
    if (!firstByPrinter.has(r.impressoraId)) {
      firstByPrinter.set(r.impressoraId, { pb: r.paginasPB, col: r.paginasColor, total: r.paginasTotal });
    }
  }

  // Combina baseline: usa a leitura anterior ao periodo se disponivel, senao usa a primeira do periodo
  const effectiveBaseline = new Map<string, { pb: number; col: number; total: number }>();
  for (const imp of impressoras) {
    const before = baselineBeforePeriod.get(imp.id);
    if (before) {
      effectiveBaseline.set(imp.id, { pb: before.pb, col: before.col, total: before.total });
    } else if (imp.leituraReferenciaPB != null || imp.leituraReferenciaColor != null) {
      effectiveBaseline.set(imp.id, {
        pb: imp.leituraReferenciaPB ?? 0,
        col: imp.leituraReferenciaColor ?? 0,
        total: (imp.leituraReferenciaPB ?? 0) + (imp.leituraReferenciaColor ?? 0),
      });
    } else if (imp.preExistente) {
      const first = firstByPrinter.get(imp.id);
      if (first) effectiveBaseline.set(imp.id, first);
    }
    // se !preExistente e sem referência → não entra no effectiveBaseline (baseline = 0)
  }

  const sortedDays = [...lastByDay.keys()].sort();

  // Para cada impressora, calcula o delta de cada dia
  const printerDays = new Map<string, { pb: number; col: number; total: number; dias: ContagemDiariaDiaItem[] }>();

  for (let dayIdx = 0; dayIdx < sortedDays.length; dayIdx++) {
    const day = sortedDays[dayIdx];
    const byPrinter = lastByDay.get(day)!;
    const prevDay = dayIdx > 0 ? sortedDays[dayIdx - 1] : null;

    for (const [printerId, cur] of byPrinter) {
      const imp = impMap.get(printerId);
      if (!imp) continue;

      let dpb: number;
      let dcol: number;
      // Modo Total: usa apenas o odômetro paginasTotal (PB/Color zerados)
      const usarTotal = !usarSeparacaoCores || imp.quebraPorTipoIndisponivel;

      // Base de comparação: leitura do dia anterior (ou baseline do período)
      const base = prevDay
        ? (lastByDay.get(prevDay)?.get(printerId) ?? effectiveBaseline.get(printerId))
        : effectiveBaseline.get(printerId);

      if (base) {
        if (usarTotal) {
          dpb = 0;
          dcol = cur.total < base.total ? cur.total : cur.total - base.total;
        } else {
          dpb = cur.pb < base.pb ? cur.pb : cur.pb - base.pb;
          dcol = cur.col < base.col ? cur.col : cur.col - base.col;
        }
      } else {
        dpb = usarTotal ? 0 : cur.pb;
        dcol = usarTotal ? cur.total : cur.col;
      }

      const existing = printerDays.get(printerId);
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
       quebraPorTipo: imp.quebraPorTipoIndisponivel,
       dias: agg.dias,
     });
  }

  return result.sort((a, b) => b.totalDia - a.totalDia);
}

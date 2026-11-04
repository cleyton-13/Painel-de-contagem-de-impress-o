import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { dayKey } from '@/lib/business';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatBR(val: number): string {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Previne CSV Formula Injection no Excel e escapa delimitadores/aspas
function escapeCsvCell(raw: string): string {
  let str = String(raw ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(';') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseDates(periodo: string, dataInicio?: string | null, dataFim?: string | null) {
  const agora = new Date();
  let inicio = new Date(agora);
  let fim = new Date(agora);

  switch (periodo) {
    case 'hoje':
      inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);
      fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999);
      break;
    case '7dias':
      inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 6, 0, 0, 0);
      break;
    case '15dias':
      inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 14, 0, 0, 0);
      break;
    case '30dias':
      inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 29, 0, 0, 0);
      break;
    case 'trimestre':
      inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 89, 0, 0, 0);
      break;
    case 'ano':
      inicio = new Date(agora.getFullYear() - 1, agora.getMonth(), agora.getDate() + 1, 0, 0, 0);
      break;
    case 'mes_atual':
      inicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0);
      fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    case 'mes_anterior':
      inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1, 0, 0, 0);
      fim = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59, 999);
      break;
    case 'custom':
      if (dataInicio) {
        const parts = dataInicio.split('-');
        if (parts.length === 3) {
          inicio = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0);
        }
      }
      if (dataFim) {
        const parts = dataFim.split('-');
        if (parts.length === 3) {
          fim = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59, 999);
        }
      }
      if (inicio > fim) {
        const tmp = inicio;
        inicio = fim;
        fim = tmp;
      }
      break;
    default:
      inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 29, 0, 0, 0);
      break;
  }

  return { inicio, fim };
}

type BaselineRow = {
  impressoraId: string;
  paginasPB: number | bigint;
  paginasColor: number | bigint;
  paginasTotal: number | bigint;
};

export async function GET(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Não autorizado. Faça login.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get('tipo') || 'sla_conformidade';
  const periodo = searchParams.get('periodo') || '30dias';
  const dataInicioStr = searchParams.get('dataInicio');
  const dataFimStr = searchParams.get('dataFim');
  const unidadeId = searchParams.get('unidadeId');

  const { inicio, fim } = parseDates(periodo, dataInicioStr, dataFimStr);
  const whereUnidade = unidadeId && unidadeId !== 'ALL' ? { id: unidadeId } : {};

  const whereLeituras: Prisma.LeituraImpressoraWhereInput = {
    dataHora: { gte: inicio, lte: fim },
  };
  if (unidadeId && unidadeId !== 'ALL') {
    whereLeituras.unidadeId = unidadeId;
  }

  const [unidades, leituras, slaConfig] = await Promise.all([
    prisma.unidade.findMany({
      where: whereUnidade,
      include: {
        perfilFranquia: true,
        impressoras: true,
      },
      orderBy: { nome: 'asc' },
    }),
    prisma.leituraImpressora.findMany({
      where: whereLeituras,
      include: {
        impressora: true,
        unidade: true,
      },
      orderBy: { dataHora: 'asc' },
    }),
    prisma.configuracaoSLA.findUnique({ where: { id: 'default_config' } }),
  ]);

  // Busca baselines anteriores a `inicio` para nunca cobrar odômetro vitalício em leituras únicas
  const allPrinterIds = unidades.flatMap((u) => u.impressoras.map((i) => i.id));
  const baselineByPrinter = new Map<string, { pb: number; col: number; total: number }>();
  if (allPrinterIds.length > 0) {
    const baseRows = await prisma.$queryRaw<BaselineRow[]>`
      SELECT DISTINCT ON ("impressoraId")
        "impressoraId",
        "paginasPB",
        "paginasColor",
        "paginasTotal"
      FROM "LeituraImpressora"
      WHERE "impressoraId" IN (${Prisma.join(allPrinterIds)})
        AND "dataHora" < ${inicio}
      ORDER BY "impressoraId", "dataHora" DESC
    `;
    for (const r of baseRows) {
      if (r.impressoraId) {
        baselineByPrinter.set(r.impressoraId, {
          pb: Number(r.paginasPB),
          col: Number(r.paginasColor),
          total: Number(r.paginasTotal),
        });
      }
    }
  }

  // Pré-indexa leituras por unidadeId e por impressoraId/serial em O(L)
  const leiturasPorUnidade = new Map<string, typeof leituras>();
  const leiturasPorImpressora = new Map<string, typeof leituras>();
  for (const l of leituras) {
    const uArr = leiturasPorUnidade.get(l.unidadeId);
    if (uArr) uArr.push(l);
    else leiturasPorUnidade.set(l.unidadeId, [l]);

    const pKey = l.impressoraId || l.serial;
    const pArr = leiturasPorImpressora.get(pKey);
    if (pArr) pArr.push(l);
    else leiturasPorImpressora.set(pKey, [l]);
  }

  const calcDeltaPrinter = (imp: (typeof unidades)[number]['impressoras'][number]) => {
    const impLeituras =
      leiturasPorImpressora.get(imp.id) || leiturasPorImpressora.get(imp.serial) || [];
    if (impLeituras.length === 0) return { pb: 0, col: 0, total: 0, impLeituras };

    const ult = impLeituras[impLeituras.length - 1];
    const baseBefore = baselineByPrinter.get(imp.id);

    if (baseBefore) {
      const pb = ult.paginasPB < baseBefore.pb ? ult.paginasPB : ult.paginasPB - baseBefore.pb;
      const col = ult.paginasColor < baseBefore.col ? ult.paginasColor : ult.paginasColor - baseBefore.col;
      const total = ult.paginasTotal < baseBefore.total ? ult.paginasTotal : ult.paginasTotal - baseBefore.total;
      return { pb: Math.max(0, pb), col: Math.max(0, col), total: Math.max(0, total), impLeituras };
    }

    if (impLeituras.length >= 2) {
      const prim = impLeituras[0];
      const pb = ult.paginasPB < prim.paginasPB ? ult.paginasPB : ult.paginasPB - prim.paginasPB;
      const col = ult.paginasColor < prim.paginasColor ? ult.paginasColor : ult.paginasColor - prim.paginasColor;
      const total = ult.paginasTotal < prim.paginasTotal ? ult.paginasTotal : ult.paginasTotal - prim.paginasTotal;
      return { pb: Math.max(0, pb), col: Math.max(0, col), total: Math.max(0, total), impLeituras };
    }

    // Apenas 1 leitura no período e nenhum histórico prévio
    if (imp.preExistente) {
      return { pb: 0, col: 0, total: 0, impLeituras };
    }
    if (imp.leituraReferenciaPB != null || imp.leituraReferenciaColor != null) {
      const refPB = imp.leituraReferenciaPB ?? 0;
      const refCol = imp.leituraReferenciaColor ?? 0;
      const pb = Math.max(0, ult.paginasPB - refPB);
      const col = Math.max(0, ult.paginasColor - refCol);
      const total = Math.max(0, ult.paginasTotal - (refPB + refCol));
      return { pb, col, total, impLeituras };
    }

    return {
      pb: Math.max(0, ult.paginasPB),
      col: Math.max(0, ult.paginasColor),
      total: Math.max(0, ult.paginasTotal),
      impLeituras,
    };
  };

  let filename = `relatorio_${tipo}_${periodo}.csv`;
  let headers: string[] = [];
  const rows: string[][] = [];

  const [slaHoraStr, slaMinStr] = (slaConfig?.horarioLimite || '17:00').split(':');
  const slaHoraLim = Number(slaHoraStr) || 17;
  const slaMinLim = Number(slaMinStr) || 0;

  switch (tipo) {
    case 'sla_conformidade': {
      filename = `auditoria_sla_pontualidade_${periodo}.csv`;
      headers = [
        'Unidade',
        'Total Dias Período',
        `Dias com Leitura (Até ${slaConfig?.horarioLimite || '17:00'})`,
        `Dias com Leitura (Após ${slaConfig?.horarioLimite || '17:00'})`,
        'Dias Sem Leitura (Pendente)',
        'Índice Conformidade SLA (%)',
        'Total Leituras Realizadas',
        'Status Atual',
      ];

      const diffDays = Math.max(
        1,
        Math.floor((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1
      );

      for (const u of unidades) {
        const uLeituras = leiturasPorUnidade.get(u.id) || [];
        const diasComLeituraNoPrazo = new Set<string>();
        const diasComLeituraAtrasada = new Set<string>();
        const todosDias = new Set<string>();

        for (const l of uLeituras) {
          // Usa fuso horário local consistente tanto para o dia quanto para hora/minuto
          const diaStr = dayKey(l.dataHora);
          todosDias.add(diaStr);
          const hora = l.dataHora.getHours();
          const minuto = l.dataHora.getMinutes();
          if (hora < slaHoraLim || (hora === slaHoraLim && minuto <= slaMinLim)) {
            diasComLeituraNoPrazo.add(diaStr);
          } else {
            diasComLeituraAtrasada.add(diaStr);
          }
        }

        const diasPrazoCount = diasComLeituraNoPrazo.size;
        const diasAtrasoCount = Array.from(diasComLeituraAtrasada).filter(
          (d) => !diasComLeituraNoPrazo.has(d)
        ).length;
        const diasSemLeitura = Math.max(0, diffDays - todosDias.size);
        const taxaSLA = diffDays > 0 ? ((diasPrazoCount / diffDays) * 100).toFixed(1) : '0.0';

        let statusAtual = 'Regular (Verde)';
        if (Number(taxaSLA) < 80) statusAtual = 'Crítico (Vermelho)';
        else if (Number(taxaSLA) < 95) statusAtual = 'Atenção (Amarelo)';

        rows.push([
          u.nome,
          `${diffDays}`,
          `${diasPrazoCount}`,
          `${diasAtrasoCount}`,
          `${diasSemLeitura}`,
          `${taxaSLA}%`,
          `${uLeituras.length}`,
          statusAtual,
        ]);
      }
      break;
    }

    case 'franquia_financeiro': {
      filename = `fechamento_financeiro_franquia_${periodo}.csv`;
      headers = [
        'Unidade',
        'Contrato/Franquia',
        'Cota PB (Págs)',
        'Consumo PB (Págs)',
        'Excedente PB (Págs)',
        'Tarifa Excedente PB (R$)',
        'Custo Excedente PB (R$)',
        'Cota Color (Págs)',
        'Consumo Color (Págs)',
        'Excedente Color (Págs)',
        'Tarifa Excedente Color (R$)',
        'Custo Excedente Color (R$)',
        'Franquia Fixa Mensal (R$)',
        'TOTAL GERAL FATURAMENTO (R$)',
      ];

      for (const u of unidades) {
        const perfil = u.perfilFranquia;
        let consumoPB = 0;
        let consumoColor = 0;

        for (const imp of u.impressoras) {
          const d = calcDeltaPrinter(imp);
          consumoPB += d.pb;
          consumoColor += d.col;
        }

        const cotaPB = perfil?.temFranquiaFixa ? (perfil.cotaPB ?? 0) : 0;
        const cotaColor = perfil?.temFranquiaFixa ? (perfil.cotaColor ?? 0) : 0;
        const excedentePB = Math.max(0, consumoPB - cotaPB);
        const excedenteColor = Math.max(0, consumoColor - cotaColor);
        const tarifaExcPB = perfil?.temFranquiaFixa
          ? (perfil.excedentePB ?? perfil.tarifaAvulsaPB ?? 0.05)
          : (perfil?.tarifaAvulsaPB ?? 0.04);
        const tarifaExcColor = perfil?.temFranquiaFixa
          ? (perfil.excedenteColor ?? perfil.tarifaAvulsaColor ?? 0.3)
          : (perfil?.tarifaAvulsaColor ?? 0.25);
        const custoExcPB = excedentePB * tarifaExcPB;
        const custoExcColor = excedenteColor * tarifaExcColor;
        const fixo = perfil?.temFranquiaFixa ? (perfil.valorFixoMensal ?? 0) : 0;
        const total = fixo + custoExcPB + custoExcColor;

        rows.push([
          u.nome,
          perfil?.nome ?? 'Padrão',
          `${cotaPB}`,
          `${consumoPB}`,
          `${excedentePB}`,
          `R$ ${formatBR(tarifaExcPB)}`,
          `R$ ${formatBR(custoExcPB)}`,
          `${cotaColor}`,
          `${consumoColor}`,
          `${excedenteColor}`,
          `R$ ${formatBR(tarifaExcColor)}`,
          `R$ ${formatBR(custoExcColor)}`,
          `R$ ${formatBR(fixo)}`,
          `R$ ${formatBR(total)}`,
        ]);
      }
      break;
    }

    case 'auditoria_color': {
      filename = `auditoria_color_desperdicio_${periodo}.csv`;
      headers = [
        'Unidade',
        'Impressora/Setor',
        'Modelo',
        'Serial',
        'IP',
        'Páginas PB',
        'Páginas Color',
        'Total Páginas',
        '% Color no Total',
        'Custo Efetivo Color (R$)',
        'Custo se Fosse PB (R$)',
        'DESPERDÍCIO ESTIMADO (R$)',
      ];

      for (const u of unidades) {
        const tarifaPB = u.perfilFranquia?.tarifaAvulsaPB ?? 0.04;
        const tarifaColor = u.perfilFranquia?.tarifaAvulsaColor ?? 0.25;

        for (const imp of u.impressoras) {
          const { pb, col: color } = calcDeltaPrinter(imp);
          const tot = pb + color;
          const percColor = tot > 0 ? ((color / tot) * 100).toFixed(1) : '0.0';
          const custoColor = color * tarifaColor;
          const custoSePB = color * tarifaPB;
          const diferenca = Math.max(0, custoColor - custoSePB);

          rows.push([
            u.nome,
            imp.apelido || 'Recepção/Geral',
            imp.modelo,
            imp.serial,
            imp.ip,
            `${pb}`,
            `${color}`,
            `${tot}`,
            `${percColor}%`,
            `R$ ${formatBR(custoColor)}`,
            `R$ ${formatBR(custoSePB)}`,
            `R$ ${formatBR(diferenca)}`,
          ]);
        }
      }
      break;
    }

    case 'consumo_papel': {
      filename = `consumo_papel_insumos_${periodo}.csv`;
      headers = [
        'Unidade',
        'Total Impressoras',
        'Total Páginas Impressas',
        'Resmas Consumidas (500 págs)',
        'Caixas de Papel (5000 págs)',
        'Preço Ref. Resma (R$)',
        'Custo Estimado Papel (R$)',
        'Média Diária (Págs/Dia)',
      ];

      const diffDays = Math.max(
        1,
        Math.floor((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1
      );

      for (const u of unidades) {
        const precoResma = u.perfilFranquia?.precoResmaPapel
          ? Number(u.perfilFranquia.precoResmaPapel)
          : 28.0;
        let totalPags = 0;

        for (const imp of u.impressoras) {
          const d = calcDeltaPrinter(imp);
          totalPags += d.total || d.pb + d.col;
        }

        const resmas = (totalPags / 500).toFixed(1);
        const caixas = (totalPags / 5000).toFixed(2);
        const custoPapel = (totalPags / 500) * precoResma;
        const mediaDia = (totalPags / diffDays).toFixed(0);

        rows.push([
          u.nome,
          `${u.impressoras.length}`,
          `${totalPags}`,
          resmas,
          caixas,
          `R$ ${formatBR(precoResma)}`,
          `R$ ${formatBR(custoPapel)}`,
          mediaDia,
        ]);
      }
      break;
    }

    case 'parque_anomalias': {
      filename = `diagnostico_parque_anomalias_${periodo}.csv`;
      headers = [
        'Unidade',
        'Apelido/Setor',
        'Modelo',
        'Serial',
        'IP',
        'Status Atual',
        'Reset de Placa Detectado',
        'Vida Útil (Contador Total)',
        'Última Leitura Registrada',
        'Alerta Operacional',
      ];

      for (const u of unidades) {
        for (const imp of u.impressoras) {
          const { impLeituras } = calcDeltaPrinter(imp);
          const temReset = impLeituras.some((l) => l.resetPlaca);
          const ultLeitura = impLeituras[impLeituras.length - 1];

          let alerta = 'Normal';
          if (temReset) alerta = 'CRÍTICO: Queda brusca de contador (Possível Reset)';
          else if (!ultLeitura) alerta = 'ATENÇÃO: Sem leitura registrada no período';
          else if (ultLeitura.status === 'Offline') alerta = 'Impressora Inacessível (Offline)';

          rows.push([
            u.nome,
            imp.apelido || '-',
            imp.modelo,
            imp.serial,
            imp.ip,
            ultLeitura ? ultLeitura.status : 'Sem Dados',
            temReset ? 'SIM' : 'NÃO',
            ultLeitura ? `${ultLeitura.paginasTotal}` : '0',
            ultLeitura ? ultLeitura.dataHora.toLocaleString('pt-BR') : '-',
            alerta,
          ]);
        }
      }
      break;
    }

    case 'extrato_detalhado':
    default: {
      filename = `extrato_detalhado_leituras_${periodo}.csv`;
      headers = [
        'Data',
        'Hora',
        'Unidade',
        'Apelido',
        'Modelo',
        'Serial',
        'IP',
        'Total',
        'PB',
        'Color',
        'Status',
        'Reset Placa',
      ];

      for (const l of leituras) {
        const d = l.dataHora;
        const dataStr = d.toLocaleDateString('pt-BR');
        const horaStr = d.toLocaleTimeString('pt-BR');

        rows.push([
          dataStr,
          horaStr,
          l.unidade?.nome ?? 'Desconhecida',
          l.impressora?.apelido ?? '-',
          l.impressora?.modelo ?? '-',
          l.serial,
          l.ip,
          `${l.paginasTotal}`,
          `${l.paginasPB}`,
          `${l.paginasColor}`,
          l.status,
          l.resetPlaca ? 'SIM' : 'NÃO',
        ]);
      }
      break;
    }
  }

  const csvContent = [
    '\uFEFF' + headers.map(escapeCsvCell).join(';'),
    ...rows.map((r) => r.map(escapeCsvCell).join(';')),
  ].join('\r\n');

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  });
}

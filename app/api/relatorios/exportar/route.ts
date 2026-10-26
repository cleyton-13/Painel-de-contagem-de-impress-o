import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatBR(val: number): string {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDates(periodo: string, dataInicio?: string | null, dataFim?: string | null) {
  const agora = new Date();
  let inicio = new Date();
  let fim = new Date();

  switch (periodo) {
    case 'hoje':
      inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);
      fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59);
      break;
    case '7dias':
      inicio = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '15dias':
      inicio = new Date(agora.getTime() - 15 * 24 * 60 * 60 * 1000);
      break;
    case '30dias':
      inicio = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'mes_atual':
      inicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0);
      fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59);
      break;
    case 'mes_anterior':
      inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1, 0, 0, 0);
      fim = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59);
      break;
    case 'custom':
      if (dataInicio) {
        const parts = dataInicio.split('-');
        inicio = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0);
      }
      if (dataFim) {
        const parts = dataFim.split('-');
        fim = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59);
      }
      break;
    default:
      inicio = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  return { inicio, fim };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get('tipo') || 'sla_conformidade';
  const periodo = searchParams.get('periodo') || '30dias';
  const dataInicioStr = searchParams.get('dataInicio');
  const dataFimStr = searchParams.get('dataFim');
  const unidadeId = searchParams.get('unidadeId');

  const { inicio, fim } = parseDates(periodo, dataInicioStr, dataFimStr);

  const whereUnidade = unidadeId && unidadeId !== 'ALL' ? { id: unidadeId } : {};

  // Busca unidades e franquias
  const unidades = await prisma.unidade.findMany({
    where: whereUnidade,
    include: {
      perfilFranquia: true,
      impressoras: true,
    },
    orderBy: { nome: 'asc' },
  });

  // Busca leituras no periodo
  const whereLeituras: Prisma.LeituraImpressoraWhereInput = {
    dataHora: {
      gte: inicio,
      lte: fim,
    },
  };
  if (unidadeId && unidadeId !== 'ALL') {
    whereLeituras.unidadeId = unidadeId;
  }

  const leituras = await prisma.leituraImpressora.findMany({
    where: whereLeituras,
    include: {
      impressora: true,
      unidade: true,
    },
    orderBy: { dataHora: 'asc' },
  });

  let filename = `relatorio_${tipo}_${periodo}.csv`;
  let headers: string[] = [];
  const rows: string[][] = [];

  switch (tipo) {
    case 'sla_conformidade': {
      filename = `auditoria_sla_pontualidade_${periodo}.csv`;
      headers = [
        'Unidade',
        'Total Dias Periodo',
        'Dias com Leitura (Ate 17h)',
        'Dias com Leitura (Apos 17h)',
        'Dias Sem Leitura (Pendente)',
        'Indice Conformidade SLA (%)',
        'Total Leituras Realizadas',
        'Status Atual',
      ];

      // Agrupa leituras por unidade e por dia (YYYY-MM-DD)
      const diffDays = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));

      for (const u of unidades) {
        const uLeituras = leituras.filter((l) => l.unidadeId === u.id);
        const diasComLeituraNoPrazo = new Set<string>();
        const diasComLeituraAtrasada = new Set<string>();
        const todosDias = new Set<string>();

        for (const l of uLeituras) {
          const diaStr = l.dataHora.toISOString().split('T')[0];
          todosDias.add(diaStr);
          const hora = l.dataHora.getHours();
          const minuto = l.dataHora.getMinutes();
          if (hora < 17 || (hora === 17 && minuto === 0)) {
            diasComLeituraNoPrazo.add(diaStr);
          } else {
            diasComLeituraAtrasada.add(diaStr);
          }
        }

        const diasPrazoCount = diasComLeituraNoPrazo.size;
        const diasAtrasoCount = Array.from(diasComLeituraAtrasada).filter((d) => !diasComLeituraNoPrazo.has(d)).length;
        const diasSemLeitura = Math.max(0, diffDays - todosDias.size);
        const taxaSLA = diffDays > 0 ? ((diasPrazoCount / diffDays) * 100).toFixed(1) : '0.0';

        let statusAtual = 'Regular (Verde)';
        if (Number(taxaSLA) < 80) statusAtual = 'Critico (Vermelho)';
        else if (Number(taxaSLA) < 95) statusAtual = 'Atencao (Amarelo)';

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
        'Cota PB (Pags)',
        'Consumo PB (Pags)',
        'Excedente PB (Pags)',
        'Tarifa Excedente PB (R$)',
        'Custo Excedente PB (R$)',
        'Cota Color (Pags)',
        'Consumo Color (Pags)',
        'Excedente Color (Pags)',
        'Tarifa Excedente Color (R$)',
        'Custo Excedente Color (R$)',
        'Franquia Fixa Mensal (R$)',
        'TOTAL GERAL FATURAMENTO (R$)',
      ];

      for (const u of unidades) {
        const perfil = u.perfilFranquia;
        const uLeituras = leituras.filter((l) => l.unidadeId === u.id);

        // Calcula deltas por impressora da unidade
        let consumoPB = 0;
        let consumoColor = 0;

        for (const imp of u.impressoras) {
          const impLeituras = uLeituras.filter((l) => l.impressoraId === imp.id || l.serial === imp.serial);
          if (impLeituras.length >= 2) {
            const prim = impLeituras[0];
            const ult = impLeituras[impLeituras.length - 1];
            consumoPB += Math.max(0, ult.paginasPB - prim.paginasPB);
            consumoColor += Math.max(0, ult.paginasColor - prim.paginasColor);
          } else if (impLeituras.length === 1) {
            consumoPB += impLeituras[0].paginasPB;
            consumoColor += impLeituras[0].paginasColor;
          }
        }

        const cotaPB = perfil?.cotaPB ?? 0;
        const cotaColor = perfil?.cotaColor ?? 0;
        const excedentePB = Math.max(0, consumoPB - cotaPB);
        const excedenteColor = Math.max(0, consumoColor - cotaColor);
        const tarifaExcPB = perfil?.excedentePB ?? perfil?.tarifaAvulsaPB ?? 0.05;
        const tarifaExcColor = perfil?.excedenteColor ?? perfil?.tarifaAvulsaColor ?? 0.3;
        const custoExcPB = excedentePB * tarifaExcPB;
        const custoExcColor = excedenteColor * tarifaExcColor;
        const fixo = perfil?.temFranquiaFixa ? (perfil.valorFixoMensal ?? 0) : 0;
        const total = fixo + custoExcPB + custoExcColor;

        rows.push([
          u.nome,
          perfil?.nome ?? 'Padrao',
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
        'Paginas PB',
        'Paginas Color',
        'Total Paginas',
        '% Color no Total',
        'Custo Efetivo Color (R$)',
        'Custo se Fosse PB (R$)',
        'DESPERDICIO ESTIMADO (R$)',
      ];

      for (const u of unidades) {
        const uLeituras = leituras.filter((l) => l.unidadeId === u.id);
        const tarifaPB = u.perfilFranquia?.tarifaAvulsaPB ?? 0.04;
        const tarifaColor = u.perfilFranquia?.tarifaAvulsaColor ?? 0.25;

        for (const imp of u.impressoras) {
          const impLeituras = uLeituras.filter((l) => l.impressoraId === imp.id || l.serial === imp.serial);
          let pb = 0;
          let color = 0;

          if (impLeituras.length >= 2) {
            const prim = impLeituras[0];
            const ult = impLeituras[impLeituras.length - 1];
            pb = Math.max(0, ult.paginasPB - prim.paginasPB);
            color = Math.max(0, ult.paginasColor - prim.paginasColor);
          } else if (impLeituras.length === 1) {
            pb = impLeituras[0].paginasPB;
            color = impLeituras[0].paginasColor;
          }

          const tot = pb + color;
          const percColor = tot > 0 ? ((color / tot) * 100).toFixed(1) : '0.0';
          const custoColor = color * tarifaColor;
          const custoSePB = color * tarifaPB;
          const diferenca = Math.max(0, custoColor - custoSePB);

          rows.push([
            u.nome,
            imp.apelido || 'Recepcao/Geral',
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
        'Total Paginas Impressas',
        'Resmas Consumidas (500 pags)',
        'Caixas de Papel (5000 pags)',
        'Preco Ref. Resma (R$)',
        'Custo Estimado Papel (R$)',
        'Media Diaria (Pags/Dia)',
      ];

      const diffDays = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
      const precoResma = 28.0;

      for (const u of unidades) {
        const uLeituras = leituras.filter((l) => l.unidadeId === u.id);
        let totalPags = 0;

        for (const imp of u.impressoras) {
          const impLeituras = uLeituras.filter((l) => l.impressoraId === imp.id || l.serial === imp.serial);
          if (impLeituras.length >= 2) {
            const prim = impLeituras[0];
            const ult = impLeituras[impLeituras.length - 1];
            totalPags += Math.max(0, ult.paginasTotal - prim.paginasTotal);
          } else if (impLeituras.length === 1) {
            totalPags += impLeituras[0].paginasTotal;
          }
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
        'Vida Util (Contador Total)',
        'Ultima Leitura Registrada',
        'Alerta Operacional',
      ];

      for (const u of unidades) {
        for (const imp of u.impressoras) {
          const impLeituras = leituras.filter((l) => l.impressoraId === imp.id || l.serial === imp.serial);
          const temReset = impLeituras.some((l) => l.resetPlaca);
          const ultLeitura = impLeituras[impLeituras.length - 1];

          let alerta = 'Normal';
          if (temReset) alerta = 'CRITICO: Queda brusca de contador (Possivel Reset)';
          else if (!ultLeitura) alerta = 'ATENCAO: Sem leitura registrada no periodo';
          else if (ultLeitura.status === 'Offline') alerta = 'Impressora Inacessivel (Offline)';

          rows.push([
            u.nome,
            imp.apelido || '-',
            imp.modelo,
            imp.serial,
            imp.ip,
            ultLeitura ? ultLeitura.status : 'Sem Dados',
            temReset ? 'SIM' : 'NAO',
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
          l.resetPlaca ? 'SIM' : 'NAO',
        ]);
      }
      break;
    }
  }

  // Gera conteudo CSV com UTF-8 BOM e delimitador ; para abrir direto no Excel
  const csvContent = [
    '\uFEFF' + headers.join(';'),
    ...rows.map((r) => r.join(';')),
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

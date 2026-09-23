import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getConfiguracaoIA, iaConfigurado } from '@/lib/aiConfig';
import { chamarIA } from '@/lib/aiProviders';
import {
  getDashboardKPIs,
  getImpressorasView,
  getBranchRanking,
  getTimelineData,
  getFinancialProjections,
  getContagemDiariaComDias,
} from '@/lib/business';

// Monta contexto com todos os dados do painel
async function buildContext() {
  const [kpis, impressoras, ranking, timeline, projecoes, contagemComDias, slaConfig] = await Promise.all([
    getDashboardKPIs(prisma),
    getImpressorasView(prisma),
    getBranchRanking(prisma),
    getTimelineData(prisma),
    getFinancialProjections(prisma),
    getContagemDiariaComDias(prisma),
    prisma.configuracaoSLA.findUnique({ where: { id: 'default_config' } }),
  ]);

  const linhasUnidades = contagemComDias.map((u) => {
    const ultimos = [...u.dias].sort((a, b) => a.data.localeCompare(b.data)).slice(-3);
    return {
      unidade: u.unidadeNome,
      totalPeriodo: u.totalPeriodo,
      pbTotal: u.paginasPBTotal,
      colorTotal: u.paginasColorTotal,
      ultimosDias: ultimos.map((d) => `${d.data}: ${d.total} pag (PB ${d.paginasPB}, Color ${d.paginasColor})`),
    };
  });

  const resumoImpressoras = impressoras.map((i) => ({
    unidade: i.unidadeNome,
    modelo: i.modelo,
    serial: i.serial,
    apelido: i.apelido,
    status: i.status,
    pb: i.consumoPBDelta,
    color: i.consumoColorDelta,
    total: i.totalImpresso,
    custo: i.custoEstimado,
  }));

  return {
    kpis,
    resumoImpressoras,
    ranking,
    timeline: timeline.slice(-30),
    projecoes,
    contagemPorUnidade: linhasUnidades,
    slaAtivo: slaConfig?.alertasAtivos,
    unidadesPendentesSLA: kpis.unidadesPendentesSLA,
  };
}

function buildSystemPrompt(): string {
  return `Você é um analista de BI especializado em gestão de frotas de impressoras multifuncionais (Konica Minolta).

Sua tarefa é analisar os dados fornecidos e gerar um relatório executivo em PORTUGUÊS (pt-BR), claro e bem estruturado.

O relatório deve conter as seguintes seções (use títulos em markdown com ##):
1. ## Resumo Executivo — panorama geral: total de páginas, custos estimados, impressoras online/offline, unidades pendentes de SLA.
2. ## Consumo por Unidade — destaque as unidades com maior e menor consumo no período, com valores concretos.
3. ## Comparativo Dia a Dia — compare o consumo dos últimos dias de cada unidade. Se uma unidade imprimiu MAIS do que no dia anterior, diga algo como "A unidade X imprimiu N páginas a mais do que no dia anterior". Se imprimiu MENOS, mencione também. Use números reais.
4. ## Impressoras e Saúde da Frota — aponte impressoras offline, modelos com problemas, resets de placa, e qualquer anomalia (ex: PB=Color em C3300i não deve ocorrer).
5. ## Custos e Projeções — análise de custos, franquias, excedentes, projeções mensais e sugestão de economia de papel/custo.
6. ## Recomendações — 3 a 5 sugestões práticas e acionáveis (ex: reduzir impressão colorida, verificar impressora offline, revisar franquia de determinada unidade).

Regras:
- Seja objetivo e use valores reais dos dados.
- Destaque anomalias claramente (com 🚨 ou ⚠ quando apropriado).
- NÃO invente dados que não estejam nos dados fornecidos.
- Use formatação markdown limpa.`;
}

function buildUserPrompt(context: Awaited<ReturnType<typeof buildContext>>, idioma: string): string {
  const k = context.kpis;
  return `Analise os dados abaixo do Painel de Impressoras BI (idioma: ${idioma}) e produza o relatório executivo.

### KPIs do Dashboard
- Total impresso: ${k.totalImpresso} páginas (PB: ${k.totalPB}, Color: ${k.totalColor})
- Custo total estimado: R$ ${k.custoTotal.toFixed(2)}
- Proporção: PB ${k.proporcaoPB}% / Color ${k.proporcaoColor}%
- Unidade líder: ${k.unidadeLider.nome} (${k.unidadeLider.total} págs, R$ ${k.unidadeLider.custo.toFixed(2)})
- Impressoras: ${k.totalImpressoras} total | ${k.impressorasOnline} online | ${k.impressorasOffline} offline | ${k.impressorasReset} reset de placa
- Unidades pendentes de SLA: ${k.unidadesPendentesSLA.length} ${k.unidadesPendentesSLA.map((u) => u.nome).join(', ')}

### Contagem por Unidade (período + últimos dias)
${JSON.stringify(context.contagemPorUnidade, null, 1)}

### Parque de Impressoras (resumo)
${JSON.stringify(context.resumoImpressoras, null, 1)}

### Ranking de Unidades
${JSON.stringify(context.ranking, null, 1)}

### Timeline (últimos 30 dias)
${JSON.stringify(context.timeline, null, 1)}

### Projeções Financeiras
${JSON.stringify(context.projecoes, null, 1)}

### SLA
Alertas ativos: ${context.slaAtivo ? 'sim' : 'não'}
Pendentes: ${context.unidadesPendentesSLA.length} unidade(s)`;
}

export async function POST() {
  try {
    const config = await getConfiguracaoIA();
    if (!iaConfigurado(config)) {
      return NextResponse.json({ error: 'IA não configurada ou sem API Key. Acesse a aba Configurações.' }, { status: 400 });
    }
    const context = await buildContext();
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(context, config.idioma);

    const resposta = await chamarIA({ config, systemPrompt, userPrompt });

    return NextResponse.json({ ...resposta, contexto: { unidades: context.contagemPorUnidade.length, impressoras: context.resumoImpressoras.length } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    require('fs').appendFileSync('log_ia.txt', new Date().toISOString() + ' - ERRO IA: ' + msg + '\n');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

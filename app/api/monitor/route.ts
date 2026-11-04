import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MonitorEnviosPayload, MonitorEnvioUnidade, MonitorEnvioRegistro } from '@/lib/types';
import { sanitizeUnitName, getImpressorasView } from '@/lib/business';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extrairUnidadeDeNomeArquivo(nomeArquivo: string): string {
  const m = nomeArquivo.match(/^relatorio_impressoras_(.+?)_\d{4}-\d{2}-\d{2}/i);
  if (!m) return '';
  return sanitizeUnitName(m[1]);
}

export async function GET() {
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);

  const [unidades, registrosRecentes, registrosHoje, leiturasHojeCount, impressorasHoje] =
    await Promise.all([
      prisma.unidade.findMany({
        orderBy: { nomeSanitizado: 'asc' },
        select: { id: true, nome: true, nomeSanitizado: true },
      }),
      prisma.arquivoIngerido.findMany({
        orderBy: { dataProcessamento: 'desc' },
        take: 150,
        select: {
          id: true,
          nomeArquivo: true,
          dataProcessamento: true,
          tamanhoBytes: true,
          status: true,
          novas: true,
          atualizadas: true,
        },
      }),
      prisma.arquivoIngerido.findMany({
        where: { dataProcessamento: { gte: inicioHoje } },
        orderBy: { dataProcessamento: 'desc' },
        select: {
          id: true,
          nomeArquivo: true,
          dataProcessamento: true,
          tamanhoBytes: true,
          status: true,
          novas: true,
          atualizadas: true,
        },
      }),
      prisma.leituraImpressora.groupBy({
        by: ['unidadeId'],
        where: { dataHora: { gte: inicioHoje } },
        _count: { id: true },
      }),
      // Delta real impresso hoje (evita somar odômetro vitalício acumulado!)
      getImpressorasView(prisma, undefined, undefined, 'hoje'),
    ]);

  // Consolida arquivos de hoje + histórico recente sem duplicatas para não perder unidades quando houver >30 envios
  const seenIds = new Set<string>();
  const todosArquivos = [...registrosHoje, ...registrosRecentes].filter((r) => {
    if (seenIds.has(r.id)) return false;
    seenIds.add(r.id);
    return true;
  });

  const ultimoPorUnidade = new Map<string, MonitorEnvioRegistro>();
  for (const r of todosArquivos) {
    const unidadeNome = extrairUnidadeDeNomeArquivo(r.nomeArquivo);
    if (!unidadeNome) continue;
    if (!ultimoPorUnidade.has(unidadeNome)) {
      ultimoPorUnidade.set(unidadeNome, {
        id: r.id,
        nomeArquivo: r.nomeArquivo,
        dataProcessamento: r.dataProcessamento.toISOString(),
        tamanhoBytes: Number(r.tamanhoBytes),
        status: r.status,
        unidadeNome,
        novas: Number(r.novas) || 0,
        atualizadas: Number(r.atualizadas) || 0,
      });
    }
  }

  const leiturasCountMap = new Map<string, number>();
  for (const l of leiturasHojeCount) {
    leiturasCountMap.set(l.unidadeId, l._count.id);
  }

  const impressoesDiaPorUnidade = new Map<string, number>();
  for (const imp of impressorasHoje) {
    impressoesDiaPorUnidade.set(
      imp.unidadeId,
      (impressoesDiaPorUnidade.get(imp.unidadeId) || 0) + imp.totalImpresso
    );
  }

  const enviosHojeMap = new Map<string, number>();
  for (const r of registrosHoje) {
    const unidadeNome = extrairUnidadeDeNomeArquivo(r.nomeArquivo);
    if (!unidadeNome) continue;
    enviosHojeMap.set(unidadeNome, (enviosHojeMap.get(unidadeNome) || 0) + 1);
  }

  const unidadesResult: MonitorEnvioUnidade[] = unidades.map((u) => {
    const ultimo =
      ultimoPorUnidade.get(u.nomeSanitizado) || ultimoPorUnidade.get(sanitizeUnitName(u.nome));
    const leiturasHoje = leiturasCountMap.get(u.id) || 0;
    const impressoesDia = impressoesDiaPorUnidade.get(u.id) || 0;
    const enviosHoje =
      enviosHojeMap.get(u.nomeSanitizado) || enviosHojeMap.get(sanitizeUnitName(u.nome)) || 0;

    return {
      unidadeId: u.id,
      unidadeNome: u.nome,
      ultimoArquivo: ultimo?.nomeArquivo || null,
      dataUltimoEnvio: ultimo?.dataProcessamento || null,
      statusUltimoEnvio: ultimo?.status || null,
      leiturasHoje,
      impressoesDia,
      enviosHoje,
      pendenteHoje: leiturasHoje === 0,
    };
  });

  const registrosResult: MonitorEnvioRegistro[] = registrosRecentes.slice(0, 50).map((r) => ({
    id: r.id,
    nomeArquivo: r.nomeArquivo,
    dataProcessamento: r.dataProcessamento.toISOString(),
    tamanhoBytes: Number(r.tamanhoBytes),
    status: r.status,
    unidadeNome: extrairUnidadeDeNomeArquivo(r.nomeArquivo),
    novas: Number(r.novas) || 0,
    atualizadas: Number(r.atualizadas) || 0,
  }));

  const payload: MonitorEnviosPayload = {
    unidades: unidadesResult,
    registros: registrosResult,
    atualizadoEm: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}

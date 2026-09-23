import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MonitorEnviosPayload, MonitorEnvioUnidade, MonitorEnvioRegistro } from '@/lib/types';
import { sanitizeUnitName } from '@/lib/business';

export const dynamic = 'force-dynamic';

function extrairUnidadeDeNomeArquivo(nomeArquivo: string): string {
  const m = nomeArquivo.match(/^relatorio_impressoras_(.+?)_\d{4}-\d{2}-\d{2}/i);
  if (!m) return '';
  return sanitizeUnitName(m[1]);
}

export async function GET() {
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);

  const [unidades, registros, leiturasHoje] = await Promise.all([
    prisma.unidade.findMany({
      orderBy: { nomeSanitizado: 'asc' },
      select: { id: true, nome: true, nomeSanitizado: true },
    }),
    prisma.arquivoIngerido.findMany({
      orderBy: { dataProcessamento: 'desc' },
      take: 30,
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
      _sum: { paginasTotal: true },
    }),
  ]);

  const unidadesMap = new Map(unidades.map((u) => [u.id, u]));

  // Último arquivo ingerido por unidade (via nome do arquivo)
  const ultimoPorUnidade = new Map<string, MonitorEnvioRegistro>();
  for (const r of registros) {
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

  const leiturasMap = new Map<
    string,
    { leituras: number; impressoes: number }
  >();
  for (const l of leiturasHoje) {
    leiturasMap.set(l.unidadeId, {
      leituras: l._count.id,
      impressoes: Number(l._sum.paginasTotal) || 0,
    });
  }

  // Número de envios de hoje por unidade
  const enviosHojeMap = new Map<string, number>();
  for (const r of registros) {
    if (r.dataProcessamento.getTime() < inicioHoje.getTime()) continue;
    const unidadeNome = extrairUnidadeDeNomeArquivo(r.nomeArquivo);
    if (!unidadeNome) continue;
    enviosHojeMap.set(unidadeNome, (enviosHojeMap.get(unidadeNome) || 0) + 1);
  }

  const unidadesResult: MonitorEnvioUnidade[] = unidades.map((u) => {
    const ultimo = ultimoPorUnidade.get(u.nomeSanitizado) || ultimoPorUnidade.get(u.nome);
    const leituras = leiturasMap.get(u.id);
    const enviosHoje = enviosHojeMap.get(u.nomeSanitizado) || enviosHojeMap.get(u.nome) || 0;
    return {
      unidadeId: u.id,
      unidadeNome: u.nome,
      ultimoArquivo: ultimo?.nomeArquivo || null,
      dataUltimoEnvio: ultimo?.dataProcessamento || null,
      statusUltimoEnvio: ultimo?.status || null,
      leiturasHoje: leituras?.leituras || 0,
      impressoesDia: leituras?.impressoes || 0,
      enviosHoje,
      pendenteHoje: leituras ? false : true,
    };
  });

  const registrosResult: MonitorEnvioRegistro[] = registros.map((r) => ({
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
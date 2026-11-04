import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getImpressorasView,
  getDashboardKPIs,
  getTimelineData,
  getBranchRanking,
  PeriodoContagem,
} from '@/lib/business';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unidadeId = searchParams.get('unidadeId') || undefined;
  const periodo = (searchParams.get('periodo') as PeriodoContagem) || '30dias';

  // Pré-aquece o cache deduplicado para que KPIs e BranchRanking reutilizem a mesma leitura
  await getImpressorasView(prisma, unidadeId, undefined, periodo);

  const [kpis, timeline, branchRanking] = await Promise.all([
    getDashboardKPIs(prisma, unidadeId, periodo),
    getTimelineData(prisma, unidadeId, periodo),
    getBranchRanking(prisma, unidadeId, periodo),
  ]);

  return NextResponse.json({ kpis, timeline, branchRanking });
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDashboardKPIs, getTimelineData, getBranchRanking, PeriodoContagem } from '@/lib/business';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unidadeId = searchParams.get('unidadeId') || undefined;
  const periodo = (searchParams.get('periodo') as PeriodoContagem) || '30dias';

  const [kpis, timeline, branchRanking] = await Promise.all([
    getDashboardKPIs(prisma, unidadeId, periodo),
    getTimelineData(prisma, unidadeId, periodo),
    getBranchRanking(prisma, unidadeId, periodo),
  ]);

  return NextResponse.json({ kpis, timeline, branchRanking });
}

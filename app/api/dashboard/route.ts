import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDashboardKPIs, getTimelineData, getBranchRanking } from '@/lib/business';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unidadeId = searchParams.get('unidadeId') || undefined;
  const periodo = (searchParams.get('periodo') as any) || '30dias';
  const kpis = await getDashboardKPIs(prisma, unidadeId, periodo);
  const timeline = await getTimelineData(prisma, unidadeId, periodo);
  const branchRanking = await getBranchRanking(prisma, unidadeId, periodo);
  return NextResponse.json({ kpis, timeline, branchRanking });
}

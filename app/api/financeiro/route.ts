import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getFinancialProjections } from '@/lib/business';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unidadeId = searchParams.get('unidadeId') || undefined;
  const periodo = (searchParams.get('periodo') as any) || '30dias';
  const projections = await getFinancialProjections(prisma, unidadeId, periodo);
  return NextResponse.json(projections);
}

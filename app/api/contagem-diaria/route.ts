import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getContagemDiaria, getContagemDiariaComDias, type PeriodoContagem } from '@/lib/business';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unidadeId = searchParams.get('unidadeId') || undefined;
  const periodo = (searchParams.get('periodo') || '30dias') as PeriodoContagem;
  const impressoraId = searchParams.get('impressoraId') || undefined;
  const comDias = searchParams.get('comDias') === 'true';

  if (comDias) {
    const data = await getContagemDiariaComDias(prisma, unidadeId, periodo, impressoraId);
    return NextResponse.json(data);
  }

  const data = await getContagemDiaria(prisma, unidadeId, periodo, impressoraId);
  return NextResponse.json(data);
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getImpressorasView, invalidateImpressorasCache, PeriodoContagem } from '@/lib/business';
import { isAuthenticated } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const unidadeId = searchParams.get('unidadeId') || undefined;
  const search = searchParams.get('search') || undefined;
  const periodo = (searchParams.get('periodo') as PeriodoContagem) || '30dias';
  const impressoras = await getImpressorasView(prisma, unidadeId, search, periodo);
  return NextResponse.json(impressoras);
}

export async function PATCH(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { error: 'Não autorizado. Acesso restrito a administradores.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { serial, apelido, preExistente, leituraReferenciaPB, leituraReferenciaColor } = body;
    if (!serial) {
      return NextResponse.json({ error: 'Serial é obrigatório.' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (apelido !== undefined) data.apelido = apelido ? String(apelido).trim() : null;
    if (preExistente !== undefined) data.preExistente = Boolean(preExistente);
    if (leituraReferenciaPB !== undefined) {
      data.leituraReferenciaPB =
        leituraReferenciaPB != null && leituraReferenciaPB !== ''
          ? Math.max(0, Math.round(Number(leituraReferenciaPB) || 0))
          : null;
    }
    if (leituraReferenciaColor !== undefined) {
      data.leituraReferenciaColor =
        leituraReferenciaColor != null && leituraReferenciaColor !== ''
          ? Math.max(0, Math.round(Number(leituraReferenciaColor) || 0))
          : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo válido para atualizar.' }, { status: 400 });
    }

    const updated = await prisma.impressora.update({
      where: { serial },
      data,
      include: { unidade: true },
    });

    invalidateImpressorasCache();
    revalidatePath('/');
    return NextResponse.json({ success: true, impressora: updated });
  } catch (error) {
    console.error('[IMPRESSORAS PATCH]', error);
    return NextResponse.json(
      { error: 'Falha ao atualizar configuração da impressora.' },
      { status: 500 }
    );
  }
}

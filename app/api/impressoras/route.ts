import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getImpressorasView } from '@/lib/business';
import { revalidatePath } from 'next/cache';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unidadeId = searchParams.get('unidadeId') || undefined;
  const search = searchParams.get('search') || undefined;
  const periodo = (searchParams.get('periodo') as any) || '30dias';
  const impressoras = await getImpressorasView(prisma, unidadeId, search, periodo);
  return NextResponse.json(impressoras);
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { serial, apelido, preExistente, leituraReferenciaPB, leituraReferenciaColor } = body;
    if (!serial) {
      return NextResponse.json({ error: 'Serial e obrigatorio' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (apelido !== undefined) data.apelido = apelido ? String(apelido).trim() : null;
    if (preExistente !== undefined) data.preExistente = Boolean(preExistente);
    if (leituraReferenciaPB !== undefined) data.leituraReferenciaPB = leituraReferenciaPB != null ? Number(leituraReferenciaPB) : null;
    if (leituraReferenciaColor !== undefined) data.leituraReferenciaColor = leituraReferenciaColor != null ? Number(leituraReferenciaColor) : null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo valido para atualizar' }, { status: 400 });
    }

    const updated = await prisma.impressora.update({
      where: { serial },
      data,
      include: { unidade: true },
    });

    revalidatePath('/');
    return NextResponse.json({ success: true, impressora: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

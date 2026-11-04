import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { invalidateImpressorasCache } from '@/lib/business';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const contratos = await prisma.perfilFranquia.findMany({
    orderBy: { nome: 'asc' },
    include: { unidades: { select: { id: true, nome: true } } },
  });
  return NextResponse.json(contratos);
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { error: 'Não autorizado. Acesso restrito a administradores.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const {
      id,
      nome,
      tarifaAvulsaPB,
      tarifaAvulsaColor,
      temFranquiaFixa,
      valorFixoMensal,
      cotaPB,
      cotaColor,
      excedentePB,
      excedenteColor,
      precoResmaPapel,
    } = body;

    if (!nome || String(nome).trim() === '') {
      return NextResponse.json({ error: 'Nome do perfil é obrigatório.' }, { status: 400 });
    }

    const temFixa = temFranquiaFixa ?? true;
    const data: Record<string, unknown> = {
      nome: String(nome).trim(),
      tarifaAvulsaPB: Math.max(0, Number(tarifaAvulsaPB ?? 0.04) || 0),
      tarifaAvulsaColor: Math.max(0, Number(tarifaAvulsaColor ?? 0.25) || 0),
      temFranquiaFixa: Boolean(temFixa),
      precoResmaPapel: Math.max(0, Number(precoResmaPapel ?? 28.0) || 0),
    };

    if (temFixa) {
      data.valorFixoMensal = Math.max(0, Number(valorFixoMensal ?? 500.0) || 0);
      data.cotaPB = Math.max(0, Math.round(Number(cotaPB ?? 5000) || 0));
      data.cotaColor = Math.max(0, Math.round(Number(cotaColor ?? 1000) || 0));
      data.excedentePB = Math.max(0, Number(excedentePB ?? 0.05) || 0);
      data.excedenteColor = Math.max(0, Number(excedenteColor ?? 0.3) || 0);
    } else {
      data.valorFixoMensal = null;
      data.cotaPB = null;
      data.cotaColor = null;
      data.excedentePB = null;
      data.excedenteColor = null;
    }

    const contrato = id
      ? await prisma.perfilFranquia.update({
          where: { id },
          data: data as Prisma.PerfilFranquiaUpdateInput,
        })
      : await prisma.perfilFranquia.create({
          data: data as Prisma.PerfilFranquiaCreateInput,
        });

    invalidateImpressorasCache();
    revalidatePath('/');
    return NextResponse.json({ success: true, contrato });
  } catch (error) {
    console.error('[CONTRATOS POST]', error);
    return NextResponse.json({ error: 'Falha ao salvar perfil de franquia.' }, { status: 500 });
  }
}

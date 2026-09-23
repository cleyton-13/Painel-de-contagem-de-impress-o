import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function GET() {
  const contratos = await prisma.perfilFranquia.findMany({
    orderBy: { nome: 'asc' },
    include: { unidades: { select: { id: true, nome: true } } },
  });
  return NextResponse.json(contratos);
}

export async function POST(request: Request) {
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
      return NextResponse.json({ error: 'Nome do perfil obrigatorio' }, { status: 400 });
    }

    const temFixa = temFranquiaFixa ?? true;
    const data: Record<string, unknown> = {
      nome: String(nome).trim(),
      tarifaAvulsaPB: Number(tarifaAvulsaPB ?? 0.04),
      tarifaAvulsaColor: Number(tarifaAvulsaColor ?? 0.25),
      temFranquiaFixa: temFixa,
      precoResmaPapel: Number(precoResmaPapel ?? 28.0),
    };

    if (temFixa) {
      data.valorFixoMensal = Number(valorFixoMensal ?? 500.0);
      data.cotaPB = Number(cotaPB ?? 5000);
      data.cotaColor = Number(cotaColor ?? 1000);
      data.excedentePB = Number(excedentePB ?? 0.05);
      data.excedenteColor = Number(excedenteColor ?? 0.3);
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

    revalidatePath('/');
    return NextResponse.json({ success: true, contrato });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
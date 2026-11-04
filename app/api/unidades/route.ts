import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toUnidadeView, invalidateImpressorasCache } from '@/lib/business';
import { isAuthenticated } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const unidades = await prisma.unidade.findMany({
    include: {
      aliases: true,
      perfilFranquia: true,
      _count: { select: { impressoras: true, leituras: true } },
    },
    orderBy: { nome: 'asc' },
  });
  const view = await Promise.all(unidades.map(toUnidadeView));
  const withCounts = view.map((u, i) => ({
    ...u,
    impressoras: unidades[i]._count.impressoras,
    leituras: unidades[i]._count.leituras,
  }));
  return NextResponse.json(withCounts);
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
    const { action, unidadeOrigemId, unidadeDestinoId, unidadeId, contratoId, confirmNome } = body;

    if (action === 'merge') {
      return await mergeUnidades(unidadeOrigemId, unidadeDestinoId);
    }
    if (action === 'assignContrato') {
      return await assignContrato(unidadeId, contratoId);
    }
    if (action === 'setEmailContato') {
      const { emailContato } = body;
      await prisma.unidade.update({
        where: { id: unidadeId },
        data: {
          emailContato: typeof emailContato === 'string' ? emailContato.trim() || null : null,
        },
      });
      invalidateImpressorasCache();
      revalidatePath('/');
      return NextResponse.json({ success: true, message: 'E-mail de contato atualizado.' });
    }
    if (action === 'delete') {
      return await deleteUnidade(unidadeId, confirmNome);
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    console.error('[UNIDADES POST]', error);
    return NextResponse.json(
      { error: 'Falha ao processar alteração na unidade.' },
      { status: 500 }
    );
  }
}

async function mergeUnidades(origemId: string, destinoId: string) {
  if (!origemId || !destinoId || origemId === destinoId) {
    return NextResponse.json(
      { success: false, message: 'Unidade origem e destino devem ser diferentes.' },
      { status: 400 }
    );
  }
  const origem = await prisma.unidade.findUnique({
    where: { id: origemId },
    include: { aliases: true },
  });
  const destino = await prisma.unidade.findUnique({
    where: { id: destinoId },
    include: { aliases: true },
  });
  if (!origem || !destino) {
    return NextResponse.json({ success: false, message: 'Unidade não encontrada.' }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.impressora.updateMany({
      data: { unidadeId: destinoId },
      where: { unidadeId: origemId },
    });
    await tx.leituraImpressora.updateMany({
      data: { unidadeId: destinoId },
      where: { unidadeId: origemId },
    });
    // Preserva todos os aliases já pertencentes à unidade de origem antes de removê-la
    await tx.unidadeAlias.updateMany({
      data: { unidadeId: destinoId },
      where: { unidadeId: origemId },
    });
    const aliasExiste = await tx.unidadeAlias.findUnique({
      where: { alias: origem.nomeSanitizado },
    });
    if (!aliasExiste && origem.nomeSanitizado !== destino.nomeSanitizado) {
      await tx.unidadeAlias.create({
        data: { alias: origem.nomeSanitizado, unidadeId: destinoId },
      });
    }
    await tx.unidade.delete({ where: { id: origemId } });
  });

  invalidateImpressorasCache();
  revalidatePath('/');
  return NextResponse.json({
    success: true,
    message: `Unidade "${origem.nome}" fundida com sucesso em "${destino.nome}". Alias "${origem.nomeSanitizado}" preservado.`,
  });
}

async function deleteUnidade(unidadeId: string, confirmNome: string) {
  const unidade = await prisma.unidade.findUnique({
    where: { id: unidadeId },
    include: { _count: { select: { impressoras: true, leituras: true } } },
  });
  if (!unidade) {
    return NextResponse.json({ success: false, message: 'Unidade não encontrada.' }, { status: 404 });
  }
  if (typeof confirmNome !== 'string' || confirmNome.trim() !== unidade.nome) {
    return NextResponse.json(
      { success: false, message: 'Confirme digitando exatamente o nome da unidade para excluir.' },
      { status: 400 }
    );
  }

  await prisma.unidade.delete({ where: { id: unidadeId } });

  invalidateImpressorasCache();
  revalidatePath('/');
  return NextResponse.json({
    success: true,
    message: `Unidade "${unidade.nome}" excluída (${unidade._count.impressoras} impressoras e ${unidade._count.leituras} leituras removidas em cascata).`,
  });
}

async function assignContrato(unidadeId: string, contratoId: string | null) {
  const updated = await prisma.unidade.update({
    where: { id: unidadeId },
    data: { perfilFranquiaId: !contratoId ? null : contratoId },
    include: { perfilFranquia: true },
  });
  invalidateImpressorasCache();
  revalidatePath('/');
  return NextResponse.json({ success: true, unidade: updated });
}

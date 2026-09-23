import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toUnidadeView } from '@/lib/business';
import { revalidatePath } from 'next/cache';

export async function GET() {
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
        data: { emailContato: typeof emailContato === 'string' ? emailContato.trim() || null : null },
      });
      revalidatePath('/');
      return NextResponse.json({ success: true, message: 'E-mail de contato atualizado.' });
    }
    if (action === 'delete') {
      return await deleteUnidade(unidadeId, confirmNome);
    }

    return NextResponse.json({ error: 'Acao invalida' }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function mergeUnidades(origemId: string, destinoId: string) {
  if (origemId === destinoId) {
    return NextResponse.json(
      { success: false, message: 'Unidade origem e destino devem ser diferentes.' },
      { status: 400 }
    );
  }
  const origem = await prisma.unidade.findUnique({ where: { id: origemId }, include: { aliases: true } });
  const destino = await prisma.unidade.findUnique({ where: { id: destinoId }, include: { aliases: true } });
  if (!origem || !destino) {
    return NextResponse.json({ success: false, message: 'Unidade nao encontrada.' }, { status: 404 });
  }

  // Move impressoras e leituras de origem para destino (em uma transacao)
  await prisma.$transaction(async (tx) => {
    await tx.impressora.updateMany({ data: { unidadeId: destinoId }, where: { unidadeId: origemId } });
    await tx.leituraImpressora.updateMany({ data: { unidadeId: destinoId }, where: { unidadeId: origemId } });
    // cria alias do nome sanitizado da origem na destino (se nao existir)
    const aliasExiste = await tx.unidadeAlias.findUnique({ where: { alias: origem.nomeSanitizado } });
    if (!aliasExiste) {
      await tx.unidadeAlias.create({
        data: { alias: origem.nomeSanitizado, unidadeId: destinoId },
      });
    }
    // remove unidade origem
    await tx.unidade.delete({ where: { id: origemId } });
  });

  revalidatePath('/');
  return NextResponse.json({
    success: true,
    message: `Unidade "${origem.nome}" fundida com sucesso em "${destino.nome}". Alias "${origem.nomeSanitizado}" criado.`,
  });
}

async function deleteUnidade(unidadeId: string, confirmNome: string) {
  const unidade = await prisma.unidade.findUnique({
    where: { id: unidadeId },
    include: { _count: { select: { impressoras: true, leituras: true } } },
  });
  if (!unidade) {
    return NextResponse.json({ success: false, message: 'Unidade nao encontrada.' }, { status: 404 });
  }
  if (typeof confirmNome !== 'string' || confirmNome.trim() !== unidade.nome) {
    return NextResponse.json(
      { success: false, message: 'Confirme digitando exatamente o nome da unidade para excluir.' },
      { status: 400 }
    );
  }

  await prisma.unidade.delete({ where: { id: unidadeId } });

  revalidatePath('/');
  return NextResponse.json({
    success: true,
    message: `Unidade "${unidade.nome}" excluida (${unidade._count.impressoras} impressoras e ${unidade._count.leituras} leituras removidas em cascata).`,
  });
}

async function assignContrato(unidadeId: string, contratoId: string | null) {
  const updated = await prisma.unidade.update({
    where: { id: unidadeId },
    data: { perfilFranquiaId: contratoId === '' ? null : contratoId },
    include: { perfilFranquia: true },
  });
  revalidatePath('/');
  return NextResponse.json({ success: true, unidade: updated });
}

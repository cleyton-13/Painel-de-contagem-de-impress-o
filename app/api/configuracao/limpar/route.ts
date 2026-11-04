import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { invalidateImpressorasCache } from '@/lib/business';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LimparSchema = z.object({
  meses: z.coerce.number().int().min(1).max(120).default(6),
});

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { error: 'Não autorizado. Acesso restrito a administradores.' },
      { status: 401 }
    );
  }

  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = LimparSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Parâmetro "meses" inválido (informe um inteiro entre 1 e 120).' },
        { status: 400 }
      );
    }

    const { meses } = parsed.data;
    const dataLimite = new Date();
    dataLimite.setMonth(dataLimite.getMonth() - meses);

    const [resultLeituras, resultArquivos] = await prisma.$transaction([
      prisma.leituraImpressora.deleteMany({
        where: { dataHora: { lt: dataLimite } },
      }),
      prisma.arquivoIngerido.deleteMany({
        where: { dataProcessamento: { lt: dataLimite } },
      }),
    ]);

    invalidateImpressorasCache();

    return NextResponse.json({
      success: true,
      message: `Limpeza concluída. ${resultLeituras.count} leituras antigas e ${resultArquivos.count} logs de arquivo removidos.`,
      deleted: {
        leituras: resultLeituras.count,
        arquivos: resultArquivos.count,
      },
    });
  } catch (error) {
    console.error('Erro ao limpar banco de dados:', error);
    return NextResponse.json(
      { error: 'Falha ao limpar registros antigos do banco de dados.' },
      { status: 500 }
    );
  }
}

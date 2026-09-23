import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { meses = 6 } = await request.json();
    
    // Calcula a data limite para exclusão
    const dataLimite = new Date();
    dataLimite.setMonth(dataLimite.getMonth() - parseInt(meses, 10));

    // Exclui registros de LeituraImpressora mais antigos que a data limite
    const resultLeituras = await prisma.leituraImpressora.deleteMany({
      where: {
        dataHora: {
          lt: dataLimite
        }
      }
    });

    // Exclui arquivos processados mais antigos
    const resultArquivos = await prisma.arquivoIngerido.deleteMany({
      where: {
        dataProcessamento: {
          lt: dataLimite
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `Limpeza concluída. ${resultLeituras.count} leituras antigas e ${resultArquivos.count} logs de arquivo removidos.`,
      deleted: {
        leituras: resultLeituras.count,
        arquivos: resultArquivos.count
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

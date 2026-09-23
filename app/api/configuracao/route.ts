import { NextResponse } from 'next/server';
import { getConfiguracaoSistema, setConfigContagem } from '@/lib/config';

export async function GET() {
  try {
    const config = await getConfiguracaoSistema();
    return NextResponse.json({
      usarSeparacaoCores: config.usarSeparacaoCores,
      faturamentoHabilitado: config.faturamentoHabilitado,
      tarifaUnica: Number(config.tarifaUnica),
      atualizadoEm: config.updatedAt.toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    if (
      body.usarSeparacaoCores !== undefined ||
      body.faturamentoHabilitado !== undefined ||
      body.tarifaUnica !== undefined
    ) {
      await setConfigContagem({
        ...(body.usarSeparacaoCores !== undefined && { usarSeparacaoCores: !!body.usarSeparacaoCores }),
        ...(body.faturamentoHabilitado !== undefined && { faturamentoHabilitado: !!body.faturamentoHabilitado }),
        ...(body.tarifaUnica !== undefined && { tarifaUnica: Math.max(0, Number(body.tarifaUnica) || 0) }),
      });
    }

    const config = await getConfiguracaoSistema();
    return NextResponse.json({
      success: true,
      usarSeparacaoCores: config.usarSeparacaoCores,
      faturamentoHabilitado: config.faturamentoHabilitado,
      tarifaUnica: Number(config.tarifaUnica),
      atualizadoEm: config.updatedAt.toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
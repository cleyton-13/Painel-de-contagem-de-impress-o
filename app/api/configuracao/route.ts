import { NextResponse } from 'next/server';
import { getConfiguracaoSistema, setConfigContagem } from '@/lib/config';
import { isAuthenticated } from '@/lib/auth';
import { invalidateImpressorasCache } from '@/lib/business';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  try {
    const config = await getConfiguracaoSistema();
    return NextResponse.json({
      usarSeparacaoCores: config.usarSeparacaoCores,
      faturamentoHabilitado: config.faturamentoHabilitado,
      tarifaUnica: Number(config.tarifaUnica),
      atualizadoEm: config.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('[CONFIG GET]', error);
    return NextResponse.json({ error: 'Falha ao carregar configurações.' }, { status: 500 });
  }
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

    if (
      body.usarSeparacaoCores !== undefined ||
      body.faturamentoHabilitado !== undefined ||
      body.tarifaUnica !== undefined
    ) {
      await setConfigContagem({
        ...(body.usarSeparacaoCores !== undefined && {
          usarSeparacaoCores: Boolean(body.usarSeparacaoCores),
        }),
        ...(body.faturamentoHabilitado !== undefined && {
          faturamentoHabilitado: Boolean(body.faturamentoHabilitado),
        }),
        ...(body.tarifaUnica !== undefined && {
          tarifaUnica: Math.max(0, Number(body.tarifaUnica) || 0),
        }),
      });
      invalidateImpressorasCache();
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
    console.error('[CONFIG PATCH]', error);
    return NextResponse.json({ error: 'Falha ao atualizar configurações.' }, { status: 500 });
  }
}

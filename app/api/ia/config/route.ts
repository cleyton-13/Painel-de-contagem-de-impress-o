import { NextResponse } from 'next/server';
import { getConfiguracaoIA, setConfiguracaoIA, toPublicConfiguracaoIA } from '@/lib/aiConfig';
import { isAuthenticated } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  try {
    const config = await getConfiguracaoIA();
    return NextResponse.json(toPublicConfiguracaoIA(config));
  } catch (error) {
    console.error('[IA CONFIG GET]', error);
    return NextResponse.json({ error: 'Falha ao carregar configuração de IA.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const config = await setConfiguracaoIA(body || {});
    return NextResponse.json({ success: true, config: toPublicConfiguracaoIA(config) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Falha ao salvar configuração de IA.';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

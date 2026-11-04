import { NextResponse } from 'next/server';
import {
  createSessionToken,
  validateAdminPassword,
  shouldUseSecureCookie,
  COOKIE_NAME,
} from '@/lib/auth';
import { checkRateLimit, getClientIdentifier } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const rateId = getClientIdentifier(req, 'auth_login');
    const rate = checkRateLimit(rateId, 10, 15 * 60 * 1000); // 10 tentativas a cada 15 min
    if (!rate.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.',
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!password) {
      return NextResponse.json({ success: false, error: 'Senha não informada.' }, { status: 400 });
    }

    if (!validateAdminPassword(password)) {
      return NextResponse.json({ success: false, error: 'Senha incorreta.' }, { status: 401 });
    }

    const token = await createSessionToken('admin');
    const response = NextResponse.json({ success: true, message: 'Autenticado com sucesso.' });

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: shouldUseSecureCookie(req),
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 dias
    });

    return response;
  } catch (error) {
    console.error('[AUTH LOGIN]', error);
    return NextResponse.json({ success: false, error: 'Erro interno ao processar login.' }, { status: 500 });
  }
}

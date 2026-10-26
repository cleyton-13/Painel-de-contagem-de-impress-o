import { NextResponse } from 'next/server';
import { createSessionToken, validateAdminPassword, COOKIE_NAME } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { password } = body;

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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 dias
    });

    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro no login';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

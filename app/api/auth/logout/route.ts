import { NextResponse } from 'next/server';
import { COOKIE_NAME, shouldUseSecureCookie } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const response = NextResponse.json({ success: true, message: 'Sessão encerrada.' });
  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: shouldUseSecureCookie(req),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

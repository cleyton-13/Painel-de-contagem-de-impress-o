import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE_NAME, verifySessionToken } from '@/lib/auth';

const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/ingestao/',
  '/api/agente/',
];

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const lowerPath = pathname.toLowerCase();

  // Bloqueia qualquer acesso direto a arquivos de configuração locais dentro de public/agente/
  if (
    lowerPath.startsWith('/agente/') &&
    lowerPath.includes('config') &&
    lowerPath !== '/agente/config.example.ps1'
  ) {
    return withSecurityHeaders(
      NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    );
  }

  // Proteção centralizada das rotas administrativas e de dados da API
  if (pathname.startsWith('/api/')) {
    const isPublicOrAgentApi = PUBLIC_API_PREFIXES.some((prefix) =>
      pathname.startsWith(prefix)
    );

    if (!isPublicOrAgentApi) {
      const token = request.cookies.get(COOKIE_NAME)?.value;
      if (!token) {
        return withSecurityHeaders(
          NextResponse.json({ error: 'Não autorizado. Faça login.' }, { status: 401 })
        );
      }
      const { valid } = await verifySessionToken(token);
      if (!valid) {
        return withSecurityHeaders(
          NextResponse.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 })
        );
      }
    }
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    '/api/:path*',
    '/agente/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};


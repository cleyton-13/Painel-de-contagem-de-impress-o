import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'spx_auth_token';
const DEFAULT_SECRET = 'spx_seguranca_chave_mestra_dashboard_2026_bi';

function getSecretKey() {
  const secret = process.env.ADMIN_JWT_SECRET || process.env.INGESTAO_API_KEY || DEFAULT_SECRET;
  return new TextEncoder().encode(secret.padEnd(32, '#'));
}

export async function createSessionToken(role: string = 'admin'): Promise<string> {
  const secret = getSecretKey();
  return await new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<{ valid: boolean; role?: string }> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret);
    return { valid: true, role: String(payload.role || 'admin') };
  } catch {
    return { valid: false };
  }
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return false;
    const { valid } = await verifySessionToken(token);
    return valid;
  } catch {
    return false;
  }
}

export function validateAdminPassword(inputPassword: string): boolean {
  const configuredPassword = process.env.PAINEL_ADMIN_PASSWORD || 'spx@2026';
  return inputPassword === configuredPassword;
}

export { COOKIE_NAME };

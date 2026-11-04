import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import crypto from 'crypto';

const COOKIE_NAME = 'spx_auth_token';

// Segredo efêmero por processo caso ADMIN_JWT_SECRET não esteja configurado no ambiente.
// Jamais reutiliza INGESTAO_API_KEY nem uma constante estática previsível.
const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');
let warnedMissingSecret = false;

export function getJwtSecretBytes(): Uint8Array {
  const configured = process.env.ADMIN_JWT_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return new TextEncoder().encode(configured.padEnd(32, '#'));
  }
  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn(
      '[AUTH] Aviso: ADMIN_JWT_SECRET não definido (ou < 16 chars). Usando segredo efêmero em memória — defina ADMIN_JWT_SECRET no .env.local.'
    );
  }
  return new TextEncoder().encode(EPHEMERAL_FALLBACK_SECRET);
}

export async function createSessionToken(role: string = 'admin'): Promise<string> {
  const secret = getJwtSecretBytes();
  return await new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<{ valid: boolean; role?: string }> {
  try {
    const secret = getJwtSecretBytes();
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

export function timingSafeCompare(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function validateAdminPassword(inputPassword: string): boolean {
  const configuredPassword = process.env.PAINEL_ADMIN_PASSWORD?.trim();
  if (!configuredPassword) {
    console.error('[AUTH] PAINEL_ADMIN_PASSWORD não configurada no ambiente. Login bloqueado.');
    return false;
  }
  if (!inputPassword) return false;
  return timingSafeCompare(inputPassword, configuredPassword);
}

export function shouldUseSecureCookie(req?: Request): boolean {
  if (process.env.FORCE_SECURE_COOKIE === 'true') return true;
  if (process.env.FORCE_SECURE_COOKIE === 'false') return false;
  if (!req) return false;
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (proto) return proto === 'https';
  try {
    return new URL(req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export { COOKIE_NAME };

// Rate limiter em memória com proteção contra crescimento ilimitado (DoS de chaves).
type RateLimitRecord = { count: number; resetTime: number };
type RateLimitStore = Map<string, RateLimitRecord>;

const MAX_STORE_SIZE = 5000;
const store: RateLimitStore = new Map();

function pruneStore(now: number) {
  if (store.size < MAX_STORE_SIZE) return;
  for (const [key, val] of store.entries()) {
    if (val.resetTime <= now) store.delete(key);
  }
  // Se ainda estiver cheio, remove as entradas mais antigas na ordem de inserção do Map
  if (store.size >= MAX_STORE_SIZE) {
    const excess = store.size - MAX_STORE_SIZE + 1;
    let removed = 0;
    for (const key of store.keys()) {
      store.delete(key);
      removed += 1;
      if (removed >= excess) break;
    }
  }
}

export function checkRateLimit(
  identifier: string,
  limit: number = 60,
  windowMs: number = 60000
): { success: boolean; limit: number; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = store.get(identifier);

  if (!record || record.resetTime <= now) {
    pruneStore(now);
    const newResetTime = now + windowMs;
    store.set(identifier, { count: 1, resetTime: newResetTime });
    return { success: true, limit, remaining: Math.max(0, limit - 1), resetTime: newResetTime };
  }

  record.count += 1;
  const remaining = Math.max(0, limit - record.count);

  return {
    success: record.count <= limit,
    limit,
    remaining,
    resetTime: record.resetTime,
  };
}

export function getClientIdentifier(req: Request, prefix: string): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = req.headers.get('x-real-ip')?.trim();
  const ip = forwarded || realIp || 'local';
  return `${prefix}:${ip.slice(0, 64)}`;
}

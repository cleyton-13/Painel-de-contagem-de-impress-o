// Um rate limiter simples em memória.
// Em produção com múltiplas instâncias, idealmente usaríamos Redis.
// Como estamos em um servidor único (Next.js Node server), o Map em memória funciona perfeitamente.

type RateLimitStore = Map<string, { count: number; resetTime: number }>;

const store: RateLimitStore = new Map();

export function checkRateLimit(
  identifier: string,
  limit: number = 60, // máximo de requisições
  windowMs: number = 60000 // janela de tempo (ex: 1 minuto)
): { success: boolean; limit: number; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = store.get(identifier);

  // Se não existe ou expirou a janela, cria um novo
  if (!record || record.resetTime < now) {
    const newResetTime = now + windowMs;
    store.set(identifier, { count: 1, resetTime: newResetTime });
    
    // Limpeza de cache antiga (garbage collection passiva)
    if (store.size > 1000) {
       for (const [key, val] of store.entries()) {
           if (val.resetTime < now) store.delete(key);
       }
    }

    return { success: true, limit, remaining: limit - 1, resetTime: newResetTime };
  }

  // Se existe na janela atual, incrementa e verifica
  record.count += 1;
  const remaining = Math.max(0, limit - record.count);

  return {
    success: record.count <= limit,
    limit,
    remaining,
    resetTime: record.resetTime
  };
}

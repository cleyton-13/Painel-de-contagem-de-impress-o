// lib/prisma.ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

declare global {
  var prisma: PrismaClient | undefined;
}

function getDatabaseSchema(): string | undefined {
  const url = process.env.DATABASE_URL || '';
  const match = url.match(/[?&]schema=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function createClient() {
  const schema = getDatabaseSchema();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err) => {
    console.error('[Prisma PG Pool] Erro inesperado em conexão ociosa:', err.message);
  });

  const adapter = new PrismaPg(pool, schema ? { schema } : undefined);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const prisma = globalThis.prisma ?? createClient();
globalThis.prisma = prisma;

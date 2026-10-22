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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool, schema ? { schema } : undefined);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'info'] : ['error'],
  });
}

export const prisma = global.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  // Prevent multiple instances in hot-reload dev environment
  global.prisma = prisma;
}

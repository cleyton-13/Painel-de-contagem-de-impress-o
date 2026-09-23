// lib/prisma.ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

declare global {
  var prisma: PrismaClient | undefined;
}

function createClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
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

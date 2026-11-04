import { defineConfig, type PrismaConfig } from 'prisma/config';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

config({ path: '.env.local' });
config({ path: '.env' });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000 });
pool.on('error', (err) => {
  console.error('[Prisma Config Pool] Erro de conexão:', err.message);
});
const adapter = new PrismaPg(pool);

const configInput = {
  schema: './prisma/schema.prisma',
  datasource: {
    url: connectionString,
  },
  client: {
    output: '../node_modules/@prisma/client',
    adapter,
  },
} as PrismaConfig & { client: { output: string; adapter: unknown } };

export default defineConfig(configInput);

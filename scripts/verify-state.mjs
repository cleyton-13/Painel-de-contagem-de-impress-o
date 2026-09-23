import { Pool } from 'pg';
import { readFileSync } from 'fs';

const envPath = './.env.local';
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const r = await pool.query(`
  SELECT serial, modelo, "preExistente", "leituraReferenciaPB", "leituraReferenciaColor", "quebraPorTipoIndisponivel"
  FROM "Impressora"
  ORDER BY serial
`);
console.log('=== Estado das impressoras ===');
for (const row of r.rows) {
  console.log(row.serial + ' | preEx=' + row.preExistente + ' | refPB=' + row.leituraReferenciaPB + ' | refCol=' + row.leituraReferenciaColor + ' | quebra=' + row.quebraPorTipoIndisponivel);
}

await pool.end();

const pkg = require('pg');
const { readFileSync } = require('fs');

const envContent = readFileSync('.env.local', 'utf-8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !(m[1] in process.env)) {
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

async function main() {
  const { Pool } = pkg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const r = await pool.query(`
    SELECT l."dataHora", l."paginasPB", l."paginasColor", l."paginasTotal", l."status", l."resetPlaca", l."createdAt"
    FROM "LeituraImpressora" l
    JOIN "Impressora" i ON i.id = l."impressoraId"
    WHERE i.serial = 'AA2K011016024'
    ORDER BY l."dataHora" ASC
  `);

  console.log('=== Leituras brutas AA2K011016024 (Impressora Recepção) ===');
  console.log('Total leituras:', r.rows.length);
  for (const row of r.rows) {
    console.log(row.dataHora.toISOString().slice(0, 10), row.dataHora.toISOString().slice(11, 16), '| PB=' + row.paginasPB, '| Color=' + row.paginasColor, '| Total=' + row.paginasTotal, '| status=' + row.status, '| reset=' + row.resetPlaca);
  }

  console.log('\n=== Diferenças leitura a leitura (delta) ===');
  let prev = null;
  for (const row of r.rows) {
    if (prev) {
      console.log(row.dataHora.toISOString().slice(0, 10), row.dataHora.toISOString().slice(11, 16), '| deltaPB=' + (row.paginasPB - prev.paginasPB), '| deltaColor=' + (row.paginasColor - prev.paginasColor), '| deltaTotal=' + (row.paginasTotal - prev.paginasTotal));
    }
    prev = row;
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
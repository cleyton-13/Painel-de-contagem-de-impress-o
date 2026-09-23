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
    SELECT i.serial, i.modelo, l."dataHora", l."paginasTotal", l."paginasPB", l."paginasColor", l."resetPlaca", l."status"
    FROM "LeituraImpressora" l
    JOIN "Impressora" i ON i.id = l."impressoraId"
    ORDER BY l."dataHora" ASC, i.serial
  `);

  console.log('=== TODAS as leituras brutas (por data, por impressora) ===');
  let curSerial = null;
  let prev = null;
  for (const row of r.rows) {
    if (row.serial !== curSerial) {
      console.log('\n--- ' + row.serial + ' (' + row.modelo + ') ---');
      curSerial = row.serial;
      prev = null;
    }
    const dt = row.dataHora.toISOString();
    const dT = prev ? row.paginasTotal - prev.paginasTotal : null;
    const dPB = prev ? row.paginasPB - prev.paginasPB : null;
    const dCol = prev ? row.paginasColor - prev.paginasColor : null;
    console.log(
      dt.slice(0, 10) + ' ' + dt.slice(11, 16),
      '| Total=' + row.paginasTotal,
      '| PB=' + row.paginasPB,
      '| Color=' + row.paginasColor,
      '| dTotal=' + dT,
      '| dPB=' + dPB,
      '| dCol=' + dCol,
      '| reset=' + row.resetPlaca,
      '| st=' + row.status
    );
    prev = row;
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
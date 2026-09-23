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

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(
  'UPDATE "Impressora" SET "preExistente"=false, "leituraReferenciaPB"=NULL, "leituraReferenciaColor"=NULL WHERE serial=$1',
  ['AAJT011201762']
).then(r => {
  console.log('Reset OK - rows affected:', r.rowCount);
  return pool.end();
}).catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});

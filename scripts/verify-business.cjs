const http = require('http');

function callApi(path) {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3000' + path, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    req.on('error', reject);
  });
}

(async () => {
  console.log('=== TEST: /api/contagem-diaria (full) ===');
  let data = await callApi('/api/contagem-diaria');
  console.log('Status:', data.status);
  console.log('Body type:', Array.isArray(data.body) ? 'array' : typeof data.body);
  if (Array.isArray(data.body)) {
    console.log('Total entries:', data.body.length);
    for (const d of data.body) {
      console.log('  Keys:', Object.keys(d));
      console.log('  Data:', JSON.stringify(d));
    }
  } else {
    console.log('Body:', JSON.stringify(data.body).slice(0, 500));
  }

  console.log('\n=== TEST: /api/dashboard ===');
  let dash = await callApi('/api/dashboard');
  console.log('Status:', dash.status);
  console.log('Top keys:', Object.keys(dash.body));
  for (const k of Object.keys(dash.body)) {
    const v = dash.body[k];
    if (Array.isArray(v)) {
      console.log(`  ${k}: array(${v.length})`);
      if (v.length > 0) {
        console.log('    sample:', JSON.stringify(v[0]).slice(0, 300));
      }
    } else if (typeof v === 'object' && v !== null) {
      console.log(`  ${k}: ${JSON.stringify(v).slice(0, 300)}`);
    } else {
      console.log(`  ${k}: ${v}`);
    }
  }

  console.log('\n=== TEST: /api/impressoras PATCH ===');
  const orig = await callApi('/api/impressoras');
  const target = orig.body.find(i => i.serial === 'AAJT011201762');
  console.log('Before PATCH:', JSON.stringify({ serial: target.serial, preExistente: target.preExistente, refPB: target.leituraReferenciaPB }));

  const req = http.request({
    hostname: 'localhost', port: 3000, path: '/api/impressoras', method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
  }, (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      console.log('PATCH Status:', res.statusCode);
      console.log('PATCH Response:', d);
    });
  });
  const payload = {
    serial: 'AAJT011201762',
    preExistente: false,
    leituraReferenciaPB: 195997,
    leituraReferenciaColor: 0
  };
  req.write(JSON.stringify(payload));
  req.end();

  await new Promise(r => setTimeout(r, 1000));
})();

const http = require('http');

function callApi(path) {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3000' + path, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
  });
}

(async () => {
  console.log('=== TEST: /api/impressoras ===');
  let res = await callApi('/api/impressoras');
  console.log('Status:', res.status);
  let data = JSON.parse(res.body);
  console.log('Total impressoras:', data.length);
  for (const d of data.slice(0, 12)) {
    console.log(`  ${d.serial} | preEx=${d.preExistente} | refPB=${d.leituraReferenciaPB} | refCol=${d.leituraReferenciaColor} | quebra=${d.quebraPorTipoIndisponivel}`);
  }

  console.log('\n=== TEST: /api/contagem-diaria ===');
  res = await callApi('/api/contagem-diaria');
  console.log('Status:', res.status);
  data = JSON.parse(res.body);
  console.log('Total linhas:', data.length);
  // Show AA2K011016444 (quebra) and AAJT011201762 (nova)
  for (const d of data) {
    if (d.serial && ['AA2K011016444', 'AAJT011201762'].includes(d.serial)) {
      console.log(`  ${d.serial} | data=${d.data} | pb=${d.paginasPB} | col=${d.paginasColor} | total=${d.paginasTotal}`);
    }
  }

  console.log('\n=== TEST: /api/dashboard ===');
  res = await callApi('/api/dashboard');
  console.log('Status:', res.status);
  let dash = JSON.parse(res.body);
  if (Array.isArray(dash.timeline)) {
    console.log('Timeline entries:', dash.timeline.length);
  } else if (dash.timeline && typeof dash.timeline === 'object') {
    console.log('Timeline keys:', Object.keys(dash.timeline).slice(0, 5));
  }

  console.log('\n=== TEST: /api/impressoras PATCH (config) ===');
  res = await callApi('/api/impressoras');
  console.log('Status:', res.status);
  console.log('Done.');
})();

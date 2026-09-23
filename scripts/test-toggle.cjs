const http = require('http');

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: 'localhost', port: 3000, path, method,
      headers: payload ? { 'Content-Type': 'application/json' } : {},
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, body: { raw: d } }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

(async () => {
  let cfg = await req('GET', '/api/configuracao');
  console.log('1. GET /api/configuracao -> somenteTotal =', cfg.body.somenteTotal);

  let antes = await req('GET', '/api/contagem-diaria');
  const antesTotal = antes.body.reduce((a, b) => a + (b.totalPeriodo || 0), 0);
  console.log('2. Contagem ANTES -> totalPeriodo soma =', antesTotal);
  for (const i of antes.body.slice(0, 3)) console.log('   ', i.serial, '=', i.paginasPBDia + '/' + i.paginasColorDia + '/' + i.totalPeriodo);

  const dashAntes = await req('GET', '/api/dashboard');
  console.log('3. KPIs ANTES: total=', dashAntes.body.kpis.totalImpresso, 'PB=', dashAntes.body.kpis.totalPB, 'Col=', dashAntes.body.kpis.totalColor, 'custo=', dashAntes.body.kpis.custoTotal);

  const ativa = await req('PATCH', '/api/configuracao', { somenteTotal: true });
  console.log('4. PATCH somenteTotal=true ->', ativa.body.somenteTotal);

  let depois = await req('GET', '/api/contagem-diaria');
  const depoisTotal = depois.body.reduce((a, b) => a + (b.totalPeriodo || 0), 0);
  console.log('5. Contagem COM modo: totalPeriodo.soma =', depoisTotal);
  for (const i of depois.body.slice(0, 3)) console.log('   ', i.serial, 'PB', i.paginasPBDia + '/' + i.paginasColorDia + '/' + i.totalPeriodo);

  const dashDepois = await req('GET', '/api/dashboard');
  console.log('6. KPIs COM modo: total=', dashDepois.body.kpis.totalImpresso, 'PB=', dashDepois.body.kpis.totalPB, 'Col=', dashDepois.body.kpis.totalColor, 'custo=', dashDepois.body.kpis.custoTotal);

  const desativa = await req('PATCH', '/api/configuracao', { somenteTotal: false });
  console.log('7. PATCH somenteTotal=false ->', desativa.body.somenteTotal);
})();
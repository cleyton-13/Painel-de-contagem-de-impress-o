// ============================================================
// server.js - Painel de Impressoras BI
//
// Escuta EM DUAS PORTAS ao mesmo tempo:
//  - HTTP  : porta 3000 (usada pelo dominio spx-hub.spximagem.com.br
//            e pelos agentes via http://spx-hub.spximagem.com.br:3000)
//  - HTTPS : porta 3443 (acesso interno/seguro opcional)
//
// CERTIFICADO (HTTPS):
//  - Se existirem cert/fullchain.pem + cert/privkey.pem (Let's Encrypt
//    / dominio real) -> usa o certificado REAL.
//  - Senao, usa cert/painel.pfx + cert/senha.txt (auto-assinado gerado
//    por GERAR_CERTIFICADO.ps1).
//  - Para trocar por um dominio: basta substituir os arquivos na pasta
//    "cert" e reiniciar o servidor (nenhuma alteracao de codigo).
//
// OBS: executa com o build webpack (npm run build) por conta do caminho
// de rede compartilhado.
// ============================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const next = require('next');

process.env.NODE_ENV = 'production';

function criarOptionsCert(certDir) {
  const fullchain = path.join(certDir, 'fullchain.pem');
  const privkey = path.join(certDir, 'privkey.pem');
  if (fs.existsSync(fullchain) && fs.existsSync(privkey)) {
    return {
      tipo: 'dominio',
      options: { key: fs.readFileSync(privkey), cert: fs.readFileSync(fullchain) },
    };
  }
  const pfxPath = path.join(certDir, 'painel.pfx');
  const senhaPath = path.join(certDir, 'senha.txt');
  if (fs.existsSync(pfxPath) && fs.existsSync(senhaPath)) {
    return {
      tipo: 'auto-assinado',
      options: {
        pfx: fs.readFileSync(pfxPath),
        passphrase: fs.readFileSync(senhaPath, 'utf8').trim(),
      },
    };
  }
  return null;
}

async function main() {
  const app = next({ dev: false, dir: __dirname, conf: { distDir: '.next' } });
  const handle = app.getRequestHandler();
  await app.prepare();

  const portHttp = parseInt(process.env.PORT || '3000', 10);
  const portHttps = parseInt(process.env.PORT_HTTPS || '3443', 10);
  const host = process.env.HOST || '0.0.0.0';
  const certDir = path.join(__dirname, 'cert');

  // --- HTTP (porta 3000) ---
  const httpServer = http.createServer((req, res) => handle(req, res));
  httpServer.listen(portHttp, host, () => {
    console.log(`[server.js] HTTP  : http://${host}:${portHttp}  (agentes/dominio spx-hub)`);
    console.log(`[server.js] Acesse: http://spx-hub.spximagem.com.br:${portHttp}`);
  });

  // --- HTTPS (porta 3443, opcional) ---
  let httpsServer = null;
  const cert = criarOptionsCert(certDir);
  if (cert && cert.options) {
    httpsServer = https.createServer(cert.options, (req, res) => handle(req, res));
    httpsServer.listen(portHttps, host, () => {
      console.log(`[server.js] HTTPS : https://${host}:${portHttps}  (interno, cert ${cert.tipo})`);
    });
  } else {
    console.log('[server.js] ATENCAO: sem certificado em "cert". HTTPS desabilitado (roda somente HTTP).');
  }

  const shutdown = () => {
    console.log('[server.js] Encerrando...');
    httpServer.close(() => {
      if (httpsServer) httpsServer.close(() => process.exit(0));
      else process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[server.js] Falha ao iniciar:', err);
  process.exit(1);
});
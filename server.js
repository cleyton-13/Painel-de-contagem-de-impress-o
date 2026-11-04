// ============================================================
// server.js - Painel de Impressoras BI (Produção Enterprise)
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
  const app = next({ dev: false, dir: __dirname });
  const handle = app.getRequestHandler();
  await app.prepare();

  const portHttp = parseInt(process.env.PORT || '3000', 10);
  const portHttps = parseInt(process.env.PORT_HTTPS || '3443', 10);
  const host = process.env.HOST || '0.0.0.0';
  const certDir = path.join(__dirname, 'cert');

  // --- Servidor HTTP ---
  const httpServer = http.createServer((req, res) => handle(req, res));
  httpServer.listen(portHttp, host, () => {
    console.log(`[server.js] HTTP  : http://${host}:${portHttp}`);
  });

  // --- Servidor HTTPS (opcional) ---
  let httpsServer = null;
  const cert = criarOptionsCert(certDir);
  if (cert && cert.options) {
    httpsServer = https.createServer(cert.options, (req, res) => handle(req, res));
    httpsServer.listen(portHttps, host, () => {
      console.log(`[server.js] HTTPS : https://${host}:${portHttps} (${cert.tipo})`);
    });
  }

  let isShuttingDown = false;
  const shutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('[server.js] Encerrando conexões de forma graciosa...');

    const forceTimer = setTimeout(() => {
      console.warn('[server.js] Forçando encerramento após timeout.');
      process.exit(0);
    }, 5000);

    const closeHttp = new Promise((resolve) => {
      if (httpServer.closeAllConnections) httpServer.closeAllConnections();
      httpServer.close(() => resolve());
    });

    const closeHttps = new Promise((resolve) => {
      if (!httpsServer) return resolve();
      if (httpsServer.closeAllConnections) httpsServer.closeAllConnections();
      httpsServer.close(() => resolve());
    });

    Promise.all([closeHttp, closeHttps]).then(() => {
      clearTimeout(forceTimer);
      console.log('[server.js] Servidor encerrado com sucesso.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[server.js] Falha ao iniciar:', err);
  process.exit(1);
});

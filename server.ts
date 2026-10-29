/**
 * Main application server (run it on the teacher's computer).
 * Serves the game over HTTP and runs the authoritative WebSocket game server on the same port.
 * Everybody on the same Wi-Fi opens http://<teacher-ip>:<port> in a browser.
 */

import http from 'http';
import os from 'os';
import path from 'path';
import express from 'express';
import { setupGameServer } from './server/index.js';

const START_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_TRIES = 10; // if the port is taken (another app), try the next ones
let port = START_PORT;
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

/** Private IPv4 addresses of this computer, Wi-Fi style addresses first. */
function getLanAddresses(): string[] {
  const found: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) found.push(a.address);
    }
  }
  const rank = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  return found.sort((a, b) => rank(a) - rank(b));
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  setupGameServer(server);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: Date.now() });
  });

  // The lobby shows this address (and a QR code) so students know where to connect
  app.get('/api/info', (_req, res) => {
    res.json({ port, addresses: getLanAddresses() });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const listen = (attempt: number) => {
    port = START_PORT + attempt;
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('error', onError);
      if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_TRIES) {
        console.log(`A(z) ${port} port foglalt, megpróbálom a(z) ${port + 1}-et...`);
        listen(attempt + 1);
      } else {
        console.error('Szerverhiba:', err);
        process.exit(1);
      }
    };
    server.on('error', onError);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', onError);
      console.log('\n=== Fizika Bomberman szerver fut ===');
      console.log(`Ezen a gépen:   http://localhost:${port}`);
      const lan = getLanAddresses();
      if (lan.length === 0) console.log('Nem találtam Wi-Fi/LAN címet. Csatlakozz a hálózathoz!');
      for (const ip of lan) console.log(`Diákoknak:      http://${ip}:${port}`);
      console.log('Leállítás: Ctrl+C\n');
    });
  };
  listen(0);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'db.json');

function localJsonStoragePlugin() {
  const clients = new Set();
  let dbVersion = Date.now();

  const handleMiddleware = (req, res, next) => {
    // SSE Endpoint for real-time live sync across clients on LAN
    if (req.url === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(`data: ${JSON.stringify({ type: 'connected', version: dbVersion })}\n\n`);
      clients.add(res);

      req.on('close', () => {
        clients.delete(res);
      });
      return;
    }

    // Quick version check endpoint
    if (req.url === '/api/db-version' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('X-DB-Version', String(dbVersion));
      return res.end(JSON.stringify({ version: dbVersion }));
    }

    // Read JSON File from Disk
    if (req.url === '/api/db' && req.method === 'GET') {
      try {
        if (!fs.existsSync(DB_FILE)) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('X-DB-Version', String(dbVersion));
          return res.end(JSON.stringify({}));
        }
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-DB-Version', String(dbVersion));
        return res.end(data);
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    // Write JSON File to Disk
    if (req.url === '/api/db' && req.method === 'POST') {
      const senderClientId = req.headers['x-client-id'] || '';
      const chunks = [];
      req.on('data', chunk => {
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
          }
          const body = Buffer.concat(chunks).toString('utf-8');
          const parsed = JSON.parse(body);
          fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
          dbVersion = Date.now();

          // Broadcast update event to all connected SSE clients
          const eventMsg = `data: ${JSON.stringify({ type: 'db-updated', version: dbVersion, sender: senderClientId })}\n\n`;
          for (const client of clients) {
            try {
              client.write(eventMsg);
            } catch (err) {
              clients.delete(client);
            }
          }

          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('X-DB-Version', String(dbVersion));
          return res.end(JSON.stringify({ success: true, version: dbVersion, message: 'db.json dosyasına yazıldı' }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          return res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    next();
  };

  return {
    name: 'local-json-storage-plugin',
    configureServer(server) {
      server.middlewares.use(handleMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleMiddleware);
    }
  };
}

export default defineConfig({
  plugins: [localJsonStoragePlugin()],
  server: {
    host: '0.0.0.0',   // Tüm ağ arayüzlerinde dinle (LAN erişimi)
    port: 5173,
    strictPort: true,
    allowedHosts: true // Bilgisayar adı (ab00600-2260 vb.) ile LAN erişimine izin ver
  }
});


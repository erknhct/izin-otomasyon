import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'db.json');

function localJsonStoragePlugin() {
  return {
    name: 'local-json-storage-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Read JSON File from Disk
        if (req.url === '/api/db' && req.method === 'GET') {
          try {
            if (!fs.existsSync(DB_FILE)) {
              return res.end(JSON.stringify({}));
            }
            const data = fs.readFileSync(DB_FILE, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            return res.end(data);
          } catch (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }
        }

        // Write JSON File to Disk
        if (req.url === '/api/db' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
              }
              const parsed = JSON.parse(body);
              fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: true, message: 'db.json dosyasına yazıldı' }));
            } catch (err) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [localJsonStoragePlugin()]
});

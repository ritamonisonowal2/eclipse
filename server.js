const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  let reqPath = req.url.split('?')[0].replace(/^\/+/, '');
  if (!reqPath || reqPath === '') reqPath = 'index.html';
  
  const safe = path.normalize(path.join(ROOT, reqPath));
  if (!safe.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  
  fs.readFile(safe, (err, data) => {
    if (err) {
      // If not found and no extension, try adding .html
      if (!path.extname(safe)) {
        const withHtml = safe + '.html';
        if (withHtml.startsWith(ROOT) && fs.existsSync(withHtml)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(fs.readFileSync(withHtml));
          return;
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(safe)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ECLIPSE VERIFY -- ML Prototype');
  console.log('  ==============================');
  console.log('  http://localhost:' + PORT);
  console.log('');
});

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.FOOTBALL_API_KEY || 'd787db101b38462aa876afef3e555ad1';
const API_HOST = 'api.football-data.org';

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Proxy API calls
  if (req.url.startsWith('/api/')) {
    const apiPath = '/v4' + req.url.slice(4);
    const options = {
      hostname: API_HOST,
      path: apiPath,
      headers: { 'X-Auth-Token': API_KEY },
    };

    https.get(options, (apiRes) => {
      let data = '';
      apiRes.on('data', c => data += c);
      apiRes.on('end', () => {
        res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    }).on('error', (err) => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ⚽ FutbolStats server running!`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://0.0.0.0:${PORT}\n`);
});

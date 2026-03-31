const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.FOOTBALL_API_KEY || 'd787db101b38462aa876afef3e555ad1';
const API_HOST = 'api.football-data.org';

// AWS Rekognition config
const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY || '';
const AWS_SECRET_KEY = process.env.AWS_SECRET_KEY || '';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const ODDS_API_KEY = process.env.ODDS_API_KEY || '469b71b8a45248c9e7039776794d4b26';

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// --- AWS Signature V4 ---
function hmac(key, data, encoding) {
  return crypto.createHmac('sha256', key).update(data).digest(encoding);
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function signAWS(method, service, host, uri, body, target) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const dateStamp = amzDate.slice(0, 8);

  const headers = {
    'Content-Type': 'application/x-amz-json-1.1',
    'Host': host,
    'X-Amz-Date': amzDate,
    'X-Amz-Target': target,
  };

  const signedHeaders = Object.keys(headers).map(k => k.toLowerCase()).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(k => `${k.toLowerCase()}:${headers[k].trim()}`).join('\n') + '\n';

  const payloadHash = sha256(body);
  const canonicalRequest = [method, uri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/${AWS_REGION}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');

  let signingKey = hmac(`AWS4${AWS_SECRET_KEY}`, dateStamp);
  signingKey = hmac(signingKey, AWS_REGION);
  signingKey = hmac(signingKey, service);
  signingKey = hmac(signingKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');

  headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

function callRekognition(imageBase64, action, target) {
  return new Promise((resolve, reject) => {
    const host = `rekognition.${AWS_REGION}.amazonaws.com`;
    const body = JSON.stringify({ Image: { Bytes: imageBase64 } });
    const headers = signAWS('POST', 'rekognition', host, '/', body, target);

    const req = https.request({
      hostname: host,
      path: '/',
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(data)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// --- HTTP Server ---
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // AWS Rekognition proxy
  if (req.url === '/recognize' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      if (!AWS_ACCESS_KEY || !AWS_SECRET_KEY) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'no_key', message: 'AWS keys not configured' }));
        return;
      }

      try {
        const { image } = JSON.parse(body);

        // Llamar DetectText y DetectLabels en paralelo
        const [textResult, labelsResult] = await Promise.all([
          callRekognition(image, 'DetectText', 'RekognitionService.DetectText'),
          callRekognition(image, 'DetectLabels', 'RekognitionService.DetectLabels'),
        ]);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          textDetections: textResult.TextDetections || [],
          labels: labelsResult.Labels || [],
        }));
      } catch (err) {
        console.error('Rekognition error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Football API proxy
  if (req.url.startsWith('/api/')) {
    const apiPath = '/v4' + req.url.slice(4);
    https.get({
      hostname: API_HOST,
      path: apiPath,
      headers: { 'X-Auth-Token': API_KEY },
    }, (apiRes) => {
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

  // ESPN API proxy (Liga MX y otras)
  if (req.url.startsWith('/espn/')) {
    const espnPath = req.url.slice(5);
    https.get({
      hostname: 'site.api.espn.com',
      path: espnPath,
      headers: { 'Accept': 'application/json' },
    }, (espnRes) => {
      let data = '';
      espnRes.on('data', c => data += c);
      espnRes.on('end', () => {
        res.writeHead(espnRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    }).on('error', (err) => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // Odds API proxy
  if (req.url.startsWith('/odds/')) {
    const sport = req.url.slice(6).split('?')[0];
    const oddsPath = `/v4/sports/${sport}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=decimal`;
    https.get({
      hostname: 'api.the-odds-api.com',
      path: oddsPath,
      headers: { 'Accept': 'application/json' },
    }, (oddsRes) => {
      let data = '';
      oddsRes.on('data', c => data += c);
      oddsRes.on('end', () => {
        res.writeHead(oddsRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    }).on('error', (err) => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  filePath = path.join(__dirname, filePath);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ⚽ FutbolStats server running on port ${PORT}`);
  console.log(`  Rekognition: ${AWS_ACCESS_KEY ? '✅ configured' : '❌ no AWS keys'}\n`);
});

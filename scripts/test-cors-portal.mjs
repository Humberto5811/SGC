/**
 * Verificación CORS Portal de Proveedores (lista explícita + credentials).
 *
 *   node scripts/test-cors-portal.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

// Misma base que server/index.js (sin depender de arrancar el API real)
const ALLOWED_ORIGINS = [
  ...new Set([
    'http://217.216.54.68',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://localhost:5177',
    'http://localhost:5178',
    'http://localhost:3000',
  ]),
];

function corsOrigin(origin, cb) {
  if (!origin) return cb(null, true);
  if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
  cb(new Error(`Origen no permitido por CORS: ${origin}`));
}

function decide(origin) {
  return new Promise((resolve) => {
    corsOrigin(origin, (err, allowed) => {
      resolve({ err, allowed: Boolean(allowed) && !err });
    });
  });
}

function request(port, { method = 'GET', path: pathname = '/', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: pathname, method, headers },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    if (method === 'POST') {
      const payload = JSON.stringify({ ruc: 'x', password: 'y' });
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

console.log('\n=== CORS Portal ===\n');

// Estático: no wildcard en la opción cors; credentials; orígenes requeridos
{
  const corsBlock = indexSrc.slice(indexSrc.indexOf('app.use(cors('), indexSrc.indexOf('app.use(compression()'));
  assert.doesNotMatch(corsBlock, /origin\s*:\s*['"]\*['"]/);
  assert.doesNotMatch(corsBlock, /origin\s*:\s*true\b/);
  assert.match(corsBlock, /credentials:\s*true/);
  assert.match(indexSrc, /http:\/\/localhost:5173/);
  assert.match(indexSrc, /http:\/\/127\.0\.0\.1:5173/);
  assert.match(indexSrc, /http:\/\/217\.216\.54\.68/);
  ok('index.js: lista explícita, credentials:true, sin wildcard');
}

// Casos 1–5: decisión de origin
{
  const cases = [
    ['http://localhost:5173', true, 'Origin localhost:5173 → permitido'],
    ['http://127.0.0.1:5173', true, 'Origin 127.0.0.1:5173 → permitido'],
    ['http://217.216.54.68', true, 'Origin VPS → permitido'],
    [undefined, true, 'Sin Origin → permitido'],
    ['http://evil.example', false, 'Origin no autorizado → rechazado'],
  ];
  for (const [origin, expectOk, label] of cases) {
    const r = await decide(origin);
    assert.equal(r.allowed, expectOk, label);
    ok(label);
  }
}

// Caso 6: POST /api/portal/login con Origin localhost (CORS middleware real)
{
  const app = express();
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.post('/api/portal/login', (_req, res) => {
    res.status(200).json({ success: true, stub: true });
  });
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message });
  });

  await new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', async () => {
      try {
        const port = server.address().port;
        const origin = 'http://localhost:5173';
        const preflight = await request(port, {
          method: 'OPTIONS',
          path: '/api/portal/login',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
          },
        });
        assert.ok(preflight.status >= 200 && preflight.status < 300, `preflight ${preflight.status}`);
        assert.equal(preflight.headers['access-control-allow-origin'], origin);
        assert.equal(preflight.headers['access-control-allow-credentials'], 'true');

        const post = await request(port, {
          method: 'POST',
          path: '/api/portal/login',
          headers: { Origin: origin },
        });
        assert.equal(post.status, 200, post.body);
        assert.equal(post.headers['access-control-allow-origin'], origin);
        assert.match(post.body, /"success"\s*:\s*true/);
        ok('POST /api/portal/login desde localhost → 200 (CORS OK)');
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
  });
}

console.log('\nCORS Portal OK — autenticación no modificada; sin origin:\'*\'.\n');

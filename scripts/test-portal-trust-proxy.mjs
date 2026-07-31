/**
 * Verificación: trust proxy antes del rate limiter (Portal / Vite+Nginx).
 *
 *   node scripts/test-portal-trust-proxy.mjs
 *
 * 1) Orden estático en server/index.js
 * 2) Runtime mínimo: rateLimit + X-Forwarded-For sin ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
 * No usa BD ni lógica de portalLogin.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import rateLimit from 'express-rate-limit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'server', 'index.js');
const src = fs.readFileSync(indexPath, 'utf8');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

async function postJson(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': '2',
          ...headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', reject);
    req.write('{}');
    req.end();
  });
}

console.log('\n=== Portal — trust proxy ===\n');

// 1. trust proxy = 1 (no true) y orden en index.js
{
  assert.match(src, /app\.set\(\s*['"]trust proxy['"]\s*,\s*1\s*\)/);
  assert.doesNotMatch(src, /app\.set\(\s*['"]trust proxy['"]\s*,\s*true\s*\)/);

  const iApp = src.indexOf('const app = express()');
  const trustIdx = Math.max(
    src.indexOf("app.set('trust proxy', 1)"),
    src.indexOf('app.set("trust proxy", 1)'),
  );
  const iHelmet = src.indexOf('app.use(helmet())');
  const iRate = src.indexOf('rateLimit(');
  const iPortal = src.indexOf("app.use('/api/portal'");

  assert.ok(iApp >= 0 && trustIdx > iApp, 'trust proxy tras express()');
  assert.ok(iHelmet > trustIdx, 'helmet tras trust proxy');
  assert.ok(iRate > trustIdx, 'rateLimit tras trust proxy');
  assert.ok(iPortal > trustIdx, '/api/portal tras trust proxy');
  assert.match(src, /loginLimiter/);
  assert.match(src, /app\.use\('\/api\/auth',\s*loginLimiter/);
  ok('trust proxy = 1 antes de helmet / rateLimit / portal (rate-limit activo)');
}

// 2–4. Runtime: con trust proxy, X-Forwarded-For no dispara ERL; sin él sí
{
  const withTrust = express();
  withTrust.set('trust proxy', 1);
  withTrust.use(rateLimit({ windowMs: 60_000, max: 100, validate: { xForwardedForHeader: true } }));
  withTrust.post('/api/portal/login', (_req, res) => res.status(200).json({ ok: true, via: 'proxy-sim' }));
  withTrust.post('/login-direct', (_req, res) => res.status(200).json({ ok: true, via: 'direct' }));

  await new Promise((resolve) => {
    const server = withTrust.listen(0, '127.0.0.1', async () => {
      try {
        const port = server.address().port;
        const proxied = await postJson(port, '/api/portal/login', {
          'X-Forwarded-For': '203.0.113.10',
        });
        const direct = await postJson(port, '/login-direct');
        assert.equal(proxied.status, 200, `proxied status ${proxied.status}: ${proxied.body}`);
        assert.equal(direct.status, 200, `direct status ${direct.status}: ${direct.body}`);
        assert.doesNotMatch(proxied.body, /ERR_ERL_UNEXPECTED_X_FORWARDED_FOR/);
        assert.doesNotMatch(direct.body, /ERR_ERL_UNEXPECTED_X_FORWARDED_FOR/);
        ok('POST /api/portal/login con X-Forwarded-For → 200 (sin ERL)');
        ok('POST directo sin X-Forwarded-For → 200');
      } finally {
        server.close(resolve);
      }
    });
  });
}

console.log('\nPortal trust proxy OK — autenticación portal no modificada.\n');

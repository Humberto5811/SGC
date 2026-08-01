/**
 * Payload cotización Portal — sin binarios (anti-413).
 *
 *   node scripts/test-portal-cotizacion-payload.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPortalCotizacionPayload,
  sanitizePortalCotizacionPayload,
  sanitizePortalAdjuntoMeta,
  measurePayloadBytes,
  payloadContainsBinary,
  assertPortalPayloadSafe,
  MAX_SAFE_JSON_BYTES,
} from '../src/utils/portalCotizacionPayload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function fakeBase64(kb) {
  return 'A'.repeat(Math.max(16, kb * 1024));
}

console.log('Portal cotización payload (anti-413)\n');

const fatAnexos = {
  docs_solicitados: Array.from({ length: 7 }, (_, i) => ({
    key: `doc-${i}-Anexo 0${i + 9}`,
    documento: `Anexo 0${i + 9}`,
    nombre: `ANEXO_${i + 9}.docx`,
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    contenido_base64: fakeBase64(1200), // ~1.2MB texto c/u
  })),
  requisitos: [
    { key: 'req-0-x', nombre: 'req.pdf', mime_type: 'application/pdf', base64: fakeBase64(800) },
    { key: 'req-1-y', nombre: 'req2.pdf', mime_type: 'application/pdf', dataUrl: `data:application/pdf;base64,${fakeBase64(100)}` },
  ],
  anexo_tecnico_firmado: {
    nombre: 'Anexo_06-A.pdf',
    contenido_base64: fakeBase64(2000),
    file: { name: 'x.pdf' },
  },
  anexo_economico_firmado: {
    nombre: 'Anexo_11.pdf',
    base64: fakeBase64(2000),
    blob: 'nope',
  },
  datos_proveedor: { razon_social: 'ACME SAC', ruc: '20123456789' },
};

const fatBody = {
  solicitud_id: 99,
  propuesta_tecnica: { plazo_ejecucion: '30 días', forma_pago: 'Según TDR' },
  propuesta_economica: {
    entregables_cotizados: [
      { numero: 1, nombre: 'E1', precio: 2500 },
      { numero: 2, nombre: 'E2', precio: 3500 },
    ],
    precio_total: 6000,
    datos_proveedor: { representante_legal: 'Juan' },
  },
  anexos: fatAnexos,
};

const beforeBytes = measurePayloadBytes(fatBody);
console.log(`  · Tamaño ANTES (simulado embebido): ${beforeBytes} bytes (~${(beforeBytes / 1e6).toFixed(1)} MB)`);
assert.ok(beforeBytes > 1_000_000, 'fixture debe ser grande');

const light = buildPortalCotizacionPayload(fatBody);
const afterBytes = measurePayloadBytes(light);
console.log(`  · Tamaño DESPUÉS (normalizado): ${afterBytes} bytes`);

// A–E
assert.equal(payloadContainsBinary(light).length, 0);
ok('A. Payload sin contenido binario (7 anexos + PDFs + 06-A + 11)');

assert.ok(!JSON.stringify(light).includes('contenido_base64'));
ok('B. No existe contenido_base64');

assert.ok(!JSON.stringify(light).includes('data:'));
ok('C. No hay strings data:');

assert.equal(payloadContainsBinary(light).length, 0);
ok('D. Sin File/Blob/Buffer/ArrayBuffer detectables');

assert.ok(afterBytes < MAX_SAFE_JSON_BYTES, `E. JSON < 1MB (actual ${afterBytes})`);
ok(`E. JSON final ${afterBytes} bytes < 1 MB`);

assertPortalPayloadSafe(light);
ok('assertPortalPayloadSafe pasa');

// Metadatos conservados
assert.equal(light.anexos.docs_solicitados.length, 7);
assert.ok(light.anexos.docs_solicitados[0].nombre || light.anexos.docs_solicitados[0].nombre_archivo);
assert.equal(light.anexos.datos_proveedor.razon_social, 'ACME SAC');
ok('Metadatos funcionales conservados');

// L. Datos antiguos: se leen (sanitize meta) y al guardar se omiten binarios
const old = sanitizePortalAdjuntoMeta({
  key: 'doc-0',
  nombre: 'viejo.docx',
  adjunto_id: 55,
  contenido_base64: fakeBase64(500),
});
assert.equal(old.adjunto_id, 55);
assert.equal(old.contenido_base64, undefined);
ok('L. Antiguo con base64 → meta con adjunto_id, sin base64');

const alias = sanitizePortalCotizacionPayload(fatBody);
assert.equal(measurePayloadBytes(alias), afterBytes);
ok('Alias sanitizePortalCotizacionPayload = buildPortalCotizacionPayload');

// Código FE/BE
{
  const view = fs.readFileSync(path.join(root, 'src/views/proveedor/misCotizacionesView.js'), 'utf8');
  assert.match(view, /buildPortalCotizacionPayload/);
  assert.match(view, /uploadCotizacionAdjunto|uploadAdjuntoToPortal/);
  assert.match(view, /migrateEmbeddedAdjuntosIfNeeded/);
  assert.match(view, /assertPortalPayloadSafe/);
  ok('H. Presentar/guardar usan normalizador + subida');

  const svc = fs.readFileSync(path.join(root, 'src/services/portalService.js'), 'utf8');
  assert.match(svc, /uploadCotizacionAdjunto/);
  assert.match(svc, /archivos embebidos/);
  ok('Mensaje 413 claro en portalService');

  const routes = fs.readFileSync(path.join(root, 'server/routes/portal.js'), 'utf8');
  assert.match(routes, /cotizaciones\/:solicitudId\/adjuntos/);
  ok('Endpoint POST /cotizaciones/:solicitudId/adjuntos');

  const be = fs.readFileSync(path.join(root, 'server/lib/portalProveedores.js'), 'utf8');
  assert.match(be, /prepareCotizacionPortalBody/);
  ok('Backend sanea borrador/presentación');

  const mig = fs.readFileSync(path.join(root, 'server/migrations/039_cotizacion_portal_adjuntos.js'), 'utf8');
  assert.match(mig, /cotizaciones_proveedor_adjuntos/);
  ok('Migración 039 tabla de adjuntos');
}

// K. Multitipo (mismo payload builder)
{
  ['Bienes', 'Servicios', 'Locadores'].forEach((tipo) => {
    const p = buildPortalCotizacionPayload({
      ...fatBody,
      propuesta_tecnica: { ...fatBody.propuesta_tecnica, tipo },
    });
    assert.ok(measurePayloadBytes(p) < MAX_SAFE_JSON_BYTES);
  });
  ok('K. Bienes / Servicios / Locación — mismo normalizador');
}

console.log('\nResumen tamaño:');
console.log(`  Antes:  ${beforeBytes} bytes`);
console.log(`  Después:${afterBytes} bytes`);
console.log(`  Reducción: ${((1 - afterBytes / beforeBytes) * 100).toFixed(2)}%`);
console.log('\nOK — test-portal-cotizacion-payload\n');

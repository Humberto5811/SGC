/**
 * RC — Payload ligero Documentos SC (sin base64 / File / Blob).
 *
 *   node scripts/test-sc-documentos-payload.mjs
 *   node scripts/test-sc-requisitos-personalizados.mjs
 */
import assert from 'node:assert/strict';
import {
  sanitizeDocSolicitado,
  sanitizeReqTecnico,
  buildSolicitudCotizacionUpdatePayload,
  sanitizeSolicitudCotizacionPayload,
  measureJsonBytes,
  payloadHasBinaries,
  assertPayloadLight,
} from '../src/utils/solicitudCotizacionPayload.js';

function ok(msg) { console.log(`  ✓ ${msg}`); }

function fakeBase64(kb) {
  return 'A'.repeat(Math.max(1, kb) * 1024);
}

console.log('\n=== SC Documentos — payload ligero ===\n');

// Diagnóstico: tamaño ANTES (simula 7 docs con base64 como el caso 59 MB)
{
  const heavy = {
    docs_solicitados: Array.from({ length: 7 }, (_, i) => ({
      documento: `Doc ${i + 1}`,
      archivo: `archivo${i + 1}.pdf`,
      fecha_registro: '2026-07-31T12:00:00.000Z',
      mime_type: 'application/pdf',
      contenido_base64: fakeBase64(1200), // ~1.2 MB texto c/u → ~8.4 MB total simulado
    })),
    requisitos_tecnicos: [
      { requisito: 'Custom', obligatorio: true, observacion: 'Obs', custom: true, contenido_base64: fakeBase64(100) },
    ],
  };
  const before = measureJsonBytes(heavy);
  const findings = payloadHasBinaries(heavy);
  assert.ok(before > 1024 * 1024, `antes debe ser >1MB (fue ${before})`);
  assert.ok(findings.length > 0, 'debe detectar binarios');
  console.log(`  · tamaño ANTES (simulado 7 docs): ${(before / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  · campo dominante: docs_solicitados[].contenido_base64 (${findings.length} hallazgos)`);
  ok('diagnóstico: contenido_base64 es el campo pesado');
}

// A — 7 docs + requisito personalizado → sin binarios
{
  const state = {
    docsResumen: Array.from({ length: 7 }, (_, i) => ({
      documento: `Anexo ${i + 1}`,
      archivo: `a${i}.docx`,
      archivo_nombre: `a${i}.docx`,
      adjunto_id: 100 + i,
      fecha_registro: '2026-07-31T12:00:00.000Z',
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contenido_base64: fakeBase64(500),
      file: { name: 'x' },
      previewUrl: 'data:application/pdf;base64,AAA',
    })),
    reqResumen: [{
      requisito: 'Req personalizado',
      obligatorio: true,
      observacion: 'Detalle',
      custom: true,
      personalizado: true,
      contenido_base64: fakeBase64(50),
    }],
  };
  const payload = buildSolicitudCotizacionUpdatePayload(state);
  const check = assertPayloadLight(payload, { maxBytes: 1024 * 1024 });
  assert.equal(check.ok, true, JSON.stringify(check.binaries));
  assert.equal(payload.docs_solicitados.length, 7);
  assert.ok(payload.docs_solicitados.every((d) => d.adjunto_id && !d.contenido_base64));
  assert.equal(payload.requisitos_tecnicos[0].observacion, 'Detalle');
  assert.equal(payload.requisitos_tecnicos[0].custom, true);
  console.log(`  · tamaño DESPUÉS: ${check.bytes} bytes`);
  ok('A: 7 documentos + requisito — sin binarios / <1MB');
}

// B — Locadores .docx solo referencias
{
  const payload = sanitizeSolicitudCotizacionPayload({
    docs_solicitados: [{
      documento: 'Anexo 09',
      archivo: 'cv.docx',
      adjunto_id: 55,
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contenido_base64: fakeBase64(800),
    }],
    requisitos_tecnicos: [{ requisito: 'Experiencia', obligatorio: false, observacion: '', custom: true }],
  });
  assert.equal(payload.docs_solicitados[0].adjunto_id, 55);
  assert.equal(payload.docs_solicitados[0].contenido_base64, undefined);
  assert.ok(!JSON.stringify(payload).includes('data:'));
  ok('B: Locadores — solo referencias');
}

// C/D — Bienes / Servicios (shape de guardado)
{
  for (const tipo of ['Bienes', 'Servicios']) {
    const p = buildSolicitudCotizacionUpdatePayload({
      docsResumen: [{ documento: 'Anexo 01', archivo: 'x.pdf', adjunto_id: 1 }],
      reqResumen: [{ requisito: 'R1', obligatorio: true, observacion: '', custom: false }],
      tipo,
    });
    assert.ok(assertPayloadLight(p).ok);
    ok(`${tipo}: payload listo para guardar y continuar`);
  }
}

// E — requisito personalizado conserva campos
{
  const p = buildSolicitudCotizacionUpdatePayload({
    reqResumen: [{
      requisito: 'ISO',
      obligatorio: false,
      observacion: 'Constancia',
      custom: true,
      personalizado: true,
      contenido_base64: 'AAA',
    }],
  });
  const r = p.requisitos_tecnicos[0];
  assert.equal(r.requisito, 'ISO');
  assert.equal(r.obligatorio, false);
  assert.equal(r.observacion, 'Constancia');
  assert.equal(r.custom, true);
  assert.equal(r.contenido_base64, undefined);
  ok('E: requisito personalizado (nombre/obligatorio/obs)');
}

// F — reabrir: sanitize de lo que viene del servidor
{
  const fromDb = sanitizeDocSolicitado({
    documento: 'Doc',
    archivo: 'a.pdf',
    adjunto_id: 9,
    contenido_base64: fakeBase64(200),
    fecha_registro: '2026-01-01',
  });
  assert.equal(fromDb.adjunto_id, 9);
  assert.equal(fromDb.contenido_base64, undefined);
  assert.equal(fromDb.archivo, 'a.pdf');
  ok('F: al reabrir se conservan metadatos/referencias');
}

// G/H/I
{
  const p = buildSolicitudCotizacionUpdatePayload({
    docsResumen: [
      { documento: 'A', archivo: 'a.pdf', adjunto_id: 1, previewUrl: 'data:text/plain;base64,QQ==' },
    ],
    reqResumen: [sanitizeReqTecnico({ requisito: 'X', obligatorio: 'NO', observacion: 'y', custom: true })],
  });
  const text = JSON.stringify(p);
  assert.ok(!text.includes('data:'));
  assert.ok(!text.includes('contenido_base64'));
  assert.ok(measureJsonBytes(p) < 1024 * 1024);
  assert.equal(payloadHasBinaries(p).length, 0);
  ok('G/H/I: <1MB, sin data:, sin binarios');
}

// J — conceptual: payload liviano no dispara 413 por tamaño
{
  const p = buildSolicitudCotizacionUpdatePayload({
    docsResumen: Array.from({ length: 20 }, (_, i) => ({
      documento: `D${i}`, archivo: `f${i}.pdf`, adjunto_id: i + 1,
    })),
  });
  assert.ok(measureJsonBytes(p) < 100_000, '20 docs referenciados deben ser << 100KB');
  ok('J: PUT no incluye archivos completos (imposible 413 por base64)');
}

console.log('\nSC documentos payload OK\n');

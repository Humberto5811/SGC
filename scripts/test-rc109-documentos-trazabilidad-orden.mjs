/**
 * RC109 — Documentos deduplicados + trazabilidad vigente + diseño bandeja OD40.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  documentoDedupKey,
  dedupeDocumentos,
  buildDocsCotizacionAdjudicada,
  consolidateOrdenDocumentos,
} from '../shared/expedienteDocumentos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}

console.log('\n=== RC109 — Documentos / trazabilidad / diseño ===\n');

// A. Diseño
{
  assertFileContains('src/views/contratacion/registroOrdenesView.js', /font-size:\s*10px/, 'Arial 10');
  assertFileContains('src/views/contratacion/registroOrdenesView.js', /font-family:\s*Arial/, 'fuente Arial');
  assertFileContains('src/views/contratacion/registroOrdenesView.js', /<colgroup>/, 'colgroup');
  assertFileContains('src/views/contratacion/registroOrdenesView.js', /CCP<br>firmado/, 'encabezado 2 líneas');
  ok('1-3. Bandeja Arial 10 + colgroup + encabezados 2 líneas');
}

// B. Documentos — dedupe
{
  const fakeCots = [
    {
      id: 9, proveedor_id: 1, razon_social: 'Otro',
      anexos: {
        anexo05a_firmado: { nombre_archivo: 'A.pdf', base64: 'aaa', mime_type: 'application/pdf' },
        anexo_tecnico_firmado: { nombre_archivo: 'A.pdf', base64: 'aaa', mime_type: 'application/pdf' },
        anexo05a: { nombre_archivo: 'A.pdf', base64: 'aaa' },
        anexo05b_firmado: { nombre_archivo: 'B.pdf', base64: 'bbb' },
        anexo_economico_firmado: { nombre_archivo: 'B.pdf', base64: 'bbb' },
      },
    },
    {
      id: 1, proveedor_id: 3, razon_social: 'Adjudicado',
      anexos: {
        anexo05a_firmado: { nombre_archivo: 'AdjA.pdf', base64: 'xxxx', mime_type: 'application/pdf' },
        anexo_tecnico_firmado: { nombre_archivo: 'AdjA.pdf', base64: 'xxxx', mime_type: 'application/pdf' },
        anexo05b_firmado: { nombre_archivo: 'AdjB.pdf', base64: 'yyyy' },
        anexo_economico_firmado: { nombre_archivo: 'AdjB.pdf', base64: 'yyyy' },
        docs_solicitados: [{ nombre_archivo: 'tech.pdf', base64: 'zzzz' }],
      },
    },
  ];
  const docs = buildDocsCotizacionAdjudicada(fakeCots, 3);
  assert.equal(docs.filter((d) => d.tipo === 'Cotización 5-A').length, 1);
  assert.equal(docs.filter((d) => d.tipo === 'Cotización 5-B').length, 1);
  assert.equal(docs[0].proveedor_id, 3);
  assert.equal(docs.find((d) => d.tipo === 'Cotización 5-A').ref, 'anexo05a');
  assert.ok(docs.some((d) => d.ref === 'docs-0'));
  ok('4-7. Dedup 5-A/5-B + solo proveedor adjudicado + ref portal');

  const sameIdTwice = dedupeDocumentos([
    { documentoId: 10, nombre: 'x', origen: 'ORDEN' },
    { documentoId: 10, nombre: 'x-copy', origen: 'ORDEN' },
    { documentoId: 11, nombre: 'y', origen: 'ORDEN' },
  ]);
  assert.equal(sameIdTwice.length, 2);
  ok('5. Mismo documento_id una sola vez');

  const sameNameDiff = dedupeDocumentos([
    { origen: 'COTIZACION', tipo: 'A', registro_origen_id: 1, ref: 'anexo05a', nombre: 'same.pdf', fingerprint: '1' },
    { origen: 'COTIZACION', tipo: 'A', registro_origen_id: 2, ref: 'anexo05a', nombre: 'same.pdf', fingerprint: '2' },
  ]);
  assert.equal(sameNameDiff.length, 2);
  ok('6. Mismo nombre, distinto origen → se conservan');

  const consol = consolidateOrdenDocumentos([
    { id: 1, tipo_documento: 'ORDEN_FIRMADA', version: 1, activo: false, nombre_archivo: 'v1.pdf' },
    { id: 2, tipo_documento: 'ORDEN_FIRMADA', version: 2, activo: true, nombre_archivo: 'v2.pdf' },
  ]);
  assert.equal(consol.length, 1);
  assert.equal(consol[0].id, 2);
  ok('Orden docs: solo versión activa');
}

{
  assertFileContains('server/lib/ordenesContratacion.js', /buildDocsCotizacionAdjudicada/, 'backend usa consolidación');
  assertFileContains('server/lib/ordenesContratacion.js', /proveedor_id = \$2/, 'filtro adjudicado');
  assertFileContains('server/lib/portalDocumentos.js', /anexo05a_firmado|anexo_tecnico_firmado/, 'resolver aliases');
  assertFileContains('src/utils/registroOrdenExpedienteModal.js', /403|404/, 'errores controlados');
  ok('8-12. Visor / portal / errores 403-404');
}

// C. Trazabilidad
{
  assertFileContains('src/utils/registroOrdenExpedienteModal.js', /id="roExpTraza"/, 'botón pie');
  const modal = fs.readFileSync(path.join(root, 'src/utils/registroOrdenExpedienteModal.js'), 'utf8');
  assert.ok(!/roExpTrazaInline/.test(modal), 'sin botón duplicado en pestaña');
  assertFileContains('server/lib/trazabilidad.js', /resolveEstadoExpedienteVigente/, 'estado vigente central');
  assertFileContains('server/lib/trazabilidad.js', /orden_eventos/, 'eventos orden');
  assertFileContains('server/lib/trazabilidad.js', /recepcion_bienes_eventos/, 'eventos recepción');
  assertFileContains('server/lib/trazabilidad.js', /collapseNotificacionDuplicates/, 'colapso reintentos');
  assertFileContains('server/lib/trazabilidad.js', /expediente:\s*\{/, 'contrato expediente');
  ok('13-20. Trazabilidad única + fuentes + estado vigente');
}

// Compat RC104-108
{
  for (const f of [
    'scripts/test-rc104-estado-global-expediente.mjs',
    'scripts/test-rc105-propagacion-estado-tres-bandejas.mjs',
    'scripts/test-rc106-recepcion-bienes-flujo.mjs',
    'scripts/test-rc107-expediente-orden-entrega.mjs',
    'scripts/test-rc108-registro-orden-expediente-cronograma.mjs',
  ]) {
    assert.ok(fs.existsSync(path.join(root, f)), f);
  }
  ok('21. Compatibilidad RC104–RC108');
}

// Smoke OC 717
try {
  const { query } = await import('../server/db.js');
  const pool = (await import('../server/db.js')).default;
  const { getExpedienteOrdenCompleto } = await import('../server/lib/ordenesContratacion.js');
  const { obtenerTrazabilidad } = await import('../server/lib/trazabilidad.js');

  const { rows: ords } = await query(`SELECT id, proveedor_id, requerimiento_id FROM ordenes_contratacion WHERE numero_orden::text LIKE '%717%' LIMIT 1`);
  if (ords[0]) {
    const exp = await getExpedienteOrdenCompleto(ords[0].id);
    const cotDocs = (exp.documentos || []).filter((d) => d.kind === 'cotizacion');
    const a5a = cotDocs.filter((d) => /5-A/i.test(d.tipo));
    const a5b = cotDocs.filter((d) => /5-B/i.test(d.tipo));
    assert.ok(a5a.length <= 1, `5-A únicos, got ${a5a.length}`);
    assert.ok(a5b.length <= 1, `5-B únicos, got ${a5b.length}`);
    assert.ok(cotDocs.every((d) => !d.proveedor_id || Number(d.proveedor_id) === Number(ords[0].proveedor_id)));
    console.log(`  · OC717 docs cotización: ${cotDocs.length} (5-A=${a5a.length}, 5-B=${a5b.length})`);

    const traza = await obtenerTrazabilidad(ords[0].requerimiento_id);
    const est = String(traza.estadoActual || traza.estadoVigente?.codigo || '');
    assert.ok(
      ['RECEPCION_BIENES_PENDIENTE', 'BIEN_RECIBIDO_ALMACEN', 'RECEPCION_BIENES_OBSERVADA', 'CONFORMIDAD_PENDIENTE_AU'].includes(est),
      `estado recepción vigente, got ${est}`,
    );
    assert.match(String(traza.estadoActualTexto || traza.estadoVigente?.label || ''), /recepción|almacén|Conformidad/i);
    assert.match(String(traza.subModuloActual || ''), /Recepción/i);
    assert.ok((traza.historialMovimientos || []).some((m) => /orden_eventos|REGISTRO_ORDEN|ORDEN_/i.test(JSON.stringify(m))));
    assert.ok((traza.historialMovimientos || []).some((m) => /recepcion_bienes|INGRESADA_RECEPCION|RECEPCION_BIENES|RECEPCION_REGISTRADA/i.test(JSON.stringify(m))));
    assert.notEqual(String(traza.estadoActual || '').toUpperCase(), 'CCP');
    ok(`Smoke OC717: docs sin dup + estado ${est}`);
  } else {
    ok('Smoke OC717 omitido (sin orden)');
  }
  await pool.end();
} catch (e) {
  console.log(`  ⚠ Smoke DB: ${e.message}`);
  throw e;
}

console.log('\nRC109 OK\n');

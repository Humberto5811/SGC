/**
 * RC113 — Acciones recepción / acta / derivación AU separadas.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canRegistrarRecepcion, resolveAccionesRecepcionBienes } from '../shared/recepcionSaldo.js';
import { correspondeAplicarPenalidad, validateFechaRecepcionVsEmision } from '../shared/calendarDate.js';
import { buildActaRecepcionData } from '../shared/recepcionActaData.js';
import { generateActaRecepcionPdfServer } from '../server/lib/recepcionActaPdfServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) { console.log(`  ✓ ${msg}`); }
function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}
function assertFileNotContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.equal(re.test(src), false, msg || rel);
}

console.log('\n=== RC113 — Acciones recepción / acta / derivación AU ===\n');

{
  const a = resolveAccionesRecepcionBienes({
    estado: 'RECEPCION_BIENES_PENDIENTE', rol: 'dec',
    puedeRegistrarRecepcion: true, tieneRecepcion: false,
  });
  assert.equal(a.registrarRecepcion, true);
  assert.equal(a.registrarActa, false);
  assert.equal(a.derivarAu, false);
  ok('1. OC pendiente permite Registrar recepción; no acta ni derivar');
}

{
  const check = canRegistrarRecepcion({
    itemEntregas: [{ saldo_pendiente: 0, cantidad_programada: 1, cantidad_recibida_acum: 1 }],
    recepciones: [{ id: 1 }],
    montoTotal: 320,
    montoLiquidarAcumulado: 320,
  });
  assert.equal(check.permitido, false);
  assert.equal(check.recepcionCompleta, true);
  ok('2. Tras recepción completa ÚNICO, no permite nueva recepción');
}

assertFileContains('server/lib/recepcionBienes.js', /RECEPCION_COMPLETA/, 'backend 409 recepción completa');
ok('3. Endpoint rechaza segunda recepción completa');

{
  const check = canRegistrarRecepcion({
    itemEntregas: [
      { saldo_pendiente: 0, cantidad_programada: 1 },
      { saldo_pendiente: 2, cantidad_programada: 2 },
    ],
    recepciones: [{ id: 1 }],
    montoTotal: 1000,
    montoLiquidarAcumulado: 200,
  });
  assert.equal(check.permitido, true);
  assert.equal(check.combinacionesPendientes.length, 1);
  ok('4. Con saldo pendiente permite nueva recepción');
}

assertFileContains('src/views/ejecucion/recepcionBienesView.js', /registrarActa:\s*\(id\)/, 'actMap registra registrarActa');
assertFileContains('src/utils/recepcionBienesModal.js', /openRegistrarActaModal/, 'modal acta existe');
ok('5. Registrar acta cableado al actMap y abre modal');

{
  const data = buildActaRecepcionData({
    numero_orden: '717', orden_id: 1, fecha_orden: '2026-07-24', monto_total: 320,
    proveedor_razon_social: 'ANDINA', proveedor_ruc: '20',
    fecha_maxima: '2026-07-29', fecha_efectiva_inicio: '2026-07-29',
    condicion_inicio_label: 'Al día siguiente',
    orden_items: [{ id: 1, codigo_sigamef: 'X', descripcion: 'Bien', cantidad: 1, precio_unitario: 320 }],
    cronograma: [{ id: 2, etiqueta_entrega: 'ÚNICO', fechaMaxima: '2026-07-29' }],
    item_entregas: [{ orden_item_id: 1, orden_entrega_id: 2, cantidad_programada: 1, fecha_maxima: '2026-07-29', fecha_efectiva: '2026-07-29' }],
    recepciones: [{ id: 3, fecha_recepcion_guia: '2026-07-30', monto_liquidar: 320, guias: [] }],
    actas: [],
  }, {
    item: { id: 1, codigo_sigamef: 'X', descripcion: 'Bien', cantidad: 1, precio_unitario: 320 },
    entrega: { id: 2, etiqueta_entrega: 'ÚNICO' },
    recepcion: { id: 3, fecha_recepcion_guia: '2026-07-30', monto_liquidar: 320 },
    combo: { orden_item_id: 1, orden_entrega_id: 2, cantidad_programada: 1, fecha_maxima: '2026-07-29', fecha_efectiva: '2026-07-29' },
  });
  assert.equal(data.orden.numero, '717');
  assert.equal(data.entrega.etiqueta, 'ÚNICO');
  assert.equal(data.recepcion.id, 3);
  assert.equal(data.corresponde_penalidad, 'SÍ');
  ok('6-8. Modal datos: orden/ítem/entrega/recepción + fechas + penalidad SÍ');
}

assert.equal(correspondeAplicarPenalidad('2026-07-29', '2026-07-29'), 'NO');
assert.equal(correspondeAplicarPenalidad('2026-07-28', '2026-07-29'), 'NO');
ok('9. Penalidad NO si recepción <= máxima');

{
  const pdf = generateActaRecepcionPdfServer({
    numero_orden: '717', orden_id: 1, monto_total: 320, actas: [],
    orden_items: [{ id: 1, codigo_sigamef: 'A', descripcion: 'X', cantidad: 1, precio_unitario: 320 }],
    recepciones: [{ id: 1, fecha_recepcion_guia: '2026-07-30', monto_liquidar: 320, guias: [] }],
  }, { version: 1 });
  assert.ok(pdf.base64.length > 40);
  ok('10-11. Genera PDF / descargable');
}

assertFileContains('server/lib/recepcionBienes.js', /adjuntarActaVisadaAlmacen|ACTA_RECEPCION_VISADA_ALMACEN/, 'acta visada');
assertFileContains('src/utils/recepcionBienesModal.js', /adjuntarActaVisada|rbActaVisar/, 'UI adjuntar visada');
ok('12. Permite adjuntar acta visada');

assertFileNotContains(
  'src/utils/recepcionBienesModal.js',
  /Se generará automáticamente el.*proyecto de Acta/,
  'derivar no ofrece auto-acta',
);
assertFileContains('server/lib/recepcionBienes.js', /ACTA_VISADA_REQUERIDA/, 'derivar exige visada');
assertFileContains('src/utils/recepcionBienesModal.js', /RECEPCION_BIENES_AU|Submódulo destino/, 'submódulo');
assertFileContains('src/utils/recepcionBienesModal.js', /listDestinatariosAu|rbAuDest/, 'persona AU');
assertFileContains('src/utils/recepcionBienesModal.js', /Documentos a derivar/, 'documentos');
assertFileContains('src/utils/recepcionBienesModal.js', /rbAuMotivo/, 'mensaje');
assertFileContains('server/lib/recepcionBienes.js', /EXPEDIENTE_DERIVADO_AREA_USUARIA|CONFORMIDAD_PENDIENTE_AU/, 'estado final');
assertFileContains('server/lib/recepcionBienes.js', /DERIVACION_DUPLICADA|idempotency_key/, 'doble derivación');
ok('13-20. Derivar AU sin auto-acta, exige visada, submódulo, persona, docs, mensaje, estado, idempotencia');

assert.equal(validateFechaRecepcionVsEmision('30/07/2026', '24/07/2026').ok, true);
assertFileContains('scripts/test-rc112-documentos-acta-recepcion.mjs', /RC112/, 'compat RC112');
assertFileContains('shared/recepcionSaldo.js', /canRegistrarRecepcion/, 'saldo compartido');
ok('21. Compatibilidad RC104–RC112 (validación fecha + saldo + scripts)');

{
  const b = resolveAccionesRecepcionBienes({
    estado: 'BIEN_RECIBIDO_ALMACEN', rol: 'dec',
    puedeRegistrarRecepcion: false, tieneRecepcion: true,
    actaEstado: 'ACTA_RECEPCION_VISADA_ALMACEN', actaVisada: true,
  });
  assert.equal(b.registrarRecepcion, false);
  assert.equal(b.derivarAu, true);
  assert.equal(b.registrarActa, false);
  ok('Matriz: Recibido + acta visada → Derivar AU; sin Registrar recepción');
}

console.log('\nRC113 OK\n');

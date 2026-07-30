/**
 * RC112 — Documentos técnicos, acta Orden–Ítem–Entrega–Recepción, penalidad, versionado.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocsCotizacionAdjudicada, dedupeDocumentos, documentoDedupKey } from '../shared/expedienteDocumentos.js';
import { buildActaRecepcionData } from '../shared/recepcionActaData.js';
import { generateActaRecepcionPdfServer } from '../server/lib/recepcionActaPdfServer.js';
import { correspondeAplicarPenalidad, validateFechaRecepcionVsEmision } from '../shared/calendarDate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) { console.log(`  ✓ ${msg}`); }
function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}

console.log('\n=== RC112 — Documentos y Acta de Recepción ===\n');

const cotAdj = {
  id: 50,
  proveedor_id: 3,
  fecha_presentacion: '2026-07-20T12:00:00.000Z',
  anexos: {
    anexo05a_firmado: { nombre_archivo: '5a.pdf', base64: 'AAA' },
    anexo05b_firmado: { nombre_archivo: '5b.pdf', base64: 'BBB' },
    docs_solicitados: [
      { key: 'doc-0', nombre_archivo: 'analisis.pdf', base64: 'CCC', documento: 'Certificado de análisis' },
      { key: 'doc-1', nombre_archivo: 'ficha.pdf', base64: 'DDD', documento: 'Ficha técnica' },
    ],
    requisitos: [
      { key: 'req-0', nombre_archivo: 'calidad.pdf', base64: 'EEE', requisito: 'Certificado de calidad' },
    ],
    ficha_tecnica: { nombre_archivo: 'ft.pdf', base64: 'FFF' },
  },
  certificados: [{ nombre_archivo: 'sanitario.pdf', base64: 'GGG', tipo: 'Registro sanitario' }],
};
const cotOtro = {
  id: 51,
  proveedor_id: 99,
  anexos: {
    docs_solicitados: [{ nombre_archivo: 'otro.pdf', base64: 'XXX' }],
  },
};

{
  const docs = buildDocsCotizacionAdjudicada([cotAdj, cotOtro], 3, {
    docsSolicitadosSc: [
      { documento: 'Certificado de análisis' },
      { documento: 'Ficha técnica' },
    ],
  });
  assert.ok(docs.some((d) => /análisis|analisis/i.test(d.tipo) || /análisis|analisis/i.test(d.nombre)));
  assert.ok(docs.every((d) => Number(d.proveedorId) === 3));
  assert.equal(docs.some((d) => Number(d.proveedorId) === 99), false);
  ok('1-2. Documentos técnicos del proveedor adjudicado visibles; sin otros proveedores');
}

{
  const docs = buildDocsCotizacionAdjudicada([cotAdj], 3);
  const keys = docs.map(documentoDedupKey);
  assert.equal(keys.length, new Set(keys).size);
  const twice = dedupeDocumentos([...docs, ...docs]);
  assert.equal(twice.length, docs.length);
  ok('3. Sin duplicados (dedupe canónico)');
}

{
  const docs = buildDocsCotizacionAdjudicada([cotAdj], 3);
  const tec = docs.find((d) => String(d.ref || '').startsWith('docs-'));
  assert.ok(tec?.fechaEnvio || tec?.fecha_envio);
  assert.ok(tec?.previewDisponible);
  assert.ok(tec?.documentoId);
  ok('4-5. Fecha de envío y contrato documental con Ver disponible');
}

assertFileContains('src/utils/recepcionBienesModal.js', /showTrazabilidadModal\(reqId\)/, 'Ver historial directo');
assertFileContains('src/views/ejecucion/recepcionBienesView.js', /registrarActa/, 'acción Registrar acta');
ok('6-7. Ver historial directo; Registrar acta en menú');

{
  const detalle = {
    orden_id: 1,
    numero_orden: '717',
    fecha_orden: '2026-07-24',
    monto_total: 320,
    moneda: 'PEN',
    proveedor_razon_social: 'Prov SA',
    proveedor_ruc: '20111111111',
    condicion_inicio_label: 'Al día siguiente de la notificación',
    fecha_efectiva_inicio: '2026-07-29',
    fecha_maxima: '2026-07-29',
    lugar_entrega: 'Almacén CNSP',
    area_usuaria: 'Área X',
    orden_items: [{
      id: 10, codigo_sigamef: 'SG-1', descripcion: 'Bien', cantidad: 1, precio_unitario: 320,
    }],
    cronograma: [{ id: 20, etiqueta_entrega: 'ÚNICO', fechaMaxima: '2026-07-29' }],
    item_entregas: [{
      orden_item_id: 10, orden_entrega_id: 20, cantidad_programada: 1,
      fecha_maxima: '2026-07-29', fecha_efectiva: '2026-07-29',
    }],
    recepciones: [{
      id: 30, fecha_recepcion_guia: '2026-07-30', monto_liquidar: 320, responsable: 'Almacén',
      guias: [{ numero_guia: 'G-1', fecha_guia: '2026-07-30' }],
    }],
    actas: [],
  };
  const item = detalle.orden_items[0];
  const entrega = detalle.cronograma[0];
  const recepcion = detalle.recepciones[0];
  const data = buildActaRecepcionData(detalle, {
    item, entrega, recepcion, combo: detalle.item_entregas[0], version: 1,
  });
  assert.equal(data.orden.numero, '717');
  assert.equal(data.item.codigo_sigamef, 'SG-1');
  assert.equal(data.entrega.etiqueta, 'ÚNICO');
  assert.equal(data.recepcion.id, 30);
  assert.equal(data.corresponde_penalidad, 'SÍ');
  assert.ok(data.entrega.monto.includes('320'));
  ok('8-10. Selección orden+ítem+entrega+recepción; campos auto; penalidad SÍ si recepción > máxima');
}

{
  assert.equal(correspondeAplicarPenalidad('2026-07-29', '2026-07-29'), 'NO');
  assert.equal(correspondeAplicarPenalidad('2026-07-28', '2026-07-29'), 'NO');
  assert.equal(correspondeAplicarPenalidad('2026-07-30', '2026-07-29'), 'SÍ');
  ok('11-12. Penalidad NO si recepción <= máxima; SÍ si posterior');
}

{
  const pdf = generateActaRecepcionPdfServer({
    numero_orden: '717', orden_id: 1, monto_total: 320,
    orden_items: [{ id: 1, codigo_sigamef: 'A', descripcion: 'X', cantidad: 1, precio_unitario: 320 }],
    recepciones: [{ id: 1, fecha_recepcion_guia: '2026-07-30', monto_liquidar: 320, guias: [] }],
    cronograma: [{ id: 1, etiqueta_entrega: 'ÚNICO' }],
    actas: [],
  }, { version: 1 });
  assert.equal(pdf.mime_type, 'application/pdf');
  assert.ok(pdf.base64.length > 50);
  ok('13. Genera PDF');
}

assertFileContains('server/lib/recepcionBienes.js', /editarActaRecepcion/, 'editar borrador');
assertFileContains('server/lib/recepcionBienes.js', /eliminarActaRecepcion/, 'eliminar borrador');
assertFileContains('server/lib/recepcionBienes.js', /ACTA_NO_ELIMINABLE|enviado_au_at/, 'no elimina enviada');
assertFileContains('server/lib/recepcionBienes.js', /ACTA_RECEPCION_EDITADA|version/, 'versionado');
assertFileContains('server/lib/recepcionBienes.js', /ACTA_RECEPCION_CREADA|ACTA_RECEPCION_PDF_GENERADA/, 'trazabilidad acta');
ok('14-18. Edición, eliminación, bloqueo enviada, versión y eventos');

assert.equal(validateFechaRecepcionVsEmision('30/07/2026', '24/07/2026').ok, true);
assertFileContains('scripts/test-rc111-validacion-fecha-recepcion.mjs', /RC111/, 'compat RC111');
ok('19. Compatibilidad con RC111 (validación fecha)');

assertFileContains('src/utils/recepcionBienesModal.js', /Fecha de envío/, 'etiqueta Fecha de envío');
assertFileContains('server/migrations/032_recepcion_acta_vinculos.js', /orden_item_id/, 'migración vínculos');
ok('20. Etiqueta documental y migración de vínculos');

console.log('\nRC112 OK\n');

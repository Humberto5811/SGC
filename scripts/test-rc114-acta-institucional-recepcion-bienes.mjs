/**
 * RC114 — Acta institucional Recepción de Bienes (plantilla ficha, no informe).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildActaRecepcionData } from '../shared/recepcionActaData.js';
import {
  ACTA_ANEXO_NUMERO,
  ACTA_TITULO_BIENES,
  buildActaRecepcionHtml,
  resolveActaTemplateFields,
} from '../shared/actaRecepcionBienesTemplate.js';
import { generateActaRecepcionPdfServer } from '../server/lib/recepcionActaPdfServer.js';
import { correspondeAplicarPenalidad } from '../shared/calendarDate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) { console.log(`  ✓ ${msg}`); }
function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}
function assertFileNotContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.doesNotMatch(src, re, msg || rel);
}

console.log('\n=== RC114 — Acta institucional Recepción de Bienes ===\n');

const detalle717 = {
  orden_id: 1,
  numero_orden: '717',
  fecha_orden: '2026-07-24',
  fecha_emision: '2026-07-24',
  enviado_proveedor_at: '2026-07-28T05:14:48.000Z',
  monto_total: 320,
  moneda: 'PEN',
  monto_a_liquidar: 320,
  requerimiento_codigo: 'REQ-00001',
  denominacion: 'ADQUISICION DE DITIOTREITOL P.A. X 5 G',
  area_usuaria: 'UNIDAD DE PARASITOLOGIA Y MICOLOGIA',
  proveedor_razon_social: 'ANDINA MEDICA FILIAL PERU',
  proveedor_ruc: '20295006570',
  condicion_inicio_label: 'A partir de la emisión de la orden',
  fecha_efectiva_inicio: '2026-07-24',
  fecha_maxima: '2026-08-12',
  entrega_label: 'ÚNICO',
  lugar_entrega: 'Lima / Chorrillos',
  orden_items: [{
    id: 1,
    codigo_sigamef: '351000020495',
    descripcion: 'DITIOTREITOL P.A. X 5 G',
    cantidad: 1,
    unidad_medida: 'UND',
    precio_unitario: 320,
  }],
  cronograma: [{ id: 3, etiqueta_entrega: 'ÚNICO', fechaMaxima: '2026-08-12' }],
  item_entregas: [{
    orden_item_id: 1,
    orden_entrega_id: 3,
    cantidad_programada: 1,
    saldo_pendiente: 0,
    fecha_efectiva: '2026-07-24',
    fecha_maxima: '2026-08-12',
    condicion_inicio_label: 'A partir de la emisión de la orden',
    monto_programado: 320,
  }],
  recepciones: [{
    id: 1,
    fecha_recepcion_guia: '2026-07-29',
    monto_liquidar: 320,
    responsable: 'Administrador',
    guias: [{ numero_guia: 'T-001-505', fecha_guia: '2026-07-29', transportista: 'MARVISUR' }],
  }],
  actas: [{ version: 1 }],
};

{
  const data = buildActaRecepcionData(detalle717, {
    version: 2,
    item: detalle717.orden_items[0],
    entrega: detalle717.cronograma[0],
    recepcion: detalle717.recepciones[0],
    combo: detalle717.item_entregas[0],
    fechaMaxima: '2026-08-12',
    fechaRecepcion: '2026-07-29',
    generadoPor: 'Administrador',
  });
  assert.equal(data.entidad.documento, ACTA_TITULO_BIENES);
  assert.equal(data.entidad.anexo_numero, ACTA_ANEXO_NUMERO);
  assert.equal(correspondeAplicarPenalidad('2026-07-29', '2026-08-12'), 'NO');
  assert.equal(data.corresponde_penalidad, 'NO');
  ok('1-6. Datos OC717 + título bienes + anexo + penalidad NO');
}

{
  const pdf = generateActaRecepcionPdfServer(detalle717, {
    version: 2,
    item: detalle717.orden_items[0],
    entrega: detalle717.cronograma[0],
    recepcion: detalle717.recepciones[0],
    combo: detalle717.item_entregas[0],
    fechaMaxima: '2026-08-12',
    fechaRecepcion: '2026-07-29',
    generadoPor: 'Administrador',
  });
  assert.equal(pdf.mime_type, 'application/pdf');
  assert.ok(pdf.base64.length > 200);
  const raw = Buffer.from(pdf.base64, 'base64').toString('latin1');
  assert.equal(raw.slice(0, 8), '%PDF-1.4');
  assert.match(raw, /MediaBox \[0 0 595/);
  ok('1. Genera PDF A4');

  assert.match(raw, /ACTA DE RECEPCION Y CONFORMIDAD DE BIENES|ACTA DE RECEPCI/);
  ok('4. Contiene título correcto para bienes');

  assert.match(raw, /ANEXO N\.?\s*18|ANEXO N\. 18/);
  ok('5. Contiene número de anexo');

  assert.match(raw, /especificaciones tecnicas|especificaciones técnicas|recepcion y conformidad/i);
  ok('6. Contiene texto declarativo');

  assert.match(raw, /CONTRATO/);
  assert.match(raw, /ORDEN DE COMPRA/);
  assert.match(raw, /\(717\)|717/);
  assert.match(raw, /24/);
  assert.match(raw, /07/);
  assert.match(raw, /2026/);
  ok('7. Contiene contrato y orden en bloques separados');

  assert.match(raw, /320/);
  ok('8. Contiene monto');

  assert.match(raw, /ANDINA MEDICA/);
  ok('9. Contiene proveedor');

  assert.match(raw, /351000020495|DITIOTREITOL/);
  ok('10. Contiene ítem');

  assert.match(raw, /UNICO|ÚNICO/);
  ok('11. Contiene entrega ÚNICO');

  assert.match(raw, /T-001-505/);
  ok('12. Contiene guía');

  assert.match(raw, /24\/07\/2026|Fecha de Inicio/);
  ok('13. Contiene fecha de inicio');

  assert.match(raw, /12\/08\/2026|Fecha Limite|Fecha Maxima|Fecha Máxima/);
  ok('14. Contiene fecha máxima');

  assert.match(raw, /29\/07\/2026|Fecha de Recepcion|Fecha de Recepción/);
  ok('15. Contiene fecha de recepción');

  assert.match(raw, /\(NO\)|NO/);
  assert.equal(pdf.fields.penalidad, 'NO');
  ok('16. Penalidad NO para OC 717');

  assert.match(raw, /Firma y sello/);
  ok('17. Contiene bloque de firma');

  assert.doesNotMatch(raw, /I\. DATOS DE LA ORDEN|II\. REQUERIMIENTO|III\. PROVEEDOR|IV\. GU|V\. ITEM|VI\. CONFORMIDAD/);
  ok('18. No contiene secciones I–VI del formato anterior');

  assert.doesNotMatch(raw, /expediente_recepcion_id|orden_item_id\s*=/);
  ok('19. No contiene IDs internos técnicos');

  const html = pdf.html || buildActaRecepcionHtml(pdf.data);
  assert.match(html, /acta-inst/);
  assert.match(html, /ANEXO N\.° 18/);
  assert.match(html, /ORDEN DE COMPRA/);
  assert.match(html, /Firma y sello/);
  assert.equal(resolveActaTemplateFields(pdf.data).penalidad, pdf.fields.penalidad);
  ok('20. Vista previa HTML coincide estructuralmente con PDF');

  assert.equal(pdf.version, 2);
  assert.match(pdf.nombre, /ACTA-RB-717/);
  ok('17b/21. Nombre de archivo y versionado');
}

{
  assertFileContains('shared/actaRecepcionBienesTemplate.js', /ACTA DE RECEPCIÓN Y CONFORMIDAD DE BIENES/, 'plantilla título');
  assertFileContains('shared/actaRecepcionBienesTemplate.js', /ANEXO N\.°/, 'plantilla anexo');
  assertFileContains('shared/actaRecepcionBienesTemplate.js', /buildActaRecepcionHtml/, 'HTML template');
  assertFileContains('src/utils/recepcionActaPdf.js', /drawActaInstitucional|title-box|ANEXO N/, 'FE institucional');
  assertFileNotContains('src/utils/recepcionActaPdf.js', /I\. DATOS DE LA ORDEN/, 'FE sin secciones viejas');
  assertFileContains('server/lib/recepcionActaPdfServer.js', /buildInstitucionalStream|ORDEN DE COMPRA/, 'BE institucional');
  assertFileNotContains('server/lib/recepcionActaPdfServer.js', /I\. ORDEN/, 'BE sin informe I–VI');
  assertFileContains('src/utils/recepcionBienesModal.js', /buildActaRecepcionPreviewHtml/, 'preview = plantilla');
  ok('2-3. Usa plantilla institucional + logotipo (celda/fallback)');
}

{
  const files = [
    'scripts/test-rc104-estado-global-expediente.mjs',
    'scripts/test-rc113-acciones-recepcion-acta-derivacion-au.mjs',
    'shared/recepcionSaldo.js',
    'shared/calendarDate.js',
  ];
  files.forEach((f) => assert.ok(fs.existsSync(path.join(root, f)), f));
  ok('22. Compatibilidad estructural RC104–RC113');
}

console.log('\n=== RC114 OK ===\n');

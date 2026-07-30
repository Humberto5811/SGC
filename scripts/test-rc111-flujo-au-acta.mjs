/**
 * RC111 — Flujo documental Área Usuaria + Acta institucional.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { buildActaRecepcionData } from '../shared/recepcionActaData.js';
import { generateActaRecepcionPdfServer } from '../server/lib/recepcionActaPdfServer.js';
import { buildDocsCotizacionAdjudicada } from '../shared/expedienteDocumentos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) { console.log(`  ✓ ${msg}`); }
function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}

console.log('\n=== RC111 — Flujo AU + Acta ===\n');

{
  const data = buildActaRecepcionData({
    orden_id: 1,
    numero_orden: '717',
    fecha_orden: '2026-07-24',
    enviado_proveedor_at: '2026-07-28T05:14:48.000Z',
    monto_total: 1000,
    moneda: 'PEN',
    monto_a_liquidar: 500,
    requerimiento_codigo: 'REQ-00001',
    denominacion: 'Bien de prueba',
    area_usuaria: 'Área X',
    proveedor_razon_social: 'Prov SA',
    proveedor_ruc: '20111111111',
    orden_items: [{ codigo_sigamef: 'A1', descripcion: 'Item', cantidad: 2, unidad_medida: 'UND' }],
    recepciones: [{ guias: [{ numero_guia: 'G-1', fecha_guia: '2026-07-29' }] }],
    actas: [],
  }, { generadoPor: 'Almacén', version: 1 });
  assert.equal(data.orden.numero, '717');
  assert.equal(data.requerimiento.codigo, 'REQ-00001');
  assert.equal(data.guias.length, 1);
  assert.ok(data.numero_acta.includes('717'));
  ok('1. Datos del acta auto-completados sin captura manual');
}

{
  const pdf = generateActaRecepcionPdfServer({
    numero_orden: '717',
    orden_id: 1,
    proveedor_razon_social: 'Prov',
    proveedor_ruc: '20',
    requerimiento_codigo: 'REQ-00001',
    actas: [],
  }, { version: 1, generadoPor: 'Sistema' });
  assert.equal(pdf.mime_type, 'application/pdf');
  assert.ok(pdf.base64.length > 100);
  const head = Buffer.from(pdf.base64, 'base64').toString('utf8', 0, 8);
  assert.equal(head, '%PDF-1.4');
  ok('2. Generador server produce PDF institucional (no HTML stub)');
}

{
  const docs = buildDocsCotizacionAdjudicada([
    {
      id: 9, proveedor_id: 3,
      anexos: {
        anexo05a_firmado: { nombre_archivo: 'A.pdf', base64: 'xx' },
        anexo05b_firmado: { nombre_archivo: 'B.pdf', base64: 'yy' },
        docs_solicitados: [{ nombre_archivo: 't.pdf', base64: 'zz' }],
      },
    },
  ], 3);
  assert.ok(docs.some((d) => d.ref === 'anexo05a'));
  assert.ok(docs.some((d) => d.ref === 'anexo05b'));
  ok('3. 5-A / 5-B disponibles para expediente AU');
}

assertFileContains('server/lib/recepcionBienes.js', /documentos_anexo_05a/, 'detalle expone 5-A');
assertFileContains('server/lib/recepcionBienes.js', /AREA_USUARIA.*CONFORMIDAD_PENDIENTE_AU|CONFORMIDAD_PENDIENTE_AU[\s\S]*AREA_USUARIA/, 'AU observa');
assertFileContains('server/lib/recepcionBienes.js', /OBSERVACION_AU/, 'adjuntos observación');
assertFileContains('server/lib/recepcionBienes.js', /generateActaRecepcionPdfServer|documento_base64/, 'acta PDF persistida');
assertFileContains('server/lib/recepcionBienes.js', /ACTA_VISADA_REQUERIDA/, 'derivar exige acta visada (sin auto-acta)');
assertFileContains('server/lib/recepcionBienes.js', /adjuntarActaVisadaAlmacen/, 'adjunto acta visada Almacén');
assert.doesNotMatch(
  fs.readFileSync(path.join(root, 'server/lib/recepcionBienes.js'), 'utf8'),
  /si aún no existe/,
  'no auto-genera acta al derivar',
);
ok('4. Backend: docs, observar AU, acta PDF, derivar exige visada (sin auto-acta)');

assertFileContains('shared/actaRecepcionBienesTemplate.js', /ACTA DE RECEPCIÓN Y CONFORMIDAD DE BIENES/, 'plantilla título bienes');
assertFileContains('src/utils/recepcionActaPdf.js', /drawActaInstitucional|ANEXO N/, 'PDF FE institucional');
assertFileContains('src/utils/recepcionBienesModal.js', /openCargarActaFirmadaModal/, 'modal firmar');
assertFileContains('src/utils/recepcionBienesModal.js', /openObservarAuModal/, 'modal observar');
assertFileContains('src/utils/recepcionBienesModal.js', /5-A|rbExp05a/, 'tabs 5-A');
assertFileContains('src/views/ejecucion/recepcionBienesView.js', /cargarActa|observarAu/, 'menú AU');
assertFileContains('src/utils/permissionsCatalog.js', /RECEPCION_BIENES/, 'permiso AU recepción');
ok('5. Frontend AU: tabs, firmar, observar, permisos + plantilla institucional');

assertFileContains('server/lib/recepcionBienes.js', /CONFORMIDAD_RECIBIDA_AU/, 'cargar acta → conformidad recibida');
ok('6. Carga de acta firmada → CONFORMIDAD_RECIBIDA_AU');

assert.ok(fs.existsSync(path.join(root, 'server/assets/acta-recepcion-modelo.pdf')), 'modelo PDF en assets');
ok('7. Modelo institucional disponible en server/assets');

console.log('\n=== RC111 OK ===\n');

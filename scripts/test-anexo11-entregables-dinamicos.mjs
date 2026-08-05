/**
 * Anexo 11 — entregables dinámicos (sin 6 filas fijas).
 *
 *   node scripts/test-anexo11-entregables-dinamicos.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveEntregablesCotizacion,
  mergeEntregablesConPrecios,
  sumPrecioEntregables,
} from '../src/utils/entregablesCotizacion.js';
import {
  buildAnexo11EntregablesRows,
  buildAnexo11AutoTableBody,
  formatFechaCartaLima,
} from '../src/utils/proveedorPdfCotizacion.js';
import { unidadMedidaCotizacion } from '../src/utils/proveedorCotizacionConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pdfPath = path.join(root, 'src/utils/proveedorPdfCotizacion.js');
const stepsPath = path.join(root, 'src/utils/proveedorCotizacionSteps.js');
const viewPath = path.join(root, 'src/views/proveedor/misCotizacionesView.js');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

console.log('Anexo 11 entregables dinámicos\n');

const pdfSrc = fs.readFileSync(pdfPath, 'utf8');
const stepsSrc = fs.readFileSync(stepsPath, 'utf8');
const viewSrc = fs.readFileSync(viewPath, 'utf8');

assert.ok(!pdfSrc.includes('MAX_ENTREGABLES_LOCADOR'), 'PDF no usa MAX_ENTREGABLES_LOCADOR');
assert.ok(!stepsSrc.includes('MAX_ENTREGABLES_LOCADOR'), 'Steps no usa MAX_ENTREGABLES_LOCADOR');
assert.ok(!pdfSrc.includes('PLAZOS_ENTREGABLES_LABELS'), 'PDF no fija 6 plazos');
assert.match(pdfSrc, /buildAnexo11EntregablesRows/);
assert.match(pdfSrc, /buildAnexo11AutoTableBody/);
assert.match(pdfSrc, /formatFechaCartaLima/);
assert.match(pdfSrc, /Precio Total S\/ \(Incluido IGV\)/);
assert.match(pdfSrc, /Descripción del Servicio/);
assert.match(pdfSrc, /N° de entregables/);
assert.match(stepsSrc, /renderStep1Entregables/);
assert.match(viewSrc, /entregables_cotizados/);
assert.match(viewSrc, /downloadAnexo11/);
ok('Sin pads de 6 filas; helpers dinámicos y formato institucional presentes');

const tdr = {
  locadorInformacion: [
    { entregable: 'Primer entregable', plazo: 'Hasta 30 días calendario desde la notificación de la orden.' },
    { entregable: 'Segundo entregable', plazo: 'Hasta 60 días calendario desde la notificación de la orden.' },
  ],
};
const prog = resolveEntregablesCotizacion(tdr, 'Locadores');
assert.equal(prog.length, 2);
const priced = mergeEntregablesConPrecios(prog, [
  { numero: 1, precio: 2500 },
  { numero: 2, precio: 3500 },
]);
const rows = buildAnexo11EntregablesRows(priced, 'Servicio REQ-00002');
assert.equal(rows.length, 2);
assert.equal(sumPrecioEntregables(rows), 6000);
assert.match(rows[0].entregable || rows[0].descripcion, /Primer/);
assert.match(String(rows[0].plazo || prog[0].plazo_texto), /30/);
ok('REQ-00002: exactamente 2 filas y total 6000');

const body = buildAnexo11AutoTableBody(rows, 'Servicio REQ-00002');
assert.equal(body.length, 2);
assert.equal(body[0][0].rowSpan, 2);
assert.match(String(body[0][1].content), /Servicio REQ-00002/);
assert.match(String(body[0][2]), /Primer/);
ok('Cuerpo Anexo 11 con rowspan institucional');

assert.equal(unidadMedidaCotizacion('Servicios', 'UND'), 'SERVICIO');
assert.equal(unidadMedidaCotizacion('Locadores', 'UNIDAD'), 'SERVICIO');
assert.equal(unidadMedidaCotizacion('Bienes', 'UND'), 'UND');
assert.equal(unidadMedidaCotizacion('Bienes', 'KG'), 'KG');
ok('UM histórica UND se corrige sólo para servicios/locadores');

const emptyish = buildAnexo11EntregablesRows([
  { numero: 1, nombre: '', descripcion: '', plazo_texto: '', precio: 0 },
  { numero: 2, nombre: 'OK', plazo_texto: '10 días', precio: 100 },
], '');
assert.equal(emptyish.length, 1);
ok('Filas vacías filtradas en Anexo 11');

const fecha = formatFechaCartaLima(new Date());
assert.match(fecha, /^Lima,/);
ok(`Fecha carta Lima: ${fecha}`);

assert.match(pdfSrc, /y \+= 48/);
assert.match(pdfSrc, /Firma del Representante Legal/);
ok('Espacio de firma / representante único en PDF');

console.log('\nOK — test-anexo11-entregables-dinamicos\n');

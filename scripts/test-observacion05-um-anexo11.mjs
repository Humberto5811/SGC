/**
 * Observación 05_01 — UM SERVICIO + Anexo 11 institucional.
 *
 *   node scripts/test-observacion05-um-anexo11.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  unidadMedidaCotizacion,
  unidadMedidaAnexo11,
} from '../src/utils/proveedorCotizacionConfig.js';
import {
  buildAnexo11EntregablesRows,
  buildAnexo11AutoTableBody,
  applyAnexo11RowSpans,
} from '../src/utils/proveedorPdfCotizacion.js';
import { sumPrecioEntregables } from '../src/utils/entregablesCotizacion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

console.log('Obs 05_01 — UM SERVICIO + Anexo 11\n');

// UM
assert.equal(unidadMedidaCotizacion({ unidad_medida: 'UND' }, 'Locadores'), 'SERVICIO');
assert.equal(unidadMedidaCotizacion({ um: 'UNIDAD' }, 'Servicios'), 'SERVICIO');
assert.equal(unidadMedidaCotizacion({ unidad_medida: 'SERVICIO' }, 'locacion'), 'SERVICIO');
assert.equal(unidadMedidaCotizacion({}, 'Servicios'), 'SERVICIO');
assert.equal(unidadMedidaCotizacion({ unidad_medida: 'UND' }, 'Bienes'), 'UND');
assert.equal(unidadMedidaAnexo11({ um: 'UND' }, 'Locadores'), 'Servicio');
console.log('  ✓ UM SERVICIO para servicios/locadores; Bienes conserva UND');

// Anexo 11 estructura institucional
const rows = buildAnexo11EntregablesRows([
  { numero: 1, nombre: 'PRIMER ENTREGABLE', precio: 7000 },
  { numero: 2, nombre: 'SEGUNDO ENTREGABLE', precio: 7000 },
], 'SERVICIO DE MONITOREO Y SEGUIMIENTO');
assert.equal(rows.length, 2);
assert.equal(rows[0].um, 'Servicio');
assert.equal(rows[0].entregable, 'PRIMER ENTREGABLE');
assert.equal(sumPrecioEntregables(rows), 14000);

const body = buildAnexo11AutoTableBody(rows, 'SERVICIO DE MONITOREO Y SEGUIMIENTO');
assert.equal(body[0].length, 6);
assert.equal(body[0][1], 'SERVICIO DE MONITOREO Y SEGUIMIENTO');
assert.equal(body[0][2], 'PRIMER ENTREGABLE');
assert.equal(body[1][0], '');
assert.equal(body[1][1], '');
assert.equal(body[1][2], 'SEGUNDO ENTREGABLE');

const fake = { section: 'body', column: { index: 0 }, row: { index: 0 }, cell: { styles: {} } };
applyAnexo11RowSpans(fake, 2);
assert.equal(fake.cell.rowSpan, 2);
console.log('  ✓ Anexo 11: 6 columnas + rowspan N°/Descripción');

const pdfSrc = read('src/utils/proveedorPdfCotizacion.js');
assert.match(pdfSrc, /buildAnexo11AutoTableBody/);
assert.match(pdfSrc, /Descripción del Servicio/);
assert.match(pdfSrc, /N° de entregables/);
assert.match(pdfSrc, /Precio Total S\/ \(Incluido IGV\)/);
assert.match(pdfSrc, /unidadMedidaCotizacion/);

const portalSrc = read('server/lib/portalDocumentos.js');
assert.match(portalSrc, /resolveUnidadMedidaItem/);
assert.match(portalSrc, /SERVICIO/);

const invSrc = read('server/lib/invitaciones.js');
assert.match(invSrc, /unidad_medida:/);

const stepsSrc = read('src/utils/proveedorCotizacionSteps.js');
assert.match(stepsSrc, /unidadMedidaCotizacion/);
assert.match(stepsSrc, /N° de entregables/);
assert.doesNotMatch(stepsSrc, /it\.unidad_medida \|\| 'UND'/);

console.log('\nOK — test-observacion05-um-anexo11\n');

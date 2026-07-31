/**
 * Entregables multitipo (Bienes / Servicios / Locación) — portal cotizaciones.
 *
 *   node scripts/test-entregables-cotizacion-multitipo.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveEntregablesCotizacion,
  mergeEntregablesConPrecios,
  sumPrecioEntregables,
  extractEntregablesSourceFromPayload,
} from '../src/utils/entregablesCotizacion.js';
import {
  buildAnexo11EntregablesRows,
  formatFechaCartaLima,
} from '../src/utils/proveedorPdfCotizacion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

const bienesPayload = {
  tipo: 'Bienes',
  entregas: [
    { numero_entrega: 1, cantidad: 10, plazo: '15 días', condicion: 'Lote A' },
    { numero_entrega: 2, cantidad: 20, plazo: '30 días', condicion: 'Lote B' },
    { numero_entrega: 3, cantidad: 5, plazo: '45 días', condicion: 'Lote C' },
  ],
};

const serviciosPayload = {
  tipo: 'Servicios',
  servicioInformacion: [
    {
      entregable: 'Primer entregable',
      plazo: 'Hasta 30 días calendario desde la notificación de la orden.',
      porcentaje: 40,
    },
    {
      entregable: 'Segundo entregable',
      plazo: 'Hasta 60 días calendario desde la notificación de la orden.',
      porcentaje: 60,
    },
  ],
};

const locacionPayload = {
  tipo: 'Locadores',
  locadorInformacion: [
    {
      entregable: 'Primer entregable',
      plazo: 'Hasta 30 días calendario desde la notificación de la orden.',
    },
    {
      entregable: 'Segundo entregable',
      plazo: 'Hasta 60 días calendario desde la notificación de la orden.',
    },
  ],
};

console.log('Entregables cotización multitipo\n');

// A. Bienes 3 entregas
{
  const list = resolveEntregablesCotizacion(bienesPayload, 'Bienes');
  assert.equal(list.length, 3);
  assert.equal(list[0].tipo_origen, 'BIEN');
  assert.equal(list[2].numero, 3);
  ok('A. Bienes con 3 entregas programadas');
}

// B. Servicios 2
{
  const list = resolveEntregablesCotizacion(serviciosPayload, 'Servicios');
  assert.equal(list.length, 2);
  assert.equal(list[0].tipo_origen, 'SERVICIO');
  assert.match(list[0].plazo_texto, /30/);
  assert.match(list[1].plazo_texto, /60/);
  ok('B. Servicios con 2 entregables');
}

// C. Locación 2
{
  const list = resolveEntregablesCotizacion(locacionPayload, 'Locadores');
  assert.equal(list.length, 2);
  assert.equal(list[0].tipo_origen, 'LOCACION');
  ok('C. Locación con 2 entregables');
}

// D. Sin filas vacías
{
  const padded = {
    locadorInformacion: [
      { entregable: 'Real', plazo: '30 días' },
      { entregable: '', plazo: '' },
      {},
    ],
  };
  const list = resolveEntregablesCotizacion(padded, 'Locadores');
  assert.equal(list.length, 1);
  ok('D. Filas vacías no aparecen');
}

// E. Total servicios 2500+3500
{
  const prog = resolveEntregablesCotizacion(serviciosPayload, 'Servicios');
  const merged = mergeEntregablesConPrecios(prog, [
    { numero: 1, precio: 2500 },
    { numero: 2, precio: 3500 },
  ]);
  assert.equal(sumPrecioEntregables(merged), 6000);
  ok('E. Servicio precios 2500+3500 → total 6000');
}

// F. Locación total
{
  const prog = resolveEntregablesCotizacion(locacionPayload, 'Locadores');
  const merged = mergeEntregablesConPrecios(prog, [
    { numero: 1, precio: 1000.5 },
    { numero: 2, precio: 1999.5 },
  ]);
  assert.equal(sumPrecioEntregables(merged), 3000);
  ok('F. Locación precios por entregable → total correcto');
}

// G. Bienes conserva unitario/subtotal normativo (config)
{
  const cfg = fs.readFileSync(path.join(root, 'src/utils/proveedorCotizacionConfig.js'), 'utf8');
  assert.match(cfg, /Bienes[\s\S]*propuestaEconomica:\s*'05-B'/);
  const steps = fs.readFileSync(path.join(root, 'src/utils/proveedorCotizacionSteps.js'), 'utf8');
  assert.match(steps, /Precio Unitario/);
  assert.match(steps, /prov-p-unit/);
  assert.match(steps, /Cronograma de entregas programadas/);
  ok('G. Bienes conserva precio unitario/subtotal normativo');
}

// H/I. PDF solo entregables reales
{
  const prog = resolveEntregablesCotizacion(serviciosPayload, 'Servicios');
  const rows = buildAnexo11EntregablesRows(
    mergeEntregablesConPrecios(prog, [{ numero: 1, precio: 1 }, { numero: 2, precio: 2 }]),
    'Servicio demo',
  );
  assert.equal(rows.length, 2);
  const loc = buildAnexo11EntregablesRows(
    resolveEntregablesCotizacion(locacionPayload, 'Locadores'),
    'Locación demo',
  );
  assert.equal(loc.length, 2);
  const pdfSrc = fs.readFileSync(path.join(root, 'src/utils/proveedorPdfCotizacion.js'), 'utf8');
  assert.ok(!pdfSrc.includes('MAX_ENTREGABLES_LOCADOR'));
  assert.ok(!pdfSrc.includes('PLAZOS_ENTREGABLES_LABELS'));
  assert.match(pdfSrc, /buildAnexo11EntregablesRows/);
  ok('H. PDF Servicios solo entregables reales');
  ok('I. PDF Locación solo entregables reales');
}

// J. PDF Bienes formato propio
{
  const pdfSrc = fs.readFileSync(path.join(root, 'src/utils/proveedorPdfCotizacion.js'), 'utf8');
  assert.match(pdfSrc, /export function downloadAnexo05B/);
  assert.match(pdfSrc, /export function downloadAnexo05A/);
  const view = fs.readFileSync(path.join(root, 'src/views/proveedor/misCotizacionesView.js'), 'utf8');
  assert.match(view, /tipo === 'Bienes'\) downloadAnexo05B/);
  ok('J. PDF Bienes respeta formato propio');
}

// K. Descripción larga no se corta (overflow linebreak)
{
  const pdfSrc = fs.readFileSync(path.join(root, 'src/utils/proveedorPdfCotizacion.js'), 'utf8');
  assert.match(pdfSrc, /overflow:\s*'linebreak'/);
  const long = 'A'.repeat(400);
  const rows = buildAnexo11EntregablesRows([{ numero: 1, nombre: long, plazo_texto: '30' }], '');
  assert.equal(rows[0].descripcion.length, 400);
  ok('K. Descripción larga no se corta (wrap/linebreak)');
}

// L. Fecha Lima
{
  const s = formatFechaCartaLima(new Date('2026-07-24T18:00:00.000Z'));
  assert.match(s, /^Lima,/);
  assert.match(s, /2026/);
  ok(`L. Fecha Lima correcta (${s})`);
}

// M. Borrador antiguo fallback
{
  const prog = resolveEntregablesCotizacion(serviciosPayload, 'Servicios');
  const oldPad = Array.from({ length: 6 }, (_, i) => ({
    nro: i + 1, um: 'Servicio', precio_unitario: i < 2 ? (i + 1) * 1000 : 0, total: i < 2 ? (i + 1) * 1000 : 0,
  }));
  const merged = mergeEntregablesConPrecios(prog, oldPad);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].precio, 1000);
  assert.equal(merged[1].precio, 2000);
  ok('M. Borrador antiguo carga mediante fallback');
}

// N. Cotización presentada no se altera (readonly gate)
{
  const view = fs.readFileSync(path.join(root, 'src/views/proveedor/misCotizacionesView.js'), 'utf8');
  assert.match(view, /cotizacionPresentada/);
  assert.match(view, /isReadonly/);
  assert.match(view, /COTIZACION_PRESENTADA/);
  ok('N. Cotización presentada → modo readonly (no se altera)');
}

// O. Misma fuente normalizada
{
  const src = extractEntregablesSourceFromPayload(serviciosPayload, 'Servicios');
  const a = resolveEntregablesCotizacion(src, 'Servicios');
  const b = resolveEntregablesCotizacion(serviciosPayload, 'Servicios');
  assert.equal(a.length, b.length);
  assert.equal(a[0].plazo_texto, b[0].plazo_texto);
  const steps = fs.readFileSync(path.join(root, 'src/utils/proveedorCotizacionSteps.js'), 'utf8');
  assert.match(steps, /resolveEntregablesFromWorkspace/);
  assert.match(steps, /prov-plazo-ent/);
  const pdfSrc = fs.readFileSync(path.join(root, 'src/utils/proveedorPdfCotizacion.js'), 'utf8');
  assert.match(pdfSrc, /plazos_entregables/);
  ok('O. Misma fuente normalizada alimenta formulario, plazos y PDF');
}

// REQ-00002 shape
{
  const list = resolveEntregablesCotizacion(locacionPayload, 'Locación de servicios');
  assert.equal(list.length, 2);
  ok('REQ-00002: Locación/Servicio con 2 entregables (30 y 60 días)');
}

// Config Servicios → Anexo 11
{
  const cfg = fs.readFileSync(path.join(root, 'src/utils/proveedorCotizacionConfig.js'), 'utf8');
  assert.match(cfg, /Servicios[\s\S]*propuestaEconomica:\s*'11'/);
  ok('Servicios incluido en Anexo 11 (misma capa que Locación)');
}

console.log('\nOK — test-entregables-cotizacion-multitipo\n');

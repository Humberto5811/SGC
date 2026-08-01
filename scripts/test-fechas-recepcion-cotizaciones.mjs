/**
 * Fechas Recepción de Cotizaciones — America/Lima.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatDateTimeLima } from '../src/utils/dateTimeLima.js';
import { fechaPrincipalCotizacion } from '../shared/estadoRecepcionCotizaciones.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function ok(msg) { console.log('OK', msg); }

console.log('\n=== test-fechas-recepcion-cotizaciones ===\n');

// K. UTC → Lima
{
  const out = formatDateTimeLima('2026-08-01T00:13:00.000Z');
  assert.equal(out, '2026-07-31 19:13');
  ok('K: 2026-08-01T00:13:00.000Z → 2026-07-31 19:13');
}

// L. Bandeja/modal/detalle misma función
{
  const view = fs.readFileSync(path.join(root, 'src/views/contratacion/recepcionCotizacionesView.js'), 'utf8');
  assert.ok(view.includes('formatDateTimeLima'), 'vista usa formatDateTimeLima');
  assert.ok(!view.includes(".slice(0, 16).replace('T', ' ')"), 'vista sin slice UTC');
  const raw = '2026-08-01T00:13:00.000Z';
  const bandeja = formatDateTimeLima(raw);
  const modal = formatDateTimeLima(raw);
  const detalle = formatDateTimeLima(raw);
  assert.equal(bandeja, modal);
  assert.equal(modal, detalle);
  assert.equal(bandeja, '2026-07-31 19:13');
  ok('L: bandeja/modal/detalle misma hora');
}

// M. Offset -05:00 sin doble conversión
{
  const out = formatDateTimeLima('2026-07-31T19:13:00-05:00');
  assert.equal(out, '2026-07-31 19:13');
  ok('M: offset -05:00 sin doble conversión');
}

// N. Null / inválida
{
  assert.equal(formatDateTimeLima(null), '—');
  assert.equal(formatDateTimeLima(''), '—');
  assert.equal(formatDateTimeLima('no-fecha'), '—');
  ok('N: null/inválida → —');
}

// O. fecha_presentacion prioriza sobre created_at
{
  const row = {
    fecha_presentacion: '2026-08-01T00:13:00.000Z',
    created_at: '2026-07-01T10:00:00.000Z',
    fecha_envio: null,
  };
  assert.equal(fechaPrincipalCotizacion(row), '2026-08-01T00:13:00.000Z');
  assert.equal(formatDateTimeLima(fechaPrincipalCotizacion(row)), '2026-07-31 19:13');
  ok('O: fecha_presentacion prioriza created_at');
}

// listarRecepcionCotizaciones selecciona fecha_presentacion cruda (timestamptz)
{
  const be = fs.readFileSync(path.join(root, 'server/lib/portalProveedores.js'), 'utf8');
  const fnStart = be.indexOf('export async function listarRecepcionCotizaciones');
  const fnEnd = be.indexOf('export async function listarValidacionesBandeja');
  const fnBody = be.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined);
  assert.ok(fnBody.includes('cot.fecha_presentacion'), 'SELECT fecha_presentacion');
  assert.ok(
    !/to_char\s*\(\s*cot\.fecha_presentacion/i.test(fnBody),
    'listarRecepcion no formatea con to_char (deja timestamptz)',
  );
  ok('BE entrega fecha_presentacion cruda');
}

console.log('\nOK test-fechas-recepcion-cotizaciones');

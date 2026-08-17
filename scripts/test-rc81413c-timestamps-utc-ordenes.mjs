// RC8.14.13C — Casos de prueba: lectura UTC escopada de timestamps de Órdenes/Notificación.
// Script de SOLO LECTURA. No modifica datos, no envía SMTP, no confirma recepciones.
// Verifica que las consultas corregidas (AT TIME ZONE 'UTC') en server/lib/ordenesProveedor.js
// y server/lib/ordenesContratacion.js devuelvan instantes correctos, que los campos DATE
// contractuales sigan intactos, y que ni server/db.js ni solicitudes_cotizacion/
// cronogramaDatetime.js hayan sido tocados.

import { readFileSync } from 'node:fs';
import { query } from '../server/db.js';
import {
  getOrdenById, getExpedienteOrdenCompleto, listarHistorialOrden,
} from '../server/lib/ordenesContratacion.js';
import { listarOrdenesPortalProveedor, getOrdenPortalParaProveedor } from '../server/lib/ordenesProveedor.js';
import { formatDateTimeLima } from '../src/utils/dateTimeLima.js';

let fallos = 0;
function assertEq(label, actual, esperado) {
  const ok = actual === esperado;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} -> obtenido="${actual}" esperado="${esperado}"`);
  if (!ok) fallos++;
}

console.log('='.repeat(70));
console.log('RC8.14.13C — Timestamps UTC escopados (flujo de Órdenes)');
console.log('='.repeat(70));

const { rows: ordenRows } = await query(
  `SELECT id, proveedor_id, recibido_proveedor_at::text AS raw
   FROM ordenes_contratacion
   WHERE tipo_orden = 'OS' AND numero_orden = '1105' AND anio_orden = 2026`
);
if (!ordenRows.length) {
  console.error('OS 1105 no encontrada en esta base de datos. Abortando pruebas (no es un error de código).');
  process.exit(1);
}
const { id: ordenId, proveedor_id: proveedorId, raw: crudoTexto } = ordenRows[0];

// -----------------------------------------------------------------------
// A. Valor crudo confirmado_at / recibido_proveedor_at
// -----------------------------------------------------------------------
console.log('\n--- CASO A: valor crudo almacenado en PostgreSQL ---');
console.log(`recibido_proveedor_at::text = "${crudoTexto}"`);
assertEq('valor crudo esperado', crudoTexto, '2026-08-17 01:45:33.732');

// -----------------------------------------------------------------------
// B/D. getOrdenById -> instante Node corregido (sin +5h espurias)
// -----------------------------------------------------------------------
console.log('\n--- CASO B/D: getOrdenById devuelve instante UTC correcto ---');
const orden = await getOrdenById(ordenId);
assertEq('recibido_proveedor_at.toISOString()', orden.recibido_proveedor_at.toISOString(), '2026-08-17T01:45:33.732Z');

// -----------------------------------------------------------------------
// C. Presentación Lima (formatDateTimeLima sobre el valor ya corregido)
// -----------------------------------------------------------------------
console.log('\n--- CASO C: presentación America/Lima ---');
assertEq('formatDateTimeLima (dmy)', formatDateTimeLima(orden.recibido_proveedor_at, { style: 'dmy' }), '16/08/2026 20:45');

// -----------------------------------------------------------------------
// E. enviado_at conserva instante correcto (vía Portal Proveedor y Notificación)
// -----------------------------------------------------------------------
console.log('\n--- CASO E: enviado_at / envio_at correctos en ambas pantallas ---');
const listaPortal = await listarOrdenesPortalProveedor(proveedorId);
const filaPortal = listaPortal.find((r) => r.id === ordenId);
assertEq('Portal Proveedor: envio_at ISO', filaPortal?.envio_at?.toISOString?.(), '2026-08-13T22:54:51.950Z');
assertEq('Portal Proveedor: recibido_proveedor_at ISO', filaPortal?.recibido_proveedor_at?.toISOString?.(), '2026-08-17T01:45:33.732Z');

const detallePortal = await getOrdenPortalParaProveedor(ordenId, proveedorId);
assertEq('Portal Proveedor (detalle): recibido_proveedor_at ISO', detallePortal.orden.recibido_proveedor_at?.toISOString?.(), '2026-08-17T01:45:33.732Z');

const exp = await getExpedienteOrdenCompleto(ordenId);
assertEq('Registro de Órdenes (Notificación): confirmado_at ISO', exp.notificacion.confirmado_at?.toISOString?.(), '2026-08-17T01:45:33.732Z');
assertEq('Registro de Órdenes (Notificación): envios[0].enviado_at ISO', exp.notificacion.envios[0]?.enviado_at?.toISOString?.(), '2026-08-13T22:54:51.950Z');

const historial = await listarHistorialOrden(ordenId);
if (historial.length) {
  console.log(`historial_orden[0].creado_at (UTC corregido): ${historial[0].creado_at?.toISOString?.()}`);
}

// -----------------------------------------------------------------------
// F/G. DATE contractual — fecha_maxima de entregables NO debe cambiar
// -----------------------------------------------------------------------
console.log('\n--- CASO F/G: DATE contractual sin conversión UTC->Lima ---');
const { rows: entregas } = await query(
  `SELECT numero_entrega, fecha_maxima FROM orden_entregas WHERE orden_id = $1 AND estado = 'ACTIVO' ORDER BY numero_entrega`,
  [ordenId]
);
const toDMY = (d) => {
  const iso = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const [y, m, day] = iso.split('-');
  return `${day}/${m}/${y}`;
};
assertEq('Entregable 1: fecha_maxima', toDMY(entregas[0]?.fecha_maxima), '22/08/2026');
assertEq('Entregable 2: fecha_maxima', toDMY(entregas[1]?.fecha_maxima), '21/09/2026');
assertEq('exp.resumen.fecha_maxima (recalculada, coincide con entregable 1)', exp.resumen.fecha_maxima, '2026-08-22');

// -----------------------------------------------------------------------
// H. solicitudes_cotizacion NO fue modificada / no usa AT TIME ZONE
// -----------------------------------------------------------------------
console.log('\n--- CASO H: solicitudes_cotizacion intacta (convención hora Lima naive) ---');
const { rows: solRows } = await query(
  `SELECT cotizaciones_fin::text AS raw FROM solicitudes_cotizacion WHERE cotizaciones_fin IS NOT NULL LIMIT 1`
);
if (solRows.length) {
  console.log(`solicitudes_cotizacion.cotizaciones_fin::text = "${solRows[0].raw}" (hora Lima naive, no se reinterpreta)`);
}
const srcCronogramaBackend = readFileSync(new URL('../server/lib/cronogramaDatetime.js', import.meta.url), 'utf8');
assertEq('cronogramaDatetime.js backend NO usa AT TIME ZONE', srcCronogramaBackend.includes('AT TIME ZONE'), false);

// -----------------------------------------------------------------------
// I. server/db.js NO fue modificado (sin parser global, sin setTypeParser)
// -----------------------------------------------------------------------
console.log('\n--- CASO I: server/db.js sin parser global ---');
const srcDb = readFileSync(new URL('../server/db.js', import.meta.url), 'utf8');
assertEq('server/db.js NO usa setTypeParser', srcDb.includes('setTypeParser'), false);
assertEq('server/db.js NO usa pg.types', srcDb.includes('pg.types') || srcDb.includes('{ types }'), false);

// -----------------------------------------------------------------------
// J. cronogramaDatetime.js backend NO fue modificado (ya cubierto en H, redundante por claridad)
// -----------------------------------------------------------------------
console.log('\n--- CASO J: cronogramaDatetime.js backend sin cambios de convención ---');
assertEq(
  'cronogramaDatetime.js conserva su política de "hora de negocio, no UTC del servidor"',
  srcCronogramaBackend.includes('no UTC del servidor'),
  true
);

console.log('\n' + '='.repeat(70));
if (fallos > 0) {
  console.error(`RESULTADO: ${fallos} caso(s) FALLADO(S).`);
  process.exit(1);
} else {
  console.log('RESULTADO: todos los casos OK.');
  process.exit(0);
}

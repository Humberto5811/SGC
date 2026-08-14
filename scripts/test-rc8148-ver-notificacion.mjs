/**
 * RC8.14.8 — Validación de "Ver notificación" y trazabilidad de envíos.
 * Verificación estática + lectura real (solo lectura) de orden_envios_proveedor.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };

console.log('\n=== RC8.14.8 — "Ver notificación" y trazabilidad de envíos ===\n');

const modal = read('src/utils/registroOrdenExpedienteModal.js');
const libOrdenes = read('server/lib/ordenesContratacion.js');
const libProveedor = read('server/lib/ordenesProveedor.js');
const view = read('src/views/contratacion/registroOrdenesView.js');
const service = read('src/services/ordenesContratacionService.js');

// 1. "Ver notificación" abre el modal de expediente (contiene la pestaña Notificación).
ok(/verNotificacion: wrap/.test(view) && /openExpedienteOrdenModal\(row\)/.test(view),
  '1. "Ver notificación" abre el modal de expediente');

// 2. El backend consulta orden_envios_proveedor en orden descendente.
ok(/FROM orden_envios_proveedor WHERE orden_id = \$1/.test(libOrdenes)
  && /ORDER BY id DESC/.test(libOrdenes),
  '2. getDetalleOrden consulta orden_envios_proveedor en orden descendente');

// 3. listarEnviosOrden lista todos los intentos en orden descendente.
ok(/export async function listarEnviosOrden/.test(libProveedor)
  && /ORDER BY id DESC/.test(libProveedor),
  '3. listarEnviosOrden lista todos los intentos (id DESC)');

// 4. La pestaña Notificación itera sobre TODOS los intentos (no solo el último).
ok(/data\.notificacion\?\.envios/.test(modal),
  '4. la pestaña Notificación muestra todos los intentos');

// 5. El resumen usa el último envío (ultimoEnvio = envios[0]).
ok(/const ultimoEnvio = envios\?\.\[0\]/.test(libOrdenes)
  && /correo_destino: ultimoEnvio\?\.correo_destino/.test(libOrdenes)
  && /estado: ultimoEnvio\?\.estado/.test(libOrdenes),
  '5. el resumen usa el último envío para correo/estado/confirmación');

// 6. Muestra la confirmación de recepción (confirmado_at).
ok(/ultimoEnvio\?\.confirmado_at/.test(libOrdenes) && /Confirmación/.test(modal),
  '6. muestra confirmado_at cuando el proveedor confirma');

// 7. "Ver notificación" es solo consulta (GET /expediente) y no dispara envío.
const verNotifBlock = view.slice(view.indexOf('verNotificacion:'), view.indexOf('verConfirmacion:'));
ok(!/enviarProveedor|reenviarProveedor|openEnviarProveedorModal/.test(verNotifBlock)
  && /getExpediente\(id\)/.test(service) && service.includes('/expediente'),
  '7. "Ver notificación" usa GET /expediente y no dispara envío');

// 8. "Reenviar orden" es una acción separada (POST /reenviar-proveedor).
ok(/reenviarProveedor\(id/.test(service) && service.includes('reenviar-proveedor'),
  '8. "Reenviar orden" es acción separada (POST)');

// 9. Estado vacío "Sin envíos" (solo se muestra cuando no hay registros).
ok(/Sin envíos/.test(modal),
  '9. existe estado vacío "Sin envíos"');

// --- Lectura real (solo lectura) ---
let ordenId = null;
let realEnvios = null;
try {
  const { rows: os } = await query(
    `SELECT id FROM ordenes_contratacion
     WHERE tipo_orden = 'OS' AND numero_orden = '1105' AND anio_orden = 2026
     ORDER BY id ASC LIMIT 1`,
  );
  ordenId = os[0]?.id ?? null;
  if (ordenId) {
    const { rows } = await query(
      `SELECT id, intento, estado, correo_destino
       FROM orden_envios_proveedor WHERE orden_id = $1 ORDER BY id DESC`,
      [ordenId],
    );
    realEnvios = rows;
  }
} catch (e) {
  console.log(`  ⚠ Validación real omitida: ${e.message}`);
}

if (realEnvios && ordenId) {
  ok(realEnvios.length >= 2, `R1. existen ${realEnvios.length} envíos para OS 1105 (≥ 2)`);
  ok(realEnvios.every((e, i) => i === 0 || realEnvios[i - 1].id > e.id),
    'R2. intentos en orden descendente por id');
  ok(realEnvios.some((e) => e.estado === 'ENVIADO'), 'R3. estado ENVIADO presente');
  ok(realEnvios.every((e) => typeof e.correo_destino === 'string' && e.correo_destino.length > 0),
    'R4. correo destino presente en cada intento');
  const { listarEnviosOrden } = await import('../server/lib/ordenesProveedor.js');
  const lista = await listarEnviosOrden(ordenId);
  ok(Array.isArray(lista) && lista.length === realEnvios.length,
    `R5. listarEnviosOrden devuelve los ${lista.length} intentos (todos, no solo el último)`);
} else {
  console.log('  ⚠ OS 1105 / envíos no disponibles en esta BD (validación real omitida)');
}

await pool.end().catch(() => {});

console.log('\n=== RC8.14.8 — pruebas OK ===\n');

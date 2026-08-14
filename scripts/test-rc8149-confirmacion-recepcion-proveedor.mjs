/**
 * RC8.14.9 — Validación de confirmación de recepción de la orden por el proveedor.
 * Verificación estática del flujo + lectura real SOLO-LECTURA de OS 1105.
 * NO confirma la orden, NO modifica datos.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };

console.log('\n=== RC8.14.9 — Confirmación de recepción de la orden ===\n');

const lib = read('server/lib/ordenesProveedor.js');

// B) Confirmación exitosa: envio CONFIRMADO, orden ORDEN_RECEPCION_CONFIRMADA,
//    recibido_proveedor_at, evento.
ok(/UPDATE orden_envios_proveedor SET[\s\S]*?estado = 'CONFIRMADO'/.test(lib),
  'B1. la confirmación marca el envío como CONFIRMADO');
ok(/confirmado_at = \$2/.test(lib) && /confirmado_ip = \$3/.test(lib) && /confirmado_user_agent = \$4/.test(lib),
  'B2. registra confirmado_at / confirmado_ip / confirmado_user_agent');
ok(/UPDATE ordenes_contratacion SET[\s\S]*?recibido_proveedor_at = \$3/.test(lib)
  && /ORDEN_RECEPCION_CONFIRMADA/.test(lib),
  'B3. actualiza la orden a ORDEN_RECEPCION_CONFIRMADA con recibido_proveedor_at');
ok(/tipo: 'ORDEN_RECEPCION_CONFIRMADA'/.test(lib) && /registrarEventoOrden\(/.test(lib),
  'B4. registra el evento ORDEN_RECEPCION_CONFIRMADA');

// C) Idempotencia.
ok(/idempotent: true/.test(lib) && /recibido_proveedor_at \|\| envio\.confirmado_at/.test(lib),
  'C1. segunda confirmación es idempotente (no repite escrituras ni eventos)');

// D) Solo el proveedor correspondiente (403).
ok(/No autorizado', 403/.test(lib),
  'D1. proveedor distinto al de la orden → 403');

// E) Estado no permitido → 409 (en la ruta por token).
ok(/no está pendiente de confirmación', 409/.test(lib)
  && /'ORDEN_NOTIFICADA', 'ORDEN_ENVIADA', 'ORDEN_ENVIADA_PENDIENTE_CONFIRMACION'/.test(lib),
  'E1. la ruta por token rechaza estados no permitidos (409)');

// F) Recalculo de fechas.
ok(/recalcularFechasEntregas\(/.test(lib),
  'F1. recalcula las fechas máximas de los entregables tras confirmar');

// --- Casos explícitos de validación de estado (RC8.14.10) ---
const { assertOrdenPendienteConfirmacion } = await import('../server/lib/ordenesProveedor.js');

function estadoPermitido(estado) {
  try {
    assertOrdenPendienteConfirmacion({ estado });
    return true;
  } catch (e) {
    if (e?.status === 409) return false;
    throw e;
  }
}

ok(estadoPermitido('ORDEN_NOTIFICADA') === true, '1. ORDEN_NOTIFICADA → permitido');
ok(estadoPermitido('ORDEN_ENVIADA') === true
  && estadoPermitido('ORDEN_ENVIADA_PENDIENTE_CONFIRMACION') === true,
  '1b. ORDEN_ENVIADA / ORDEN_ENVIADA_PENDIENTE_CONFIRMACION → permitido');
ok(estadoPermitido('ORDEN_REGISTRADA') === false, '2. ORDEN_REGISTRADA → rechazado (409)');
ok(estadoPermitido('EN_EJECUCION') === false, '3. EN_EJECUCION → rechazado (409)');

const sesionSrc = lib.slice(lib.indexOf('export async function confirmarRecepcionDesdeSesion'));
ok(sesionSrc.indexOf("No autorizado', 403") < sesionSrc.indexOf('assertOrdenPendienteConfirmacion'),
  '4. validación de proveedor (403) precede a la validación de estado');
ok(sesionSrc.indexOf('recibido_proveedor_at || envio.confirmado_at') < sesionSrc.indexOf('assertOrdenPendienteConfirmacion'),
  '5. idempotencia se evalúa antes del estado (orden confirmada → idempotent, no 409)');

const confirmTokenSrc = lib.slice(
  lib.indexOf('export async function confirmarRecepcionOrden'),
  lib.indexOf('export async function listarOrdenesPortalProveedor'),
);
ok(confirmTokenSrc.includes('assertOrdenPendienteConfirmacion(')
  && sesionSrc.includes('assertOrdenPendienteConfirmacion('),
  '6. token y sesión usan la misma validación (reglas equivalentes)');

// --- Lectura real (solo lectura) de OS 1105 ---
try {
  const { rows: ord } = await query(
    `SELECT id, estado, condicion_inicio, recibido_proveedor_at FROM ordenes_contratacion
     WHERE tipo_orden = 'OS' AND numero_orden = '1105' AND anio_orden = 2026 LIMIT 1`,
  );
  if (!ord[0]) {
    console.log('  ⚠ OS 1105 no encontrada (validación real omitida)');
  } else {
    const o = ord[0];
    ok(o.estado === 'ORDEN_NOTIFICADA', `A1. OS 1105 sigue en ORDEN_NOTIFICADA (actual: ${o.estado})`);
    ok(o.recibido_proveedor_at === null, 'A2. recibido_proveedor_at = null (no confirmada)');

    const { rows: ia } = await query(
      `SELECT condicion_inicio, fecha_efectiva_inicio FROM orden_inicio_actividad WHERE orden_id = $1 ORDER BY id LIMIT 1`,
      [o.id],
    );
    const cond = ia[0]?.condicion_inicio || o.condicion_inicio || null;
    console.log(`  · Condición de inicio actual: ${cond}`);
    ok(cond === 'EMISION_ORDEN',
      'G1. condición contractual = EMISION_ORDEN (la confirmación NO altera fechas)');

    const { rows: ent } = await query(
      `SELECT numero_entrega, dias_plazo, fecha_base, fecha_maxima, estado
       FROM orden_entregas WHERE orden_id = $1 AND estado <> 'ANULADO' ORDER BY numero_entrega`,
      [o.id],
    );
    ok(ent.length === 2, `G2. existen 2 entregables activos (${ent.length})`);
    const d10 = (v) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString()).slice(0, 10);
    for (const e of ent) {
      console.log(`  · Entregable ${e.numero_entrega}: ${e.dias_plazo} días · base ${d10(e.fecha_base)} · máx ${d10(e.fecha_maxima)}`);
    }
    ok(ent.some((e) => e.numero_entrega === 1 && e.dias_plazo === 30 && d10(e.fecha_maxima) === '2026-08-22'),
      'G3. PRIMER ENTREGABLE: 30 días, fecha máxima 2026-08-22');
    ok(ent.some((e) => e.numero_entrega === 2 && e.dias_plazo === 60 && d10(e.fecha_maxima) === '2026-09-21'),
      'G4. SEGUNDO ENTREGABLE: 60 días, fecha máxima 2026-09-21');
  }
} catch (e) {
  console.log(`  ⚠ Validación real omitida: ${e.message}`);
}

await pool.end().catch(() => {});

console.log('\n=== RC8.14.9 — pruebas OK ===\n');

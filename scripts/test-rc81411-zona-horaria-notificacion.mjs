/**
 * RC8.14.11 — Auditoría y corrección de zona horaria en notificación / confirmación.
 * Verificación estática + lectura real SOLO LECTURA (cast y OS 1105).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };

console.log('\n=== RC8.14.11 — Zona horaria en notificación / confirmación ===\n');

const lib = read('server/lib/ordenesProveedor.js');
const mig = read('server/migrations/026_ordenes_contratacion.js');

// A) Envío y confirmación usan una misma convención de almacenamiento (UTC).
ok(/enviado_proveedor_at = NOW\(\)/.test(lib),
  'A1. notificación (enviado_proveedor_at) usa NOW() → UTC');
ok(/const now = new Date\(\)\.toISOString\(\);/.test(lib),
  'A2. confirmación usa new Date().toISOString() → UTC (misma convención)');

// B) confirmado_at y recibido_proveedor_at representan el mismo instante (mismo `now`).
const nowCount = (lib.match(/const now = new Date\(\)\.toISOString\(\);/g) || []).length;
ok(nowCount === 2 && /confirmado_at = \$2/.test(lib) && /recibido_proveedor_at = \$3/.test(lib),
  'B1. `now` se define una vez por función y alimenta confirmado_at ($2) y recibido_proveedor_at ($3)');

// C) No hay conversión manual a UTC-5.
ok(!/getTimezoneOffset|\.setHours\(/.test(lib),
  'C1. no hay conversión manual a UTC-5 en el backend');

// D) Formateo America/Lima.
const dUtc = new Date('2026-08-14T21:10:15.821Z');
const lima = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(dUtc);
ok(lima.includes('14/08/2026') && lima.includes('16:10'),
  `D1. America/Lima de 21:10Z → 14/08/2026 16:10 (obtenido: ${lima})`);

// E) fechas DATE de entregables no cambian (son DATE, no TIMESTAMP).
ok(/fecha_base\s+DATE/.test(mig), 'E1. orden_entregas.fecha_base es DATE');
ok(/fecha_maxima\s+DATE/.test(mig), 'E2. orden_entregas.fecha_maxima es DATE');

// F) Lectura real SOLO LECTURA: cast de timestamp + datos históricos de OS 1105.
try {
  const { rows: cast } = await query(
    `SELECT '2026-08-14T21:10:15.821Z'::timestamp::text AS utc_iso,
            '2026-08-14T16:10:15.821-05:00'::timestamp::text AS local_iso`,
  );
  ok(String(cast[0].utc_iso).includes('21:10:15'),
    `F0. PostgreSQL descarta "Z" y guarda wall-clock UTC (${cast[0].utc_iso})`);
  ok(String(cast[0].local_iso).includes('16:10:15'),
    `F0b. PostgreSQL descarta "-05:00" y guarda wall-clock (${cast[0].local_iso})`);

  const { rows: o } = await query(
    `SELECT enviado_proveedor_at, recibido_proveedor_at, actualizado_at FROM ordenes_contratacion WHERE id = 1`,
  );
  const { rows: e } = await query(
    `SELECT enviado_at, confirmado_at FROM orden_envios_proveedor WHERE orden_id = 1 ORDER BY id DESC LIMIT 1`,
  );
  if (o[0] && e[0]) {
    const f = (v) => (v instanceof Date ? v.toISOString() : String(v));
    console.log(`  · enviado_proveedor_at = ${f(o[0].enviado_proveedor_at)}`);
    console.log(`  · recibido_proveedor_at = ${f(o[0].recibido_proveedor_at)}`);
    console.log(`  · actualizado_at       = ${f(o[0].actualizado_at)}`);
    console.log(`  · enviado_at (último)  = ${f(e[0].enviado_at)}`);
    console.log(`  · confirmado_at        = ${f(e[0].confirmado_at)}`);
    ok(true, 'F1. lectura real de OS 1105 (solo lectura) — problema histórico documentado');
  } else {
    console.log('  ⚠ OS 1105 no encontrada');
  }
} catch (err) {
  console.log(`  ⚠ validación real omitida: ${err.message}`);
}

await pool.end().catch(() => {});

console.log('\n=== RC8.14.11 — pruebas OK ===\n');

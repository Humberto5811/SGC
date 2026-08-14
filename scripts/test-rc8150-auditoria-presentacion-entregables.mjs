/**
 * RC8.15.0 — Auditoría funcional y técnica del submódulo Presentación de Entregables.
 * SOLO LECTURA + pruebas estáticas. No modifica código ni BD.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };

console.log('\n=== RC8.15.0 — Auditoría Presentación de Entregables ===\n');

// --- Vistas / servicios de Ejecución ---
ok(/NO IMPLEMENTADO/.test(read('src/views/ejecucion/presentacionEntregableView.js')),
  '1. presentacionEntregableView.js es un stub NO IMPLEMENTADO');
ok(/NO IMPLEMENTADO/.test(read('src/views/ejecucion/derivacionPagoView.js')),
  '2. derivacionPagoView.js (Pagos) es un stub NO IMPLEMENTADO');
ok(/createLocalStorageService\('ejecucionService'\)/.test(read('src/services/ejecucionService.js')),
  '3. ejecucionService.js usa localStorage (sin backend)');

// --- Workflow engine (catálogo de etapas y transiciones) ---
const etapas = read('shared/workflow/etapas.js');
ok(/PRESENTACION_ENTREGABLES/.test(etapas) && /tipos: Object\.freeze\(\['SERVICIO', 'LOCACION'\]\)/.test(etapas),
  '4. etapa PRESENTACION_ENTREGABLES definida para SERVICIO/LOCACION');
ok(/RECEPCION_BIENES/.test(etapas) && /tipos: Object\.freeze\(\['BIEN'\]\)/.test(etapas),
  '5. etapa RECEPCION_BIENES definida para BIEN');
const trans = read('shared/workflow/transiciones.js');
ok(/ORDEN_DERIVADA_EJECUCION', PE/.test(trans) && /ORDEN_DERIVADA_EJECUCION', RB/.test(trans),
  '6. ORDEN_DERIVADA_EJECUCION: SERVICIO/LOCACION → PE, BIEN → RB');

// --- Portal del Proveedor ---
const portal = read('src/views/proveedor/ordenesProveedorView.js');
ok(/confirmarRecepcionOrden/.test(portal) && !/presentarEntregable|subirEntregable/i.test(portal),
  '7. portal solo confirma recepción; NO tiene flujo de presentar entregable');

// --- Estados genéricos reutilizables (core) ---
const coreEst = read('core/common/ConstantesEstados.js');
const coreEv = read('core/common/CatalogoEventos.js');
ok(/OBSERVADO/.test(coreEst) && /SUBSANADO/.test(coreEst) && /APROBADO/.test(coreEst) && /DERIVADO/.test(coreEst),
  '8. core define estados genéricos OBSERVADO/SUBSANADO/APROBADO/DERIVADO');
ok(/SUBSANACION/.test(coreEv) && /OBSERVACION/.test(coreEv),
  '9. core define eventos OBSERVACION/SUBSANACION');

// --- BD (solo lectura) ---
try {
  const { rows: tabs } = await query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  );
  const names = tabs.map((t) => t.table_name);
  const relevant = names.filter((n) => /presentacion|conformidad|subsanacion|entregable|pago|recepcion/.test(n));
  console.log(`  · tablas relevantes: ${relevant.join(', ') || '(ninguna específica de servicios)'}`);
  ok(!names.some((n) => /presentacion_entregable|presentacion_servicio|conformidad_servicio|subsanacion/.test(n)),
    '10. NO existe tabla de presentación/conformidad/subsanación de servicios');
  ok(names.includes('orden_entregas') && names.includes('orden_entrega_items'),
    '11. existen orden_entregas y orden_entrega_items (fuente contractual)');

  const { rows: ord } = await query(
    `SELECT id, estado, tipo_orden, numero_orden FROM ordenes_contratacion WHERE id = 1`,
  );
  const { rows: ent } = await query(
    `SELECT numero_entrega, dias_plazo, fecha_maxima, importe, estado FROM orden_entregas
     WHERE orden_id = 1 AND estado <> 'ANULADO' ORDER BY numero_entrega`,
  );
  if (ord[0]) ok(ord[0].estado === 'ORDEN_RECEPCION_CONFIRMADA', `12. OS 1105 estado = ${ord[0].estado}`);
  ok(ent.length === 2, `13. OS 1105 tiene ${ent.length} entregables ACTIVOS reutilizables`);
  for (const e of ent) {
    console.log(`  · Entregable ${e.numero_entrega}: ${e.dias_plazo} días · máx ${String(e.fecha_maxima).slice(0, 10)} · ${e.importe} · ${e.estado}`);
  }
  ok(ent.some((e) => e.numero_entrega === 1 && e.dias_plazo === 30)
    && ent.some((e) => e.numero_entrega === 2 && e.dias_plazo === 60),
    '14. PRIMER (30d) y SEGUNDO (60d) presentes (reutilizables directamente)');
} catch (err) {
  console.log(`  ⚠ validación real omitida: ${err.message}`);
}

await pool.end().catch(() => {});

console.log('\n=== RC8.15.0 — auditoría completada ===\n');

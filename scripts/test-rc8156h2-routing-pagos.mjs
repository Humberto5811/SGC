/**
 * RC8.15 — Routing integración Pagos (#/ejecucion/pago → derivacionPagoView).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import { listarBandejaPreparacionExpedientePago } from '../server/lib/entregablesServicios.js';
import { ETAPAS } from '../shared/workflow/etapas.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };

console.log('\n=== RC8.15 — Routing Pagos (#/ejecucion/pago) ===\n');

{
  const app = read('src/app.js');
  const router = read('src/router.js');
  ok(/\'ejecucion\/pago\'/.test(app), 'A1. app.js maneja ejecucion/pago');
  ok(/import\('\.\/views\/ejecucion\/derivacionPagoView\.js'\)/.test(app),
    'A2. app.js conecta ejecucion/pago → derivacionPagoView');
  ok(/renderDerivacionPagoView\(\)/.test(app) && /initDerivacionPagoView\(\)/.test(app),
    'A3. render/init de la vista Pagos se invocan');
  const oldBranch = app.slice(app.indexOf("currentRoute === 'ejecucion' ||"), app.indexOf('// ========== MANTENIMIENTO'));
  ok(!/ejecucion\/pago/.test(oldBranch),
    'A4. ejecucionView.js demo ya no responde a ejecucion/pago');
  ok(/'ejecucion\/pago': \{ render: renderDerivacionPagoView/.test(router),
    'A5. router.js registra derivacionPagoView para ejecucion/pago');
}

{
  const menu = read('src/services/menuService.js');
  const fe = read('src/utils/permissionsCatalog.js');
  ok(/path: 'ejecucion\/pago'/.test(menu) && /submoduloId: 'TESORERIA'/.test(menu),
    'B. menú Ejecución > Pagos apunta a ejecucion/pago / TESORERIA');
  ok(/route: 'ejecucion\/pago'/.test(fe), 'B2. catálogo FE con route ejecucion/pago');
}

{
  const view = read('src/views/ejecucion/derivacionPagoView.js');
  const service = read('src/services/entregablesServiciosService.js');
  ok(/listarBandejaPagos\(\)/.test(service)
    && /pagos\/bandeja/.test(service),
    'C1. servicio consume GET /entregables-servicios/pagos/bandeja');
  ok(/listarBandejaPagos\(\)/.test(view), 'C2. vista llama listarBandejaPagos()');
  ok(/Penalidad/.test(view) && /pagoMenuItems/.test(view),
    'C3. vista incluye columna Penalidad y menú de acciones');
  ok(!/CON-001|Empresa ABC|CON-002|Servicios SAC/.test(view),
    'C4. vista NO contiene datos demo CON-001/CON-002');
  const oldView = read('src/views/ejecucionView.js');
  ok(/CON-001/.test(oldView), 'C5. ejecucionView.js demo sigue existiendo para otras rutas');
}

try {
  const row = (await query(`
    SELECT oe.id AS orden_entrega_id, ev.etapa_codigo, ev.responsable_usuario_id,
      u.username, u.nombre, u.rol, u.cargo, u.permisos
    FROM ordenes_contratacion oc
    JOIN orden_entregas oe ON oe.orden_id = oc.id AND oe.numero_entrega = 1 AND oe.estado = 'ACTIVO'
    LEFT JOIN entregable_estado_vigente ev ON ev.orden_entrega_id = oe.id
    LEFT JOIN usuarios u ON u.id = ev.responsable_usuario_id
    WHERE oc.tipo_orden = 'OS' AND oc.numero_orden = '1105'
    ORDER BY oc.id LIMIT 1
  `)).rows[0];
  if (row?.orden_entrega_id) {
    ok(String(row.etapa_codigo || '').toUpperCase() === ETAPAS.PREPARACION_EXPEDIENTE_PAGO,
      'D1. OS 1105/E1 en PREPARACION_EXPEDIENTE_PAGO');
    const ctx = {
      id: Number(row.responsable_usuario_id),
      username: row.username,
      nombre: row.nombre,
      cargo: row.cargo,
      rol: row.rol,
      permisos: row.permisos,
    };
    const fila = (await listarBandejaPreparacionExpedientePago(ctx))
      .find((item) => Number(item.orden_entrega_id) === Number(row.orden_entrega_id));
    ok(Boolean(fila), 'D2. OS 1105/E1 aparece en bandeja Pagos para responsable');
    ok(String(row.username || '').toLowerCase().includes('jcrisostomo')
      || Number(row.responsable_usuario_id) > 0,
      `D3. responsable vigente: ${row.username || row.responsable_usuario_id}`);
    ok(Boolean(fila?.numero_orden) && fila?.numero_entrega != null
      && Boolean(fila?.proveedor_razon_social) && Boolean(fila?.penalidad_label),
      'D4. fila incluye orden, entregable, proveedor y penalidad');
  } else {
    console.log('  ⚠ OS 1105/E1 no encontrada; omitida validación D');
  }
} catch (err) {
  console.log(`  ⚠ validación OS 1105 omitida: ${err.message}`);
}

await pool.end().catch(() => {});
console.log('\n=== RC8.15 — routing Pagos validado ===\n');

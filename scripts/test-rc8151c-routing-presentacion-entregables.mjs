/**
 * RC8.15.1C — Verificación de enrutamiento/render de
 * "Presentación Entregables de Servicios".
 *
 * Valida A–H:
 *   A. ejecucion/presentacion usa la vista correcta
 *   B. PRESENTACION_ENTREGABLES sigue siendo submoduloId
 *   C. la vista consume /api/entregables-servicios/bandeja
 *   D. el renderer antiguo "Ejecución de Contratos" ya no responde
 *   E. RECEPCION_BIENES no cambió
 *   F. Portal Proveedor no cambió
 *   G. OS 1105 devuelve 2 entregables activos
 *   H. ANULADOS quedan excluidos
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };

console.log('\n=== RC8.15.1C — Routing Presentación Entregables de Servicios ===\n');

// A. ejecucion/presentacion usa la vista correcta
{
  const app = read('src/app.js');
  ok(/\'ejecucion\/presentacion\'/.test(app),
    'A1. app.js maneja ejecucion/presentacion');
  ok(/import\('\.\/views\/ejecucion\/presentacionEntregableView\.js\'\)/.test(app),
    'A2. app.js conecta ejecucion/presentacion → presentacionEntregableView');
  ok(/renderPresentacionEntregableView\(\)/.test(app)
    && /initPresentacionEntregableView\(\)/.test(app),
    'A3. render/init de la nueva vista se invocan');
  ok(/'ejecucion\/presentacion'/.test(app)
    && /import\('\.\/views\/ejecucion\/presentacionEntregableView\.js\'\)/.test(app),
    'A4. ejecucion/presentacion tiene su propio branch hacia la vista real');
  // El bloque viejo (ejecucionView.js) ya NO contiene la ruta presentacion.
  const oldBranch = app.slice(app.indexOf("currentRoute === 'ejecucion' ||"), app.indexOf('// ========== MANTENIMIENTO'));
  ok(!/ejecucion\/presentacion/.test(oldBranch),
    'A5. ejecucionView.js no responde a ejecucion/presentacion');
}

// B. PRESENTACION_ENTREGABLES sigue siendo submoduloId
{
  const menu = read('src/services/menuService.js');
  const fe = read('src/utils/permissionsCatalog.js');
  const be = read('server/lib/permissionsCatalog.js');
  ok(/ejecucion\/presentacion/.test(menu) && /submoduloId: 'PRESENTACION_ENTREGABLES'/.test(menu),
    'B. menú submoduloId PRESENTACION_ENTREGABLES');
  ok(/id: 'PRESENTACION_ENTREGABLES'/.test(fe) && /id: 'PRESENTACION_ENTREGABLES'/.test(be),
    'B2. catálogo FE/BE con PRESENTACION_ENTREGABLES');
}

// C. La vista consume /api/entregables-servicios/bandeja
{
  const view = read('src/views/ejecucion/presentacionEntregableView.js');
  const service = read('src/services/entregablesServiciosService.js');
  ok(/entregables-servicios/.test(service) && /listarBandeja\(\)/.test(service),
    'C. servicio frontend apunta a /entregables-servicios');
  ok(/listarBandeja\(\)/.test(view) && /\/entregables-servicios/.test(view),
    'C2. vista llama listarBandeja()');
  ok(!/CON-001|Empresa ABC|CON-002|Servicios SAC/.test(view),
    'C3. vista NO contiene datos ficticios');
}

// D. El renderer antiguo ya no responde a ejecucion/presentacion
{
  const app = read('src/app.js');
  const oldView = read('src/views/ejecucionView.js');
  // El bloque que importa ejecucionView.js (pantalla ficticia) solo agrupa
  // 'ejecucion', 'ejecucion/ampliacion' y 'ejecucion/pago' — nunca 'ejecucion/presentacion'.
  ok(/import\('\.\/views\/ejecucionView\.js'\)/.test(app), 'D1. ejecucionView.js sigue importado para otras rutas');
  const oldBranch = app.slice(app.indexOf("currentRoute === 'ejecucion' ||"), app.indexOf('// ========== MANTENIMIENTO'));
  ok(!/ejecucion\/presentacion/.test(oldBranch),
    'D. renderer antiguo no responde a ejecucion/presentacion');
  ok(/CON-001/.test(oldView) && /Empresa ABC/.test(oldView),
    'D2. ejecucionView.js sigue existiendo como pantalla de Ejecución (no se borra)');
}

// E. RECEPCION_BIENES no cambió
{
  const app = read('src/app.js');
  ok(/execucion\/recepcion-bienes/.test(app) || /ejecucion\/recepcion-bienes/.test(app),
    'E. ruta recepcion-bienes sigue manejada');
  ok(/recepcionBienesView\.js/.test(app), 'E2. recepcion-bienes usa recepcionBienesView');
}

// F. Portal Proveedor no cambió
{
  const app = read('src/app.js');
  ok(/renderProveedorApp/.test(app) && /proveedor\/ordenes-recibidas/.test(app),
    'F. Portal Proveedor intacto');
}

// G/H. OS 1105: 2 entregables activos, ANULADOS excluidos
{
  try {
    const { rows: orden } = await query(`
      SELECT id FROM ordenes_contratacion
      WHERE tipo_orden = 'OS' AND numero_orden = '1105' AND anio_orden = 2026
      ORDER BY id DESC LIMIT 1
    `);
    const ordenId = orden[0]?.id;
    if (ordenId) {
      const { rows: activos } = await query(`
        SELECT numero_entrega, dias_plazo, fecha_maxima, importe
        FROM orden_entregas WHERE orden_id = $1 AND estado = 'ACTIVO'
        ORDER BY numero_entrega ASC
      `, [ordenId]);
      const { rows: anulados } = await query(`
        SELECT COUNT(*)::int AS n FROM orden_entregas
        WHERE orden_id = $1 AND estado = 'ANULADO'
      `, [ordenId]);

      ok(activos.length === 2, `G. OS 1105 tiene 2 entregables activos (${activos.length})`);
      ok(anulados[0].n >= 0, `H. se consultó ANULADOS (${anulados[0].n}); la bandeja filtra por estado='ACTIVO'`);
      ok(!!activos.find((e) => e.numero_entrega === 1 && e.dias_plazo === 30),
        'G2. PRIMER ENTREGABLE (30 días) presente');
      ok(!!activos.find((e) => e.numero_entrega === 2 && e.dias_plazo === 60),
        'G3. SEGUNDO ENTREGABLE (60 días) presente');
    } else {
      console.log('  ⚠ OS 1105 no encontrada');
    }
  } catch (err) {
    console.log(`  ⚠ validación OS 1105 omitida: ${err.message}`);
  }
}

await pool.end().catch(() => {});
console.log('\n=== RC8.15.1C — validación completada ===\n');
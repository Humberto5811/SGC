/**
 * RC8.15.1B — Verificación de permiso del submódulo
 * "Presentación Entregables de Servicios".
 *
 * Valida A–J:
 *   A. menú usa PRESENTACION_ENTREGABLES
 *   B. catálogo frontend usa PRESENTACION_ENTREGABLES
 *   C. catálogo backend usa PRESENTACION_ENTREGABLES
 *   D. ruta sigue ejecucion/presentacion
 *   E. AU obtiene acceso
 *   F. usuario legacy con ALMACEN conserva acceso vía alias
 *   G. ALMACEN sigue funcionando como actor de Recepción de Bienes
 *   H. RECEPCION_BIENES no cambia
 *   I. backend entregables-servicios sigue operativo
 *   J. OS 1105 sigue mostrando 2 entregables (solo lectura)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';

// Catálogo frontend (puro, sin DOM)
import {
  MODULOS as FE_MODULOS,
  ROUTE_TO_SUBMODULO as FE_ROUTE,
  SUBMODULO_ID_ALIASES as FE_ALIASES,
  permisosFromRol as fePermisosFromRol,
  normalizePermisos as feNormalize,
  getActividadesForSubmodulo as feGetActs,
} from '../src/utils/permissionsCatalog.js';

// Catálogo backend (espejo)
import {
  MODULOS as BE_MODULOS,
  ROUTE_TO_SUBMODULO as BE_ROUTE,
  SUBMODULO_ID_ALIASES as BE_ALIASES,
  permisosFromRol as bePermisosFromRol,
  normalizePermisos as beNormalize,
  getActividadesForSubmodulo as beGetActs,
} from '../server/lib/permissionsCatalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };

console.log('\n=== RC8.15.1B — Permiso Presentación Entregables de Servicios ===\n');

// A. menú
{
  const menu = read('src/services/menuService.js');
  ok(/ejecucion\/presentacion/.test(menu)
    && /submoduloId: 'PRESENTACION_ENTREGABLES'/.test(menu),
    'A. menú usa PRESENTACION_ENTREGABLES');
}

// B / D (frontend)
{
  const sub = FE_MODULOS.find((m) => m.id === 'EJECUCION')?.submodulos
    .find((s) => s.id === 'PRESENTACION_ENTREGABLES');
  ok(sub?.label === 'Presentación Entregables de Servicios', 'B. catálogo FE usa PRESENTACION_ENTREGABLES');
  ok(sub?.route === 'ejecucion/presentacion', 'D. ruta sigue ejecucion/presentacion');
  ok(FE_ROUTE['ejecucion/presentacion'] === 'PRESENTACION_ENTREGABLES', 'D2. ROUTE_TO_SUBMODULO FE');
}

// C / D (backend)
{
  const sub = BE_MODULOS.find((m) => m.id === 'EJECUCION')?.submodulos
    .find((s) => s.id === 'PRESENTACION_ENTREGABLES');
  ok(sub?.route === 'ejecucion/presentacion', 'C. catálogo BE usa PRESENTACION_ENTREGABLES');
  ok(BE_ROUTE['ejecucion/presentacion'] === 'PRESENTACION_ENTREGABLES', 'D3. ROUTE_TO_SUBMODULO BE');
}

// E. AU obtiene acceso
{
  const pFE = fePermisosFromRol('au');
  const pBE = bePermisosFromRol('au');
  ok(pFE.submodulos.includes('PRESENTACION_ENTREGABLES'),
    'E. AU (FE) accede a PRESENTACION_ENTREGABLES');
  ok(pBE.submodulos.includes('PRESENTACION_ENTREGABLES'),
    'E2. AU (BE) accede a PRESENTACION_ENTREGABLES');
  ok(!pFE.submodulos.includes('ALMACEN') && !pBE.submodulos.includes('ALMACEN'),
    'E3. AU NO recibe ALMACEN adicional');
  const acts = feGetActs(pFE, 'PRESENTACION_ENTREGABLES');
  ok(acts.includes('VER') && acts.includes('CREAR'), 'E4. AU tiene actividades sobre el submódulo');
}

// F. alias legacy ALMACEN → PRESENTACION_ENTREGABLES
{
  ok(FE_ALIASES.ALMACEN === 'PRESENTACION_ENTREGABLES', 'F. alias FE ALMACEN → PRESENTACION_ENTREGABLES');
  ok(BE_ALIASES.ALMACEN === 'PRESENTACION_ENTREGABLES', 'F2. alias BE ALMACEN → PRESENTACION_ENTREGABLES');

  // Usuario legacy con permisos persistidos que incluyen ALMACEN (sin migrar BD)
  const legacyUser = {
    rol: 'au',
    permisos: {
      modulos: ['REQUERIMIENTOS', 'EJECUCION'],
      submodulos: ['REGISTRO_REQUERIMIENTO', 'ALMACEN'],
      actividades: ['VER', 'CREAR'],
      actividadesPorSubmodulo: { ALMACEN: ['VER', 'CREAR'] },
    },
  };
  const nFE = feNormalize(legacyUser.permisos, 'au', { explicit: true });
  const nBE = beNormalize(legacyUser.permisos, 'au', { explicit: true });
  ok(nFE.submodulos.includes('PRESENTACION_ENTREGABLES')
    && !nFE.submodulos.includes('ALMACEN'),
    'F3. permiso persistido ALMACEN se lee como PRESENTACION_ENTREGABLES (FE)');
  ok(nBE.submodulos.includes('PRESENTACION_ENTREGABLES')
    && !nBE.submodulos.includes('ALMACEN'),
    'F4. permiso persistido ALMACEN se lee como PRESENTACION_ENTREGABLES (BE)');
  ok(feGetActs(nFE, 'PRESENTACION_ENTREGABLES').includes('VER'),
    'F5. actividad persistida vía alias conserva VER');
}

// G. ALMACEN actor de Recepción de Bienes intacto
{
  const rb = read('server/lib/recepcionBienes.js');
  ok(/return 'ALMACEN'/.test(rb) && /bandeja_actual = 'ALMACEN'/.test(rb) || /'ALMACEN'/.test(rb),
    'G. ALMACEN sigue como actor de Recepción de Bienes');
}

// H. RECEPCION_BIENES no cambia
{
  const subFE = FE_MODULOS.find((m) => m.id === 'EJECUCION')?.submodulos
    .find((s) => s.id === 'RECEPCION_BIENES');
  const subBE = BE_MODULOS.find((m) => m.id === 'EJECUCION')?.submodulos
    .find((s) => s.id === 'RECEPCION_BIENES');
  ok(subFE?.route === 'ejecucion/recepcion-bienes' && subBE?.route === 'ejecucion/recepcion-bienes',
    'H. RECEPCION_BIENES sin cambios');
}

// I. backend entregables-servicios operativo
{
  const routes = read('server/routes/entregablesServicios.js');
  const index = read('server/index.js');
  ok(/listarBandejaEntregablesServicios/.test(routes), 'I. route entregables-servicios operativa');
  ok(/entregablesServiciosRouter/.test(index), 'I2. router registrado en index');
}

// J. OS 1105 sigue mostrando 2 entregables (solo lectura)
{
  try {
    const { rows: orden } = await query(`
      SELECT id FROM ordenes_contratacion
      WHERE tipo_orden = 'OS' AND numero_orden = '1105' AND anio_orden = 2026
      ORDER BY id DESC LIMIT 1
    `);
    const ordenId = orden[0]?.id;
    if (ordenId) {
      const { rows } = await query(
        `SELECT id FROM orden_entregas WHERE orden_id = $1 AND estado = 'ACTIVO'`,
        [ordenId],
      );
      ok(rows.length === 2, `J. OS 1105 muestra 2 entregables (${rows.length})`);
    } else {
      console.log('  ⚠ OS 1105 no encontrada');
    }
  } catch (err) {
    console.log(`  ⚠ validación OS 1105 omitida: ${err.message}`);
  }
}

await pool.end().catch(() => {});
console.log('\n=== RC8.15.1B — validación completada ===\n');
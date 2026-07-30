/**
 * RC119 — Permisos → menú lateral (módulos / submódulos / actividades).
 *
 * Ejecutar en VPS:
 *   node scripts/test-rc119-permisos-menu-usuario.mjs
 *
 * No ejecutar npm en PC institucional. Esta prueba es estática (sin BD).
 */
import assert from 'node:assert/strict';
import {
  resolveUserPermissions,
  getActividadesForSubmodulo,
  permisosFromRol,
  emptyPermisos,
} from '../src/utils/permissionsCatalog.js';
import { getMenuForUser } from '../src/services/menuService.js';
import { permissionsService } from '../src/services/permissionsService.js';

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function labelsTop(menu) {
  return menu.map((i) => i.label || i.path);
}

function collectPaths(items, out = []) {
  for (const it of items || []) {
    if (it.path) out.push(it.path);
    if (it.submenu) collectPaths(it.submenu, out);
  }
  return out;
}

function userWith(permisos, rol = 'usuario') {
  return { id: 1, rol, nombre: 'Prueba', permisos };
}

console.log('\n=== RC119 — Permisos y menú ===\n');

// 1. Administrador
{
  const admin = userWith(null, 'admin');
  const p = resolveUserPermissions(admin);
  assert.ok(p.modulos.includes('REQUERIMIENTOS'));
  assert.ok(p.modulos.includes('MANTENIMIENTO'));
  const menu = getMenuForUser(admin);
  const tops = labelsTop(menu);
  assert.ok(tops.includes('Requerimientos'));
  assert.ok(tops.includes('Contrataciones'));
  assert.ok(tops.includes('Ejecución'));
  assert.ok(tops.includes('Mantenimiento'));
  ok('admin: menú completo');
}

// 2. Solo Requerimientos (Registro + Evaluación)
{
  const permisos = {
    modulos: ['REQUERIMIENTOS'],
    submodulos: ['REGISTRO_REQUERIMIENTO', 'EVALUACION_REQUERIMIENTO'],
    actividades: ['VER', 'CREAR'],
    actividadesPorSubmodulo: {
      REGISTRO_REQUERIMIENTO: ['VER', 'CREAR'],
      EVALUACION_REQUERIMIENTO: ['VER', 'CREAR'],
    },
  };
  const u = userWith(permisos, 'usuario');
  const menu = getMenuForUser(u);
  const tops = labelsTop(menu);
  assert.ok(tops.includes('Requerimientos'), 'debe ver Requerimientos');
  assert.ok(!tops.includes('Contrataciones'), 'no Contrataciones');
  assert.ok(!tops.includes('Ejecución'), 'no Ejecución');
  assert.ok(!tops.includes('Mantenimiento'), 'no Mantenimiento');
  const paths = collectPaths(menu);
  assert.ok(paths.includes('au/requerimientos/registro'));
  assert.ok(paths.includes('au/requerimientos/evaluacion'));
  assert.ok(!paths.includes('dec/dec'));
  assert.equal(permissionsService.canAccessRoute('au/requerimientos/registro', 'VER', u), true);
  assert.equal(permissionsService.canAccessRoute('dec/dec', 'VER', u), false);
  ok('solo Requerimientos: menú y rutas correctos');
}

// 3. Solo Contrataciones (DEC)
{
  const permisos = {
    modulos: ['CONTRATACIONES'],
    submodulos: ['DEC', 'PROGRAMACION'],
    actividadesPorSubmodulo: { DEC: ['VER'], PROGRAMACION: ['VER'] },
    actividades: ['VER'],
  };
  const u = userWith(permisos, 'usuario');
  const menu = getMenuForUser(u);
  const tops = labelsTop(menu);
  assert.ok(tops.includes('Contrataciones'));
  assert.ok(!tops.includes('Requerimientos'));
  const paths = collectPaths(menu);
  assert.ok(paths.includes('dec/dec'));
  assert.ok(paths.includes('dec/programacion'));
  assert.ok(!paths.includes('dec/cuadro'));
  ok('solo Contrataciones (DEC+Programación)');
}

// 4. Solo Ejecución
{
  const permisos = {
    modulos: ['EJECUCION'],
    submodulos: ['RECEPCION_BIENES'],
    actividadesPorSubmodulo: { RECEPCION_BIENES: ['VER'] },
    actividades: ['VER'],
  };
  const u = userWith(permisos, 'usuario');
  const menu = getMenuForUser(u);
  assert.ok(labelsTop(menu).includes('Ejecución'));
  assert.ok(!labelsTop(menu).includes('Contrataciones'));
  assert.ok(collectPaths(menu).includes('ejecucion/recepcion-bienes'));
  ok('solo Ejecución');
}

// 5. Múltiples módulos (caso reportado)
{
  const permisos = {
    modulos: ['REQUERIMIENTOS', 'CONTRATACIONES', 'EJECUCION'],
    submodulos: [
      'REGISTRO_REQUERIMIENTO',
      'EVALUACION_REQUERIMIENTO',
      'DEC',
      'PROGRAMACION',
      'ACTOS_PREPARATORIOS',
      'INVITACIONES',
      'RECEPCION_BIENES',
    ],
    actividadesPorSubmodulo: {},
    actividades: [],
  };
  // Sin actividades explícitas: VER mínimo por submódulo autorizado
  permisos.submodulos.forEach((sid) => {
    assert.ok(getActividadesForSubmodulo(permisos, sid).includes('VER'));
  });
  const u = userWith(permisos, 'usuario');
  const tops = labelsTop(getMenuForUser(u));
  assert.ok(tops.includes('Requerimientos'));
  assert.ok(tops.includes('Contrataciones'));
  assert.ok(tops.includes('Ejecución'));
  assert.ok(!tops.includes('Mantenimiento'));
  assert.equal(permissionsService.canAccessRoute('au/requerimientos/registro', 'VER', u), true);
  assert.equal(permissionsService.canAccessRoute('dec/dec', 'VER', u), true);
  assert.equal(permissionsService.canAccessRoute('ejecucion/recepcion-bienes', 'VER', u), true);
  assert.equal(permissionsService.canAccessRoute('mantenimiento/usuarios', 'VER', u), false);
  ok('múltiples módulos (rol usuario) — ya no bloqueado por ROUTE_ROLES');
}

// 6. Sin permisos
{
  const u = userWith(emptyPermisos(), 'usuario');
  const tops = labelsTop(getMenuForUser(u));
  assert.ok(tops.includes('Dashboard') || tops.includes('dashboard') || tops.some((t) => /dashboard/i.test(String(t))));
  // Dashboard tiene path dashboard — label Dashboard
  assert.ok(tops.includes('Dashboard'));
  assert.ok(tops.includes('Portal de Proveedores'));
  assert.ok(!tops.includes('Requerimientos'));
  assert.ok(!tops.includes('Mantenimiento'));
  ok('sin permisos: solo Dashboard + Portal');
}

// 7–9. Submenú / actividades
{
  const permisos = {
    modulos: ['REQUERIMIENTOS'],
    submodulos: ['REGISTRO_REQUERIMIENTO'],
    actividadesPorSubmodulo: {
      REGISTRO_REQUERIMIENTO: ['VER', 'CREAR', 'EDITAR', 'ELIMINAR', 'DERIVAR', 'APROBAR', 'OBSERVAR'],
    },
    actividades: ['VER', 'CREAR', 'EDITAR', 'ELIMINAR', 'DERIVAR', 'APROBAR', 'OBSERVAR'],
  };
  const u = userWith(permisos, 'usuario');
  const paths = collectPaths(getMenuForUser(u));
  assert.ok(paths.includes('au/requerimientos/registro'));
  assert.ok(!paths.includes('au/requerimientos/evaluacion'));
  const acts = getActividadesForSubmodulo(resolveUserPermissions(u), 'REGISTRO_REQUERIMIENTO');
  assert.ok(acts.includes('VER') && acts.includes('CREAR') && acts.includes('APROBAR'));
  assert.equal(permissionsService.tieneActividad('ELIMINAR', u, 'REGISTRO_REQUERIMIENTO'), true);
  assert.equal(permissionsService.tieneActividad('FIRMAR', u, 'REGISTRO_REQUERIMIENTO'), false);
  ok('submódulo único + actividades');
}

// 10. Compatibilidad rol au sin JSON (plantilla)
{
  const u = { id: 2, rol: 'au', permisos: permisosFromRol('au') };
  const tops = labelsTop(getMenuForUser(u));
  assert.ok(tops.includes('Requerimientos'));
  assert.ok(tops.includes('Ejecución'));
  ok('compat rol au con plantilla');
}

console.log('\nRC119 OK — casos mínimos pasaron.\n');
console.log('SQL: scripts/sql/rc119-diagnostico-permisos-usuario.sql');

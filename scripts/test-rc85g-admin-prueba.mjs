/**
 * RC8.5-G — Modo Administrador para pruebas (actuar como).
 * No modifica Workflow; solo contexto de prueba + auditoría.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveRolRevision,
  resolveRolEfectivoRevision,
  normalizeActuarComo,
  labelRolRevision,
  ROLES_REVISION,
  ROLES_ACTUAR_COMO,
} from '../shared/cuadroComparativoRol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.5-G Modo Administrador (pruebas) ===\n');

assert(resolveRolRevision({ rol: 'admin' }) === ROLES_REVISION.ADMINISTRADOR, 'rol real Admin');
assert(normalizeActuarComo('coordinador_cm') === 'COORDINADOR_CM', 'normaliza actuar como');
assert(normalizeActuarComo('hacker') === '', 'rechaza rol inventado');
assert(ROLES_ACTUAR_COMO.includes('ANALISTA') && ROLES_ACTUAR_COMO.includes('DEC'), 'roles permitidos');

const adminCoord = resolveRolEfectivoRevision({ rol: 'admin' }, 'COORDINADOR_CM');
assert(adminCoord.modoPrueba === true, 'Admin modo prueba activo');
assert(adminCoord.rolReal === 'ADMINISTRADOR', 'rol real intacto');
assert(adminCoord.rolEfectivo === 'COORDINADOR_CM', 'efectivo Coordinador CM');
assert(adminCoord.actuarComo === 'COORDINADOR_CM', 'contexto Coordinador CM');

const adminDec = resolveRolEfectivoRevision({ rol: 'admin' }, 'DEC');
assert(adminDec.rolEfectivo === 'DEC', 'Admin actuando como DEC');

const adminAna = resolveRolEfectivoRevision({ rol: 'admin' }, 'ANALISTA');
assert(adminAna.rolEfectivo === 'ANALISTA', 'Admin actuando como Analista');

const sinCtx = resolveRolEfectivoRevision({ rol: 'admin' }, '');
assert(sinCtx.modoPrueba === false && sinCtx.rolEfectivo === 'ADMINISTRADOR',
  'sin actuar_como no eleva Admin a Coord');

let forbidden = false;
try {
  resolveRolEfectivoRevision({ cargo: 'Coordinador CM' }, 'DEC');
} catch (e) {
  forbidden = e.code === 'ADMIN_ACTUAR_COMO_FORBIDDEN';
}
assert(forbidden, 'Coord no puede actuar_como DEC');

let forbiddenAna = false;
try {
  resolveRolEfectivoRevision({ cargo: 'Especialista Contrataciones' }, 'COORDINADOR_CM');
} catch (e) {
  forbiddenAna = e.code === 'ADMIN_ACTUAR_COMO_FORBIDDEN';
}
assert(forbiddenAna, 'Analista no puede actuar_como Coord');

assert(labelRolRevision('COORDINADOR_CM') === 'Coordinador CM', 'label Coordinador CM');
assert(labelRolRevision('DEC') === 'DEC', 'label DEC');

// Fuentes FE/BE
const sharedSrc = fs.readFileSync(path.join(root, 'shared/cuadroComparativoRol.js'), 'utf8');
assert(sharedSrc.includes('resolveRolEfectivoRevision'), 'shared helper');
assert(sharedSrc.includes('ROLES_ACTUAR_COMO'), 'shared ROLES_ACTUAR_COMO');

const be = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
assert(be.includes('resolveRolEfectivoRevision'), 'BE usa rol efectivo');
assert(be.includes('modo_prueba') || be.includes('modoPrueba'), 'BE registra modo prueba');
assert(be.includes('usuario_real'), 'BE registra usuario real');
assert(be.includes('[Prueba Admin'), 'BE marca observación de prueba');

const portal = fs.readFileSync(path.join(root, 'server/routes/portal.js'), 'utf8');
assert(portal.includes('ADMIN_ACTUAR_COMO_FORBIDDEN'), 'ruta 403 modo prueba');
assert(portal.includes('delete body.cargo'), 'ruta limpia cargo del body');
assert(portal.includes('x-user-cargo'), 'privilegios desde headers');

const feAdmin = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoAdminPrueba.js'), 'utf8');
assert(feAdmin.includes('sessionStorage'), 'contexto en sessionStorage');
assert(feAdmin.includes('Administrador') && feAdmin.includes('actuando como'), 'banner Admin');
assert(!feAdmin.includes('URLSearchParams') && !feAdmin.includes('location.search'),
  'no lee contexto desde URL');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordModal.js'), 'utf8');
assert(modal.includes('adminPrueba'), 'modal modo prueba');
assert(modal.includes('actuar_como'), 'envía actuar_como');
assert(modal.includes('payloadRevision'), 'payload con contexto');
assert(!modal.includes('Solo supervisión Administrador'), 'ya no bloquea botones por supervisión');

const view = fs.readFileSync(path.join(root, 'src/views/contratacion/cuadroComparativoView.js'), 'utf8');
assert(view.includes('adminPrueba: true'), 'view abre con adminPrueba');
assert(view.includes('renderBannerAdminPrueba'), 'bandeja muestra banner');
assert(!view.includes('adminSupervision: true'), 'ya no abre solo supervisión');

const svc = fs.readFileSync(path.join(root, 'src/services/contratacionesService.js'), 'utf8');
assert(svc.includes('actuar_como') || svc.includes('safe'), 'service no reinyecta cargo/rol body');
assert(!/cargo:\s*body\.cargo/.test(svc), 'service dejó de elevar con body.cargo');

const failed = tests.filter((t) => !t.ok);
console.log(`\n=== Resultado: ${tests.length - failed.length}/${tests.length} ===\n`);
if (failed.length) process.exit(1);

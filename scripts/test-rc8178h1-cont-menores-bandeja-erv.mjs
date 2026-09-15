/**
 * RC8.17.8H1 — Bandeja Cont.Menores ERV-first + acceso operador.
 */
import assert from 'node:assert/strict';
import { listarBandejaActos } from '../server/lib/actosPreparatorios.js';
import { isExpedienteAsignadoAMi } from '../src/utils/actosModals.js';
import { permissionsService } from '../src/services/permissionsService.js';
import {
  esMiembroContMenoresBandejaAcceso,
  esCoordinadorActosUsuario,
} from '../shared/contMenoresBandejaAccess.js';
import { query } from '../server/db.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H1 — Bandeja Cont.Menores ERV-first ===\n');

const jcrisostomo = {
  id: 260,
  username: 'jcrisostomo',
  rol: 'operador',
  cargo: 'ANALISTA CM',
  centro: 'OA',
  codigo_centro_costo: '01.04.01.02.01',
  equipo_uad: 'CONT_MENORES',
  activo: true,
  permisos: {
    submodulos: ['INVITACIONES', 'CCP'],
    actividadesPorSubmodulo: { INVITACIONES: ['VER'] },
  },
};
const otroOper = {
  id: 21,
  username: 'gyllapuma',
  rol: 'operador',
  equipo_uad: 'CONT_MENORES',
  centro: 'OA',
  codigo_centro_costo: '01.04.01.02.01',
  activo: true,
  permisos: jcrisostomo.permisos,
};
const progUser = {
  id: 16,
  rol: 'coordinador',
  equipo_uad: 'PROGRAMACION',
  centro: 'OA',
  activo: true,
  permisos: { submodulos: ['PROGRAMACION'], actividadesPorSubmodulo: { PROGRAMACION: ['VER'] } },
};
const wendy = {
  id: 20,
  rol: 'coordinador',
  cargo: 'COORDINADOR-CM',
  equipo_uad: 'CONT_MENORES',
  centro: 'OA',
  activo: true,
  permisos: {
    submodulos: ['ACTOS_PREPARATORIOS'],
    actividadesPorSubmodulo: { ACTOS_PREPARATORIOS: ['VER', 'APROBAR', 'DERIVAR'] },
  },
};

ok(esMiembroContMenoresBandejaAcceso(jcrisostomo), 'E) operador CONT_MENORES acceso bandeja');
ok(!esMiembroContMenoresBandejaAcceso(progUser), 'H) PROGRAMACION no accede por regla CM');
ok(permissionsService.canAccessRoute('dec/actos', 'VER', jcrisostomo), 'E) menú VER dec/actos sin ACTOS_PREPARATORIOS');
ok(!permissionsService.tieneActividad('APROBAR', jcrisostomo, 'ACTOS_PREPARATORIOS'), 'F) sin APROBAR ACTOS');
ok(!permissionsService.tieneActividad('OBSERVAR', jcrisostomo, 'ACTOS_PREPARATORIOS'), 'F) sin OBSERVAR ACTOS');
ok(esCoordinadorActosUsuario(wendy), 'G) Wendy coordinador actos');

const row43 = {
  id: 43,
  responsable_actual: '260',
  bandeja_contrato: { responsable: { usuarioId: 260, nombre: 'CRISOSTOMO REYNA JUAN ULISES', tipo: 'PERSONA' } },
};
ok(isExpedienteAsignadoAMi(row43, 'CRISOSTOMO REYNA JUAN ULISES', 260), 'C) id 260 + responsable_actual numérico');
ok(isExpedienteAsignadoAMi({ id: 43, responsable_actual: '260' }, '', 260), 'C) solo id legacy');
ok(!isExpedienteAsignadoAMi(row43, 'YLLAPUMA', 21), 'B) otro operador no es mío');
ok(isExpedienteAsignadoAMi(
  { responsable_actual: 'Wendy Test', bandeja_contrato: { responsable: { usuarioId: 260 } } },
  'Wendy',
  20,
), 'D) bandeja_contrato.usuarioId prioriza sobre texto');

console.log('\nBD — listarBandejaActos ERV (REQ-00043)');
const listaJuan = await listarBandejaActos(1, 50, {}, { restringirPersonaUsuarioId: 260 });
const idsJ = (listaJuan.data || []).map((r) => r.id);
ok(idsJ.includes(43), 'A) REQ-00043 para usuario 260 vía ERV');

const listaOtro = await listarBandejaActos(1, 50, {}, { restringirPersonaUsuarioId: 21 });
ok(!(listaOtro.data || []).some((r) => r.id === 43), 'B) REQ-00043 no es de gyllapuma');

const soloMios = await listarBandejaActos(1, 50, {}, { soloAsignadosUsuarioId: 260 });
ok((soloMios.data || []).some((r) => r.id === 43), 'solo_mios ERV id 260');

const { rows: jc } = await query(`SELECT * FROM usuarios WHERE id = 260 LIMIT 1`);
if (jc[0]) {
  let p = jc[0].permisos;
  if (typeof p === 'string') try { p = JSON.parse(p); } catch (_) {}
  const u = { ...jc[0], permisos: p };
  ok(permissionsService.canAccessRoute('dec/actos', 'VER', u), 'REQ-00043 escenario: jcrisostomo VER dec/actos');
  const listaReal = await listarBandejaActos(1, 100, {}, { restringirPersonaUsuarioId: 260 });
  const hit = (listaReal.data || []).find((r) => r.id === 43);
  ok(!!hit, 'H) REQ-00043 en bandeja real operador 260');
  if (hit?.bandeja_contrato) {
    ok(hit.bandeja_contrato.responsable?.usuarioId === 260
      || hit.responsable_usuario_id === 260
      || String(hit.responsable_actual) === '260',
    'responsable ERV 260 en fila');
  }
}

console.log('\n=== RC8.17.8H1 OK ===\n');

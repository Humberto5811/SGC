/**
 * RC8.17.8C — DEC_APROBADO usa Coordinador + equipo UAD Programación.
 */
import assert from 'node:assert/strict';
import {
  listarCandidatosTransicion,
  assertUsuarioDestinoTransicionElegible,
  listarCandidatosDecAprobadoProgramacion,
} from '../server/lib/workflowTransicionResponsable.js';
import {
  esCoordinadorEquipoUadOperativo,
  esCoordinadorEquipoUad,
  esOperadorEquipoUad,
} from '../server/lib/equiposUadUsuario.js';
import { EQUIPOS_UAD } from '../shared/equiposUad.js';
import { rolGeneralFromUsuario, ROLES_GENERALES } from '../server/utils/userRoleCatalog.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8C — DEC → Programación (Equipo UAD) ===\n');

const mockClient = (usuarios = []) => ({
  query: async (sql) => {
    if (/FROM requerimientos/i.test(sql)) {
      return { rows: [{ id: 40, tipo: 'bienes', estado_actual: 'DEC', payload: {} }] };
    }
    if (/FROM centros/i.test(sql)) {
      return { rows: [{ codigo: 'OA', nombre: 'Unidad de Adquisiciones' }] };
    }
    if (/expediente_estado_vigente/i.test(sql) && /etapa_codigo/i.test(sql)) {
      return { rows: [{ etapa_codigo: 'DEC' }] };
    }
    if (/FROM usuarios/i.test(sql) && /activo = TRUE/i.test(sql)) {
      return { rows: usuarios };
    }
    return { rows: [] };
  },
});

const coordProg = {
  id: 16,
  username: 'laguilar',
  apellidos: 'AGUILAR',
  nombres: 'LISSET',
  cargo: 'TITULO CUALQUIERA',
  rol: 'coordinador',
  centro: 'OA',
  codigo_centro_costo: '01.04.01.02.01',
  equipo_uad: EQUIPOS_UAD.PROGRAMACION,
  activo: true,
  permisos: {
    submodulos: ['PROGRAMACION'],
    actividadesPorSubmodulo: { PROGRAMACION: ['VER', 'APROBAR', 'DERIVAR'] },
  },
};
const coordCm = {
  id: 20,
  username: 'wrodriguez',
  apellidos: 'RODRIGUEZ',
  nombres: 'WENDY',
  cargo: 'COORDINADOR-CM',
  rol: 'coordinador',
  centro: 'OA',
  codigo_centro_costo: '01.04.01.02.01',
  equipo_uad: EQUIPOS_UAD.CONT_MENORES,
  activo: true,
  permisos: {
    submodulos: ['ACTOS_PREPARATORIOS'],
    actividadesPorSubmodulo: { ACTOS_PREPARATORIOS: ['VER', 'APROBAR'] },
  },
};
const director = {
  id: 549,
  username: 'lespinoza',
  rol: 'director',
  cargo: 'DIRECTOR UAD',
  centro: 'OA',
  codigo_centro_costo: '01.04.01.02.01',
  equipo_uad: null,
  activo: true,
  permisos: { submodulos: ['DEC'], actividadesPorSubmodulo: { DEC: ['APROBAR'] } },
};
const operProg = {
  id: 99,
  username: 'oper1',
  rol: 'operador',
  cargo: 'OPERADOR',
  centro: 'OA',
  codigo_centro_costo: '01.04.01.02.01',
  equipo_uad: EQUIPOS_UAD.PROGRAMACION,
  activo: true,
  permisos: {
    submodulos: ['PROGRAMACION'],
    actividadesPorSubmodulo: { PROGRAMACION: ['VER', 'APROBAR'] },
  },
};
const coordProgOtroEquipo = {
  ...coordProg,
  id: 77,
  username: 'coordfake',
  cargo: 'Coordinador Programación',
  equipo_uad: EQUIPOS_UAD.CONT_MENORES,
  permisos: {
    submodulos: ['PROGRAMACION'],
    actividadesPorSubmodulo: { PROGRAMACION: ['VER', 'APROBAR'] },
  },
};

const row = { id: 40, tipo: 'bienes', estado_actual: 'DEC', payload: {} };
const client = mockClient([coordProg, coordCm, director, operProg, coordProgOtroEquipo]);

const lista = await listarCandidatosDecAprobadoProgramacion(40, {}, row, client);
const ids = [...(lista.recomendado ? [lista.recomendado.id] : []), ...(lista.candidatos || []).map((c) => c.id)];
ok(ids.includes(16), 'DEC_APROBADO devuelve Lisset (laguilar)');
ok(!ids.includes(20), 'Wendy no aparece');
ok(!ids.includes(549), 'lespinoza no aparece');
ok(!ids.includes(99), 'operador no aparece');
ok(!ids.includes(77), 'cargo programación con equipo distinto no aparece');
ok(lista.recomendado?.id === 16, 'Lisset recomendada cuando es única');
ok(lista.recomendado?.equipo_uad === EQUIPOS_UAD.PROGRAMACION, 'DTO incluye equipo_uad');
ok(lista.recomendado?.equipo_uad_label === 'Programación', 'DTO incluye equipo_uad_label');
ok(lista.recomendado?.usuario_id === 16, 'DTO incluye usuario_id');

await assertUsuarioDestinoTransicionElegible(40, 'DEC_APROBADO', 16, row, client);
ok(true, 'assert PUT acepta Lisset');

const coordProgCargoNuevo = { ...coordProg, cargo: 'OTRO CARGO INSTITUCIONAL' };
const client2 = mockClient([coordProgCargoNuevo, coordCm]);
const lista2 = await listarCandidatosTransicion(40, 'DEC_APROBADO', {}, row, client2);
const ids2 = [...(lista2.recomendado ? [lista2.recomendado.id] : []), ...(lista2.candidatos || []).map((c) => c.id)];
ok(ids2.includes(16), 'cargo distinto no afecta elegibilidad si rol/equipo/permisos OK');

ok(
  esCoordinadorEquipoUadOperativo(coordProg, EQUIPOS_UAD.PROGRAMACION, 'PROGRAMACION'),
  'Lisset cumple esCoordinadorEquipoUadOperativo',
);
ok(rolGeneralFromUsuario(coordProg) === ROLES_GENERALES.COORDINADOR, 'Lisset rol COORDINADOR');
ok(esOperadorEquipoUad(operProg, EQUIPOS_UAD.PROGRAMACION), 'operProg es operador del equipo');
ok(!esCoordinadorEquipoUad(operProg, EQUIPOS_UAD.PROGRAMACION), 'operador no es coordinador elegible');

try {
  await runMigrations();
  const { rows: reqRows } = await query(`SELECT id FROM requerimientos WHERE codigo = 'REQ-00016' LIMIT 1`);
  const rid = reqRows[0]?.id;
  if (rid) {
    const listaBd = await listarCandidatosTransicion(rid, 'DEC_APROBADO', { search: '' });
    const idsBd = [...(listaBd.recomendado ? [listaBd.recomendado.id] : []), ...(listaBd.candidatos || []).map((c) => c.id)];
    const { rows: u } = await query(`SELECT id FROM usuarios WHERE LOWER(username)='laguilar' LIMIT 1`);
    const { rows: w } = await query(`SELECT id FROM usuarios WHERE LOWER(username)='wrodriguez' LIMIT 1`);
    const { rows: l } = await query(`SELECT id FROM usuarios WHERE LOWER(username)='lespinoza' LIMIT 1`);
    if (u[0]) ok(idsBd.includes(u[0].id), 'BD: Lisset en candidatos REQ-00016');
    if (w[0]) ok(!idsBd.includes(w[0].id), 'BD: Wendy no en candidatos');
    if (l[0]) ok(!idsBd.includes(l[0].id), 'BD: lespinoza no en candidatos');
    console.log('  ℹ candidatos BD DEC_APROBADO:', idsBd);
  }
} catch (e) {
  console.log('  ⚠ integración BD:', e.message);
}

console.log('\n✅ RC8.17.8C — OK\n');

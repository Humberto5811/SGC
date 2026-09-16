/**

 * RC8.17.8H — Programación → Cont.Menores (equipo UAD + PERSONA).

 */

import assert from 'node:assert/strict';

import {

  listarCandidatosProgramacionAprobadaContMenores,

  listarCandidatosTransicion,

  assertUsuarioDestinoTransicionElegible,

  assertActorProgramacionPuedeDerivar,

} from '../server/lib/workflowTransicionResponsable.js';

import {

  esActorProgramacionPuedeDerivar,

  esDestinatarioContMenoresElegible,

  esDestinatarioProgramacionAprobadaContMenoresElegible,

} from '../server/lib/equiposUadUsuario.js';

import { submoduloPermisosParaEtapa } from '../shared/workflow/permisosEtapa.js';

import { EQUIPOS_UAD } from '../shared/equiposUad.js';

import { ROLES_GENERALES, rolGeneralFromUsuario } from '../server/utils/userRoleCatalog.js';

import { query } from '../server/db.js';

import { runMigrations } from '../server/migrate.js';



const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };



console.log('\n=== RC8.17.8H — Programación → Cont.Menores ===\n');



ok(submoduloPermisosParaEtapa('COORDINACION_CM') === 'ACTOS_PREPARATORIOS', 'alias COORDINACION_CM → ACTOS_PREPARATORIOS (acciones bandeja)');



const mockClient = (usuarios = []) => ({

  query: async (sql, params) => {

    if (/FROM requerimientos/i.test(sql)) {

      return { rows: [{ id: 50, tipo: 'bienes', estado_actual: 'PROGRAMACION', payload: {}, estado: 'En Programación' }] };

    }

    if (/FROM centros/i.test(sql)) {

      return { rows: [{ codigo: 'OA', nombre: 'Unidad de Adquisiciones' }] };

    }

    if (/expediente_estado_vigente/i.test(sql) && /etapa_codigo/i.test(sql)) {

      return { rows: [{ etapa_codigo: 'PROGRAMACION' }] };

    }

    if (/FROM usuarios/i.test(sql) && /activo = TRUE/i.test(sql)) {

      return { rows: usuarios.filter((u) => u.activo !== false) };

    }

    if (/FROM usuarios/i.test(sql) && /WHERE u\.id = \$1/i.test(sql)) {

      const id = params?.[0];

      return { rows: usuarios.filter((u) => Number(u.id) === Number(id)) };

    }

    return { rows: [] };

  },

});



const uadKeys = { codigos: new Set(['OA']), costPrefix: '010401' };

const optsUad = { uadKeys };



const coordProg = {

  id: 16,

  username: 'laguilar',

  apellidos: 'AGUILAR',

  nombres: 'LISSET',

  rol: 'coordinador',

  centro: 'OA',

  codigo_centro_costo: '01.04.01.02.01',

  equipo_uad: EQUIPOS_UAD.PROGRAMACION,

  activo: true,

  permisos: {

    submodulos: ['PROGRAMACION'],

    actividadesPorSubmodulo: { PROGRAMACION: ['VER', 'DERIVAR', 'APROBAR'] },

  },

};

const operProg = {

  id: 99,

  username: 'operprog',

  rol: 'operador',

  centro: 'OA',

  codigo_centro_costo: '01.04.01.02.01',

  equipo_uad: EQUIPOS_UAD.PROGRAMACION,

  activo: true,

  permisos: {

    submodulos: ['PROGRAMACION'],

    actividadesPorSubmodulo: { PROGRAMACION: ['VER', 'DERIVAR'] },

  },

};

const progSinDerivar = {

  ...operProg,

  id: 98,

  username: 'progsinderivar',

  permisos: { submodulos: ['PROGRAMACION'], actividadesPorSubmodulo: { PROGRAMACION: ['VER'] } },

};

const coordCm = {

  id: 20,

  username: 'wrodriguez',

  apellidos: 'RODRIGUEZ',

  nombres: 'WENDY',

  rol: 'coordinador',

  centro: 'OA',

  codigo_centro_costo: '01.04.01.02.01',

  equipo_uad: EQUIPOS_UAD.CONT_MENORES,

  activo: true,

  permisos: {

    submodulos: ['ACTOS_PREPARATORIOS'],

    actividadesPorSubmodulo: { ACTOS_PREPARATORIOS: ['VER', 'APROBAR', 'DERIVAR'] },

  },

};

const operCmSinActos = {

  id: 260,

  username: 'jcrisostomo',

  apellidos: 'CRISOSTOMO REYNA',

  nombres: 'JUAN ULISES',

  rol: 'operador',

  centro: 'OA',

  codigo_centro_costo: '01.04.01.02.01',

  equipo_uad: EQUIPOS_UAD.CONT_MENORES,

  activo: true,

  permisos: {

    submodulos: ['INVITACIONES', 'CCP'],

    actividadesPorSubmodulo: { INVITACIONES: ['VER', 'EDITAR'] },

  },

};

const operCm2SinActos = {

  id: 21,

  username: 'gyllapuma',

  apellidos: 'YLLAPUMA NAVARRO',

  nombres: 'GIISELA DELIA',

  rol: 'operador',

  centro: 'OA',

  codigo_centro_costo: '01.04.01.02.01',

  equipo_uad: EQUIPOS_UAD.CONT_MENORES,

  activo: true,

  permisos: {

    submodulos: ['TESORERIA'],

    actividadesPorSubmodulo: { TESORERIA: ['VER'] },

  },

};

const inactivoCm = { ...coordCm, id: 22, username: 'inactivocm', activo: false };

const cargoCmSinEquipo = {

  ...coordCm,

  id: 23,

  username: 'cargocm',

  equipo_uad: null,

  cargo: 'COORDINADOR-CM',

};

const directorCm = {

  id: 24,

  username: 'directorcm',

  rol: 'director',

  centro: 'OA',

  codigo_centro_costo: '01.04.01.02.01',

  equipo_uad: EQUIPOS_UAD.CONT_MENORES,

  activo: true,

  permisos: { submodulos: ['ACTOS_PREPARATORIOS'], actividadesPorSubmodulo: { ACTOS_PREPARATORIOS: ['VER'] } },

};



const usuarios = [

  coordProg, operProg, progSinDerivar, coordCm, operCmSinActos, operCm2SinActos,

  inactivoCm, cargoCmSinEquipo, directorCm,

];

const row = { id: 50, tipo: 'bienes', estado_actual: 'PROGRAMACION', payload: {}, estado: 'En Programación' };

const client = mockClient(usuarios);



console.log('Actor Programación');

ok(esActorProgramacionPuedeDerivar(coordProg), 'K) Coordinador Programación + DERIVAR');

ok(esActorProgramacionPuedeDerivar(operProg), 'K) Operador Programación + DERIVAR');

ok(!esActorProgramacionPuedeDerivar(progSinDerivar), 'K) sin DERIVAR → no actor');



console.log('\nDestinatarios 8H (organizacional)');

ok(esDestinatarioProgramacionAprobadaContMenoresElegible(coordCm, optsUad), 'A) Wendy elegible');

ok(esDestinatarioProgramacionAprobadaContMenoresElegible(operCmSinActos, optsUad), 'B) jcrisostomo sin ACTOS_PREPARATORIOS');

ok(esDestinatarioProgramacionAprobadaContMenoresElegible(operCm2SinActos, optsUad), 'C) gyllapuma sin ACTOS_PREPARATORIOS');

ok(!esDestinatarioProgramacionAprobadaContMenoresElegible(coordProg, optsUad), 'G) usuario PROGRAMACION excluido');

ok(!esDestinatarioProgramacionAprobadaContMenoresElegible(inactivoCm, optsUad), 'F) inactivo excluido');

ok(!esDestinatarioProgramacionAprobadaContMenoresElegible(cargoCmSinEquipo, optsUad), 'sin equipo_uad excluido');

ok(!esDestinatarioProgramacionAprobadaContMenoresElegible(directorCm, optsUad), 'H) rol distinto COORD/OPER excluido');



console.log('\nRegla operativa legacy (ACTOS_PREPARATORIOS) intacta para otros contextos');

ok(esDestinatarioContMenoresElegible(coordCm, 'ACTOS_PREPARATORIOS', optsUad), 'coord con actos sigue elegible operativo');

ok(!esDestinatarioContMenoresElegible(operCmSinActos, 'ACTOS_PREPARATORIOS', optsUad), 'oper sin actos no elegible operativo');



console.log('\nLista candidatos PROGRAMACION_APROBADA');

const lista = await listarCandidatosProgramacionAprobadaContMenores(50, {}, row, client);

ok(lista.recomendado?.id === 20, 'Wendy recomendada (coordinador)');

ok(lista.recomendado?.etiqueta === 'Coordinador recomendado', 'etiqueta coordinador');

const otrosIds = (lista.candidatos || []).map((c) => c.id).sort((a, b) => a - b);

ok(otrosIds.join(',') === '21,260', 'operadores en candidatos (orden alfabético por nombre)');

ok(lista.etapa_destino === 'INVITACIONES', 'J) etapa funcional INVITACIONES');

ok(lista.etapa_destino_label === 'Invitaciones', 'etiqueta destino Invitaciones');

ok(lista.destinos?.[0]?.etapa_label === 'Invitaciones', 'destinos UI Invitaciones');

ok(lista.equipo_uad === EQUIPOS_UAD.CONT_MENORES, 'equipo receptor CONT_MENORES');



const buscaJ = await listarCandidatosProgramacionAprobadaContMenores(50, { search: 'crisostomo' }, row, client);

const idsJ = [...(buscaJ.recomendado ? [buscaJ.recomendado.id] : []), ...(buscaJ.candidatos || []).map((c) => c.id)];

ok(idsJ.includes(260), 'D) búsqueda crisostomo → Juan');



const buscaG = await listarCandidatosProgramacionAprobadaContMenores(50, { search: 'yllapuma' }, row, client);

const idsG = [...(buscaG.recomendado ? [buscaG.recomendado.id] : []), ...(buscaG.candidatos || []).map((c) => c.id)];

ok(idsG.includes(21), 'E) búsqueda yllapuma → Giisela');



await assertUsuarioDestinoTransicionElegible(50, 'PROGRAMACION_APROBADA', 20, row, client);

await assertUsuarioDestinoTransicionElegible(50, 'PROGRAMACION_APROBADA', 260, row, client);

ok(true, 'I) PUT acepta operador sin ACTOS_PREPARATORIOS');



const listaTrans = await listarCandidatosTransicion(50, 'PROGRAMACION_APROBADA', {}, row, client);

ok(listaTrans.recomendado?.id === lista.recomendado?.id, 'GET transición = misma regla que lista directa');



try {

  await assertActorProgramacionPuedeDerivar({ id: 98 }, client);

  assert.fail('actor sin DERIVAR debió fallar');

} catch (e) {

  ok(e.status === 403, '403 actor sin DERIVAR');

}



try {

  await assertUsuarioDestinoTransicionElegible(50, 'PROGRAMACION_APROBADA', 16, row, client);

  assert.fail('destino Programación debió fallar');

} catch (e) {

  ok(e.status === 422, 'PUT rechaza usuario PROGRAMACION');

}



console.log('\nBD local (CONT_MENORES reales, solo lectura)');

await runMigrations();

const { rows: bdCm } = await query(`

  SELECT id, username, apellidos, nombres, rol, equipo_uad, activo, centro, codigo_centro_costo, permisos

  FROM usuarios

  WHERE UPPER(TRIM(COALESCE(equipo_uad, ''))) = 'CONT_MENORES'

  ORDER BY username

`);

const { resolveUnidadAdquisicionesKeys } = await import('../server/lib/workflowTransicionResponsable.js');

const uadKeysBd = await resolveUnidadAdquisicionesKeys();

for (const u of bdCm) {

  const rg = rolGeneralFromUsuario(u);

  const elig = esDestinatarioProgramacionAprobadaContMenoresElegible(u, { uadKeys: uadKeysBd });

  console.log(`  · ${u.username} id=${u.id} rol=${rg} candidato_8H=${elig ? 'SÍ' : 'NO'}`);

}

if (bdCm.length >= 3) {
  const { rows: progReq } = await query(`
    SELECT r.id FROM requerimientos r
    JOIN expediente_estado_vigente e ON e.requerimiento_id = r.id
    WHERE e.etapa_codigo = 'PROGRAMACION'
    ORDER BY r.id DESC LIMIT 1
  `);
  if (progReq[0]?.id) {
    const listaBd = await listarCandidatosProgramacionAprobadaContMenores(progReq[0].id, {}, null, null);
    const usernames = [
      listaBd.recomendado?.username,
      ...(listaBd.candidatos || []).map((c) => c.username),
    ].filter(Boolean);
    ok(usernames.includes('wrodriguez'), 'BD: Wendy en GET');
    ok(usernames.includes('jcrisostomo'), 'BD: jcrisostomo en GET');
    ok(usernames.includes('gyllapuma'), 'BD: gyllapuma en GET');
  } else {
    ok(true, 'BD: sin REQ en PROGRAMACION para GET candidatos (omitido)');
  }
}



console.log('\n=== RC8.17.8H unit OK (ERV paquete: pendiente atomicidad) ===\n');



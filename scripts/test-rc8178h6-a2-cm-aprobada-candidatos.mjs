/**
 * RC8.17.8H6-A2 — Candidatos COORDINACION_CM_APROBADA (pool UAD, sin centro REQ).
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { resolverCentroDesdeRequerimiento } from '../server/lib/recepcionBienesAlcance.js';
import {
  assertUsuarioDestinoTransicionElegible,
  listarCandidatosTransicion,
} from '../server/lib/workflowTransicionResponsable.js';
import {
  esOperadorEquipoUad,
  listarUsuariosDestinoEquipoUadSubmodulo,
} from '../server/lib/equiposUadUsuario.js';
import {
  hasFunctionalProfile,
  PERFILES_FUNCIONALES,
  rolGeneralFromUsuario,
  ROLES_GENERALES,
} from '../server/utils/userRoleCatalog.js';
import { EQUIPOS_UAD } from '../shared/equiposUad.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-A2 — Candidatos CM → Invitaciones ===\n');

await runMigrations({ silent: true });

function todosCandidatos(lista) {
  return [
    ...(lista.recomendado ? [lista.recomendado] : []),
    ...(lista.candidatos || []),
  ];
}

async function loadReqCmConCentroNoOa() {
  const { rows } = await query(`
    SELECT r.*
    FROM requerimientos r
    JOIN expediente_estado_vigente e ON e.requerimiento_id = r.id
    WHERE UPPER(e.etapa_codigo) IN ('COORDINACION_CM', 'ACTOS_PREPARATORIOS')
    ORDER BY CASE WHEN r.codigo LIKE 'REQ-000%' THEN 0 ELSE 1 END, r.id DESC
    LIMIT 20
  `);
  for (const row of rows) {
    try {
      const centro = resolverCentroDesdeRequerimiento(row);
      const c = String(centro.centro_codigo || '').toUpperCase();
      if (c && c !== 'OA') return { row, centro };
    } catch {
      /* skip */
    }
  }
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'T0001', 'Test H6-A2', 'LAB TEST', 'CNCC', 'Registrado', 'COORDINACION_CM', '{"observaciones":[]}'::jsonb)
    RETURNING *
  `, [`REQ-TEST-H6A2-${Date.now()}`]);
  const row = ins.rows[0];
  await query(`
    INSERT INTO expediente_estado_vigente (requerimiento_id, etapa_codigo, estado_codigo, responsable_tipo)
    VALUES ($1, 'COORDINACION_CM', 'EN_TRAMITE', 'UNIDAD')
    ON CONFLICT (requerimiento_id) DO UPDATE SET etapa_codigo = 'COORDINACION_CM', estado_codigo = 'EN_TRAMITE'
  `, [row.id]);
  const centro = resolverCentroDesdeRequerimiento(row);
  return { row, centro };
}

console.log('A — REQ con centro área usuaria ≠ OA');
const { row: reqRow, centro: centroReq } = await loadReqCmConCentroNoOa();
ok(String(centroReq.centro_codigo || '').toUpperCase() !== 'OA', `A0 centro REQ=${centroReq.centro_codigo} (≠ OA)`);

const lista = await listarCandidatosTransicion(reqRow.id, 'COORDINACION_CM_APROBADA', {}, reqRow);
ok(lista.alcance === 'UAD_EQUIPO', 'A1 alcance UAD_EQUIPO');
ok(lista.centro == null, 'A2 centro null en respuesta');
ok(lista.etapa_destino === 'INVITACIONES', 'A3 destino INVITACIONES');
ok(lista.perfil_responsable === PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES, 'A4 perfil ANALISTA_CONTRATACIONES');

const todos = todosCandidatos(lista);
ok(todos.length >= 1, `A5 pool no vacío (${todos.length} candidato(s))`);
for (const c of todos) {
  ok(c.equipo_uad === EQUIPOS_UAD.CONT_MENORES, `A6 ${c.username} equipo CONT_MENORES`);
  ok(c.rol_general === ROLES_GENERALES.OPERADOR || String(c.rol_general_label || '').toLowerCase() === 'operador',
    `A7 ${c.username} es operador`);
}

console.log('\nB — Operadores CM con Invitaciones en BD (sin IDs fijos)');
const { usuarios: poolUad } = await listarUsuariosDestinoEquipoUadSubmodulo({
  equipoCodigo: EQUIPOS_UAD.CONT_MENORES,
  submoduloPermisosCodigo: 'INVITACIONES',
});
const operadoresEsperados = poolUad.filter(
  (u) => esOperadorEquipoUad(u, EQUIPOS_UAD.CONT_MENORES)
    && hasFunctionalProfile(u, PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES),
);
const idsLista = new Set(todos.map((c) => Number(c.id)));
for (const u of operadoresEsperados) {
  ok(idsLista.has(Number(u.id)), `B incluye operador elegible ${u.username}`);
}
const { rows: byName } = await query(`
  SELECT id, username FROM usuarios
  WHERE activo = TRUE AND LOWER(username) IN ('jcrisostomo', 'gyllapuma')
`);
for (const u of byName) {
  const enPool = operadoresEsperados.some((x) => Number(x.id) === Number(u.id));
  if (enPool) {
    ok(idsLista.has(Number(u.id)), `B* ${u.username} en candidatos cuando cumple reglas`);
  }
}

console.log('\nC — Coordinadores CM excluidos');
const { rows: coords } = await query(`
  SELECT u.* FROM usuarios u
  WHERE u.activo = TRUE AND UPPER(COALESCE(u.equipo_uad, '')) = 'CONT_MENORES'
`);
for (const u of coords) {
  if (rolGeneralFromUsuario(u) === ROLES_GENERALES.COORDINADOR) {
    ok(!idsLista.has(Number(u.id)), `C excluye coordinador ${u.username}`);
  }
}

console.log('\nD — Perfil DEC excluido');
const { rows: activos } = await query('SELECT * FROM usuarios WHERE activo = TRUE');
const decUsers = activos.filter((u) => hasFunctionalProfile(u, PERFILES_FUNCIONALES.DEC));
ok(decUsers.length >= 1, 'D0 existe usuario DEC en BD local');
for (const u of decUsers) {
  ok(!idsLista.has(Number(u.id)), `D excluye DEC ${u.username}`);
}

console.log('\nE — assertUsuarioDestinoTransicionElegible');
const valido = todos[0];
ok(valido?.id, 'E0 hay candidato válido');
await assertUsuarioDestinoTransicionElegible(reqRow.id, 'COORDINACION_CM_APROBADA', valido.id, reqRow);
ok(true, 'E1 candidato válido aceptado');
try {
  await assertUsuarioDestinoTransicionElegible(reqRow.id, 'COORDINACION_CM_APROBADA', 999999999, reqRow);
  assert.fail('E2 debió rechazar usuario inventado');
} catch (e) {
  ok(e.code === 'RESPONSABLE_TRANSICION_INVALIDO' || e.status === 422, 'E2 no elegible rechazado');
}
const coord = coords.find((u) => rolGeneralFromUsuario(u) === ROLES_GENERALES.COORDINADOR);
if (coord) {
  try {
    await assertUsuarioDestinoTransicionElegible(reqRow.id, 'COORDINACION_CM_APROBADA', coord.id, reqRow);
    assert.fail('E3 coordinador debió fallar');
  } catch (e) {
    ok(e.code === 'RESPONSABLE_TRANSICION_INVALIDO' || e.status === 422, 'E3 coordinador rechazado');
  }
}

console.log('\nResumen candidatos locales:', todos.map((c) => `${c.username} (${c.cargo})`).join(', '));
console.log('\n=== H6-A2 OK ===\n');

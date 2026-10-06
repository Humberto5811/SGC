/**
 * RC8.17.8H6-D9-A — VALIDACION_COMPLETADA → Cuadro Comparativo (UAD CONT_MENORES).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { resolverCentroDesdeRequerimiento } from '../server/lib/recepcionBienesAlcance.js';
import {
  assertUsuarioDestinoTransicionElegible,
  getPilotEstadoLabelsForEvento,
  listarCandidatosTransicion,
  resolveTransicionWorkflow,
} from '../server/lib/workflowTransicionResponsable.js';
import {
  esOperadorEquipoUad,
  listarUsuariosDestinoEquipoUadOrganizacional,
} from '../server/lib/equiposUadUsuario.js';
import {
  hasFunctionalProfile,
  PERFILES_FUNCIONALES,
  rolGeneralFromUsuario,
  ROLES_GENERALES,
} from '../server/utils/userRoleCatalog.js';
import { EQUIPOS_UAD } from '../shared/equiposUad.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-D9-A — Validación → Cuadro candidatos ===\n');

await runMigrations({ silent: true });

function todosCandidatos(lista) {
  return [
    ...(lista.recomendado ? [lista.recomendado] : []),
    ...(lista.candidatos || []),
  ];
}

/** Réplica del contrato wireTransicionPicker (hasCandidatos / sin elegibles). */
function pickerHasCandidatos(data) {
  return !!(data.recomendado || (data.candidatos && data.candidatos.length));
}

function pickerMuestraSinElegibles(data) {
  return !data.recomendado && !(data.candidatos && data.candidatos.length);
}

/** Valor etapa que readSeleccion() usaría con destino único (select oculto + option). */
function etapaCodigoConfirmacionUnicoDestino(data) {
  const destinos = data?.destinos || [];
  if (destinos.length <= 1) {
    const d0 = destinos[0];
    return d0?.etapa_codigo || data?.etapa_destino || '';
  }
  return destinos[0]?.etapa_codigo || '';
}

async function loadReqValidacionConCentroNoOa() {
  const { rows } = await query(`
    SELECT r.*
    FROM requerimientos r
    JOIN expediente_estado_vigente e ON e.requerimiento_id = r.id
    WHERE UPPER(e.etapa_codigo) IN ('VALIDACION_USUARIO', 'VALIDACIONES')
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
    VALUES ('bienes', $1, 'T0002', 'Test H6-D9-A', 'LAB TEST', 'CNCC', 'Registrado', 'VALIDACION_USUARIO', '{"observaciones":[]}'::jsonb)
    RETURNING *
  `, [`REQ-TEST-H6D9A-${Date.now()}`]);
  const row = ins.rows[0];
  await query(`
    INSERT INTO expediente_estado_vigente (requerimiento_id, etapa_codigo, estado_codigo, responsable_tipo)
    VALUES ($1, 'VALIDACION_USUARIO', 'EN_TRAMITE', 'UNIDAD')
    ON CONFLICT (requerimiento_id) DO UPDATE SET etapa_codigo = 'VALIDACION_USUARIO', estado_codigo = 'EN_TRAMITE'
  `, [row.id]);
  const centro = resolverCentroDesdeRequerimiento(row);
  return { row, centro };
}

console.log('UI — único destino muestra label readonly');
const pickerSrc = fs.readFileSync(path.join(__dirname, '../src/utils/workflowTransicionPicker.js'), 'utf8');
ok(pickerSrc.includes('wf-etapa-destino-readonly'), 'UI0 clase readonly presente');
ok(/destinos\.length\s*<=\s*1/.test(pickerSrc), 'UI1 rama único destino');
ok(pickerSrc.includes('etapa_destino_label'), 'UI2 usa etapa_destino_label del API');

console.log('\nA — REQ en validación con centro área usuaria ≠ OA');
const { row: reqRow, centro: centroReq } = await loadReqValidacionConCentroNoOa();
ok(String(centroReq.centro_codigo || '').toUpperCase() !== 'OA', `A0 centro REQ=${centroReq.centro_codigo} (≠ OA)`);

const lista = await listarCandidatosTransicion(reqRow.id, 'VALIDACION_COMPLETADA', {}, reqRow);
ok(lista.alcance === 'UAD_EQUIPO', 'A1 alcance UAD_EQUIPO');
ok(lista.centro == null, 'A2 centro null (sin filtro centro REQ)');
ok(lista.etapa_destino === 'CUADRO_COMPARATIVO', 'A3 destino CUADRO_COMPARATIVO');
ok(/cuadro/i.test(String(lista.etapa_destino_label || '')), 'A4 label Cuadro Comparativo');
ok(lista.perfil_responsable === PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES, 'A5 perfil ANALISTA_CONTRATACIONES');
ok(lista.equipo_uad === EQUIPOS_UAD.CONT_MENORES, 'A6 equipo CONT_MENORES');

const todos = todosCandidatos(lista);
ok(todos.length >= 1, `A7 pool no vacío (${todos.length} elegible(s))`);
for (const c of todos) {
  ok(c.equipo_uad === EQUIPOS_UAD.CONT_MENORES, `A8 ${c.username} equipo CONT_MENORES`);
}

console.log('\nB — Pool canónico UAD org + operador + ANALISTA (sin perm JSON CUADRO)');
const { usuarios: poolUad } = await listarUsuariosDestinoEquipoUadOrganizacional({
  equipoCodigo: EQUIPOS_UAD.CONT_MENORES,
});
const operadoresEsperados = poolUad.filter(
  (u) => esOperadorEquipoUad(u, EQUIPOS_UAD.CONT_MENORES)
    && hasFunctionalProfile(u, PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES),
);
const idsLista = new Set(todos.map((c) => Number(c.id)));
for (const u of operadoresEsperados) {
  ok(idsLista.has(Number(u.id)), `B incluye operador elegible ${u.username}`);
}
ok(operadoresEsperados.length >= 1, 'B* al menos un operador ANALISTA en fixtures locales');

console.log('\nC — Coordinadores CM excluidos');
for (const u of poolUad) {
  if (rolGeneralFromUsuario(u) === ROLES_GENERALES.COORDINADOR) {
    ok(!idsLista.has(Number(u.id)), `C excluye coordinador ${u.username}`);
  }
}

console.log('\nD — wvasquez (centro AU, fuera UAD OA) no es candidato');
const { rows: wvRows } = await query(`
  SELECT * FROM usuarios WHERE activo = TRUE AND LOWER(username) = 'wvasquez' LIMIT 1
`);
if (wvRows[0]) {
  ok(!idsLista.has(Number(wvRows[0].id)), 'D wvasquez fuera del pool');
}

console.log('\nE — assertUsuarioDestinoTransicionElegible');
const valido = todos.find((c) => operadoresEsperados.some((u) => Number(u.id) === Number(c.id))) || todos[0];
ok(valido?.id, 'E0 hay candidato válido');
await assertUsuarioDestinoTransicionElegible(reqRow.id, 'VALIDACION_COMPLETADA', valido.id, reqRow);
ok(true, 'E1 candidato válido aceptado');
try {
  await assertUsuarioDestinoTransicionElegible(reqRow.id, 'VALIDACION_COMPLETADA', 999999999, reqRow);
  assert.fail('E2 debió rechazar usuario inventado');
} catch (e) {
  ok(e.code === 'RESPONSABLE_TRANSICION_INVALIDO' || e.status === 422, 'E2 no elegible rechazado');
}
if (wvRows[0]) {
  try {
    await assertUsuarioDestinoTransicionElegible(reqRow.id, 'VALIDACION_COMPLETADA', wvRows[0].id, reqRow);
    assert.fail('E3 wvasquez debió fallar');
  } catch (e) {
    ok(e.code === 'RESPONSABLE_TRANSICION_INVALIDO' || e.status === 422, 'E3 wvasquez rechazado');
  }
}

console.log('\nF — destinos único en respuesta (modal etapa)');
ok(Array.isArray(lista.destinos) && lista.destinos.length === 1, 'F0 un destino');
ok(lista.destinos[0].etapa_codigo === 'CUADRO_COMPARATIVO', 'F1 código destino');
ok(/cuadro/i.test(String(lista.destinos[0].etapa_label || '')), 'F2 label destino para UI');

console.log('\nG — workflow destino (sin cambiar matriz)');
const { transicion } = await resolveTransicionWorkflow(reqRow.id, 'VALIDACION_COMPLETADA', reqRow);
ok(transicion.etapa_destino === 'CUADRO_COMPARATIVO', 'G0 etapa CUADRO_COMPARATIVO');
const estPilot = getPilotEstadoLabelsForEvento('VALIDACION_COMPLETADA');
ok(estPilot?.estadoCodigo === 'EN_TRAMITE', 'G1 estado EN_TRAMITE al confirmar');

console.log('\nH — cardinalidad 0 / 1 / 2+ y contrato picker');
ok(pickerMuestraSinElegibles({ recomendado: null, candidatos: [] }), 'H0a picker: vacío → sin elegibles');
ok(!pickerHasCandidatos({ recomendado: null, candidatos: [] }), 'H0b picker: vacío → no hasCandidatos');
ok(
  pickerHasCandidatos({ recomendado: { id: 1, nombre: 'X' }, candidatos: [] }),
  'H1a picker: solo recomendado → hasCandidatos (no mensaje falso)',
);
ok(
  !pickerMuestraSinElegibles({ recomendado: { id: 1, nombre: 'X' }, candidatos: [] }),
  'H1b picker: solo recomendado → utilizable',
);
ok(
  pickerHasCandidatos({ recomendado: null, candidatos: [{ id: 1 }, { id: 2 }] }),
  'H2a picker: lista múltiple → hasCandidatos',
);

const nElegibles = operadoresEsperados.length;
if (nElegibles >= 2) {
  ok(!lista.recomendado && lista.candidatos.length >= 2, 'H2+ API: ≥2 elegibles → candidatos[] (sin recomendado)');
  ok(pickerHasCandidatos(lista), 'H2+ picker: lista completa utilizable');
  for (const c of lista.candidatos) {
    await assertUsuarioDestinoTransicionElegible(reqRow.id, 'VALIDACION_COMPLETADA', c.id, reqRow);
  }
  ok(true, 'H2+ assert acepta cada candidato de la lista');

  const excluido = operadoresEsperados[0];
  const lista1 = await listarCandidatosTransicion(
    reqRow.id,
    'VALIDACION_COMPLETADA',
    { excluirUsuarioId: excluido.id },
    reqRow,
  );
  const union1 = todosCandidatos(lista1);
  ok(union1.length === 1, `H1 API: excluir 1 → exactamente 1 elegible (${excluido.username} fuera)`);
  ok(lista1.recomendado?.id === union1[0].id, 'H1 API: único elegible va en recomendado');
  ok(lista1.candidatos.length === 0, 'H1 API: candidatos[] vacío (patrón H6-A2)');
  ok(pickerHasCandidatos(lista1), 'H1 picker: recomendado cuenta como elegible');
  ok(!pickerMuestraSinElegibles(lista1), 'H1 picker: no muestra sin elegibles');
  await assertUsuarioDestinoTransicionElegible(
    reqRow.id,
    'VALIDACION_COMPLETADA',
    lista1.recomendado.id,
    reqRow,
  );
  ok(true, 'H1 assert: transición confirmable con recomendado único');
} else if (nElegibles === 1) {
  ok(lista.recomendado?.id === operadoresEsperados[0].id, 'H1 API: pool=1 → recomendado');
  ok(pickerHasCandidatos(lista), 'H1 picker utilizable');
  const lista0 = await listarCandidatosTransicion(
    reqRow.id,
    'VALIDACION_COMPLETADA',
    { excluirUsuarioId: operadoresEsperados[0].id },
    reqRow,
  );
  ok(todosCandidatos(lista0).length === 0, 'H0 API: excluir único → 0 elegibles');
  ok(pickerMuestraSinElegibles(lista0), 'H0 picker: 0 → mensaje sin elegibles');
} else {
  ok(todosCandidatos(lista).length === 0, 'H0 API: fixtures sin operadores ANALISTA CM');
  ok(pickerMuestraSinElegibles(lista), 'H0 picker coherente');
}

console.log('\nI — confirmación etapa CUADRO_COMPARATIVO (destino único readonly)');
ok(etapaCodigoConfirmacionUnicoDestino(lista) === 'CUADRO_COMPARATIVO', 'I0 código etapa al confirmar');
ok(
  pickerSrc.includes('etapaEl?.value || dataCache?.etapa_destino'),
  'I1 readSeleccion fallback etapa_destino',
);
ok(
  /<option value="\$\{esc\(codigo\)\}" selected>/.test(pickerSrc) || pickerSrc.includes('value="${esc(codigo)}" selected'),
  'I2 select oculto conserva value=codigo',
);

console.log('\nResumen candidatos locales:', todos.map((c) => `${c.username} (${c.cargo || '—'})`).join(', '));
console.log('\n=== H6-D9-A OK ===\n');

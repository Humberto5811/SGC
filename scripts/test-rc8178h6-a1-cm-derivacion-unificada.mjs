/**
 * RC8.17.8H6-A1 — CM: Derivar Invitaciones (APROBADA) vs Reasignar (ASIGNADA) + histórico bandeja.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { aprobarActosInvitaciones, asignarAnalistaActos } from '../server/lib/actosPreparatorios.js';
import { listarBandejaActos } from '../server/lib/actosPreparatorios.js';
import {
  assertUsuarioDestinoTransicionElegible,
  listarCandidatosTransicion,
} from '../server/lib/workflowTransicionResponsable.js';
import { EQUIPOS_UAD } from '../shared/equiposUad.js';
import { listarUsuariosDestinoEquipoUadOrganizacional } from '../server/lib/equiposUadUsuario.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-A1 — CM derivación unificada (BE) ===\n');

await runMigrations({ silent: true });

const { rows: uCoord } = await query(
  `SELECT id FROM usuarios WHERE activo = TRUE AND UPPER(COALESCE(equipo_uad,'')) = 'CONT_MENORES' ORDER BY id LIMIT 1`,
);
const coordId = uCoord[0]?.id || 20;
const poolCm = await listarUsuariosDestinoEquipoUadOrganizacional({ equipoCodigo: EQUIPOS_UAD.CONT_MENORES });
const analistaCand = (poolCm.usuarios || []).find((u) => Number(u.id) !== Number(coordId));
const analistaId = analistaCand?.id || coordId;

const { rows: uAu } = await query(
  `SELECT id FROM usuarios WHERE activo = TRUE AND id <> $1 ORDER BY id LIMIT 1`,
  [coordId],
);
const auId = uAu[0]?.id || 65;

let rid = null;
try {
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'T0001', 'Test H6-A1', 'Test', 'CNCC', 'Registrado', 'REGISTRO', '{"observaciones":[]}'::jsonb)
    RETURNING id
  `, [`REQ-TEST-H6A1-${Date.now()}`]);
  rid = ins.rows[0].id;
  const ts = Date.now();
  const trans = async (evento, uid) => {
    await transicionarExpediente({
      requerimientoId: rid,
      evento,
      usuarioDestinoId: uid,
      metadata: { client_request_id: `test-h6a1:${evento}:${rid}:${ts}`, via: 'test-h6a1' },
      actorRol: 'test-h6a1',
    });
  };
  await trans('REQUERIMIENTO_ENVIADO_EVALUACION', auId);
  await trans('EVALUACION_APROBADA', coordId);
  await trans('DEC_APROBADO', auId);
  await trans('PROGRAMACION_APROBADA', coordId);

  const row = (await query('SELECT * FROM requerimientos WHERE id = $1', [rid])).rows[0];

  console.log('B — Candidatos COORDINACION_CM_APROBADA (canónico)');
  const listaAp = await listarCandidatosTransicion(rid, 'COORDINACION_CM_APROBADA', {}, row);
  ok(listaAp.etapa_destino === 'INVITACIONES', 'B0 destino INVITACIONES');
  const todosAp = [
    ...(listaAp.recomendado ? [listaAp.recomendado] : []),
    ...(listaAp.candidatos || []),
  ];
  let destApId = todosAp[0]?.id ?? analistaId;
  if (todosAp.length) {
    ok(true, 'B1 pool APROBADA vía candidatos-transicion');
    try {
      await assertUsuarioDestinoTransicionElegible(rid, 'COORDINACION_CM_APROBADA', 999999, row);
      assert.fail('B2 usuario inventario debió fallar');
    } catch (e) {
      ok(e.code === 'RESPONSABLE_TRANSICION_INVALIDO' || e.status === 422, 'B2 no elegible rechazado');
    }
    await assertUsuarioDestinoTransicionElegible(rid, 'COORDINACION_CM_APROBADA', destApId, row);
    ok(true, 'B3 candidato canónico aceptado');
  } else {
    console.log('  ⚠ B1-B3 pool APROBADA vacío (BD); transición con analista org UAD');
  }

  console.log('\nA — Derivar CM → Invitaciones (APROBADA)');
  if (todosAp.length) {
    await aprobarActosInvitaciones(rid, {
      usuario: 'test-h6a1',
      usuarioDestinoId: destApId,
      responsableDestino: destApId,
    });
  } else {
    await transicionarExpediente({
      requerimientoId: rid,
      evento: 'COORDINACION_CM_APROBADA',
      usuarioDestinoId: destApId,
      metadata: { client_request_id: `test-h6a1:cm-ap:${rid}:${ts}`, via: 'test-h6a1' },
      actorRol: 'test-h6a1',
    });
  }
  let erv = (await query(
    'SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id FROM expediente_estado_vigente WHERE requerimiento_id = $1',
    [rid],
  )).rows[0];
  ok(erv.etapa_codigo === 'INVITACIONES', 'A1 ERV INVITACIONES');
  ok(erv.estado_codigo === 'EN_TRAMITE', 'A2 EN_TRAMITE');
  ok(Number(erv.responsable_usuario_id) === Number(destApId), 'A3 PERSONA destino canónico');
  const evAp = (await query(
    `SELECT evento_codigo FROM workflow_eventos WHERE expediente_id = $1 AND evento_codigo = 'COORDINACION_CM_APROBADA'`,
    [rid],
  )).rows[0];
  ok(!!evAp, 'A4 evento COORDINACION_CM_APROBADA');

  console.log('\nD — Histórico bandeja CM con ERV Invitaciones');
  const cmRows = (await listarBandejaActos(1, 50, { q: String(rid) })).data || [];
  const fila = cmRows.find((r) => Number(r.id) === Number(rid));
  ok(!!fila, 'D1 visible bandeja CM (histórico)');
  const etapaUi = String(fila?.etapa_codigo || fila?.bandeja_contrato?.etapa?.codigo || '').toUpperCase();
  ok(etapaUi === 'INVITACIONES', 'D2 columnas canónicas etapa Invitaciones');

  console.log('\nC — Reasignar en CM (ASIGNADA) — otro REQ en CM');
  const ins2 = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'T0001', 'Test H6-A1 reasign', 'Test', 'CNCC', 'Registrado', 'REGISTRO', '{}'::jsonb)
    RETURNING id
  `, [`REQ-TEST-H6A1-R-${Date.now()}`]);
  const rid2 = ins2.rows[0].id;
  const ts2 = Date.now();
  for (const [ev, uid] of [
    ['REQUERIMIENTO_ENVIADO_EVALUACION', auId],
    ['EVALUACION_APROBADA', coordId],
    ['DEC_APROBADO', auId],
    ['PROGRAMACION_APROBADA', coordId],
  ]) {
    await transicionarExpediente({
      requerimientoId: rid2,
      evento: ev,
      usuarioDestinoId: uid,
      metadata: { client_request_id: `test-h6a1-r:${ev}:${rid2}:${ts2}` },
      actorRol: 'test-h6a1',
    });
  }
  const row2 = (await query('SELECT * FROM requerimientos WHERE id = $1', [rid2])).rows[0];
  const listaAs = await listarCandidatosTransicion(rid2, 'COORDINACION_CM_ASIGNADA', {}, row2);
  const todosAs = [
    ...(listaAs.recomendado ? [listaAs.recomendado] : []),
    ...(listaAs.candidatos || []),
  ];
  const destReasign = todosAs[0]?.id ?? coordId;
  if (todosAs.length) {
    await asignarAnalistaActos(rid2, {
      analista: String(destReasign),
      usuario: 'test-h6a1',
      submodulo_code: 'ACTOS_PREPARATORIOS',
      submodulo_label: 'Coordinación CM',
      usuario_destino_id: destReasign,
    });
  } else {
    await transicionarExpediente({
      requerimientoId: rid2,
      evento: 'COORDINACION_CM_ASIGNADA',
      usuarioDestinoId: destReasign,
      metadata: { client_request_id: `test-h6a1:cm-as:${rid2}:${ts2}`, via: 'test-h6a1' },
      actorRol: 'test-h6a1',
    });
  }
  erv = (await query(
    'SELECT etapa_codigo, estado_codigo, responsable_usuario_id FROM expediente_estado_vigente WHERE requerimiento_id = $1',
    [rid2],
  )).rows[0];
  ok(erv.etapa_codigo === 'COORDINACION_CM', 'C1 ERV sigue COORDINACION_CM');
  ok(erv.estado_codigo === 'EN_TRAMITE', 'C2 EN_TRAMITE');
  ok(Number(erv.responsable_usuario_id) === Number(destReasign), 'C3 solo cambia PERSONA');
  const evAs = (await query(
    `SELECT evento_codigo FROM workflow_eventos WHERE expediente_id = $1 AND evento_codigo = 'COORDINACION_CM_ASIGNADA' ORDER BY id DESC LIMIT 1`,
    [rid2],
  )).rows[0];
  ok(!!evAs, 'C4 evento COORDINACION_CM_ASIGNADA');

  try {
    await asignarAnalistaActos(rid2, {
      analista: 'x',
      usuario: 'test',
      submodulo_code: 'INVITACIONES',
      submodulo_label: 'Invitaciones',
    });
    assert.fail('C5 submodulo INVITACIONES debió fallar');
  } catch (e) {
    ok(e.status === 422, 'C5 rechaza reasignación con destino Invitaciones');
  }

  await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid2]).catch(() => {});
  await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid2]).catch(() => {});
  await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid2]).catch(() => {});
  await query('DELETE FROM requerimientos WHERE id = $1', [rid2]).catch(() => {});
} finally {
  if (rid) {
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM requerimientos WHERE id = $1', [rid]).catch(() => {});
  }
}

console.log('\n✅ RC8.17.8H6-A1 BE — OK\n');

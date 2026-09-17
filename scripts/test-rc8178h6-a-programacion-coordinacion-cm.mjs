/**
 * RC8.17.8H6-A — Flujo nuevo Programación → Coordinación CM (sin reconciliación histórica).
 * A) PROGRAMACION_APROBADA → COORDINACION_CM / EN_TRAMITE / PERSONA
 * B) COORDINACION_CM_APROBADA → INVITACIONES / EN_TRAMITE / PERSONA destino
 * C) legacyHandler vs motor (ejecutarProgramacionAprobadaContMenores)
 * D) matriz sin PROGRAMACION_APROBADA → INVITACIONES
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { getTransition, TRANSICIONES } from '../shared/workflow/transiciones.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { derivarActos } from '../server/lib/actosPreparatorios.js';
import { ejecutarProgramacionAprobadaContMenores } from '../server/lib/programacionAprobacionContMenores.js';
import { esActorProgramacionPuedeDerivar } from '../server/lib/equiposUadUsuario.js';
import { EQUIPOS_UAD } from '../shared/equiposUad.js';
import { listarUsuariosDestinoEquipoUadOrganizacional } from '../server/lib/equiposUadUsuario.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-A — Programación → CM (flujo nuevo) ===\n');

console.log('D — Matriz sin salto P→I');
const trProg = getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: 'PROGRAMACION',
  eventoCodigo: 'PROGRAMACION_APROBADA',
});
ok(trProg?.etapa_destino === 'COORDINACION_CM', 'D1 PROGRAMACION_APROBADA → COORDINACION_CM');
const badJump = TRANSICIONES.filter(
  (t) => t.evento_codigo === 'PROGRAMACION_APROBADA' && t.etapa_destino === 'INVITACIONES',
);
ok(badJump.length === 0, 'D2 ninguna fila PROGRAMACION_APROBADA → INVITACIONES en matriz');

const trCmI = getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: 'COORDINACION_CM',
  eventoCodigo: 'COORDINACION_CM_APROBADA',
});
ok(trCmI?.etapa_destino === 'INVITACIONES', 'D3 COORDINACION_CM_APROBADA → INVITACIONES');

await runMigrations({ silent: true });

const { rows: uCoord } = await query(
  `SELECT id FROM usuarios WHERE activo = TRUE AND UPPER(COALESCE(equipo_uad,'')) = 'CONT_MENORES' ORDER BY id LIMIT 1`,
);
const { rows: uProgCandidates } = await query(
  `SELECT id, username, permisos, equipo_uad, activo, rol, cargo, apellidos, nombres, centro, codigo_centro_costo
   FROM usuarios WHERE activo = TRUE AND UPPER(COALESCE(equipo_uad,'')) = 'PROGRAMACION'`,
);
const progActor = uProgCandidates.find((u) => esActorProgramacionPuedeDerivar(u));
const coordId = uCoord[0]?.id || 20;
const poolCm = await listarUsuariosDestinoEquipoUadOrganizacional({ equipoCodigo: EQUIPOS_UAD.CONT_MENORES });
const analistaId = (poolCm.usuarios || []).find((u) => Number(u.id) !== Number(coordId))?.id || coordId;

async function seedEnProgramacion(codigoSuffix) {
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES (
      'bienes', $1, 'T0001', 'Test H6-A', 'Test', 'CNCC',
      'Registrado', 'REGISTRO', '{"observaciones":[]}'::jsonb
    )
    RETURNING id
  `, [`REQ-TEST-H6A-${codigoSuffix}-${Date.now()}`]);
  const rid = ins.rows[0].id;
  const ts = Date.now();
  const trans = async (evento, uid) => {
    await transicionarExpediente({
      requerimientoId: rid,
      evento,
      usuarioDestinoId: uid,
      metadata: {
        client_request_id: `test-h6a:${evento}:${rid}:${ts}`,
        via: 'test-rc8178h6-a',
      },
      actorRol: 'test-h6a',
    });
  };
  const { rows: uAu } = await query(
    `SELECT id FROM usuarios WHERE activo = TRUE AND id <> $1 ORDER BY id LIMIT 1`,
    [coordId],
  );
  const auId = uAu[0]?.id || 65;
  await trans('REQUERIMIENTO_ENVIADO_EVALUACION', auId);
  await trans('EVALUACION_APROBADA', coordId);
  await trans('DEC_APROBADO', progActor?.id || coordId);
  let pedidoId = (await query('SELECT id FROM pedidos_sigamef ORDER BY id LIMIT 1')).rows[0]?.id;
  let pedidoInsertado = false;
  if (!pedidoId) {
    const insPed = await query(`
      INSERT INTO pedidos_sigamef (codigo_pedido, nro_pedido, tipo)
      VALUES ($1, $2, 'B')
      RETURNING id
    `, [`PED-H6A-${rid}`, String(rid).slice(-8)]);
    pedidoId = insPed.rows[0]?.id;
    pedidoInsertado = true;
  }
  await query(`
    INSERT INTO requerimiento_pedidos (requerimiento_id, pedido_sigamef_id, usuario_registro)
    VALUES ($1, $2, 'test-h6a')
    ON CONFLICT (requerimiento_id, pedido_sigamef_id) DO NOTHING
  `, [rid, pedidoId]);
  return { rid, ts, pedidoInsertado: pedidoInsertado ? pedidoId : null };
}

async function assertCmPersistencia(rid, uidEsperado, paso) {
  const erv = (await query(
    `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [rid],
  )).rows[0];
  ok(erv.etapa_codigo === 'COORDINACION_CM', `${paso} ERV etapa COORDINACION_CM`);
  ok(erv.estado_codigo === 'EN_TRAMITE', `${paso} ERV EN_TRAMITE`);
  ok(erv.responsable_tipo === 'PERSONA' && Number(erv.responsable_usuario_id) === Number(uidEsperado),
    `${paso} responsable PERSONA=${uidEsperado}`);

  const req = (await query(
    'SELECT estado_actual, responsable_actual, estado FROM requerimientos WHERE id = $1',
    [rid],
  )).rows[0];
  ok(String(req.estado_actual).toUpperCase() === 'ACTOS_PREPARATORIOS', `${paso} legacy estado_actual ACTOS_PREPARATORIOS`);
  ok(String(req.responsable_actual) === String(uidEsperado), `${paso} legacy responsable_actual persona`);

  const ev = (await query(
    `SELECT etapa_destino FROM workflow_eventos
     WHERE expediente_id = $1 AND UPPER(evento_codigo) = 'PROGRAMACION_APROBADA'
     ORDER BY id DESC LIMIT 1`,
    [rid],
  )).rows[0];
  ok(String(ev?.etapa_destino).toUpperCase() === 'COORDINACION_CM', `${paso} workflow_evento etapa_destino CM`);
}

async function cleanupRid(rid, pedidoIdCreado = null) {
  await query('DELETE FROM requerimiento_pedidos WHERE requerimiento_id = $1', [rid]).catch(() => {});
  if (pedidoIdCreado) {
    await query('DELETE FROM pedidos_sigamef WHERE id = $1', [pedidoIdCreado]).catch(() => {});
  }
  await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]).catch(() => {});
  await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]).catch(() => {});
  await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]).catch(() => {});
  await query('DELETE FROM historial_movimientos WHERE requerimiento_id = $1', [rid]).catch(() => {});
  await query('DELETE FROM requerimientos WHERE id = $1', [rid]).catch(() => {});
}

let ridLegacy = null;
let ridMotor = null;
let pedidoLegacy = null;
let pedidoMotor = null;

try {
  console.log('\nA/C-legacy — ejecutarProgramacionAprobadaContMenores (legacyHandler)');
  if (!progActor) {
    console.log('  ⚠ omitido legacy/motor endpoint (sin actor Programación DERIVAR en BD)');
  } else {
    const seeded = await seedEnProgramacion('legacy');
    ridLegacy = seeded.rid;
    pedidoLegacy = seeded.pedidoInsertado;
    await ejecutarProgramacionAprobadaContMenores({
      requerimientoId: ridLegacy,
      req: { user: { id: progActor.id, rol: progActor.rol || 'operador' }, body: { tipo_contratacion: 'BIEN' } },
      usuario: progActor.username || 'prog-test',
      usuarioDestinoId: coordId,
      clientRequestId: `test-h6a:legacy:${ridLegacy}:${seeded.ts}`,
      flagsOverride: { WORKFLOW_ENGINE_PROGRAMACION: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    });
    await assertCmPersistencia(ridLegacy, coordId, 'legacy');

    console.log('\nC-motor — ejecutarProgramacionAprobadaContMenores (motor)');
    const seededM = await seedEnProgramacion('motor');
    ridMotor = seededM.rid;
    pedidoMotor = seededM.pedidoInsertado;
    await ejecutarProgramacionAprobadaContMenores({
      requerimientoId: ridMotor,
      req: { user: { id: progActor.id, rol: progActor.rol || 'operador' }, body: { tipo_contratacion: 'BIEN' } },
      usuario: progActor.username || 'prog-test',
      usuarioDestinoId: coordId,
      clientRequestId: `test-h6a:motor:${ridMotor}:${seededM.ts}`,
      flagsOverride: { WORKFLOW_ENGINE_PROGRAMACION: true, WORKFLOW_ENGINE_WRITE_ENABLED: true },
    });
    await assertCmPersistencia(ridMotor, coordId, 'motor');
  }

  console.log('\nA/B — transicionarExpediente directo P→CM y CM→I');
  const seededB = await seedEnProgramacion('chain');
  const ridChain = seededB.rid;
  await transicionarExpediente({
    requerimientoId: ridChain,
    evento: 'PROGRAMACION_APROBADA',
    usuarioDestinoId: coordId,
    metadata: {
      client_request_id: `test-h6a:prog-ap:${ridChain}`,
      via: 'test-rc8178h6-a',
    },
    actorRol: 'test-h6a',
  });
  await assertCmPersistencia(ridChain, coordId, 'A');

  await derivarActos(ridChain, {
    equipo_uad: EQUIPOS_UAD.CONT_MENORES,
    destino_persona: String(analistaId),
    destino_submodulo: 'Invitaciones',
    usuario: 'test-h6a',
  });
  const ervI = (await query(
    `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [ridChain],
  )).rows[0];
  ok(ervI.etapa_codigo === 'INVITACIONES', 'B1 ERV INVITACIONES');
  ok(ervI.estado_codigo === 'EN_TRAMITE', 'B2 ERV EN_TRAMITE');
  ok(Number(ervI.responsable_usuario_id) === Number(analistaId), 'B3 responsable analista');

  const evCmI = (await query(
    `SELECT evento_codigo, etapa_origen, etapa_destino FROM workflow_eventos
     WHERE expediente_id = $1 AND UPPER(evento_codigo) = 'COORDINACION_CM_APROBADA'
     ORDER BY id DESC LIMIT 1`,
    [ridChain],
  )).rows[0];
  ok(evCmI?.etapa_origen === 'COORDINACION_CM' && evCmI?.etapa_destino === 'INVITACIONES',
    'B4 evento COORDINACION_CM_APROBADA CM→I');

  await cleanupRid(ridChain);
} finally {
  if (ridLegacy) await cleanupRid(ridLegacy, pedidoLegacy);
  if (ridMotor) await cleanupRid(ridMotor, pedidoMotor);
}

console.log('\n✅ RC8.17.8H6-A — OK\n');

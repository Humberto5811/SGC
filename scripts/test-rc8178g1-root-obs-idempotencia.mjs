/**
 * RC8.17.8G1 — Idempotencia por nodo en observaciones raíz Eval→Registro.
 */
import assert from 'node:assert/strict';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { registrarSubsanacionObservacion } from '../server/lib/observacionesWorkflow.js';
import { registrarSubsanacionDerivacion } from '../server/lib/trazabilidad.js';
import {
  allocateObservacionHijaId,
  allocateObservacionRaizId,
  buildClientRequestIdEvalObservacion,
  buildEvalObservacionPayloadDomainMutator,
} from '../server/lib/observacionEvaluacionSubobs.js';
import { getRaicesObservaciones } from '../shared/observacionesMotor.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8G1 — Raíz por nodo + atomicidad ===\n');

console.log('Helpers CRQ raíz');
ok(
  buildClientRequestIdEvalObservacion({ requerimientoId: 43, observacionRaizId: 'obs_act_A' })
    === 'eval-obs:43:obs_act_A',
  'eval-obs:<req>:<raiz>',
);
ok(
  buildClientRequestIdEvalObservacion({ requerimientoId: 43, observacionRaizId: 'obs_act_A' })
    !== buildClientRequestIdEvalObservacion({ requerimientoId: 43, observacionRaizId: 'obs_act_B' }),
  'raíces distintas → keys distintas',
);
ok(
  buildClientRequestIdEvalObservacion({ requerimientoId: 43 }) === 'eval-obs:43',
  'compat histórico eval-obs:<req> sin nodo',
);

await runMigrations();

const { rows: evalRows } = await query(`
  SELECT id FROM usuarios WHERE activo = TRUE AND LOWER(username) = 'mgrande' LIMIT 1
`);
const { rows: auRows } = await query(`
  SELECT id FROM usuarios WHERE activo = TRUE AND LOWER(username) = 'wvasquez' LIMIT 1
`);
const evalId = evalRows[0]?.id;
const auId = auRows[0]?.id;
if (!evalId || !auId) {
  console.log('  ⚠ Saltando integración: faltan mgrande/wvasquez');
  process.exit(0);
}

const codigo = `REQ-RC8178G1-${Date.now()}`;
const ins = await query(`
  INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, cmn)
  VALUES ('bienes', $1, 'Test G1', 'Area', 'CNCC', 'En tramite', '{}'::jsonb, 'CNCC')
  RETURNING id
`, [codigo]);
const rid = ins.rows[0].id;

async function readErv() {
  const { rows } = await query(
    `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id, version
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [rid],
  );
  return rows[0];
}

async function readPayload() {
  const { rows } = await query('SELECT payload FROM requerimientos WHERE id = $1', [rid]);
  return JSON.parse(rows[0]?.payload || '{}');
}

async function countEvalObsEvents() {
  const { rows } = await query(
    `SELECT id, idempotency_key, metadata FROM workflow_eventos
     WHERE expediente_id = $1 AND evento_codigo = 'EVALUACION_OBSERVADA' ORDER BY id`,
    [rid],
  );
  return rows;
}

async function countActiveAsignaciones() {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM expediente_asignaciones
     WHERE requerimiento_id = $1 AND activo = TRUE`,
    [rid],
  );
  return rows[0].n;
}

function rootObsMutator(raizId, motivo, opts = {}) {
  return buildEvalObservacionPayloadDomainMutator({
    motivo,
    usuarioEmisor: 'mgrande',
    destinoSubmodulo: 'Registro de Requerimiento',
    destinoEtapa: 'REGISTRO',
    usuarioDestinoId: auId,
    usuarioOrigenId: evalId,
    observacionRaizId: raizId,
    incluirHistorialEvaluacion: true,
    ...opts,
  });
}

async function obsRaiz(raizId, motivo, extra = {}) {
  const crq = buildClientRequestIdEvalObservacion({ requerimientoId: rid, observacionRaizId: raizId });
  return transicionarExpediente({
    requerimientoId: rid,
    evento: 'EVALUACION_OBSERVADA',
    usuarioOrigenId: evalId,
    usuarioDestinoId: auId,
    motivo,
    metadata: {
      client_request_id: crq,
      destino_submodulo: 'Registro de Requerimiento',
      destino_etapa: 'REGISTRO',
      usuario_destino_id: auId,
      observacion_raiz_id: raizId,
      ...extra,
    },
    actorRol: 'mgrande',
    domainMutator: rootObsMutator(raizId, motivo, extra.mutatorOpts || {}),
  });
}

try {
  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'REQUERIMIENTO_REGISTRADO',
    usuarioDestinoId: auId,
    motivo: 'Alta test G1',
    metadata: { client_request_id: `g1-reg:${rid}` },
    actorRol: 'wvasquez',
  });
  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'REQUERIMIENTO_ENVIADO_EVALUACION',
    usuarioDestinoId: evalId,
    motivo: 'A evaluación',
    metadata: { client_request_id: `g1-deriv:${rid}` },
    actorRol: 'wvasquez',
  });

  console.log('\nCASO A — primera raíz');
  const raizA = 'obs_act_g1_A';
  const trA = await obsRaiz(raizA, 'Obs raíz A');
  ok(trA.idempotente !== true, 'primera raíz no idempotente');
  let erv = await readErv();
  ok(erv.etapa_codigo === 'REGISTRO' && erv.estado_codigo === 'OBSERVADO', 'ERV Registro OBSERVADO');
  ok(Number(erv.responsable_usuario_id) === Number(auId), 'ERV PERSONA wvasquez');
  let payload = await readPayload();
  const raices = getRaicesObservaciones(payload.observaciones || []);
  const nodeA = raices.find((o) => o.id === raizA);
  ok(nodeA?.id === raizA, 'nodo raíz A');
  let evs = await countEvalObsEvents();
  ok(evs.length === 1, 'un evento EVALUACION_OBSERVADA');
  ok(String(evs[0].idempotency_key).includes(`eval-obs:${rid}:${raizA}`), 'key eval-obs:req:A');

  console.log('\nCASO B — subsanar y retornar a Eval');
  registrarSubsanacionObservacion(payload, {
    observacion_id: raizA,
    respuesta: 'Subsanado A',
    origen_submodulo: 'Registro de Requerimiento',
    usuario: 'wvasquez',
  });
  await query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [rid, JSON.stringify(payload)]);
  await registrarSubsanacionDerivacion({
    requerimientoId: rid,
    usuario: 'wvasquez',
    textoSubsanacion: 'Subsanado A',
    origenSubmodulo: 'Registro de Requerimiento',
    destinoSubmodulo: 'Evaluación de Requerimiento',
    destinoEtapa: 'EVALUACION',
    destinoPersona: 'mgrande',
    observacionId: raizA,
    usuarioDestinoId: evalId,
  });
  erv = await readErv();
  ok(erv.etapa_codigo === 'EVALUACION' && erv.estado_codigo === 'EN_TRAMITE', 'retorno Eval EN_TRAMITE');
  ok(Number(erv.responsable_usuario_id) === Number(evalId), 'responsable mgrande');

  console.log('\nCASO E — fallo de transición (rollback, etapa Eval)');
  const raizFail = 'obs_act_g1_FAIL';
  const ervPre = await readErv();
  const rootsPre = getRaicesObservaciones((await readPayload()).observaciones || []).length;
  let threw = false;
  try {
    await transicionarExpediente({
      requerimientoId: rid,
      evento: 'EVALUACION_OBSERVADA',
      usuarioOrigenId: evalId,
      usuarioDestinoId: auId,
      motivo: 'Obs que falla',
      metadata: {
        client_request_id: buildClientRequestIdEvalObservacion({ requerimientoId: rid, observacionRaizId: raizFail }),
        destino_submodulo: 'Registro de Requerimiento',
        destino_etapa: 'REGISTRO',
        usuario_destino_id: auId,
        observacion_raiz_id: raizFail,
      },
      actorRol: 'mgrande',
      domainMutator: async (client, ctx) => {
        await rootObsMutator(raizFail, 'Obs que falla')(client, ctx);
        throw new Error('SIMULATED_G1_FAIL');
      },
    });
  } catch (e) {
    threw = true;
    ok(String(e.message).includes('SIMULATED_G1_FAIL'), 'error simulado');
  }
  ok(threw, 'transición abortada');
  payload = await readPayload();
  ok(!payload.observaciones?.some((o) => o.id === raizFail), 'sin nodo fail en payload');
  erv = await readErv();
  ok(erv.etapa_codigo === ervPre.etapa_codigo && Number(erv.version) === Number(ervPre.version), 'ERV intacto');
  ok(getRaicesObservaciones(payload.observaciones || []).length === rootsPre, 'misma cantidad de raíces');

  console.log('\nCASO C — segunda raíz legítima');
  const raizB = 'obs_act_g1_B';
  await obsRaiz(raizB, 'Obs raíz B');
  payload = await readPayload();
  const raices2 = getRaicesObservaciones(payload.observaciones || []);
  ok(raices2.filter((o) => !o.observacion_padre_id).length >= 2, 'al menos dos raíces');
  ok(raices2.some((o) => o.id === raizB), 'nodo raíz B');
  ok(raizB !== raizA, 'B distinto de A');
  evs = await countEvalObsEvents();
  ok(evs.length === 2, 'segundo EVALUACION_OBSERVADA');
  const keys = evs.map((e) => e.idempotency_key);
  ok(keys[0] !== keys[1], 'keys distintas A vs B');
  erv = await readErv();
  ok(erv.etapa_codigo === 'REGISTRO' && Number(erv.responsable_usuario_id) === Number(auId), 'ERV otra vez Registro wvasquez');

  console.log('\nCASO D — doble envío B');
  const asigBefore = await countActiveAsignaciones();
  const verBefore = erv.version;
  const trReplay = await obsRaiz(raizB, 'Obs raíz B');
  ok(trReplay.idempotente === true, 'replay idempotente');
  evs = await countEvalObsEvents();
  ok(evs.length === 2, 'sigue habiendo dos eventos');
  payload = await readPayload();
  ok(getRaicesObservaciones(payload.observaciones || []).filter((o) => o.id === raizB).length === 1, 'un solo nodo B');
  ok(await countActiveAsignaciones() === asigBefore, 'sin asignación extra');
  erv = await readErv();
  ok(Number(erv.version) === Number(verBefore), 'ERV sin incremento por replay');

  console.log('\nCASO F — regresión subobs (keys eval-subobs sin cambio)');
  const hijaStub = allocateObservacionHijaId({ observaciones: [{ id: 'padre_g1' }] }, 'padre_g1', 'obs_sub_g1_f1');
  const crqSub = buildClientRequestIdEvalObservacion({
    requerimientoId: rid,
    observacionPadreId: 'padre_g1',
    observacionHijaId: hijaStub,
  });
  ok(crqSub === `eval-subobs:${rid}:${hijaStub}`, 'eval-subobs:<req>:<hija> intacto');
  ok(!crqSub.includes('eval-obs'), 'subobs no usa prefijo raíz');

  console.log('\n=== RC8.17.8G1 OK ===\n');
} finally {
  await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]);
  await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]);
  await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
  await query('DELETE FROM requerimientos WHERE id = $1', [rid]);
}

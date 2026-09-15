/**
 * RC8.17.8G — Subobservaciones dirigidas: ERV + idempotencia por nodo + atomicidad.
 */
import assert from 'node:assert/strict';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { emitirObservacion, registrarSubsanacionObservacion } from '../server/lib/observacionesWorkflow.js';
import { registrarSubsanacionDerivacion } from '../server/lib/trazabilidad.js';
import {
  allocateObservacionHijaId,
  buildClientRequestIdEvalObservacion,
  buildEvalObservacionPayloadDomainMutator,
} from '../server/lib/observacionEvaluacionSubobs.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };
const fail = (c, m) => { assert.ok(!c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8G — Subobservación con transición canónica ===\n');

console.log('Helpers idempotencia');
const payloadStub = { observaciones: [{ id: 'padre_x' }] };
const h1 = allocateObservacionHijaId(payloadStub, 'padre_x');
payloadStub.observaciones.push({ id: h1, observacion_padre_id: 'padre_x' });
const h2 = allocateObservacionHijaId(payloadStub, 'padre_x');
ok(h1 !== h2, 'dos hijas consecutivas generan ids distintos');
ok(
  buildClientRequestIdEvalObservacion({ requerimientoId: 40, observacionPadreId: 'p', observacionHijaId: h1 })
    !== buildClientRequestIdEvalObservacion({ requerimientoId: 40, observacionPadreId: 'p', observacionHijaId: h2 }),
  'client_request_id distinto por nodo hijo',
);
ok(
  buildClientRequestIdEvalObservacion({ requerimientoId: 40, observacionPadreId: 'p', observacionHijaId: h1 })
    === buildClientRequestIdEvalObservacion({ requerimientoId: 40, observacionPadreId: 'p', observacionHijaId: h1 }),
  'reintento mismo hijo → misma key',
);
ok(
  buildClientRequestIdEvalObservacion({ requerimientoId: 40, observacionRaizId: 'obs_root_1' })
    === 'eval-obs:40:obs_root_1',
  'raíz G1 eval-obs:<id>:<nodo>',
);
ok(
  buildClientRequestIdEvalObservacion({ requerimientoId: 40 }) === 'eval-obs:40',
  'compat histórico eval-obs:<id> sin nodo',
);

console.log('\nIntegración BD (flujo REQ-00040)');
await runMigrations();

const { rows: decRows } = await query(`
  SELECT id FROM usuarios WHERE activo = TRUE AND LOWER(username) = 'lespinoza' LIMIT 1
`);
const { rows: evalRows } = await query(`
  SELECT id FROM usuarios WHERE activo = TRUE AND LOWER(username) = 'mgrande' LIMIT 1
`);
const { rows: auRows } = await query(`
  SELECT id FROM usuarios WHERE activo = TRUE AND LOWER(username) = 'wvasquez' LIMIT 1
`);
const decId = decRows[0]?.id;
const evalId = evalRows[0]?.id;
const auId = auRows[0]?.id;
if (!decId || !evalId || !auId) {
  console.log('  ⚠ Saltando integración: faltan lespinoza/mgrande/wvasquez en BD local');
  process.exit(0);
}

const codigo = `REQ-RC8178G-${Date.now()}`;
const ins = await query(`
  INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, cmn)
  VALUES ('bienes', $1, 'Test RC8178G', 'Area', 'CNCC', 'En tramite de aprobación',
    '{"area":{"responsable":"CNCC"}}'::jsonb, 'CNCC')
  RETURNING id
`, [codigo]);
const rid = ins.rows[0].id;
let rid2;

async function readErv() {
  const { rows } = await query(
    `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [rid],
  );
  return rows[0];
}

async function readPayload() {
  const { rows } = await query('SELECT payload FROM requerimientos WHERE id = $1', [rid]);
  return JSON.parse(rows[0]?.payload || '{}');
}

async function activeAsignacion() {
  const { rows } = await query(
    `SELECT etapa_codigo, usuario_id, activo FROM expediente_asignaciones
     WHERE requerimiento_id = $1 AND activo = TRUE`,
    [rid],
  );
  return rows[0];
}

try {
  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'REQUERIMIENTO_REGISTRADO',
    usuarioDestinoId: auId,
    motivo: 'Materialización test',
    metadata: { client_request_id: `test-8178g-reg:${rid}` },
    actorRol: 'wvasquez',
  });

  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'REQUERIMIENTO_ENVIADO_EVALUACION',
    usuarioDestinoId: evalId,
    motivo: 'A evaluación',
    metadata: { client_request_id: `test-8178g-deriv:${rid}` },
    actorRol: 'wvasquez',
  });

  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'EVALUACION_APROBADA',
    usuarioOrigenId: evalId,
    usuarioDestinoId: decId,
    motivo: 'A DEC',
    metadata: { client_request_id: `test-8178g-aprob:${rid}` },
    actorRol: 'mgrande',
  });

  let payload = await readPayload();
  emitirObservacion(payload, {
    motivo: 'Obs DEC padre',
    gerente: 'lespinoza',
    origen: 'DEC',
    origen_submodulo: 'DEC',
    destino_submodulo: 'Evaluación de Requerimiento',
    destino_etapa: 'EVALUACION',
    destino_persona: 'mgrande',
    usuario_origen_id: decId,
    usuario_destino_id: evalId,
  });
  const padreObs = payload.observaciones.find((o) => o.motivo === 'Obs DEC padre');
  ok(padreObs?.id, 'observación padre DEC creada en payload');

  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'DEC_OBSERVADA',
    usuarioDestinoId: evalId,
    motivo: 'Obs DEC padre',
    metadata: {
      client_request_id: `test-8178g-dec-obs:${rid}`,
      etapa_destino: 'EVALUACION',
      usuario_destino_id: evalId,
    },
    actorRol: 'lespinoza',
    domainMutator: async (tx) => {
      await tx.query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [rid, JSON.stringify(payload)]);
      return { observacion: true };
    },
  });

  let erv = await readErv();
  ok(erv.etapa_codigo === 'EVALUACION' && erv.estado_codigo === 'OBSERVADO', 'ERV Eval OBSERVADO tras DEC obs');
  ok(Number(erv.responsable_usuario_id) === Number(evalId), 'ERV responsable mgrande');

  const hijaId = allocateObservacionHijaId(await readPayload(), padreObs.id);
  const hijaFail = 'obs_sub_atomic_fail_test';
  const crqSub = buildClientRequestIdEvalObservacion({
    requerimientoId: rid,
    observacionPadreId: padreObs.id,
    observacionHijaId: hijaId,
  });

  const mutatorOpts = {
    motivo: 'Subobs hacia Registro',
    usuarioEmisor: 'mgrande',
    destinoSubmodulo: 'Registro de Requerimiento',
    destinoEtapa: 'REGISTRO',
    destinoPersona: 'wvasquez',
    origenSubmodulo: 'Evaluación de Requerimiento',
    usuarioDestinoId: auId,
    usuarioOrigenId: evalId,
    observacionPadreId: padreObs.id,
    observacionHijaId: hijaId,
  };

  console.log('\nAtomicidad — fallo post-mutator no persiste hija');
  const beforeCount = (await readPayload()).observaciones?.length || 0;
  let failCaught = false;
  try {
    await transicionarExpediente({
      requerimientoId: rid,
      evento: 'EVALUACION_OBSERVADA',
      usuarioOrigenId: evalId,
      usuarioDestinoId: auId,
      motivo: 'Subobs fallida',
      metadata: {
        client_request_id: buildClientRequestIdEvalObservacion({
          requerimientoId: rid,
          observacionPadreId: padreObs.id,
          observacionHijaId: hijaFail,
        }),
        destino_etapa: 'REGISTRO',
        destino_submodulo: 'Registro de Requerimiento',
        usuario_destino_id: auId,
      },
      actorRol: 'mgrande',
      domainMutator: async (tx, ctx) => {
        await buildEvalObservacionPayloadDomainMutator({
          ...mutatorOpts,
          observacionHijaId: hijaFail,
          motivo: 'Subobs fallida',
        })(tx, ctx);
        const err = new Error('fallo simulado post payload');
        err.code = 'TEST_FAIL';
        throw err;
      },
    });
  } catch (e) {
    failCaught = e?.code === 'TEST_FAIL';
  }
  ok(failCaught, 'transición abortada');
  ok(((await readPayload()).observaciones?.length || 0) === beforeCount, 'payload sin hija huérfana tras rollback');

  const trSub = await transicionarExpediente({
    requerimientoId: rid,
    evento: 'EVALUACION_OBSERVADA',
    usuarioOrigenId: evalId,
    usuarioDestinoId: auId,
    motivo: 'Subobs hacia Registro',
    metadata: {
      client_request_id: crqSub,
      destino_submodulo: 'Registro de Requerimiento',
      destino_etapa: 'REGISTRO',
      usuario_destino_id: auId,
      observacion_id: hijaId,
      observacion_padre_id: padreObs.id,
      via: 'test-rc8178g-subobs',
    },
    actorRol: 'mgrande',
    domainMutator: buildEvalObservacionPayloadDomainMutator(mutatorOpts),
  });
  ok(!trSub.idempotente, 'primera subobs no idempotente');

  erv = await readErv();
  ok(erv.etapa_codigo === 'REGISTRO', 'ERV REGISTRO tras subobs');
  ok(erv.estado_codigo === 'OBSERVADO', 'ERV OBSERVADO');
  ok(Number(erv.responsable_usuario_id) === Number(auId), 'ERV PERSONA wvasquez');

  const asig = await activeAsignacion();
  ok(asig?.etapa_codigo === 'REGISTRO' && Number(asig.usuario_id) === Number(auId), 'asignación activa Registro/wvasquez');

  payload = await readPayload();
  const hija = payload.observaciones.find((o) => String(o.id) === String(hijaId));
  const padre = payload.observaciones.find((o) => String(o.id) === String(padreObs.id));
  ok(hija && !hija.cerrada, 'hija abierta');
  ok(padre && !padre.cerrada, 'padre sigue abierto');

  const { rows: evSub } = await query(
    `SELECT id, evento_codigo, metadata FROM workflow_eventos
     WHERE expediente_id = $1 AND metadata->>'client_request_id' = $2`,
    [rid, crqSub],
  );
  ok(evSub.length === 1, 'un evento por subobs');
  ok(evSub[0].evento_codigo === 'EVALUACION_OBSERVADA', 'evento EVALUACION_OBSERVADA');
  ok(evSub[0].metadata?.observacion_padre_id === padreObs.id, 'metadata observacion_padre_id');

  const trRetry = await transicionarExpediente({
    requerimientoId: rid,
    evento: 'EVALUACION_OBSERVADA',
    usuarioOrigenId: evalId,
    usuarioDestinoId: auId,
    motivo: 'Subobs hacia Registro',
    metadata: { client_request_id: crqSub, destino_etapa: 'REGISTRO', usuario_destino_id: auId },
    actorRol: 'mgrande',
    domainMutator: buildEvalObservacionPayloadDomainMutator(mutatorOpts),
  });
  ok(trRetry.idempotente === true, 'reintento misma subobs es idempotente');
  const { rows: evDup } = await query(
    `SELECT COUNT(*)::int AS n FROM workflow_eventos WHERE expediente_id = $1 AND metadata->>'client_request_id' = $2`,
    [rid, crqSub],
  );
  ok(evDup[0].n === 1, 'reintento no duplica evento');

  const hijaId2 = allocateObservacionHijaId(await readPayload(), padreObs.id);
  const crqSub2 = buildClientRequestIdEvalObservacion({
    requerimientoId: rid,
    observacionPadreId: padreObs.id,
    observacionHijaId: hijaId2,
  });
  ok(crqSub !== crqSub2, 'segunda subobs distinta key (si se creara)');

  console.log('\nSubsanar hija → Eval/mgrande');
  payload = await readPayload();
  const { destinoSubmodulo, destinoEtapa, destinoPersona } = registrarSubsanacionObservacion(payload, {
    observacion_id: hijaId,
    respuesta: 'Corregido en registro',
    origen_submodulo: 'Registro de Requerimiento',
    usuario: 'wvasquez',
  });
  await query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [rid, JSON.stringify(payload)]);
  await registrarSubsanacionDerivacion({
    requerimientoId: rid,
    usuario: 'wvasquez',
    textoSubsanacion: 'Corregido en registro',
    origenSubmodulo: 'Registro de Requerimiento',
    destinoSubmodulo,
    destinoEtapa,
    destinoPersona,
    observacionId: hijaId,
    usuarioDestinoId: evalId,
  });

  erv = await readErv();
  ok(erv.etapa_codigo === 'EVALUACION', 'ERV Eval tras subsanar hija');
  ok(erv.estado_codigo === 'EN_TRAMITE', 'ERV EN_TRAMITE');
  ok(Number(erv.responsable_usuario_id) === Number(evalId), 'ERV mgrande');
  let padreAfterHija = (await readPayload()).observaciones.find((o) => String(o.id) === String(padreObs.id));
  ok(padreAfterHija && !padreAfterHija.cerrada, 'padre DEC sigue abierto');

  console.log('\nSubsanar padre → DEC/lespinoza');
  payload = await readPayload();
  const subsPadre = registrarSubsanacionObservacion(payload, {
    observacion_id: padreObs.id,
    respuesta: 'Subsana evaluación',
    origen_submodulo: 'Evaluación de Requerimiento',
    usuario: 'mgrande',
  });
  await query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [rid, JSON.stringify(payload)]);
  await registrarSubsanacionDerivacion({
    requerimientoId: rid,
    usuario: 'mgrande',
    textoSubsanacion: 'Subsana evaluación',
    origenSubmodulo: 'Evaluación de Requerimiento',
    destinoSubmodulo: subsPadre.destinoSubmodulo,
    destinoEtapa: subsPadre.destinoEtapa,
    destinoPersona: subsPadre.destinoPersona,
    observacionId: padreObs.id,
    usuarioDestinoId: decId,
  });

  erv = await readErv();
  ok(erv.etapa_codigo === 'DEC', 'ERV DEC tras subsanar padre');
  ok(erv.estado_codigo === 'EN_TRAMITE', 'ERV EN_TRAMITE DEC');
  ok(Number(erv.responsable_usuario_id) === Number(decId), 'ERV lespinoza');

  console.log('\nRegresión raíz Eval→Registro (key eval-obs por nodo)');
  const codigo2 = `REQ-RC8178G-ROOT-${Date.now()}`;
  const ins2 = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, cmn)
    VALUES ('bienes', $1, 'Test root obs', 'Area', 'CNCC', 'En tramite de aprobación', '{}'::jsonb, 'CNCC')
    RETURNING id
  `, [codigo2]);
  rid2 = ins2.rows[0].id;
  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, version, actualizado_at
    ) VALUES ($1, 'EVALUACION', 'Evaluación', 'EN_TRAMITE', 'En trámite', 'PERSONA', $2, 1, NOW())
  `, [rid2, evalId]);

  const raizG = `obs_root_g_${rid2}`;
  const crqRaiz = buildClientRequestIdEvalObservacion({ requerimientoId: rid2, observacionRaizId: raizG });
  await transicionarExpediente({
    requerimientoId: rid2,
    evento: 'EVALUACION_OBSERVADA',
    usuarioOrigenId: evalId,
    usuarioDestinoId: auId,
    motivo: 'Obs raíz',
    metadata: {
      client_request_id: crqRaiz,
      destino_submodulo: 'Registro de Requerimiento',
      destino_etapa: 'REGISTRO',
      usuario_destino_id: auId,
      observacion_raiz_id: raizG,
    },
    actorRol: 'mgrande',
    domainMutator: buildEvalObservacionPayloadDomainMutator({
      motivo: 'Obs raíz',
      usuarioEmisor: 'mgrande',
      destinoSubmodulo: 'Registro de Requerimiento',
      destinoEtapa: 'REGISTRO',
      usuarioDestinoId: auId,
      usuarioOrigenId: evalId,
      observacionRaizId: raizG,
      incluirHistorialEvaluacion: true,
    }),
  });
  const erv2 = (await query(
    'SELECT etapa_codigo, responsable_usuario_id FROM expediente_estado_vigente WHERE requerimiento_id = $1',
    [rid2],
  )).rows[0];
  ok(erv2.etapa_codigo === 'REGISTRO' && Number(erv2.responsable_usuario_id) === Number(auId), 'obs raíz mueve ERV');

  console.log('\n=== RC8.17.8G OK ===\n');
} finally {
  const ids = [rid];
  if (rid2 != null) ids.push(rid2);
  await query('DELETE FROM workflow_eventos WHERE expediente_id = ANY($1::int[])', [ids]);
  await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = ANY($1::int[])', [ids]);
  await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = ANY($1::int[])', [ids]);
  await query('DELETE FROM requerimientos WHERE id = ANY($1::int[])', [ids]);
}

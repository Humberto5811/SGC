/**
 * RC8.17.8H6-B5.2 — PUT subsanar debe enriquecer payload legacy como GET antes de autorizar.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { observarConsultasObservaciones } from '../server/lib/consultasObservacionesExpediente.js';
import { SUBMODULO_CONSULTAS_OBSERVACIONES } from '../server/lib/consultasObservacionesBandeja.js';
import { listarCandidatosObservacionDestino } from '../server/lib/candidatosObservacionDestino.js';
import { enrichPayloadForExpediente } from '../server/lib/consultasObservacionLegacyDerivacionEnrich.js';
import { registrarSubsanacionObservacion } from '../server/lib/observacionesWorkflow.js';
import {
  puedeSubsanar,
  getListaObservaciones,
} from '../shared/observacionesMotor.js';
import {
  isPreB5ConsultasObservacionPersona,
  extractConsultasObservadaDerivacionEvent,
} from '../shared/consultasObservacionLegacyDerivacion.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };
const fail = (c, m) => { assert.ok(!c, m); console.log(`  ✓ ${m}`); };

function expectSubsanacion403(fn, label) {
  try {
    fn();
    assert.fail(`${label} — debía lanzar 403`);
  } catch (e) {
    ok(e.status === 403 && e.code === 'SUBSANACION_NO_AUTORIZADA', label);
  }
}

console.log('\n=== RC8.17.8H6-B5.2 — subsanar PUT path + enrich B5.1 ===\n');

await runMigrations({ silent: true });

const { rows: uPool } = await query(
  `SELECT id, username FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 4`,
);
const analistaId = uPool[0]?.id || 260;
const otroUsuarioId = uPool.find((u) => Number(u.id) !== Number(analistaId))?.id || uPool[1]?.id;
const ts = Date.now();
let rid = null;

const ins = await query(`
  INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual,
    sub_modulo_actual, responsable_actual, payload)
  VALUES ('bienes', $1, 'T0001', 'Test H6-B5.2', 'Test', 'CNCC', 'En trámite', 'CONSULTAS_OBSERVACIONES',
    'Consultas y Observaciones', $2, '{"observaciones":[]}'::jsonb)
  RETURNING id
`, [`REQ-TEST-H6B52-${ts}`, String(analistaId)]);
rid = ins.rows[0].id;

await query(`
  INSERT INTO expediente_estado_vigente (
    requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
    responsable_tipo, responsable_usuario_id, responsable_fuente, version
  ) VALUES ($1, 'CONSULTAS_OBSERVACIONES', 'Consultas y Observaciones', 'OBSERVADO', 'Observado',
    'PERSONA', $2, 'asignacion_explicita', 1)
`, [rid, analistaId]);

let cand = await listarCandidatosObservacionDestino({
  requerimientoId: rid,
  destinoSubmodulo: 'Registro de Requerimiento',
});
let destinoSub = 'Registro de Requerimiento';
let destinoEtapa = 'REGISTRO';
if (!cand.recomendado && !(cand.candidatos || []).length) {
  cand = await listarCandidatosObservacionDestino({
    requerimientoId: rid,
    destinoSubmodulo: 'DEC',
  });
  destinoSub = 'DEC';
  destinoEtapa = 'DEC';
}
const destinatario = cand.recomendado || cand.candidatos?.[0];
ok(destinatario?.id != null, '1 — candidato PERSONA');

await observarConsultasObservaciones(rid, {
  motivo: 'Obs test B5.2 PUT enrich',
  usuario: uPool[0]?.username || 'test-h6b52',
  origen_submodulo: SUBMODULO_CONSULTAS_OBSERVACIONES,
  destino_submodulo: destinoSub,
  destino_etapa: destinoEtapa,
  destino_persona: destinatario.nombre,
  usuario_origen_id: analistaId,
  usuario_destino_id: destinatario.id,
  client_request_id: `test-h6b52-obs:${rid}:${ts}`,
});

const { rows: wfRows } = await query(
  `SELECT id, evento_codigo, metadata, created_at FROM workflow_eventos
   WHERE expediente_id = $1 AND evento_codigo = 'CONSULTAS_OBSERVADA' ORDER BY id DESC LIMIT 1`,
  [rid],
);
ok(wfRows.length === 1, '2 — evento CONSULTAS_OBSERVADA');
ok(extractConsultasObservadaDerivacionEvent(wfRows[0])?.destino_derivacion_submodulo === destinoSub, '2 — metadata determinista');

const { rows: reqRows } = await query('SELECT payload FROM requerimientos WHERE id = $1', [rid]);
let payloadPersistido = typeof reqRows[0].payload === 'object'
  ? JSON.parse(JSON.stringify(reqRows[0].payload))
  : JSON.parse(reqRows[0].payload || '{}');
const obsEntry = payloadPersistido.observaciones[payloadPersistido.observaciones.length - 1];
ok(String(obsEntry?.destino_derivacion_submodulo || '').length > 0, '3 — payload post-obs trae derivación (antes de simular legacy)');

delete obsEntry.destino_derivacion_submodulo;
delete obsEntry.destino_derivacion_etapa;
obsEntry.estado = 'RECIBIDA';
ok(isPreB5ConsultasObservacionPersona(obsEntry), '3 — simula legacy pre-B5 en BD');

await query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [rid, JSON.stringify(payloadPersistido)]);

const { rows: rawCheck } = await query('SELECT payload FROM requerimientos WHERE id = $1', [rid]);
const payloadCrudo = typeof rawCheck[0].payload === 'object'
  ? JSON.parse(JSON.stringify(rawCheck[0].payload))
  : JSON.parse(rawCheck[0].payload || '{}');
const obsCruda = getListaObservaciones({ payload: payloadCrudo }).find((o) => String(o.id) === String(obsEntry.id));
ok(!String(obsCruda?.destino_derivacion_submodulo || '').trim(), '4 — BD sin destino_derivacion');

fail(
  puedeSubsanar(destinoSub, { payload: payloadCrudo }, destinatario.id),
  '5 — motor sobre payload crudo NO autoriza (como PUT sin enrich)',
);

const subsArgsBase = {
  observacion_id: obsEntry.id,
  respuesta: 'Subsanación test B5.2',
  origen_submodulo: destinoSub,
  usuario: 'test-h6b52-dest',
};

expectSubsanacion403(
  () => registrarSubsanacionObservacion(JSON.parse(JSON.stringify(payloadCrudo)), {
    ...subsArgsBase,
    actorUsuarioId: destinatario.id,
  }),
  '6 — registrarSubsanacion payload crudo rechaza destinatario',
);

expectSubsanacion403(
  () => registrarSubsanacionObservacion(JSON.parse(JSON.stringify(payloadCrudo)), {
    ...subsArgsBase,
    actorUsuarioId: otroUsuarioId,
  }),
  '6 — payload crudo rechaza otro usuario',
);

expectSubsanacion403(
  () => registrarSubsanacionObservacion(JSON.parse(JSON.stringify(payloadCrudo)), {
    ...subsArgsBase,
    actorUsuarioId: null,
  }),
  '6 — payload crudo rechaza actor null',
);

const payloadEnriquecido = await enrichPayloadForExpediente(rid, payloadCrudo);
ok(
  puedeSubsanar(destinoSub, { payload: payloadEnriquecido }, destinatario.id),
  '7 — tras enrichPayloadForExpediente motor autoriza destinatario',
);

const payloadOk = JSON.parse(JSON.stringify(payloadEnriquecido));
const result = registrarSubsanacionObservacion(payloadOk, {
  ...subsArgsBase,
  actorUsuarioId: destinatario.id,
});
ok(result?.observacion?.subsanacion === subsArgsBase.respuesta, '8 — registrarSubsanacion con enrich permite destinatario');

expectSubsanacion403(
  () => registrarSubsanacionObservacion(JSON.parse(JSON.stringify(payloadEnriquecido)), {
    ...subsArgsBase,
    actorUsuarioId: otroUsuarioId,
  }),
  '9 — enrich + otro usuario sigue SUBSANACION_NO_AUTORIZADA',
);

expectSubsanacion403(
  () => registrarSubsanacionObservacion(JSON.parse(JSON.stringify(payloadEnriquecido)), {
    ...subsArgsBase,
    actorUsuarioId: null,
  }),
  '9 — enrich + actor null sigue rechazado',
);

const { rows: postFailPersist } = await query('SELECT payload FROM requerimientos WHERE id = $1', [rid]);
const obsPersist = getListaObservaciones({
  payload: typeof postFailPersist[0].payload === 'object'
    ? postFailPersist[0].payload
    : JSON.parse(postFailPersist[0].payload || '{}'),
}).find((o) => String(o.id) === String(obsEntry.id));
ok(!obsPersist?.subsanacion, '10 — intentos fallidos no persistieron subsanación');
ok(!String(obsPersist?.destino_derivacion_submodulo || '').trim(), '10 — enrich no hizo UPDATE en BD');

console.log('\n✅ RC8.17.8H6-B5.2 OK\n');

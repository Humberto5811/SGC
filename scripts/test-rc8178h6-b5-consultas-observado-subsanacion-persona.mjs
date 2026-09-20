/**
 * RC8.17.8H6-B5 — Label OBSERVADO en CO + subsanación por PERSONA destinataria.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { observarConsultasObservaciones } from '../server/lib/consultasObservacionesExpediente.js';
import { SUBMODULO_CONSULTAS_OBSERVACIONES } from '../server/lib/consultasObservacionesBandeja.js';
import { listarCandidatosObservacionDestino } from '../server/lib/candidatosObservacionDestino.js';
import { enrichRequerimientoRow } from '../server/lib/trazabilidad.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { registrarSubsanacionObservacion } from '../server/lib/observacionesWorkflow.js';
import {
  puedeSubsanar,
  getListaObservaciones,
} from '../shared/observacionesMotor.js';
import { getLabelEstado, getLabelEstadoParaEtapa } from '../shared/estadoExpedienteCatalog.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };
const fail = (c, m) => { assert.ok(!c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-B5 — CO OBSERVADO label + subsanación PERSONA ===\n');

ok(
  getLabelEstadoParaEtapa('CONSULTAS_OBSERVACIONES', 'OBSERVADO') === 'Observado',
  '1 — getLabelEstadoParaEtapa CO/OBSERVADO',
);
ok(
  getLabelEstado('OBSERVADO').includes('Coordinación CM') || getLabelEstado('OBSERVADO').includes('C.C.'),
  '1 — alias global OBSERVADO sigue siendo cuadro (sin etapa)',
);
fail(
  getLabelEstadoParaEtapa('CONSULTAS_OBSERVACIONES', 'OBSERVADO').includes('C.C.'),
  '2 — label CO no contiene C.C.',
);

await runMigrations({ silent: true });

const { rows: uPool } = await query(
  `SELECT id, username FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 4`,
);
const analistaId = uPool[0]?.id || 260;
const otroUsuarioId = uPool.find((u) => Number(u.id) !== Number(analistaId))?.id || uPool[1]?.id;
const ts = Date.now();
let rid = null;

async function erv() {
  const { rows } = await query(
    `SELECT etapa_codigo, estado_codigo, estado_label, responsable_tipo, responsable_usuario_id
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [rid],
  );
  return rows[0] || null;
}

const ins = await query(`
  INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual,
    sub_modulo_actual, responsable_actual, payload)
  VALUES ('bienes', $1, 'T0001', 'Test H6-B5', 'Test', 'CNCC', 'En trámite', 'CONSULTAS_OBSERVACIONES',
    'Consultas y Observaciones', $2, '{"observaciones":[]}'::jsonb)
  RETURNING id
`, [`REQ-TEST-H6B5-${ts}`, String(analistaId)]);
rid = ins.rows[0].id;

await query(`
  INSERT INTO expediente_estado_vigente (
    requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
    responsable_tipo, responsable_usuario_id, responsable_fuente, version
  ) VALUES ($1, 'CONSULTAS_OBSERVACIONES', 'Consultas y Observaciones', 'EN_TRAMITE', 'En trámite',
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
ok(destinatario?.id != null, '3 — candidato destinatario');

await observarConsultasObservaciones(rid, {
  motivo: 'Obs test B5',
  usuario: uPool[0]?.username || 'test-h6b5',
  origen_submodulo: SUBMODULO_CONSULTAS_OBSERVACIONES,
  destino_submodulo: destinoSub,
  destino_etapa: destinoEtapa,
  destino_persona: destinatario.nombre,
  usuario_origen_id: analistaId,
  usuario_destino_id: destinatario.id,
  client_request_id: `test-h6b5-obs:${rid}:${ts}`,
});

const postObs = await erv();
ok(postObs?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', '4 — ERV etapa CO');
ok(postObs?.estado_codigo === 'OBSERVADO', '4 — ERV estado OBSERVADO');
ok(postObs?.estado_label === 'Observado', '4 — estado_label Observado');
fail(String(postObs?.estado_label || '').includes('Coordinación CM'), '4 — label sin Coordinación CM');
ok(Number(postObs?.responsable_usuario_id) === Number(destinatario.id), '4 — PERSONA(destinatario)');

const { rows: reqRaw } = await query('SELECT * FROM requerimientos WHERE id = $1', [rid]);
const reqRow = enrichRequerimientoRow(reqRaw[0]);
const obsList = getListaObservaciones(reqRow);
const obs = obsList[obsList.length - 1];
ok(obs?.usuario_destino_id != null, '5 — observación con usuario_destino_id');
ok(
  String(obs?.destino_derivacion_submodulo || '').length > 0,
  '5 — destino_derivacion_submodulo persistido',
);

ok(
  puedeSubsanar(destinoSub, reqRow, destinatario.id),
  '6 — destinatario subsana desde submódulo operativo',
);
fail(
  puedeSubsanar(destinoSub, reqRow, otroUsuarioId),
  '6 — otro usuario del submódulo NO subsana',
);
fail(
  puedeSubsanar(destinoSub, reqRow, null),
  '6 — sin sesión NO subsana (PERSONA explícita)',
);

let payload = typeof reqRow.payload === 'object' ? reqRow.payload : JSON.parse(reqRow.payload || '{}');
registrarSubsanacionObservacion(payload, {
  observacion_id: obs.id,
  respuesta: 'Subsanación test B5',
  origen_submodulo: destinoSub,
  usuario: 'test-h6b5-dest',
  actorUsuarioId: destinatario.id,
});
await query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [rid, JSON.stringify(payload)]);

await transicionarExpediente({
  requerimientoId: rid,
  evento: 'OBSERVACION_SUBSANADA',
  usuarioDestinoId: analistaId,
  metadata: {
    client_request_id: `test-h6b5-sub:${rid}:${ts}`,
    destino_submodulo: 'Consultas y Observaciones',
    destino_etapa: 'CONSULTAS_OBSERVACIONES',
    observacion_id: obs.id,
  },
  actorRol: 'test-h6b5',
});

const postSub = await erv();
ok(postSub?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', '7 — subsanación retorno CO');
ok(postSub?.estado_codigo === 'EN_TRAMITE', '7 — subsanación EN_TRAMITE');
ok(Number(postSub?.responsable_usuario_id) === Number(analistaId), '7 — PERSONA(analista emisor)');

const obsPost = getListaObservaciones(
  enrichRequerimientoRow((await query('SELECT * FROM requerimientos WHERE id = $1', [rid])).rows[0]),
).find((o) => String(o.id) === String(obs.id));
ok(obsPost?.subsanacion && obsPost?.respuesta, '8 — hilo con subsanación registrada');
ok(
  obsPost?.estado === 'RECIBIDA POR EL EMISOR' || obsPost?.estado?.includes('EMISOR'),
  '8 — estado post-subsanación hacia emisor',
);

try {
  registrarSubsanacionObservacion(JSON.parse(JSON.stringify(payload)), {
    observacion_id: obs.id,
    respuesta: 'Intento no autorizado',
    origen_submodulo: destinoSub,
    usuario: 'otro',
    actorUsuarioId: otroUsuarioId,
  });
  assert.fail('9 — debía rechazar otro usuario');
} catch (e) {
  ok(e.status === 403 || e.code === 'SUBSANACION_NO_AUTORIZADA', '9 — BE rechaza subsanación no autorizada');
}

console.log('\n✅ RC8.17.8H6-B5 OK\n');

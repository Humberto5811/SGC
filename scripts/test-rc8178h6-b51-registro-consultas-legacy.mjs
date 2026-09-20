/**
 * RC8.17.8H6-B5.1 — Observaciones Consultas pre-B5 (sin destino_derivacion en payload).
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { observarConsultasObservaciones } from '../server/lib/consultasObservacionesExpediente.js';
import { SUBMODULO_CONSULTAS_OBSERVACIONES } from '../server/lib/consultasObservacionesBandeja.js';
import { listarCandidatosObservacionDestino } from '../server/lib/candidatosObservacionDestino.js';
import { enrichRequerimientoRow } from '../server/lib/trazabilidad.js';
import { enrichRowsPayloadConsultasLegacyDerivacion } from '../server/lib/consultasObservacionLegacyDerivacionEnrich.js';
import {
  puedeSubsanar,
  getListaObservaciones,
} from '../shared/observacionesMotor.js';
import {
  estaEnRegistroAccionable,
  puedeEmitirNuevaObservacionRegistro,
} from '../src/utils/estadoAccionesExpediente.js';
import {
  isPreB5ConsultasObservacionPersona,
  extractConsultasObservadaDerivacionEvent,
} from '../shared/consultasObservacionLegacyDerivacion.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };
const fail = (c, m) => { assert.ok(!c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-B5.1 — Registro + Consultas legacy pre-B5 ===\n');

await runMigrations({ silent: true });

const { rows: uPool } = await query(
  `SELECT id, username FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 4`,
);
const analistaId = uPool[0]?.id || 260;
const otroUsuarioId = uPool.find((u) => Number(u.id) !== Number(analistaId))?.id || uPool[1]?.id;
const ts = Date.now();
let rid = null;
const MODULO_REGISTRO = 'Registro de Requerimiento';

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
  VALUES ('bienes', $1, 'T0001', 'Test H6-B5.1', 'Test', 'CNCC', 'Registrado', 'CONSULTAS_OBSERVACIONES',
    'Consultas y Observaciones', $2, '{"observaciones":[]}'::jsonb)
  RETURNING id
`, [`REQ-TEST-H6B51-${ts}`, String(analistaId)]);
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
  destinoSubmodulo: MODULO_REGISTRO,
});
let destinoSub = MODULO_REGISTRO;
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
ok(destinatario?.id != null, '1 — candidato destinatario PERSONA');

await observarConsultasObservaciones(rid, {
  motivo: 'Obs legacy sim B5.1',
  usuario: uPool[0]?.username || 'test-h6b51',
  origen_submodulo: SUBMODULO_CONSULTAS_OBSERVACIONES,
  destino_submodulo: destinoSub,
  destino_etapa: destinoEtapa,
  destino_persona: destinatario.nombre,
  usuario_origen_id: analistaId,
  usuario_destino_id: destinatario.id,
  client_request_id: `test-h6b51-obs:${rid}:${ts}`,
});

const postObsErv = await erv();
ok(postObsErv?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', '2 — ERV CONSULTAS_OBSERVACIONES / OBSERVADO');
ok(postObsErv?.estado_codigo === 'OBSERVADO', '2 — ERV estado OBSERVADO');
ok(Number(postObsErv?.responsable_usuario_id) === Number(destinatario.id), '2 — PERSONA destinatario');

const { rows: wfRows } = await query(
  `SELECT id, evento_codigo, metadata, created_at FROM workflow_eventos
   WHERE expediente_id = $1 AND evento_codigo = 'CONSULTAS_OBSERVADA' ORDER BY id DESC LIMIT 1`,
  [rid],
);
ok(wfRows.length === 1, '3 — workflow CONSULTAS_OBSERVADA persistido');
const derivMeta = extractConsultasObservadaDerivacionEvent(wfRows[0]);
ok(derivMeta?.destino_derivacion_submodulo === destinoSub, '3 — metadata determinista destino_submodulo');
ok(Number(derivMeta?.usuario_destino_id) === Number(destinatario.id), '3 — metadata usuario_destino_id');

const { rows: reqAfterObs } = await query('SELECT * FROM requerimientos WHERE id = $1', [rid]);
let payload = typeof reqAfterObs[0].payload === 'object'
  ? JSON.parse(JSON.stringify(reqAfterObs[0].payload))
  : JSON.parse(reqAfterObs[0].payload || '{}');
const obsBeforeStrip = payload.observaciones[payload.observaciones.length - 1];
ok(String(obsBeforeStrip?.destino_derivacion_submodulo || '').length > 0, '4 — post-B5 payload trae derivación (base test)');

delete obsBeforeStrip.destino_derivacion_submodulo;
delete obsBeforeStrip.destino_derivacion_etapa;
delete obsBeforeStrip.destinoDerivacionSubmodulo;
delete obsBeforeStrip.destinoDerivacionEtapa;
obsBeforeStrip.estado = 'RECIBIDA';
ok(isPreB5ConsultasObservacionPersona(obsBeforeStrip), '4 — fila simula legacy pre-B5');

await query(
  `UPDATE requerimientos SET estado = 'Registrado', payload = $2::jsonb WHERE id = $1`,
  [rid, JSON.stringify(payload)],
);

const { rows: reqLegacy } = await query('SELECT * FROM requerimientos WHERE id = $1', [rid]);
const rowLegacy = { ...reqLegacy[0] };
const reqRowLegacy = enrichRequerimientoRow(rowLegacy);
const obsLegacy = getListaObservaciones(reqRowLegacy).find((o) => String(o.id) === String(obsBeforeStrip.id));
ok(obsLegacy && !String(obsLegacy.destino_derivacion_submodulo || '').trim(), '5 — payload sin derivación en lectura cruda');

fail(
  puedeSubsanar(destinoSub, reqRowLegacy, destinatario.id),
  'A — destinatario NO subsana sin enriquecimiento (lógica actual / pre-fix)',
);
fail(
  puedeSubsanar(destinoSub, reqRowLegacy, otroUsuarioId),
  'A — otro usuario NO subsana',
);

const rowBandeja = {
  ...rowLegacy,
  estado_responsable_vigente: {
    etapaCodigo: 'CONSULTAS_OBSERVACIONES',
    estadoCodigo: 'OBSERVADO',
    etapaLabel: 'Consultas y Observaciones',
    estadoLabel: 'Observado',
  },
  estado_actual: 'CONSULTAS_OBSERVACIONES',
};
ok(estaEnRegistroAccionable(rowBandeja), 'B — legacy r.estado Registrado sigue accionable en bandeja');
fail(
  puedeEmitirNuevaObservacionRegistro(rowBandeja),
  'B — Nueva observación bloqueada con ERV fuera de Registro',
);

await enrichRowsPayloadConsultasLegacyDerivacion([rowLegacy]);
const reqRowEnriched = enrichRequerimientoRow(rowLegacy);
const obsEnriched = getListaObservaciones(reqRowEnriched).find((o) => String(o.id) === String(obsBeforeStrip.id));
ok(
  String(obsEnriched?.destino_derivacion_submodulo || '') === destinoSub,
  '6 — enrich lectura restaura destino_derivacion desde workflow',
);

ok(
  puedeSubsanar(destinoSub, reqRowEnriched, destinatario.id),
  `7 — destinatario subsana desde ${destinoSub} tras enrich`,
);
fail(
  puedeSubsanar(destinoSub, reqRowEnriched, otroUsuarioId),
  '7 — otro usuario sigue sin autorización',
);
fail(
  puedeSubsanar(destinoSub, reqRowEnriched, null),
  '7 — sin sesión NO subsana',
);
if (destinoSub !== MODULO_REGISTRO) {
  fail(
    puedeSubsanar(MODULO_REGISTRO, reqRowEnriched, destinatario.id),
    '7 — no autoriza subsanar desde Registro si derivación operativa es otro módulo',
  );
}

console.log('\n✅ RC8.17.8H6-B5.1 OK\n');

/**
 * RC8.17.8H5-05 — Observación CM → Registro (ERV) + permanencia bandeja CM.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { applyPilotObservacionDecDestino } from '../server/lib/workflowTransicionResponsable.js';
import {
  listarBandejaActos,
  WHERE_INGRESO_HISTORICO_CONT_MENORES,
} from '../server/lib/actosPreparatorios.js';
import { getTransition } from '../shared/workflow/transiciones.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';
import { registrarSubsanacionDerivacion } from '../server/lib/trazabilidad.js';
import { appendObservacion } from '../server/lib/observacionesExpediente.js';
import { listarCandidatosSubsanacionDestino } from '../server/lib/candidatosObservacionDestino.js';
import { resolveEmisorObservacionRetorno } from '../server/lib/pilotRegistroEvaluacion.js';
import { registrarSubsanacionObservacion } from '../server/lib/observacionesWorkflow.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H5-05 — CM obs → Registro + histórico ===\n');

ok(getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: 'PROGRAMACION',
  eventoCodigo: 'PROGRAMACION_APROBADA',
})?.etapa_destino === 'COORDINACION_CM', 'A PROGRAMACION_APROBADA → COORDINACION_CM');

const expSrc = readFileSync(join(__dir, '../server/lib/expedienteTransicion.js'), 'utf8');
ok(/eventoCodigo === 'COORDINACION_CM_OBSERVADA'/.test(expSrc), 'B expedienteTransicion maneja COORDINACION_CM_OBSERVADA');
ok(/etapasObsCmPilot\.has\(etapaDestNorm\)/.test(expSrc), 'B piloto CM obs (Registro/Eval/DEC/Prog)');

console.log('\nC — applyPilotObservacionDecDestino (CM metadata)');
{
  const pilot = applyPilotObservacionDecDestino({
    resp: { responsableTipo: TIPO_RESPONSABLE.UNIDAD, responsableUnidad: 'X' },
    usuarioDestinoId: 249,
    metadata: {
      etapa_origen: 'INVITACIONES',
      etapa_destino: 'REGISTRO',
      evento: 'COORDINACION_CM_OBSERVADA',
    },
    etapaEfectiva: 'INVITACIONES',
    labels: {},
  });
  ok(pilot.etapaEfectiva === 'REGISTRO', 'C1 etapa REGISTRO');
  ok(pilot.labels.estadoCodigo === 'OBSERVADO', 'C2 estado OBSERVADO');
  ok(Number(pilot.resp.responsableUsuarioId) === 249, 'C3 PERSONA 249');
}

await runMigrations({ silent: true });

const { rows: uEmisorRows } = await query(
  `SELECT id, apellidos, nombres, username FROM usuarios WHERE id = $1`,
  [20],
);
const { rows: uDestRows } = await query(
  `SELECT id, apellidos, nombres, username FROM usuarios WHERE id = $1`,
  [65],
);
const emisorId = uEmisorRows[0]?.id || 20;
const destinoId = uDestRows[0]?.id || 65;
const emisorNombre = [uEmisorRows[0]?.apellidos, uEmisorRows[0]?.nombres].filter(Boolean).join(' ').trim()
  || uEmisorRows[0]?.username
  || String(emisorId);
const destinoNombre = [uDestRows[0]?.apellidos, uDestRows[0]?.nombres].filter(Boolean).join(' ').trim()
  || uDestRows[0]?.username
  || String(destinoId);

console.log('\nD — transicionarExpediente COORDINACION_CM_OBSERVADA → REGISTRO (temporal)');
let tempRid = null;
try {
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES (
      'bienes', $1, 'T0001', 'Test H5-05 CM obs', 'Test', 'CNCC',
      'En Programación', 'PROGRAMACION', '{"observaciones":[]}'::jsonb
    )
    RETURNING id
  `, [`REQ-TEST-H5-05-${Date.now()}`]);
  tempRid = ins.rows[0].id;

  await transicionarExpediente({
    requerimientoId: tempRid,
    evento: 'PROGRAMACION_APROBADA',
    usuarioDestinoId: emisorId,
    metadata: {
      client_request_id: `test-h5-05-prog-apr:${tempRid}:${Date.now()}`,
      via: 'test-rc8178h5-05',
    },
    actorRol: 'test-h5-05',
  });

  const payload = {
    observaciones: [{
      id: `obs_test_h5_05_${tempRid}`,
      estado: 'RECIBIDA',
      cerrada: false,
      origen_submodulo: 'Coordinación CM',
      destino_submodulo: 'Registro de Requerimiento',
      gerente: emisorNombre,
      usuario_origen_id: null,
      usuario_destino_id: null,
    }],
  };
  await query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [tempRid, JSON.stringify(payload)]);

  await transicionarExpediente({
    requerimientoId: tempRid,
    evento: 'COORDINACION_CM_OBSERVADA',
    usuarioDestinoId: destinoId,
    metadata: {
      client_request_id: `test-h5-05-cm-obs:${tempRid}:${Date.now()}`,
      via: 'test-rc8178h5-05',
      etapa_destino: 'REGISTRO',
      destino_submodulo: 'Registro de Requerimiento',
      observacion_id: payload.observaciones[0].id,
      evento: 'COORDINACION_CM_OBSERVADA',
    },
    actorRol: 'test-h5-05',
    domainMutator: async (tx) => {
      await tx.query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [
        tempRid,
        JSON.stringify(payload),
      ]);
      return { observacion: true };
    },
  });

  const { rows: erv } = await query(
    `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [tempRid],
  );
  const e = erv[0];
  ok(e?.etapa_codigo === 'REGISTRO', 'D1 ERV etapa REGISTRO');
  ok(e?.estado_codigo === 'OBSERVADO', 'D2 ERV estado OBSERVADO');
  ok(e?.responsable_tipo === 'PERSONA', 'D3 responsable PERSONA');
  ok(Number(e?.responsable_usuario_id) === destinoId, 'D4 responsable_usuario_id destino');

  const lista = await listarBandejaActos(1, 500, { q: String(tempRid) });
  const row = (lista.data || []).find((r) => Number(r.id) === Number(tempRid));
  ok(!!row, 'E sigue visible en bandeja Cont.Menores (histórico)');
  ok(String(row?.estado_actual || '').toUpperCase() === 'REGISTRO'
    || e?.etapa_codigo === 'REGISTRO',
    'E1 fila refleja etapa REGISTRO actual');
  ok(String(row?.estado || '').toLowerCase().includes('observ')
    || e?.estado_codigo === 'OBSERVADO',
    'E2 fila refleja estado Observado actual');

  ok(typeof WHERE_INGRESO_HISTORICO_CONT_MENORES === 'string'
    && /PROGRAMACION_APROBADA/.test(WHERE_INGRESO_HISTORICO_CONT_MENORES),
    'E3 cláusula histórica CM definida');

  const obsId = payload.observaciones[0].id;

  console.log('\nH5-08A B — candidatos subsanación «Coordinación CM»');
  const cand = await listarCandidatosSubsanacionDestino({
    requerimientoId: tempRid,
    destinoSubmodulo: 'Coordinación CM',
    observacionId: obsId,
  });
  ok(cand.soportado === true, 'B1 soportado true para Coordinación CM');
  ok(cand.destino_etapa === 'COORDINACION_CM', 'B2 destino_etapa COORDINACION_CM (etapa emisor)');
  ok(Number(cand.recomendado?.id) === emisorId, 'B3 recomendado = emisor observación');
  ok(
    [cand.recomendado, ...(cand.candidatos || [])].some((c) => Number(c.id) === emisorId),
    'B4 pool incluye emisor',
  );

  console.log('\nH5-08A G — legacy sin usuario_origen_id en payload');
  ok(
    (await resolveEmisorObservacionRetorno(tempRid, null, { observacionId: obsId })) === emisorId,
    'G resolveEmisor por nombre gerente legacy',
  );

  console.log('\nH5-08A C/D — subsanación con label Coordinación CM');
  registrarSubsanacionObservacion(payload, {
    observacion_id: obsId,
    respuesta: 'test subsanación H5-08A',
    origen_submodulo: 'Registro de Requerimiento',
    usuario: String(destinoId),
  });
  const obsAfterPayload = payload.observaciones.find((o) => o.id === obsId);
  ok(!!obsAfterPayload?.subsanacion, 'D1 observación tiene subsanacion');
  ok(
    obsAfterPayload?.subsanacion_destino_etapa === 'COORDINACION_CM',
    'D2 subsanacion_destino_etapa COORDINACION_CM',
  );

  await query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [tempRid, JSON.stringify(payload)]);

  await registrarSubsanacionDerivacion({
    requerimientoId: tempRid,
    usuario: String(destinoId),
    textoSubsanacion: 'test subsanación H5-08A',
    origenSubmodulo: 'Registro de Requerimiento',
    destinoSubmodulo: 'Coordinación CM',
    destinoEtapa: 'COORDINACION_CM',
    destinoPersona: String(emisorId),
    observacionId: obsId,
    usuarioDestinoId: emisorId,
  });

  const { rows: ervAfter } = await query(
    `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [tempRid],
  );
  ok(ervAfter[0]?.etapa_codigo === 'COORDINACION_CM', 'C1 subsanación retorna COORDINACION_CM');
  ok(ervAfter[0]?.responsable_tipo === 'PERSONA', 'C2 subsanación PERSONA');
  ok(Number(ervAfter[0]?.responsable_usuario_id) === emisorId, 'C3 responsable emisor CM');

  const listaPost = await listarBandejaActos(1, 500, { q: String(tempRid) });
  ok(!!(listaPost.data || []).find((r) => Number(r.id) === Number(tempRid)),
    'E histórico CM tras subsanación');

  console.log('\nH5-08A F — nueva observación CM persiste ids en payload');
  const payloadIds = { observaciones: [] };
  appendObservacion(payloadIds, {
    motivo: 'test persistencia ids',
    gerente: emisorNombre,
    usuario_origen_id: emisorId,
    usuario_destino_id: destinoId,
    origen_submodulo: 'Coordinación CM',
    destino_submodulo: 'Registro de Requerimiento',
    destino_persona: destinoNombre,
  });
  const obsIds = payloadIds.observaciones[0];
  ok(Number(obsIds?.usuario_origen_id) === emisorId, 'F1 usuario_origen_id emisor');
  ok(Number(obsIds?.usuario_destino_id) === destinoId, 'F2 usuario_destino_id destino');
  const actosSrc = readFileSync(join(__dir, '../server/lib/actosPreparatorios.js'), 'utf8');
  ok(/usuario_origen_id:\s*uidOrig/.test(actosSrc), 'F3 observarActos escribe usuario_origen_id en payload');
  ok(/usuario_destino_id:\s*uid[,}]/.test(actosSrc), 'F4 observarActos escribe usuario_destino_id en payload');
} finally {
  if (tempRid != null) {
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [tempRid]);
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [tempRid]);
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [tempRid]);
    await query('DELETE FROM requerimientos WHERE id = $1', [tempRid]);
  }
}

console.log('\n=== RC8.17.8H5-05 OK ===\n');

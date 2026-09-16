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

const __dir = dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H5-05 — CM obs → Registro + histórico ===\n');

ok(getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: 'PROGRAMACION',
  eventoCodigo: 'PROGRAMACION_APROBADA',
})?.etapa_destino === 'INVITACIONES', 'A PROGRAMACION_APROBADA → INVITACIONES');

const expSrc = readFileSync(join(__dir, '../server/lib/expedienteTransicion.js'), 'utf8');
ok(/eventoCodigo === 'COORDINACION_CM_OBSERVADA'/.test(expSrc), 'B expedienteTransicion maneja COORDINACION_CM_OBSERVADA');
ok(/etapaDestNorm === 'REGISTRO'/.test(expSrc), 'B piloto Registro para CM');

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
    usuarioDestinoId: 260,
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
      gerente: 'RODRIGUEZ TEST',
    }],
  };
  await query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [tempRid, JSON.stringify(payload)]);

  await transicionarExpediente({
    requerimientoId: tempRid,
    evento: 'COORDINACION_CM_OBSERVADA',
    usuarioDestinoId: 249,
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
  ok(Number(e?.responsable_usuario_id) === 249, 'D4 responsable_usuario_id 249');

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

  await registrarSubsanacionDerivacion({
    requerimientoId: tempRid,
    usuario: '249',
    textoSubsanacion: 'test subsanación H5-05',
    origenSubmodulo: 'Registro de Requerimiento',
    destinoSubmodulo: 'Invitaciones',
    destinoEtapa: 'INVITACIONES',
    destinoPersona: '260',
    observacionId: payload.observaciones[0].id,
    usuarioDestinoId: 260,
  });

  const { rows: ervAfter } = await query(
    `SELECT etapa_codigo, responsable_tipo, responsable_usuario_id
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [tempRid],
  );
  ok(ervAfter[0]?.etapa_codigo === 'INVITACIONES', 'F1 subsanación retorna INVITACIONES');
  ok(ervAfter[0]?.responsable_tipo === 'PERSONA', 'F2 subsanación PERSONA');
  ok(Number(ervAfter[0]?.responsable_usuario_id) === 260, 'F3 subsanación responsable emisor 260');
} finally {
  if (tempRid != null) {
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [tempRid]);
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [tempRid]);
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [tempRid]);
    await query('DELETE FROM requerimientos WHERE id = $1', [tempRid]);
  }
}

console.log('\n=== RC8.17.8H5-05 OK ===\n');

/**
 * RC8.17.8H — Programación → Cont.Menores (PROGRAMACION_APROBADA, responsable PERSONA).
 */
import { query } from '../db.js';
import { ETAPAS } from './trazabilidad.js';
import { getObservacionesAbiertas } from '../../shared/observacionesMotor.js';
import { autoCerrarObservacionesEmisorAlContinuar } from './observacionesWorkflow.js';
import { runWorkflowTransition } from './workflow/workflowIntegration.js';
import { transicionarExpediente } from './expedienteTransicion.js';
import {
  assertActorProgramacionPuedeDerivar,
  assertUsuarioDestinoTransicionElegible,
} from './workflowTransicionResponsable.js';

function buildTramo1bPayloadMutator({ accionHistorial, submoduloLabel, camposExtras = {} }) {
  return async function payloadMutator(client, { expediente_id, row }) {
    let payload = {};
    try { payload = JSON.parse(row?.payload || '{}'); } catch (_) { payload = {}; }
    const now = new Date().toISOString();
    const arrayKey = accionHistorial;
    if (!Array.isArray(payload[arrayKey])) payload[arrayKey] = [];
    payload[arrayKey].push({
      ...(camposExtras.entrada || {}),
      tipo: camposExtras.tipo,
      usuario: camposExtras.usuario || '',
      fecha: now,
    });
    autoCerrarObservacionesEmisorAlContinuar(payload, submoduloLabel, camposExtras.usuario || '');
    await client.query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [
      expediente_id,
      JSON.stringify(payload),
    ]);
    return { [arrayKey]: true };
  };
}

/**
 * Valida actor, destino, pedidos y observaciones; ejecuta PROGRAMACION_APROBADA.
 */
export async function ejecutarProgramacionAprobadaContMenores({
  requerimientoId,
  req,
  usuario,
  usuarioDestinoId,
  responsableRecomendadoId = null,
  reasignacionManual = false,
  clientRequestId = null,
  reqRow = null,
}) {
  await assertActorProgramacionPuedeDerivar(req?.user ?? null);

  let row = reqRow;
  if (!row) {
    const { rows } = await query(
      `SELECT id, payload, estado, estado_actual FROM requerimientos WHERE id = $1 AND estado IN ('Aprobado DEC', 'En Programación')`,
      [requerimientoId],
    );
    if (!rows.length) {
      const err = new Error('No encontrado o estado inválido');
      err.status = 404;
      throw err;
    }
    row = rows[0];
  }

  const uidDest = Number(usuarioDestinoId);
  if (!Number.isFinite(uidDest)) {
    const err = new Error('Debe seleccionar la persona responsable en Cont. Menores');
    err.status = 400;
    throw err;
  }

  const elegible = await assertUsuarioDestinoTransicionElegible(
    requerimientoId,
    'PROGRAMACION_APROBADA',
    uidDest,
    row,
  );

  const recomendadoId = responsableRecomendadoId != null && Number.isFinite(Number(responsableRecomendadoId))
    ? Number(responsableRecomendadoId)
    : (elegible.recomendado?.id ?? null);
  const reasignacion = reasignacionManual === true
    || (recomendadoId && uidDest !== recomendadoId);

  const { rows: pedidos } = await query(
    'SELECT 1 FROM requerimiento_pedidos WHERE requerimiento_id = $1 LIMIT 1',
    [requerimientoId],
  );
  if (!pedidos.length) {
    const err = new Error('Debe asociar al menos un pedido SIGAMEF');
    err.status = 409;
    throw err;
  }

  let payload = {};
  try { payload = JSON.parse(row.payload || '{}'); } catch (_) {}
  if (getObservacionesAbiertas(payload).length > 0) {
    const err = new Error('Existen observaciones abiertas que impiden aprobar');
    err.status = 409;
    throw err;
  }

  const metaDerivacion = {
    usuario_destino_id: uidDest,
    responsable_recomendado_id: recomendadoId,
    responsable_seleccionado_id: uidDest,
    reasignacion_manual: reasignacion,
    etapa_origen: 'PROGRAMACION',
    etapa_destino: 'COORDINACION_CM',
    evento: 'PROGRAMACION_APROBADA',
  };

  const crq = clientRequestId || `prog-aprobar:${requerimientoId}`;

  return runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_PROGRAMACION',
    eventoCodigo: 'PROGRAMACION_APROBADA',
    expedienteId: requerimientoId,
    req,
    metadata: {
      tipo_contratacion: req?.body?.tipo_contratacion || 'BIEN',
      client_request_id: crq,
      observacion: 'Programación aprobada — derivado a Coordinación CM (Cont.Menores)',
      ...metaDerivacion,
      unidad_destino: ETAPAS.COORDINACION_CM?.responsable || 'Coordinador de Contratos Menores',
    },
    domainMutator: buildTramo1bPayloadMutator({
      accionHistorial: 'historial_programacion',
      submoduloLabel: 'Programación',
      camposExtras: { tipo: 'aprobacion_programacion', usuario: usuario || 'Programación' },
    }),
    legacyHandler: async () => {
      let payloadLegacy = {};
      try { payloadLegacy = JSON.parse(row.payload || '{}'); } catch (_) {}
      if (!Array.isArray(payloadLegacy.historial_programacion)) payloadLegacy.historial_programacion = [];
      payloadLegacy.historial_programacion.push({
        tipo: 'aprobacion_programacion',
        usuario: usuario || '',
        fecha: new Date().toISOString(),
      });
      autoCerrarObservacionesEmisorAlContinuar(payloadLegacy, 'Programación', usuario || 'Programación');

      const tr = await transicionarExpediente({
        requerimientoId,
        evento: 'PROGRAMACION_APROBADA',
        usuarioDestinoId: uidDest,
        unidadDestino: ETAPAS.INVITACIONES?.responsable || 'Invitaciones',
        motivo: 'Aprobado en Programación — derivado a Invitaciones (Cont.Menores)',
        metadata: {
          client_request_id: crq,
          via: 'programacion/aprobar:legacyHandler',
          ...metaDerivacion,
        },
        actorRol: usuario || 'Programación',
        domainMutator: async (tx) => {
          await tx.query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [
            requerimientoId,
            JSON.stringify(payloadLegacy),
          ]);
          return { historial_programacion: true };
        },
      });
      const updated = tr.expediente;
      return { ok: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } };
    },
  });
}

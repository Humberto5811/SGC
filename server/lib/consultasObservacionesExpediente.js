/**
 * RC8.17.8H6-B1 — Observar/derivar desde bandeja Consultas y Observaciones.
 */
import { query } from '../db.js';
import { appendObservacion } from './observacionesExpediente.js';
import { procesarAccionObservacion } from './observacionesWorkflow.js';
import { formatObservacionTraza, submoduloLabelToEtapa } from './observacionDestino.js';
import { SUBMODULO_CONSULTAS_OBSERVACIONES } from './consultasObservacionesBandeja.js';

async function loadReqPayload(requerimientoId) {
  const { rows } = await query(
    'SELECT id, codigo, estado, estado_actual, payload, responsable_actual FROM requerimientos WHERE id = $1',
    [requerimientoId],
  );
  if (!rows.length) return null;
  let payload = {};
  try { payload = JSON.parse(rows[0].payload || '{}'); } catch (_) {}
  return { row: rows[0], payload };
}

export async function observarConsultasObservaciones(requerimientoId, body) {
  const {
    motivo, usuario, destino_submodulo, destino_etapa, destino_persona, origen_submodulo,
    accion, observacion_id, observacion_padre_id, observacionPadreId,
  } = body || {};

  const loaded = await loadReqPayload(requerimientoId);
  if (!loaded) throw new Error('Requerimiento no encontrado');

  const { asegurarExpedienteConsultasCanonico } = await import('./consultasLegacyNormalizacion.js');
  await asegurarExpedienteConsultasCanonico(requerimientoId, {
    via: 'observarConsultasObservaciones',
    actorRol: usuario || SUBMODULO_CONSULTAS_OBSERVACIONES,
  });

  const accionObs = procesarAccionObservacion(loaded.payload, {
    accion,
    observacion_id,
    origen_submodulo: origen_submodulo || SUBMODULO_CONSULTAS_OBSERVACIONES,
    usuario,
  });
  if (accionObs) {
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [
      requerimientoId,
      JSON.stringify(loaded.payload),
    ]);
    const { enrichRequerimientoRow } = await import('./trazabilidad.js');
    return enrichRequerimientoRow(
      (await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId])).rows[0],
    );
  }

  if (!motivo) throw new Error('Motivo requerido');

  const etapaDestObs = String(
    destino_etapa || submoduloLabelToEtapa(destino_submodulo) || '',
  ).toUpperCase();

  appendObservacion(loaded.payload, {
    motivo,
    gerente: usuario || SUBMODULO_CONSULTAS_OBSERVACIONES,
    origen: 'CONSULTAS_OBSERVACIONES',
    origen_submodulo: origen_submodulo || SUBMODULO_CONSULTAS_OBSERVACIONES,
    // Receptor actúa en bandeja Consultas; trazabilidad de derivación AU/DEC en campos auxiliares.
    destino_submodulo: SUBMODULO_CONSULTAS_OBSERVACIONES,
    destino_etapa: 'CONSULTAS_OBSERVACIONES',
    destino_persona: destino_persona || '',
    destino_derivacion_submodulo: destino_submodulo || '',
    destino_derivacion_etapa: etapaDestObs || destino_etapa || '',
    observacion_padre_id: observacion_padre_id || observacionPadreId || null,
  });
  const uid = /^\d+$/.test(String(destino_persona || '').trim()) ? Number(destino_persona) : null;

  const { transicionarExpediente } = await import('./expedienteTransicion.js');
  const result = await transicionarExpediente({
    requerimientoId,
    evento: 'CONSULTAS_OBSERVADA',
    usuarioDestinoId: uid,
    motivo: formatObservacionTraza(motivo, { destino_persona, destino_submodulo }),
    metadata: {
      client_request_id: body?.client_request_id || `co-obs:${requerimientoId}`,
      via: 'observarConsultasObservaciones',
      etapa_destino: etapaDestObs,
      destino_submodulo: destino_submodulo || '',
      quien_subsana: destino_persona || '',
    },
    actorRol: usuario || SUBMODULO_CONSULTAS_OBSERVACIONES,
    domainMutator: async (tx) => {
      await tx.query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [
        requerimientoId,
        JSON.stringify(loaded.payload),
      ]);
      return { observacion: true };
    },
  });
  return result.expediente || result;
}

/**
 * RC8.17.8H6-B1 — Observar/derivar desde bandeja Consultas y Observaciones.
 */
import { query } from '../db.js';
import { appendObservacion } from './observacionesExpediente.js';
import { procesarAccionObservacion } from './observacionesWorkflow.js';
import { formatObservacionTraza, submoduloLabelToEtapa } from './observacionDestino.js';
import { SUBMODULO_CONSULTAS_OBSERVACIONES } from './consultasObservacionesBandeja.js';

/**
 * Resuelve PERSONA destino (mismo contrato que bandejas con candidatos canónicos):
 * usuario_destino_id numérico + validación; destino_persona numérico legacy; nombre vía pool.
 */
async function resolveUsuarioDestinoObservacionConsultas(
  requerimientoId,
  destinoSubmodulo,
  destinoPersona,
  body = {},
) {
  const { buildErrorSubsanacionSinPersona } = await import('./pilotRegistroEvaluacion.js');
  const {
    assertUsuarioDestinoObservacionElegible,
    listarCandidatosObservacionDestino,
  } = await import('./candidatosObservacionDestino.js');

  const fromBody = body?.usuario_destino_id ?? body?.usuarioDestinoId;
  if (fromBody != null && Number.isFinite(Number(fromBody))) {
    const uid = Number(fromBody);
    if (destinoSubmodulo) {
      await assertUsuarioDestinoObservacionElegible(requerimientoId, destinoSubmodulo, uid);
    }
    return uid;
  }

  const raw = String(destinoPersona ?? '').trim();
  if (/^\d+$/.test(raw)) {
    const uid = Number(raw);
    if (destinoSubmodulo) {
      await assertUsuarioDestinoObservacionElegible(requerimientoId, destinoSubmodulo, uid);
    }
    return uid;
  }

  if (raw && destinoSubmodulo) {
    const lista = await listarCandidatosObservacionDestino({
      requerimientoId,
      destinoSubmodulo,
      search: raw,
    });
    const pool = [
      ...(lista.recomendado ? [lista.recomendado] : []),
      ...(lista.candidatos || []),
    ];
    const needle = raw.toLowerCase();
    const hit = pool.find((c) => String(c.nombre || '').toLowerCase() === needle);
    if (hit?.id != null) {
      await assertUsuarioDestinoObservacionElegible(requerimientoId, destinoSubmodulo, hit.id);
      return Number(hit.id);
    }
  }

  throw buildErrorSubsanacionSinPersona('Debe seleccionar una persona destino válida.');
}

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

  const uid = await resolveUsuarioDestinoObservacionConsultas(
    requerimientoId,
    destino_submodulo,
    destino_persona,
    body,
  );

  const { resolveUsuarioIdDesdeActor } = await import('./pilotRegistroEvaluacion.js');
  let uidOrig = body?.usuario_origen_id ?? body?.usuarioOrigenId ?? null;
  if (uidOrig != null && Number.isFinite(Number(uidOrig))) {
    uidOrig = Number(uidOrig);
  } else {
    uidOrig = null;
  }
  if (!uidOrig && usuario) {
    uidOrig = await resolveUsuarioIdDesdeActor({
      usuarioOrigenId: body?.usuario_origen_id ?? body?.usuarioOrigenId,
      actorRol: usuario,
    }, null);
  }

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
    usuario_origen_id: uidOrig,
    usuario_destino_id: uid,
  });

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
      destino_etapa: etapaDestObs,
      quien_subsana: destino_persona || '',
      usuario_destino_id: uid,
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

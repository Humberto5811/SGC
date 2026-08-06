/**
 * Sincronización requerimiento ↔ workflow vía transicionarExpediente (RC8.6A.1).
 * Dueño único de persistencia: no usa sync best-effort ni doble escritura.
 */
import { query } from '../db.js';
import { getSubModuloMeta } from './movimientos.js';
import { normalizarTipo } from '../../shared/workflow/tiposContratacion.js';
import { transicionarExpediente } from './expedienteTransicion.js';
import { withTransaction } from './workflow/workflowTransaction.js';

function parsePayload(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
  } catch (_) {
    return {};
  }
}

/** Mapea etapa destino → evento canónico (si el caller no pasa `evento`). */
export function eventoParaEtapaDestino(destino, tipo = '', etapaOrigen = '') {
  const d = String(destino || '').toUpperCase();
  const t = normalizarTipo(tipo) || '';
  const o = String(etapaOrigen || '').toUpperCase();
  if (d === 'RECEPCION_COTIZACIONES') return 'COTIZACION_PRESENTADA';
  if (d === 'VALIDACIONES' || d === 'VALIDACION_USUARIO') return 'COTIZACIONES_DERIVADAS_VALIDACION';
  if (d === 'CUADRO_COMPARATIVO') return 'VALIDACION_COMPLETADA';
  if (d === 'CCP') {
    if (t === 'LOCACION' || o === 'RECEPCION_COTIZACIONES') return 'LOCACION_APROBADA_RECEPCION';
    return 'CUADRO_APROBADO_DEC';
  }
  if (d === 'INVITACIONES') {
    if (o === 'VALIDACION_USUARIO' || o === 'VALIDACIONES') return 'COTIZACIONES_INVALIDAS_DEVUELTAS';
    if (o === 'ACTOS_PREPARATORIOS' || o === 'COORDINACION_CM') return 'COORDINACION_CM_APROBADA';
    return 'COORDINACION_CM_APROBADA';
  }
  if (d === 'REGISTRO_ORDEN' || d === 'ORDEN') return 'CCP_REGISTRADA';
  if (d === 'RECEPCION_BIENES' || d === 'PRESENTACION_ENTREGABLES' || d === 'EN_EJECUCION') {
    return 'ORDEN_DERIVADA_EJECUCION';
  }
  return null;
}

function parseUsuarioDestinoId(responsable) {
  if (responsable == null) return null;
  if (Number.isFinite(Number(responsable)) && String(responsable).trim() !== '') {
    const n = Number(responsable);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const s = String(responsable).trim();
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

async function persistWorkflowSnapshot(tx, requerimientoId, etapaCode, responsable) {
  const run = (text, params) => tx.query(text, params);
  const { rows } = await run('SELECT payload FROM requerimientos WHERE id = $1', [requerimientoId]);
  if (!rows.length) return;
  const payload = parsePayload(rows[0].payload);
  const meta = getSubModuloMeta(etapaCode);
  const prevSnap = payload.workflowSnapshot || {};
  const etapaUp = String(etapaCode || '').toUpperCase();
  payload.workflowSnapshot = {
    ...prevSnap,
    etapaActual: etapaCode,
    subModuloActual: meta.subModulo,
    moduloActual: meta.modulo,
    responsableActual: responsable || meta.subModulo,
    fechaEstadoActual: new Date().toISOString(),
    ...(etapaUp === 'CCP' ? { revisionEstado: 'DERIVADO_CCP' } : {}),
  };
  await run('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [
    requerimientoId,
    JSON.stringify(payload),
  ]);
}

async function requerimientoIdsDeSolicitud(solicitudId, client = null) {
  const run = (text, params) => (client ? client.query(text, params) : query(text, params));
  const { rows } = await run(`
    SELECT DISTINCT requerimiento_id AS id FROM solicitud_requerimientos WHERE solicitud_id = $1 AND requerimiento_id IS NOT NULL
    UNION
    SELECT DISTINCT requerimiento_id AS id FROM cotizaciones_proveedor WHERE solicitud_id = $1 AND requerimiento_id IS NOT NULL
  `, [solicitudId]);
  return rows.map((r) => r.id).filter(Boolean);
}

/**
 * Propaga etapa oficial a todos los requerimientos de la solicitud
 * vía transicionarExpediente (una tx si se pasa client; si no, una tx por req).
 */
export async function syncRequerimientosSolicitudWorkflow(solicitudId, {
  etapaDestino,
  evento = null,
  usuario = 'Sistema',
  observacion = '',
  etapaEjecutor = null,
  responsable = null,
  usuarioDestinoId = null,
  unidadDestino = null,
  forzar = false,
  client = null,
  domainMutatorFactory = null,
} = {}) {
  if (!solicitudId || !etapaDestino) return { actualizados: 0, omitidos: 0 };

  const runAll = async (tx) => {
    const reqIds = await requerimientoIdsDeSolicitud(solicitudId, tx);
    const destino = String(etapaDestino).toUpperCase();
    const uid = usuarioDestinoId != null
      ? Number(usuarioDestinoId)
      : parseUsuarioDestinoId(responsable);
    let actualizados = 0;
    let omitidos = 0;

    for (const requerimientoId of reqIds) {
      const { rows } = await tx.query(
        'SELECT estado_actual, tipo FROM requerimientos WHERE id = $1 FOR UPDATE',
        [requerimientoId],
      );
      if (!rows.length) continue;
      const actual = String(rows[0].estado_actual || '').toUpperCase();
      if (!forzar && (actual === destino
        || (destino === 'VALIDACIONES' && actual === 'VALIDACION_USUARIO')
        || (destino === 'VALIDACION_USUARIO' && actual === 'VALIDACIONES'))) {
        omitidos += 1;
        continue;
      }

      const tipoReal = normalizarTipo(rows[0]?.tipo || '');
      const eventoCodigo = evento
        || eventoParaEtapaDestino(destino, tipoReal, etapaEjecutor || actual);
      if (!eventoCodigo) {
        omitidos += 1;
        continue;
      }

      const domainMutator = typeof domainMutatorFactory === 'function'
        ? domainMutatorFactory(requerimientoId)
        : async (clientTx) => {
          await persistWorkflowSnapshot(
            clientTx,
            requerimientoId,
            destino === 'VALIDACION_USUARIO' ? 'VALIDACIONES' : destino,
            responsable || (uid ? String(uid) : null),
          );
          return { snapshot: true };
        };

      try {
        await transicionarExpediente({
          requerimientoId,
          evento: eventoCodigo,
          usuarioOrigenId: null,
          usuarioDestinoId: Number.isFinite(uid) && uid > 0 ? uid : null,
          unidadDestino: unidadDestino
            || ((!uid && responsable && !/^\d+$/.test(String(responsable)))
              ? String(responsable)
              : null),
          motivo: observacion || `Sync → ${destino}`,
          metadata: {
            client_request_id: `sync:${solicitudId}:${requerimientoId}:${eventoCodigo}:${destino}`,
            tipo_contratacion: tipoReal || undefined,
            solicitud_id: solicitudId,
            via: 'syncRequerimientosSolicitudWorkflow',
          },
          actorRol: usuario || 'SISTEMA',
          domainMutator,
          client: tx,
        });
        actualizados += 1;
      } catch (err) {
        if (err?.code === 'TRANSITION_NOT_FOUND' || err?.code === '42P01') {
          omitidos += 1;
          continue;
        }
        throw err;
      }
    }

    return { actualizados, omitidos };
  };

  if (client) return runAll(client);
  return withTransaction(runAll);
}

export default { syncRequerimientosSolicitudWorkflow, eventoParaEtapaDestino };

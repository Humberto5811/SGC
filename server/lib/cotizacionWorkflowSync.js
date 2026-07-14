// Sincronización mínima requerimiento ↔ workflow al cambiar estado de cotización
import { query } from '../db.js';
import { registrarMovimiento, ETAPAS, getEstadoNegocioFromEtapa } from './trazabilidad.js';
import { getSubModuloMeta } from './movimientos.js';

const ESTADO_NEGOCIO_ETAPA = {
  RECEPCION_COTIZACIONES: 'En Cotizaciones',
  VALIDACION_USUARIO: 'En Valid. Usuario',
  CUADRO_COMPARATIVO: 'En Cuadro Comparativo',
};

function estadoNegocioParaEtapa(etapa) {
  return ESTADO_NEGOCIO_ETAPA[etapa] || getEstadoNegocioFromEtapa(etapa) || '';
}

function parsePayload(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
  } catch (_) {
    return {};
  }
}

async function persistWorkflowSnapshot(requerimientoId, etapaCode, responsable) {
  const { rows } = await query('SELECT payload FROM requerimientos WHERE id = $1', [requerimientoId]);
  if (!rows.length) return;
  const payload = parsePayload(rows[0].payload);
  const meta = getSubModuloMeta(etapaCode);
  payload.workflowSnapshot = {
    etapaActual: etapaCode,
    subModuloActual: meta.subModulo,
    moduloActual: meta.modulo,
    responsableActual: responsable || meta.subModulo,
    fechaEstadoActual: new Date().toISOString(),
  };
  await query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [
    requerimientoId,
    JSON.stringify(payload),
  ]);
}

async function requerimientoIdsDeSolicitud(solicitudId) {
  const { rows } = await query(`
    SELECT DISTINCT requerimiento_id AS id FROM solicitud_requerimientos WHERE solicitud_id = $1 AND requerimiento_id IS NOT NULL
    UNION
    SELECT DISTINCT requerimiento_id AS id FROM cotizaciones_proveedor WHERE solicitud_id = $1 AND requerimiento_id IS NOT NULL
  `, [solicitudId]);
  return rows.map((r) => r.id).filter(Boolean);
}

/**
 * Propaga etapa oficial del Workflow a todos los requerimientos de la solicitud.
 */
export async function syncRequerimientosSolicitudWorkflow(solicitudId, {
  etapaDestino,
  usuario = 'Sistema',
  observacion = '',
  etapaEjecutor = null,
  responsable = null,
  forzar = false,
}) {
  if (!solicitudId || !etapaDestino) return { actualizados: 0, omitidos: 0 };
  const reqIds = await requerimientoIdsDeSolicitud(solicitudId);
  const destino = String(etapaDestino).toUpperCase();
  const estadoNuevo = estadoNegocioParaEtapa(destino);
  const responsableFinal = responsable || ETAPAS[destino]?.responsable;
  let actualizados = 0;
  let omitidos = 0;

  for (const requerimientoId of reqIds) {
    const { rows } = await query('SELECT estado_actual FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!rows.length) continue;
    const actual = String(rows[0].estado_actual || '').toUpperCase();
    if (!forzar && actual === destino) {
      omitidos += 1;
      continue;
    }

    await registrarMovimiento({
      requerimientoId,
      estadoNuevo,
      usuario,
      accion: 'derivado',
      observacion,
      responsable: responsableFinal,
      etapaEjecutor: etapaEjecutor || actual || 'INVITACIONES',
      etapaDestino: destino,
    });
    await persistWorkflowSnapshot(requerimientoId, destino, responsableFinal);
    actualizados += 1;
  }

  return { actualizados, omitidos };
}

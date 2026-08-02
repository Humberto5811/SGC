// Sincronización mínima requerimiento ↔ workflow al cambiar estado de cotización

import { query } from '../db.js';

import { registrarMovimiento, ETAPAS, getEstadoNegocioFromEtapa } from './trazabilidad.js';

import { getSubModuloMeta } from './movimientos.js';

import { runWorkflowTransition } from './workflow/workflowIntegration.js';
import { leerFlags } from './workflow/workflowGuards.js';
import { normalizarTipo } from '../../shared/workflow/tiposContratacion.js';



const ESTADO_NEGOCIO_ETAPA = {

  RECEPCION_COTIZACIONES: 'En Cotizaciones',

  VALIDACION_USUARIO: 'En Valid. Usuario',

  CUADRO_COMPARATIVO: 'En Cuadro Comparativo',

  CCP: 'En CCP',

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

  const prevSnap = payload.workflowSnapshot || {};
  const etapaUp = String(etapaCode || '').toUpperCase();
  payload.workflowSnapshot = {
    ...prevSnap,
    etapaActual: etapaCode,
    subModuloActual: meta.subModulo,
    moduloActual: meta.modulo,
    responsableActual: responsable || meta.subModulo,
    fechaEstadoActual: new Date().toISOString(),
    // OD32 — CCP fija revisionEstado vigente; no hereda OBSERVADO_* histórico
    ...(etapaUp === 'CCP'
      ? { revisionEstado: 'DERIVADO_CCP' }
      : {}),
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



  const flags = leerFlags();
  const useEngine = flags.WORKFLOW_ENGINE_RECEPCION === true && flags.WORKFLOW_ENGINE_WRITE_ENABLED === true;

  for (const requerimientoId of reqIds) {

    const { rows } = await query('SELECT estado_actual, tipo FROM requerimientos WHERE id = $1', [requerimientoId]);

    if (!rows.length) continue;

    const actual = String(rows[0].estado_actual || '').toUpperCase();

    if (!forzar && actual === destino) {

      omitidos += 1;

      continue;

    }

    // Resolver tipo de contratación REAL (nunca asumir 'BIEN' silenciosamente).
    const tipoReal = normalizarTipo(rows[0]?.tipo || '');
    if (!tipoReal) {
      // Si no puede resolverse, no asumir — advertencia controlada y omitir motor.
      // eslint-disable-next-line no-console
      console.warn(`[workflowSync] tipo_contratacion ausente para requerimiento ${requerimientoId}; se omite efecto motor`);
      omitidos += 1;
      continue;
    }

    // Fase 2A — efecto de ubicación de COTIZACION_PRESENTADA / derivaciones.
    // Con flags on + write on, el motor decide SOLO la ubicación, responsable,
    // evento e historial. La lógica del portal (adjuntos, convocatoria,
    // presentación) permanece íntegra en el flujo legacy que llamó a este sync.
    if (useEngine) {
      try {
        await runWorkflowTransition({
          moduleFlag: 'WORKFLOW_ENGINE_RECEPCION',
          eventoCodigo: destino === 'RECEPCION_COTIZACIONES' ? 'COTIZACION_PRESENTADA'
            : destino === 'VALIDACIONES' || destino === 'VALIDACION_USUARIO' ? 'COTIZACIONES_DERIVADAS_VALIDACION'
              : destino === 'CCP' ? 'LOCACION_APROBADA_RECEPCION'
                : null,
          expedienteId: requerimientoId,
          req: null,
          metadata: {
            tipo_contratacion: tipoReal,
            client_request_id: `sync:${requerimientoId}:${destino}:${usuario}`,
            observacion,
          },
          legacyHandler: async () => {
            // Nunca debe ejecutarse con motor; el try/catch upstream evita mezclar.
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
            return { ok: true };
          },
        });
        // Con motor activo, el motor escribió workflow_eventos + historial_movimientos
        // y actualizó estado_actual. No se llama registrarMovimiento legacy.
        actualizados += 1;
        continue;
      } catch (err) {
        if (err?.code === 'TRANSITION_NOT_FOUND' || err?.message?.includes('WORKFLOW_FEATURE_DISABLED')) {
          // Fallback: el evento no aplica desde esta etapa → usar legacy (graceful).
        } else {
          throw err;
        }
      }
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


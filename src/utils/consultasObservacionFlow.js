/** RC8.17.8H6-B2 — Observar/subsanar desde bandeja Consultas y Observaciones. */
import { contratacionesService } from '../services/contratacionesService.js';
import { requerimientosService } from '../services/requerimientosService.js';
import { authService } from '../services/authService.js';
import { getUserDisplayName } from './userDisplay.js';
import { puedeSubsanar } from './observacionDestino.js';

export const CONSULTAS_SUBMODULO_LABEL = 'Consultas y Observaciones';

export const CONSULTAS_DESTINOS_OBSERVACION = Object.freeze([
  'Registro de Requerimiento',
  'Evaluación de Requerimiento',
  'DEC',
]);

export function consultasCandidatosObservacionPath(requerimientoId) {
  return `/contrataciones/portal-analista/consultas/candidatos-observacion-destino/${requerimientoId}`;
}

export function consultasCandidatosSubsanacionPath(requerimientoId) {
  return `/contrataciones/portal-analista/consultas/candidatos-subsanacion-destino/${requerimientoId}`;
}

export async function loadRequerimientoParaConsultasObservacion(requerimientoId) {
  const rid = parseInt(requerimientoId, 10);
  if (!Number.isFinite(rid) || rid <= 0) return null;
  const resp = await requerimientosService.getById(rid);
  return resp?.data || resp || null;
}

export function usuarioPuedeSubsanarConsultas(reqRow) {
  if (!reqRow) return false;
  const uid = authService.getCurrentUser?.()?.id ?? null;
  return puedeSubsanar(CONSULTAS_SUBMODULO_LABEL, reqRow, uid);
}

export function buildConsultasObservacionModalConfig({ onReload } = {}) {
  const userName = getUserDisplayName(authService.getCurrentUser?.() || {});
  return {
    submoduloLabel: CONSULTAS_SUBMODULO_LABEL,
    bandejaPrefix: 'consultasObs',
    defaultDestinoObservacion: 'Registro de Requerimiento',
    destinosPermitidosObservacion: [...CONSULTAS_DESTINOS_OBSERVACION],
    candidatosApiPath: consultasCandidatosObservacionPath,
    candidatosSubsanacionApiPath: consultasCandidatosSubsanacionPath,
    puedeObservar: () => true,
    onObservar: async (reqId, data) => {
      await contratacionesService.observarConsultasObservaciones(reqId, {
        ...data,
        origen_submodulo: data.origen_submodulo || CONSULTAS_SUBMODULO_LABEL,
        usuario: data.usuario || userName,
        usuario_destino_id: data.usuario_destino_id,
        destino_persona: data.destino_persona,
        destino_submodulo: data.destino_submodulo,
        destino_etapa: data.destino_etapa,
      });
      onReload?.();
    },
    onSubsanar: async (reqId, data) => {
      await requerimientosService.subsanarConDestino(reqId, {
        respuesta: data.texto || data.respuesta,
        usuario: data.usuario || userName,
        observacion_id: data.observacion_id,
        origen_submodulo: data.origen_submodulo || CONSULTAS_SUBMODULO_LABEL,
        destino_submodulo: data.destino_submodulo || CONSULTAS_SUBMODULO_LABEL,
        destino_etapa: data.destino_etapa,
        destino_persona: data.destino_persona,
        usuario_destino_id: data.usuario_destino_id,
      });
      onReload?.();
    },
    onReload,
  };
}

export function consultasDetalleModalStyles() {
  return `
    .co-exp-modal .modal-dialog {
      max-width: min(96vw, 1180px);
      margin: 1rem auto;
    }
    .co-exp-modal .modal-body {
      overflow: visible;
    }
    .co-exp-modal .co-exp-bandeja-wrap {
      overflow-x: auto;
      overflow-y: visible;
    }
    .co-exp-modal .co-exp-bandeja-wrap .req-col-acc {
      position: static;
      overflow: visible;
    }
    .co-exp-modal table.co-exp-detail-table th,
    .co-exp-modal table.co-exp-detail-table td {
      vertical-align: middle;
      padding: 0.45rem 0.5rem;
    }
    .co-exp-modal .co-exp-col-proveedor { min-width: 140px; }
    .co-exp-modal .co-exp-col-asunto { min-width: 200px; }
  `;
}

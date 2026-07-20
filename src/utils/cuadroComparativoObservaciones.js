/**
 * RC8.5-D1 — Observaciones del Cuadro Comparativo vía componente institucional.
 * Reutiliza openModalObservaciones (mismo UI/historial/persistencia que Coordinación CM / DEC).
 */
import { openModalObservaciones } from '../components/modalObservaciones.js';
import { requerimientosService } from '../services/requerimientosService.js';
import { contratacionesService } from '../services/contratacionesService.js';
import { ROLES_REVISION } from './cuadroComparativoRevisionUi.js';

/**
 * @param {object} opts
 * @param {object|null} opts.req - requerimiento (fila con payload)
 * @param {number|string} [opts.requerimientoId]
 * @param {number|string} opts.cuadroId
 * @param {string} opts.rolRevision - COORDINADOR_CM | DEC
 * @param {(extra: object) => object} [opts.payloadRevision] - p.ej. inyectar actuar_como
 * @param {() => void} [opts.onDone]
 */
export async function observarCuadroConModalInstitucional(opts = {}) {
  const {
    req = null,
    requerimientoId = null,
    cuadroId,
    rolRevision = ROLES_REVISION.COORDINADOR_CM,
    payloadRevision = (x) => x,
    onDone,
  } = opts;

  let row = req;
  if ((!row || !row.id) && requerimientoId) {
    try {
      row = await requerimientosService.getById(requerimientoId);
    } catch (_) {
      row = null;
    }
  }
  if (!row?.id) {
    alert('No hay requerimiento vinculado para registrar la observación en el historial del expediente.');
    return null;
  }
  if (!cuadroId) {
    alert('Cuadro inválido');
    return null;
  }

  const isDec = String(rolRevision).toUpperCase() === ROLES_REVISION.DEC;
  const submoduloLabel = isDec ? 'DEC' : 'Cuadro Comparativo';
  const accionTransit = isDec ? 'OBSERVAR_DEC' : 'OBSERVAR_COORDINADOR';

  return openModalObservaciones(row, {
    submoduloLabel,
    defaultDestinoObservacion: 'Cuadro Comparativo',
    onObservar: async (reqId, data) => {
      if (data?.accion === 'cerrar') {
        if (isDec) {
          await contratacionesService.observarDEC(reqId, data.motivo || '', data.usuario, {
            ...data,
            origen_submodulo: data.origen_submodulo || submoduloLabel,
          });
        } else {
          await contratacionesService.observarActos(reqId, data.motivo || '', data.usuario, {
            ...data,
            origen_submodulo: data.origen_submodulo || submoduloLabel,
          });
        }
        return;
      }

      const motivo = String(data?.motivo || '').trim();
      if (!motivo) throw new Error('Motivo requerido');

      const resp = await contratacionesService.transitarRevisionCuadro(
        cuadroId,
        payloadRevision({
          accion: accionTransit,
          motivo,
          observacion: motivo,
          origen_submodulo: data.origen_submodulo || submoduloLabel,
          destino_submodulo: data.destino_submodulo || '',
          destino_etapa: data.destino_etapa || '',
          destino_persona: data.destino_persona || '',
          observacion_padre_id: data.observacion_padre_id || null,
        }),
      );
      const out = resp?.data || resp;
      if (out?.versionado) {
        alert(`Cuadro observado. Se creó la versión v${out.version_nueva || ''}. Devuelto al Analista.`);
      } else {
        alert('Cuadro observado. Devuelto al Analista.');
      }
      return out;
    },
    onSubsanar: async (reqId, data) => {
      await requerimientosService.subsanarConDestino(reqId, {
        respuesta: data.texto,
        usuario: data.usuario,
        observacion_id: data.observacion_id,
        origen_submodulo: data.origen_submodulo || submoduloLabel,
        destino_submodulo: data.destino_submodulo,
        destino_etapa: data.destino_etapa,
        destino_persona: data.destino_persona,
      });
    },
    onReload: typeof onDone === 'function' ? onDone : undefined,
  });
}

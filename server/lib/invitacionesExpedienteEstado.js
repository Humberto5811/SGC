/**
 * RC8.17.8H6-A4 — ERV vigente tras envío/re-envío de invitaciones (capa expediente).
 */
import { getLabelEstado } from '../../shared/estadoExpedienteVigente.js';
import { getLabelEtapa } from '../../shared/workflow/etapas.js';
import { TIPO_RESPONSABLE } from '../../shared/resolvedorEstadoResponsable.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  LABEL_ESPERANDO_COTIZACIONES,
  LEGACY_ESTADO_NEGOCIO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
  isEventoEnvioInvitacionProveedores,
} from '../../shared/invitacionesExpedienteCanon.js';
import { FUENTE_RESPONSABLE } from './expedienteEstadoPersistido.js';

export { isEventoEnvioInvitacionProveedores };

/**
 * @returns {{ labels: object, resp: object, metaPatch: object }}
 */
export function applyErvExpedientePostEnvioInvitacion({
  labels = {},
  usuarioOrigenId = null,
} = {}) {
  const etapaCodigo = 'INVITACIONES';
  const estadoLabel = getLabelEstado(ESTADO_ESPERANDO_COTIZACIONES)
    || LABEL_ESPERANDO_COTIZACIONES;
  const nextLabels = {
    ...labels,
    etapaCodigo,
    etapaLabel: labels.etapaLabel || getLabelEtapa(etapaCodigo) || 'Invitaciones',
    estadoCodigo: ESTADO_ESPERANDO_COTIZACIONES,
    estadoLabel,
  };
  const resp = {
    responsableTipo: TIPO_RESPONSABLE.UNIDAD,
    responsableUsuarioId: null,
    responsableUnidad: UNIDAD_RESPONSABLE_PROVEEDORES,
    responsableFuente: FUENTE_RESPONSABLE.UNIDAD_ETAPA,
  };
  const metaPatch = {
    sync_legacy_estado_negocio: LEGACY_ESTADO_NEGOCIO_ESPERANDO_COTIZACIONES,
  };
  if (usuarioOrigenId != null && Number.isFinite(Number(usuarioOrigenId))) {
    metaPatch.responsable_operativo_id = Number(usuarioOrigenId);
  }
  return { labels: nextLabels, resp, metaPatch };
}

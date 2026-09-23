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

function throwReinvitacionRecepcionErvIncompleto(detail = '') {
  const err = new Error(
    detail || 'ERV en Recepción de Cotizaciones incompleto; no se puede registrar reinvitación sin estado/responsable canónicos.',
  );
  err.code = 'REINVITACION_RECEPCION_ERV_INCOMPLETO';
  err.status = 409;
  throw err;
}

/** Valida fila ERV previa antes de preservar en reinvitación documental (RC→RC). */
export function assertErvRecepcionPreservableForReinvitacion(estadoVigentePrevio = null) {
  const ev = estadoVigentePrevio;
  const etapa = String(ev?.etapa_codigo || '').trim();
  if (!etapa || etapa.toUpperCase() !== 'RECEPCION_COTIZACIONES') {
    throwReinvitacionRecepcionErvIncompleto('Falta etapa_codigo canónica RECEPCION_COTIZACIONES.');
  }
  const estadoCodigo = String(ev?.estado_codigo || '').trim();
  if (!estadoCodigo) {
    throwReinvitacionRecepcionErvIncompleto('Falta estado_codigo en ERV vigente.');
  }
  const responsableTipo = String(ev?.responsable_tipo || '').trim();
  if (!responsableTipo) {
    throwReinvitacionRecepcionErvIncompleto('Falta responsable_tipo en ERV vigente.');
  }
  if (responsableTipo.toUpperCase() === 'PERSONA') {
    const uid = ev?.responsable_usuario_id;
    if (uid == null || !Number.isFinite(Number(uid)) || Number(uid) <= 0) {
      throwReinvitacionRecepcionErvIncompleto('Falta responsable_usuario_id para responsable PERSONA.');
    }
  }
  return ev;
}

/**
 * @returns {{ labels: object, resp: object, metaPatch: object }}
 */
export function applyErvExpedientePostEnvioInvitacion({
  labels = {},
  usuarioOrigenId = null,
  estadoVigentePrevio = null,
} = {}) {
  const etapaPrevCanon = String(estadoVigentePrevio?.etapa_codigo || '').toUpperCase();
  const etapaContext = etapaPrevCanon || String(labels.etapaCodigo || '').toUpperCase();

  /** Recepción ya gestiona el expediente: reinvitación no retrocede etapa ni pasa a Proveedores UNIDAD. */
  if (etapaContext === 'RECEPCION_COTIZACIONES') {
    const ev = assertErvRecepcionPreservableForReinvitacion(estadoVigentePrevio);
    const etapaCodigo = String(ev.etapa_codigo).toUpperCase();
    const estadoCodigo = String(ev.estado_codigo).toUpperCase();
    const responsableTipo = String(ev.responsable_tipo).toUpperCase();
    const uid = responsableTipo === 'PERSONA' ? Number(ev.responsable_usuario_id) : null;
    return {
      labels: {
        ...labels,
        etapaCodigo,
        etapaLabel: ev.etapa_label ?? '',
        estadoCodigo,
        estadoLabel: ev.estado_label ?? '',
      },
      resp: {
        responsableTipo,
        responsableUsuarioId: uid,
        responsableUnidad: ev.responsable_unidad ?? null,
        responsableFuente: ev.responsable_fuente ?? null,
      },
      metaPatch: {
        reinvitacion_documental_recepcion: true,
        ...(usuarioOrigenId != null && Number.isFinite(Number(usuarioOrigenId))
          ? { actor_envio_invitacion_id: Number(usuarioOrigenId) }
          : {}),
      },
    };
  }

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

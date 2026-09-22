/**
 * RC8.17.8H6-B1 — ERV canónico Consultas y Observaciones (etapa expediente real).
 */
import { query } from '../db.js';
import { getLabelEstado, getLabelEstadoParaEtapa } from '../../shared/estadoExpedienteCatalog.js';
import { getLabelEtapa } from '../../shared/workflow/etapas.js';
import { TIPO_RESPONSABLE } from '../../shared/resolvedorEstadoResponsable.js';
import { ESTADO_PILOT_EN_TRAMITE, LABEL_PILOT_EN_TRAMITE } from './pilotRegistroEvaluacion.js';
import {
  applyErvExpedientePostEnvioInvitacion,
} from './invitacionesExpedienteEstado.js';
import { FUENTE_RESPONSABLE } from './expedienteEstadoPersistido.js';

export const ETAPA_CONSULTAS = 'CONSULTAS_OBSERVACIONES';

/** RC8.17.8H6-C3-A1 — metadata normalizada desde fila ERV (metadata o metadata_json). */
export function parseErvMetadata(estadoVigente = null) {
  const ev = estadoVigente || null;
  if (!ev) return {};
  if (ev.metadata && typeof ev.metadata === 'object' && !Array.isArray(ev.metadata)) {
    return ev.metadata;
  }
  const raw = ev.metadata_json ?? ev.metadata;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

/**
 * Analista de Invitaciones previo (PERSONA en ERV, operativo en metadata o última asignación).
 */
export async function resolveAnalistaInvitacionesPrevio(requerimientoId, estadoVigente = null, client = null) {
  const rid = parseInt(requerimientoId, 10);
  if (!Number.isFinite(rid) || rid <= 0) return null;

  const ev = estadoVigente || null;
  if (ev?.responsable_usuario_id != null && Number.isFinite(Number(ev.responsable_usuario_id))) {
    const etapa = String(ev.etapa_codigo || '').toUpperCase();
    if (etapa === 'INVITACIONES' || etapa === ETAPA_CONSULTAS) {
      return Number(ev.responsable_usuario_id);
    }
  }

  const meta = parseErvMetadata(ev);
  const operativo = meta.responsable_operativo_id ?? meta.analista_invitaciones_previo_id;
  if (operativo != null && Number.isFinite(Number(operativo))) {
    return Number(operativo);
  }

  const q = client?.query ? client.query.bind(client) : query;
  const { rows: reqRows } = await q(
    `SELECT payload FROM requerimientos WHERE id = $1 LIMIT 1`,
    [rid],
  );
  if (reqRows[0]?.payload) {
    try {
      const p = typeof reqRows[0].payload === 'object'
        ? reqRows[0].payload
        : JSON.parse(reqRows[0].payload || '{}');
      const op = p?.erv_meta?.responsable_operativo_id ?? p?.analista_invitaciones_id;
      if (op != null && Number.isFinite(Number(op))) return Number(op);
    } catch (_) { /* ignore */ }
  }

  const { rows: asg } = await q(
    `SELECT usuario_id FROM expediente_asignaciones
     WHERE requerimiento_id = $1 AND UPPER(etapa_codigo) = 'INVITACIONES'
       AND tipo_responsable = 'PERSONA' AND usuario_id IS NOT NULL
     ORDER BY id DESC LIMIT 1`,
    [rid],
  );
  if (asg[0]?.usuario_id != null) return Number(asg[0].usuario_id);
  return null;
}

/** Post CONSULTA_PROVEEDOR_REGISTRADA: CO / EN_TRAMITE / PERSONA(analista). */
export function applyErvPostConsultaProveedorRegistrada({
  labels = {},
  analistaUsuarioId = null,
  analistaPrevioId = null,
} = {}) {
  const etapaCodigo = ETAPA_CONSULTAS;
  const previo = analistaPrevioId ?? analistaUsuarioId;
  const uid = analistaUsuarioId != null && Number.isFinite(Number(analistaUsuarioId))
    ? Number(analistaUsuarioId)
    : (previo != null && Number.isFinite(Number(previo)) ? Number(previo) : null);

  const nextLabels = {
    ...labels,
    etapaCodigo,
    etapaLabel: labels.etapaLabel || getLabelEtapa(etapaCodigo) || 'Consultas y Observaciones',
    estadoCodigo: ESTADO_PILOT_EN_TRAMITE,
    estadoLabel: getLabelEstado(ESTADO_PILOT_EN_TRAMITE) || LABEL_PILOT_EN_TRAMITE,
  };

  let resp = {
    responsableTipo: TIPO_RESPONSABLE.PENDIENTE,
    responsableUsuarioId: null,
    responsableUnidad: null,
    responsableFuente: FUENTE_RESPONSABLE.PENDIENTE,
  };
  if (uid) {
    resp = {
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: uid,
      responsableUnidad: getLabelEtapa(etapaCodigo) || 'Consultas y Observaciones',
      responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
    };
  }

  const metaPatch = {};
  if (previo != null && Number.isFinite(Number(previo))) {
    metaPatch.analista_invitaciones_previo_id = Number(previo);
  }

  return { labels: nextLabels, resp, metaPatch, usuarioDestinoEfectivo: uid };
}

/** RC8.17.8H6-C3-A — Post COTIZACION_PRESENTADA: Recepción / EN_TRAMITE / PERSONA(analista). */
export function applyErvPostCotizacionPresentada({
  labels = {},
  analistaUsuarioId = null,
  analistaPrevioId = null,
} = {}) {
  const etapaCodigo = 'RECEPCION_COTIZACIONES';
  const previo = analistaPrevioId ?? analistaUsuarioId;
  const uid = analistaUsuarioId != null && Number.isFinite(Number(analistaUsuarioId))
    ? Number(analistaUsuarioId)
    : (previo != null && Number.isFinite(Number(previo)) ? Number(previo) : null);

  const nextLabels = {
    ...labels,
    etapaCodigo,
    etapaLabel: labels.etapaLabel || getLabelEtapa(etapaCodigo) || 'Recepción de Cotizaciones',
    estadoCodigo: ESTADO_PILOT_EN_TRAMITE,
    estadoLabel: getLabelEstado(ESTADO_PILOT_EN_TRAMITE) || LABEL_PILOT_EN_TRAMITE,
  };

  let resp = {
    responsableTipo: TIPO_RESPONSABLE.PENDIENTE,
    responsableUsuarioId: null,
    responsableUnidad: null,
    responsableFuente: FUENTE_RESPONSABLE.PENDIENTE,
  };
  if (uid) {
    resp = {
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: uid,
      responsableUnidad: getLabelEtapa(etapaCodigo) || 'Recepción de Cotizaciones',
      responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
    };
  }

  const metaPatch = {
    via_erv: 'COTIZACION_PRESENTADA',
  };
  if (previo != null && Number.isFinite(Number(previo))) {
    metaPatch.analista_invitaciones_previo_id = Number(previo);
  }

  return { labels: nextLabels, resp, metaPatch, usuarioDestinoEfectivo: uid };
}

/** Sin consultas pendientes: vuelve a Invitaciones / ESPERANDO_COTIZACIONES / Proveedores. */
export function applyErvPostConsultaProveedorAbsuelta({
  labels = {},
  analistaPrevioId = null,
} = {}) {
  const applied = applyErvExpedientePostEnvioInvitacion({ labels });
  const metaPatch = { ...applied.metaPatch };
  if (analistaPrevioId != null && Number.isFinite(Number(analistaPrevioId))) {
    metaPatch.analista_invitaciones_previo_id = Number(analistaPrevioId);
  }
  return {
    labels: applied.labels,
    resp: applied.resp,
    metaPatch,
    usuarioDestinoEfectivo: null,
  };
}

/** Observación emitida desde Consultas: permanece en CO / OBSERVADO / PERSONA(destino). */
export function applyPilotConsultasObservada({
  resp,
  usuarioDestinoId = null,
  unidadDestino = null,
  metadata = {},
  labels = {},
} = {}) {
  const etapaCodigo = ETAPA_CONSULTAS;
  const uidRaw = usuarioDestinoId ?? metadata.usuario_destino_id ?? null;
  const uid = uidRaw != null && Number.isFinite(Number(uidRaw)) ? Number(uidRaw) : null;
  const metaEtapa = getLabelEtapa(etapaCodigo);

  let newResp = resp;
  if (uid) {
    newResp = {
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: uid,
      responsableUnidad: unidadDestino || metaEtapa || 'Consultas y Observaciones',
      responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
    };
  }

  return {
    resp: newResp,
    etapaEfectiva: etapaCodigo,
    labels: {
      ...labels,
      etapaCodigo,
      etapaLabel: getLabelEtapa(etapaCodigo) || 'Consultas y Observaciones',
      estadoCodigo: 'OBSERVADO',
      estadoLabel: getLabelEstadoParaEtapa(etapaCodigo, 'OBSERVADO') || 'Observado',
    },
    metaExtra: {
      pilot_consultas_observada: true,
      etapa_origen: ETAPA_CONSULTAS,
      destino_submodulo: metadata.destino_submodulo || metadata.destinoSubmodulo || '',
      destino_etapa: metadata.etapa_destino || metadata.destino_etapa || '',
      responsable_seleccionado_id: uid,
    },
    usuarioDestinoEfectivo: uid,
  };
}

export default {
  ETAPA_CONSULTAS,
  parseErvMetadata,
  resolveAnalistaInvitacionesPrevio,
  applyErvPostConsultaProveedorRegistrada,
  applyErvPostCotizacionPresentada,
  applyErvPostConsultaProveedorAbsuelta,
  applyPilotConsultasObservada,
};

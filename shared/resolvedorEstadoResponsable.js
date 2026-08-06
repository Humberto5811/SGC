/**
 * RC8.4B — Resolvedor central de Estado y Responsable Vigentes.
 *
 * Contrato único para toda la aplicación.
 * FE-safe: no depende de BD. El wrapper server-side enriquece con DB.
 *
 * Delegación de estado: 100% en resolveEstadoExpedienteVigente.
 * NO duplica resolución de estado.
 */

import {
  resolveEstadoExpedienteVigente,
  getEstadoDef,
  getLabelEstado,
} from './estadoExpedienteVigente.js';
import { getEtapaMeta, getLabelEtapa } from './workflow/etapas.js';
import { isRolGenerico, isCentroOrganizacional, isUsuarioInvalido } from './identificadoresUsuarios.js';

// ==========================================================================
// TIPOS DE RESPONSABLE (contrato corregido)
// ==========================================================================

export const TIPO_RESPONSABLE = Object.freeze({
  PERSONA: 'PERSONA',
  UNIDAD: 'UNIDAD',
  ROL: 'ROL',
  PENDIENTE: 'PENDIENTE',
});

// ==========================================================================
// ALIASES DE ETAPAS → canónico (etapas.js)
// ==========================================================================

const ETAPA_ALIAS = Object.freeze({
  ORDEN: 'REGISTRO_ORDEN',
  CONFORMIDAD: 'RECEPCION_BIENES',
  PAGO: 'DERIVACION_PAGO',
  EJECUCION: 'RECEPCION_BIENES',
  REGISTRADO: 'REGISTRO',
  RESOLUCION: 'FINALIZADO',
  RECEPCION_SERVICIOS: 'PRESENTACION_ENTREGABLES',
});

function canonEtapa(raw) {
  const c = String(raw || '').toUpperCase().trim();
  return ETAPA_ALIAS[c] || c;
}

// ==========================================================================
// MAPA: UNIDAD RESPONSABLE POR ESTADO CANÓNICO
// ==========================================================================

const ESTADO_UNIDAD_MAP = Object.freeze({
  // Recepción / Conformidad
  RECEPCION_BIENES_PENDIENTE: 'Almacén',
  RECEPCION_BIENES_OBSERVADA: 'Almacén',
  BIEN_RECIBIDO_ALMACEN: 'Almacén',
  CONFORMIDAD_PENDIENTE_AU: 'Área Usuaria',
  CONFORMIDAD_RECIBIDA_AU: 'Almacén',
  CONFORMIDAD_EN_COORDINACION_CM: 'Coordinación CM',

  // Órdenes
  REGISTRO_ORDENES: 'Registro de Órdenes',
  ORDEN_REGISTRADA: 'Registro de Órdenes',
  ORDEN_LISTA_NOTIFICACION: 'Registro de Órdenes',
  ORDEN_NOTIFICADA: 'Registro de Órdenes',
  ORDEN_RECEPCION_CONFIRMADA: 'Registro de Órdenes',
  EN_EJECUCION: 'Ejecución Contractual',
  ORDEN_ANULADA: '',

  // CCP
  DERIVADO_CCP: 'CCP',
  ENVIADA_OPPM: 'CCP',
  CCP_REGISTRADA: 'CCP',

  // Terminales
  EXPEDIENTE_DERIVADO_PAGO: 'Tesorería / Pagaduría',
  ORDEN_RESUELTA: '',
});

// ==========================================================================
// MAPA: ETAPA → UNIDAD FUNCIONAL (rol, no persona)
// ==========================================================================

const ETAPA_UNIDAD = Object.freeze({
  REGISTRO: 'Usuario AU',
  EVALUACION: 'Director / Gerente',
  DEC: 'Responsable DEC',
  PROGRAMACION: 'Responsable Programación',
  COORDINACION_CM: 'Coordinador CM',
  INVITACIONES: 'Analista CM',
  RECEPCION_COTIZACIONES: 'Analista CM',
  VALIDACIONES: 'Área Usuaria',
  CUADRO_COMPARATIVO: 'Analista CM',
  CCP: 'CCP',
  REGISTRO_ORDEN: 'Analista CM',
  RECEPCION_BIENES: 'Almacén',
  PRESENTACION_ENTREGABLES: 'Área Usuaria',
  DERIVACION_PAGO: 'Analista de Pago',
  FINALIZADO: '—',
});

// ==========================================================================
// API PÚBLICA
// ==========================================================================

/**
 * Resuelve etapa canónica desde código de estado devuelto por
 * resolveEstadoExpedienteVigente.
 */
export function etapaDesdeEstadoCodigo(estadoCodigo) {
  const def = getEstadoDef(estadoCodigo);
  if (def?.etapa) return canonEtapa(def.etapa);

  // Mapping explícito para estados sin def.etapa completo
  const m = {
    RECEPCION_BIENES_PENDIENTE: 'RECEPCION_BIENES',
    RECEPCION_BIENES_OBSERVADA: 'RECEPCION_BIENES',
    BIEN_RECIBIDO_ALMACEN: 'RECEPCION_BIENES',
    CONFORMIDAD_PENDIENTE_AU: 'RECEPCION_BIENES',
    CONFORMIDAD_RECIBIDA_AU: 'RECEPCION_BIENES',
    CONFORMIDAD_EN_COORDINACION_CM: 'RECEPCION_BIENES',
    REGISTRO_ORDENES: 'REGISTRO_ORDEN',
    ORDEN_REGISTRADA: 'REGISTRO_ORDEN',
    ORDEN_LISTA_NOTIFICACION: 'REGISTRO_ORDEN',
    ORDEN_NOTIFICADA: 'REGISTRO_ORDEN',
    ORDEN_RECEPCION_CONFIRMADA: 'REGISTRO_ORDEN',
    EN_EJECUCION: 'REGISTRO_ORDEN',
    ORDEN_ANULADA: 'REGISTRO_ORDEN',
    ORDEN_RESUELTA: 'FINALIZADO',
    EXPEDIENTE_DERIVADO_PAGO: 'DERIVACION_PAGO',
    DERIVADO_CCP: 'CCP',
    ENVIADA_OPPM: 'CCP',
    CCP_REGISTRADA: 'CCP',
  };
  return canonEtapa(m[estadoCodigo] || '');
}

export function unidadDesdeEstadoCodigo(estadoCodigo) {
  const u = ESTADO_UNIDAD_MAP[estadoCodigo];
  if (u !== undefined) return u;
  const etapa = etapaDesdeEstadoCodigo(estadoCodigo);
  return ETAPA_UNIDAD[etapa] || 'Pendiente de asignación';
}

// ==========================================================================
// CONTRATO ÚNICO
// ==========================================================================

/**
 * @param {object} evidencia — fila enriquecida (estado_actual,
 *   responsable_actual, centro_nombre, etc.)
 * @param {object} [opts]
 * @param {object} [opts.asignaciones] — Nivel 1 desde DB (solo server-side)
 * @returns {object} Contrato estado+responsable
 */
export function resolveEstadoResponsableVigente(evidencia = {}, opts = {}) {
  // ── ESTADO: delegación 100% ──
  const vigente = resolveEstadoExpedienteVigente(evidencia, opts);
  const estadoCodigo = vigente.codigo || vigente.code || 'REQUERIMIENTO_REGISTRADO';
  const estadoLabel = vigente.label || getLabelEstado(estadoCodigo) || estadoCodigo;

  // ── ETAPA ──
  const etapaRaw = vigente.etapa || vigente.workflowEtapa || etapaDesdeEstadoCodigo(estadoCodigo);
  const etapaCodigo = canonEtapa(etapaRaw);
  const etapaMeta = getEtapaMeta(etapaCodigo);
  const etapaLabel = etapaMeta?.label || getLabelEtapa(etapaCodigo) || etapaRaw;

  // ── UNIDAD DEFAULT ──
  const unidadDefault = unidadDesdeEstadoCodigo(estadoCodigo);

  // ── FECHA ──
  const actualizadoAt = evidencia.fecha_estado_actual
    || evidencia.fechaEstadoActual
    || evidencia.updated_at
    || evidencia.created_at
    || null;

  // ================================================================
  // NIVEL 1: Asignación explícita DB (provista por wrapper server-side)
  // RC8.6A — también acepta UNIDAD / PENDIENTE persistidos (sin inventar persona).
  // ================================================================
  if (opts.asignaciones?._result) {
    const a = opts.asignaciones._result;
    const tipoAsig = String(a.tipoResponsable || a.tipo_responsable || '').toUpperCase();
    const uid = a.usuarioId ?? a.responsableUsuarioId ?? null;
    const uname = a.username || a.responsableUsername || '';
    const nombre = a.nombre || a.responsableNombre || uname || '';
    if (tipoAsig === 'PENDIENTE' || a.pendiente === true) {
      return build({
        estadoCodigo, estadoLabel, etapaCodigo, etapaLabel,
        responsableTipo: TIPO_RESPONSABLE.PENDIENTE,
        responsableUsuarioId: null,
        responsableUsername: '',
        responsableNombre: '',
        responsableUnidad: a.unidad || a.responsableUnidad || 'Pendiente de asignación',
        responsableFuente: a.fuente || 'pendiente_asignacion',
        actualizadoAt,
      });
    }
    if (tipoAsig === 'UNIDAD' || (a.unidad && !uid && !uname)) {
      return build({
        estadoCodigo, estadoLabel, etapaCodigo, etapaLabel,
        responsableTipo: TIPO_RESPONSABLE.UNIDAD,
        responsableUsuarioId: null,
        responsableUsername: '',
        responsableNombre: '',
        responsableUnidad: a.unidad || a.responsableUnidad || unidadDefault || '—',
        responsableFuente: a.fuente || 'unidad_destino_etapa',
        actualizadoAt,
      });
    }
    if (uid || (uname && !isUsuarioInvalido(uname, evidencia))) {
      return build({
        estadoCodigo, estadoLabel, etapaCodigo, etapaLabel,
        responsableTipo: TIPO_RESPONSABLE.PERSONA,
        responsableUsuarioId: uid,
        responsableUsername: uname,
        responsableNombre: nombre,
        responsableUnidad: a.unidad || a.responsableUnidad || unidadDefault,
        responsableFuente: a.fuente || 'asignacion_explicita_db',
        actualizadoAt,
      });
    }
  }

  // ================================================================
  // NIVEL 2: responsable_actual persistido (persona real)
  // ================================================================
  const respActual = String(
    evidencia.responsable_actual || evidencia.responsableActual || '',
  ).trim();
  if (respActual && !isRolGenerico(respActual) && !isCentroOrganizacional(respActual, evidencia)) {
    return build({
      estadoCodigo, estadoLabel, etapaCodigo, etapaLabel,
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: null,
      responsableUsername: respActual,
      responsableNombre: respActual,
      responsableUnidad: unidadDefault || '—',
      responsableFuente: 'responsable_actual_bd',
      actualizadoAt,
    });
  }

  // ================================================================
  // NIVEL 3: Workflow Engine (actor_responsable_id)
  // ================================================================
  const wfResp = String(
    evidencia.wf_responsable || evidencia.actor_responsable_id || '',
  ).trim();
  if (wfResp && !isRolGenerico(wfResp)) {
    return build({
      estadoCodigo, estadoLabel, etapaCodigo, etapaLabel,
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: null,
      responsableUsername: wfResp,
      responsableNombre: wfResp,
      responsableUnidad: unidadDefault || '—',
      responsableFuente: 'workflow_engine',
      actualizadoAt,
    });
  }

  // ================================================================
  // NIVEL 4: Unidad destino (sin persona asignada)
  // ================================================================
  if (unidadDefault && unidadDefault !== '' && unidadDefault !== '—') {
    return build({
      estadoCodigo, estadoLabel, etapaCodigo, etapaLabel,
      responsableTipo: TIPO_RESPONSABLE.UNIDAD,
      responsableUsuarioId: null,
      responsableUsername: '',
      responsableNombre: '',
      responsableUnidad: unidadDefault,
      responsableFuente: 'unidad_destino_etapa',
      actualizadoAt,
    });
  }

  // ================================================================
  // NIVEL 5: Pendiente
  // ================================================================
  return build({
    estadoCodigo, estadoLabel, etapaCodigo, etapaLabel,
    responsableTipo: TIPO_RESPONSABLE.PENDIENTE,
    responsableUsuarioId: null,
    responsableUsername: '',
    responsableNombre: '',
    responsableUnidad: 'Pendiente de asignación',
    responsableFuente: 'pendiente_asignacion',
    actualizadoAt,
  });
}

// ==========================================================================
// BUILD
// ==========================================================================

function build(f) {
  return {
    estadoCodigo: f.estadoCodigo,
    estadoLabel: f.estadoLabel,
    etapaCodigo: f.etapaCodigo,
    etapaLabel: f.etapaLabel,
    responsableTipo: f.responsableTipo,
    responsableUsuarioId: f.responsableUsuarioId ?? null,
    responsableUsername: f.responsableUsername ?? '',
    responsableNombre: f.responsableNombre ?? '',
    responsableUnidad: f.responsableUnidad ?? 'Pendiente de asignación',
    responsableFuente: f.responsableFuente ?? 'pendiente_asignacion',
    actualizadoAt: f.actualizadoAt ?? null,
  };
}

// ==========================================================================

export default {
  resolveEstadoResponsableVigente,
  TIPO_RESPONSABLE,
  etapaDesdeEstadoCodigo,
  unidadDesdeEstadoCodigo,
};
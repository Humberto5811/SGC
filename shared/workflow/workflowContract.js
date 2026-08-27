/**
 * Contratos del Workflow SGC.
 * Compartido BE/FE. Sin dependencias de BD.
 *
 * Contratos:
 * A. Ubicación: responde "¿dónde está el requerimiento?" (solo expediente).
 * B. Estados: estados por dominio (un dominio ausente = null).
 * C. Visual: cómo presenta el FE (claves semánticas, sin colores CSS en backend).
 */

import { TIPOS_CONTRATACION } from './tiposContratacion.js';
import { ETAPAS } from './etapas.js';
import { EVENTOS } from './eventos.js';

export const VERSION_WORKFLOW = Object.freeze('1.0.0');

/** Claves semánticas de estado visual (sin colores CSS en backend). */
export const ESTADO_VISUAL = Object.freeze({
  COMPLETED: 'completed',
  CURRENT: 'current',
  PENDING: 'pending',
  OBSERVED: 'observed',
  BLOCKED: 'blocked',
  RETURNED: 'returned',
  CANCELLED: 'cancelled',
  FINISHED: 'finished',
});

/** Dominios expuestos en el contrato B (preservan orden). */
export const DOMINIOS_CONTRATO = Object.freeze([
  'expediente',
  'solicitud',
  'invitacion',
  'recepcion',
  'cotizacion',
  'validacion',
  'cuadro',
  'ccp',
  'orden',
  'ejecucion',
  'observacion',
]);

/** Mapeo dominio canónico → clave del contrato. */
export const DOMINIO_A_CLAVE = Object.freeze({
  EXPEDIENTE: 'expediente',
  SOLICITUD_COTIZACION: 'solicitud',
  INVITACION: 'invitacion',
  RECEPCION_COTIZACIONES: 'recepcion',
  COTIZACION: 'cotizacion',
  VALIDACION: 'validacion',
  CUADRO_COMPARATIVO: 'cuadro',
  CCP: 'ccp',
  ORDEN: 'orden',
  EJECUCION: 'ejecucion',
  OBSERVACION: 'observacion',
});

function stringOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

/**
 * A. Contrato de ubicación vigente.
 * Solo responde dónde está el requerimiento; no incluye estados de dominio.
 */
export function buildContratoUbicacion({
  expediente_id,
  tipo_contratacion,
  etapa_codigo,
  etapa_label,
  submodulo_codigo,
  submodulo_label,
  responsable_codigo,
  responsable_label,
  actualizado_en,
  version_workflow = VERSION_WORKFLOW,
} = {}) {
  return {
    expediente_id: expediente_id ?? null,
    tipo_contratacion: stringOrNull(tipo_contratacion),
    etapa_codigo: stringOrNull(etapa_codigo),
    etapa_label: stringOrNull(etapa_label),
    submodulo_codigo: stringOrNull(submodulo_codigo),
    submodulo_label: stringOrNull(submodulo_label),
    responsable_codigo: stringOrNull(responsable_codigo),
    responsable_label: stringOrNull(responsable_label),
    version_workflow,
    actualizado_en: actualizado_en || null,
  };
}

/**
 * B. Contrato de estados por dominio.
 * `domainStates` es un objeto { dominioCanonico: { codigo, label } | null }.
 * Un dominio no disponible debe ser null; nunca se usa otro dominio como fallback.
 */
export function buildContratoEstados({
  tipo_contratacion,
  etapa_codigo,
  etapa_label,
  submodulo_codigo,
  submodulo_label,
  responsable_codigo,
  responsable_label,
  domainStates = {},
} = {}) {
  const estados = {};
  for (const clave of DOMINIOS_CONTRATO) {
    // Buscar el valor por clave o por dominio canónico.
    let value = domainStates[clave];
    if (value === undefined) {
      const dominioCanonico = Object.keys(DOMINIO_A_CLAVE)
        .find((d) => DOMINIO_A_CLAVE[d] === clave);
      if (dominioCanonico !== undefined) value = domainStates[dominioCanonico];
    }
    if (value && typeof value === 'object' && value.codigo) {
      estados[clave] = {
        codigo: String(value.codigo),
        label: String(value.label || value.codigo),
      };
    } else {
      estados[clave] = null;
    }
  }
  return {
    workflow: {
      tipo_contratacion: stringOrNull(tipo_contratacion),
      etapa_codigo: stringOrNull(etapa_codigo),
      etapa_label: stringOrNull(etapa_label),
      submodulo_codigo: stringOrNull(submodulo_codigo),
      submodulo_label: stringOrNull(submodulo_label),
      responsable_codigo: stringOrNull(responsable_codigo),
      responsable_label: stringOrNull(responsable_label),
    },
    estados,
  };
}

/**
 * C. Contrato visual.
 * Claves semánticas (completed/current/pending/observed/blocked/returned/cancelled/finished).
 * No se codifican colores CSS en backend.
 */
export function buildContratoVisual({
  etapa_actual,
  etapa_label,
  responsable_actual,
  responsable_label,
  estado_visible = ESTADO_VISUAL.CURRENT,
  estado_visible_label,
  fecha_ingreso_etapa,
  dias_en_etapa = 0,
  proxima_accion = null,
  siguiente_etapa = null,
  bloqueado = false,
  motivo_bloqueo = null,
} = {}) {
  return {
    etapa_actual: stringOrNull(etapa_actual),
    etapa_label: stringOrNull(etapa_label),
    responsable_actual: stringOrNull(responsable_actual),
    responsable_label: stringOrNull(responsable_label),
    estado_visible: stringOrNull(estado_visible),
    estado_visible_label: stringOrNull(estado_visible_label),
    fecha_ingreso_etapa: fecha_ingreso_etapa || null,
    dias_en_etapa: Number.isFinite(Number(dias_en_etapa)) ? Number(dias_en_etapa) : 0,
    proxima_accion: stringOrNull(proxima_accion),
    siguiente_etapa: stringOrNull(siguiente_etapa),
    bloqueado: !!bloqueado,
    motivo_bloqueo: stringOrNull(motivo_bloqueo),
  };
}

/**
 * Normaliza el actor a su forma canónica { id, rol }.
 *
 * Reglas:
 * - Formato canónico: `actor: { id, rol }`.
 * - Compatibilidad temporal: acepta `actor_id` / `actor_rol` planos y los
 *   convierte internamente a objeto canónico.
 * - Si se pasa `user` (req.user de ruta autenticada), sus `id`/`rol`
 *   tienen prioridad absoluta: el actor NUNCA se toma del cliente para
 *   autorización productiva. En /simular el actor recibido es solo contexto.
 * - Si se pasa `portalProveedor` (req.portalProveedor del Portal de Proveedores,
 *   proveedor autenticado contra BD), tiene prioridad sobre el cliente para
 *   eventos del portal (COTIZACION_PRESENTADA, confirmación de orden).
 *
 * @param {object} opts
 * @param {object} [opts.actor]  — formato canónico { id, rol }
 * @param {string|number} [opts.actor_id]  — compat plano
 * @param {string} [opts.actor_rol]        — compat plano
 * @param {object} [opts.user]   — req.user de ruta autenticada (id, rol)
 * @param {object} [opts.portalProveedor] — req.portalProveedor (id, razon_social, ruc)
 */
export function normalizarActor({ actor, actor_id, actor_rol, user = null, portalProveedor = null } = {}) {
  // 0. Proveedor de portal autenticado gana sobre actor del cliente (eventos portal).
  if (portalProveedor && (portalProveedor.id !== undefined && portalProveedor.id !== null)) {
    return {
      id: portalProveedor.id ?? null,
      rol: 'PORTAL_PROVEEDOR',
      portalProveedorId: portalProveedor.id ?? null,
      portalRuc: portalProveedor.ruc || portalProveedor.razon_social || null,
    };
  }

  // 1. Identidad autenticada gana (nunca confiar en actor del cliente para producción).
  if (user && (user.id !== undefined && user.id !== null)) {
    return {
      id: user.id ?? null,
      rol: (user.rol || actor_rol || '').trim(),
    };
  }

  // 2. Formato canónico anidado.
  if (actor && typeof actor === 'object') {
    return {
      id: actor.id ?? actor_id ?? null,
      rol: String(actor.rol ?? actor_rol ?? '').trim(),
    };
  }

  // 3. Compat plano.
  return {
    id: actor_id ?? null,
    rol: String(actor_rol ?? '').trim(),
  };
}

/**
 * Builder backend mínimo del tramo Recepción/Cotizaciones (Fase 2A.2).
 *
 * Contrato:
 * {
 *   workflow: { etapa_codigo, etapa_label, submodulo_codigo, submodulo_label,
 *               responsable_codigo, responsable_label },
 *   estados: { expediente, recepcion, cotizacion },
 *   fechas: { fecha_presentacion, fecha_presentacion_lima }
 * }
 *
 * Reglas:
 * - Cada dominio se resuelve por separado; dominio ausente = null.
 * - recepcion NO usa expediente como fallback.
 * - cotizacion NO usa workflow como fallback.
 * - workflowSnapshot nunca sobrescribe estado_actual.
 * - No toca frontend; solo backend reutilizable.
 *
 * @param {object} opts
 * @param {string} opts.tipo_contratacion
 * @param {string} opts.etapa_codigo / etapa_label / submodulo_codigo / submodulo_label
 * @param {string} opts.responsable_codigo / responsable_label
 * @param {object} [opts.estados] — { expediente?, recepcion?, cotizacion? } (codigo/label o null)
 * @param {object} [opts.fechas] — { fecha_presentacion? } (ISO real)
 * @returns {object} contrato con workflow/estados/fechas
 */
export function buildContratoRecepcionCotizacion({
  tipo_contratacion,
  etapa_codigo,
  etapa_label,
  submodulo_codigo,
  submodulo_label,
  responsable_codigo,
  responsable_label,
  estados = {},
  fechas = {},
} = {}) {
  const normEstado = (v) => (v && typeof v === 'object' && v.codigo
    ? { codigo: String(v.codigo), label: String(v.label || v.codigo) }
    : null);

  // Conversión a America/Lima (UTC-5, sin DST). El timestamp real se guarda
  // en BD; aquí solo se formatea la representación para UI.
  let fechaPresentacionLima = null;
  const iso = fechas.fecha_presentacion && String(fechas.fecha_presentacion);
  if (iso && !Number.isNaN(new Date(iso).getTime())) {
    const lima = new Date(new Date(iso).getTime() - 5 * 3600 * 1000);
    const dd = String(lima.getUTCDate()).padStart(2, '0');
    const mm = String(lima.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = lima.getUTCFullYear();
    const hh = String(lima.getUTCHours()).padStart(2, '0');
    const min = String(lima.getUTCMinutes()).padStart(2, '0');
    fechaPresentacionLima = `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }

  return {
    workflow: {
      tipo_contratacion: stringOrNull(tipo_contratacion),
      etapa_codigo: stringOrNull(etapa_codigo),
      etapa_label: stringOrNull(etapa_label),
      submodulo_codigo: stringOrNull(submodulo_codigo),
      submodulo_label: stringOrNull(submodulo_label),
      responsable_codigo: stringOrNull(responsable_codigo),
      responsable_label: stringOrNull(responsable_label),
    },
    estados: {
      expediente: normEstado(estados.expediente),
      recepcion: normEstado(estados.recepcion),
      cotizacion: normEstado(estados.cotizacion),
    },
    fechas: {
      fecha_presentacion: fechas.fecha_presentacion || null,
      fecha_presentacion_lima: fechaPresentacionLima,
    },
  };
}

/** Normaliza un código de evento enviado por cliente. */
export function normalizarEventoCodigo(raw) {
  const s = String(raw || '').trim().toUpperCase();
  return EVENTOS[s] ? EVENTOS[s] : (s || null);
}

/** Normaliza un código de etapa (canónico + alias legacy BD). */
export function normalizarEtapaCodigo(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (ETAPAS[s]) return ETAPAS[s];
  // Mapeo de códigos legacy que la BD guarda pero que no son canónicos de la
  // matriz. Al leer estado_actual, traducimos al canónico de la matriz.
  if (s === 'ACTOS_PREPARATORIOS') return ETAPAS.COORDINACION_CM;
  if (s === 'ORDEN_COMPRA') return ETAPAS.REGISTRO_ORDEN;
  if (s === 'REGISTRO' || s === 'REGISTRADO') return ETAPAS.REGISTRO;
  if (s === 'CONSULTAS' || s === 'PORTAL_PROVEEDORES') return ETAPAS.INVITACIONES;
  if (s === 'VALIDACION' || s === 'VALIDACION_USUARIO') return ETAPAS.VALIDACIONES;
  if (s === 'LIQUIDACION' || s === 'ARCHIVO') return ETAPAS.FINALIZADO;
  return (s || null);
}

/** Normaliza código de tipo de contratación. */
export function normalizarTipoCodigo(raw) {
  const s = String(raw || '').trim().toUpperCase();
  return TIPOS_CONTRATACION[s] ? TIPOS_CONTRATACION[s] : (s || null);
}

export default {
  VERSION_WORKFLOW,
  ESTADO_VISUAL,
  DOMINIOS_CONTRATO,
  DOMINIO_A_CLAVE,
  buildContratoUbicacion,
  buildContratoEstados,
  buildContratoVisual,
  buildContratoRecepcionCotizacion,
  normalizarActor,
  normalizarEventoCodigo,
  normalizarEtapaCodigo,
  normalizarTipoCodigo,
};

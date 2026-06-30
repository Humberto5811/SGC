/**
 * WorkflowState — catálogo único de estados y resolución operativa del requerimiento.
 * Fase 1: fuente de verdad del Workflow Engine (sin persistencia ni UI).
 */
import {
  ESTADOS,
  ESTADOS_REQUERIMIENTO,
  ESTADOS_LIST,
  FLUJO_REQUERIMIENTO,
  esEstadoValido,
  normalizarEstado,
} from '../common/ConstantesEstados.js';

/** Códigos de etapa (`estado_actual` en BD) alineados con trazabilidad operativa. */
export const ETAPAS = Object.freeze({
  REGISTRADO: 'REGISTRADO',
  EVALUACION: 'EVALUACION',
  DEC: 'DEC',
  PROGRAMACION: 'PROGRAMACION',
  ACTOS_PREPARATORIOS: 'ACTOS_PREPARATORIOS',
  INVITACIONES: 'INVITACIONES',
  RECEPCION_COTIZACIONES: 'RECEPCION_COTIZACIONES',
  PORTAL_PROVEEDORES: 'PORTAL_PROVEEDORES',
  VALIDACION_USUARIO: 'VALIDACION_USUARIO',
  CUADRO_COMPARATIVO: 'CUADRO_COMPARATIVO',
  CCP: 'CCP',
  ORDEN_COMPRA: 'ORDEN_COMPRA',
  EJECUCION: 'EJECUCION',
  LIQUIDACION: 'LIQUIDACION',
  ARCHIVO: 'ARCHIVO',
  FINALIZADO: 'FINALIZADO',
});

/** Metadatos por etapa: etiqueta UI, submódulo y estado Core asociado. */
export const ETAPA_META = Object.freeze({
  [ETAPAS.REGISTRADO]: {
    label: 'Registro de Requerimiento',
    submodulo: 'Registro de Requerimiento',
    estadoCore: ESTADOS_REQUERIMIENTO.REGISTRADO,
    responsableDefault: 'Usuario AU',
  },
  [ETAPAS.EVALUACION]: {
    label: 'Evaluación de Requerimiento',
    submodulo: 'Evaluación de Requerimiento',
    estadoCore: ESTADOS_REQUERIMIENTO.REGISTRADO,
    responsableDefault: 'Director / Gerente',
  },
  [ETAPAS.DEC]: {
    label: 'DEC',
    submodulo: 'DEC',
    estadoCore: ESTADOS_REQUERIMIENTO.DEC,
    responsableDefault: 'DEC',
  },
  [ETAPAS.PROGRAMACION]: {
    label: 'Programación',
    submodulo: 'Programación',
    estadoCore: ESTADOS_REQUERIMIENTO.PROGRAMACION,
    responsableDefault: 'Programador',
  },
  [ETAPAS.ACTOS_PREPARATORIOS]: {
    label: 'Coordinación CM',
    submodulo: 'Coordinación CM',
    estadoCore: ESTADOS_REQUERIMIENTO.COORDINACION_CM,
    responsableDefault: 'Coordinador de Contratos Menores',
  },
  [ETAPAS.INVITACIONES]: {
    label: 'Invitaciones',
    submodulo: 'Invitaciones',
    estadoCore: ESTADOS_REQUERIMIENTO.INVITACIONES,
    responsableDefault: 'Especialista Contrataciones',
  },
  [ETAPAS.RECEPCION_COTIZACIONES]: {
    label: 'Cotizaciones',
    submodulo: 'Cotizaciones',
    estadoCore: ESTADOS_REQUERIMIENTO.CONSULTAS,
    responsableDefault: 'Especialista Contrataciones',
  },
  [ETAPAS.PORTAL_PROVEEDORES]: {
    label: 'Portal Proveedores',
    submodulo: 'Portal Proveedores',
    estadoCore: ESTADOS_REQUERIMIENTO.INVITACIONES,
    responsableDefault: 'Proveedor',
  },
  [ETAPAS.VALIDACION_USUARIO]: {
    label: 'Validación',
    submodulo: 'Validación Usuario',
    estadoCore: ESTADOS_REQUERIMIENTO.VALIDACION,
    responsableDefault: 'Área Usuaria',
  },
  [ETAPAS.CUADRO_COMPARATIVO]: {
    label: 'Cuadro Comparativo',
    submodulo: 'Cuadro Comparativo',
    estadoCore: ESTADOS_REQUERIMIENTO.CUADRO_COMPARATIVO,
    responsableDefault: 'Especialista Contrataciones',
  },
  [ETAPAS.CCP]: {
    label: 'CCP',
    submodulo: 'CCP',
    estadoCore: ESTADOS_REQUERIMIENTO.CCP,
    responsableDefault: 'Comité de Compras Públicas',
  },
  [ETAPAS.ORDEN_COMPRA]: {
    label: 'Orden de Compra / Contrato',
    submodulo: 'Orden de Compra',
    estadoCore: ESTADOS_REQUERIMIENTO.CCP,
    responsableDefault: 'Especialista Contrataciones',
  },
  [ETAPAS.EJECUCION]: {
    label: 'Ejecución Contractual',
    submodulo: 'Ejecución Contractual',
    estadoCore: ESTADOS_REQUERIMIENTO.EJECUCION,
    responsableDefault: 'Ejecutor Contractual',
  },
  [ETAPAS.LIQUIDACION]: {
    label: 'Liquidación',
    submodulo: 'Liquidación',
    estadoCore: ESTADOS_REQUERIMIENTO.EJECUCION,
    responsableDefault: 'Ejecutor Contractual',
  },
  [ETAPAS.ARCHIVO]: {
    label: 'Archivo',
    submodulo: 'Archivo',
    estadoCore: ESTADOS_REQUERIMIENTO.FINALIZADO,
    responsableDefault: '—',
  },
  [ETAPAS.FINALIZADO]: {
    label: 'Finalizado',
    submodulo: 'Finalizado',
    estadoCore: ESTADOS_REQUERIMIENTO.FINALIZADO,
    responsableDefault: '—',
  },
});

/** Secuencia oficial del flujo (etapas operativas). */
export const FLUJO_ETAPAS = Object.freeze([
  ETAPAS.REGISTRADO,
  ETAPAS.EVALUACION,
  ETAPAS.DEC,
  ETAPAS.PROGRAMACION,
  ETAPAS.ACTOS_PREPARATORIOS,
  ETAPAS.INVITACIONES,
  ETAPAS.PORTAL_PROVEEDORES,
  ETAPAS.VALIDACION_USUARIO,
  ETAPAS.CUADRO_COMPARATIVO,
  ETAPAS.CCP,
  ETAPAS.ORDEN_COMPRA,
  ETAPAS.EJECUCION,
  ETAPAS.LIQUIDACION,
  ETAPAS.ARCHIVO,
  ETAPAS.FINALIZADO,
]);

const ALIAS_ETAPA = Object.freeze({
  REGISTRO: ETAPAS.REGISTRADO,
  EVALUACION: ETAPAS.EVALUACION,
  ACTOS: ETAPAS.ACTOS_PREPARATORIOS,
  ACTOS_PREPARATORIOS: ETAPAS.ACTOS_PREPARATORIOS,
  COORDINACION_CM: ETAPAS.ACTOS_PREPARATORIOS,
  VALIDACION: ETAPAS.VALIDACION_USUARIO,
  PORTAL: ETAPAS.PORTAL_PROVEEDORES,
  ORDEN: ETAPAS.ORDEN_COMPRA,
  CONTRATO: ETAPAS.ORDEN_COMPRA,
});

export function normalizarEtapa(codeOrLabel) {
  const raw = String(codeOrLabel || '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/\s+/g, '_');
  if (ETAPA_META[upper]) return upper;
  if (ALIAS_ETAPA[upper]) return ALIAS_ETAPA[upper];
  const bySubmodulo = Object.entries(ETAPA_META).find(([, meta]) => (
    meta.submodulo.toLowerCase() === raw.toLowerCase()
    || meta.label.toLowerCase() === raw.toLowerCase()
  ));
  if (bySubmodulo) return bySubmodulo[0];
  if (/registro/i.test(raw) && !/orden/i.test(raw)) return ETAPAS.REGISTRADO;
  if (/evalu/i.test(raw)) return ETAPAS.EVALUACION;
  if (/^dec$/i.test(raw) || /\bdec\b/i.test(raw)) return ETAPAS.DEC;
  if (/program/i.test(raw)) return ETAPAS.PROGRAMACION;
  if (/actos|coordinaci/i.test(raw)) return ETAPAS.ACTOS_PREPARATORIOS;
  if (/invitaci/i.test(raw)) return ETAPAS.INVITACIONES;
  if (/portal|proveedor/i.test(raw)) return ETAPAS.PORTAL_PROVEEDORES;
  if (/valid/i.test(raw)) return ETAPAS.VALIDACION_USUARIO;
  if (/cuadro/i.test(raw)) return ETAPAS.CUADRO_COMPARATIVO;
  if (/\bccp\b/i.test(raw)) return ETAPAS.CCP;
  if (/orden|contrato/i.test(raw)) return ETAPAS.ORDEN_COMPRA;
  if (/ejecuc/i.test(raw)) return ETAPAS.EJECUCION;
  if (/liquid/i.test(raw)) return ETAPAS.LIQUIDACION;
  if (/archiv/i.test(raw)) return ETAPAS.ARCHIVO;
  if (/finaliz/i.test(raw)) return ETAPAS.FINALIZADO;
  if (/cotiz/i.test(raw)) return ETAPAS.RECEPCION_COTIZACIONES;
  return null;
}

/** Adaptador: `estado` de negocio → etapa operativa (mirror de trazabilidad). */
export function mapEstadoNegocioToEtapa(estado) {
  const e = String(estado || '').trim();
  if (!e || e === 'Registrado') return ETAPAS.REGISTRADO;
  if (/observado program/i.test(e)) return ETAPAS.PROGRAMACION;
  if (/en programaci/i.test(e)) return ETAPAS.PROGRAMACION;
  if (/aprobad.*program/i.test(e)) return ETAPAS.ACTOS_PREPARATORIOS;
  if (e === 'Aprobado DEC') return ETAPAS.PROGRAMACION;
  if (/observado dec/i.test(e)) return ETAPAS.PROGRAMACION;
  if (e === 'Aprobado') return ETAPAS.DEC;
  if (e === 'Observado') return ETAPAS.EVALUACION;
  if (/tr[aá]mite/i.test(e)) return ETAPAS.EVALUACION;
  if (e === 'Programado') return ETAPAS.ACTOS_PREPARATORIOS;
  if (/actos prep|coordinaci[oó]n cm/i.test(e)) return ETAPAS.ACTOS_PREPARATORIOS;
  if (/observado actos|observado coordin/i.test(e)) return ETAPAS.ACTOS_PREPARATORIOS;
  if (/invitaci/i.test(e)) return ETAPAS.INVITACIONES;
  if (/cotizaci/i.test(e)) return ETAPAS.RECEPCION_COTIZACIONES;
  if (/cuadro comp/i.test(e)) return ETAPAS.CUADRO_COMPARATIVO;
  if (/\bccp\b/i.test(e) || /en ccp/i.test(e)) return ETAPAS.CCP;
  if (/ejecuci/i.test(e)) return ETAPAS.EJECUCION;
  if (/finaliz/i.test(e)) return ETAPAS.FINALIZADO;
  return ETAPAS.REGISTRADO;
}

export function obtenerMetaEtapa(etapaCode) {
  const code = normalizarEtapa(etapaCode);
  return code ? { code, ...ETAPA_META[code] } : null;
}

export function etapaToModuloLabel(etapaCode) {
  return obtenerMetaEtapa(etapaCode)?.submodulo || String(etapaCode || '');
}

export function etapaToEstadoCore(etapaCode) {
  return obtenerMetaEtapa(etapaCode)?.estadoCore || null;
}

export function resolveEtapaFromRow(row = {}) {
  const explicit = normalizarEtapa(row.estado_actual || row.estadoActual);
  if (explicit) return explicit;
  const sub = normalizarEtapa(row.sub_modulo_actual || row.subModuloActual);
  if (sub) return sub;
  return mapEstadoNegocioToEtapa(row.estado);
}

export function resolveEstadoNegocioFromRow(row = {}) {
  const estado = String(row.estado || '').trim();
  const etapa = String(row.estado_actual || row.estadoActual || '').toUpperCase();
  if (etapa && /^observ/i.test(estado)) {
    const map = {
      REGISTRADO: 'Registrado',
      EVALUACION: 'En tramite de aprobación',
      DEC: 'Aprobado',
      PROGRAMACION: 'En Programación',
      ACTOS_PREPARATORIOS: 'Programado',
      INVITACIONES: 'En Invitaciones',
      RECEPCION_COTIZACIONES: 'En Cotizaciones',
      CUADRO_COMPARATIVO: 'En Cuadro Comparativo',
      CCP: 'En CCP',
      EJECUCION: 'En Ejecución',
      FINALIZADO: 'Finalizado',
    };
    if (map[etapa]) return map[etapa];
  }
  return estado || 'Registrado';
}

export function resolveModuloActualFromRow(row = {}) {
  const sub = String(row.sub_modulo_actual || row.subModuloActual || '').trim();
  if (sub) return sub;
  return etapaToModuloLabel(resolveEtapaFromRow(row));
}

export function resolveResponsableFromRow(row = {}) {
  const resp = String(row.responsable_actual || row.responsableActual || row.responsable || '').trim();
  if (resp) return resp;
  return obtenerMetaEtapa(resolveEtapaFromRow(row))?.responsableDefault || '—';
}

export function parseHistorialEstadosReadOnly(raw) {
  if (!raw) return Object.freeze([]);
  if (Array.isArray(raw)) return Object.freeze(raw.slice());
  try {
    const parsed = JSON.parse(raw);
    return Object.freeze(Array.isArray(parsed) ? parsed.slice() : []);
  } catch (_) {
    return Object.freeze([]);
  }
}

export {
  ESTADOS,
  ESTADOS_REQUERIMIENTO,
  ESTADOS_LIST,
  FLUJO_REQUERIMIENTO,
  esEstadoValido,
  normalizarEstado,
};

export default {
  ETAPAS,
  ETAPA_META,
  FLUJO_ETAPAS,
  normalizarEtapa,
  mapEstadoNegocioToEtapa,
  resolveEtapaFromRow,
  resolveModuloActualFromRow,
  resolveResponsableFromRow,
  resolveEstadoNegocioFromRow,
  parseHistorialEstadosReadOnly,
};

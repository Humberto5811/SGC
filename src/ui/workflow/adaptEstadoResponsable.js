/**
 * RC8.6B / RC8.8.1 — Único adapter de compatibilidad visual Estado/Responsable.
 * Prioriza row.estado_responsable_vigente.
 * Sin ERV / canonicalMissing: NUNCA reinfiere por evidencia ni legacy.
 */
import { getEstadoCatalogEntry } from './estadoCatalogo.js';

export const TIPO_RESPONSABLE_UI = Object.freeze({
  PERSONA: 'PERSONA',
  UNIDAD: 'UNIDAD',
  PENDIENTE: 'PENDIENTE',
});

const PENDIENTE_LABEL = 'Pendiente de asignación';
const ESTADO_NO_DISPONIBLE = 'Estado no disponible';

function escStr(v) {
  const s = String(v == null ? '' : v).trim();
  return s;
}

function isBareNumericId(s) {
  return /^\d+$/.test(escStr(s));
}

function warnMissingErv(row) {
  try {
    const rid = row?.id ?? row?.requerimiento_id ?? row?.requerimientoId ?? '?';
    const msg = `[RC8.8.1] estado_responsable_vigente ausente (req=${rid}) — no reinferir; usar reconciliación`;
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
      console.warn(msg);
    } else if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
      console.warn(msg);
    }
  } catch (_) { /* ignore */ }
}

/**
 * Prioridad display PERSONA:
 * 1. responsableNombre (no numérico puro)
 * 2. responsableUsername (no numérico puro)
 * 3. Usuario #ID
 * 4. Pendiente de asignación
 */
function resolvePersonaDisplay({ responsableNombre, responsableUsername, responsableUsuarioId }) {
  const nombre = escStr(responsableNombre);
  const username = escStr(responsableUsername);
  const uid = responsableUsuarioId != null && Number.isFinite(Number(responsableUsuarioId))
    ? Number(responsableUsuarioId)
    : null;
  const nombreOk = nombre && !isBareNumericId(nombre);
  const usernameOk = username && !isBareNumericId(username);
  if (nombreOk) {
    return {
      responsableNombre: nombre,
      responsableUsername: usernameOk ? username : '',
      responsableDisplay: nombre,
    };
  }
  if (usernameOk) {
    return {
      responsableNombre: '',
      responsableUsername: username,
      responsableDisplay: username,
    };
  }
  if (uid) {
    const tech = `Usuario #${uid}`;
    return {
      responsableNombre: tech,
      responsableUsername: '',
      responsableDisplay: tech,
    };
  }
  return {
    responsableNombre: '',
    responsableUsername: '',
    responsableDisplay: PENDIENTE_LABEL,
  };
}

function looksLikeCentro(s) {
  const t = escStr(s).toLowerCase();
  if (!t) return false;
  return /^cncc\b/.test(t) || /\bcentro de (costo|costos|gesti)/i.test(t);
}

function resolveFromErv(erv) {
  if (!erv || typeof erv !== 'object') return null;
  if (erv.canonicalMissing === true) return null;

  const tipoRaw = escStr(erv.responsableTipo || erv.responsable_tipo).toUpperCase();
  let responsableTipo = TIPO_RESPONSABLE_UI.PENDIENTE;
  if (tipoRaw === 'PENDIENTE') {
    responsableTipo = TIPO_RESPONSABLE_UI.PENDIENTE;
  } else if (tipoRaw === 'PERSONA') {
    responsableTipo = TIPO_RESPONSABLE_UI.PERSONA;
  } else if (tipoRaw === 'UNIDAD') {
    responsableTipo = TIPO_RESPONSABLE_UI.UNIDAD;
  } else if (erv.responsableUsuarioId || erv.responsable_usuario_id || erv.responsableNombre || erv.responsableUsername) {
    responsableTipo = TIPO_RESPONSABLE_UI.PERSONA;
  } else if (erv.responsableUnidad || erv.responsable_unidad) {
    responsableTipo = TIPO_RESPONSABLE_UI.UNIDAD;
  }

  let responsableUnidad = escStr(erv.responsableUnidad || erv.responsable_unidad) || '';
  if (responsableTipo === TIPO_RESPONSABLE_UI.PENDIENTE) {
    responsableUnidad = '';
  }

  const estadoCodigo = escStr(erv.estadoCodigo || erv.estado_codigo) || '';
  if (!estadoCodigo && !escStr(erv.estadoLabel || erv.estado_label)) {
    // ERV vacío sin marca explícita → tratar como missing
    return null;
  }

  return {
    estadoCodigo,
    estadoLabel: escStr(erv.estadoLabel || erv.estado_label) || '',
    etapaCodigo: escStr(erv.etapaCodigo || erv.etapa_codigo) || '',
    etapaLabel: escStr(erv.etapaLabel || erv.etapa_label) || '',
    responsableTipo,
    responsableUsuarioId: erv.responsableUsuarioId ?? erv.responsable_usuario_id ?? null,
    responsableUsername: escStr(erv.responsableUsername || erv.responsable_username) || '',
    responsableNombre: escStr(erv.responsableNombre || erv.responsable_nombre) || '',
    responsableUnidad,
    responsableFuente: escStr(erv.responsableFuente || erv.responsable_fuente) || '',
    actualizadoAt: erv.actualizadoAt || erv.actualizado_at || null,
    fuente: 'estado_responsable_vigente',
    canonicalMissing: false,
  };
}

/** Fallback seguro RC8.8.1 — sin evidencia / legacy. */
function fallbackCanonicalMissing(row) {
  warnMissingErv(row);
  const catalog = getEstadoCatalogEntry('', ESTADO_NO_DISPONIBLE);
  return {
    estadoCodigo: '',
    estadoLabel: ESTADO_NO_DISPONIBLE,
    etapaCodigo: '',
    etapaLabel: '',
    responsableTipo: TIPO_RESPONSABLE_UI.PENDIENTE,
    responsableUsuarioId: null,
    responsableUsername: '',
    responsableNombre: '',
    responsableUnidad: '',
    responsableFuente: 'canonical_missing',
    actualizadoAt: null,
    fuente: 'canonical_missing',
    canonicalMissing: true,
    categoria: catalog.categoria || 'DESCONOCIDO',
    icono: catalog.icono,
    tooltip: ESTADO_NO_DISPONIBLE,
    responsableDisplay: PENDIENTE_LABEL,
  };
}

/**
 * @param {object} row
 * @returns {object} contrato normalizado para componentes visuales
 */
export function adaptEstadoResponsable(row = {}) {
  const fromErv = resolveFromErv(row?.estado_responsable_vigente);
  if (!fromErv) {
    return fallbackCanonicalMissing(row || {});
  }

  const catalog = getEstadoCatalogEntry(fromErv.estadoCodigo, fromErv.estadoLabel);
  const estadoCodigo = fromErv.estadoCodigo || catalog.codigo;
  const estadoLabel = fromErv.estadoLabel || catalog.label || ESTADO_NO_DISPONIBLE;

  let { responsableTipo, responsableNombre, responsableUsername, responsableUnidad } = fromErv;

  if (responsableTipo === TIPO_RESPONSABLE_UI.PERSONA) {
    const disp = resolvePersonaDisplay({
      responsableNombre,
      responsableUsername,
      responsableUsuarioId: fromErv.responsableUsuarioId,
    });
    responsableNombre = disp.responsableNombre;
    responsableUsername = disp.responsableUsername;
    if (!disp.responsableDisplay || disp.responsableDisplay === PENDIENTE_LABEL) {
      responsableTipo = responsableUnidad ? TIPO_RESPONSABLE_UI.UNIDAD : TIPO_RESPONSABLE_UI.PENDIENTE;
    } else if (looksLikeCentro(responsableNombre)) {
      responsableTipo = TIPO_RESPONSABLE_UI.PENDIENTE;
      responsableNombre = '';
      responsableUsername = '';
    }
  }

  let responsableDisplay = PENDIENTE_LABEL;
  if (responsableTipo === TIPO_RESPONSABLE_UI.PERSONA) {
    responsableDisplay = resolvePersonaDisplay({
      responsableNombre,
      responsableUsername,
      responsableUsuarioId: fromErv.responsableUsuarioId,
    }).responsableDisplay;
    if (responsableDisplay === PENDIENTE_LABEL) {
      responsableTipo = TIPO_RESPONSABLE_UI.PENDIENTE;
    }
  } else if (responsableTipo === TIPO_RESPONSABLE_UI.UNIDAD) {
    responsableDisplay = responsableUnidad || PENDIENTE_LABEL;
    if (!responsableUnidad) {
      responsableTipo = TIPO_RESPONSABLE_UI.PENDIENTE;
      responsableDisplay = PENDIENTE_LABEL;
    }
  }

  return {
    estadoCodigo,
    estadoLabel,
    etapaCodigo: fromErv.etapaCodigo || '',
    etapaLabel: fromErv.etapaLabel || '',
    responsableTipo,
    responsableUsuarioId: fromErv.responsableUsuarioId,
    responsableUsername,
    responsableNombre,
    responsableUnidad,
    responsableFuente: fromErv.responsableFuente,
    responsableDisplay,
    actualizadoAt: fromErv.actualizadoAt,
    categoria: catalog.categoria,
    icono: catalog.icono,
    tooltip: catalog.tooltip || estadoLabel,
    fuente: fromErv.fuente,
    canonicalMissing: false,
  };
}

export { ESTADO_NO_DISPONIBLE, PENDIENTE_LABEL };
export default { adaptEstadoResponsable, TIPO_RESPONSABLE_UI, PENDIENTE_LABEL, ESTADO_NO_DISPONIBLE };

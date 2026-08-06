/**
 * RC8.6B — Único adapter de compatibilidad visual Estado/Responsable.
 * Prioriza row.estado_responsable_vigente; fallback legacy SOLO aquí.
 * Nunca infiere persona desde created_by / usuario_modificacion / centro / submódulo.
 */
import { getEstadoCatalogEntry } from './estadoCatalogo.js';
import { normalizeEstadoCode, getLabelEstado } from '../../../shared/estadoExpedienteCatalog.js';

export const TIPO_RESPONSABLE_UI = Object.freeze({
  PERSONA: 'PERSONA',
  UNIDAD: 'UNIDAD',
  PENDIENTE: 'PENDIENTE',
});

const PENDIENTE_LABEL = 'Pendiente de asignación';

function escStr(v) {
  const s = String(v == null ? '' : v).trim();
  return s;
}

function isBareNumericId(s) {
  return /^\d+$/.test(escStr(s));
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
  const tipoRaw = escStr(erv.responsableTipo || erv.responsable_tipo).toUpperCase();
  let responsableTipo = TIPO_RESPONSABLE_UI.PENDIENTE;
  if (tipoRaw === 'PERSONA') responsableTipo = TIPO_RESPONSABLE_UI.PERSONA;
  else if (tipoRaw === 'UNIDAD') responsableTipo = TIPO_RESPONSABLE_UI.UNIDAD;
  else if (erv.responsableUsuarioId || erv.responsable_usuario_id || erv.responsableNombre || erv.responsableUsername) {
    responsableTipo = TIPO_RESPONSABLE_UI.PERSONA;
  } else if (erv.responsableUnidad || erv.responsable_unidad) {
    responsableTipo = TIPO_RESPONSABLE_UI.UNIDAD;
  }

  return {
    estadoCodigo: escStr(erv.estadoCodigo || erv.estado_codigo) || '',
    estadoLabel: escStr(erv.estadoLabel || erv.estado_label) || '',
    etapaCodigo: escStr(erv.etapaCodigo || erv.etapa_codigo) || '',
    etapaLabel: escStr(erv.etapaLabel || erv.etapa_label) || '',
    responsableTipo,
    responsableUsuarioId: erv.responsableUsuarioId ?? erv.responsable_usuario_id ?? null,
    responsableUsername: escStr(erv.responsableUsername || erv.responsable_username) || '',
    responsableNombre: escStr(erv.responsableNombre || erv.responsable_nombre) || '',
    responsableUnidad: escStr(erv.responsableUnidad || erv.responsable_unidad) || '',
    responsableFuente: escStr(erv.responsableFuente || erv.responsable_fuente) || '',
    actualizadoAt: erv.actualizadoAt || erv.actualizado_at || null,
    fuente: 'estado_responsable_vigente',
  };
}

/**
 * Fallback legacy controlado — exclusivo de este archivo.
 * No usa created_by, usuario_modificacion, centro (responsable CNCC) ni submódulo como persona.
 */
function fallbackLegacy(row) {
  const estadoCodigo = normalizeEstadoCode(row?.estado)
    || escStr(row?.estado_actual || row?.estadoActual).toUpperCase()
    || '';
  const estadoLabel = getLabelEstado(estadoCodigo)
    || escStr(row?.estado)
    || escStr(row?.estado_actual_texto || row?.estadoActualTexto)
    || '';
  const etapaCodigo = escStr(row?.estado_actual || row?.estadoActual).toUpperCase() || estadoCodigo;
  const etapaLabel = escStr(row?.sub_modulo_actual || row?.subModuloActual || row?.estado_actual_texto) || '';

  // responsable_actual / responsableActual ya enriquecidos — nunca row.responsable (centro)
  const rawResp = escStr(row?.responsableActual || row?.responsable_actual);
  let responsableTipo = TIPO_RESPONSABLE_UI.PENDIENTE;
  let responsableNombre = '';
  let responsableUnidad = '';
  let responsableUsername = '';
  let responsableUsuarioId = null;

  if (!rawResp || rawResp === '—' || /pendiente de asignaci/i.test(rawResp)) {
    responsableTipo = TIPO_RESPONSABLE_UI.PENDIENTE;
  } else if (/^\d+$/.test(rawResp)) {
    // ID numérico legacy en responsable_actual — no presentar como nombre
    responsableTipo = TIPO_RESPONSABLE_UI.PERSONA;
    responsableUsuarioId = Number(rawResp);
    const disp = resolvePersonaDisplay({ responsableUsuarioId });
    responsableNombre = disp.responsableNombre;
    responsableUsername = disp.responsableUsername;
  } else if (/coordinador|programador|especialista|director|gerente|dec\b|analista|almac[eé]n|usuario au|área usuaria|area usuaria/i.test(rawResp)
    || /coordinaci[oó]n cm|programaci[oó]n|invitaciones|cuadro|validaci|recepci[oó]n|tesorer|pagos/i.test(rawResp)) {
    responsableTipo = TIPO_RESPONSABLE_UI.UNIDAD;
    responsableUnidad = rawResp;
  } else {
    responsableTipo = TIPO_RESPONSABLE_UI.PERSONA;
    responsableNombre = rawResp;
  }

  return {
    estadoCodigo,
    estadoLabel,
    etapaCodigo,
    etapaLabel,
    responsableTipo,
    responsableUsuarioId,
    responsableUsername,
    responsableNombre,
    responsableUnidad,
    responsableFuente: 'legacy_fallback',
    actualizadoAt: row?.fecha_estado_actual || row?.fechaEstadoActual || row?.updated_at || null,
    fuente: 'legacy_fallback',
  };
}

/**
 * @param {object} row
 * @returns {object} contrato normalizado para componentes visuales
 */
export function adaptEstadoResponsable(row = {}) {
  const fromErv = resolveFromErv(row?.estado_responsable_vigente);
  const base = fromErv || fallbackLegacy(row || {});

  const catalog = getEstadoCatalogEntry(base.estadoCodigo, base.estadoLabel);
  const estadoCodigo = catalog.codigo;
  const estadoLabel = catalog.label;

  let { responsableTipo, responsableNombre, responsableUsername, responsableUnidad } = base;

  if (responsableTipo === TIPO_RESPONSABLE_UI.PERSONA) {
    const disp = resolvePersonaDisplay({
      responsableNombre,
      responsableUsername,
      responsableUsuarioId: base.responsableUsuarioId,
    });
    responsableNombre = disp.responsableNombre;
    responsableUsername = disp.responsableUsername;
    // Defensa: nunca presentar centro/submódulo como persona
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
      responsableUsuarioId: base.responsableUsuarioId,
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
    etapaCodigo: base.etapaCodigo || '',
    etapaLabel: base.etapaLabel || '',
    responsableTipo,
    responsableUsuarioId: base.responsableUsuarioId,
    responsableUsername,
    responsableNombre,
    responsableUnidad,
    responsableFuente: base.responsableFuente,
    responsableDisplay,
    actualizadoAt: base.actualizadoAt,
    categoria: catalog.categoria,
    icono: catalog.icono,
    tooltip: catalog.tooltip,
    fuente: base.fuente,
  };
}

export default { adaptEstadoResponsable, TIPO_RESPONSABLE_UI, PENDIENTE_LABEL };

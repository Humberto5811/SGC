/**
 * Capa FE de lectura de estados de expediente (fase 1).
 * Fuente de verdad: catálogo / documento funcional DETALLE DE ESTADOS.
 * Compatibilidad legado → canónico solo aquí (no en vistas).
 */
import {
  normalizeEstadoCode,
  getEstadoDef,
  getCatalogoEstados,
} from '../../shared/estadoExpedienteCatalog.js';

function normRaw(valor) {
  return String(valor ?? '').trim();
}

function normUpper(valor) {
  return normRaw(valor).toUpperCase();
}

/** Quita tildes para emparejar textos de negocio legados. */
function stripDiacritics(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Textos de negocio aún presentes en DB → código canónico del catálogo.
 * No inventa códigos: solo aliases legados de requerimientos / DEC / programación.
 */
const LEGADO_NEGOCIO_A_CODIGO = Object.freeze({
  REGISTRADO: 'REQUERIMIENTO_REGISTRADO',
  'EN TRAMITE DE APROBACION': 'REQUERIMIENTO_EN_EVALUACION',
  'EN TRAMITE': 'REQUERIMIENTO_EN_EVALUACION',
  // "Aprobado" sin etapa DEC → aprobado en evaluación (canónico)
  APROBADO: 'REQUERIMIENTO_APROBADO',
  'APROBADO DEC': 'REQUERIMIENTO_APROBADO_DEC',
  'EN PROGRAMACION': 'EN_PROGRAMACION',
  'APROBADO PROGRAMACION': 'PROGRAMACION_APROBADA',
  'APROBADO PROGRAMACION.': 'PROGRAMACION_APROBADA',
  PROGRAMADO: 'PROGRAMACION_APROBADA',
  OBSERVADO: 'OBSERVADO',
  'OBSERVADO DEC': 'REQUERIMIENTO_EN_DEC',
  'OBSERVADO PROGRAMACION': 'EN_PROGRAMACION',
});

function mapLegadoNegocio(raw, etapaHint = '') {
  const key = stripDiacritics(normUpper(raw)).replace(/\s+/g, ' ').trim();
  if (!key) return '';

  // Contexto DEC: columna negocio "Aprobado" = pendiente de aprobar en DEC
  if (key === 'APROBADO' && etapaHint === 'DEC') {
    return 'REQUERIMIENTO_EN_DEC';
  }

  return LEGADO_NEGOCIO_A_CODIGO[key] || '';
}

/**
 * Etapa workflow del expediente.
 * Prioridad: estado_actual → estadoActual → estadoVigente.etapa
 */
export function getEtapaActual(r = {}) {
  const fromVigente = r?.estadoVigente && typeof r.estadoVigente === 'object'
    ? r.estadoVigente.etapa
    : '';
  return normUpper(r.estado_actual || r.estadoActual || fromVigente || '');
}

/**
 * Código canónico del estado de expediente.
 * Prioridad: estado_codigo → estado_vigente → estadoVigente.codigo → estado.
 * Ignora null / undefined / '' / solo espacios y sigue al siguiente campo.
 * Códigos canónicos del catálogo no se reescriben con aliases de texto legado.
 */
export function getEstadoCodigo(r = {}) {
  const fromVigenteObj = r?.estadoVigente && typeof r.estadoVigente === 'object'
    ? r.estadoVigente.codigo
    : '';
  const candidatos = [
    r.estado_codigo,
    r.estado_vigente,
    fromVigenteObj,
    r.estado,
  ];

  const etapa = getEtapaActual(r);

  for (const c of candidatos) {
    if (c == null) continue;
    const raw = normRaw(c);
    if (!raw) continue;

    const asCode = normUpper(raw).replace(/\s+/g, '_');
    const fromCatalog = normalizeEstadoCode(raw);

    // Código canónico exacto del catálogo → no reescribir con aliases de negocio
    if (fromCatalog && fromCatalog === asCode && getEstadoDef(fromCatalog)) {
      return fromCatalog;
    }

    // Solo textos de negocio legados (p.ej. "En trámite…", "Aprobado")
    const legado = mapLegadoNegocio(raw, etapa);
    if (legado) return legado;

    // Aliases técnicos del catálogo (p.ej. REGISTRADO → REQUERIMIENTO_REGISTRADO)
    if (fromCatalog) return fromCatalog;
  }
  return '';
}

export function estaEnEtapa(r = {}, etapa) {
  const actual = getEtapaActual(r);
  if (!actual) return false;
  if (Array.isArray(etapa)) {
    return etapa.map((e) => normUpper(e)).includes(actual);
  }
  return actual === normUpper(etapa);
}

export function estaEnEstado(r = {}, codigo) {
  const actual = getEstadoCodigo(r);
  if (!actual) return false;
  if (Array.isArray(codigo)) {
    return codigo.map((c) => normalizeEstadoCode(c) || normUpper(c)).includes(actual);
  }
  const target = normalizeEstadoCode(codigo) || normUpper(codigo);
  return actual === target;
}

/**
 * True si el estado canónico actual tiene prioridad mayor que la etapa indicada
 * (según prioridades del catálogo funcional). No inventa orden propio.
 */
export function yaSuperoEtapa(r = {}, etapa) {
  const target = normUpper(etapa);
  if (!target) return false;
  const codigo = getEstadoCodigo(r);
  const def = getEstadoDef(codigo);
  if (!def || def.prioridad == null || def.prioridad <= 0) return false;

  const enEtapa = getCatalogoEstados().filter((e) => normUpper(e.etapa) === target);
  if (!enEtapa.length) return false;
  const maxP = Math.max(...enEtapa.map((e) => Number(e.prioridad) || 0));
  return Number(def.prioridad) > maxP;
}

/** Registro: aún accionable en bandeja Registro (crear/derivar/editar). */
export function estaEnRegistroAccionable(r = {}) {
  if (estaEnEtapa(r, 'REGISTRADO')) return true;
  if (estaEnEstado(r, 'REQUERIMIENTO_REGISTRADO')) return true;
  // Legado: solo texto Registrado sin etapa
  const raw = normRaw(r.estado);
  if (!getEtapaActual(r) && mapLegadoNegocio(raw) === 'REQUERIMIENTO_REGISTRADO') return true;
  return false;
}

/** Evaluación: pendiente de acción en bandeja Evaluación. */
export function estaEnEvaluacionAccionable(r = {}) {
  if (estaEnEstado(r, 'REQUERIMIENTO_EN_EVALUACION')) return true;
  if (estaEnEtapa(r, 'EVALUACION') && !estaEnEstado(r, 'REQUERIMIENTO_APROBADO')) {
    // Etapa EVALUACION con código vacío o aún en evaluación
    const codigo = getEstadoCodigo(r);
    if (!codigo || codigo === 'REQUERIMIENTO_EN_EVALUACION') return true;
    // Observado en evaluación (situación) — sigue accionable para observar/aprobar tras subsanar
    if (codigo === 'OBSERVADO' && estaEnEtapa(r, 'EVALUACION')) return true;
  }
  return false;
}

/**
 * Ya aprobado en evaluación o avanzó a DEC (no debe aprobarse de nuevo en Evaluación).
 * El alias contextual "Aprobado" se resuelve en getEstadoCodigo (no aquí).
 *
 * Decisión caso sin etapa + estado "Aprobado":
 * getEstadoCodigo → REQUERIMIENTO_APROBADO (nunca REQUERIMIENTO_EN_DEC sin etapa DEC).
 */
export function estaAprobadoEnEvaluacion(r = {}) {
  return estaEnEstado(r, [
    'REQUERIMIENTO_APROBADO',
    'REQUERIMIENTO_EN_DEC',
    'REQUERIMIENTO_APROBADO_DEC',
  ]);
}

export { LEGADO_NEGOCIO_A_CODIGO };

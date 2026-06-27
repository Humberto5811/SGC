// Bandejas del flujo de requerimientos — visibilidad según etapa alcanzada.
import { requerimientosService } from '../services/requerimientosService.js';
import {
  enrichReqRow,
  mapEstadoToUbicacion,
  resolveEstadoNegocioFromRow,
  resolveUbicacionExpediente,
} from './trazabilidad.js';
import { getUltimaSubsanacionDestino } from './observacionDestino.js';

export const ETAPAS_FLUJO = ['REGISTRADO', 'EVALUACION', 'DEC', 'PROGRAMACION', 'ACTOS_PREPARATORIOS'];

function etapaIndex(code) {
  const i = ETAPAS_FLUJO.indexOf(String(code || '').toUpperCase());
  return i >= 0 ? i : 0;
}

function parsePayload(req) {
  let payload = req?.payload;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload || '{}'); } catch (_) { payload = {}; }
  }
  return payload || {};
}

function parseHistorial(req) {
  let h = req?.historial_estados || req?.historialEstados;
  if (typeof h === 'string') {
    try { h = JSON.parse(h || '[]'); } catch (_) { h = []; }
  }
  return Array.isArray(h) ? h : [];
}

function registrarEtapa(set, code) {
  const c = String(code || '').toUpperCase();
  if (c) set.add(c);
}

/** Etapas del flujo que el expediente ya alcanzó. */
export function etapasAlcanzadas(req) {
  const etapas = new Set(['REGISTRADO']);
  const estado = resolveEstadoNegocioFromRow(req);
  const ubic = resolveUbicacionExpediente(req);

  parseHistorial(req).forEach((entry) => {
    registrarEtapa(etapas, entry.estado || entry.etapa);
  });

  let movs = req?.historial_movimientos || req?.historialMovimientos;
  if (typeof movs === 'string') {
    try { movs = JSON.parse(movs || '[]'); } catch (_) { movs = []; }
  }
  if (Array.isArray(movs)) {
    movs.forEach((m) => registrarEtapa(etapas, m.etapa));
  }

  const payload = parsePayload(req);
  if ((payload.historial_evaluacion || []).some((h) => h.tipo === 'derivacion' || h.tipo === 'aprobacion' || h.tipo === 'observacion')) {
    registrarEtapa(etapas, 'EVALUACION');
  }
  if ((payload.historial_dec || []).length) registrarEtapa(etapas, 'DEC');
  if ((payload.historial_programacion || []).length) registrarEtapa(etapas, 'PROGRAMACION');
  if ((payload.historial_actos || []).length) registrarEtapa(etapas, 'ACTOS_PREPARATORIOS');

  registrarEtapa(etapas, ubic);
  registrarEtapa(etapas, mapEstadoToUbicacion(estado));

  if (/tr[aá]mite/i.test(estado)) registrarEtapa(etapas, 'EVALUACION');
  if (estado === 'Aprobado') {
    registrarEtapa(etapas, 'EVALUACION');
    registrarEtapa(etapas, 'DEC');
  }
  if (/^Aprobado DEC$/i.test(estado) || /observado dec/i.test(estado)) {
    registrarEtapa(etapas, 'EVALUACION');
    registrarEtapa(etapas, 'DEC');
  }
  if (/programaci/i.test(estado) || estado === 'Programado') {
    registrarEtapa(etapas, 'PROGRAMACION');
  }

  return etapas;
}

export function maxEtapaAlcanzadaIndex(req) {
  let max = 0;
  etapasAlcanzadas(req).forEach((e) => {
    const i = etapaIndex(e);
    if (i > max) max = i;
  });
  return max;
}

/** ¿Fue enviado a Evaluación (solicitar aprobación)? */
export function fueEnviadoAEvaluacion(req) {
  const payload = parsePayload(req);
  if ((payload.historial_evaluacion || []).some((h) => h.tipo === 'derivacion')) return true;
  if (parseHistorial(req).some((e) => String(e.estado || e.etapa || '').toUpperCase() === 'EVALUACION')) return true;
  return /tr[aá]mite/i.test(resolveEstadoNegocioFromRow(req))
    || (resolveEstadoNegocioFromRow(req) === 'Observado' && resolveUbicacionExpediente(req) === 'EVALUACION');
}

/** Registro → Programación sin pasar por Evaluación ni DEC. */
export function saltoDirectoAProgramacion(req) {
  const etapas = etapasAlcanzadas(req);
  if (!etapas.has('PROGRAMACION')) return false;
  if (etapas.has('DEC')) return false;
  if (fueEnviadoAEvaluacion(req)) return false;

  const dest = getUltimaSubsanacionDestino(req);
  if (dest && /programaci/i.test(`${dest.submodulo} ${dest.etapa}`)) return true;

  return resolveUbicacionExpediente(req) === 'PROGRAMACION'
    && !fueEnviadoAEvaluacion(req);
}

/** Evaluación: solo los enviados a evaluación; excluye los derivados a Programación sin DEC. */
export function requerimientoVisibleEnEvaluacion(req) {
  if (!req) return false;
  if (saltoDirectoAProgramacion(req)) return false;
  if (!fueEnviadoAEvaluacion(req)) return false;

  const dest = getUltimaSubsanacionDestino(req);
  const ubic = resolveUbicacionExpediente(req);
  if (dest && /programaci/i.test(`${dest.submodulo} ${dest.etapa}`) && ubic === 'PROGRAMACION') {
    return false;
  }

  return maxEtapaAlcanzadaIndex(req) >= etapaIndex('EVALUACION');
}

/** DEC: solo los aprobados en evaluación y derivados a DEC. */
export function requerimientoVisibleEnDEC(req) {
  if (!req) return false;
  if (saltoDirectoAProgramacion(req)) return false;
  return maxEtapaAlcanzadaIndex(req) >= etapaIndex('DEC');
}

/** Programación: bandeja maestra — todo expediente que pasó por Programación. */
export function requerimientoVisibleEnProgramacion(req) {
  if (!req) return false;
  if (etapasAlcanzadas(req).has('PROGRAMACION')) return true;
  const payload = parsePayload(req);
  if (Array.isArray(payload.historial_programacion) && payload.historial_programacion.length) return true;
  const estado = String(req?.estado || '').trim();
  if (['Aprobado DEC', 'Observado Programación', 'En Programación', 'Aprobado Programación', 'Programado'].includes(estado)) {
    return true;
  }
  return resolveUbicacionExpediente(req) === 'PROGRAMACION';
}

export function sortRequerimientosByCodigo(rows) {
  return (rows || []).slice().sort((a, b) => {
    const getNum = (r) => {
      if (r?.codigo) {
        const m = String(r.codigo).match(/(\d+)/);
        if (m) return Number(m[1]);
      }
      return Number(r?.id) || 0;
    };
    return getNum(a) - getNum(b);
  });
}

export async function fetchAllRequerimientosBandeja(filters = {}) {
  const resp = await requerimientosService.listConDetalles({ pageSize: 500, ...filters });
  return sortRequerimientosByCodigo(((resp && resp.data) || []).map(enrichReqRow));
}

export async function fetchBandejaEvaluacion(filters = {}) {
  const rows = await fetchAllRequerimientosBandeja(filters);
  return rows.filter(requerimientoVisibleEnEvaluacion);
}

export async function fetchBandejaDEC(filters = {}) {
  try {
    const { contratacionesService } = await import('../services/contratacionesService.js');
    const resp = await contratacionesService.listDEC({ pageSize: 500, ...filters });
    return sortRequerimientosByCodigo(((resp && resp.data) || []).map(enrichReqRow));
  } catch (_) {
    const rows = await fetchAllRequerimientosBandeja(filters);
    return rows.filter(requerimientoVisibleEnDEC);
  }
}

export async function fetchBandejaProgramacion(filters = {}) {
  try {
    const { contratacionesService } = await import('../services/contratacionesService.js');
    const resp = await contratacionesService.listProgramacion({ pageSize: 500, ...filters });
    let list = sortRequerimientosByCodigo(((resp && resp.data) || []).map(enrichReqRow));
    return list;
  } catch (_) {
    const rows = await fetchAllRequerimientosBandeja(filters);
    return rows.filter(requerimientoVisibleEnProgramacion);
  }
}

/** Actos / Coordinación CM: tablero de supervisión con trazabilidad completa. */
export function requerimientoVisibleEnActosPreparatorios(req) {
  if (!req) return false;
  const etapa = String(req?.estado_actual || req?.estadoActual || '').toUpperCase();
  const etapasCm = new Set([
    'ACTOS_PREPARATORIOS', 'INVITACIONES', 'RECEPCION_COTIZACIONES',
    'CUADRO_COMPARATIVO', 'CCP', 'EJECUCION', 'FINALIZADO', 'OBSERVADO',
  ]);
  if (etapasCm.has(etapa)) return true;
  if (resolveUbicacionExpediente(req) === 'ACTOS_PREPARATORIOS') return true;
  const estado = String(req?.estado || '').trim();
  if (estado === 'Programado' || /^Aprobado Programaci/i.test(estado)) return true;
  try {
    const p = typeof req.payload === 'string' ? JSON.parse(req.payload || '{}') : (req.payload || {});
    if (Array.isArray(p.historial_actos) && p.historial_actos.length) return true;
  } catch (_) {}
  return false;
}

/** Enriquece filas con código de paquete asociado (matriz consolidación). */
export async function enrichActosRowsWithPaquete(rows) {
  try {
    const { programacionService } = await import('../services/programacionService.js');
    const matriz = await programacionService.getMatrizConsolidacion();
    const map = new Map();
    (matriz?.paquetes || []).forEach((g) => {
      const codigo = g.paquete?.codigo_paquete;
      (g.filas || []).forEach((f) => {
        if (f.requerimiento_id && codigo) map.set(f.requerimiento_id, codigo);
      });
    });
    return (rows || []).map((r) => ({
      ...r,
      codigo_paquete: map.get(r.id) || r.codigo_paquete || null,
    }));
  } catch (_) {
    return rows || [];
  }
}

export async function fetchBandejaActosPreparatorios(filters = {}, options = {}) {
  let list = [];
  try {
    const { contratacionesService } = await import('../services/contratacionesService.js');
    const apiFilters = { pageSize: 500, ...filters };
    if (filters.mi_equipo) apiFilters.mi_equipo = filters.mi_equipo;
    if (filters.solo_mios) apiFilters.solo_mios = filters.solo_mios;
    const resp = await contratacionesService.listActos(apiFilters);
    list = sortRequerimientosByCodigo(((resp && resp.data) || []).map(enrichReqRow));
  } catch (_) {
    const rows = await fetchAllRequerimientosBandeja(filters);
    list = rows.filter(requerimientoVisibleEnActosPreparatorios);
  }
  if (options.soloMios && options.usuarioNombre) {
    const me = String(options.usuarioNombre).toLowerCase();
    list = list.filter((r) => {
      const resp = String(r.responsable_actual || r.responsableActual || '').toLowerCase();
      if (/coordinador.*contratos/i.test(resp)) return false;
      return resp.includes(me) || me.split(' ').some((p) => p.length > 2 && resp.includes(p));
    });
  }
  return list;
}

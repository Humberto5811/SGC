/**
 * Motor de Observaciones SGC — fuente única de verdad (servidor + cliente).
 * Solo lógica pura sobre payload.observaciones; sin I/O ni UI.
 */

export const ESTADOS_OBS = Object.freeze({
  EMITIDA: 'EMITIDA',
  RECIBIDA: 'RECIBIDA',
  EN_ATENCION: 'EN ATENCIÓN',
  SUBSANADA: 'SUBSANADA',
  RECIBIDA_EMISOR: 'RECIBIDA POR EL EMISOR',
  REVISADA: 'REVISADA',
  CERRADA: 'CERRADA',
});

/** Estados que mantienen el hilo (y el badge) abiertos. */
export const ESTADOS_ABIERTOS = new Set([
  ESTADOS_OBS.EMITIDA,
  ESTADOS_OBS.RECIBIDA,
  ESTADOS_OBS.EN_ATENCION,
  ESTADOS_OBS.SUBSANADA,
  ESTADOS_OBS.RECIBIDA_EMISOR,
  ESTADOS_OBS.REVISADA,
]);

export function normalizeModuloKey(label) {
  const s = String(label || '').trim().toLowerCase();
  if (!s) return '';
  if (s.includes('registro')) return 'REGISTRO';
  if (s.includes('evalu')) return 'EVALUACION';
  if (s === 'dec' || s.includes(' dec') || s.startsWith('dec')) return 'DEC';
  if (s.includes('program')) return 'PROGRAMACION';
  if (s.includes('actos') || s.includes('coordin')) return 'ACTOS';
  if (s.includes('invit')) return 'INVITACIONES';
  if (s.includes('valid')) return 'VALIDACION';
  if (s.includes('cuadro')) return 'CUADRO';
  if (s.includes('ccp')) return 'CCP';
  if (s.includes('ejecuc') || s.includes('contractual')) return 'EJECUCION';
  if (s.includes('cotiz')) return 'COTIZACIONES';
  return s.replace(/\s+/g, '_').toUpperCase();
}

export function getModuloEmisor(o) {
  return normalizeModuloKey(o?.origen_submodulo || o?.moduloOrigen || o?.moduloEmisor || o?.origen);
}

export function getModuloReceptor(o) {
  return normalizeModuloKey(o?.destino_submodulo || o?.moduloDestino || o?.moduloReceptor);
}

/** Normaliza variantes legacy de estado (sin tildes, alias). */
export function canonEstadoObservacion(estado) {
  const plain = String(estado || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!plain) return estado;
  if (plain === 'EMITIDA') return ESTADOS_OBS.EMITIDA;
  if (plain === 'RECIBIDA') return ESTADOS_OBS.RECIBIDA;
  if (plain === 'EN ATENCION') return ESTADOS_OBS.EN_ATENCION;
  if (plain === 'SUBSANADA') return ESTADOS_OBS.SUBSANADA;
  if (plain === 'RECIBIDA POR EL EMISOR' || plain === 'RECIBIDA POR EMISOR') return ESTADOS_OBS.RECIBIDA_EMISOR;
  if (plain === 'REVISADA') return ESTADOS_OBS.REVISADA;
  if (plain === 'CERRADA') return ESTADOS_OBS.CERRADA;
  return String(estado || '').trim();
}

export function migrateObservacion(o) {
  if (!o || typeof o !== 'object') return o;
  if (!Array.isArray(o.actuaciones)) o.actuaciones = [];
  if (o.cerrada === true) {
    o.estado = ESTADOS_OBS.CERRADA;
    return o;
  }
  if (!o.estado) {
    if (o.subsanacion || o.respuesta) o.estado = ESTADOS_OBS.SUBSANADA;
    else o.estado = ESTADOS_OBS.EMITIDA;
  } else {
    o.estado = canonEstadoObservacion(o.estado);
  }
  if (o.estado === ESTADOS_OBS.CERRADA) o.cerrada = true;
  if (!o.moduloEmisor) o.moduloEmisor = o.origen_submodulo || o.moduloOrigen || '';
  if (!o.moduloReceptor) o.moduloReceptor = o.destino_submodulo || o.moduloDestino || '';
  if (o.observacion_padre_id && !o.observacionPadreId) o.observacionPadreId = o.observacion_padre_id;
  if (o.id && !o.observacionId) o.observacionId = o.id;
  return o;
}

export function getObservacionPadreId(o) {
  return o?.observacionPadreId || o?.observacion_padre_id || null;
}

export function getHijosDirectos(hilos, parentId) {
  if (!parentId) return [];
  const pid = String(parentId);
  return hilos.filter((o) => String(getObservacionPadreId(o) || '') === pid);
}

export function getRaicesObservaciones(hilos) {
  return hilos.filter((o) => !getObservacionPadreId(o));
}

export function tieneDescendientesAbiertos(hilos, parentId) {
  return getHijosDirectos(hilos, parentId).some((h) => {
    if (isObservacionAbierta(h)) return true;
    return tieneDescendientesAbiertos(hilos, h.id);
  });
}

/** Bloquea subsanación del padre solo si algún hijo aún espera respuesta de su receptor. */
export function tieneDescendientesPendientesReceptor(hilos, parentId) {
  return getHijosDirectos(hilos, parentId).some((h) => {
    if (receptorDebeActuar(h)) return true;
    return tieneDescendientesPendientesReceptor(hilos, h.id);
  });
}

export function bloqueaSubsanacionPorHijos(hilos, observacionId) {
  return tieneDescendientesPendientesReceptor(hilos, observacionId);
}

/** Índice de raíz (1-based) — contador principal independiente de hijos. */
export function getIndiceRaiz(hilos, o) {
  const raices = getRaicesObservaciones(hilos);
  const idx = raices.findIndex((r) => String(r.id) === String(o.id));
  if (idx >= 0) return idx + 1;
  let actual = o;
  let padreId = getObservacionPadreId(actual);
  while (padreId) {
    const padre = hilos.find((h) => String(h.id) === String(padreId));
    if (!padre) break;
    const pIdx = raices.findIndex((r) => String(r.id) === String(padre.id));
    if (pIdx >= 0) return pIdx + 1;
    actual = padre;
    padreId = getObservacionPadreId(actual);
  }
  return null;
}

/** Siguiente número de raíz (padres: 1, 2, 3…). */
export function calcularRondaRaiz(hilos) {
  return getRaicesObservaciones(hilos).length + 1;
}

export function formatEtiquetaJerarquica(o, hilos, idx = 0) {
  const padreId = getObservacionPadreId(o);
  if (!padreId) {
    const raizIdx = getIndiceRaiz(hilos, o);
    return String(raizIdx != null ? raizIdx : (o.ronda || idx + 1));
  }
  const padre = hilos.find((h) => String(h.id) === String(padreId));
  const baseShort = getIndiceRaiz(hilos, padre || o) || padre?.ronda || '?';
  const hermanos = getHijosDirectos(hilos, padreId);
  const pos = Math.max(1, hermanos.findIndex((h) => String(h.id) === String(o.id)) + 1);
  return `${baseShort}.${pos}`;
}

export function buildArbolObservaciones(hilos) {
  const list = hilos || [];
  function conHijos(nodo) {
    const hijos = getHijosDirectos(list, nodo.id).map(conHijos);
    return { observacion: nodo, hijos };
  }
  return getRaicesObservaciones(list).map(conHijos);
}

/** Hilo abierto = estado en cadena abierta y no marcado cerrada. */
export function isObservacionAbierta(o) {
  const m = migrateObservacion(o);
  if (m.cerrada === true || m.estado === ESTADOS_OBS.CERRADA) return false;
  return ESTADOS_ABIERTOS.has(m.estado);
}

export function parsePayloadFromInput(input) {
  if (!input) return {};
  if (typeof input === 'object' && input.observaciones != null && !input.payload) {
    return input;
  }
  let payload = input?.payload ?? input;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload || '{}'); } catch (_) { payload = {}; }
  }
  return payload && typeof payload === 'object' ? payload : {};
}

export function getListaObservaciones(input) {
  const payload = parsePayloadFromInput(input);
  if (!Array.isArray(payload?.observaciones)) return [];
  return payload.observaciones.map(migrateObservacion);
}

export function getObservacionesAbiertas(input) {
  return getListaObservaciones(input).filter(isObservacionAbierta);
}

export function getObservacionesCerradas(input) {
  return getListaObservaciones(input).filter((o) => !isObservacionAbierta(o));
}

export function findObservacionById(input, id) {
  if (!id) return null;
  return getListaObservaciones(input).find((o) => String(o.id) === String(id)) || null;
}

export function moduloCoincideConObservacion(o, submoduloLabel) {
  const mod = normalizeModuloKey(submoduloLabel);
  if (!mod) return false;
  return getModuloEmisor(o) === mod || getModuloReceptor(o) === mod;
}

/** Receptor debe subsanar: hilo abierto, soy receptor, sin respuesta aún. */
export function receptorDebeActuar(o) {
  const m = migrateObservacion(o);
  if (!isObservacionAbierta(m)) return false;
  if (m.subsanacion || m.respuesta) return false;
  return [ESTADOS_OBS.EMITIDA, ESTADOS_OBS.RECIBIDA, ESTADOS_OBS.EN_ATENCION].includes(m.estado);
}

export function emisorDebeRevisar(o) {
  const m = migrateObservacion(o);
  if (!isObservacionAbierta(m)) return false;
  return [ESTADOS_OBS.SUBSANADA, ESTADOS_OBS.RECIBIDA_EMISOR, ESTADOS_OBS.REVISADA].includes(m.estado);
}

/** ¿Existe hilo abierto donde el módulo actual es receptor y puede subsanar (sin hijas pendientes de receptor)? */
export function puedeSubsanar(moduloActual, input) {
  const mod = normalizeModuloKey(moduloActual);
  if (!mod) return false;
  const hilos = getListaObservaciones(input);
  return getObservacionesAbiertas(input).some((o) => {
    if (getModuloReceptor(o) !== mod) return false;
    if (!receptorDebeActuar(o)) return false;
    if (bloqueaSubsanacionPorHijos(hilos, o.id)) return false;
    return true;
  });
}

/** Observación padre abierta donde el módulo es receptor y puede delegar (crear hija). */
export function getObservacionPadreParaDelegacion(moduloActual, input) {
  const mod = normalizeModuloKey(moduloActual);
  if (!mod) return null;
  const abiertas = getObservacionesAbiertas(input);
  for (let i = abiertas.length - 1; i >= 0; i -= 1) {
    const o = abiertas[i];
    if (getModuloReceptor(o) !== mod) continue;
    if (o.subsanacion || o.respuesta) continue;
    return o;
  }
  return null;
}

export function puedeEmitirObservacionHija(moduloActual, input) {
  return !!getObservacionPadreParaDelegacion(moduloActual, input);
}

export function hayObservacionPendienteAccion(input, submoduloLabel) {
  return puedeSubsanar(submoduloLabel, input);
}

export function hayObservacionAbiertaRelacionada(input, submoduloLabel) {
  const mod = normalizeModuloKey(submoduloLabel);
  if (!mod) return false;
  return getObservacionesAbiertas(input).some((o) => moduloCoincideConObservacion(o, submoduloLabel));
}

export function labelBotonObservaciones(input, submoduloLabel) {
  if (puedeSubsanar(submoduloLabel, input)) {
    return 'Observaciones / Subsanar';
  }
  return 'Observaciones';
}

export function getObservacionPendienteParaModulo(input, submoduloLabel) {
  const mod = normalizeModuloKey(submoduloLabel);
  const hilos = getListaObservaciones(input);
  const abiertas = getObservacionesAbiertas(input);
  for (let i = abiertas.length - 1; i >= 0; i -= 1) {
    const o = abiertas[i];
    if (getModuloReceptor(o) !== mod) continue;
    if (!receptorDebeActuar(o)) continue;
    if (bloqueaSubsanacionPorHijos(hilos, o.id)) continue;
    return o;
  }
  return null;
}

export function getObservacionPendiente(input) {
  const abiertas = getObservacionesAbiertas(input);
  for (let i = abiertas.length - 1; i >= 0; i -= 1) {
    const o = abiertas[i];
    if (receptorDebeActuar(o)) return o;
  }
  return null;
}

export function observacionPendienteParaSubmodulo(pending, submoduloLabel) {
  if (!pending) return false;
  return getModuloReceptor(pending) === normalizeModuloKey(submoduloLabel) && receptorDebeActuar(pending);
}

export function getObservacionEmisorPendienteCierre(input, submoduloLabel) {
  const mod = normalizeModuloKey(submoduloLabel);
  const hilos = getListaObservaciones(input);
  const abiertas = getObservacionesAbiertas(input);
  for (let i = abiertas.length - 1; i >= 0; i -= 1) {
    const o = abiertas[i];
    if (getModuloEmisor(o) !== mod) continue;
    if (!emisorDebeRevisar(o)) continue;
    if (tieneDescendientesAbiertos(hilos, o.id)) continue;
    return o;
  }
  return null;
}

/** Pendientes de acción para un módulo (receptor debe subsanar o emisor debe cerrar). */
export function getPendientesModulo(input, submoduloLabel) {
  const mod = normalizeModuloKey(submoduloLabel);
  if (!mod) return [];
  const hilos = getListaObservaciones(input);
  const out = [];
  getObservacionesAbiertas(input).forEach((o) => {
    if (getModuloReceptor(o) === mod && receptorDebeActuar(o) && !bloqueaSubsanacionPorHijos(hilos, o.id)) {
      out.push({ ...o, rol: 'receptor' });
    } else if (getModuloEmisor(o) === mod && emisorDebeRevisar(o) && !tieneDescendientesAbiertos(hilos, o.id)) {
      out.push({ ...o, rol: 'emisor' });
    }
  });
  return out;
}

export function countPendientesModulo(input, submoduloLabel) {
  return getPendientesModulo(input, submoduloLabel).length;
}

/** Observación abierta dirigida al módulo (receptor sin subsanación aún). */
export function tieneObservacionAbiertaDirigidaModulo(input, submoduloLabel) {
  const mod = normalizeModuloKey(submoduloLabel);
  if (!mod) return false;
  const hilos = getListaObservaciones(input);
  return getObservacionesAbiertas(input).some((o) => {
    if (getModuloReceptor(o) !== mod) return false;
    if (o.subsanacion || o.respuesta) return false;
    if (bloqueaSubsanacionPorHijos(hilos, o.id)) return false;
    return true;
  });
}

/** Badge rojo: pendiente de acción O observación abierta dirigida al módulo. */
export function requiereBadgeModulo(input, submoduloLabel) {
  if (countPendientesModulo(input, submoduloLabel) > 0) return true;
  return tieneObservacionAbiertaDirigidaModulo(input, submoduloLabel);
}

export function puedeCerrarObservacion(moduloActual, input) {
  return !!getObservacionEmisorPendienteCierre(input, moduloActual);
}

function ultimoMovimientoDeHilos(hilos) {
  if (!hilos.length) return null;
  let best = null;
  let bestTs = 0;
  hilos.forEach((h) => {
    const candidates = [h.fecha, h.fecha_respuesta, h.fecha_subsana, h.fecha_cierre];
    if (Array.isArray(h.actuaciones)) {
      h.actuaciones.forEach((a) => candidates.push(a.fecha));
    }
    candidates.filter(Boolean).forEach((f) => {
      const ts = new Date(f).getTime();
      if (!Number.isNaN(ts) && ts >= bestTs) {
        bestTs = ts;
        best = h;
      }
    });
  });
  return best;
}

/**
 * Fuente única de verdad — todos los componentes deben usar esta función.
 */
export function obtenerEstadoObservaciones(input, moduloActual = null) {
  const hilos = getListaObservaciones(input);
  const abiertas = hilos.filter(isObservacionAbierta);
  const cerradas = hilos.filter((o) => !isObservacionAbierta(o));
  const pendientes = abiertas.filter((o) => receptorDebeActuar(o));
  const modKey = moduloActual ? normalizeModuloKey(moduloActual) : null;
  const puedeSubsanarMod = modKey ? puedeSubsanar(moduloActual, input) : false;
  const puedeHijaMod = modKey ? puedeEmitirObservacionHija(moduloActual, input) : false;
  const puedeCerrarMod = modKey ? puedeCerrarObservacion(moduloActual, input) : false;
  const padreDelegacion = modKey ? getObservacionPadreParaDelegacion(moduloActual, input) : null;
  const pendienteModulo = modKey ? getObservacionPendienteParaModulo(input, moduloActual) : null;
  const cierreModulo = modKey ? getObservacionEmisorPendienteCierre(input, moduloActual) : null;
  const pendientesModulo = modKey ? getPendientesModulo(input, moduloActual) : [];
  const labelBoton = modKey ? labelBotonObservaciones(input, moduloActual) : 'Observaciones';
  const arbol = buildArbolObservaciones(hilos);

  return {
    hilos,
    arbol,
    abiertas,
    cerradas,
    pendientes,
    pendientesModulo,
    pendienteModulo,
    cierreModulo,
    requiereBadge: modKey ? requiereBadgeModulo(input, moduloActual) : abiertas.length > 0,
    requiereBadgeObservado: modKey ? requiereBadgeModulo(input, moduloActual) : abiertas.length > 0,
    puedeSubsanar: puedeSubsanarMod,
    puedeCerrar: puedeCerrarMod,
    puedeEmitirHija: puedeHijaMod,
    observacionPadreDelegacion: padreDelegacion,
    labelBoton,
    ultimoMovimiento: ultimoMovimientoDeHilos(hilos),
    total: hilos.length,
    abiertasCount: abiertas.length,
    cerradasCount: cerradas.length,
    pendientesCount: pendientes.length,
    pendientesModuloCount: pendientesModulo.length,
  };
}

/** Badge rojo solo con hilos abiertos (no cerrados). */
export function requiereIndicadorObservado(input) {
  return getObservacionesAbiertas(input).length > 0;
}

export function countObservacionesAbiertas(input) {
  return getObservacionesAbiertas(input).length;
}

export const ETAPA_WORKFLOW_TEXTO = Object.freeze({
  REGISTRADO: 'Registro de Requerimiento',
  EVALUACION: 'Evaluación de Requerimiento',
  DEC: 'DEC',
  PROGRAMACION: 'Programación',
  ACTOS_PREPARATORIOS: 'Coordinación CM',
  INVITACIONES: 'Invitaciones',
  RECEPCION_COTIZACIONES: 'Recepción de Cotizaciones',
  VALIDACION_USUARIO: 'Validación Usuario',
  CUADRO_COMPARATIVO: 'Cuadro Comparativo',
  CCP: 'CCP',
  EJECUCION: 'Ejecución Contractual',
  FINALIZADO: 'Finalizado',
});

function resolverTextoWorkflow(row) {
  const etapa = String(row?.estado_actual || row?.estadoActual || 'REGISTRADO').toUpperCase();
  const subModulo = String(row?.sub_modulo_actual || row?.subModuloActual || row?.estado_actual_texto || '').trim();
  if (subModulo && !/observ/i.test(subModulo)) return subModulo;
  return ETAPA_WORKFLOW_TEXTO[etapa] || subModulo || etapa;
}

/**
 * Fuente única del estado visual — todas las bandejas deben usar esta función.
 * Nunca deriva el workflow del texto "Observado" ni del historial/timeline.
 */
export function obtenerEstadoVisual(input, moduloActual = null) {
  const row = input && typeof input === 'object' ? input : { payload: input };
  const motor = obtenerEstadoObservaciones(row, moduloActual);
  const etapaWorkflow = String(row?.estado_actual || row?.estadoActual || 'REGISTRADO').toUpperCase();
  const estadoWorkflowTexto = resolverTextoWorkflow(row);
  return {
    motor,
    etapaWorkflow,
    estadoWorkflow: etapaWorkflow,
    estadoWorkflowTexto,
    badgeObservado: motor.requiereBadge,
    puedeSubsanar: motor.puedeSubsanar,
    puedeCerrar: motor.puedeCerrar,
    puedeEmitirHija: motor.puedeEmitirHija,
    labelBoton: motor.labelBoton,
    pendientesCount: motor.pendientesModuloCount,
    pendienteModulo: motor.pendienteModulo,
    cierreModulo: motor.cierreModulo,
  };
}

/** Regenera snapshot motor + visual tras cualquier actuación. */
export function regenerarSnapshotObservaciones(row, moduloActual = null) {
  const motor = obtenerEstadoObservaciones(row, moduloActual);
  const visual = obtenerEstadoVisual({ ...row, payload: row?.payload }, moduloActual);
  return { ...row, obsMotor: motor, obsVisual: visual };
}

/** @deprecated Usar obtenerEstadoObservaciones */
export function computeMotorSnapshot(input, moduloActual = null) {
  return obtenerEstadoObservaciones(input, moduloActual);
}

export default {
  ESTADOS_OBS,
  ESTADOS_ABIERTOS,
  ETAPA_WORKFLOW_TEXTO,
  obtenerEstadoObservaciones,
  obtenerEstadoVisual,
  regenerarSnapshotObservaciones,
  calcularRondaRaiz,
  getIndiceRaiz,
  tieneObservacionAbiertaDirigidaModulo,
  puedeSubsanar,
  puedeEmitirObservacionHija,
  getObservacionPadreParaDelegacion,
  buildArbolObservaciones,
  getObservacionPadreId,
  tieneDescendientesAbiertos,
  bloqueaSubsanacionPorHijos,
  getPendientesModulo,
  countPendientesModulo,
  requiereBadgeModulo,
  puedeCerrarObservacion,
  normalizeModuloKey,
  getModuloEmisor,
  getModuloReceptor,
  migrateObservacion,
  isObservacionAbierta,
  getListaObservaciones,
  getObservacionesAbiertas,
  findObservacionById,
  hayObservacionPendienteAccion,
  labelBotonObservaciones,
  getObservacionPendiente,
  getObservacionPendienteParaModulo,
  computeMotorSnapshot,
  requiereIndicadorObservado,
  countObservacionesAbiertas,
};

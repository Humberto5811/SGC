/**
 * Workflow unificado de observaciones SGC (servidor).
 * Hilo independiente por emisor; cadena de actuaciones; cierre automático al continuar workflow.
 */
import { submoduloLabelToEtapa } from './observacionDestino.js';
import { buildObservacionEntry } from './observacionesExpediente.js';
import {
  ESTADOS_OBS,
  normalizeModuloKey,
  getModuloEmisor,
  getModuloReceptor,
  isObservacionAbierta,
  getObservacionesAbiertas,
  getListaObservaciones,
  findObservacionById,
  receptorDebeActuar,
  getObservacionPendienteParaModulo,
  getObservacionPendiente,
  obtenerEstadoObservaciones,
  puedeSubsanar,
  hayObservacionPendienteAccion,
  labelBotonObservaciones,
  hayObservacionAbiertaRelacionada,
  observacionPendienteParaSubmodulo,
  migrateObservacion,
  computeMotorSnapshot,
  tieneDescendientesAbiertos,
} from '../../shared/observacionesMotor.js';

export {
  ESTADOS_OBS,
  normalizeModuloKey,
  getModuloEmisor,
  getModuloReceptor,
  migrateObservacion,
  isObservacionAbierta,
  getObservacionesAbiertas,
  findObservacionById,
  receptorDebeActuar,
  puedeSubsanar,
  hayObservacionPendienteAccion,
  hayObservacionAbiertaRelacionada,
  observacionPendienteParaSubmodulo,
  labelBotonObservaciones,
  getObservacionPendienteParaModulo,
  getObservacionPendiente,
  obtenerEstadoObservaciones,
  computeMotorSnapshot,
};

function pushActuacion(obs, actuacion) {
  if (!Array.isArray(obs.actuaciones)) obs.actuaciones = [];
  obs.actuaciones.push({
    id: actuacion.id || `act_${Date.now()}_${obs.actuaciones.length + 1}`,
    fecha: actuacion.fecha || new Date().toISOString(),
    tipo: actuacion.tipo || 'actuacion',
    modulo: actuacion.modulo || '',
    usuario: actuacion.usuario || 'Sistema',
    texto: actuacion.texto || actuacion.motivo || '',
    metadata: actuacion.metadata || {},
  });
  return obs;
}

function cerrarHiloInterno(obs, moduloEmisor, usuario, motivo = 'Observación cerrada') {
  obs.estado = ESTADOS_OBS.CERRADA;
  obs.cerrada = true;
  obs.fecha_cierre = new Date().toISOString();
  pushActuacion(obs, {
    tipo: 'cerrada',
    modulo: moduloEmisor,
    usuario: usuario || 'Sistema',
    texto: motivo,
  });
  return obs;
}

function findOpenSamePar(payload, emisorKey, receptorKey) {
  return getObservacionesAbiertas(payload).find(
    (o) => getModuloEmisor(o) === emisorKey && getModuloReceptor(o) === receptorKey,
  ) || null;
}

function resolvePadreId(fields) {
  return fields.observacion_padre_id || fields.observacionPadreId || null;
}

function emitirObservacionHija(payload, fields, padreId) {
  const padre = findObservacionById(payload, padreId);
  if (!padre) throw new Error('Observación padre no encontrada');
  if (!isObservacionAbierta(padre)) throw new Error('La observación padre está cerrada');

  const emisorKey = normalizeModuloKey(fields.origen_submodulo || fields.moduloOrigen || fields.origen);
  if (getModuloReceptor(padre) !== emisorKey) {
    throw new Error('Solo el receptor de la observación padre puede crear una subobservación');
  }

  const motivo = String(fields.motivo || fields.observacion || '').trim();
  const usuario = fields.gerente || fields.usuarioOrigen || fields.usuario || 'Sistema';
  const now = fields.fecha || new Date().toISOString();
  const destinoLabel = fields.destino_submodulo || fields.moduloDestino || '';

  const entry = buildObservacionEntry(payload, { ...fields, forceNew: true });
  entry.observacionPadreId = padreId;
  entry.observacion_id = entry.id;
  entry.observacionId = entry.id;
  entry.estado = ESTADOS_OBS.EMITIDA;
  entry.moduloEmisor = fields.origen_submodulo || fields.moduloOrigen || '';
  entry.moduloReceptor = fields.destino_submodulo || fields.moduloDestino || '';
  entry.cerrada = false;
  entry.actuaciones = [{
    id: `act_${Date.now()}_1`,
    fecha: now,
    tipo: 'emitida',
    modulo: entry.moduloEmisor,
    usuario,
    texto: motivo,
    metadata: { observacion_padre_id: padreId },
  }];
  payload.observaciones.push(entry);
  entry.estado = ESTADOS_OBS.RECIBIDA;
  pushActuacion(entry, {
    tipo: 'recibida',
    modulo: entry.moduloReceptor,
    usuario: 'Sistema',
    texto: 'Subobservación recibida',
  });

  pushActuacion(padre, {
    tipo: 'subobservacion_creada',
    modulo: fields.origen_submodulo || fields.moduloOrigen,
    usuario,
    texto: motivo ? `Subobservación hacia ${destinoLabel}: ${motivo}` : `Subobservación creada hacia ${destinoLabel}`,
    metadata: { hija_id: entry.id, observacion_padre_id: padreId },
  });
  if (padre.estado === ESTADOS_OBS.RECIBIDA || padre.estado === ESTADOS_OBS.EN_ATENCION) {
    padre.estado = ESTADOS_OBS.EN_ATENCION;
  }

  return { observacion: entry, esNueva: true, esHija: true };
}

/**
 * Emite observación nueva o registra actuación en hilo existente.
 * Nunca mezcla emisores distintos. Con observacion_id nunca crea hilo nuevo.
 * Con observacion_padre_id crea subobservación dependiente.
 */
export function emitirObservacion(payload, fields = {}) {
  if (!Array.isArray(payload.observaciones)) payload.observaciones = [];

  const padreId = resolvePadreId(fields);
  if (padreId) {
    return emitirObservacionHija(payload, fields, padreId);
  }

  const emisorKey = normalizeModuloKey(fields.origen_submodulo || fields.moduloOrigen || fields.origen);
  const receptorKey = normalizeModuloKey(fields.destino_submodulo || fields.moduloDestino);
  const motivo = String(fields.motivo || fields.observacion || '').trim();
  const usuario = fields.gerente || fields.usuarioOrigen || fields.usuario || 'Sistema';
  const now = fields.fecha || new Date().toISOString();

  if (fields.observacion_id) {
    const existente = findObservacionById(payload, fields.observacion_id);
    if (existente && isObservacionAbierta(existente)) {
      pushActuacion(existente, {
        tipo: fields.tipo_actuacion || 'observacion_adicional',
        modulo: fields.origen_submodulo || fields.moduloOrigen,
        usuario,
        texto: motivo,
      });
      existente.estado = ESTADOS_OBS.EN_ATENCION;
      if (motivo) existente.motivo = motivo;
      return { observacion: existente, esNueva: false };
    }
  }

  if (fields.forceNew !== true) {
    const mismoPar = findOpenSamePar(payload, emisorKey, receptorKey);
    if (mismoPar) {
      pushActuacion(mismoPar, {
        tipo: 'observacion_adicional',
        modulo: fields.origen_submodulo || fields.moduloOrigen,
        usuario,
        texto: motivo,
      });
      mismoPar.estado = ESTADOS_OBS.EN_ATENCION;
      if (motivo) mismoPar.motivo = motivo;
      return { observacion: mismoPar, esNueva: false };
    }
  }

  const entry = buildObservacionEntry(payload, fields);
  entry.estado = ESTADOS_OBS.EMITIDA;
  entry.moduloEmisor = fields.origen_submodulo || fields.moduloOrigen || '';
  entry.moduloReceptor = fields.destino_submodulo || fields.moduloDestino || '';
  entry.cerrada = false;
  entry.actuaciones = [{
    id: `act_${Date.now()}_1`,
    fecha: now,
    tipo: 'emitida',
    modulo: entry.moduloEmisor,
    usuario,
    texto: motivo,
  }];
  payload.observaciones.push(entry);
  entry.estado = ESTADOS_OBS.RECIBIDA;
  pushActuacion(entry, {
    tipo: 'recibida',
    modulo: entry.moduloReceptor,
    usuario: 'Sistema',
    texto: 'Observación recibida',
  });
  return { observacion: entry, esNueva: true };
}

/** Registra subsanación en el hilo indicado; retorna al emisor del hilo. */
export function registrarSubsanacionObservacion(payload, {
  observacion_id,
  respuesta,
  origen_submodulo,
  usuario,
}) {
  let obs = observacion_id ? findObservacionById(payload, observacion_id) : null;
  if (!obs) {
    obs = getObservacionPendienteParaModulo(payload, origen_submodulo);
  }
  if (!obs) throw new Error('No hay observación pendiente para subsanar');
  if (!receptorDebeActuar(obs)) {
    throw new Error('La observación indicada no está pendiente de subsanación en este módulo');
  }
  const hilos = getListaObservaciones(payload);
  if (tieneDescendientesAbiertos(hilos, obs.id)) {
    throw new Error('Debe resolver las subobservaciones abiertas antes de subsanar');
  }

  const texto = String(respuesta || '').trim();
  if (!texto) throw new Error('Subsanación requerida');

  const now = new Date().toISOString();
  const origenMod = origen_submodulo || obs.moduloReceptor || 'Registro de Requerimiento';
  const destinoEmisor = obs.origen_submodulo || obs.moduloEmisor || obs.moduloOrigen || 'DEC';
  const destinoEtapa = submoduloLabelToEtapa(destinoEmisor) || 'DEC';

  obs.subsanacion = texto;
  obs.respuesta = texto;
  obs.usuario_subsana = usuario || '';
  obs.usuario_respuesta = usuario || '';
  obs.modulo_respuesta = origenMod;
  obs.fecha_subsana = now;
  obs.fecha_respuesta = now;
  obs.subsanacion_origen_submodulo = origenMod;
  obs.subsanacion_destino_submodulo = destinoEmisor;
  obs.subsanacion_destino_etapa = destinoEtapa;
  obs.subsanacion_destino_persona = obs.gerente || obs.usuarioOrigen || '';

  pushActuacion(obs, { tipo: 'subsanacion', modulo: origenMod, usuario: usuario || 'Sistema', texto });
  pushActuacion(obs, {
    tipo: 'remitida',
    modulo: origenMod,
    usuario: usuario || 'Sistema',
    texto: `Remitido a ${destinoEmisor}`,
  });
  obs.estado = ESTADOS_OBS.RECIBIDA_EMISOR;
  pushActuacion(obs, {
    tipo: 'recibida_emisor',
    modulo: destinoEmisor,
    usuario: usuario || 'Sistema',
    texto: 'Subsanación recibida por el emisor',
  });

  return {
    observacion: obs,
    destinoSubmodulo: destinoEmisor,
    destinoEtapa,
    destinoPersona: obs.gerente || obs.usuarioOrigen || '',
  };
}

export function marcarRecibidaPorEmisor(payload, observacionId, usuario) {
  const obs = findObservacionById(payload, observacionId);
  if (!obs) throw new Error('Observación no encontrada');
  obs.estado = ESTADOS_OBS.RECIBIDA_EMISOR;
  pushActuacion(obs, {
    tipo: 'recibida_emisor',
    modulo: obs.moduloEmisor || obs.origen_submodulo,
    usuario: usuario || 'Sistema',
    texto: 'Subsanación recibida por el emisor',
  });
  return obs;
}

export function revisarObservacion(payload, observacionId, usuario, moduloEmisor) {
  const obs = findObservacionById(payload, observacionId);
  if (!obs) throw new Error('Observación no encontrada');
  if (getModuloEmisor(obs) !== normalizeModuloKey(moduloEmisor)) {
    throw new Error('Solo el módulo emisor puede revisar la observación');
  }
  obs.estado = ESTADOS_OBS.REVISADA;
  pushActuacion(obs, {
    tipo: 'revisada',
    modulo: moduloEmisor,
    usuario: usuario || 'Sistema',
    texto: 'Observación revisada',
  });
  return obs;
}

export function cerrarObservacion(payload, observacionId, moduloEmisor, usuario) {
  const obs = findObservacionById(payload, observacionId);
  if (!obs) throw new Error('Observación no encontrada');
  if (getModuloEmisor(obs) !== normalizeModuloKey(moduloEmisor)) {
    throw new Error('Solo el módulo emisor puede cerrar la observación');
  }
  const hilos = getListaObservaciones(payload);
  if (tieneDescendientesAbiertos(hilos, observacionId)) {
    throw new Error('No puede cerrarse: existen subobservaciones abiertas');
  }
  return cerrarHiloInterno(obs, moduloEmisor, usuario);
}

/**
 * Cierra hilos resueltos del emisor al aprobar/continuar workflow.
 * Solo cierra hilos con subsanación recibida (no los pendientes en Registro).
 */
export function autoCerrarObservacionesEmisorAlContinuar(payload, submoduloEmisor, usuario = 'Sistema') {
  const mod = normalizeModuloKey(submoduloEmisor);
  if (!mod) return 0;
  const hilos = getListaObservaciones(payload);
  let cerradas = 0;
  getObservacionesAbiertas(payload).forEach((o) => {
    if (getModuloEmisor(o) !== mod) return;
    if (receptorDebeActuar(o)) return;
    if (tieneDescendientesAbiertos(hilos, o.id)) return;
    const resuelto = o.subsanacion || o.respuesta
      || [ESTADOS_OBS.RECIBIDA_EMISOR, ESTADOS_OBS.REVISADA, ESTADOS_OBS.SUBSANADA].includes(o.estado);
    if (!resuelto) return;
    cerrarHiloInterno(o, submoduloEmisor, usuario, 'Observación cerrada automáticamente al continuar el workflow');
    cerradas += 1;
  });
  return cerradas;
}

export function procesarAccionObservacion(payload, body = {}) {
  const accion = String(body.accion || body.tipo_accion || '').toLowerCase();
  if (accion === 'cerrar' && body.observacion_id) {
    return cerrarObservacion(payload, body.observacion_id, body.origen_submodulo || body.moduloOrigen, body.usuario);
  }
  if (accion === 'revisar' && body.observacion_id) {
    const obs = revisarObservacion(payload, body.observacion_id, body.usuario, body.origen_submodulo || body.moduloOrigen);
    cerrarObservacion(payload, body.observacion_id, body.origen_submodulo || body.moduloOrigen, body.usuario);
    return obs;
  }
  if (accion === 'recibida_emisor' && body.observacion_id) {
    return marcarRecibidaPorEmisor(payload, body.observacion_id, body.usuario);
  }
  return null;
}

export default {
  ESTADOS_OBS,
  emitirObservacion,
  registrarSubsanacionObservacion,
  cerrarObservacion,
  autoCerrarObservacionesEmisorAlContinuar,
  getObservacionPendiente,
  getObservacionPendienteParaModulo,
  hayObservacionPendienteAccion,
  labelBotonObservaciones,
  obtenerEstadoObservaciones,
  computeMotorSnapshot,
  hayObservacionAbiertaRelacionada,
  observacionPendienteParaSubmodulo,
  migrateObservacion,
};

// Observaciones bidireccionales — estructura canónica y helpers (servidor)

export const SUBMODULO_DISPLAY_LABELS = {
  'Actos Preparatorios': 'Coordinación CM',
  'Programación': 'Programación',
  'DEC': 'DEC',
  'Evaluación de Requerimiento': 'Evaluación',
  'Evaluación de Requerimientos': 'Evaluación',
  'Registro de Requerimiento': 'Registro AU',
  'Invitaciones': 'Invitaciones',
  'Cotizaciones': 'Cotizaciones',
  'Cuadro Comparativo': 'Cuadro Comparativo',
  'CCP': 'CCP',
  'Ejecución Contractual': 'Ejecución',
};

export const ORIGEN_OBSERVACION_LABELS = {
  GERENTE: 'Evaluación',
  DEC: 'DEC',
  PROGRAMACIÓN: 'Programación',
  PROGRAMACION: 'Programación',
  'ACTOS PREPARATORIOS': 'Coordinación CM',
  ACTOS_PREPARATORIOS: 'Coordinación CM',
  INVITACIONES: 'Invitaciones',
  USUARIO: 'Usuario AU',
};

export function getSubmoduloDisplayLabel(label) {
  const s = String(label || '').trim();
  return SUBMODULO_DISPLAY_LABELS[s] || s || '—';
}

export function getObservacionOrigenLabel(entry) {
  if (!entry) return 'Observación';
  const sub = String(entry.origen_submodulo || entry.moduloOrigen || '').trim();
  if (sub) return `Observación ${getSubmoduloDisplayLabel(sub)}`;
  const origen = String(entry.origen || 'GERENTE').toUpperCase().replace(/\s+/g, ' ');
  const mapped = ORIGEN_OBSERVACION_LABELS[origen] || ORIGEN_OBSERVACION_LABELS[origen.replace(/\s/g, '_')];
  if (mapped) return `Observación ${mapped}`;
  if (origen.includes('ACTOS')) return 'Observación Coordinación CM';
  if (origen.includes('PROGRAM')) return 'Observación Programación';
  if (origen.includes('INVITAC')) return 'Observación Invitaciones';
  return 'Observación Evaluación';
}

export function buildObservacionEntry(payload, fields = {}) {
  const list = Array.isArray(payload.observaciones) ? payload.observaciones : [];
  const ronda = list.length + 1;
  const id = fields.id || `obs_${Date.now()}_${ronda}`;
  const motivo = String(fields.motivo || fields.observacion || '').trim();
  return {
    id,
    ronda,
    tipoMovimiento: fields.tipoMovimiento || 'observacion',
    moduloOrigen: fields.origen_submodulo || fields.moduloOrigen || '',
    usuarioOrigen: fields.gerente || fields.usuarioOrigen || '',
    moduloDestino: fields.destino_submodulo || fields.moduloDestino || '',
    usuarioDestino: fields.destino_persona || fields.usuarioDestino || '',
    observacion: motivo,
    motivo,
    gerente: fields.gerente || fields.usuarioOrigen || '',
    origen: fields.origen || '',
    origen_submodulo: fields.origen_submodulo || fields.moduloOrigen || '',
    destino_submodulo: fields.destino_submodulo || fields.moduloDestino || '',
    destino_etapa: fields.destino_etapa || '',
    destino_persona: fields.destino_persona || fields.usuarioDestino || '',
    fecha: fields.fecha || new Date().toISOString(),
    respuesta: null,
    subsanacion: null,
    adjuntos: Array.isArray(fields.adjuntos) ? fields.adjuntos : [],
  };
}

export function appendObservacion(payload, fields) {
  if (!Array.isArray(payload.observaciones)) payload.observaciones = [];
  const entry = buildObservacionEntry(payload, fields);
  payload.observaciones.push(entry);
  return entry;
}

export function getObservacionPendiente(payload) {
  const obs = Array.isArray(payload?.observaciones) ? payload.observaciones : [];
  for (let i = obs.length - 1; i >= 0; i -= 1) {
    const o = obs[i];
    if (!o.subsanacion && !o.respuesta) return o;
  }
  return null;
}

export function observacionPendienteParaSubmodulo(pending, submoduloLabel) {
  if (!pending) return false;
  const dest = String(pending.destino_submodulo || pending.moduloDestino || '').toLowerCase();
  const mod = String(submoduloLabel || '').toLowerCase();
  if (!dest || !mod) return false;
  if (dest === mod || dest.includes(mod) || mod.includes(dest)) return true;
  if (mod.includes('program') && dest.includes('program')) return true;
  if ((mod.includes('actos') || mod.includes('coordin')) && (dest.includes('actos') || dest.includes('coordin'))) return true;
  return false;
}

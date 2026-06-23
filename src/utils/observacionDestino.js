// Catálogo de submódulos y personas destino para observaciones / subsanaciones

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
  return 'Observación Evaluación';
}

export function getObservacionPendiente(req) {
  const obs = todasObservacionesFromReq(req);
  for (let i = obs.length - 1; i >= 0; i -= 1) {
    const o = obs[i];
    if (!o.subsanacion && !o.respuesta) return o;
  }
  return null;
}

function todasObservacionesFromReq(req) {
  if (!req) return [];
  let payload = req.payload;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload || '{}'); } catch (_) { payload = {}; }
  }
  return Array.isArray(payload?.observaciones) ? payload.observaciones : [];
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

export function getRolDisplayFromRow(row) {
  const etapa = String(row?.estado_actual || row?.estadoActual || '').toUpperCase();
  const sub = String(row?.sub_modulo_actual || row?.subModuloActual || '').trim();
  if (sub) return getSubmoduloDisplayLabel(sub);
  const byEtapa = {
    ACTOS_PREPARATORIOS: 'Coordinación CM',
    INVITACIONES: 'Invitaciones',
    PROGRAMACION: 'Programación',
    DEC: 'DEC',
    EVALUACION: 'Evaluación',
    CCP: 'CCP',
    CUADRO_COMPARATIVO: 'Cuadro Comparativo',
    EJECUCION: 'Ejecución',
  };
  return byEtapa[etapa] || sub || '—';
}

export const SUBMODULOS_DESTINO = [
  { code: 'REGISTRADO', label: 'Registro de Requerimiento', personas: ['Usuario AU', 'Responsable Área Usuaria'] },
  { code: 'EVALUACION', label: 'Evaluación de Requerimiento', personas: ['Director', 'Gerente de Adquisiciones'] },
  { code: 'DEC', label: 'DEC', personas: ['Jefe DEC', 'Especialista DEC'] },
  { code: 'PROGRAMACION', label: 'Programación', personas: ['Programador', 'Jefe de Programación'] },
  { code: 'ACTOS_PREPARATORIOS', label: 'Actos Preparatorios', personas: ['Coordinador de Contratos Menores', 'Analista de Contratos Menores'] },
  { code: 'INVITACIONES', label: 'Invitaciones', personas: ['Especialista Contrataciones'] },
  { code: 'RECEPCION_COTIZACIONES', label: 'Cotizaciones', personas: ['Especialista Contrataciones'] },
  { code: 'VALIDACION_USUARIO', label: 'Validación Usuario', personas: ['Área Usuaria', 'Responsable AU'] },
  { code: 'CUADRO_COMPARATIVO', label: 'Cuadro Comparativo', personas: ['Especialista Contrataciones'] },
  { code: 'CCP', label: 'CCP', personas: ['Comité de Compras Públicas'] },
  { code: 'EJECUCION', label: 'Ejecución Contractual', personas: ['Ejecutor Contractual'] },
  { code: 'ALMACEN', label: 'Almacén', personas: ['Almacén'] },
  { code: 'TESORERIA', label: 'Tesorería', personas: ['Tesorería'] },
];

export function getSubmoduloByLabel(label) {
  return SUBMODULOS_DESTINO.find((s) => s.label === label) || null;
}

export function getPersonasForSubmodulo(label) {
  const s = getSubmoduloByLabel(label);
  return s ? s.personas : ['Responsable del submódulo'];
}

/** Estado legible en bandeja según submódulo destino de observación/subsanación. */
export function resolveEstadoFromDestino(destinoSubmodulo, destinoEtapa) {
  const code = destinoEtapa || getSubmoduloByLabel(destinoSubmodulo)?.code || 'EVALUACION';
  switch (String(code).toUpperCase()) {
    case 'PROGRAMACION': return 'En Programación';
    case 'DEC': return 'Aprobado';
    case 'REGISTRADO': return 'Registrado';
    case 'ACTOS_PREPARATORIOS': return 'Programado';
    case 'INVITACIONES': return 'En Invitaciones';
    case 'RECEPCION_COTIZACIONES': return 'En Cotizaciones';
    case 'CUADRO_COMPARATIVO': return 'En Cuadro Comparativo';
    case 'CCP': return 'En CCP';
    case 'EJECUCION': return 'En Ejecución';
    case 'ALMACEN': return 'En Almacén';
    case 'TESORERIA': return 'En Tesorería';
    case 'EVALUACION':
    default: return 'En tramite de aprobación';
  }
}

function parsePayload(req) {
  let payload = req?.payload;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload || '{}'); } catch (_) { payload = {}; }
  }
  return payload || {};
}

/** Última subsanación con destino explícito (si existe). */
export function getUltimaSubsanacionDestino(req) {
  const obs = Array.isArray(parsePayload(req).observaciones) ? parsePayload(req).observaciones : [];
  for (let i = obs.length - 1; i >= 0; i -= 1) {
    if (!obs[i]?.subsanacion) continue;
    return {
      submodulo: obs[i].subsanacion_destino_submodulo || '',
      etapa: obs[i].subsanacion_destino_etapa || '',
    };
  }
  return null;
}

export function formatObservacionTraza(motivo, destino = {}) {
  const persona = destino.destino_persona || destino.destinoPersona;
  const sub = destino.destino_submodulo || destino.destinoSubmodulo;
  if (persona && sub) return `Dirigida a ${persona} (${sub}): ${motivo}`;
  return motivo;
}

export function formatSubsanacionTraza(texto, destino = {}) {
  const persona = destino.destino_persona || destino.destinoPersona;
  const sub = destino.destino_submodulo || destino.destinoSubmodulo;
  if (persona && sub) return `Subsanación enviada a ${persona} (${sub}): ${texto}`;
  return texto;
}

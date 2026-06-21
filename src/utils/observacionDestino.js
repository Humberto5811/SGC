// Catálogo de submódulos y personas destino para observaciones / subsanaciones

export const SUBMODULOS_DESTINO = [
  { code: 'REGISTRADO', label: 'Registro de Requerimiento', personas: ['Usuario AU', 'Responsable Área Usuaria'] },
  { code: 'EVALUACION', label: 'Evaluación de Requerimiento', personas: ['Director', 'Gerente de Adquisiciones'] },
  { code: 'DEC', label: 'DEC', personas: ['Jefe DEC', 'Especialista DEC'] },
  { code: 'PROGRAMACION', label: 'Programación', personas: ['Programador', 'Jefe de Programación'] },
  { code: 'ACTOS_PREPARATORIOS', label: 'Actos Preparatorios', personas: ['Especialista Contrataciones'] },
  { code: 'INVITACIONES', label: 'Invitaciones', personas: ['Especialista Contrataciones'] },
  { code: 'RECEPCION_COTIZACIONES', label: 'Cotizaciones', personas: ['Especialista Contrataciones'] },
  { code: 'VALIDACION_USUARIO', label: 'Validación Usuario', personas: ['Área Usuaria', 'Responsable AU'] },
  { code: 'CUADRO_COMPARATIVO', label: 'Cuadro Comparativo', personas: ['Especialista Contrataciones'] },
  { code: 'CCP', label: 'CCP', personas: ['Comité de Compras Públicas'] },
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

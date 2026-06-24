// Formato de observaciones/subsanaciones con destino (servidor)
import { SUBMODULOS } from './movimientos.js';

export function submoduloLabelToEtapa(label) {
  const s = String(label || '').trim();
  if (!s) return null;
  if (/actos prep/i.test(s) || /coordinaci[oó]n cm/i.test(s)) return 'ACTOS_PREPARATORIOS';
  for (const [code, meta] of Object.entries(SUBMODULOS)) {
    if (meta.subModulo === s) return code;
  }
  return null;
}

/** Estado legible en columna `requerimientos.estado` según submódulo destino. */
export function resolveEstadoFromDestino(destinoSubmodulo, destinoEtapa) {
  const code = String(destinoEtapa || submoduloLabelToEtapa(destinoSubmodulo) || 'EVALUACION').toUpperCase();
  switch (code) {
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

export function resolveResponsableFromDestino(destinoSubmodulo, destinoPersona, etapaCode) {
  if (destinoPersona) return destinoPersona;
  const code = String(etapaCode || submoduloLabelToEtapa(destinoSubmodulo) || 'EVALUACION').toUpperCase();
  const defaults = {
    PROGRAMACION: 'Programador',
    DEC: 'DEC',
    EVALUACION: 'Director / Gerente',
    REGISTRADO: 'Usuario AU',
    ACTOS_PREPARATORIOS: 'Coordinador de Contratos Menores',
    INVITACIONES: 'Especialista Contrataciones',
    RECEPCION_COTIZACIONES: 'Especialista Contrataciones',
    CUADRO_COMPARATIVO: 'Especialista Contrataciones',
    CCP: 'Comité de Compras Públicas',
    EJECUCION: 'Ejecutor Contractual',
    ALMACEN: 'Almacén',
    TESORERIA: 'Tesorería',
  };
  return defaults[code] || 'Sistema';
}

export function formatObservacionTraza(motivo, destino = {}) {
  const persona = destino.destino_persona || destino.destinoPersona;
  const sub = destino.destino_submodulo || destino.destinoSubmodulo;
  if (persona && sub) return `Dirigida a ${persona} (${sub}): ${motivo}`;
  return motivo;
}

export function formatSubsanacionTraza(texto, destino = {}) {
  const persona = destino.destino_persona || destino.subsanacion_destino_persona || destino.destinoPersona;
  const sub = destino.destino_submodulo || destino.subsanacion_destino_submodulo || destino.destinoSubmodulo;
  if (persona && sub) return `Subsanación enviada a ${persona} (${sub}): ${texto}`;
  return texto;
}

export function trazaFromObservacionEntry(entry) {
  if (!entry) return '';
  if (entry.motivo) {
    return formatObservacionTraza(entry.motivo, {
      destino_persona: entry.destino_persona,
      destino_submodulo: entry.destino_submodulo,
    });
  }
  if (entry.subsanacion) {
    return formatSubsanacionTraza(entry.subsanacion, {
      destino_persona: entry.subsanacion_destino_persona,
      destino_submodulo: entry.subsanacion_destino_submodulo,
    });
  }
  return entry.respuesta || '';
}

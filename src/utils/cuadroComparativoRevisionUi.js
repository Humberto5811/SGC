/**
 * RC8.4 / RC8.5-B1 — UI helpers revisión Cuadro (roles / filtros de bandeja).
 * Resolución canónica compartida con backend (shared/cuadroComparativoRol.js).
 */
export {
  ROLES_REVISION,
  BANDEJA_ESTADOS_POR_ROL,
  ROLES_ACTUAR_COMO,
  resolveRolRevision as resolveRolRevisionCliente,
  resolveModoAperturaExpediente,
  resolveRolEfectivoRevision,
  normalizeActuarComo,
  labelRolRevision,
  puedeMostrarBotonesCcp,
  esEstadoRevisionExterna,
  isRolSistemaAdmin,
  normalizeTextoInstitucional,
} from '../../shared/cuadroComparativoRol.js';

import {
  ROLES_REVISION,
  BANDEJA_ESTADOS_POR_ROL,
  resolveRolRevision,
} from '../../shared/cuadroComparativoRol.js';

export function filtrarExpedientesPorRolCliente(rows = [], user = {}) {
  const rol = resolveRolRevision(user);
  const allowed = new Set((BANDEJA_ESTADOS_POR_ROL[rol] || BANDEJA_ESTADOS_POR_ROL.ANALISTA)
    .map((s) => String(s).toUpperCase()));
  return {
    rol,
    data: (rows || []).filter((r) => {
      const e = String(r.estado_cuadro || r.estado || '').toUpperCase();
      if (rol === ROLES_REVISION.ADMINISTRADOR) return true;
      if (rol === ROLES_REVISION.ANALISTA && (!e || e === 'PENDIENTE_ELABORAR')) return true;
      return allowed.has(e);
    }),
  };
}

export function labelAccionRevision(accion) {
  const map = {
    DERIVAR_COORDINADOR: 'Derivar a Coordinador CM',
    APROBAR_COORDINADOR: 'Aprobar (Coordinador CM)',
    CONFORMIDAD_COORDINADOR: 'Conformidad Coordinador CM',
    DERIVAR_DEC: 'Derivar al DEC',
    OBSERVAR_COORDINADOR: 'Observar / Devolver al Analista',
    CONFORMIDAD_DEC: 'Conformidad DEC',
    DERIVAR_ANALISTA: 'Derivar al Analista (Generación CCP)',
    APROBAR_DEC: 'Aprobar DEC → Analista',
    OBSERVAR_DEC: 'Observar / Devolver al Analista',
    OBSERVAR_DEC_A_COORD: 'Observar / Devolver al Coordinador CM',
    APROBAR_DERIVAR_CCP: 'Aprobar y derivar a CCP',
    GENERAR_CCP: 'Generar / Derivar a CCP',
  };
  return map[String(accion || '').toUpperCase()] || accion;
}

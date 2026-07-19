/**
 * RC8.4 — UI helpers revisión Cuadro (roles / filtros de bandeja).
 */

export const ROLES_REVISION = Object.freeze({
  ANALISTA: 'ANALISTA',
  COORDINADOR_8UIT: 'COORDINADOR_8UIT',
  DEC: 'DEC',
  CCP: 'CCP',
});

export const BANDEJA_ESTADOS_POR_ROL = Object.freeze({
  ANALISTA: [
    'PENDIENTE_ELABORAR', 'CUADRO_BORRADOR', 'EN_ELABORACION', 'BORRADOR',
    'ADJUDICADO', 'GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO',
    'OBSERVADO_COORDINADOR', 'OBSERVADO_DEC', 'APROBADO_DEC', 'PENDIENTE_CCP', 'OBSERVADO',
  ],
  COORDINADOR_8UIT: ['PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR'],
  DEC: ['PENDIENTE_DEC', 'FIRMADO_COORDINADOR'],
  CCP: ['PENDIENTE_CCP', 'DERIVADO_CCP'],
});

export function resolveRolRevisionCliente(user = {}) {
  const cargo = String(user.cargo || user.rol || '').toLowerCase();
  const permisos = user.permisos || {};
  const subs = Array.isArray(permisos.submodulos)
    ? permisos.submodulos.map((s) => String(s).toUpperCase())
    : [];
  if (/coordinador/.test(cargo) && (/8\s*uit/.test(cargo) || /\buit\b/.test(cargo))) {
    return ROLES_REVISION.COORDINADOR_8UIT;
  }
  if (/^dec\b|\bdec\b|jefe dec|especialista dec/.test(cargo) || user.rol === 'dec') {
    return ROLES_REVISION.DEC;
  }
  if (subs.includes('CCP') && /comit[eé]|ccp/.test(cargo)) {
    return ROLES_REVISION.CCP;
  }
  return ROLES_REVISION.ANALISTA;
}

export function filtrarExpedientesPorRolCliente(rows = [], user = {}) {
  const rol = resolveRolRevisionCliente(user);
  const allowed = new Set((BANDEJA_ESTADOS_POR_ROL[rol] || BANDEJA_ESTADOS_POR_ROL.ANALISTA)
    .map((s) => String(s).toUpperCase()));
  return {
    rol,
    data: (rows || []).filter((r) => {
      const e = String(r.estado_cuadro || r.estado || '').toUpperCase();
      if (rol === ROLES_REVISION.ANALISTA && (!e || e === 'PENDIENTE_ELABORAR')) return true;
      return allowed.has(e);
    }),
  };
}

export function labelAccionRevision(accion) {
  const map = {
    DERIVAR_COORDINADOR: 'Derivar a Coordinador 8 UIT',
    APROBAR_COORDINADOR: 'Aprobar (Coordinador)',
    CONFORMIDAD_COORDINADOR: 'Conformidad Coordinador',
    DERIVAR_DEC: 'Derivar al DEC',
    OBSERVAR_COORDINADOR: 'Observar (devolver a Analista)',
    CONFORMIDAD_DEC: 'Conformidad DEC',
    DERIVAR_ANALISTA: 'Derivar al Analista (Generación CCP)',
    APROBAR_DEC: 'Aprobar DEC → Analista',
    OBSERVAR_DEC: 'Observar DEC (corrección Analista)',
    GENERAR_CCP: 'Generar / Derivar a CCP',
  };
  return map[String(accion || '').toUpperCase()] || accion;
}

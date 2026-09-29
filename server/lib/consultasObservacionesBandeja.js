/** Etiquetas bandeja Consultas y Observaciones (BE). */
export const SUBMODULO_CONSULTAS_OBSERVACIONES = 'Consultas y Observaciones';

/** N° Inv. canónico para fila de bandeja (C3-D5): join exacto o Legacy. */
export function resolveNroInvitacionConsultaBandeja(row = {}) {
  if (row.invitacion_id == null) {
    return { display: 'Legacy', legacy: true, nro: null };
  }
  const nro = row.nro_invitacion;
  if (nro != null && Number.isFinite(Number(nro))) {
    return { display: String(Number(nro)), legacy: false, nro: Number(nro) };
  }
  return { display: '—', legacy: false, nro: null };
}

/** KPIs por consulta individual (no agrupar por SC). */
export function computeConsultasBandejaStats(consultas = []) {
  const list = Array.isArray(consultas) ? consultas : [];
  const norm = (c) => String(c?.estado || '').trim().toUpperCase();
  return {
    total: list.length,
    pendientes: list.filter((c) => norm(c) === 'PENDIENTE').length,
    respondidas: list.filter((c) => norm(c) === 'RESPONDIDA').length,
  };
}

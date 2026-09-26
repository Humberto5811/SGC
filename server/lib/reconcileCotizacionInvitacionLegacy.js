/**
 * RC8.17.8H6-C3-D4.1 — Criterio de reconciliación legacy cp.invitacion_id NULL.
 * Solo asociación inequívoca vía estado canónico de invitación (presentación).
 */

export const ESTADO_INVITACION_COTIZACION_PRESENTADA = 'COTIZACION_PRESENTADA';

export function normalizeEstadoInvitacion(estado) {
  return String(estado || '').trim().toUpperCase();
}

export function isLegacyCotizacionRow(cp) {
  if (!cp) return false;
  if (normalizeEstadoInvitacion(cp.estado) !== 'COTIZACION_PRESENTADA') return false;
  return cp.invitacion_id == null && cp.nro_invitacion_presentacion == null;
}

/**
 * Invitaciones elegibles: mismo SC+proveedor, enviadas antes o en fecha de presentación,
 * y marcadas COTIZACION_PRESENTADA (evidencia fuerte de acto que recibió la cotización).
 */
export function filterInvitacionesElegiblesParaLegacy(cp, invitaciones = []) {
  const sid = Number(cp.solicitud_id);
  const pid = Number(cp.proveedor_id);
  const fp = cp.fecha_presentacion ? new Date(cp.fecha_presentacion).getTime() : NaN;
  if (!Number.isFinite(sid) || !Number.isFinite(pid)) return [];

  return invitaciones.filter((ip) => {
    if (Number(ip.solicitud_id) !== sid || Number(ip.proveedor_id) !== pid) return false;
    if (normalizeEstadoInvitacion(ip.estado) !== ESTADO_INVITACION_COTIZACION_PRESENTADA) {
      return false;
    }
    if (ip.nro_invitacion == null || !Number.isFinite(Number(ip.nro_invitacion))) return false;
    if (Number.isFinite(fp) && ip.fecha_envio) {
      const fe = new Date(ip.fecha_envio).getTime();
      if (Number.isFinite(fe) && fe > fp) return false;
    }
    return true;
  });
}

/**
 * @returns {{ status: 'reconciliable'|'no_candidate'|'ambiguous'|'not_legacy', invitacion?: object, candidates?: object[] }}
 */
export function resolveLegacyCotizacionInvitacionLink(cp, invitaciones = []) {
  if (!isLegacyCotizacionRow(cp)) {
    return { status: 'not_legacy' };
  }
  const elegibles = filterInvitacionesElegiblesParaLegacy(cp, invitaciones);
  if (elegibles.length === 0) return { status: 'no_candidate', candidates: [] };
  if (elegibles.length > 1) return { status: 'ambiguous', candidates: elegibles };
  return { status: 'reconciliable', invitacion: elegibles[0], candidates: elegibles };
}

export async function loadInvitacionesForCotizaciones(client, cotizacionRows) {
  const pairs = [...new Set(cotizacionRows.map((c) => `${c.solicitud_id}:${c.proveedor_id}`))];
  if (!pairs.length) return [];
  const sids = [...new Set(cotizacionRows.map((c) => Number(c.solicitud_id)).filter(Number.isFinite))];
  const { rows } = await client.query(`
    SELECT id, solicitud_id, proveedor_id, requerimiento_id, nro_invitacion, estado,
      estado_invitacion, fecha_envio, fecha_ultimo_envio
    FROM invitacion_proveedores
    WHERE solicitud_id = ANY($1::int[])
    ORDER BY solicitud_id, proveedor_id, nro_invitacion, id
  `, [sids]);
  return rows;
}

export async function fetchLegacyCotizacionesPresentadas(client, { solicitudCodigo = null, cotizacionId = null } = {}) {
  const params = [];
  let extra = '';
  if (solicitudCodigo) {
    params.push(solicitudCodigo);
    extra += ` AND sc.codigo = $${params.length}`;
  }
  if (cotizacionId != null) {
    params.push(Number(cotizacionId));
    extra += ` AND cp.id = $${params.length}`;
  }
  const { rows } = await client.query(`
    SELECT cp.id, cp.solicitud_id, cp.proveedor_id, cp.requerimiento_id,
      cp.estado, cp.fecha_presentacion, cp.invitacion_id, cp.nro_invitacion_presentacion,
      sc.codigo AS solicitud_codigo
    FROM cotizaciones_proveedor cp
    JOIN solicitudes_cotizacion sc ON sc.id = cp.solicitud_id
    WHERE UPPER(TRIM(COALESCE(cp.estado, ''))) = 'COTIZACION_PRESENTADA'
      AND cp.invitacion_id IS NULL
      AND cp.nro_invitacion_presentacion IS NULL
      ${extra}
    ORDER BY cp.id
  `, params);
  return rows;
}

async function assertNoCotizacionOnInvitacion(client, invitacionId, excludeCotizacionId) {
  const { rows } = await client.query(`
    SELECT id FROM cotizaciones_proveedor
    WHERE invitacion_id = $1 AND id <> $2
    LIMIT 1
  `, [invitacionId, excludeCotizacionId]);
  return rows.length === 0;
}

/**
 * Revalida y aplica UPDATE de los dos campos permitidos. Retorna resultado detallado.
 */
export async function applyLegacyCotizacionInvitacionLink(client, cotizacionId, invitacionesCache = null) {
  const { rows: cpRows } = await client.query(`
    SELECT cp.id, cp.solicitud_id, cp.proveedor_id, cp.requerimiento_id,
      cp.estado, cp.fecha_presentacion, cp.invitacion_id, cp.nro_invitacion_presentacion,
      sc.codigo AS solicitud_codigo
    FROM cotizaciones_proveedor cp
    JOIN solicitudes_cotizacion sc ON sc.id = cp.solicitud_id
    WHERE cp.id = $1
    FOR UPDATE OF cp
  `, [cotizacionId]);
  const cp = cpRows[0];
  if (!cp) return { cotizacion_id: cotizacionId, status: 'missing' };

  const resolved = resolveLegacyCotizacionInvitacionLink(
    cp,
    invitacionesCache || await loadInvitacionesForCotizaciones(client, [cp]),
  );
  if (resolved.status !== 'reconciliable') {
    return { cotizacion_id: cotizacionId, solicitud_codigo: cp.solicitud_codigo, ...resolved };
  }

  const inv = resolved.invitacion;
  const nro = Number(inv.nro_invitacion);
  if (!Number.isFinite(nro) || nro <= 0) {
    return { cotizacion_id: cotizacionId, status: 'invalid_nro_invitacion', invitacion_id: inv.id };
  }

  const uniqueOk = await assertNoCotizacionOnInvitacion(client, inv.id, cp.id);
  if (!uniqueOk) {
    return { cotizacion_id: cotizacionId, status: 'conflict_invitacion_id_taken', invitacion_id: inv.id };
  }

  const { rowCount } = await client.query(`
    UPDATE cotizaciones_proveedor SET
      invitacion_id = $2,
      nro_invitacion_presentacion = $3
    WHERE id = $1
      AND invitacion_id IS NULL
      AND nro_invitacion_presentacion IS NULL
      AND UPPER(TRIM(COALESCE(estado, ''))) = 'COTIZACION_PRESENTADA'
  `, [cp.id, inv.id, nro]);

  if (!rowCount) {
    return { cotizacion_id: cotizacionId, status: 'race_or_changed', invitacion_id: inv.id };
  }

  return {
    cotizacion_id: cp.id,
    solicitud_codigo: cp.solicitud_codigo,
    status: 'applied',
    invitacion_id: inv.id,
    nro_invitacion_presentacion: nro,
  };
}

export async function analyzeLegacyCotizaciones(client, options = {}) {
  const legacyRows = await fetchLegacyCotizacionesPresentadas(client, options);
  if (!legacyRows.length) {
    return { legacy: [], reconciliable: [], ambiguous: [], no_candidate: [], not_legacy: [] };
  }
  const invAll = await loadInvitacionesForCotizaciones(client, legacyRows);
  const byCp = legacyRows.map((cp) => {
    const invs = invAll.filter(
      (ip) => Number(ip.solicitud_id) === Number(cp.solicitud_id)
        && Number(ip.proveedor_id) === Number(cp.proveedor_id),
    );
    const resolved = resolveLegacyCotizacionInvitacionLink(cp, invs);
    return { cp, invitaciones: invs, ...resolved };
  });

  return {
    legacy: byCp,
    reconciliable: byCp.filter((r) => r.status === 'reconciliable'),
    ambiguous: byCp.filter((r) => r.status === 'ambiguous'),
    no_candidate: byCp.filter((r) => r.status === 'no_candidate'),
    not_legacy: byCp.filter((r) => r.status === 'not_legacy'),
  };
}

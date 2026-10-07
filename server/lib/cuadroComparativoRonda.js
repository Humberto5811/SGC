/**
 * RC8.17.8H6-C3-D10-A — Contexto operativo del Cuadro Comparativo.
 *
 * NO existe un "ID global de ronda" de la SC: `nro_invitacion` en invitacion_proveedores
 * es ordinal por proveedor (reinvitaciones). Varios proveedores de una misma oleada pueden
 * compartir el mismo ordinal. El agrupador operativo del cuadro es:
 *
 *   solicitud_id + nro_invitacion resuelto + elegibilidad APTO→CUADRO_COMPARATIVO
 *
 * `invitacion_id` / `cotizacion_ancla_id` en cuadros_comparativos = ancla/trazabilidad.
 */
import { query } from '../db.js';

export const CUADRO_RONDA_AMBIGUA = 'CUADRO_RONDA_AMBIGUA';
export const CUADRO_RONDA_SIN_ELEGIBLES = 'CUADRO_RONDA_SIN_ELEGIBLES';

function parseInformeRaw(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw || '{}');
  } catch (_) {
    return {};
  }
}

export function derivacionSubmoduloCuadro(cot) {
  const inf = parseInformeRaw(cot?.validacion_informe);
  return String(inf?.derivacion_salida?.submodulo || '').trim().toUpperCase();
}

export function cotizacionElegibleCuadroRonda(cot) {
  if (String(cot?.estado || '').toUpperCase() !== 'COTIZACION_PRESENTADA') return false;
  if (String(cot?.validacion_estado || '').toUpperCase() !== 'APTO') return false;
  return derivacionSubmoduloCuadro(cot) === 'CUADRO_COMPARATIVO';
}

export function nroInvitacionFromCot(cot) {
  const pres = parseInt(cot?.nro_invitacion_presentacion, 10);
  if (Number.isFinite(pres) && pres > 0) return pres;
  const n = parseInt(cot?.nro_invitacion, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function labelInvitacionCuadro(cotOrNro) {
  const n = typeof cotOrNro === 'number'
    ? cotOrNro
    : nroInvitacionFromCot(cotOrNro);
  return n ? `Inv. ${n}` : '—';
}

/** Agrupa elegibles por nro_invitacion (ronda operativa). */
export function agruparElegiblesPorNroInvitacion(cotizaciones = []) {
  const map = new Map();
  (cotizaciones || []).forEach((c) => {
    if (!cotizacionElegibleCuadroRonda(c)) return;
    const nro = nroInvitacionFromCot(c);
    if (!Number.isFinite(nro)) return;
    if (!map.has(nro)) map.set(nro, []);
    map.get(nro).push(c);
  });
  return map;
}

/** @deprecated alias tests */
export const agruparElegiblesPorInvitacion = agruparElegiblesPorNroInvitacion;

function pickAncla(lista = []) {
  const sorted = [...lista].sort((a, b) => Number(a.id) - Number(b.id));
  return sorted[0] || null;
}

/**
 * Resuelve la ronda activa (nro_invitacion) para una SC.
 * opts.inviacionId / opts.nroInvitacion fuerzan la ronda.
 */
export function resolverInvitacionRondaCuadro(cotizacionesPresentadas = [], opts = {}) {
  const grupos = agruparElegiblesPorNroInvitacion(cotizacionesPresentadas);
  let nroObjetivo = opts.nroInvitacion != null ? parseInt(opts.nroInvitacion, 10) : null;
  if (!Number.isFinite(nroObjetivo) && opts.invitacionId != null) {
    const invFk = parseInt(opts.invitacionId, 10);
    if (Number.isFinite(invFk)) {
      const cotAncla = (cotizacionesPresentadas || []).find(
        (c) => Number(c.invitacion_id) === invFk,
      );
      if (!cotAncla) {
        const err = new Error(`invitacion_id=${invFk} no pertenece a la solicitud`);
        err.code = CUADRO_RONDA_SIN_ELEGIBLES;
        err.status = 409;
        throw err;
      }
      nroObjetivo = nroInvitacionFromCot(cotAncla);
    }
  }

  if (Number.isFinite(nroObjetivo)) {
    const lista = grupos.get(nroObjetivo);
    if (!lista?.length) {
      const err = new Error(
        `No hay cotizaciones APTO derivadas a Cuadro para la invitación nro ${nroObjetivo}`,
      );
      err.code = CUADRO_RONDA_SIN_ELEGIBLES;
      err.status = 409;
      throw err;
    }
    const ancla = pickAncla(lista);
    return buildRonda(nroObjetivo, lista, ancla);
  }

  const nros = [...grupos.keys()];
  if (!nros.length) {
    const err = new Error(
      'No hay cotizaciones APTO con derivación a Cuadro Comparativo para esta solicitud',
    );
    err.code = CUADRO_RONDA_SIN_ELEGIBLES;
    err.status = 409;
    throw err;
  }
  if (nros.length > 1) {
    const err = new Error(
      `Hay ${nros.length} rondas activas en Cuadro (nro invitación: ${nros.join(', ')}). `
      + 'Indique invitacionId o nroInvitacion.',
    );
    err.code = CUADRO_RONDA_AMBIGUA;
    err.status = 409;
    err.nro_invitaciones = nros;
    throw err;
  }

  const nro = nros[0];
  const lista = grupos.get(nro) || [];
  return buildRonda(nro, lista, pickAncla(lista));
}

function buildRonda(nroInvitacion, lista, ancla) {
  return {
    nro_invitacion: nroInvitacion,
    invitacion_id: ancla?.invitacion_id != null ? Number(ancla.invitacion_id) : null,
    cotizaciones_ronda: lista,
    cotizacion_ancla_id: ancla?.id ?? null,
    invitacion_label: labelInvitacionCuadro(nroInvitacion),
    ambigua: false,
  };
}

export function filtrarDatosJsonPorRonda(datosJson, cotizacionIdsSet) {
  if (!datosJson || !cotizacionIdsSet?.size) return datosJson;
  const out = { ...datosJson };
  if (Array.isArray(out.resumen_proveedores)) {
    out.resumen_proveedores = out.resumen_proveedores.filter(
      (p) => cotizacionIdsSet.has(Number(p.cotizacion_id)),
    );
  }
  if (Array.isArray(out.items)) {
    out.items = out.items.map((it) => ({
      ...it,
      ofertas: (it.ofertas || []).filter(
        (o) => cotizacionIdsSet.has(Number(o.cotizacion_id)),
      ),
    }));
  }
  return out;
}

export function metaRondaCuadro(ronda) {
  const ids = (ronda?.cotizaciones_ronda || []).map((c) => c.id).filter(Boolean);
  return {
    nro_invitacion: ronda?.nro_invitacion ?? null,
    invitacion_id: ronda?.invitacion_id ?? null,
    invitacion_label: ronda?.invitacion_label || labelInvitacionCuadro(ronda?.nro_invitacion),
    cotizacion_ancla_id: ronda?.cotizacion_ancla_id ?? null,
    cotizacion_ids: ids,
  };
}

/** Criterio único de elegibilidad Cuadro (bandeja, resolver, matriz, PDF con contexto). */
export const SQL_FILTER_ELEGIBLE_CUADRO_RONDA = `
  cot.validacion_estado = 'APTO'
  AND UPPER(TRIM(COALESCE(cot.validacion_informe->'derivacion_salida'->>'submodulo', ''))) = 'CUADRO_COMPARATIVO'
`;

export const SQL_WHERE_COTIZACION_ELEGIBLE_CUADRO = `
  cot.estado = 'COTIZACION_PRESENTADA'
  AND ${SQL_FILTER_ELEGIBLE_CUADRO_RONDA}
`;

/** Filtra filas ya cargadas (p. ej. post resolveValidacionEstado). */
export function filtrarSoloElegiblesCuadro(cotizaciones = []) {
  return (cotizaciones || []).filter((c) => cotizacionElegibleCuadroRonda(c));
}

export function idsCotizacionesElegibles(cotizaciones = []) {
  return new Set(filtrarSoloElegiblesCuadro(cotizaciones).map((c) => Number(c.id)));
}

export const SQL_NRO_INVITACION_COT = `
  COALESCE(NULLIF(cot.nro_invitacion_presentacion, 0), ip.nro_invitacion)::int
`;

export async function loadCotizacionesPresentadasRonda(solicitudId, opts = {}) {
  const sid = parseInt(solicitudId, 10);
  const params = [sid];
  let extraClause = '';
  const soloElegibles = opts.soloElegiblesCuadro !== false
    && opts.soloElegiblesCuadro !== 'false';
  const nroFilter = opts.nroInvitacion != null ? parseInt(opts.nroInvitacion, 10) : null;
  if (Number.isFinite(nroFilter)) {
    params.push(nroFilter);
    extraClause = ` AND ${SQL_NRO_INVITACION_COT} = $2`;
  } else if (opts.invitacionId != null && Number.isFinite(parseInt(opts.invitacionId, 10))) {
    params.push(parseInt(opts.invitacionId, 10));
    extraClause = ' AND cot.invitacion_id = $2';
  }
  const elegibleClause = soloElegibles
    ? ` AND ${SQL_WHERE_COTIZACION_ELEGIBLE_CUADRO}`
    : ' AND cot.estado = \'COTIZACION_PRESENTADA\'';

  const { rows: scRows } = await query(
    `SELECT tipo FROM solicitudes_cotizacion WHERE id = $1`,
    [sid],
  );
  const tipoSol = scRows[0]?.tipo || '';

  const { rows } = await query(`
    SELECT cot.id, cot.solicitud_id, cot.proveedor_id, cot.estado, cot.validacion_estado,
      cot.propuesta_tecnica, cot.propuesta_economica, cot.validacion_informe,
      cot.fecha_presentacion, cot.updated_at,
      cot.invitacion_id,
      cot.nro_invitacion_presentacion,
      ip.nro_invitacion,
      p.ruc, p.razon_social,
      p.telefono, p.correo, p.persona_contacto, p.emails,
      p.cantidad_invitaciones AS cantidad_invitaciones_proveedor,
      inv.fecha_envio_invitacion,
      inv.n_invitaciones_solicitud
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    LEFT JOIN invitacion_proveedores ip ON ip.id = cot.invitacion_id
    LEFT JOIN LATERAL (
      SELECT
        MIN(ip2.fecha_envio) AS fecha_envio_invitacion,
        COUNT(*) FILTER (WHERE ip2.fecha_envio IS NOT NULL)::int AS n_invitaciones_solicitud
      FROM invitacion_proveedores ip2
      WHERE ip2.proveedor_id = cot.proveedor_id
        AND (
          ip2.solicitud_id = cot.solicitud_id
          OR ip2.requerimiento_id IN (
            SELECT sr.requerimiento_id
            FROM solicitud_requerimientos sr
            WHERE sr.solicitud_id = cot.solicitud_id
          )
        )
    ) inv ON TRUE
    WHERE cot.solicitud_id = $1
      ${elegibleClause}
      ${extraClause}
    ORDER BY p.razon_social ASC
  `, params);

  return rows.map((r) => {
    const fechaSol = r.fecha_envio_invitacion || null;
    const nSolicitud = Number(r.n_invitaciones_solicitud) || 0;
    const nProveedor = Number(r.cantidad_invitaciones_proveedor) || 0;
    const reiteraciones = nSolicitud > 0 ? nSolicitud : (fechaSol ? Math.max(nProveedor, 1) : nProveedor);
    return {
      ...r,
      validacion_estado: r.validacion_estado,
      solicitud_tipo: tipoSol,
      fecha_solicitud: fechaSol,
      reiteraciones,
    };
  });
}

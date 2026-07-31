/**
 * Normalización común de entregas/entregables para cotización portal
 * (Bienes, Servicios, Locación).
 */

function parsePayload(source) {
  if (!source) return {};
  if (typeof source === 'string') {
    try {
      const p = JSON.parse(source);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch (_) {
      return {};
    }
  }
  if (source.payload != null && typeof source.payload !== 'object') {
    return { ...source, ...parsePayload(source.payload) };
  }
  if (source.payload && typeof source.payload === 'object') {
    return { ...source.payload, ...source };
  }
  return typeof source === 'object' ? source : {};
}

export function normalizeTipoOrigen(tipo) {
  const t = String(tipo || '').trim().toLowerCase();
  // Locación antes que Servicios: "Locación de servicios" no debe clasificarse como SERVICIO
  if (/locad|locaci[oó]n/.test(t)) return 'LOCACION';
  if (/servicio/.test(t)) return 'SERVICIO';
  return 'BIEN';
}

function hasText(v) {
  return String(v ?? '').trim() !== '';
}

/** Antes de mapear: evita inventar "Entregable N" sobre filas vacías del TDR. */
function isRawEntregableMeaningful(row) {
  if (!row || typeof row !== 'object') return false;
  return hasText(row.nombre) || hasText(row.entregable) || hasText(row.descripcion)
    || hasText(row.plazo_texto) || hasText(row.plazo) || hasText(row.condicion)
    || hasText(row.producto)
    || (row.cantidad != null && Number(row.cantidad) > 0)
    || (row.precio != null && Number(row.precio) > 0)
    || (row.precio_unitario != null && Number(row.precio_unitario) > 0)
    || (row.numero_entrega != null && (hasText(row.plazo) || hasText(row.condicion) || Number(row.cantidad) > 0));
}

function isRowMeaningful(row) {
  if (!row || typeof row !== 'object') return false;
  return hasText(row.nombre) || hasText(row.descripcion) || hasText(row.plazo_texto)
    || hasText(row.entregable) || hasText(row.plazo) || hasText(row.condicion)
    || (row.cantidad != null && Number(row.cantidad) > 0)
    || (row.precio != null && Number(row.precio) > 0)
    || (row.precio_unitario != null && Number(row.precio_unitario) > 0);
}

function mapCommon(row, idx, tipoOrigen, defaults = {}) {
  const numero = Number(row.numero ?? row.numero_entrega ?? row.nro ?? idx + 1) || (idx + 1);
  const nombre = String(
    row.nombre || row.entregable || defaults.nombre || `Entregable ${numero}`,
  ).trim();
  const descripcion = String(row.descripcion || row.condicion || row.producto || '').trim();
  const plazo_texto = String(row.plazo_texto || row.plazo || '').trim();
  return {
    id_fuente: row.id_fuente ?? row.id ?? numero,
    numero,
    nombre,
    descripcion,
    plazo_texto,
    fecha_entrega: row.fecha_entrega || null,
    cantidad: row.cantidad != null && row.cantidad !== '' ? Number(row.cantidad) : (defaults.cantidad ?? null),
    unidad_medida: String(row.unidad_medida || row.um || defaults.unidad_medida || '').trim() || defaults.unidad_medida || 'UND',
    tipo_origen: tipoOrigen,
    precio: row.precio != null ? Number(row.precio)
      : (row.precio_unitario != null ? Number(row.precio_unitario) : null),
  };
}

function fromBienes(payload) {
  const list = Array.isArray(payload.entregas) ? payload.entregas : [];
  return list
    .filter(isRawEntregableMeaningful)
    .map((e, i) => mapCommon(e, i, 'BIEN', {
      nombre: `Entrega ${(Number(e.numero_entrega) || i + 1)}`,
      unidad_medida: 'UND',
    }))
    .filter(isRowMeaningful);
}

function fromServicios(payload) {
  const info = Array.isArray(payload.servicioInformacion) ? payload.servicioInformacion
    : (Array.isArray(payload.informacion) ? payload.informacion : []);
  const ents = Array.isArray(payload.servicioEntregas) ? payload.servicioEntregas : [];
  if (info.length) {
    return info
      .filter(isRawEntregableMeaningful)
      .map((e, i) => {
        const entMeta = ents[i] || {};
        return mapCommon({
          ...e,
          nombre: e.entregable || e.nombre,
          plazo: e.plazo || entMeta.plazo,
          descripcion: e.descripcion || entMeta.condicion || '',
        }, i, 'SERVICIO', { unidad_medida: 'Servicio', cantidad: 1 });
      })
      .filter(isRowMeaningful);
  }
  return ents
    .filter(isRawEntregableMeaningful)
    .map((e, i) => mapCommon({
      ...e,
      nombre: e.condicion || `Entregable ${i + 1}`,
      plazo: e.plazo,
    }, i, 'SERVICIO', { unidad_medida: 'Servicio', cantidad: 1 }))
    .filter(isRowMeaningful);
}

function fromLocacion(payload) {
  const info = Array.isArray(payload.locadorInformacion) ? payload.locadorInformacion
    : (Array.isArray(payload.informacion) ? payload.informacion
      : (Array.isArray(payload.plazos) ? payload.plazos : []));
  const ents = Array.isArray(payload.locadorEntregas) ? payload.locadorEntregas : [];
  if (info.length) {
    return info
      .filter(isRawEntregableMeaningful)
      .map((e, i) => {
        const entMeta = ents[i] || {};
        return mapCommon({
          ...e,
          nombre: e.entregable || e.nombre,
          plazo: e.plazo || entMeta.plazo,
          descripcion: e.descripcion || entMeta.condicion || '',
        }, i, 'LOCACION', { unidad_medida: 'Servicio', cantidad: 1 });
      })
      .filter(isRowMeaningful);
  }
  return ents
    .filter(isRawEntregableMeaningful)
    .map((e, i) => mapCommon({
      ...e,
      nombre: e.condicion || `Entregable ${i + 1}`,
      plazo: e.plazo,
    }, i, 'LOCACION', { unidad_medida: 'Servicio', cantidad: 1 }))
    .filter(isRowMeaningful);
}

/**
 * @param {object} requerimientoOrPayload — requerimiento con payload, o payload directo,
 *   o { entregables_programados: [...] } / { entregables_cotizados: [...] }
 * @param {string} [tipo] — Bienes | Servicios | Locadores | tipo BD
 * @returns {Array<object>}
 */
export function resolveEntregablesCotizacion(requerimientoOrPayload, tipo) {
  if (!requerimientoOrPayload) return [];

  // Ya normalizado
  if (Array.isArray(requerimientoOrPayload)) {
    return requerimientoOrPayload.map((e, i) => mapCommon(e, i, normalizeTipoOrigen(tipo || e.tipo_origen)))
      .filter(isRowMeaningful);
  }
  if (Array.isArray(requerimientoOrPayload.entregables_programados)) {
    return resolveEntregablesCotizacion(requerimientoOrPayload.entregables_programados, tipo);
  }
  if (Array.isArray(requerimientoOrPayload.entregables_cotizados)) {
    return resolveEntregablesCotizacion(requerimientoOrPayload.entregables_cotizados, tipo);
  }

  const payload = parsePayload(requerimientoOrPayload);
  const tipoOrigen = normalizeTipoOrigen(
    tipo || requerimientoOrPayload.tipo || payload.tipo || '',
  );

  if (tipoOrigen === 'BIEN') return fromBienes(payload);
  if (tipoOrigen === 'SERVICIO') return fromServicios(payload);
  return fromLocacion(payload);
}

/** Fusiona precios guardados en borrador con la lista programada. */
export function mergeEntregablesConPrecios(programados = [], guardados = []) {
  const byNum = new Map();
  (Array.isArray(guardados) ? guardados : []).forEach((g, i) => {
    const n = Number(g.numero ?? g.nro ?? i + 1);
    byNum.set(n, g);
  });
  return (programados.length ? programados : (guardados || [])).map((p, i) => {
    const n = Number(p.numero ?? i + 1);
    const g = byNum.get(n) || guardados[i] || {};
    const precio = g.precio != null ? Number(g.precio)
      : (g.precio_unitario != null ? Number(g.precio_unitario)
        : (g.total != null ? Number(g.total) : (p.precio != null ? Number(p.precio) : 0)));
    return {
      ...p,
      ...mapCommon({ ...p, ...g, precio }, i, p.tipo_origen || 'SERVICIO'),
      precio_unitario: precio,
      total: precio,
      um: g.um || p.unidad_medida || 'Servicio',
      nro: n,
    };
  }).filter(isRowMeaningful);
}

export function sumPrecioEntregables(list = []) {
  return (list || []).reduce((acc, e) => {
    const n = Number(e.precio ?? e.precio_unitario ?? e.total ?? 0);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/** Extrae del payload solo campos de entregas (sin adjuntos pesados). */
export function extractEntregablesSourceFromPayload(payload, tipo) {
  const p = parsePayload(payload);
  const t = normalizeTipoOrigen(tipo);
  if (t === 'BIEN') return { tipo: 'Bienes', entregas: p.entregas || [] };
  if (t === 'SERVICIO') {
    return {
      tipo: 'Servicios',
      servicioInformacion: p.servicioInformacion || p.informacion || [],
      servicioEntregas: p.servicioEntregas || [],
    };
  }
  return {
    tipo: 'Locadores',
    locadorInformacion: p.locadorInformacion || p.informacion || p.plazos || [],
    locadorEntregas: p.locadorEntregas || [],
  };
}

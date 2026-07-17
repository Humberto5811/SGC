/**
 * Normalización económica / matriz Cuadro Comparativo — Bienes (RC8.2).
 * No inventa precios; documenta inconsistencias.
 */

const TOLERANCIA_TOTAL = 0.02;

export function parseJsonSafe(val, fallback = {}) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return val;
  try { return JSON.parse(val || 'null') ?? fallback; } catch (_) { return fallback; }
}

export function toNumberOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function pickText(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v !== 'object' && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/** Clave estable: item_key | itemId | codigo_item | reqId-index | fallback idx */
export function resolveItemKey(raw, idx = 0, detalleHint = null) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const direct = pickText(o, 'item_key', 'itemKey', 'itemId', 'item_id', 'codigo_item', 'codigoItem');
  if (direct) return direct;
  const reqId = o.requerimiento_id ?? o.requerimientoId ?? detalleHint?.requerimiento_id;
  const itemIndex = o.item_index ?? o.itemIndex ?? detalleHint?.item_index ?? idx;
  if (reqId != null && reqId !== '') return `${reqId}-${itemIndex}`;
  // Fallback documentado: índice del array (último recurso)
  return `idx-${idx}`;
}

export function normalizeCuadroItem(detalleItem, idx = 0) {
  const it = detalleItem && typeof detalleItem === 'object' ? detalleItem : {};
  const item_key = resolveItemKey(it, idx, it);
  const cantidad = toNumberOrNull(it.cantidad ?? it.cant ?? it.cantidad_solicitada);
  return {
    item_key,
    requerimiento_id: it.requerimiento_id ?? it.requerimientoId ?? null,
    requerimiento_codigo: pickText(it, 'requerimiento_codigo', 'codigo_requerimiento', 'codigo', 'req', 'nro_req') || '',
    pedido_sigamef: pickText(it, 'pedido_sigamef', 'pedidoSigamef', 'nro_pedido') || '',
    codigo_sigamef: pickText(it, 'codigo_sigamef', 'codigoSigamef', 'item_bien', 'codigo') || '',
    descripcion: pickText(it, 'descripcion', 'denominacion', 'nombre_item', 'objeto') || '',
    unidad_medida: pickText(it, 'unidad_medida', 'um', 'unidad') || 'UND',
    cantidad,
    item_index: it.item_index ?? idx,
    _fallback_key: String(item_key).startsWith('idx-'),
  };
}

/**
 * Extrae oferta económica de un ítem / mapa precios.
 * No inventa unitario desde monto global.
 */
export function mapPropuestaEconomicaPorItem(propuestaEconomica, itemKey, cantidadBase = null) {
  const eco = parseJsonSafe(propuestaEconomica, {});
  const precios = eco.precios && typeof eco.precios === 'object' && !Array.isArray(eco.precios)
    ? eco.precios
    : {};
  let entry = precios[itemKey];
  if (!entry && Array.isArray(eco.items)) {
    entry = eco.items.find((x) => resolveItemKey(x) === itemKey) || null;
  }
  if (!entry && Array.isArray(eco.detalle)) {
    entry = eco.detalle.find((x) => resolveItemKey(x) === itemKey) || null;
  }
  entry = entry && typeof entry === 'object' ? entry : {};

  const precio_unitario = toNumberOrNull(
    entry.precio_unitario ?? entry.unitario ?? entry.precioUnitario ?? entry.pu,
  );
  let precio_total = toNumberOrNull(
    entry.precio_total ?? entry.total ?? entry.precioTotal ?? entry.monto,
  );
  const moneda = pickText(entry, 'moneda') || pickText(eco, 'moneda') || 'PEN';

  const inconsistencias = [];
  const cant = toNumberOrNull(cantidadBase);

  if (precio_unitario != null && cant != null) {
    const calc = Math.round(cant * precio_unitario * 100) / 100;
    if (precio_total == null) {
      precio_total = calc;
    } else if (Math.abs(calc - precio_total) > TOLERANCIA_TOTAL) {
      inconsistencias.push({
        tipo: 'TOTAL_INCONSISTENTE',
        item_key: itemKey,
        mensaje: `Total persistido (${precio_total}) ≠ calculado cantidad×unitario (${calc})`,
        total_persistido: precio_total,
        total_calculado: calc,
      });
    }
  }

  const soloMontoGlobal = precio_unitario == null && precio_total == null && toNumberOrNull(eco.monto) != null;
  if (soloMontoGlobal) {
    inconsistencias.push({
      tipo: 'SOLO_MONTO_GLOBAL',
      item_key: itemKey,
      mensaje: 'Cotización con monto global sin precios por ítem — no se prorratea',
      monto_global: toNumberOrNull(eco.monto),
    });
  }

  return {
    precio_unitario,
    precio_total,
    moneda,
    monto_global: toNumberOrNull(eco.monto),
    inconsistencias,
    incompleto: precio_unitario == null || precio_total == null || cant == null,
  };
}

export function normalizeOfertaProveedor(cotizacionRow, itemNorm, propTecItem = {}) {
  const cot = cotizacionRow || {};
  const tec = propTecItem && typeof propTecItem === 'object' ? propTecItem : {};
  const valEst = String(cot.validacion_estado || '').toUpperCase();
  const ecoMap = mapPropuestaEconomicaPorItem(
    cot.propuesta_economica,
    itemNorm.item_key,
    itemNorm.cantidad,
  );
  const cumple = valEst === 'APTO';
  const ofertaValida = cumple && !ecoMap.incompleto && !ecoMap.inconsistencias.some((i) => i.tipo === 'TOTAL_INCONSISTENTE' || i.tipo === 'SOLO_MONTO_GLOBAL');

  return {
    proveedor_id: cot.proveedor_id,
    cotizacion_id: cot.id,
    ruc: cot.ruc || '',
    razon_social: cot.razon_social || '',
    validacion_estado: valEst || 'PENDIENTE',
    cumple_tecnicamente: cumple,
    oferta_valida: ofertaValida,
    precio_unitario: ecoMap.precio_unitario,
    precio_total: ecoMap.precio_total,
    moneda: ecoMap.moneda,
    marca: pickText(tec, 'marca'),
    modelo: pickText(tec, 'modelo'),
    procedencia: pickText(tec, 'pais', 'procedencia', 'origen'),
    garantia: pickText(tec, 'garantia', 'garantía'),
    plazo_entrega: pickText(tec, 'plazo_entrega', 'plazoEntrega', 'plazo'),
    observaciones: pickText(tec, 'observaciones', 'observacion', 'notas') || '',
    observacion_analista: '',
    inconsistencias: ecoMap.inconsistencias,
    incompleto: ecoMap.incompleto || !itemNorm.item_key || !valEst,
    incompleto_motivo: [
      !itemNorm.item_key ? 'Sin item_key' : '',
      itemNorm.cantidad == null ? 'Sin cantidad' : '',
      ecoMap.precio_unitario == null ? 'Sin precio unitario' : '',
      ecoMap.precio_total == null ? 'Sin precio total' : '',
      !valEst ? 'Sin validación' : '',
      ecoMap.inconsistencias.map((i) => i.mensaje).join('; '),
    ].filter(Boolean).join(' · ') || null,
  };
}

/**
 * Construye matriz comparativa Bienes desde fuentes oficiales.
 * @param {object} opts
 * @param {object} opts.solicitud
 * @param {array} opts.detalleItems
 * @param {array} opts.cotizaciones — filas con proveedor + propuestas + validacion
 * @param {array} [opts.requerimientos]
 */
export function buildMatrizComparativaBienes(opts = {}) {
  const solicitud = opts.solicitud || {};
  const detalleItems = Array.isArray(opts.detalleItems) ? opts.detalleItems : [];
  const cotizaciones = Array.isArray(opts.cotizaciones) ? opts.cotizaciones : [];
  const requerimientos = Array.isArray(opts.requerimientos) ? opts.requerimientos : [];
  const inconsistencias = [];

  const itemsBase = detalleItems.length
    ? detalleItems.map((it, idx) => normalizeCuadroItem(it, idx))
    : [];

  if (!itemsBase.length) {
    inconsistencias.push({
      tipo: 'SIN_ITEMS',
      mensaje: 'La solicitud no tiene detalle_items para armar la matriz',
    });
  }

  const items = itemsBase.map((itemNorm) => {
    if (itemNorm._fallback_key) {
      inconsistencias.push({
        tipo: 'ITEM_KEY_FALLBACK',
        item_key: itemNorm.item_key,
        mensaje: `Clave de ítem por índice de array (fallback): ${itemNorm.item_key}`,
      });
    }
    if (itemNorm.cantidad == null) {
      inconsistencias.push({
        tipo: 'SIN_CANTIDAD',
        item_key: itemNorm.item_key,
        mensaje: `Ítem ${itemNorm.item_key} sin cantidad`,
      });
    }

    const ofertas = cotizaciones.map((cot) => {
      const tec = parseJsonSafe(cot.propuesta_tecnica, {});
      const tecItems = Array.isArray(tec.items) ? tec.items : [];
      const propTecItem = tecItems.find((t) => resolveItemKey(t) === itemNorm.item_key)
        || tecItems.find((t, i) => resolveItemKey(t, i) === itemNorm.item_key)
        || {};
      const oferta = normalizeOfertaProveedor(cot, itemNorm, propTecItem);
      (oferta.inconsistencias || []).forEach((inc) => inconsistencias.push({
        ...inc,
        proveedor_id: oferta.proveedor_id,
        ruc: oferta.ruc,
      }));
      if (oferta.incompleto) {
        inconsistencias.push({
          tipo: 'OFERTA_INCOMPLETA',
          item_key: itemNorm.item_key,
          proveedor_id: oferta.proveedor_id,
          mensaje: oferta.incompleto_motivo || 'Información incompleta',
        });
      }
      return oferta;
    });

    const aptas = ofertas.filter((o) => o.cumple_tecnicamente && o.precio_total != null && !o.incompleto);
    const menores = aptas.map((o) => o.precio_total);
    const menor_precio_valido = menores.length ? Math.min(...menores) : null;

    return {
      item_key: itemNorm.item_key,
      requerimiento_id: itemNorm.requerimiento_id,
      requerimiento_codigo: itemNorm.requerimiento_codigo,
      pedido_sigamef: itemNorm.pedido_sigamef,
      codigo_sigamef: itemNorm.codigo_sigamef,
      descripcion: itemNorm.descripcion,
      unidad_medida: itemNorm.unidad_medida,
      cantidad: itemNorm.cantidad,
      menor_precio_valido,
      ofertas,
    };
  });

  const resumen_proveedores = cotizaciones.map((cot) => {
    const valEst = String(cot.validacion_estado || '').toUpperCase() || 'PENDIENTE';
    let total = 0;
    let itemsValidos = 0;
    let itemsIncompletos = 0;
    let tieneOferta = false;
    items.forEach((it) => {
      const of = it.ofertas.find((o) => o.proveedor_id === cot.proveedor_id);
      if (!of) return;
      tieneOferta = true;
      if (of.incompleto) itemsIncompletos += 1;
      else if (of.precio_total != null) {
        itemsValidos += 1;
        if (valEst === 'APTO') total += of.precio_total;
      }
    });
    return {
      proveedor_id: cot.proveedor_id,
      cotizacion_id: cot.id,
      ruc: cot.ruc || '',
      razon_social: cot.razon_social || '',
      validacion_estado: valEst,
      cumple_tecnicamente: valEst === 'APTO',
      total_ofertado: valEst === 'APTO' ? Math.round(total * 100) / 100 : null,
      items_validos: itemsValidos,
      items_incompletos: itemsIncompletos,
      moneda: 'PEN',
      tiene_oferta: tieneOferta,
    };
  });

  const validation = validateEconomiaCuadro({ items, inconsistencias, resumen_proveedores });

  return {
    version_schema: 1,
    solicitud: {
      id: solicitud.id,
      codigo: solicitud.codigo || solicitud.solicitud_codigo || '',
      denominacion: solicitud.denominacion || '',
      objeto: solicitud.objeto || '',
      tipo: solicitud.tipo || 'BIENES',
    },
    requerimientos: requerimientos.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      descripcion: r.descripcion || r.denominacion || '',
      centro: r.centro || '',
      area_usuaria: r.area_usuaria || r.area || '',
    })),
    items,
    resumen_proveedores,
    inconsistencias,
    notas_internas: '',
    meta: {
      items_count: items.length,
      items_incompletos: validation.items_incompletos,
      items_validos: validation.items_validos,
      puede_generar: validation.puede_generar,
      puede_seleccionar_ganador: validation.items_incompletos === 0 && items.length > 0,
      puede_pdf: false,
    },
  };
}

export function validateEconomiaCuadro(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const inconsistencias = Array.isArray(payload.inconsistencias) ? payload.inconsistencias : [];
  let items_incompletos = 0;
  let items_validos = 0;
  items.forEach((it) => {
    const ofertasAptas = (it.ofertas || []).filter((o) => o.cumple_tecnicamente);
    const algunaIncompleta = ofertasAptas.some((o) => o.incompleto);
    const algunaOk = ofertasAptas.some((o) => !o.incompleto && o.precio_total != null);
    if (algunaIncompleta || !ofertasAptas.length) items_incompletos += 1;
    else if (algunaOk) items_validos += 1;
  });
  const graves = inconsistencias.filter((i) => [
    'SIN_ITEMS', 'SOLO_MONTO_GLOBAL', 'TOTAL_INCONSISTENTE', 'OFERTA_INCOMPLETA', 'SIN_CANTIDAD',
  ].includes(i.tipo));
  const puede_generar = items.length > 0 && items_incompletos === 0 && graves.length === 0;
  return {
    ok: graves.length === 0 && items_incompletos === 0,
    items_validos,
    items_incompletos,
    inconsistencias_count: inconsistencias.length,
    puede_generar,
    puede_seleccionar_ganador: false,
    puede_pdf: puede_generar,
    bloqueos: [
      !items.length ? 'Sin ítems en la matriz' : null,
      items_incompletos > 0 ? `${items_incompletos} ítem(s) con información incompleta` : null,
      graves.length ? `${graves.length} inconsistencia(s) económica(s)` : null,
    ].filter(Boolean),
  };
}

/** Fusiona observaciones del analista desde un JSON guardado sobre matriz fresca. */
export function mergeObservacionesCuadro(matrizFresh, datosGuardados) {
  if (!datosGuardados || typeof datosGuardados !== 'object') return matrizFresh;
  const savedItems = Array.isArray(datosGuardados.items) ? datosGuardados.items : [];
  const byKey = new Map(savedItems.map((it) => [it.item_key, it]));
  const items = (matrizFresh.items || []).map((it) => {
    const prev = byKey.get(it.item_key);
    if (!prev) return it;
    const prevOfertas = Array.isArray(prev.ofertas) ? prev.ofertas : [];
    const ofertas = (it.ofertas || []).map((of) => {
      const po = prevOfertas.find((x) => x.proveedor_id === of.proveedor_id);
      return {
        ...of,
        observacion_analista: po?.observacion_analista || of.observacion_analista || '',
      };
    });
    return {
      ...it,
      ofertas,
      proveedor_adjudicado_id: prev.proveedor_adjudicado_id ?? it.proveedor_adjudicado_id,
      valor_adjudicado_item: prev.valor_adjudicado_item,
    };
  });
  return {
    ...matrizFresh,
    items,
    notas_internas: datosGuardados.notas_internas || matrizFresh.notas_internas || '',
    adjudicacion: datosGuardados.adjudicacion || matrizFresh.adjudicacion,
    historial_adjudicacion: datosGuardados.historial_adjudicacion || matrizFresh.historial_adjudicacion,
  };
}

export function stripArchivosFromDatosJson(datos) {
  if (!datos || typeof datos !== 'object') return {};
  const clone = JSON.parse(JSON.stringify(datos));
  delete clone.pdf;
  delete clone.pdf_contenido;
  delete clone.firmado;
  delete clone.archivos;
  return clone;
}

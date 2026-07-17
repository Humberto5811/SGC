/**
 * RC8.3.1 — Schema v2 Cuadro Comparativo (Anexo 8A): primera / segunda fuente.
 * Compatibilidad de lectura con version_schema 1 (items[].ofertas).
 */

export const VERSION_SCHEMA_V1 = 1;
export const VERSION_SCHEMA_V2 = 2;

export const TIPOS_SEGUNDA_FUENTE = Object.freeze([
  { code: 'ORDEN_COMPRA_ANTERIOR', label: 'Orden de compra anterior' },
  { code: 'CONTRATO_ANTERIOR', label: 'Contrato anterior' },
  { code: 'PAGINA_WEB', label: 'Página web' },
  { code: 'CATALOGO', label: 'Catálogo' },
  { code: 'PRESUPUESTO', label: 'Presupuesto' },
  { code: 'ESTRUCTURA_COSTOS', label: 'Estructura de costos' },
  { code: 'OTRA', label: 'Otra fuente' },
]);

export const METODOLOGIAS_ADJUDICACION = Object.freeze([
  { code: 'MENOR_PRECIO_VALIDO', label: 'Menor precio técnicamente válido' },
  { code: 'COMPARACION_ORDEN_ANTERIOR', label: 'Comparación con orden anterior' },
  { code: 'ACTUALIZACION_FACTOR', label: 'Actualización por factor' },
  { code: 'PROMEDIO_FUENTES', label: 'Promedio de fuentes' },
  { code: 'OTRA', label: 'Otra metodología' },
]);

function pick(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v !== 'object' && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function labelTipoSegundaFuente(code) {
  return TIPOS_SEGUNDA_FUENTE.find((t) => t.code === code)?.label || code || '—';
}

export function calcPrecioActualizado(precioOriginal, factor) {
  const p = toNum(precioOriginal);
  const f = toNum(factor);
  if (p == null || f == null) return null;
  return Math.round(p * f * 100) / 100;
}

/**
 * Construye primera_fuente[] desde matriz v1 (items/ofertas) + filas de cotización.
 */
export function buildPrimeraFuenteFromMatriz(matriz = {}, cotizaciones = []) {
  const items = Array.isArray(matriz.items) ? matriz.items : [];
  const resumen = Array.isArray(matriz.resumen_proveedores) ? matriz.resumen_proveedores : [];
  const cotById = new Map((cotizaciones || []).map((c) => [Number(c.id || c.cotizacion_id), c]));
  const sources = [];

  const order = resumen.length
    ? resumen
    : (items[0]?.ofertas || []).map((o) => ({
      proveedor_id: o.proveedor_id,
      cotizacion_id: o.cotizacion_id,
      ruc: o.ruc,
      razon_social: o.razon_social,
      validacion_estado: o.validacion_estado,
    }));

  order.forEach((p, idx) => {
    const cot = cotById.get(Number(p.cotizacion_id)) || {};
    const precios_por_item = {};
    const informacion_adicional = {};
    items.forEach((it) => {
      const of = (it.ofertas || []).find((o) => Number(o.proveedor_id) === Number(p.proveedor_id));
      if (!of) return;
      precios_por_item[it.item_key] = {
        precio_unitario: of.precio_unitario ?? null,
        precio_total: of.precio_total ?? null,
        moneda: of.moneda || 'PEN',
        incompleto: !!of.incompleto,
      };
      // última oferta vista alimenta info adicional a nivel fuente (marca/modelo típicos)
      informacion_adicional.marca = of.marca || informacion_adicional.marca || '';
      informacion_adicional.modelo = of.modelo || informacion_adicional.modelo || '';
      informacion_adicional.procedencia = of.procedencia || informacion_adicional.procedencia || '';
      informacion_adicional.anio_fabricacion = of.anio_fabricacion || informacion_adicional.anio_fabricacion || '';
      informacion_adicional.garantia = of.garantia || informacion_adicional.garantia || '';
      informacion_adicional.plazo_entrega = of.plazo_entrega || informacion_adicional.plazo_entrega || '';
      informacion_adicional.forma_pago = of.forma_pago || informacion_adicional.forma_pago || '';
      informacion_adicional.moneda = of.moneda || informacion_adicional.moneda || 'PEN';
    });

    // Info adicional por ítem (para matriz inferior alineada)
    const info_por_item = {};
    items.forEach((it) => {
      const of = (it.ofertas || []).find((o) => Number(o.proveedor_id) === Number(p.proveedor_id));
      info_por_item[it.item_key] = {
        marca: of?.marca || '—',
        modelo: of?.modelo || '—',
        procedencia: of?.procedencia || 'NO APLICA',
        anio_fabricacion: of?.anio_fabricacion || 'NO APLICA',
        garantia: of?.garantia || 'NO APLICA',
        plazo_entrega: of?.plazo_entrega || 'NO APLICA',
        forma_pago: of?.forma_pago || 'NO APLICA',
        moneda: of?.moneda || 'PEN',
      };
    });

    sources.push({
      id: `cot-${p.cotizacion_id || p.proveedor_id || idx + 1}`,
      tipo: 'COTIZACION',
      nro: idx + 1,
      label: `Cotización N.° ${idx + 1}`,
      cotizacion_id: p.cotizacion_id || cot.id || null,
      proveedor_id: p.proveedor_id,
      datos_proveedor: {
        razon_social: p.razon_social || cot.razon_social || '—',
        ruc: p.ruc || cot.ruc || '—',
        contacto: pick(cot, 'persona_contacto', 'contacto') || '—',
        telefono: pick(cot, 'telefono') || '—',
        correo: (() => {
          const direct = pick(cot, 'correo', 'email');
          if (direct) return direct;
          let emails = cot.emails;
          if (typeof emails === 'string') {
            try { emails = JSON.parse(emails); } catch (_) { emails = []; }
          }
          if (Array.isArray(emails) && emails.length) {
            const first = emails[0];
            return typeof first === 'string' ? first : (first?.email || first?.correo || '');
          }
          return '—';
        })() || '—',
      },
      validacion_estado: p.validacion_estado || cot.validacion_estado || '',
      cumple_tecnicamente: String(p.validacion_estado || cot.validacion_estado || '').toUpperCase() === 'APTO',
      precios_por_item,
      informacion_adicional,
      info_por_item,
      acciones_administrativas: {
        fecha_solicitud: cot.fecha_solicitud || null,
        reiteraciones: cot.reiteraciones ?? null,
        fecha_recepcion: cot.fecha_presentacion || cot.updated_at || null,
        dedicado_objeto: null,
        au_participo_rtm: null,
        cumple_rtm_o_similar: String(p.validacion_estado || '').toUpperCase() === 'APTO' ? true : null,
        tomo_valor_referencial: null,
      },
      readonly: true,
    });
  });

  return sources;
}

export function normalizeSegundaFuente(raw = {}, idx = 0) {
  const id = raw.id_fuente || raw.id || `sf-${Date.now()}-${idx}`;
  const precios = raw.precios_por_item && typeof raw.precios_por_item === 'object'
    ? { ...raw.precios_por_item }
    : {};
  Object.keys(precios).forEach((k) => {
    const row = precios[k] || {};
    const original = toNum(row.precio_unitario ?? row.precio_original);
    const factor = toNum(row.factor_ajuste ?? raw.factor_ajuste) ?? 1;
    const actualizado = toNum(row.precio_actualizado) ?? calcPrecioActualizado(original, factor);
    const cant = toNum(row.cantidad);
    const total = toNum(row.precio_total_actualizado)
      ?? (actualizado != null && cant != null ? Math.round(actualizado * cant * 100) / 100 : null);
    precios[k] = {
      precio_unitario: original,
      precio_original: original,
      factor_ajuste: factor,
      precio_actualizado: actualizado,
      precio_total: total,
      precio_total_actualizado: total,
      moneda: row.moneda || raw.moneda || 'PEN',
      incompleto: original == null,
    };
  });

  return {
    id_fuente: id,
    id,
    tipo: 'SEGUNDA_FUENTE',
    tipo_fuente: raw.tipo_fuente || 'OTRA',
    tipo_fuente_label: labelTipoSegundaFuente(raw.tipo_fuente || 'OTRA'),
    nro: raw.nro || idx + 1,
    label: raw.label || `Segunda fuente ${idx + 1}`,
    denominacion: String(raw.denominacion || '').trim(),
    entidad: String(raw.entidad || raw.proveedor || '').trim(),
    ruc: String(raw.ruc || '').trim(),
    referencia: String(raw.referencia || raw.tipo_nro_orden || '').trim(),
    anio: raw.anio != null ? String(raw.anio) : '',
    url: String(raw.url || '').trim(),
    fecha_consulta: raw.fecha_consulta || null,
    moneda: raw.moneda || 'PEN',
    factor_ajuste: toNum(raw.factor_ajuste) ?? 1,
    precios_por_item: precios,
    documentos: Array.isArray(raw.documentos) ? raw.documentos : [],
    informacion_adicional: {
      marca: raw.informacion_adicional?.marca || 'NO APLICA',
      modelo: raw.informacion_adicional?.modelo || 'NO APLICA',
      procedencia: raw.informacion_adicional?.procedencia || 'NO APLICA',
      anio_fabricacion: raw.informacion_adicional?.anio_fabricacion || 'NO APLICA',
      garantia: raw.informacion_adicional?.garantia || 'NO APLICA',
      plazo_entrega: raw.informacion_adicional?.plazo_entrega || 'NO APLICA',
      forma_pago: raw.informacion_adicional?.forma_pago || 'NO APLICA',
      moneda: raw.moneda || 'PEN',
    },
    acciones_administrativas: {
      fecha_solicitud: raw.acciones_administrativas?.fecha_solicitud || null,
      reiteraciones: raw.acciones_administrativas?.reiteraciones ?? null,
      fecha_recepcion: raw.acciones_administrativas?.fecha_recepcion || raw.fecha_consulta || null,
      dedicado_objeto: raw.acciones_administrativas?.dedicado_objeto ?? null,
      au_participo_rtm: raw.acciones_administrativas?.au_participo_rtm ?? null,
      cumple_rtm_o_similar: raw.acciones_administrativas?.cumple_rtm_o_similar ?? null,
      tomo_valor_referencial: raw.acciones_administrativas?.tomo_valor_referencial ?? null,
    },
    observacion: String(raw.observacion || '').trim(),
    registrado_por: raw.registrado_por || '',
    registrado_at: raw.registrado_at || null,
    readonly: false,
  };
}

/**
 * Migra lectura v1 → v2 sin mutar BD automáticamente.
 * Conserva items/ofertas legacy.
 */
export function migrateCuadroSchemaV1ToV2(datos = {}, cotizaciones = []) {
  const src = datos && typeof datos === 'object' ? { ...datos } : {};
  const version = Number(src.version_schema) || VERSION_SCHEMA_V1;

  if (version >= VERSION_SCHEMA_V2 && Array.isArray(src.primera_fuente) && src.primera_fuente.length) {
    return {
      ...src,
      version_schema: VERSION_SCHEMA_V2,
      segunda_fuente: (src.segunda_fuente || []).map((f, i) => normalizeSegundaFuente(f, i)),
      meta: {
        ...(src.meta || {}),
        schema_migrated: false,
        puede_pdf_oficial: false,
        pdf_modo: 'BORRADOR',
      },
    };
  }

  const primera = buildPrimeraFuenteFromMatriz(src, cotizaciones);
  const segunda = Array.isArray(src.segunda_fuente)
    ? src.segunda_fuente.map((f, i) => normalizeSegundaFuente(f, i))
    : [];

  const adj = src.adjudicacion && typeof src.adjudicacion === 'object' ? { ...src.adjudicacion } : {};
  if (!adj.metodologia && adj.criterio_seleccion) {
    adj.metodologia = adj.criterio_seleccion;
  }
  if (!Array.isArray(adj.items) && Array.isArray(src.items)) {
    adj.items = src.items
      .filter((it) => it.proveedor_adjudicado_id != null)
      .map((it) => {
        const of = (it.ofertas || []).find((o) => Number(o.proveedor_id) === Number(it.proveedor_adjudicado_id));
        const fuente = primera.find((f) => Number(f.proveedor_id) === Number(it.proveedor_adjudicado_id));
        return {
          item_key: it.item_key,
          fuente_tipo: 'COTIZACION',
          fuente_id: fuente?.id || null,
          proveedor_id: it.proveedor_adjudicado_id,
          precio_unitario: of?.precio_unitario ?? null,
          precio_total: it.valor_adjudicado_item ?? of?.precio_total ?? null,
          sustento: adj.sustento_decision || '',
        };
      });
  }

  return {
    ...src,
    version_schema: VERSION_SCHEMA_V2,
    primera_fuente: primera,
    segunda_fuente: segunda,
    adjudicacion: adj,
    meta: {
      ...(src.meta || {}),
      schema_migrated: version < VERSION_SCHEMA_V2,
      migrated_from: version,
      puede_pdf_oficial: false,
      pdf_modo: 'BORRADOR',
    },
  };
}

/** Fusiona segunda_fuente + adjudicación v2 sobre matriz fresca. */
export function mergeFuentesCuadro(matrizFresh, datosGuardados = {}) {
  const migrated = migrateCuadroSchemaV1ToV2(
    { ...matrizFresh, ...datosGuardados, items: matrizFresh.items },
    [],
  );
  // Reconstruir primera_fuente desde matriz fresca (precios oficiales)
  const primera = buildPrimeraFuenteFromMatriz(matrizFresh, []);
  // Conservar acciones administrativas guardadas de primera fuente si existen
  const savedPrimera = Array.isArray(datosGuardados.primera_fuente) ? datosGuardados.primera_fuente : [];
  primera.forEach((f) => {
    const prev = savedPrimera.find((x) => Number(x.proveedor_id) === Number(f.proveedor_id)
      || Number(x.cotizacion_id) === Number(f.cotizacion_id));
    if (prev?.acciones_administrativas) {
      f.acciones_administrativas = { ...f.acciones_administrativas, ...prev.acciones_administrativas };
    }
  });

  const segunda = Array.isArray(datosGuardados.segunda_fuente)
    ? datosGuardados.segunda_fuente.map((f, i) => normalizeSegundaFuente(f, i))
    : [];

  return {
    ...matrizFresh,
    version_schema: VERSION_SCHEMA_V2,
    primera_fuente: primera,
    segunda_fuente: segunda,
    adjudicacion: datosGuardados.adjudicacion || matrizFresh.adjudicacion || migrated.adjudicacion,
    meta: {
      ...(matrizFresh.meta || {}),
      ...(datosGuardados.meta || {}),
      puede_pdf_oficial: false,
      pdf_modo: 'BORRADOR',
    },
  };
}

export function listarFuentesMatriz(matriz = {}) {
  const primera = Array.isArray(matriz.primera_fuente) ? matriz.primera_fuente : [];
  const segunda = Array.isArray(matriz.segunda_fuente) ? matriz.segunda_fuente : [];
  return [...primera, ...segunda];
}

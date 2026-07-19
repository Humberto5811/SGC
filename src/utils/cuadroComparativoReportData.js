/**
 * RC8.4 / RC8.3.2-C — Modelo imprimible Anexo N.° 08-A / 08-B.
 * Estructura institucional: columnas Cotización / Segunda fuente / Valor adjudicado
 * + continuación vertical (información adicional y acciones administrativas).
 * Solo transforma datos persistidos; sin DOM ni generación PDF.
 */

export const ANEXO_8A = Object.freeze({
  codigo: '8A',
  titulo: 'ANEXO N.° 08-A',
  subtitulo: 'Formato de Cuadro Comparativo de Precios — Bienes',
  filenamePrefix: 'Anexo_08A_CuadroComparativo',
});

export const ANEXO_8B = Object.freeze({
  codigo: '8B',
  titulo: 'ANEXO N.° 08-B',
  subtitulo: 'Formato de Cuadro Comparativo de Precios — Servicios',
  filenamePrefix: 'Anexo_08B_CuadroComparativo',
});

export const INFO_ADICIONAL_ROWS = Object.freeze([
  ['marca', 'Marca'],
  ['modelo', 'Modelo'],
  ['procedencia', 'Procedencia'],
  ['anio_fabricacion', 'Año de fabricación'],
  ['garantia', 'Garantía comercial'],
  ['plazo_entrega', 'Plazo de entrega'],
  ['forma_pago', 'Forma de pago'],
  ['moneda', 'Moneda de la fuente'],
]);

/** Anexo 08-B: información adicional reducida a 2 campos */
export const INFO_ADICIONAL_ROWS_SERVICIOS = Object.freeze([
  ['plazo_entrega', 'Plazo de entrega'],
  ['forma_pago', 'Forma de pago'],
]);

export function resolveAnexoCuadro(persistido = {}) {
  const datos = persistido.datos_json || persistido.matriz || persistido.cuadro?.datos_json || {};
  const anexoCode = String(datos.meta?.anexo_codigo || '').toUpperCase();
  if (anexoCode === '8B') return ANEXO_8B;
  if (anexoCode === '8A') return ANEXO_8A;
  const tipo = String(
    datos.meta?.tipo_contratacion
    || datos.solicitud?.tipo_contratacion
    || datos.solicitud?.tipo
    || persistido.cuadro?.tipo
    || persistido.expediente?.tipo
    || '',
  ).toUpperCase();
  if (tipo.includes('SERV')) return ANEXO_8B;
  return ANEXO_8A;
}

function infoRowsForAnexo(anexo) {
  return anexo?.codigo === '8B' ? INFO_ADICIONAL_ROWS_SERVICIOS : INFO_ADICIONAL_ROWS;
}

export const ACCIONES_ADMIN_ROWS = Object.freeze([
  ['fecha_solicitud', 'Fecha de solicitud'],
  ['reiteraciones', 'Cantidad de reiteraciones'],
  ['fecha_recepcion', 'Fecha de recepción'],
  ['dedicado_objeto', 'Se dedica al objeto de la contratación'],
  ['au_participo_rtm', 'AU participó en verificación RTM'],
  ['cumple_rtm_o_similar', 'Cumple RTM / igual o similar'],
  ['tomo_valor_referencial', 'Se tomó en cuenta para valor referencial'],
]);

function safeStr(v, empty = '') {
  if (v == null) return empty;
  if (typeof v === 'object') return empty;
  const s = String(v).trim();
  if (!s || s === 'undefined' || s === 'null' || s === 'NaN') return empty;
  return s;
}

function optField(v, na = '—') {
  const s = safeStr(v);
  return s || na;
}

function fmtMoney(n) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtBool(v) {
  if (v === true) return 'Sí';
  if (v === false) return 'No';
  return '—';
}

function labelReferenciaCol(tipoFuente) {
  const t = String(tipoFuente || '').toUpperCase();
  if (t === 'ORDEN_COMPRA_ANTERIOR') return 'N.° Orden';
  if (t === 'CONTRATO_ANTERIOR') return 'Contrato';
  return 'Referencia';
}

function naInfo(v, isSegunda = false) {
  const s = safeStr(v);
  if (!s || s === '—' || s === '-') return isSegunda ? 'NO APLICA' : '—';
  return s;
}

/**
 * Valida que el cuadro persistido permita generación final del Anexo 8A.
 */
export function validateCuadroParaAnexo8A(cuadroPersistido = {}) {
  const faltantes = [];
  const cuadro = cuadroPersistido.cuadro || cuadroPersistido;
  const datos = cuadroPersistido.datos_json || cuadro.datos_json || cuadroPersistido.matriz || {};
  const estado = String(cuadro.estado || cuadroPersistido.estado || '').toUpperCase();
  const adj = datos.adjudicacion || cuadroPersistido.adjudicacion || {};
  const items = Array.isArray(datos.items) ? datos.items : [];
  const proveedores = Array.isArray(datos.resumen_proveedores) ? datos.resumen_proveedores : [];
  const primera = Array.isArray(datos.primera_fuente) ? datos.primera_fuente : [];

  if (!['ADJUDICADO', 'GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO'].includes(estado)) {
    faltantes.push('El cuadro debe estar ADJUDICADO (o GENERADO) antes de emitir el Anexo 08');
  }
  if (!safeStr(datos.solicitud?.codigo || cuadroPersistido.solicitud_codigo)) {
    faltantes.push('Código de Solicitud de Cotización');
  }
  if (!items.length) faltantes.push('Ítems del cuadro');
  if (!proveedores.length && !primera.length) faltantes.push('Proveedores del cuadro');
  if (adj.valor_adjudicado == null || adj.valor_adjudicado === '') {
    faltantes.push('Valor adjudicado');
  }
  if (!safeStr(adj.criterio_seleccion || cuadro.criterio_seleccion)) {
    faltantes.push('Criterio de selección');
  }
  if (!safeStr(adj.sustento_decision || cuadro.sustento_decision)) {
    faltantes.push('Sustento de decisión');
  }

  const sinAdjudicado = items.filter((it) => it.proveedor_adjudicado_id == null);
  if (sinAdjudicado.length) {
    faltantes.push(`${sinAdjudicado.length} ítem(s) sin proveedor adjudicado`);
  }

  const incompletos = items.filter((it) => (it.ofertas || []).some((o) => o.cumple_tecnicamente && o.incompleto));
  if (incompletos.length) {
    faltantes.push('Existen ofertas APTO con información económica incompleta');
  }

  return {
    ok: faltantes.length === 0,
    faltantes,
    puede_generar: faltantes.length === 0,
  };
}

function buildPrimeraFuentes(datos) {
  if (Array.isArray(datos.primera_fuente) && datos.primera_fuente.length) {
    return datos.primera_fuente.map((f, idx) => {
      const d = f.datos_proveedor || {};
      return {
        id: f.id || f.id_fuente || `cot-${f.proveedor_id || idx}`,
        nro: f.nro || idx + 1,
        label: `Cotización ${f.nro || idx + 1}`,
        proveedor_id: f.proveedor_id,
        razon_social: optField(d.razon_social || f.razon_social),
        ruc: optField(d.ruc || f.ruc),
        contacto: optField(d.contacto || d.persona_contacto || f.contacto),
        telefono: optField(d.telefono || d.celular || f.telefono),
        correo: optField(d.correo || f.correo),
        validacion_estado: optField(f.validacion_estado),
        cumple_tecnicamente: !!f.cumple_tecnicamente,
        informacion_adicional: f.informacion_adicional || {},
        acciones_administrativas: f.acciones_administrativas || {},
        precios_por_item: f.precios_por_item || {},
        info_por_item: f.info_por_item || {},
      };
    });
  }
  const proveedores = Array.isArray(datos.resumen_proveedores) ? datos.resumen_proveedores : [];
  return proveedores.map((p, idx) => ({
    id: `cot-${p.proveedor_id}`,
    nro: idx + 1,
    label: `Cotización ${idx + 1}`,
    proveedor_id: p.proveedor_id,
    razon_social: optField(p.razon_social),
    ruc: optField(p.ruc),
    contacto: '—',
    telefono: '—',
    correo: '—',
    validacion_estado: optField(p.validacion_estado),
    cumple_tecnicamente: !!p.cumple_tecnicamente,
    informacion_adicional: {},
    acciones_administrativas: {},
    precios_por_item: {},
    info_por_item: {},
  }));
}

function buildSegundaFuentes(datos) {
  const lista = Array.isArray(datos.segunda_fuente) ? datos.segunda_fuente : [];
  return lista.map((f, idx) => ({
    id: f.id_fuente || f.id || `sf-${idx}`,
    nro: f.nro || idx + 1,
    label: 'Segunda fuente',
    sublabel: 'Valor histórico / páginas web',
    tipo_fuente: f.tipo_fuente || 'OTRA',
    tipo_fuente_label: f.tipo_fuente_label || f.tipo_fuente || '—',
    referencia_label: labelReferenciaCol(f.tipo_fuente),
    referencia: optField(f.referencia, '—'),
    denominacion: optField(f.denominacion, '—'),
    entidad: optField(f.entidad, '—'),
    requerimiento_id: f.requerimiento_id ?? null,
    requerimiento_codigo: optField(f.requerimiento_codigo, ''),
    item_keys: Array.isArray(f.item_keys) ? f.item_keys.map(String) : [],
    informacion_adicional: f.informacion_adicional || {},
    acciones_administrativas: f.acciones_administrativas || {},
    precios_por_item: f.precios_por_item || {},
  }));
}

function sfAplicaItem(sf, it) {
  const keys = Array.isArray(sf.item_keys) ? sf.item_keys.filter(Boolean) : [];
  if (keys.length) return keys.includes(String(it.item_key));
  if (sf.requerimiento_id != null && sf.requerimiento_id !== '') {
    return String(it.requerimiento_id) === String(sf.requerimiento_id);
  }
  if (sf.requerimiento_codigo) {
    return String(it.requerimiento_codigo || '') === String(sf.requerimiento_codigo);
  }
  return true;
}

function infoValorFuente(fuente, key, isSegunda, itemKey) {
  const fromItem = fuente.info_por_item?.[itemKey]?.[key];
  const fromFuente = fuente.informacion_adicional?.[key];
  return naInfo(fromItem || fromFuente, isSegunda);
}

function aaValorFuente(fuente, key, isSegunda = false) {
  if (isSegunda) return 'NO APLICA';
  const aa = fuente.acciones_administrativas || {};
  let v = aa[key];
  // Defaults institucionales si faltan en JSON antiguo
  const valEst = String(fuente.validacion_estado || '').toUpperCase();
  if (key === 'au_participo_rtm' && (v == null || v === '')) v = true;
  if (key === 'tomo_valor_referencial' && (v == null || v === '')) {
    if (valEst === 'APTO') v = true;
    else if (valEst === 'NO_APTO') v = false;
  }
  if (key === 'cumple_rtm_o_similar' && (v == null || v === '') && valEst === 'APTO') v = true;

  if (key === 'dedicado_objeto' || key === 'au_participo_rtm'
    || key === 'cumple_rtm_o_similar' || key === 'tomo_valor_referencial') {
    return fmtBool(v);
  }
  if (key === 'fecha_solicitud' || key === 'fecha_recepcion') {
    if (v == null || v === '') return '—';
    return String(v).slice(0, 10);
  }
  if (key === 'reiteraciones') {
    if (v == null || v === '') return '—';
    return String(v);
  }
  return optField(v, '—');
}

/**
 * @param {object} persistido — { cuadro, datos_json|matriz, expediente?, entidad?, logo_data_url? }
 */
export function buildCuadroComparativoReportData(persistido = {}) {
  const cuadro = persistido.cuadro || {};
  const datos = persistido.datos_json || persistido.matriz || cuadro.datos_json || {};
  const expediente = persistido.expediente || {};
  const entidad = persistido.entidad || {};
  const adj = datos.adjudicacion || {};
  const itemsRaw = Array.isArray(datos.items) ? datos.items : [];

  const primera = buildPrimeraFuentes(datos);
  const segunda = buildSegundaFuentes(datos);

  const validation = validateCuadroParaAnexo8A({
    cuadro,
    datos_json: datos,
    adjudicacion: adj,
    solicitud_codigo: datos.solicitud?.codigo || expediente.solicitud_codigo,
  });

  const reqs = (datos.requerimientos || expediente.requerimientos || [])
    .map((r) => safeStr(r.codigo))
    .filter(Boolean);
  const cmnList = [...new Set(
    (datos.requerimientos || []).map((r) => safeStr(r.cmn || r.centro)).filter(Boolean),
  )];
  const area = safeStr(
    expediente.area_usuaria
    || datos.requerimientos?.map((r) => r.area_usuaria).filter(Boolean).join(', ')
    || persistido.area_usuaria,
  );

  const filas = itemsRaw.map((it, idx) => {
    const ofertasByProv = new Map((it.ofertas || []).map((o) => [Number(o.proveedor_id), o]));

    const cotizaciones = primera.map((f) => {
      const of = ofertasByProv.get(Number(f.proveedor_id)) || {};
      const pr = f.precios_por_item?.[it.item_key] || {};
      const pu = pr.precio_unitario ?? of.precio_unitario;
      const pt = pr.precio_total ?? of.precio_total;
      return {
        fuente_id: f.id,
        nro: f.nro,
        proveedor_id: f.proveedor_id,
        precio_unitario: pu != null ? fmtMoney(pu) : '—',
        precio_total: pt != null ? fmtMoney(pt) : '—',
        precio_unitario_num: pu != null ? Number(pu) : null,
        precio_total_num: pt != null ? Number(pt) : null,
        marca: infoValorFuente(f, 'marca', false, it.item_key) === '—'
          ? naInfo(of.marca, false)
          : infoValorFuente(f, 'marca', false, it.item_key),
        modelo: infoValorFuente(f, 'modelo', false, it.item_key) === '—'
          ? naInfo(of.modelo, false)
          : infoValorFuente(f, 'modelo', false, it.item_key),
        procedencia: infoValorFuente(f, 'procedencia', false, it.item_key) === '—'
          ? naInfo(of.procedencia, false)
          : infoValorFuente(f, 'procedencia', false, it.item_key),
        anio_fabricacion: infoValorFuente(f, 'anio_fabricacion', false, it.item_key),
        garantia: infoValorFuente(f, 'garantia', false, it.item_key) === '—'
          ? naInfo(of.garantia, false)
          : infoValorFuente(f, 'garantia', false, it.item_key),
        plazo_entrega: infoValorFuente(f, 'plazo_entrega', false, it.item_key) === '—'
          ? naInfo(of.plazo_entrega, false)
          : infoValorFuente(f, 'plazo_entrega', false, it.item_key),
        forma_pago: infoValorFuente(f, 'forma_pago', false, it.item_key),
        moneda: infoValorFuente(f, 'moneda', false, it.item_key) === '—'
          ? optField(of.moneda || 'PEN')
          : infoValorFuente(f, 'moneda', false, it.item_key),
      };
    });

    const segundas = segunda.map((f) => {
      const aplica = sfAplicaItem(f, it);
      const pr = aplica ? (f.precios_por_item?.[it.item_key] || {}) : {};
      return {
        fuente_id: f.id,
        aplica,
        referencia: aplica ? f.referencia : '—',
        precio_unitario: aplica && pr.precio_unitario != null ? fmtMoney(pr.precio_unitario) : '—',
        factor: aplica && pr.factor_ajuste != null ? String(pr.factor_ajuste) : '—',
        precio_actualizado: aplica && pr.precio_actualizado != null ? fmtMoney(pr.precio_actualizado) : '—',
        precio_total: aplica && (pr.precio_total_actualizado ?? pr.precio_total) != null
          ? fmtMoney(pr.precio_total_actualizado ?? pr.precio_total)
          : '—',
      };
    });

    const pid = it.proveedor_adjudicado_id;
    const ofGan = ofertasByProv.get(Number(pid)) || {};
    const idxProv = primera.findIndex((f) => Number(f.proveedor_id) === Number(pid));
    const nroProv = idxProv >= 0 ? (primera[idxProv].nro || idxProv + 1) : null;
    const razonGan = optField(
      ofGan.razon_social
      || (idxProv >= 0 ? primera[idxProv].razon_social : '')
      || it.adjudicado_razon_social,
    );
    const vu = it.valor_adjudicado_unitario ?? ofGan.precio_unitario;
    const vt = it.valor_adjudicado_item ?? ofGan.precio_total;

    // Compat filas.ofertas (tests RC8.4)
    const ofertas = primera.map((f) => {
      const of = ofertasByProv.get(Number(f.proveedor_id)) || {};
      const adjudicado = Number(pid) === Number(f.proveedor_id);
      return {
        proveedor_id: f.proveedor_id,
        razon_social: optField(of.razon_social || f.razon_social),
        ruc: optField(of.ruc || f.ruc),
        precio_unitario: of.precio_unitario != null ? fmtMoney(of.precio_unitario) : '—',
        precio_total: of.precio_total != null ? fmtMoney(of.precio_total) : '—',
        precio_total_num: of.precio_total != null ? Number(of.precio_total) : null,
        cumplimiento_tecnico: of.cumple_tecnicamente ? 'CUMPLE' : optField(of.validacion_estado, 'NO APLICA'),
        marca: naInfo(of.marca, false) === '—' ? 'NO APLICA' : naInfo(of.marca, false),
        modelo: naInfo(of.modelo, false) === '—' ? 'NO APLICA' : naInfo(of.modelo, false),
        procedencia: naInfo(of.procedencia, false) === '—' ? 'NO APLICA' : naInfo(of.procedencia, false),
        garantia: naInfo(of.garantia, false) === '—' ? 'NO APLICA' : naInfo(of.garantia, false),
        plazo_entrega: naInfo(of.plazo_entrega, false) === '—' ? 'NO APLICA' : naInfo(of.plazo_entrega, false),
        validez_oferta: optField(of.validez_oferta, 'NO APLICA'),
        observaciones: optField(of.observacion_analista || of.observaciones, '—'),
        adjudicado,
        apto: !!of.cumple_tecnicamente,
      };
    });

    return {
      item: idx + 1,
      item_key: safeStr(it.item_key),
      requerimiento_id: it.requerimiento_id != null ? it.requerimiento_id : '',
      requerimiento_codigo: optField(it.requerimiento_codigo),
      pedido_sigamef: optField(it.pedido_sigamef, 'NO APLICA'),
      codigo_sigamef: optField(it.codigo_sigamef, 'NO APLICA'),
      descripcion: optField(it.descripcion),
      unidad_medida: optField(it.unidad_medida, 'UND'),
      cantidad: it.cantidad != null ? String(it.cantidad) : '—',
      cotizaciones,
      segundas,
      adjudicado: {
        proveedor_nro: nroProv,
        proveedor_label: razonGan,
        proveedor_razon: razonGan,
        valor_unitario: vu != null ? fmtMoney(vu) : '—',
        valor_total: vt != null ? fmtMoney(vt) : '—',
      },
      proveedor_adjudicado: razonGan,
      valor_adjudicado_item: vt != null ? fmtMoney(vt) : '—',
      valor_adjudicado_unitario: vu != null ? fmtMoney(vu) : '—',
      ofertas,
    };
  });

  const anexoBase = resolveAnexoCuadro(persistido);
  const infoRows = infoRowsForAnexo(anexoBase);

  const info_adicional = infoRows.map(([key, label]) => ({
    key,
    label,
    cotizaciones: primera.map((f) => {
      // agrega valor representativo (primer ítem con dato / fuente)
      const sample = itemsRaw[0];
      if (!sample) return naInfo(f.informacion_adicional?.[key], false);
      const of = (sample.ofertas || []).find((o) => Number(o.proveedor_id) === Number(f.proveedor_id)) || {};
      const fromFuente = infoValorFuente(f, key, false, sample.item_key);
      if (fromFuente !== '—') return fromFuente;
      return naInfo(of[key], false);
    }),
    segundas: segunda.map((f) => naInfo(f.informacion_adicional?.[key], true)),
  }));

  const acciones_administrativas = ACCIONES_ADMIN_ROWS.map(([key, label]) => ({
    key,
    label,
    cotizaciones: primera.map((f) => aaValorFuente(f, key, false)),
    segundas: segunda.map((f) => aaValorFuente(f, key, true)),
  }));

  const ganadorPrincipal = (adj.resumen_proveedores || [])[0]
    || primera.find((p) => Number(p.proveedor_id) === Number(cuadro.proveedor_ganador_id || adj.proveedor_ganador_id));

  const numerosOrden = segunda
    .map((f) => f.referencia)
    .filter((r) => r && r !== '—');

  // Título institucional limpio (sin marca «BORRADOR — NO OFICIAL»)
  const report = {
    anexo: {
      ...anexoBase,
      subtitulo: anexoBase.subtitulo,
    },
    entidad: {
      nombre: optField(entidad.nombre, '—'),
      siglas: optField(entidad.siglas, '—'),
      ruc: optField(entidad.ruc, '—'),
      logo_data_url: safeStr(persistido.logo_data_url || persistido.logo),
    },
    cabecera: {
      denominacion: optField(datos.solicitud?.denominacion || expediente.denominacion || datos.solicitud?.objeto),
      solicitud_codigo: optField(datos.solicitud?.codigo || expediente.solicitud_codigo),
      requerimientos: reqs.length ? reqs.join(', ') : '—',
      fecha: optField(
        adj.fecha_adjudicacion
          ? String(adj.fecha_adjudicacion).slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      ),
      fuente_financiamiento: optField(persistido.fuente_financiamiento || expediente.fuente_financiamiento, 'NO APLICA'),
      area_usuaria: area || '—',
      cmn: cmnList.length ? cmnList.join(', ') : optField(persistido.cmn || expediente.cmn, 'NO APLICA'),
      tipo: anexoBase.codigo === '8B' ? 'Servicios' : 'Bienes',
    },
    fuentes: {
      primera,
      segunda,
      span_cotizacion: 2,
      span_segunda: 5,
      span_adjudicado: 3,
    },
    proveedores: primera.map((p) => ({
      proveedor_id: p.proveedor_id,
      razon_social: p.razon_social,
      ruc: p.ruc,
      validacion_estado: p.validacion_estado,
      cumple_tecnicamente: p.cumple_tecnicamente,
      nro: p.nro,
      label: p.label,
    })),
    filas,
    info_adicional,
    acciones_administrativas,
    resultado: {
      proveedor_adjudicado: ganadorPrincipal
        ? optField(ganadorPrincipal.razon_social)
        : '—',
      ruc_adjudicado: optField(ganadorPrincipal?.ruc),
      valor_adjudicado: fmtMoney(adj.valor_adjudicado ?? cuadro.valor_adjudicado),
      valor_adjudicado_num: adj.valor_adjudicado ?? cuadro.valor_adjudicado ?? null,
      criterio: optField(adj.criterio_label || adj.criterio_seleccion || cuadro.criterio_seleccion),
      metodologia: optField(
        adj.metodologia_texto || adj.criterio_label || adj.criterio_seleccion || cuadro.criterio_seleccion,
      ),
      sustento: optField(adj.sustento_decision || cuadro.sustento_decision),
      modalidad: optField(adj.modalidad || cuadro.modalidad_adjudicacion, 'POR_ITEM'),
      segunda_fuente: segunda.length
        ? segunda.map((f) => `${f.referencia !== '—' ? f.referencia : f.denominacion} (${f.tipo_fuente_label})`).join('; ')
        : 'NO APLICA',
      numeros_orden: numerosOrden.length ? numerosOrden.join(', ') : 'NO APLICA',
      resumen_por_proveedor: (adj.resumen_proveedores || []).map((p) => ({
        razon_social: optField(p.razon_social),
        ruc: optField(p.ruc),
        items: p.items,
        valor: fmtMoney(p.valor_adjudicado),
      })),
    },
    firmas: {
      elaborado_por: { cargo: 'Analista', nombre: optField(persistido.elaborado_por || adj.usuario_adjudicacion || cuadro.usuario_adjudicacion, '') },
      revisado_por: { cargo: 'Coordinador', nombre: optField(persistido.revisado_por, '') },
      aprobado_por: { cargo: 'Director / Unidad de Adquisiciones', nombre: optField(persistido.aprobado_por, '') },
    },
    meta: {
      cuadro_id: cuadro.id,
      version: cuadro.version || 1,
      estado: cuadro.estado,
      validation,
      // Una sola tabla institucional (todas las cotizaciones en la misma hoja)
      proveedores_por_bloque: Math.max(primera.length, 1),
      formato: 'ANEXO_08A_INSTITUCIONAL_V2',
      borrador: false,
    },
  };

  const serialized = JSON.stringify(report);
  if (/undefined|\[object Object\]|NaN/.test(serialized)) {
    console.warn('[cuadroComparativoReportData] valor no imprimible detectado');
  }

  return report;
}

/**
 * RC8.4 — Modelo imprimible Anexo N.° 8A (Cuadro Comparativo Bienes).
 * Solo transforma datos persistidos; sin DOM ni generación PDF.
 */

export const ANEXO_8A = Object.freeze({
  codigo: '8A',
  titulo: 'ANEXO N.° 8A',
  subtitulo: 'Formato de Cuadro Comparativo de Precios — Bienes',
  filenamePrefix: 'Anexo_08A_CuadroComparativo',
});

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

  if (!['ADJUDICADO', 'GENERADO', 'GENERADO_PRELIMINAR'].includes(estado)) {
    faltantes.push('El cuadro debe estar ADJUDICADO (o GENERADO) antes de emitir el Anexo 8A');
  }
  if (!safeStr(datos.solicitud?.codigo || cuadroPersistido.solicitud_codigo)) {
    faltantes.push('Código de Solicitud de Cotización');
  }
  if (!items.length) faltantes.push('Ítems del cuadro');
  if (!proveedores.length) faltantes.push('Proveedores del cuadro');
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
  const proveedores = Array.isArray(datos.resumen_proveedores) ? datos.resumen_proveedores : [];

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

  const proveedoresOrdenados = [...proveedores].sort((a, b) => {
    const aApto = String(a.validacion_estado || '').toUpperCase() === 'APTO' ? 0 : 1;
    const bApto = String(b.validacion_estado || '').toUpperCase() === 'APTO' ? 0 : 1;
    if (aApto !== bApto) return aApto - bApto;
    return String(a.razon_social || '').localeCompare(String(b.razon_social || ''), 'es');
  });

  const filas = itemsRaw.map((it, idx) => {
    const ofertasByProv = new Map((it.ofertas || []).map((o) => [Number(o.proveedor_id), o]));
    const ofertas = proveedoresOrdenados.map((p) => {
      const of = ofertasByProv.get(Number(p.proveedor_id)) || {};
      const adjudicado = Number(it.proveedor_adjudicado_id) === Number(p.proveedor_id);
      return {
        proveedor_id: p.proveedor_id,
        razon_social: optField(of.razon_social || p.razon_social),
        ruc: optField(of.ruc || p.ruc),
        precio_unitario: of.precio_unitario != null ? fmtMoney(of.precio_unitario) : '—',
        precio_total: of.precio_total != null ? fmtMoney(of.precio_total) : '—',
        precio_total_num: of.precio_total != null ? Number(of.precio_total) : null,
        cumplimiento_tecnico: of.cumple_tecnicamente ? 'CUMPLE' : optField(of.validacion_estado, 'NO APLICA'),
        marca: optField(of.marca, 'NO APLICA'),
        modelo: optField(of.modelo, 'NO APLICA'),
        procedencia: optField(of.procedencia, 'NO APLICA'),
        garantia: optField(of.garantia, 'NO APLICA'),
        plazo_entrega: optField(of.plazo_entrega, 'NO APLICA'),
        validez_oferta: optField(of.validez_oferta, 'NO APLICA'),
        observaciones: optField(of.observacion_analista || of.observaciones, '—'),
        adjudicado,
        apto: !!of.cumple_tecnicamente,
      };
    });

    const ganadorOf = ofertas.find((o) => o.adjudicado);
    return {
      item: idx + 1,
      item_key: safeStr(it.item_key),
      requerimiento_codigo: optField(it.requerimiento_codigo),
      pedido_sigamef: optField(it.pedido_sigamef, 'NO APLICA'),
      codigo_sigamef: optField(it.codigo_sigamef, 'NO APLICA'),
      descripcion: optField(it.descripcion),
      unidad_medida: optField(it.unidad_medida, 'UND'),
      cantidad: it.cantidad != null ? String(it.cantidad) : '—',
      proveedor_adjudicado: optField(ganadorOf?.razon_social || it.adjudicado_razon_social),
      valor_adjudicado_item: fmtMoney(it.valor_adjudicado_item ?? ganadorOf?.precio_total_num),
      ofertas,
    };
  });

  const ganadorPrincipal = (adj.resumen_proveedores || [])[0]
    || proveedoresOrdenados.find((p) => Number(p.proveedor_id) === Number(cuadro.proveedor_ganador_id || adj.proveedor_ganador_id));

  const borrador = !!(persistido.borrador_no_oficial || datos.meta?.pdf_modo === 'BORRADOR'
    || persistido.meta?.pdf_modo === 'BORRADOR' || !datos.meta?.puede_pdf_oficial);
  const report = {
    anexo: {
      ...ANEXO_8A,
      subtitulo: borrador
        ? `${ANEXO_8A.subtitulo} — BORRADOR — NO OFICIAL`
        : ANEXO_8A.subtitulo,
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
      tipo: 'Bienes',
    },
    proveedores: proveedoresOrdenados.map((p) => ({
      proveedor_id: p.proveedor_id,
      razon_social: optField(p.razon_social),
      ruc: optField(p.ruc),
      validacion_estado: optField(p.validacion_estado),
      cumple_tecnicamente: !!p.cumple_tecnicamente,
    })),
    filas,
    resultado: {
      proveedor_adjudicado: optField(ganadorPrincipal?.razon_social),
      ruc_adjudicado: optField(ganadorPrincipal?.ruc),
      valor_adjudicado: fmtMoney(adj.valor_adjudicado ?? cuadro.valor_adjudicado),
      valor_adjudicado_num: adj.valor_adjudicado ?? cuadro.valor_adjudicado ?? null,
      criterio: optField(adj.criterio_label || adj.criterio_seleccion || cuadro.criterio_seleccion),
      sustento: optField(adj.sustento_decision || cuadro.sustento_decision),
      modalidad: optField(adj.modalidad || cuadro.modalidad_adjudicacion, 'POR_ITEM'),
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
      proveedores_por_bloque: 3,
    },
  };

  const serialized = JSON.stringify(report);
  if (/undefined|\[object Object\]|NaN/.test(serialized)) {
    console.warn('[cuadroComparativoReportData] valor no imprimible detectado');
  }

  return report;
}

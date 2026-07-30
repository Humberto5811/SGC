/**
 * Contrato de datos del Acta de Recepción institucional.
 * Unidad funcional: Orden + Ítem + Entrega + Recepción.
 */
import {
  formatCalendarDdMmYyyy,
  toCalendarIso,
  correspondeAplicarPenalidad,
} from './calendarDate.js';
import {
  ACTA_ANEXO_NUMERO,
  ACTA_ENCABEZADO_DEFAULT,
  ACTA_TITULO_BIENES,
} from './actaRecepcionBienesTemplate.js';
import { ACTA_LOGO_FALLBACK_DATA_URL } from './actaLogoFallbackDataUrl.js';

function fmtFecha(iso) {
  return formatCalendarDdMmYyyy(iso);
}

function fmtMonto(n, moneda = 'PEN') {
  const val = Number(n || 0);
  const sym = String(moneda).toUpperCase() === 'USD' ? 'US$' : 'S/';
  return `${sym} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * @param {object} detalle — respuesta de getDetalleRecepcionBienes
 * @param {object} [opts]
 */
export function buildActaRecepcionData(detalle = {}, opts = {}) {
  const item = opts.item || (detalle.orden_items || detalle.items || [])[0] || null;
  const entrega = opts.entrega || (detalle.cronograma || detalle.entregas || [])[0] || null;
  const recepcion = opts.recepcion || (detalle.recepciones || [])[0] || null;
  const combo = opts.combo || null;

  const guias = [];
  const fuenteGuias = recepcion ? [recepcion] : (detalle.recepciones || []);
  fuenteGuias.forEach((r) => {
    (r.guias || []).forEach((g) => {
      guias.push({
        numero: g.numero_guia || g.numero || '—',
        fecha: fmtFecha(g.fecha_guia || g.fecha),
        transportista: g.transportista || '—',
      });
    });
  });

  const cantidadProg = Number(
    combo?.cantidad_programada ?? combo?.cantidad ?? item?.cantidad ?? item?.cantidad_contratada ?? 0,
  );
  const precioUnit = Number(item?.precio_unitario ?? 0);
  const montoEntregableNum = opts.montoEntregable != null
    ? Number(opts.montoEntregable)
    : (combo?.monto_programado != null
      ? Number(combo.monto_programado)
      : (cantidadProg && precioUnit ? cantidadProg * precioUnit : Number(recepcion?.monto_liquidar || detalle.monto_total || 0)));

  const fechaMaxima = opts.fechaMaxima
    || combo?.fecha_maxima
    || entrega?.fechaMaxima
    || detalle.fecha_maxima;
  const fechaRecepcion = opts.fechaRecepcion
    || toCalendarIso(recepcion?.fecha_recepcion_guia || recepcion?.fecha_entrega_almacen);
  const penalidad = opts.correspondePenalidad
    || correspondeAplicarPenalidad(fechaRecepcion, fechaMaxima)
    || 'NO';

  const version = Number(opts.version || (detalle.actas?.[0]?.version || 0) + 1) || 1;
  const numeroActa = opts.numeroActa
    || `ACTA-RB-${detalle.numero_orden || detalle.orden_id || 'OC'}-I${item?.id || 'X'}-E${entrega?.id || 'U'}-V${version}`;

  const etiquetaEntrega = entrega?.etiqueta_entrega
    || entrega?.etiquetaEntrega
    || entrega?.label
    || detalle.entrega_label
    || 'ÚNICO';

  const entidadCfg = opts.entidad || detalle.entidad || {};
  const logoDataUrl = opts.logoDataUrl || entidadCfg.logo_data_url || detalle.logo_data_url || ACTA_LOGO_FALLBACK_DATA_URL || '';

  return {
    entidad: {
      nombre: entidadCfg.nombre || detalle.entidad_nombre || 'Instituto Nacional de Salud',
      siglas: entidadCfg.siglas || detalle.entidad_siglas || 'INS',
      sistema: 'SGC — Sistema de Gestión de Contrataciones',
      documento: ACTA_TITULO_BIENES,
      modelo: 'acta-recepcion-modelo.pdf',
      anexo_numero: entidadCfg.anexo_numero || ACTA_ANEXO_NUMERO,
      encabezado_linea1: entidadCfg.encabezado_linea1 || ACTA_ENCABEZADO_DEFAULT.linea1,
      encabezado_linea2: entidadCfg.encabezado_linea2
        || (entidadCfg.nombre
          ? `UNIDADES IMPOSITIVAS TRIBUTARIAS – UIT EN ${String(entidadCfg.nombre).toUpperCase()}`
          : ACTA_ENCABEZADO_DEFAULT.linea2),
      logo_data_url: logoDataUrl,
    },
    numero_acta: numeroActa,
    version,
    fecha_emision: fmtFecha(opts.fechaEmision || new Date()),
    comprobante_pago: opts.comprobantePago || detalle.comprobante_pago || '—',
    folios: opts.folios || detalle.folios || '—',
    cargo_almacen: opts.cargoAlmacen || detalle.cargo_almacen || 'Responsable de Almacén',
    unidad_organica_almacen: opts.unidadAlmacen || detalle.unidad_organica_almacen || 'Almacén',
    orden: {
      id: detalle.orden_id,
      numero: detalle.numero_orden || String(detalle.orden_id || '—'),
      fecha_emision: fmtFecha(detalle.fecha_emision || detalle.fecha_orden),
      fecha_notificacion: fmtFecha(detalle.fecha_notificacion || detalle.enviado_proveedor_at),
      fecha_contrato: fmtFecha(detalle.fecha_contrato || detalle.contrato_fecha),
      moneda: detalle.moneda || 'PEN',
      monto_total: fmtMonto(detalle.monto_total, detalle.moneda),
      monto_total_num: Number(detalle.monto_total || 0),
      monto_liquidar: fmtMonto(
        recepcion?.monto_liquidar ?? detalle.monto_a_liquidar ?? detalle.monto_liquidar_acumulado,
        detalle.moneda,
      ),
      tipo_proceso: detalle.tipo_proceso || '—',
      numero_contrato: detalle.numero_contrato || '—',
      condicion_inicio: detalle.condicion_inicio_label || detalle.condicion_inicio || '—',
      plazo: detalle.plazo_entrega_label || detalle.plazo_total || '—',
      entrega: etiquetaEntrega,
    },
    item: {
      id: item?.id || null,
      codigo_sigamef: item?.codigo_sigamef || item?.codigo || '—',
      descripcion: item?.descripcion || item?.nombre || '—',
      unidad: item?.unidad_medida || '—',
      cantidad: cantidadProg || item?.cantidad || '—',
      precio_unitario: item?.precio_unitario != null ? fmtMonto(item.precio_unitario, detalle.moneda) : '—',
    },
    entrega: {
      id: entrega?.id || null,
      etiqueta: etiquetaEntrega,
      monto: fmtMonto(montoEntregableNum, detalle.moneda),
      monto_num: montoEntregableNum,
      fecha_inicio: fmtFecha(combo?.fecha_efectiva || detalle.fecha_efectiva_inicio),
      condicion_inicio: combo?.condicion_inicio_label || detalle.condicion_inicio_label || '—',
      fecha_maxima: fmtFecha(fechaMaxima),
      plazo: combo?.plazo_label || detalle.plazo_entrega_label || '—',
    },
    recepcion: {
      id: recepcion?.id || null,
      fecha: fmtFecha(fechaRecepcion),
      monto_liquidar: fmtMonto(recepcion?.monto_liquidar, detalle.moneda),
      responsable: recepcion?.responsable || opts.responsable || '—',
      estado_fisico: recepcion?.estado_fisico || '—',
    },
    corresponde_penalidad: penalidad,
    lugar_entrega: opts.lugarEntrega || detalle.lugar_entrega || '—',
    requerimiento: {
      id: detalle.requerimiento_id,
      codigo: detalle.requerimiento_codigo || '—',
      denominacion: detalle.denominacion || '—',
      area_usuaria: detalle.area_usuaria || detalle.area || '—',
      centro: detalle.centro || '—',
    },
    proveedor: {
      razon_social: detalle.proveedor_razon_social || '—',
      ruc: detalle.proveedor_ruc || '—',
    },
    guias,
    items: item ? [{
      nro: 1,
      codigo: item.codigo_sigamef || item.codigo || '—',
      descripcion: item.descripcion || item.nombre || '—',
      unidad: item.unidad_medida || '—',
      cantidad: cantidadProg || item.cantidad || '—',
      precio: item.precio_unitario != null ? fmtMonto(item.precio_unitario, detalle.moneda) : '—',
      importe: fmtMonto(montoEntregableNum, detalle.moneda),
    }] : (detalle.orden_items || detalle.items || []).map((it, idx) => ({
      nro: idx + 1,
      codigo: it.codigo_sigamef || it.codigo || '—',
      descripcion: it.descripcion || it.nombre || '—',
      unidad: it.unidad_medida || '—',
      cantidad: it.cantidad ?? it.cantidad_contratada ?? '—',
      precio: it.precio_unitario != null ? fmtMonto(it.precio_unitario, detalle.moneda) : '—',
      importe: it.importe != null || it.subtotal != null
        ? fmtMonto(it.importe ?? it.subtotal, detalle.moneda)
        : '—',
    })),
    responsable_almacen: opts.responsable || recepcion?.responsable || detalle.responsable || opts.generadoPor || 'Almacén',
    generado_por: opts.generadoPor || 'Sistema',
    observaciones: opts.observaciones || detalle.observaciones_acta || '',
    estado_global: detalle.estado_vigente || detalle.estado_global || '',
    estado_label: detalle.estado_vigente_label || detalle.etiqueta_estado || '',
  };
}

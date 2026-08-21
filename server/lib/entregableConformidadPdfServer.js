/**
 * Generador server-side del Acta de Conformidad de Servicio (PDF 1.4).
 * RC8.15.7A — Modelo institucional V1 (Anexo N.° 18).
 *
 * Contrato: backend arma datos → generador renderiza. Sin SQL directo.
 */
import { formatCalendarDdMmYyyy } from '../../shared/calendarDate.js';
import {
  ACTA_ANEXO_NUMERO,
  ACTA_ENCABEZADO_DEFAULT,
  ACTA_PENALIDAD_GLOSA,
  splitFechaParts,
} from '../../shared/actaRecepcionBienesTemplate.js';
import {
  PdfFormBuilder,
  assemblePdf,
  decodeActaLogoImage,
  loadActaLogoDataUrl,
} from './recepcionActaPdfServer.js';

export const ACTA_CONFORMIDAD_SERVICIOS_TITULO = 'ACTA DE CONFORMIDAD DE SERVICIO';

export const ACTA_CONFORMIDAD_SERVICIOS_TEXTO = 'Por medio del presente, los que suscriben, dan CONFORMIDAD del servicio '
  + 'que a continuación se detalla, el mismo que ha sido realizado a satisfacción del área usuaria, '
  + 'cumpliendo con los Términos de Referencia contractuales acordados, en señal de lo cual firmamos '
  + 'la presente, de acuerdo al siguiente detalle:';

const PENALIDAD_DEFAULT = 'NO CORRESPONDE';

const NO_DISPONIBLE = '—';
const VACIO = '';
const ROW_PAD = 6;

function formatProveedorConformidadTexto(proveedor, ruc) {
  const nombre = String(proveedor || VACIO).trim();
  const rucVal = String(ruc || '').trim();
  return rucVal ? `${nombre} - RUC ${rucVal}` : nombre;
}

function pick(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function fmtMonto(n, moneda = 'PEN') {
  const val = Number(n || 0);
  const sym = String(moneda).toUpperCase() === 'USD' ? 'US$' : 'S/';
  return `${sym} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFecha(iso) {
  if (!iso) return VACIO;
  const f = formatCalendarDdMmYyyy(iso);
  return f && f !== '—' ? f : VACIO;
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEncabezadoLinea2(institucion = {}) {
  if (institucion.encabezado_linea2) return institucion.encabezado_linea2;
  if (institucion.nombre) {
    return `UNIDADES IMPOSITIVAS TRIBUTARIAS – UIT EN ${String(institucion.nombre).toUpperCase()}`;
  }
  return ACTA_ENCABEZADO_DEFAULT.linea2;
}

/**
 * Normaliza el objeto de datos (backend) a campos del modelo V1.
 */
export function resolveActaConformidadServiciosFields(data = {}, opts = {}) {
  const institucion = data.institucion || {};
  const orden = data.orden || {};
  const proveedor = data.proveedor || {};
  const entregable = data.entregable || {};
  const recepcion = data.recepcion || {};
  const contrato = data.contrato || {};
  const firmaAu = data.firma_au || {};
  const firmaDirector = data.firma_director || {};

  const numeroOrden = pick(data.numero_orden, orden.numero_orden, orden.numero, data.orden_numero);
  const fechaOrdenRaw = pick(data.fecha_orden, orden.fecha_orden, orden.fecha, orden.fecha_emision);
  const razonSocial = pick(data.proveedor, data.proveedor_razon_social, proveedor.razon_social, proveedor.nombre);
  const ruc = pick(data.ruc, data.proveedor_ruc, proveedor.ruc);
  const numeroEntrega = pick(data.numero_entrega, entregable.numero_entrega, entregable.numero);
  const servicioPrestado = pick(
    data.servicio_prestado,
    data.objeto_servicio,
    entregable.denominacion,
    entregable.descripcion,
    data.denominacion,
  );
  const importeEntregable = pick(data.importe_entregable, data.importe, entregable.importe);
  const montoTotal = pick(data.monto_total, orden.monto_total, data.monto_total_orden);
  const fechaInicioRaw = pick(data.fecha_inicio, entregable.fecha_base, data.fecha_base);
  const fechaMaximaRaw = pick(data.fecha_maxima, entregable.fecha_maxima);
  const fechaRecepcionRaw = pick(
    data.fecha_recepcion_mesa_partes,
    data.fecha_recepcion,
    data.fecha_culminacion,
    recepcion.fecha_recepcion_mesa_partes,
  );
  const expedienteSgd = pick(data.numero_expediente_sgd, data.expediente_sgd, recepcion.numero_expediente_sgd);
  const requerimiento = pick(data.requerimiento, data.requerimiento_codigo, data.codigo_requerimiento);
  const comprobantePago = pick(data.comprobante_pago, data.numero_comprobante_pago);
  const informeProductos = pick(data.informe_productos, data.numero_informe_productos);
  const folios = pick(data.folios, data.numero_folios);
  const fechaEmisionRaw = pick(data.fecha_emision, data.fecha_emision_acta, data.fecha_conformidad);
  const penalidadRaw = data.corresponde_penalidad;
  const moneda = pick(data.moneda, orden.moneda) || 'PEN';
  const version = Number(pick(data.version, opts.version)) || 1;
  const numeroActa = pick(
    data.numero_acta,
    opts.numeroActa,
    `ACTA-CS-${numeroOrden || 'OS'}-E${numeroEntrega ?? 'X'}-V${version}`,
  );

  const ordenParts = splitFechaParts(fmtFecha(fechaOrdenRaw));
  const contratoNumero = pick(contrato.numero, data.numero_contrato, orden.numero_contrato);
  const contratoFechaRaw = pick(contrato.fecha, data.fecha_contrato, orden.fecha_contrato);
  const contratoParts = splitFechaParts(fmtFecha(contratoFechaRaw));
  const tieneContrato = Boolean(contratoNumero && String(contratoNumero).trim());

  let penalidad = PENALIDAD_DEFAULT;
  if (penalidadRaw != null && String(penalidadRaw).trim() !== '') {
    const p = String(penalidadRaw).trim().toUpperCase();
    if (p === 'SI' || p === 'SÍ' || p.includes('SÍ')) penalidad = 'SÍ';
    else if (p === 'NO' || p === 'NO CORRESPONDE') penalidad = PENALIDAD_DEFAULT;
    else penalidad = String(penalidadRaw).trim();
  }

  const logoDataUrl = opts.logoDataUrl || data.logo_data_url || institucion.logo_data_url || '';

  return {
    encabezado: {
      linea1: opts.encabezadoLinea1 || institucion.encabezado_linea1 || ACTA_ENCABEZADO_DEFAULT.linea1,
      linea2: buildEncabezadoLinea2(institucion),
    },
    institucion: {
      nombre: institucion.nombre || VACIO,
      siglas: institucion.siglas || VACIO,
    },
    titulo: opts.titulo || data.titulo || ACTA_CONFORMIDAD_SERVICIOS_TITULO,
    anexo: opts.anexoNumero || data.anexo_numero || ACTA_ANEXO_NUMERO,
    numero_acta: numeroActa,
    version,
    texto_declarativo: opts.textoDeclarativo || ACTA_CONFORMIDAD_SERVICIOS_TEXTO,
    glosa_penalidad: ACTA_PENALIDAD_GLOSA,
    contrato: {
      numero: tieneContrato ? contratoNumero : VACIO,
      dia: tieneContrato ? contratoParts.dia : VACIO,
      mes: tieneContrato ? contratoParts.mes : VACIO,
      anio: tieneContrato ? contratoParts.anio : VACIO,
      tiene: tieneContrato,
    },
    orden: {
      numero: numeroOrden || VACIO,
      ...ordenParts,
    },
    monto_total: montoTotal != null && montoTotal !== '' ? fmtMonto(montoTotal, moneda) : VACIO,
    proveedor: razonSocial || VACIO,
    proveedor_ruc: ruc || '',
    servicio_prestado: servicioPrestado || VACIO,
    monto_pagar: importeEntregable != null && importeEntregable !== '' ? fmtMonto(importeEntregable, moneda) : VACIO,
    comprobante_pago: comprobantePago || VACIO,
    informe_productos: informeProductos || VACIO,
    folios: folios != null && String(folios).trim() !== '' ? String(folios).trim() : NO_DISPONIBLE,
    fecha_inicio: fmtFecha(fechaInicioRaw),
    fecha_limite: fmtFecha(fechaMaximaRaw),
    fecha_culminacion: fmtFecha(fechaRecepcionRaw),
    penalidad,
    penalidad_pendiente: penalidad === VACIO,
    fecha_emision: fmtFecha(fechaEmisionRaw),
    meta_secundaria: [
      requerimiento ? `Requerimiento: ${requerimiento}` : '',
      expedienteSgd ? `Expediente SGD: ${expedienteSgd}` : '',
    ].filter(Boolean).join(' | '),
    firma_au: {
      nombres: firmaAu.nombres || pick(data.responsable, recepcion.responsable) || VACIO,
      cargo: firmaAu.cargo || 'Responsable del Área Usuaria',
      unidad: firmaAu.unidad || pick(data.area_usuaria, data.area) || VACIO,
    },
    firma_director: {
      nombres: firmaDirector.nombres || VACIO,
      cargo: firmaDirector.cargo || 'Director/Jefe del Centro',
      unidad: firmaDirector.unidad || pick(data.centro, data.centro_costo) || VACIO,
      pendiente: firmaDirector.pendiente !== false && !firmaDirector.nombres,
    },
    logoDataUrl,
    moneda,
  };
}

function drawTitleBox(b, margin, y, contentW, fields) {
  const boxH = 48;
  b.rect(margin, y, contentW, boxH);
  const logoW = 56;
  b.line(margin + logoW, y, margin + logoW, y + boxH);
  if (fields.logoDataUrl) {
    b.image('Im1', margin + 4, y + 4, logoW - 8, boxH - 8);
  }
  b.text(fields.titulo, margin + logoW + (contentW - logoW) / 2, y + 22, {
    size: 10, bold: true, align: 'center', maxW: contentW - logoW - 12,
  });
  return y + boxH + 8;
}

function buildActaConformidadServiciosStream(fields) {
  const b = new PdfFormBuilder();
  const margin = 36;
  const contentW = b.pageW - margin * 2;
  let y = margin + 8;

  y += b.text(fields.encabezado.linea1, b.pageW / 2, y, { size: 8, bold: true, align: 'center', maxW: contentW });
  y += 2;
  y += b.text(fields.encabezado.linea2, b.pageW / 2, y, { size: 8, bold: true, align: 'center', maxW: contentW });
  y += 6;

  y = drawTitleBox(b, margin, y, contentW, fields);

  b.text(`ANEXO N. ${fields.anexo}`, b.pageW / 2, y, { size: 10, bold: true, align: 'center' });
  y += 14;
  y += b.text(fields.texto_declarativo, margin, y, { size: 8, bold: true, maxW: contentW });
  y += 8;

  const half = (contentW - 10) / 2;
  const drawMini = (x, title, num, dia, mes, anio) => {
    const rowH = 13;
    const h = rowH * 3;
    b.rect(x, y, half, h);
    b.line(x, y + rowH, x + half, y + rowH);
    b.line(x, y + rowH * 2, x + half, y + rowH * 2);
    const colW = half / 4;
    for (let i = 1; i < 4; i += 1) b.line(x + colW * i, y + rowH, x + colW * i, y + h);
    b.text(title, x + half / 2, y + 10, { size: 8, bold: true, align: 'center' });
    ['N.', 'DIA', 'MES', 'ANO'].forEach((lab, i) => {
      b.text(lab, x + colW * i + colW / 2, y + rowH + 10, { size: 7, bold: true, align: 'center' });
    });
    [num || VACIO, dia || VACIO, mes || VACIO, anio || VACIO].forEach((v, i) => {
      b.text(String(v || ''), x + colW * i + colW / 2, y + rowH * 2 + 10, { size: 8, align: 'center' });
    });
  };
  drawMini(margin, 'CONTRATO', fields.contrato.numero, fields.contrato.dia, fields.contrato.mes, fields.contrato.anio);
  drawMini(margin + half + 10, 'O/S', fields.orden.numero, fields.orden.dia, fields.orden.mes, fields.orden.anio);
  y += 46;

  const simpleRow = (lab, val, minH = 18) => {
    const labW = contentW * 0.38;
    const valW = contentW - labW - 10;
    const labSize = 7;
    const valSize = 8;
    const labTextH = b.measureText(lab, { size: labSize, maxW: labW - 8 });
    const valTextH = b.measureText(String(val || VACIO), { size: valSize, maxW: valW - 8 });
    const h = Math.max(minH, Math.max(labTextH, valTextH) + ROW_PAD * 2);
    const labStartY = y + (h - labTextH) / 2;
    const valStartY = y + (h - valTextH) / 2;
    b.rect(margin, y, contentW, h);
    b.line(margin + labW, y, margin + labW, y + h);
    b.text(lab, margin + labW / 2, labStartY, {
      size: labSize, bold: true, align: 'center', maxW: labW - 8,
    });
    b.text(String(val || VACIO), margin + labW + 4, valStartY, {
      size: valSize, maxW: valW - 8,
    });
    y += h;
  };

  const proveedorTexto = formatProveedorConformidadTexto(fields.proveedor, fields.proveedor_ruc);

  simpleRow('MONTO TOTAL (Contrato u Orden)', fields.monto_total, 18);
  simpleRow('PROVEEDOR', proveedorTexto, 18);
  simpleRow('SERVICIO PRESTADO', fields.servicio_prestado, 28);

  const rH = 18;
  const c1 = contentW * 0.28;
  const c2 = contentW * 0.22;
  const c3 = contentW * 0.28;
  b.rect(margin, y, contentW, rH);
  b.line(margin + c1, y, margin + c1, y + rH);
  b.line(margin + c1 + c2, y, margin + c1 + c2, y + rH);
  b.line(margin + c1 + c2 + c3, y, margin + c1 + c2 + c3, y + rH);
  b.text('MONTO A PAGAR S/', margin + c1 / 2, y + 12, { size: 7, bold: true, align: 'center' });
  b.text(fields.monto_pagar, margin + c1 + c2 / 2, y + 12, { size: 8, bold: true, align: 'center' });
  b.text('COMPROBANTE DE PAGO', margin + c1 + c2 + c3 / 2, y + 12, { size: 7, bold: true, align: 'center' });
  b.text(fields.comprobante_pago, margin + c1 + c2 + c3 + 4, y + 12, { size: 8, maxW: contentW - c1 - c2 - c3 - 8 });
  y += rH;

  b.rect(margin, y, contentW, rH);
  b.line(margin + c1, y, margin + c1, y + rH);
  b.line(margin + c1 + c2, y, margin + c1 + c2, y + rH);
  b.line(margin + c1 + c2 + c3, y, margin + c1 + c2 + c3, y + rH);
  b.text('N. DE INFORME Y/O PRODUCTOS', margin + c1 / 2, y + 12, { size: 7, bold: true, align: 'center', maxW: c1 - 4 });
  b.text(fields.informe_productos, margin + c1 + 3, y + 12, { size: 8, maxW: c2 - 4 });
  b.text('N. DE FOLIOS', margin + c1 + c2 + c3 / 2, y + 12, { size: 7, bold: true, align: 'center', maxW: c3 - 4 });
  b.text(fields.folios, margin + c1 + c2 + c3 + (contentW - c1 - c2 - c3) / 2, y + 12, {
    size: 8, align: 'center',
  });
  y += rH;

  const dateRow = (lab, val) => {
    const labW = contentW * 0.55;
    const valW = contentW - labW;
    const labH = b.measureText(lab, { size: 6.5, maxW: labW - 8, bold: true });
    const h = Math.max(22, labH + 10);
    b.rect(margin, y, contentW, h);
    b.line(margin + labW, y, margin + labW, y + h);
    b.text(lab, margin + labW / 2, y + 8, { size: 6.5, bold: true, align: 'center', maxW: labW - 8 });
    b.text(val || VACIO, margin + labW + valW / 2, y + h / 2, { size: 8, align: 'center' });
    y += h;
  };
  dateRow('Fecha de Inicio de Plazo', fields.fecha_inicio);
  dateRow(
    'Fecha Limite de culminacion del servicio o fecha de Recepcion por parte de la Entidad '
    + '(para servicios que culminen en entrega de tangibles)',
    fields.fecha_limite,
  );
  dateRow(
    'Fecha de culminacion del servicio o fecha de Recepcion por parte de la Entidad '
    + '(para servicios que culminen en entrega de tangibles)',
    fields.fecha_culminacion,
  );

  const penH = 40;
  const labW = contentW * 0.45;
  b.rect(margin, y, contentW, penH);
  b.line(margin + labW, y, margin + labW, y + penH);
  b.text('Corresponde aplicacion de penalidad?', margin + labW / 2, y + 12, {
    size: 7, bold: true, align: 'center', maxW: labW - 8,
  });
  b.text(fields.penalidad || VACIO, margin + labW / 2, y + 28, { size: 12, bold: true, align: 'center' });
  b.text(fields.glosa_penalidad, margin + labW + 4, y + 10, { size: 6.5, maxW: contentW - labW - 10 });
  y += penH + 10;

  if (fields.meta_secundaria) {
    b.text(fields.meta_secundaria, margin, y, { size: 6.5, maxW: contentW });
    y += 12;
  }

  b.text(`Fecha de emision: ${fields.fecha_emision}`, b.pageW - margin, y, { size: 9, align: 'right' });
  y += 36;

  const colW = contentW / 2;
  const firma = (x, f) => {
    b.line(x + 20, y, x + colW - 20, y);
    if (f.nombres) {
      b.text(f.nombres, x + colW / 2, y + 12, { size: 8, bold: true, align: 'center', maxW: colW - 24 });
    }
    b.text(f.cargo, x + colW / 2, y + 22, { size: 7, align: 'center', maxW: colW - 24 });
    if (f.unidad) {
      b.text(f.unidad, x + colW / 2, y + 32, { size: 7, align: 'center', maxW: colW - 24 });
    }
    b.text('(Firma y Sello)', x + colW / 2, y + 42, { size: 7, align: 'center' });
  };
  firma(margin, fields.firma_au);
  firma(margin + colW, fields.firma_director);

  return b.buildStream();
}

export function getActaConformidadServiciosCss() {
  return `
@page { size: A4 portrait; margin: 12mm 12mm 14mm 12mm; }
.acta-cs { font-family: Arial, Helvetica, sans-serif; color:#000; font-size:10px; line-height:1.25; width:186mm; max-width:100%; margin:0 auto; box-sizing:border-box; }
.acta-cs * { box-sizing:border-box; }
.acta-cs .hdr-lines { text-align:center; font-weight:700; text-transform:uppercase; font-size:9.5px; margin:0 0 6px; }
.acta-cs .title-box { display:grid; grid-template-columns:22mm 1fr; border:1.2px solid #000; min-height:22mm; align-items:stretch; }
.acta-cs .logo-cell { border-right:1.2px solid #000; display:flex; align-items:center; justify-content:center; padding:2mm; }
.acta-cs .logo-cell img { max-width:16mm; max-height:16mm; object-fit:contain; }
.acta-cs .title-cell { display:flex; align-items:center; justify-content:center; text-align:center; font-weight:700; font-size:13px; text-transform:uppercase; padding:2mm 3mm; }
.acta-cs .anexo { text-align:center; font-weight:700; margin:4px 0 8px; font-size:11px; }
.acta-cs .meta-discreta { text-align:right; font-size:7.5px; color:#333; margin:-4px 0 6px; }
.acta-cs .meta-sec { font-size:7.5px; color:#333; margin:4px 0 8px; }
.acta-cs .declarativo { font-weight:700; font-size:9.5px; text-align:justify; margin:0 0 8px; }
.acta-cs table.blk { width:100%; border-collapse:collapse; margin:0 0 6px; }
.acta-cs table.blk td, .acta-cs table.blk th { border:1px solid #000; padding:2mm 2.5mm; vertical-align:top; }
.acta-cs table.blk tr.row-vcenter td { vertical-align:middle; padding:3mm 2.5mm; }
.acta-cs table.blk td.label { font-weight:700; width:38%; font-size:8.5px; text-transform:uppercase; }
.acta-cs .pair { display:grid; grid-template-columns:1fr 1fr; gap:4mm; margin-bottom:6px; }
.acta-cs .ctr { text-align:center; font-weight:700; }
.acta-cs .fecha-linea { text-align:right; margin:8px 0 12px; font-size:10px; }
.acta-cs .firmas { display:grid; grid-template-columns:1fr 1fr; gap:12mm; margin-top:8px; }
.acta-cs .firma { text-align:center; min-height:38mm; padding-top:18mm; }
.acta-cs .firma .linea { border-top:1px solid #000; margin:0 8mm 4px; }
.acta-cs .firma .nm { font-weight:700; font-size:9px; }
.acta-cs .firma .sm { font-size:8.5px; }
.acta-cs .pen-si, .acta-cs .pen-no { font-size:14px; font-weight:700; text-align:center; }
.acta-cs .glosa { font-size:8px; text-align:justify; }
`;
}

export function buildActaConformidadServiciosHtml(data = {}, opts = {}) {
  const f = resolveActaConformidadServiciosFields(data, opts);
  const logo = f.logoDataUrl
    ? `<img src="${esc(f.logoDataUrl)}" alt="Logo institucional" />`
    : '';
  const proveedorTexto = formatProveedorConformidadTexto(f.proveedor, f.proveedor_ruc);
  const penClass = f.penalidad === 'SÍ' ? 'pen-si' : 'pen-no';

  const miniTable = (title, num, dia, mes, anio) => `
    <table class="blk">
      <tr><td colspan="4" class="ctr">${esc(title)}</td></tr>
      <tr><td class="ctr">N.°</td><td class="ctr">DÍA</td><td class="ctr">MES</td><td class="ctr">AÑO</td></tr>
      <tr><td class="ctr">${esc(num)}</td><td class="ctr">${esc(dia)}</td><td class="ctr">${esc(mes)}</td><td class="ctr">${esc(anio)}</td></tr>
    </table>`;

  const row = (lab, val) => `<tr class="row-vcenter"><td class="label">${esc(lab)}</td><td>${esc(val)}</td></tr>`;
  const dateRow = (lab, val) => `<tr><td class="label">${esc(lab)}</td><td class="ctr">${esc(val)}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>${esc(f.numero_acta)}</title>
<style>${getActaConformidadServiciosCss()}</style></head>
<body>
<article class="acta-cs" data-acta="${esc(f.numero_acta)}" data-version="${esc(f.version)}">
  <div class="hdr-lines"><div>${esc(f.encabezado.linea1)}</div><div>${esc(f.encabezado.linea2)}</div></div>
  <div class="title-box"><div class="logo-cell">${logo}</div><div class="title-cell">${esc(f.titulo)}</div></div>
  <div class="anexo">ANEXO N.° ${esc(f.anexo)}</div>
  <p class="declarativo">${esc(f.texto_declarativo)}</p>
  <div class="pair">${miniTable('CONTRATO', f.contrato.numero, f.contrato.dia, f.contrato.mes, f.contrato.anio)}
    ${miniTable('O/S', f.orden.numero, f.orden.dia, f.orden.mes, f.orden.anio)}</div>
  <table class="blk">
    ${row('MONTO TOTAL (Contrato u Orden)', f.monto_total)}
    ${row('PROVEEDOR', proveedorTexto)}
    ${row('SERVICIO PRESTADO', f.servicio_prestado)}
  </table>
  <table class="blk">
    <tr>
      <td class="label ctr">MONTO A PAGAR S/</td><td class="ctr">${esc(f.monto_pagar)}</td>
      <td class="label ctr">COMPROBANTE DE PAGO</td><td>${esc(f.comprobante_pago)}</td>
    </tr>
    <tr>
      <td class="label ctr">N.° DE INFORME Y/O PRODUCTOS</td><td>${esc(f.informe_productos)}</td>
      <td class="label ctr">N.° DE FOLIOS</td><td class="ctr">${esc(f.folios)}</td>
    </tr>
    ${dateRow('Fecha de Inicio de Plazo', f.fecha_inicio)}
    ${dateRow('Fecha Límite de culminación del servicio o fecha de Recepción por parte de la Entidad (para servicios que culminen en entrega de tangibles)', f.fecha_limite)}
    ${dateRow('Fecha de culminación del servicio o fecha de Recepción por parte de la Entidad (para servicios que culminen en entrega de tangibles)', f.fecha_culminacion)}
  </table>
  <table class="blk">
    <tr>
      <td class="label ctr" style="width:45%">¿Corresponde aplicación de penalidad?</td>
      <td class="${penClass}">${esc(f.penalidad)}</td>
    </tr>
    <tr><td colspan="2" class="glosa">${esc(f.glosa_penalidad)}</td></tr>
  </table>
  ${f.meta_secundaria ? `<div class="meta-sec">${esc(f.meta_secundaria)}</div>` : ''}
  <div class="fecha-linea">Fecha de emisión: ${esc(f.fecha_emision)}</div>
  <div class="firmas">
    <div class="firma">
      <div class="linea"></div>
      ${f.firma_au.nombres ? `<div class="nm">${esc(f.firma_au.nombres)}</div>` : ''}
      <div class="sm">${esc(f.firma_au.cargo)}</div>
      <div class="sm">${esc(f.firma_au.unidad)}</div>
      <div class="sm">(Firma y Sello)</div>
    </div>
    <div class="firma">
      <div class="linea"></div>
      ${f.firma_director.nombres ? `<div class="nm">${esc(f.firma_director.nombres)}</div>` : ''}
      <div class="sm">${esc(f.firma_director.cargo)}</div>
      <div class="sm">${esc(f.firma_director.unidad)}</div>
      <div class="sm">(Firma y Sello)</div>
    </div>
  </div>
</article>
</body></html>`;
}

export function generateActaConformidadServiciosPdfServer(data = {}, opts = {}) {
  const logoDataUrl = loadActaLogoDataUrl({
    logoDataUrl: data.logo_data_url || data.institucion?.logo_data_url || opts.logoDataUrl,
  });
  const fields = resolveActaConformidadServiciosFields(data, { ...opts, logoDataUrl });
  const html = buildActaConformidadServiciosHtml(data, { ...opts, logoDataUrl });
  const stream = buildActaConformidadServiciosStream(fields);
  const logoImage = decodeActaLogoImage(logoDataUrl);
  const pdf = assemblePdf(stream, { images: logoImage ? [logoImage] : [] });

  return {
    nombre: `${fields.numero_acta}.pdf`,
    mime_type: 'application/pdf',
    base64: Buffer.from(pdf, 'latin1').toString('base64'),
    data: fields,
    fields,
    html,
    version: fields.version,
  };
}

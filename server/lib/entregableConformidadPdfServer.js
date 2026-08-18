/**
 * Generador server-side del Acta de Conformidad de Servicios (PDF 1.4).
 * RC8.15.5B — Presentación de Entregables de Servicios / Locación (OS).
 *
 * Reutiliza la infraestructura PDF de Recepción de Bienes:
 *   - PdfFormBuilder / assemblePdf / loadActaLogoDataUrl (recepcionActaPdfServer.js)
 *   - formatCalendarDdMmYyyy (shared/calendarDate.js)
 *   - splitFechaParts (shared/actaRecepcionBienesTemplate.js)
 *
 * Es específico para SERVICIOS:
 *   - Título: ACTA DE CONFORMIDAD DE SERVICIOS.
 *   - NO usa textos de recepción física de bienes.
 *   - NO reutiliza "ACTA DE RECEPCIÓN Y CONFORMIDAD DE BIENES".
 *
 * Contrato de separación: backend arma el objeto de datos → este generador recibe
 * datos → genera PDF. NO consulta BD directamente.
 */
import { formatCalendarDdMmYyyy } from '../../shared/calendarDate.js';
import { splitFechaParts } from '../../shared/actaRecepcionBienesTemplate.js';
import {
  PdfFormBuilder,
  assemblePdf,
  loadActaLogoDataUrl,
} from './recepcionActaPdfServer.js';

export const ACTA_CONFORMIDAD_SERVICIOS_TITULO = 'ACTA DE CONFORMIDAD DE SERVICIOS';

export const ACTA_CONFORMIDAD_SERVICIOS_TEXTO = 'Por medio de la presente, el Área Usuaria '
  + 'deja constancia de la conformidad del servicio/locación prestado, verificando que el '
  + 'entregable presentado cumple con los términos de referencia, especificaciones técnicas '
  + 'y condiciones contractuales acordadas.';

export const ACTA_CONFORMIDAD_SERVICIOS_ENCABEZADO = {
  linea1: 'CONTRATACIÓN DE BIENES Y SERVICIOS IGUALES O INFERIORES A OCHO (8)',
  linea2: 'UNIDADES IMPOSITIVAS TRIBUTARIAS – UIT EN EL INSTITUTO NACIONAL DE SALUD',
};

const NO_DISPONIBLE = '—';

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
  return formatCalendarDdMmYyyy(iso);
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Normaliza el objeto de datos (ya construido por el backend) a los campos de la ficha.
 * Acepta forma plana (numero_orden, proveedor_ruc, ...) o anidada (orden/proveedor/...).
 */
export function resolveActaConformidadServiciosFields(data = {}, opts = {}) {
  const orden = data.orden || {};
  const proveedor = data.proveedor || {};
  const entregable = data.entregable || {};
  const recepcion = data.recepcion || {};

  const numeroOrden = pick(data.numero_orden, orden.numero_orden, orden.numero, data.orden_numero);
  const fechaOrdenRaw = pick(data.fecha_orden, orden.fecha_orden, orden.fecha, orden.fecha_emision);
  const requerimiento = pick(data.requerimiento, data.requerimiento_codigo, data.codigo_requerimiento);
  const razonSocial = pick(data.proveedor, data.proveedor_razon_social, proveedor.razon_social, proveedor.nombre);
  const ruc = pick(data.ruc, data.proveedor_ruc, proveedor.ruc);
  const centro = pick(data.centro, data.centro_costo, data.centroCosto);
  const areaUsuaria = pick(data.area_usuaria, data.area, data.areaUsuaria);
  const objetoServicio = pick(data.objeto_servicio, data.objeto, data.descripcion_servicio, data.descripcion);
  const numeroEntrega = pick(data.numero_entrega, entregable.numero_entrega, entregable.numero);
  const denominacion = pick(data.denominacion, entregable.denominacion, entregable.etiqueta_entrega, entregable.descripcion);
  const plazo = pick(data.plazo, entregable.plazo, data.plazo_entrega);
  const fechaMaximaRaw = pick(data.fecha_maxima, entregable.fecha_maxima);
  const fechaRecepcionRaw = pick(data.fecha_recepcion_mesa_partes, data.fecha_recepcion, recepcion.fecha_recepcion_mesa_partes);
  const expedienteSgd = pick(data.numero_expediente_sgd, data.expediente_sgd, recepcion.numero_expediente_sgd);
  const cantidad = pick(data.cantidad, entregable.cantidad);
  const precioUnitario = pick(data.precio_unitario, entregable.precio_unitario);
  const importeEntregable = pick(data.importe_entregable, data.importe, entregable.importe);
  const responsable = pick(data.responsable, recepcion.responsable);
  const fechaEmisionRaw = pick(data.fecha_emision, data.fecha_emision_acta, data.fecha_conformidad);
  const conclusion = pick(data.conclusion, data.conclusion_conformidad);

  const moneda = pick(data.moneda) || 'PEN';
  const version = Number(pick(data.version, opts.version)) || 1;
  const numeroActa = pick(
    data.numero_acta, opts.numeroActa,
    `ACTA-CS-${numeroOrden || 'OS'}-E${numeroEntrega ?? 'X'}-V${version}`,
  );

  const fechaOrden = fmtFecha(fechaOrdenRaw);
  const ordenParts = splitFechaParts(fechaOrden);

  return {
    encabezado: {
      linea1: opts.encabezadoLinea1 || data.encabezado_linea1 || ACTA_CONFORMIDAD_SERVICIOS_ENCABEZADO.linea1,
      linea2: opts.encabezadoLinea2 || data.encabezado_linea2 || ACTA_CONFORMIDAD_SERVICIOS_ENCABEZADO.linea2,
    },
    titulo: opts.titulo || data.titulo || ACTA_CONFORMIDAD_SERVICIOS_TITULO,
    numero_acta: numeroActa,
    version,
    texto_declarativo: opts.textoDeclarativo || ACTA_CONFORMIDAD_SERVICIOS_TEXTO,
    orden: { numero: numeroOrden || NO_DISPONIBLE, fecha: fechaOrden, ...ordenParts },
    requerimiento: requerimiento || NO_DISPONIBLE,
    proveedor: razonSocial || NO_DISPONIBLE,
    proveedor_ruc: ruc || '',
    centro: centro || NO_DISPONIBLE,
    area_usuaria: areaUsuaria || NO_DISPONIBLE,
    objeto_servicio: objetoServicio || NO_DISPONIBLE,
    numero_entrega: numeroEntrega != null && numeroEntrega !== '' ? numeroEntrega : NO_DISPONIBLE,
    denominacion: denominacion || NO_DISPONIBLE,
    plazo: plazo || NO_DISPONIBLE,
    fecha_maxima: fmtFecha(fechaMaximaRaw),
    fecha_recepcion: fmtFecha(fechaRecepcionRaw),
    expediente_sgd: expedienteSgd || NO_DISPONIBLE,
    cantidad: cantidad != null && cantidad !== '' ? cantidad : NO_DISPONIBLE,
    precio_unitario: precioUnitario != null && precioUnitario !== '' ? fmtMonto(precioUnitario, moneda) : NO_DISPONIBLE,
    importe_entregable: importeEntregable != null && importeEntregable !== '' ? fmtMonto(importeEntregable, moneda) : NO_DISPONIBLE,
    responsable: responsable || NO_DISPONIBLE,
    fecha_emision: fmtFecha(fechaEmisionRaw),
    conclusion: conclusion || '',
    tiene_responsable: !!responsable,
    tiene_conclusion: !!conclusion,
    moneda,
    logoDataUrl: opts.logoDataUrl || data.logo_data_url || '',
  };
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

  const boxH = 48;
  b.rect(margin, y, contentW, boxH);
  const logoW = 56;
  b.line(margin + logoW, y, margin + logoW, y + boxH);
  b.text('LOGO', margin + logoW / 2, y + 28, { size: 7, align: 'center' });
  b.text(fields.titulo, margin + logoW + (contentW - logoW) / 2, y + 22, {
    size: 10, bold: true, align: 'center', maxW: contentW - logoW - 12,
  });
  y += boxH + 8;

  b.text(`ACTA N. ${fields.numero_acta}`, b.pageW - margin, y, { size: 7, align: 'right' });
  y += 10;
  y += b.text(fields.texto_declarativo, margin, y, { size: 8, bold: true, maxW: contentW });
  y += 8;

  // Bloque ORDEN DE SERVICIO (N.° + día/mes/año).
  {
    const rowH = 13;
    const h = rowH * 3;
    const colW = contentW / 4;
    b.rect(margin, y, contentW, h);
    b.line(margin, y + rowH, margin + contentW, y + rowH);
    b.line(margin, y + rowH * 2, margin + contentW, y + rowH * 2);
    for (let i = 1; i < 4; i += 1) b.line(margin + colW * i, y + rowH, margin + colW * i, y + h);
    b.text('ORDEN DE SERVICIO', margin + contentW / 2, y + 10, { size: 8, bold: true, align: 'center' });
    ['N.', 'DIA', 'MES', 'ANO'].forEach((lab, i) => {
      b.text(lab, margin + colW * i + colW / 2, y + rowH + 10, { size: 7, bold: true, align: 'center' });
    });
    [fields.orden.numero, fields.orden.dia, fields.orden.mes, fields.orden.anio].forEach((v, i) => {
      b.text(String(v ?? '-'), margin + colW * i + colW / 2, y + rowH * 2 + 10, { size: 8, align: 'center' });
    });
    y += h + 8;
  }

  const simpleRow = (lab, val, h = 16) => {
    const labW = contentW * 0.42;
    b.rect(margin, y, contentW, h);
    b.line(margin + labW, y, margin + labW, y + h);
    b.text(lab, margin + labW / 2, y + h / 2 + 3, { size: 7, bold: true, align: 'center', maxW: labW - 6 });
    b.text(String(val ?? NO_DISPONIBLE), margin + labW + 4, y + h / 2 + 3, { size: 8, maxW: contentW - labW - 10 });
    y += h;
  };

  const proveedorTexto = fields.proveedor_ruc && fields.proveedor_ruc !== NO_DISPONIBLE && fields.proveedor_ruc !== '-'
    ? `${fields.proveedor} · RUC ${fields.proveedor_ruc}`
    : fields.proveedor;
  const centroArea = [fields.centro, fields.area_usuaria]
    .filter((x) => x && x !== NO_DISPONIBLE)
    .join(' – ') || NO_DISPONIBLE;

  simpleRow('REQUERIMIENTO', fields.requerimiento);
  simpleRow('PROVEEDOR', proveedorTexto, 18);
  simpleRow('CENTRO / AREA USUARIA', centroArea, 18);
  simpleRow('OBJETO / DESCRIPCION DEL SERVICIO', fields.objeto_servicio, 22);
  simpleRow('N. ENTREGABLE', fields.numero_entrega);
  simpleRow('DENOMINACION', fields.denominacion, 20);
  simpleRow('PLAZO', fields.plazo);
  simpleRow('FECHA MAXIMA', fields.fecha_maxima);
  simpleRow('FECHA RECEPCION MESA DE PARTES', fields.fecha_recepcion);
  simpleRow('EXPEDIENTE SGD', fields.expediente_sgd);
  simpleRow('CANTIDAD', fields.cantidad);
  simpleRow('PRECIO UNITARIO', fields.precio_unitario);
  simpleRow('IMPORTE DEL ENTREGABLE', fields.importe_entregable);

  if (fields.tiene_responsable) {
    simpleRow('RESPONSABLE', fields.responsable, 18);
  }

  if (fields.tiene_conclusion) {
    const h = 40;
    const labW = contentW * 0.30;
    b.rect(margin, y, contentW, h);
    b.line(margin + labW, y, margin + labW, y + h);
    b.text('CONCLUSION', margin + labW / 2, y + 16, { size: 7, bold: true, align: 'center', maxW: labW - 6 });
    b.text(fields.conclusion, margin + labW + 4, y + 12, { size: 7.5, maxW: contentW - labW - 10 });
    y += h + 8;
  }

  b.text(`Fecha de emisión: ${fields.fecha_emision}`, b.pageW - margin, y, { size: 9, align: 'right' });
  y += 30;

  b.line(margin + 80, y, b.pageW - margin - 80, y);
  b.text(fields.responsable, b.pageW / 2, y + 12, { size: 8, bold: true, align: 'center', maxW: contentW - 40 });
  b.text('Responsable del Área Usuaria', b.pageW / 2, y + 22, { size: 7, align: 'center', maxW: contentW - 40 });
  b.text(fields.area_usuaria !== NO_DISPONIBLE ? fields.area_usuaria : '', b.pageW / 2, y + 32, { size: 7, align: 'center', maxW: contentW - 40 });
  b.text('(Firma y sello)', b.pageW / 2, y + 42, { size: 7, align: 'center' });

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
.acta-cs .logo-fallback { width:14mm; height:14mm; border:1px dashed #666; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:7px; color:#666; }
.acta-cs .title-cell { display:flex; align-items:center; justify-content:center; text-align:center; font-weight:700; font-size:13px; text-transform:uppercase; padding:2mm 3mm; }
.acta-cs .meta-discreta { text-align:right; font-size:8px; margin:4px 0 6px; }
.acta-cs .declarativo { font-weight:700; font-size:9.5px; text-align:justify; margin:0 0 8px; }
.acta-cs table.blk { width:100%; border-collapse:collapse; margin:0 0 6px; }
.acta-cs table.blk td { border:1px solid #000; padding:2mm 2.5mm; vertical-align:top; }
.acta-cs table.blk td.label { font-weight:700; width:40%; font-size:8.5px; text-transform:uppercase; }
.acta-cs .fecha-linea { text-align:right; margin:8px 0 12px; font-size:10px; }
.acta-cs .firma { text-align:center; min-height:30mm; padding-top:16mm; }
.acta-cs .firma .linea { border-top:1px solid #000; margin:0 20mm 4px; }
.acta-cs .firma .nm { font-weight:700; font-size:9px; }
.acta-cs .firma .sm { font-size:8.5px; }
`;
}

/**
 * HTML de vista previa — misma estructura que el PDF institucional de servicios.
 */
export function buildActaConformidadServiciosHtml(data = {}, opts = {}) {
  const f = resolveActaConformidadServiciosFields(data, opts);
  const logo = f.logoDataUrl
    ? `<img src="${esc(f.logoDataUrl)}" alt="Logo institucional" />`
    : '<div class="logo-fallback">LOGO</div>';

  const row = (lab, val) => `<tr><td class="label">${esc(lab)}</td><td>${esc(val)}</td></tr>`;
  const proveedorTexto = f.proveedor_ruc && f.proveedor_ruc !== NO_DISPONIBLE && f.proveedor_ruc !== '-'
    ? `${f.proveedor} · RUC ${f.proveedor_ruc}`
    : f.proveedor;
  const centroArea = [f.centro, f.area_usuaria].filter((x) => x && x !== NO_DISPONIBLE).join(' – ') || NO_DISPONIBLE;
  const extras = [
    f.tiene_responsable ? row('RESPONSABLE', f.responsable) : '',
    f.tiene_conclusion ? row('CONCLUSIÓN', f.conclusion) : '',
  ].join('');

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>${esc(f.numero_acta)}</title>
<style>${getActaConformidadServiciosCss()}</style></head>
<body>
<article class="acta-cs" data-acta="${esc(f.numero_acta)}" data-version="${esc(f.version)}">
  <div class="hdr-lines"><div>${esc(f.encabezado.linea1)}</div><div>${esc(f.encabezado.linea2)}</div></div>
  <div class="title-box"><div class="logo-cell">${logo}</div><div class="title-cell">${esc(f.titulo)}</div></div>
  <div class="meta-discreta">ACTA N.° ${esc(f.numero_acta)}</div>
  <p class="declarativo">${esc(f.texto_declarativo)}</p>
  <table class="blk">
    ${row('ORDEN DE SERVICIO', `${f.orden.numero} · ${f.orden.fecha}`)}
    ${row('REQUERIMIENTO', f.requerimiento)}
    ${row('PROVEEDOR', proveedorTexto)}
    ${row('CENTRO / ÁREA USUARIA', centroArea)}
    ${row('OBJETO / DESCRIPCIÓN DEL SERVICIO', f.objeto_servicio)}
    ${row('N.° ENTREGABLE', f.numero_entrega)}
    ${row('DENOMINACIÓN', f.denominacion)}
    ${row('PLAZO', f.plazo)}
    ${row('FECHA MÁXIMA', f.fecha_maxima)}
    ${row('FECHA RECEPCIÓN MESA DE PARTES', f.fecha_recepcion)}
    ${row('EXPEDIENTE SGD', f.expediente_sgd)}
    ${row('CANTIDAD', f.cantidad)}
    ${row('PRECIO UNITARIO', f.precio_unitario)}
    ${row('IMPORTE DEL ENTREGABLE', f.importe_entregable)}
    ${extras}
  </table>
  <div class="fecha-linea">Fecha de emisión: ${esc(f.fecha_emision)}</div>
  <div class="firma">
    <div class="linea"></div>
    <div class="nm">${esc(f.responsable)}</div>
    <div class="sm">Responsable del Área Usuaria</div>
    <div class="sm">${esc(f.area_usuaria !== NO_DISPONIBLE ? f.area_usuaria : '')}</div>
    <div class="sm">(Firma y sello)</div>
  </div>
</article>
</body></html>`;
}

/**
 * @returns {{ nombre: string, mime_type: string, base64: string, data: object, fields: object, html: string, version: number }}
 */
export function generateActaConformidadServiciosPdfServer(data = {}, opts = {}) {
  const logoDataUrl = loadActaLogoDataUrl({ logoDataUrl: data.logo_data_url || opts.logoDataUrl });
  const fields = resolveActaConformidadServiciosFields(data, { ...opts, logoDataUrl });
  const html = buildActaConformidadServiciosHtml(fields);
  const stream = buildActaConformidadServiciosStream(fields);
  const pdf = assemblePdf(stream);

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




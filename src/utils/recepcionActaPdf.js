/**
 * Generador FE del Acta institucional (jsPDF).
 * Misma estructura que shared/actaRecepcionBienesTemplate.js (HTML de vista previa).
 * Tecnología: jsPDF (CDN) + dibujo de ficha/tablas — no informe por secciones.
 */
import { buildActaRecepcionData } from '../../shared/recepcionActaData.js';
import {
  buildActaRecepcionHtml,
  resolveActaTemplateFields,
} from '../../shared/actaRecepcionBienesTemplate.js';

function ensureJsPdf() {
  if (!window.jspdf?.jsPDF) {
    throw new Error('Biblioteca PDF no disponible. Recargue la página.');
  }
  return window.jspdf.jsPDF;
}

function wrap(doc, text, maxW) {
  return doc.splitTextToSize(String(text ?? '—'), maxW);
}

/**
 * Dibuja la ficha institucional A4 (primera página).
 */
function drawActaInstitucional(doc, fields, pageW, pageH, margin) {
  const contentW = pageW - margin * 2;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0);
  const h1 = wrap(doc, fields.encabezado.linea1, contentW);
  doc.text(h1, pageW / 2, y, { align: 'center' });
  y += h1.length * 10 + 2;
  const h2 = wrap(doc, fields.encabezado.linea2, contentW);
  doc.text(h2, pageW / 2, y, { align: 'center' });
  y += h2.length * 10 + 6;

  // Title box
  const boxH = 52;
  doc.setDrawColor(0);
  doc.setLineWidth(1);
  doc.rect(margin, y, contentW, boxH);
  const logoW = 58;
  doc.line(margin + logoW, y, margin + logoW, y + boxH);

  if (fields.logoDataUrl) {
    try {
      const fmt = String(fields.logoDataUrl).includes('image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(fields.logoDataUrl, fmt, margin + 8, y + 6, 42, 40);
    } catch (_) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text('LOGO', margin + logoW / 2, y + boxH / 2, { align: 'center' });
    }
  } else {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.circle(margin + logoW / 2, y + boxH / 2, 16);
    doc.text('LOGO', margin + logoW / 2, y + boxH / 2 + 2, { align: 'center' });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const titleLines = wrap(doc, fields.titulo, contentW - logoW - 16);
  const titleY = y + (boxH - titleLines.length * 12) / 2 + 10;
  doc.text(titleLines, margin + logoW + (contentW - logoW) / 2, titleY, { align: 'center' });
  y += boxH + 8;

  doc.setFontSize(10);
  doc.text(`ANEXO N.° ${fields.anexo}`, pageW / 2, y, { align: 'center' });
  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`ACTA N.° ${fields.numero_acta}`, pageW - margin, y, { align: 'right' });
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const decl = wrap(doc, fields.texto_declarativo, contentW);
  doc.text(decl, margin, y, { align: 'justify', maxWidth: contentW });
  y += decl.length * 10 + 8;

  // Contrato / Orden pair
  const half = (contentW - 10) / 2;
  const drawMini = (x, title, num, dia, mes, anio, numRed = false) => {
    const rowH = 14;
    const h = rowH * 3;
    doc.setDrawColor(0);
    doc.setLineWidth(0.7);
    doc.rect(x, y, half, h);
    doc.line(x, y + rowH, x + half, y + rowH);
    doc.line(x, y + rowH * 2, x + half, y + rowH * 2);
    const colW = half / 4;
    for (let i = 1; i < 4; i += 1) {
      doc.line(x + colW * i, y + rowH, x + colW * i, y + h);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(title, x + half / 2, y + 10, { align: 'center' });
    ['N.°', 'DÍA', 'MES', 'AÑO'].forEach((lab, i) => {
      doc.text(lab, x + colW * i + colW / 2, y + rowH + 10, { align: 'center' });
    });
    doc.setFont(numRed ? 'helvetica' : 'helvetica', numRed ? 'bold' : 'normal');
    if (numRed) doc.setTextColor(192, 0, 0);
    doc.text(String(num || '—'), x + colW / 2, y + rowH * 2 + 10, { align: 'center' });
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.text(String(dia || '—'), x + colW * 1.5, y + rowH * 2 + 10, { align: 'center' });
    doc.text(String(mes || '—'), x + colW * 2.5, y + rowH * 2 + 10, { align: 'center' });
    doc.text(String(anio || '—'), x + colW * 3.5, y + rowH * 2 + 10, { align: 'center' });
  };
  drawMini(margin, 'CONTRATO', fields.contrato.numero, fields.contrato.dia, fields.contrato.mes, fields.contrato.anio);
  drawMini(margin + half + 10, 'ORDEN DE COMPRA', fields.orden.numero, fields.orden.dia, fields.orden.mes, fields.orden.anio, true);
  y += 48;

  const row = (label, value, opts = {}) => {
    const rh = opts.h || 18;
    const labW = opts.labW || contentW * 0.38;
    doc.rect(margin, y, contentW, rh);
    doc.line(margin + labW, y, margin + labW, y + rh);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const labs = wrap(doc, label, labW - 8);
    doc.text(labs, margin + labW / 2, y + (rh - labs.length * 9) / 2 + 8, { align: 'center' });
    doc.setFont(opts.red ? 'helvetica' : 'helvetica', opts.red ? 'bold' : 'normal');
    if (opts.red) doc.setTextColor(192, 0, 0);
    const vals = wrap(doc, value, contentW - labW - 10);
    const align = opts.align || 'left';
    const vx = align === 'right' ? pageW - margin - 4 : (align === 'center' ? margin + labW + (contentW - labW) / 2 : margin + labW + 4);
    doc.text(vals, vx, y + (rh - vals.length * 9) / 2 + 8, { align: align === 'left' ? 'left' : align });
    doc.setTextColor(0);
    y += rh;
  };

  row('MONTO TOTAL\n(Contrato u Orden)', fields.monto_total, { align: 'right', h: 22 });
  row('PROVEEDOR', fields.proveedor_ruc && fields.proveedor_ruc !== '—'
    ? `${fields.proveedor} · RUC ${fields.proveedor_ruc}`
    : fields.proveedor, { h: 20 });
  row('BIEN / ÍTEM RECEPCIONADO', fields.bien_item, { h: 24 });

  // Monto / comprobante / guía / entrega / folios
  const rH = 18;
  const c1 = contentW * 0.28;
  const c2 = contentW * 0.22;
  const c3 = contentW * 0.28;
  doc.rect(margin, y, contentW, rH);
  doc.line(margin + c1, y, margin + c1, y + rH);
  doc.line(margin + c1 + c2, y, margin + c1 + c2, y + rH);
  doc.line(margin + c1 + c2 + c3, y, margin + c1 + c2 + c3, y + rH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('MONTO A LIQUIDAR S/', margin + c1 / 2, y + 11, { align: 'center' });
  doc.setTextColor(192, 0, 0);
  doc.setFontSize(9);
  doc.text(String(fields.monto_liquidar), margin + c1 + c2 / 2, y + 12, { align: 'center' });
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('N.° COMPROBANTE DE PAGO', margin + c1 + c2 + c3 / 2, y + 11, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(String(fields.comprobante_pago), margin + c1 + c2 + c3 + (contentW - c1 - c2 - c3) / 2, y + 12, { align: 'center' });
  y += rH;

  doc.rect(margin, y, contentW, rH + 4);
  doc.line(margin + c1, y, margin + c1, y + rH + 4);
  doc.line(margin + c1 + c2, y, margin + c1 + c2, y + rH + 4);
  doc.line(margin + c1 + c2 + c3, y, margin + c1 + c2 + c3, y + rH + 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('N.° DE GUÍA DE REMISIÓN', margin + c1 / 2, y + 13, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(wrap(doc, fields.guias, c2 - 4), margin + c1 + 3, y + 13);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('ENTREGA / ENTREGABLE', margin + c1 + c2 + c3 / 2, y + 13, { align: 'center' });
  doc.setTextColor(192, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(String(fields.entrega), margin + c1 + c2 + c3 + (contentW - c1 - c2 - c3) / 2, y + 14, { align: 'center' });
  doc.setTextColor(0);
  y += rH + 4;

  row('N.° DE FOLIOS', fields.folios, { labW: c1, h: 16 });

  // Fechas + penalidad
  const dateRow = (lab, val) => {
    const rh = 16;
    const labW = contentW * 0.55;
    doc.rect(margin, y, contentW, rh);
    doc.line(margin + labW, y, margin + labW, y + rh);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(lab, margin + labW / 2, y + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(String(val), margin + labW + (contentW - labW) / 2, y + 11, { align: 'center' });
    y += rh;
  };
  dateRow('Fecha de Inicio de Plazo', fields.fecha_inicio);
  dateRow('Fecha Límite de Entrega / Fecha Máxima', fields.fecha_maxima);
  dateRow('Fecha de Recepción', fields.fecha_recepcion);
  dateRow('CONDICIÓN DE INICIO DEL PLAZO', fields.condicion_inicio);

  const penH = 42;
  const labW = contentW * 0.45;
  doc.rect(margin, y, contentW, penH);
  doc.line(margin + labW, y, margin + labW, y + penH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('¿CORRESPONDE APLICACIÓN DE PENALIDAD?', margin + labW / 2, y + 12, { align: 'center' });
  if (fields.penalidad === 'SÍ') doc.setTextColor(192, 0, 0);
  doc.setFontSize(14);
  doc.text(fields.penalidad, margin + labW / 2, y + 30, { align: 'center' });
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const glosa = wrap(doc, fields.glosa_penalidad, contentW - labW - 10);
  doc.text(glosa, margin + labW + 4, y + 12);
  y += penH + 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Fecha: ${fields.fecha_emision_acta}`, pageW - margin, y, { align: 'right' });
  y += 28;

  // Firmas
  const colW = contentW / 2;
  const drawFirma = (x, firma) => {
    doc.setDrawColor(0);
    doc.line(x + 24, y, x + colW - 24, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(String(firma.nombres || '—'), x + colW / 2, y + 12, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(String(firma.cargo || ''), x + colW / 2, y + 22, { align: 'center' });
    doc.text(String(firma.unidad || ''), x + colW / 2, y + 32, { align: 'center' });
    doc.text('(Firma y sello)', x + colW / 2, y + 42, { align: 'center' });
  };
  drawFirma(margin, fields.firma_almacen);
  drawFirma(margin + colW, fields.firma_au);

  return y + 50;
}

function drawAnexoDetalle(doc, fields, pageW, margin) {
  if (!fields.detalleAnexo?.necesitaAnexo) return;
  doc.addPage();
  let y = margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`ANEXO DE DETALLE — ${fields.numero_acta}`, pageW / 2, y, { align: 'center' });
  y += 16;
  const body = (fields.detalleAnexo.items || []).map((it) => [
    String(it.nro), String(it.codigo), String(it.descripcion),
    String(it.unidad), String(it.cantidad), String(it.importe),
  ]);
  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      startY: y,
      head: [['N.°', 'Código', 'Descripción', 'U.M.', 'Cant.', 'Importe']],
      body: body.length ? body : [['—', '—', 'Sin ítems', '—', '—', '—']],
      styles: { fontSize: 8, cellPadding: 3, lineColor: 0, lineWidth: 0.4 },
      headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
      margin: { left: margin, right: margin },
    });
  }
}

/**
 * @returns {{ nombre: string, mime_type: string, base64: string, data: object, version: number, html: string }}
 */
export function generateActaRecepcionPdf(detalleOrData = {}, opts = {}) {
  const data = detalleOrData?.entidad
    ? detalleOrData
    : buildActaRecepcionData(detalleOrData, opts);
  const fields = resolveActaTemplateFields(data, opts);
  const html = buildActaRecepcionHtml(data, opts);

  const jsPDF = ensureJsPdf();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  drawActaInstitucional(doc, fields, pageW, pageH, margin);
  drawAnexoDetalle(doc, fields, pageW, margin);

  const dataUri = doc.output('datauristring');
  const base64 = dataUri.includes('base64,') ? dataUri.split('base64,').pop() : dataUri;
  return {
    nombre: `${data.numero_acta}.pdf`,
    mime_type: 'application/pdf',
    base64,
    data,
    version: data.version,
    html,
    fields,
  };
}

/** HTML de vista previa (misma plantilla que alimenta el PDF). */
export function buildActaRecepcionPreviewHtml(detalleOrData = {}, opts = {}) {
  const data = detalleOrData?.entidad
    ? detalleOrData
    : buildActaRecepcionData(detalleOrData, opts);
  return buildActaRecepcionHtml(data, opts);
}

export function downloadActaRecepcionPdf(detalle, opts = {}) {
  const pdf = generateActaRecepcionPdf(detalle, opts);
  const a = document.createElement('a');
  a.href = `data:application/pdf;base64,${pdf.base64}`;
  a.download = pdf.nombre;
  a.click();
  return pdf;
}

/**
 * Generador server-side del Acta institucional (PDF 1.4).
 * Misma ficha que shared/actaRecepcionBienesTemplate.js / FE jsPDF.
 * Tecnología: PDF operadores (tablas/bordes) — sin secciones I–VI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildActaRecepcionData } from '../../shared/recepcionActaData.js';
import {
  buildActaRecepcionHtml,
  resolveActaTemplateFields,
} from '../../shared/actaRecepcionBienesTemplate.js';
import { ACTA_LOGO_FALLBACK_DATA_URL } from '../../shared/actaLogoFallbackDataUrl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_FALLBACK = path.join(__dirname, '../assets/logo-ins-fallback.png');

function latin1(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/–|—/g, '-')
    .replace(/[^\x20-\x7E]/g, '?');
}

function esc(s) {
  return latin1(s)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Carga logo institucional: opts > archivo assets (fallback controlado).
 * No usa rutas absolutas de desarrollo del usuario.
 */
export function loadActaLogoDataUrl(opts = {}) {
  if (opts.logoDataUrl) return opts.logoDataUrl;
  try {
    if (fs.existsSync(LOGO_FALLBACK)) {
      const b64 = fs.readFileSync(LOGO_FALLBACK).toString('base64');
      return `data:image/png;base64,${b64}`;
    }
  } catch (_) { /* ignore */ }
  return ACTA_LOGO_FALLBACK_DATA_URL || '';
}

export class PdfFormBuilder {
  constructor() {
    this.ops = [];
    this.pageW = 595.28;
    this.pageH = 841.89;
  }

  push(...parts) {
    this.ops.push(...parts);
  }

  rect(x, yTop, w, h) {
    // PDF y from bottom
    const y = this.pageH - yTop - h;
    this.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
  }

  line(x1, y1Top, x2, y2Top) {
    const y1 = this.pageH - y1Top;
    const y2 = this.pageH - y2Top;
    this.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  text(str, x, yTop, { size = 9, bold = false, align = 'left', maxW = null } = {}) {
    const font = bold ? '/F2' : '/F1';
    let lines = [String(str ?? '')];
    if (maxW) {
      const approx = Math.max(8, Math.floor(maxW / (size * 0.5)));
      const words = String(str ?? '').split(/\s+/);
      lines = [];
      let cur = '';
      words.forEach((w) => {
        const next = cur ? `${cur} ${w}` : w;
        if (latin1(next).length > approx && cur) {
          lines.push(cur);
          cur = w;
        } else cur = next;
      });
      if (cur) lines.push(cur);
      if (!lines.length) lines = ['—'];
    }
    lines.forEach((ln, i) => {
      const y = this.pageH - (yTop + i * (size + 2));
      let tx = x;
      const t = esc(ln);
      if (align === 'center') {
        const tw = latin1(ln).length * size * 0.45;
        tx = x - tw / 2;
      } else if (align === 'right') {
        const tw = latin1(ln).length * size * 0.45;
        tx = x - tw;
      }
      this.push('BT', `${font} ${size} Tf`, `${tx.toFixed(2)} ${y.toFixed(2)} Td`, `(${t}) Tj`, 'ET');
    });
    return lines.length * (size + 2);
  }

  buildStream() {
    return ['0.8 w', '0 0 0 RG', '0 0 0 rg', ...this.ops].join('\n');
  }
}

function buildInstitucionalStream(fields) {
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

  b.text(`ANEXO N. ${fields.anexo}`, b.pageW / 2, y, { size: 10, bold: true, align: 'center' });
  y += 12;
  b.text(`ACTA N. ${fields.numero_acta}`, b.pageW - margin, y, { size: 7, align: 'right' });
  y += 10;
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
    [num, dia, mes, anio].forEach((v, i) => {
      b.text(String(v || '-'), x + colW * i + colW / 2, y + rowH * 2 + 10, { size: 8, align: 'center' });
    });
  };
  drawMini(margin, 'CONTRATO', fields.contrato.numero, fields.contrato.dia, fields.contrato.mes, fields.contrato.anio);
  drawMini(margin + half + 10, 'ORDEN DE COMPRA', fields.orden.numero, fields.orden.dia, fields.orden.mes, fields.orden.anio);
  y += 46;

  const simpleRow = (lab, val, h = 16) => {
    const labW = contentW * 0.38;
    b.rect(margin, y, contentW, h);
    b.line(margin + labW, y, margin + labW, y + h);
    b.text(lab, margin + labW / 2, y + h / 2 + 3, { size: 7, bold: true, align: 'center', maxW: labW - 6 });
    b.text(val, margin + labW + 4, y + h / 2 + 3, { size: 8, maxW: contentW - labW - 10 });
    y += h;
  };
  simpleRow('MONTO TOTAL (Contrato u Orden)', fields.monto_total, 18);
  simpleRow('PROVEEDOR', fields.proveedor_ruc && fields.proveedor_ruc !== '-'
    ? `${fields.proveedor} · RUC ${fields.proveedor_ruc}`
    : fields.proveedor, 18);
  simpleRow('BIEN / ITEM RECEPCIONADO', fields.bien_item, 22);

  // monto / guia row
  const rH = 18;
  const c1 = contentW * 0.28;
  const c2 = contentW * 0.22;
  const c3 = contentW * 0.28;
  b.rect(margin, y, contentW, rH);
  b.line(margin + c1, y, margin + c1, y + rH);
  b.line(margin + c1 + c2, y, margin + c1 + c2, y + rH);
  b.line(margin + c1 + c2 + c3, y, margin + c1 + c2 + c3, y + rH);
  b.text('MONTO A LIQUIDAR S/', margin + c1 / 2, y + 12, { size: 7, bold: true, align: 'center' });
  b.text(fields.monto_liquidar, margin + c1 + c2 / 2, y + 12, { size: 8, bold: true, align: 'center' });
  b.text('N. COMPROBANTE DE PAGO', margin + c1 + c2 + c3 / 2, y + 12, { size: 7, bold: true, align: 'center' });
  b.text(fields.comprobante_pago, margin + c1 + c2 + c3 + 4, y + 12, { size: 8 });
  y += rH;

  b.rect(margin, y, contentW, rH);
  b.line(margin + c1, y, margin + c1, y + rH);
  b.line(margin + c1 + c2, y, margin + c1 + c2, y + rH);
  b.line(margin + c1 + c2 + c3, y, margin + c1 + c2 + c3, y + rH);
  b.text('N. DE GUIA DE REMISION', margin + c1 / 2, y + 12, { size: 7, bold: true, align: 'center' });
  b.text(fields.guias, margin + c1 + 3, y + 12, { size: 8, maxW: c2 - 4 });
  b.text('ENTREGA / ENTREGABLE', margin + c1 + c2 + c3 / 2, y + 12, { size: 7, bold: true, align: 'center' });
  b.text(fields.entrega, margin + c1 + c2 + c3 + (contentW - c1 - c2 - c3) / 2, y + 12, { size: 9, bold: true, align: 'center' });
  y += rH;
  simpleRow('N. DE FOLIOS', fields.folios, 14);

  const dateRow = (lab, val) => {
    const labW = contentW * 0.55;
    const h = 15;
    b.rect(margin, y, contentW, h);
    b.line(margin + labW, y, margin + labW, y + h);
    b.text(lab, margin + labW / 2, y + 11, { size: 7, bold: true, align: 'center', maxW: labW - 6 });
    b.text(val, margin + labW + (contentW - labW) / 2, y + 11, { size: 8, align: 'center' });
    y += h;
  };
  dateRow('Fecha de Inicio de Plazo', fields.fecha_inicio);
  dateRow('Fecha Limite de Entrega / Fecha Maxima', fields.fecha_maxima);
  dateRow('Fecha de Recepcion', fields.fecha_recepcion);
  dateRow('CONDICION DE INICIO DEL PLAZO', fields.condicion_inicio);

  const penH = 40;
  const labW = contentW * 0.45;
  b.rect(margin, y, contentW, penH);
  b.line(margin + labW, y, margin + labW, y + penH);
  b.text('CORRESPONDE APLICACION DE PENALIDAD?', margin + labW / 2, y + 12, {
    size: 7, bold: true, align: 'center', maxW: labW - 8,
  });
  b.text(fields.penalidad, margin + labW / 2, y + 28, { size: 12, bold: true, align: 'center' });
  b.text(fields.glosa_penalidad, margin + labW + 4, y + 12, { size: 6.5, maxW: contentW - labW - 10 });
  y += penH + 14;

  b.text(`Fecha: ${fields.fecha_emision_acta}`, b.pageW - margin, y, { size: 9, align: 'right' });
  y += 36;

  const colW = contentW / 2;
  const firma = (x, f) => {
    b.line(x + 20, y, x + colW - 20, y);
    b.text(f.nombres, x + colW / 2, y + 12, { size: 8, bold: true, align: 'center', maxW: colW - 20 });
    b.text(f.cargo, x + colW / 2, y + 22, { size: 7, align: 'center', maxW: colW - 20 });
    b.text(f.unidad, x + colW / 2, y + 32, { size: 7, align: 'center', maxW: colW - 20 });
    b.text('(Firma y sello)', x + colW / 2, y + 42, { size: 7, align: 'center' });
  };
  firma(margin, fields.firma_almacen);
  firma(margin + colW, fields.firma_au);

  return b.buildStream();
}

export function assemblePdf(stream) {
  const streamLen = Buffer.byteLength(stream, 'latin1');
  const objects = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] '
    + '/Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>endobj\n',
  );
  objects.push(`4 0 obj<< /Length ${streamLen} >>stream\n${stream}\nendstream\nendobj\n`);
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');
  objects.push('6 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return pdf;
}

/**
 * @returns {{ nombre: string, mime_type: string, base64: string, data: object, html: string, version: number }}
 */
export function generateActaRecepcionPdfServer(detalle = {}, opts = {}) {
  const logoDataUrl = loadActaLogoDataUrl(opts);
  const data = buildActaRecepcionData(detalle, { ...opts, logoDataUrl });
  const fields = resolveActaTemplateFields(data, { ...opts, logoDataUrl });
  const html = buildActaRecepcionHtml(data, { ...opts, logoDataUrl });
  const stream = buildInstitucionalStream(fields);
  const pdf = assemblePdf(stream);

  return {
    nombre: `${data.numero_acta}.pdf`,
    mime_type: 'application/pdf',
    base64: Buffer.from(pdf, 'latin1').toString('base64'),
    data,
    fields,
    html,
    version: data.version,
  };
}

export { buildActaRecepcionHtml, resolveActaTemplateFields };

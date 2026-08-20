/**
 * Generador server-side del Acta institucional (PDF 1.4).
 * Misma ficha que shared/actaRecepcionBienesTemplate.js / FE jsPDF.
 * Tecnología: PDF operadores (tablas/bordes) — sin secciones I–VI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
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

  measureText(str, { size = 9, maxW = null } = {}) {
    if (!maxW) return size + 2;
    const approx = Math.max(8, Math.floor(maxW / (size * 0.5)));
    const words = String(str ?? '').split(/\s+/);
    let lines = 0;
    let cur = '';
    words.forEach((w) => {
      const next = cur ? `${cur} ${w}` : w;
      if (latin1(next).length > approx && cur) {
        lines += 1;
        cur = w;
      } else cur = next;
    });
    if (cur) lines += 1;
    return Math.max(1, lines) * (size + 2);
  }

  image(name, x, yTop, w, h) {
    const y = this.pageH - yTop - h;
    this.push('q', `${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`, `/${name} Do`, 'Q');
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

export function assemblePdf(stream, { images = [] } = {}) {
  const streamLen = Buffer.byteLength(stream, 'latin1');
  let n = 1;
  const catalog = n++;
  const pages = n++;
  const page = n++;
  const contents = n++;
  const font1 = n++;
  const font2 = n++;
  const imageSlots = images.map((img) => ({ num: n++, img }));

  const xobjDict = imageSlots.length
    ? `/XObject << ${imageSlots.map((slot, idx) => `/Im${idx + 1} ${slot.num} 0 R`).join(' ')} >>`
    : '';

  const chunks = [];
  chunks.push(`${catalog} 0 obj<< /Type /Catalog /Pages ${pages} 0 R >>endobj\n`);
  chunks.push(`${pages} 0 obj<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>endobj\n`);
  chunks.push(`${page} 0 obj<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 595.28 841.89] `
    + `/Contents ${contents} 0 R /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> ${xobjDict} >> >>endobj\n`);
  chunks.push(`${contents} 0 obj<< /Length ${streamLen} >>stream\n${stream}\nendstream\nendobj\n`);
  chunks.push(`${font1} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n`);
  chunks.push(`${font2} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj\n`);

  imageSlots.forEach(({ num, img }) => {
    if (img.jpeg) {
      chunks.push(`${num} 0 obj<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} `
        + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>stream\n`);
      chunks.push(img.jpeg.toString('binary'));
      chunks.push('\nendstream\nendobj\n');
    } else if (img.rgb) {
      const deflated = zlib.deflateSync(img.rgb);
      chunks.push(`${num} 0 obj<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} `
        + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${deflated.length} >>stream\n`);
      chunks.push(deflated.toString('binary'));
      chunks.push('\nendstream\nendobj\n');
    }
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const chunk of chunks) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += chunk;
  }
  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  const total = offsets.length;
  pdf += `xref\n0 ${total}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < total; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${total} /Root ${catalog} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return pdf;
}

function jpegDimensions(buffer) {
  let i = 2;
  while (i + 9 < buffer.length) {
    if (buffer[i] !== 0xff) break;
    const marker = buffer[i + 1];
    if (marker === 0xc0 || marker === 0xc2 || marker === 0xc1) {
      return {
        height: buffer.readUInt16BE(i + 5),
        width: buffer.readUInt16BE(i + 7),
      };
    }
    const len = buffer.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return { width: 89, height: 88 };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngToRgb(buffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(sig)) return null;
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idats = [];
  while (off + 8 <= buffer.length) {
    const len = buffer.readUInt32BE(off);
    const type = buffer.toString('ascii', off + 4, off + 8);
    const data = buffer.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!width || !height || !bpp) return null;
  const inflated = zlib.inflateSync(Buffer.concat(idats));
  const rgb = Buffer.alloc(width * height * 3);
  let prev = Buffer.alloc(width * bpp);
  let inIdx = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inIdx++];
    const row = Buffer.from(inflated.subarray(inIdx, inIdx + width * bpp));
    inIdx += width * bpp;
    if (filter === 1) {
      for (let i = bpp; i < row.length; i += 1) row[i] = (row[i] + row[i - bpp]) & 0xff;
    } else if (filter === 2) {
      for (let i = 0; i < row.length; i += 1) row[i] = (row[i] + prev[i]) & 0xff;
    } else if (filter === 3) {
      for (let i = 0; i < row.length; i += 1) {
        const left = i >= bpp ? row[i - bpp] : 0;
        row[i] = (row[i] + Math.floor((prev[i] + left) / 2)) & 0xff;
      }
    } else if (filter === 4) {
      for (let i = 0; i < row.length; i += 1) {
        const left = i >= bpp ? row[i - bpp] : 0;
        const up = prev[i];
        const upLeft = i >= bpp ? prev[i - bpp] : 0;
        row[i] = (row[i] + paeth(left, up, upLeft)) & 0xff;
      }
    }
    for (let x = 0; x < width; x += 1) {
      const src = x * bpp;
      const dst = (y * width + x) * 3;
      rgb[dst] = row[src];
      rgb[dst + 1] = row[src + 1];
      rgb[dst + 2] = row[src + 2];
    }
    prev = row;
  }
  return { width, height, rgb };
}

/** Decodifica data URL institucional a objeto utilizable por assemblePdf. */
export function decodeActaLogoImage(logoDataUrl = '') {
  const raw = String(logoDataUrl || '').trim();
  if (!raw) return null;
  const m = raw.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i);
  if (!m) return null;
  const buffer = Buffer.from(m[2], 'base64');
  if (/jpeg|jpg/i.test(m[1])) {
    const dims = jpegDimensions(buffer);
    return { width: dims.width, height: dims.height, jpeg: buffer };
  }
  const png = decodePngToRgb(buffer);
  if (!png) return null;
  return png;
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

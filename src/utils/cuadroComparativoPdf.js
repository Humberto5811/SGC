/**
 * RC8.4 / RC8.3.2-C — Generación Anexo N.° 08-A institucional (jsPDF + autoTable).
 * Una sola tabla: Cotización 1..N | Segunda fuente | Valor adjudicado
 * + información adicional y acciones administrativas como continuación vertical
 * (sin celdas bajo Valor adjudicado).
 */
import {
  ANEXO_8A,
  ANEXO_8B,
  buildCuadroComparativoReportData,
  validateCuadroParaAnexo8A,
} from './cuadroComparativoReportData.js';

function ensureJsPdf() {
  if (!window.jspdf?.jsPDF) throw new Error('Biblioteca PDF no disponible. Recargue la página.');
  return window.jspdf.jsPDF;
}

const COLOR_HEAD = [10, 66, 117];
const COLOR_BASE = [207, 232, 245];
const COLOR_COT = [212, 237, 218];
const COLOR_SF = [255, 243, 205];
const COLOR_ADJ = [255, 236, 179];
const COLOR_SECTION = [238, 243, 247];

function drawHeader(doc, report, pageW, margin) {
  let y = 28;
  const logo = report.entidad?.logo_data_url;
  if (logo && /^data:image\//i.test(logo)) {
    try {
      const fmt = /png/i.test(logo) ? 'PNG' : 'JPEG';
      doc.addImage(logo, fmt, margin, 16, 46, 46);
    } catch (_) { /* logo opcional */ }
  }
  const textX = logo ? margin + 54 : margin;
  doc.setFontSize(9);
  doc.setTextColor(...COLOR_HEAD);
  doc.setFont(undefined, 'bold');
  doc.text(report.entidad?.nombre || '—', textX, y);
  doc.setFontSize(11);
  doc.text(report.anexo.titulo, textX, y + 13);
  doc.setFontSize(9);
  doc.text(report.anexo.subtitulo, textX, y + 25);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(40);
  y = 72;
  const c = report.cabecera;
  // Cabecera institucional sin Requerimientos / Área usuaria / CMN / Fuente de financiamiento
  const lines = [
    `Denominación: ${c.denominacion}`,
    `Solicitud de Cotización: ${c.solicitud_codigo}`,
    `Fecha: ${c.fecha}    Tipo: ${c.tipo}`,
  ];
  lines.forEach((ln) => {
    const wrapped = doc.splitTextToSize(ln, pageW - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 9 + 1;
  });
  return y + 4;
}

function textoCabeceraCotizacionPdf(f) {
  const nombre = f.razon_social || '—';
  const ruc = f.ruc || '—';
  const contacto = f.contacto || '—';
  const telefono = f.telefono || '—';
  const correo = f.correo || '—';
  return [
    f.label || `Cotización ${f.nro || ''}`,
    `Proveedor: ${nombre}`,
    `RUC: ${ruc}`,
    `Contacto: ${contacto}`,
    `Teléfono: ${telefono}`,
    `Correo: ${correo}`,
  ].join('\n');
}

function parseMontoAdjudicado(raw) {
  const s = String(raw ?? '').replace(/[^\d,.-]/g, '').replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function resolveMonedaReport(report = {}) {
  const m = String(
    report.resultado?.moneda
    || report.cabecera?.moneda
    || report.meta?.moneda
    || 'PEN',
  ).toUpperCase();
  if (m === 'USD' || m === 'US$') return { code: 'USD', symbol: 'US$' };
  return { code: 'PEN', symbol: 'S/' };
}

/**
 * Suma valores adjudicados de ítems (no filas informativas).
 * @returns {{ total: number, label: string, moneda: string, symbol: string }}
 */
export function calcTotalGeneralAdjudicado(report = {}) {
  const { symbol, code } = resolveMonedaReport(report);
  let total = Number(report.resultado?.valor_adjudicado_num);
  if (!Number.isFinite(total) || total < 0) {
    total = (report.filas || []).reduce((acc, f) => (
      acc + parseMontoAdjudicado(f.adjudicado?.valor_total || f.valor_adjudicado_item)
    ), 0);
  }
  const label = `${symbol} ${total.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  return { total, label, moneda: code, symbol };
}

/**
 * Construye cabeceras + cuerpo de la matriz institucional (única tabla).
 */
export function buildMatrizInstitucionalTable(report) {
  const primera = report.fuentes?.primera || report.proveedores || [];
  const segunda = report.fuentes?.segunda || [];
  const spanCot = 2;
  const spanSf = 5;
  const spanAdj = 3;
  const baseHeads = ['Ítem N.°', 'N.° REQ', 'Cód. SIGAMEF', 'Descripción', 'UM', 'Cant.'];
  const nBase = baseHeads.length;

  const headTop = [
    {
      content: 'DATOS DEL ÍTEM',
      colSpan: nBase,
      styles: { fillColor: COLOR_BASE, textColor: COLOR_HEAD, halign: 'center', fontStyle: 'bold', fontSize: 6.5 },
    },
    ...primera.map((f) => ({
      content: textoCabeceraCotizacionPdf(f),
      colSpan: spanCot,
      styles: {
        fillColor: COLOR_COT,
        textColor: [21, 87, 36],
        halign: 'left',
        valign: 'top',
        fontStyle: 'bold',
        fontSize: 5,
      },
    })),
    ...segunda.map(() => ({
      content: 'Segunda fuente\nValor histórico / páginas web',
      colSpan: spanSf,
      styles: { fillColor: COLOR_SF, textColor: COLOR_HEAD, halign: 'center', fontStyle: 'bold', fontSize: 5.5 },
    })),
    {
      content: 'VALOR ADJUDICADO',
      colSpan: spanAdj,
      styles: { fillColor: COLOR_ADJ, textColor: COLOR_HEAD, halign: 'center', fontStyle: 'bold', fontSize: 6.5 },
    },
  ];

  const headCols = [
    ...baseHeads,
    ...primera.flatMap(() => ['P. unit.', 'P. total']),
    ...segunda.flatMap((f) => [f.referencia_label || 'Referencia', 'P. unit.', 'Factor', 'P. act.', 'P. total']),
    'Proveedor adjudicado',
    'Valor Unitario',
    'Valor Total',
  ];

  const priceBody = (report.filas || []).map((f) => {
    const base = [
      String(f.item),
      f.requerimiento_codigo,
      f.codigo_sigamef,
      f.descripcion,
      f.unidad_medida,
      f.cantidad,
    ];
    const cot = (f.cotizaciones || []).flatMap((c) => [c.precio_unitario, c.precio_total]);
    const sf = (f.segundas || []).flatMap((s) => [
      s.referencia, s.precio_unitario, s.factor, s.precio_actualizado, s.precio_total,
    ]);
    const adj = [
      f.adjudicado?.proveedor_label || f.proveedor_adjudicado || '—',
      f.adjudicado?.valor_unitario || f.valor_adjudicado_unitario || '—',
      f.adjudicado?.valor_total || f.valor_adjudicado_item || '—',
    ];
    return [...base, ...cot, ...sf, ...adj];
  });

  const totalCols = nBase + primera.length * spanCot + segunda.length * spanSf + spanAdj;
  // Sin celdas vacías bajo VALOR ADJUDICADO: secciones ocupan el ancho completo.
  const sectionRow = (title) => [
    {
      content: title,
      colSpan: totalCols,
      styles: { fillColor: COLOR_SECTION, fontStyle: 'bold', fontSize: 6.5, textColor: COLOR_HEAD },
    },
  ];

  const infoBody = (report.info_adicional || []).map((row) => {
    const cotCells = (row.cotizaciones || []).map((v) => ({
      content: String(v ?? '—'),
      colSpan: spanCot,
      styles: { halign: 'center', fontSize: 5.5 },
    }));
    const sfCells = (row.segundas || []).map((v, idx, arr) => ({
      content: String(v ?? 'NO APLICA'),
      colSpan: idx === arr.length - 1 ? spanSf + spanAdj : spanSf,
      styles: { halign: 'center', fontSize: 5.5, fillColor: [255, 252, 240] },
    }));
    if (!sfCells.length && spanAdj) {
      cotCells[cotCells.length - 1] = {
        ...(cotCells[cotCells.length - 1] || { content: '—', styles: { halign: 'center', fontSize: 5.5 } }),
        colSpan: ((cotCells[cotCells.length - 1]?.colSpan) || spanCot) + spanAdj,
      };
    }
    return [
      {
        content: row.label,
        colSpan: nBase,
        styles: { fillColor: [248, 249, 250], fontSize: 6 },
      },
      ...cotCells,
      ...sfCells,
    ];
  });

  const aaBody = (report.acciones_administrativas || []).map((row) => {
    const cotCells = (row.cotizaciones || []).map((v) => ({
      content: String(v ?? '—'),
      colSpan: spanCot,
      styles: { halign: 'center', fontSize: 5.5 },
    }));
    const sfCells = (row.segundas || []).map((v, idx, arr) => ({
      content: String(v ?? '—'),
      colSpan: idx === arr.length - 1 ? spanSf + spanAdj : spanSf,
      styles: { halign: 'center', fontSize: 5.5, fillColor: [255, 252, 240] },
    }));
    if (!sfCells.length && spanAdj && cotCells.length) {
      cotCells[cotCells.length - 1] = {
        ...cotCells[cotCells.length - 1],
        colSpan: (cotCells[cotCells.length - 1].colSpan || spanCot) + spanAdj,
      };
    }
    return [
      {
        content: row.label,
        colSpan: nBase,
        styles: { fillColor: [248, 249, 250], fontSize: 6 },
      },
      ...cotCells,
      ...sfCells,
    ];
  });

  // OD34 — TOTAL GENERAL (solo ítems adjudicados; sin filas informativas).
  const { total: totalGeneral, label: totalLabel } = calcTotalGeneralAdjudicado(report);
  const preAdjCols = nBase + primera.length * spanCot + segunda.length * spanSf;
  const totalRow = (report.filas || []).length
    ? [[
      {
        content: 'TOTAL GENERAL',
        colSpan: preAdjCols + 2,
        styles: { fontStyle: 'bold', fontSize: 7, fillColor: COLOR_ADJ, textColor: COLOR_HEAD, halign: 'right' },
      },
      {
        content: totalLabel,
        colSpan: 1,
        styles: { fontStyle: 'bold', fontSize: 7, fillColor: COLOR_ADJ, textColor: COLOR_HEAD, halign: 'right' },
      },
    ]]
    : [];

  const body = [
    ...priceBody,
    ...totalRow,
    sectionRow('Información adicional'),
    ...infoBody,
    sectionRow('Acciones administrativas'),
    ...aaBody,
  ];

  return {
    head: [headTop, headCols],
    body,
    colCount: totalCols,
  };
}

function drawResultadoYFirmas(doc, report, startY, pageW, pageH, margin) {
  let y = startY;
  if (y > pageH - 130) {
    doc.addPage();
    y = 48;
  }
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...COLOR_HEAD);
  doc.text('Resultado de la adjudicación', margin, y);
  y += 12;
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(40);
  const r = report.resultado || {};
  const resLines = [
    `Proveedor ganador: ${r.proveedor_adjudicado || '—'} — RUC ${r.ruc_adjudicado || '—'}`,
    `Valor adjudicado total: ${String(r.valor_adjudicado || '').startsWith('S/') ? r.valor_adjudicado : `S/ ${r.valor_adjudicado || '—'}`}`,
    `Metodología / criterio: ${r.metodologia || r.criterio || '—'}`,
    `Sustento: ${r.sustento || '—'}`,
  ];
  resLines.forEach((ln) => {
    const w = doc.splitTextToSize(ln, pageW - margin * 2);
    doc.text(w, margin, y);
    y += w.length * 10 + 2;
  });

  const resumen = Array.isArray(r.resumen_centro_clasificador) ? r.resumen_centro_clasificador : [];
  if (resumen.length) {
    y += 8;
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...COLOR_HEAD);
    doc.text('Resumen por Centro / Clasificador', margin, y);
    y += 11;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(40);
    doc.text('Centro', margin, y);
    doc.text('Clasificador de gasto', margin + 160, y);
    doc.text('Valor adjudicado', pageW - margin - 90, y, { align: 'left' });
    y += 4;
    doc.setDrawColor(180);
    doc.line(margin, y, pageW - margin, y);
    y += 10;
    resumen.forEach((row) => {
      if (y > pageH - 100) {
        doc.addPage();
        y = 48;
      }
      const centro = String(row.centro || '—');
      const clasif = String(row.clasificador || '—');
      const valor = String(row.valor || '—');
      doc.text(doc.splitTextToSize(centro, 150), margin, y);
      doc.text(doc.splitTextToSize(clasif, 200), margin + 160, y);
      doc.text(valor, pageW - margin, y, { align: 'right' });
      y += 12;
    });
  }

  y += 16;
  if (y > pageH - 90) {
    doc.addPage();
    y = 48;
  }
  const colW = (pageW - margin * 2) / 3;
  const firmas = [
    report.firmas.elaborado_por,
    report.firmas.revisado_por,
    report.firmas.aprobado_por,
  ];
  firmas.forEach((f, i) => {
    const x = margin + i * colW;
    doc.setDrawColor(120);
    doc.line(x + 10, y + 36, x + colW - 20, y + 36);
    doc.setFontSize(7);
    doc.setTextColor(60);
    doc.setFont(undefined, 'normal');
    doc.text(f.nombre || ' ', x + 10, y + 32);
    doc.setFont(undefined, 'bold');
    doc.text(f.cargo, x + 10, y + 48);
    doc.setFont(undefined, 'normal');
    doc.text(i === 0 ? 'Elaborado por' : i === 1 ? 'Revisado por' : 'Aprobado por', x + 10, y + 58);
  });
}

/**
 * Genera jsPDF del Anexo 08-A / 08-B a partir de datos persistidos (+ entidad/logo).
 * @returns {{ doc, report, blob, base64, filename }}
 */
export function generateAnexo8APdf(persistido = {}) {
  const report = buildCuadroComparativoReportData(persistido);
  if (!report.meta.validation.ok) {
    const codigo = report.anexo?.codigo || '08';
    const err = new Error(`No se puede generar el Anexo ${codigo}: ${report.meta.validation.faltantes.join('; ')}`);
    err.code = 'ANEXO8A_INCOMPLETO';
    err.faltantes = report.meta.validation.faltantes;
    throw err;
  }

  const jsPDF = ensureJsPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 22;

  let y = drawHeader(doc, report, pageW, margin);
  const { head, body } = buildMatrizInstitucionalTable(report);
  const usable = pageW - margin * 2;

  doc.autoTable({
    head,
    body,
    startY: y,
    styles: { fontSize: 5.5, cellPadding: 1.5, overflow: 'linebreak', valign: 'middle', lineColor: [160, 160, 160], lineWidth: 0.3 },
    headStyles: { fontSize: 5, halign: 'center', valign: 'middle', minCellHeight: 48, fillColor: COLOR_BASE, textColor: COLOR_HEAD },
    columnStyles: {},
    margin: { left: margin, right: margin },
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    tableWidth: usable,
    didParseCell(data) {
      // Aislar visualmente VALOR ADJUDICADO en filas de precio
      if (data.section === 'body' && data.row.index < (report.filas || []).length) {
        const nBase = 6;
        const nCot = (report.fuentes?.primera || []).length * 2;
        const nSf = (report.fuentes?.segunda || []).length * 5;
        const adjStart = nBase + nCot + nSf;
        if (data.column.index >= adjStart) {
          data.cell.styles.fillColor = [255, 252, 235];
        }
      }
    },
    didDrawPage(data) {
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text(
        `${report.anexo?.titulo || ANEXO_8A.titulo} · ${report.cabecera.solicitud_codigo} · pág. ${data.pageNumber}`,
        margin,
        pageH - 14,
      );
    },
  });

  const finalY = (doc.lastAutoTable?.finalY || 120) + 14;
  drawResultadoYFirmas(doc, report, finalY, pageW, pageH, margin);

  const prefix = report.anexo?.filenamePrefix || ANEXO_8A.filenamePrefix;
  const filename = `${prefix}_${String(report.cabecera.solicitud_codigo).replace(/\s+/g, '_')}_v${report.meta.version || 1}.pdf`;
  const blob = doc.output('blob');
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;

  return { doc, report, blob, base64, filename, mime_type: 'application/pdf' };
}

export function previewAnexo8APdf(persistido) {
  const { blob } = generateAnexo8APdf(persistido);
  if (!(blob instanceof Blob) || !blob.size) {
    throw new Error('No se pudo generar el PDF (contenido vacío)');
  }
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return url;
}

/**
 * Generador: crea PDF nuevo desde matriz (solo pre-firma / versión no firmada).
 * No usar para documentos firmados persistidos.
 */
export function downloadAnexo8APdf(persistido) {
  const { doc, filename } = generateAnexo8APdf(persistido);
  doc.save(filename);
  return filename;
}

/**
 * OD34 — descarga blob de PDF firmado persistido (nunca regenera).
 */
export function assertBlobForObjectUrl(blob, label = 'Documento') {
  if (!(blob instanceof Blob) || !blob.size) {
    throw new Error(`${label} sin contenido o no disponible`);
  }
  return blob.type === 'application/pdf' || !blob.type
    ? (blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }))
    : blob;
}

export function downloadBlobPersistido(blob, filename, { inline = false } = {}) {
  const safe = assertBlobForObjectUrl(blob, filename || 'PDF firmado');
  const url = URL.createObjectURL(safe);
  try {
    if (inline) {
      window.open(url, '_blank', 'noopener');
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'documento_firmado.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
  return url;
}

export { validateCuadroParaAnexo8A, buildCuadroComparativoReportData, ANEXO_8A, ANEXO_8B };

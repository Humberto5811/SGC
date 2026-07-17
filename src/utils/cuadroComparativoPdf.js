/**
 * RC8.4 — Generación / previsualización / descarga Anexo N.° 8A (jsPDF + autoTable).
 */
import {
  ANEXO_8A,
  buildCuadroComparativoReportData,
  validateCuadroParaAnexo8A,
} from './cuadroComparativoReportData.js';

function ensureJsPdf() {
  if (!window.jspdf?.jsPDF) throw new Error('Biblioteca PDF no disponible. Recargue la página.');
  return window.jspdf.jsPDF;
}

const COLOR_HEAD = [10, 66, 117];
const COLOR_BASE = [207, 232, 245];
const COLOR_PROV = [232, 245, 233];
const COLOR_WIN = [255, 243, 205];

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out.length ? out : [[]];
}

function drawHeader(doc, report, pageW, margin) {
  let y = 28;
  const logo = report.entidad?.logo_data_url;
  if (logo && /^data:image\//i.test(logo)) {
    try {
      const fmt = /png/i.test(logo) ? 'PNG' : 'JPEG';
      doc.addImage(logo, fmt, margin, 18, 48, 48);
    } catch (_) { /* logo opcional */ }
  }
  const textX = logo ? margin + 56 : margin;
  doc.setFontSize(9);
  doc.setTextColor(...COLOR_HEAD);
  doc.setFont(undefined, 'bold');
  doc.text(report.entidad?.nombre || '—', textX, y);
  doc.setFontSize(11);
  doc.text(report.anexo.titulo, textX, y + 14);
  doc.setFontSize(9);
  doc.text(report.anexo.subtitulo, textX, y + 26);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(40);
  y = 78;
  const c = report.cabecera;
  const lines = [
    `Denominación: ${c.denominacion}`,
    `Solicitud de Cotización: ${c.solicitud_codigo}    Requerimientos: ${c.requerimientos}`,
    `Área usuaria: ${c.area_usuaria}    CMN: ${c.cmn}    Fuente de financiamiento: ${c.fuente_financiamiento}`,
    `Fecha: ${c.fecha}    Tipo: ${c.tipo}`,
  ];
  lines.forEach((ln) => {
    const wrapped = doc.splitTextToSize(ln, pageW - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 10 + 2;
  });
  return y + 4;
}

function buildTableForProveedorBlock(report, provBlock, blockIndex, totalBlocks) {
  const baseHeads = ['Ítem', 'N.° REQ', 'Pedido SIGAMEF', 'Cód. SIGAMEF', 'Descripción', 'UM', 'Cant.'];
  const provSub = ['Razón social / RUC', 'P. unit.', 'P. total', 'Técnico', 'Marca/Modelo', 'Proced./Garantía/Plazo', 'Obs.'];
  const headTop = [
    { content: 'DATOS DEL ÍTEM', colSpan: baseHeads.length, styles: { fillColor: COLOR_BASE, textColor: COLOR_HEAD, halign: 'center', fontStyle: 'bold', fontSize: 7 } },
    ...provBlock.map((p, i) => ({
      content: `PROVEEDOR ${blockIndex * provBlock.length + i + 1}: ${p.razon_social}`,
      colSpan: provSub.length,
      styles: { fillColor: COLOR_PROV, textColor: [21, 87, 36], halign: 'center', fontStyle: 'bold', fontSize: 6.5 },
    })),
    { content: 'RESULTADO ÍTEM', colSpan: 2, styles: { fillColor: COLOR_WIN, textColor: COLOR_HEAD, halign: 'center', fontStyle: 'bold', fontSize: 7 } },
  ];
  const headCols = [
    ...baseHeads,
    ...provBlock.flatMap(() => provSub),
    'Adjudicado',
    'Valor',
  ];

  const body = report.filas.map((f) => {
    const base = [
      String(f.item),
      f.requerimiento_codigo,
      f.pedido_sigamef,
      f.codigo_sigamef,
      f.descripcion,
      f.unidad_medida,
      f.cantidad,
    ];
    const ofs = provBlock.map((p) => {
      const of = f.ofertas.find((o) => Number(o.proveedor_id) === Number(p.proveedor_id)) || {};
      return [
        `${of.razon_social || '—'}\n${of.ruc || ''}${of.adjudicado ? '\n[ADJUDICADO]' : ''}`,
        of.precio_unitario || '—',
        of.precio_total || '—',
        of.cumplimiento_tecnico || '—',
        `${of.marca || '—'}\n${of.modelo || '—'}`,
        `${of.procedencia || '—'}\n${of.garantia || '—'}\n${of.plazo_entrega || '—'}`,
        of.observaciones || '—',
      ];
    }).flat();
    return [...base, ...ofs, f.proveedor_adjudicado, f.valor_adjudicado_item];
  });

  const note = totalBlocks > 1
    ? `Bloque de proveedores ${blockIndex + 1} de ${totalBlocks}`
    : '';
  return { head: [headTop, headCols], body, note };
}

function drawFirmas(doc, report, startY, pageW, pageH, margin) {
  let y = startY;
  if (y > pageH - 110) {
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
  const r = report.resultado;
  const resLines = [
    `Proveedor adjudicado (principal): ${r.proveedor_adjudicado} — RUC ${r.ruc_adjudicado}`,
    `Valor adjudicado total: S/ ${r.valor_adjudicado}`,
    `Criterio: ${r.criterio}`,
    `Sustento: ${r.sustento}`,
    `Modalidad: ${r.modalidad}`,
  ];
  resLines.forEach((ln) => {
    const w = doc.splitTextToSize(ln, pageW - margin * 2);
    doc.text(w, margin, y);
    y += w.length * 10 + 2;
  });
  if (r.resumen_por_proveedor?.length) {
    y += 4;
    doc.setFont(undefined, 'bold');
    doc.text('Resumen por proveedor:', margin, y);
    y += 11;
    doc.setFont(undefined, 'normal');
    r.resumen_por_proveedor.forEach((p) => {
      doc.text(`• ${p.razon_social} (${p.ruc}): ${p.items} ítem(s) — S/ ${p.valor}`, margin + 6, y);
      y += 10;
    });
  }

  y += 18;
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
    doc.text(f.nombre || ' ', x + 10, y + 32);
    doc.setFont(undefined, 'bold');
    doc.text(f.cargo, x + 10, y + 48);
    doc.setFont(undefined, 'normal');
    doc.text(i === 0 ? 'Elaborado por' : i === 1 ? 'Revisado por' : 'Aprobado por', x + 10, y + 58);
  });
}

/**
 * Genera jsPDF del Anexo 8A a partir de datos persistidos (+ entidad/logo).
 * @returns {{ doc, report, blob, base64, filename }}
 */
export function generateAnexo8APdf(persistido = {}) {
  const report = buildCuadroComparativoReportData(persistido);
  if (!report.meta.validation.ok) {
    const err = new Error(`No se puede generar el Anexo 8A: ${report.meta.validation.faltantes.join('; ')}`);
    err.code = 'ANEXO8A_INCOMPLETO';
    err.faltantes = report.meta.validation.faltantes;
    throw err;
  }

  const jsPDF = ensureJsPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 28;
  const bloqueSize = report.meta.proveedores_por_bloque || 3;
  const bloques = chunk(report.proveedores, bloqueSize);

  bloques.forEach((provBlock, bIdx) => {
    if (bIdx > 0) doc.addPage();
    let y = drawHeader(doc, report, pageW, margin);
    if (bloques.length > 1) {
      doc.setFontSize(8);
      doc.setTextColor(80);
      doc.text(`Continuación de proveedores (${bIdx + 1}/${bloques.length}) — cabeceras repetidas`, margin, y);
      y += 12;
    }
    const { head, body, note } = buildTableForProveedorBlock(report, provBlock, bIdx, bloques.length);
    if (note) {
      doc.setFontSize(7);
      doc.text(note, margin, y);
      y += 10;
    }
    const usable = pageW - margin * 2;
    doc.autoTable({
      head,
      body,
      startY: y,
      styles: { fontSize: 6, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
      headStyles: { fontSize: 5.5, halign: 'center', valign: 'middle', minCellHeight: 28 },
      margin: { left: margin, right: margin },
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
      tableWidth: usable,
      didDrawPage(data) {
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(
          `${ANEXO_8A.titulo} · ${report.cabecera.solicitud_codigo} · pág. ${data.pageNumber}`,
          margin,
          pageH - 14,
        );
      },
    });
  });

  const finalY = (doc.lastAutoTable?.finalY || 120) + 16;
  drawFirmas(doc, report, finalY, pageW, pageH, margin);

  const filename = `${ANEXO_8A.filenamePrefix}_${String(report.cabecera.solicitud_codigo).replace(/\s+/g, '_')}_v${report.meta.version || 1}.pdf`;
  const blob = doc.output('blob');
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;

  return { doc, report, blob, base64, filename, mime_type: 'application/pdf' };
}

export function previewAnexo8APdf(persistido) {
  const { blob } = generateAnexo8APdf(persistido);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return url;
}

export function downloadAnexo8APdf(persistido) {
  const { doc, filename } = generateAnexo8APdf(persistido);
  doc.save(filename);
  return filename;
}

export { validateCuadroParaAnexo8A, buildCuadroComparativoReportData, ANEXO_8A };

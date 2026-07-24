/** Generación PDF — Anexos de cotización (portal proveedores) */
import {
  GLOSA_SERVICIOS_06B_TODO_COSTO, GLOSA_SERVICIOS_06B_CONFIRMACION,
  TEXTO_CONFIRMACION_TR_06A, TEXTO_AUTORIZACION_CORREO_06,
  IMPORTANTE_ANEXO11, CONFIRMACION_ANEXO11, GLOSA_LOCADORES_FORMA_PAGO,
  DECLARO_CONOCER_ANEXO11, GLOSA_PENALIDAD_ANEXO11, FORMULA_PENALIDAD_ANEXO11,
  FORMULA_F_ANEXO11, CIERRE_PENALIDAD_ANEXO11, NOTA_COTIZACION_ANEXO11,
  PLAZOS_ENTREGABLES_LABELS, MAX_ENTREGABLES_LOCADOR, cantidadPorTipo,
} from './proveedorCotizacionConfig.js';
import {
  ANEXO_05A_HEADER,
  ANEXO_05A_COLORS,
  getAnexo05APdfColumns,
  resolveAnexo05ACellValue,
} from './proveedorAnexo05AConfig.js';

const MARGIN = 54;
const PAGE_W = 612;
const CONTENT_W = PAGE_W - MARGIN * 2;
/** Espacio vertical ≈ 4 líneas para firma manuscrita (05-B). */
const FIRMA_05B_SPACE_PT = 68;

export const TEXTO_AUTORIZACION_CORREO = 'Asimismo, AUTORIZO que el correo electrónico consignado en la presente Declaración Jurada sea utilizado como medio formal de comunicación con la Entidad para que me notifique las siguientes actuaciones: i) emisión de la Orden o Contrato, ii) ampliación de plazo, iii) otras modificaciones a la Orden o Contrato, iv) Observaciones al bien y Levantamiento de Observaciones al bien, v) apercibimiento para cumplimiento de obligaciones contractuales, vi) Resolución Parcial o Total del Contrato u Orden, vii) comunicación de penalidades y descargos respectivos; y viii) otras actuaciones durante la etapa de ejecución contractual.';

export const TEXTO_LEY_27444 = '1.-El numeral 42.1 del artículo 42.- Presunción de veracidad de la Ley Nº 27444 - Ley del Procedimiento Administrativo General, establece que todas las declaraciones juradas, los documentos sucedáneos presentados y la información incluida en los escritos y formularios que presenten los administrados para la realización de procedimientos administrativos, se presumen verificados por quien hace uso de ellos, así como de contenido veraz para fines del procedimiento administrativo. Esta presunción admite prueba en contrario.';

function ensureJsPdf() {
  if (!window.jspdf?.jsPDF) throw new Error('Biblioteca PDF no disponible. Recargue la página.');
  return window.jspdf.jsPDF;
}

export function money(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function appendWrappedText(doc, text, x, y, maxWidth, lineHeight = 11) {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function centerText(doc, text, y, fontSize = 11) {
  doc.setFontSize(fontSize);
  const tw = doc.getTextWidth(text);
  doc.text(text, (PAGE_W - tw) / 2, y);
}

function ensureSpace(doc, y, needed = 40) {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - MARGIN) {
    doc.addPage();
    return MARGIN + 20;
  }
  return y;
}

function renderTituloAnexo(doc, num, linea1, linea2, y0 = 36) {
  let y = y0;
  doc.setFont(undefined, 'bold');
  centerText(doc, `ANEXO Nº ${num}`, y, 12);
  y += 16;
  centerText(doc, linea1, y, 10);
  y += 13;
  if (linea2) {
    centerText(doc, linea2, y, 10);
    y += 13;
  }
  doc.setFont(undefined, 'normal');
  return y + 10;
}

function renderCartaServicios(doc, asuntoServicio, y) {
  y = ensureSpace(doc, y, 90);
  doc.setFontSize(10);
  doc.text('Lima,         de                     del  20__', MARGIN, y);
  y += 15;
  doc.text('Señores:', MARGIN, y);
  y += 13;
  doc.text('INSTITUTO NACIONAL DE SALUD – INS', MARGIN, y);
  y += 13;
  doc.text('Presente.-', MARGIN, y);
  y += 15;
  doc.setFont(undefined, 'bold');
  const asunto = `Asunto: Cotización para la contratación de Servicio de ${asuntoServicio || '_____________________'}`;
  y = appendWrappedText(doc, asunto, MARGIN, y, CONTENT_W, 12) + 4;
  doc.setFont(undefined, 'normal');
  y = appendWrappedText(
    doc,
    'Por medio de la presente hacemos llegar nuestra cotización de acuerdo a la información remitida según el siguiente detalle:',
    MARGIN, y, CONTENT_W, 11,
  ) + 8;
  return y;
}

function renderDatosProveedor06A(doc, datos, startY) {
  const d = datos || {};
  let y = ensureSpace(doc, startY, 120);
  doc.setFontSize(9);
  const rows = [
    ['Razón Social:', d.razon_social || ''],
    ['Nº R.U.C.:', d.ruc || ''],
    ['Domicilio fiscal:', d.domicilio_fiscal || ''],
    ['Datos del Representante Legal:', d.representante_legal || ''],
    ['Persona de Contacto:', d.persona_contacto || ''],
    ['Teléfono y/o Celular:', d.celular || ''],
    ['Correo Electrónico:', d.correo || ''],
  ];
  rows.forEach(([label, val]) => {
    y = ensureSpace(doc, y, 20);
    doc.setFont(undefined, 'bold');
    doc.text(label, MARGIN, y);
    doc.setFont(undefined, 'normal');
    const lines = doc.splitTextToSize(String(val), CONTENT_W - 150);
    doc.text(lines, MARGIN + 150, y);
    y += Math.max(13, lines.length * 11);
  });
  return y + 6;
}

function renderFirmaRepresentante(doc, y) {
  y = ensureSpace(doc, y, 50);
  doc.setFontSize(9);
  doc.text('___________________________', MARGIN, y);
  y += 14;
  doc.text('Firma del Representante Legal', MARGIN, y);
  return y + 10;
}

function appendDatosProveedorSinFirma(doc, datos, startY, opts = {}) {
  const d = datos || {};
  const marginX = opts.marginX ?? 40;
  const valueX = opts.valueX ?? 170;
  const maxValW = opts.maxValW ?? 360;
  let y = startY;
  doc.setFontSize(9);
  const rows = [
    ['Razón Social:', d.razon_social || ''],
    ['RUC:', d.ruc || ''],
    ['Domicilio fiscal:', d.domicilio_fiscal || ''],
    ['Datos Representante Legal:', d.representante_legal || ''],
    ['Persona de Contacto:', d.persona_contacto || ''],
    ['Celular:', d.celular || ''],
    ['Correo electrónico:', d.correo || ''],
    ['Validez de la oferta:', d.validez_oferta || ''],
  ];
  rows.forEach(([label, val]) => {
    y = ensureSpace(doc, y, 22);
    doc.setFont(undefined, 'bold');
    doc.text(label, marginX, y);
    doc.setFont(undefined, 'normal');
    const lines = doc.splitTextToSize(String(val), maxValW);
    doc.text(lines, valueX, y);
    y += Math.max(12, lines.length * 11);
  });
  return y + 8;
}

/** Bloque de firma manuscrita ≈ 4 líneas; no se parte entre páginas. */
function renderBloqueFirmaRepresentante05B(doc, startY, opts = {}) {
  const marginX = opts.marginX ?? 40;
  const lineW = opts.lineWidth ?? 240;
  const blockH = 18 + FIRMA_05B_SPACE_PT + 10;
  let y = ensureSpace(doc, startY, blockH);
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text('Firma del Representante Legal:', marginX, y);
  doc.setFont(undefined, 'normal');
  y += 14;
  const lineY = y + FIRMA_05B_SPACE_PT;
  doc.setDrawColor(80);
  doc.line(marginX, lineY, marginX + lineW, lineY);
  return lineY + 16;
}

/** Pie común 05-A / 05-B: datos proveedor + firma + textos legales. */
function appendPieAnexo05(doc, datos, startY, opts = {}) {
  const marginX = opts.marginX ?? 40;
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = opts.contentW ?? (pageW - marginX * 2);
  const valueX = opts.valueX ?? marginX + 150;
  const maxValW = Math.max(120, contentW - (valueX - marginX));

  let y = appendDatosProveedorSinFirma(doc, datos, startY, { marginX, valueX, maxValW });
  y = renderBloqueFirmaRepresentante05B(doc, y, { marginX, lineWidth: Math.min(280, contentW * 0.4) });
  doc.setFontSize(8);
  y = ensureSpace(doc, y, 60);
  y = appendWrappedText(doc, TEXTO_AUTORIZACION_CORREO, marginX, y, contentW);
  y += 6;
  y = ensureSpace(doc, y, 50);
  appendWrappedText(doc, TEXTO_LEY_27444, marginX, y, contentW);
  return y;
}

export function downloadAnexo05A({ solicitud, items, formItems, proveedor, datos }) {
  const jsPDF = ensureJsPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const codigo = solicitud?.codigo || 'SC';
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 28;
  const cols = getAnexo05APdfColumns();

  let y = 28;
  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.text(`${ANEXO_05A_HEADER.titulo} — ${ANEXO_05A_HEADER.subtitulo}`, marginX, y);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  y += 14;
  doc.text(`Solicitud: ${codigo}`, marginX, y);
  y += 11;
  const objeto = String(solicitud?.denominacion || solicitud?.objeto || '').trim();
  if (objeto) {
    y = appendWrappedText(doc, `Objeto: ${objeto}`, marginX, y, pageW - marginX * 2, 10);
  }
  const razon = datos?.razon_social || proveedor?.razon_social || '';
  const ruc = datos?.ruc || proveedor?.ruc || '';
  y += 2;
  doc.text(`Proveedor: ${razon}${ruc ? ` · RUC ${ruc}` : ''}`, marginX, y);
  y += 12;

  const head = [cols.map((c) => c.label)];
  const body = (items || []).map((it, idx) => {
    const f = formItems[idx] || {};
    return cols.map((col) => resolveAnexo05ACellValue(col, it, f, idx));
  });

  const columnStyles = {};
  cols.forEach((col, i) => {
    columnStyles[i] = {
      cellWidth: col.pdfWidth || 'auto',
      halign: col.align === 'center' ? 'center' : 'left',
      valign: 'top',
    };
  });

  doc.autoTable({
    startY: y,
    head,
    body,
    styles: {
      fontSize: 6.5,
      cellPadding: 2.5,
      overflow: 'linebreak',
      valign: 'top',
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
    },
    headStyles: {
      fontSize: 6.5,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      cellPadding: 2.5,
    },
    columnStyles,
    margin: { left: marginX, right: marginX },
    showHead: 'everyPage',
    didParseCell(data) {
      if (data.section !== 'head') return;
      const col = cols[data.column.index];
      if (!col) return;
      if (col.headerColorType === 'provider') {
        data.cell.styles.fillColor = ANEXO_05A_COLORS.provider;
        data.cell.styles.textColor = ANEXO_05A_COLORS.providerText;
      } else {
        data.cell.styles.fillColor = ANEXO_05A_COLORS.institutional;
        data.cell.styles.textColor = ANEXO_05A_COLORS.institutionalText;
      }
    },
  });

  let yFoot = (doc.lastAutoTable?.finalY || y) + 18;
  appendPieAnexo05(doc, {
    razon_social: datos?.razon_social || proveedor?.razon_social || '',
    ruc: datos?.ruc || proveedor?.ruc || '',
    domicilio_fiscal: datos?.domicilio_fiscal || '',
    representante_legal: datos?.representante_legal || '',
    persona_contacto: datos?.persona_contacto || '',
    celular: datos?.celular || '',
    correo: datos?.correo || '',
    validez_oferta: datos?.validez_oferta || '',
  }, yFoot, { marginX, contentW: pageW - marginX * 2 });

  const safeName = String(codigo).replace(/[^\w.-]+/g, '_');
  doc.save(`Anexo_05-A_${safeName}.pdf`);
}

export function downloadAnexo05B({ solicitud, items, precios, proveedor, datos }) {
  const jsPDF = ensureJsPdf();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const codigo = solicitud?.codigo || 'SC';
  doc.setFontSize(12);
  doc.text('ANEXO 05-B — OFERTA ECONÓMICA (incluido IGV)', 40, 40);
  doc.setFontSize(9);
  doc.text(`Solicitud: ${codigo}`, 40, 56);

  let total = 0;
  const body = (items || []).map((it) => {
    const p = precios[it.item_key] || {};
    total += Number(p.total || 0);
    return [
      it.requerimiento_codigo || '',
      String(it.descripcion || ''),
      String(it.cantidad ?? 1),
      money(p.unitario),
      money(p.total),
    ];
  });

  doc.autoTable({
    startY: 72,
    head: [['Req.', 'Descripción', 'Cant.', 'P.Unitario S/.', 'P.Total S/.']],
    body,
    styles: { fontSize: 9, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [108, 117, 125] },
    margin: { left: 40, right: 40 },
    showHead: 'everyPage',
  });

  let y = doc.lastAutoTable.finalY + 14;
  doc.setFontSize(10);
  y = ensureSpace(doc, y, 20);
  doc.text(`Monto total de la oferta (incluido IGV): S/ ${money(total)}`, 40, y);
  y += 22;
  appendPieAnexo05(doc, datos, y, { marginX: 40, contentW: 520 });
  const safeName = String(codigo).replace(/[^\w.-]+/g, '_');
  doc.save(`Anexo_05-B_${safeName}.pdf`);
}

export function downloadAnexo06A({ solicitud, items, extra, proveedor, datos, locador = false }) {
  const jsPDF = ensureJsPdf();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const asunto = solicitud?.denominacion || solicitud?.objeto || '';
  const descCol = locador ? 'Descripción del servicio de locación' : 'Descripción del Servicio';

  let y = renderTituloAnexo(
    doc, '06-A',
    'FORMATO DE COTIZACIÓN DE SERVICIOS:',
    'PROPUESTA TÉCNICA - DECLARACIÓN JURADA DE OFERTA',
  );
  y = renderCartaServicios(doc, asunto, y);

  const body = (items || []).map((it, idx) => [
    String(idx + 1),
    it.requerimiento_codigo || '',
    String(it.descripcion || ''),
    String(cantidadPorTipo(locador ? 'Locadores' : 'Servicios', it.cantidad)),
    it.unidad_medida || 'servicio',
  ]);

  doc.autoTable({
    startY: y,
    head: [['Ítem', 'Nº REQ', descCol, 'Cantidad', 'Unidad de medida']],
    body,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
    margin: { left: MARGIN, right: MARGIN },
  });

  y = doc.lastAutoTable.finalY + 12;
  y = ensureSpace(doc, y, 30);
  doc.setFontSize(9);
  y = appendWrappedText(doc, TEXTO_CONFIRMACION_TR_06A, MARGIN, y, CONTENT_W) + 8;

  y = ensureSpace(doc, y, 30);
  doc.setFont(undefined, 'bold');
  doc.text('Plazo de ejecución:', MARGIN, y);
  doc.setFont(undefined, 'normal');
  doc.text(String(extra?.plazo_ejecucion || '[Debe indicar el plazo de ejecución ofertado]'), MARGIN + 110, y);
  y += 14;
  doc.setFont(undefined, 'bold');
  doc.text('Forma de pago:', MARGIN, y);
  doc.setFont(undefined, 'normal');
  doc.text(String(extra?.forma_pago || 'De acuerdo a lo indicado en al Requerimiento.'), MARGIN + 80, y);
  y += 18;

  y = renderDatosProveedor06A(doc, {
    razon_social: datos?.razon_social || proveedor?.razon_social,
    ruc: datos?.ruc || proveedor?.ruc,
    domicilio_fiscal: datos?.domicilio_fiscal,
    representante_legal: datos?.representante_legal,
    persona_contacto: datos?.persona_contacto,
    celular: datos?.celular,
    correo: datos?.correo,
  }, y);

  y = ensureSpace(doc, y, 60);
  doc.setFontSize(8);
  y = appendWrappedText(doc, TEXTO_AUTORIZACION_CORREO_06, MARGIN, y, CONTENT_W) + 10;
  renderFirmaRepresentante(doc, y);

  const codigo = solicitud?.codigo || 'SC';
  doc.save(`Anexo_06-A_${codigo.replace(/\s+/g, '_')}.pdf`);
}

export function downloadAnexo06B({ solicitud, items, precios, proveedor, datos }) {
  const jsPDF = ensureJsPdf();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const asunto = solicitud?.denominacion || solicitud?.objeto || '';

  let y = renderTituloAnexo(
    doc, '06-B',
    'FORMATO DE COTIZACIÓN DE SERVICIOS:',
    'PROPUESTA ECONÓMICA- DECLARACIÓN JURADA DE OFERTA',
  );
  y = renderCartaServicios(doc, asunto, y);

  let total = 0;
  const body = (items || []).map((it, idx) => {
    const p = precios?.[it.item_key] || {};
    total += Number(p.total || 0);
    return [
      String(idx + 1),
      it.requerimiento_codigo || '',
      String(it.descripcion || ''),
      String(cantidadPorTipo('Servicios', it.cantidad)),
      it.unidad_medida || 'servicio',
      money(p.unitario),
      money(p.total),
    ];
  });

  doc.autoTable({
    startY: y,
    head: [[
      'Ítem', 'Nº REQ', 'Descripción del Servicio', 'Cantidad', 'Unidad de medida',
      'Precio Unitario S/\n(Inc. IGV)', 'Precio Total S/\n(Inc. IGV)',
    ]],
    body,
    styles: { fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
    margin: { left: MARGIN, right: MARGIN },
  });

  y = doc.lastAutoTable.finalY + 12;
  y = ensureSpace(doc, y, 20);
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(`Precio Total S/ (Incluido IGV): ${money(total)}`, MARGIN, y);
  doc.setFont(undefined, 'normal');
  y += 18;

  doc.setFontSize(8);
  y = appendWrappedText(doc, GLOSA_SERVICIOS_06B_TODO_COSTO, MARGIN, y, CONTENT_W) + 6;
  y = appendWrappedText(doc, GLOSA_SERVICIOS_06B_CONFIRMACION, MARGIN, y, CONTENT_W) + 8;
  y = appendWrappedText(doc, TEXTO_AUTORIZACION_CORREO_06, MARGIN, y, CONTENT_W) + 10;
  renderFirmaRepresentante(doc, y);

  const codigo = solicitud?.codigo || 'SC';
  doc.save(`Anexo_06-B_${codigo.replace(/\s+/g, '_')}.pdf`);
}

export function downloadAnexo11({ solicitud, items, entregablesEco, extra, proveedor, datos }) {
  const jsPDF = ensureJsPdf();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const it = (items || [])[0] || {};
  const servicio = it.descripcion || solicitud?.denominacion || solicitud?.objeto || '';

  let y = renderTituloAnexo(
    doc, '11',
    'FORMATO DE PROPUESTA ECONÓMICA – SÓLO PARA TERCEROS',
    '',
  );
  y -= 4;
  doc.setFontSize(10);
  doc.text('Instituto Nacional de Salud', MARGIN, y);
  y += 13;
  doc.text('Presente. -', MARGIN, y);
  y += 15;
  doc.setFont(undefined, 'bold');
  doc.text(`SERVICIO: ${servicio}`, MARGIN, y);
  doc.setFont(undefined, 'normal');
  y += 16;
  y = appendWrappedText(
    doc,
    'Por medio de la presente, hago de su conocimiento mi propuesta económica, de acuerdo a los términos de referencia solicitados por la Unidad de Adquisiciones, conforme al siguiente detalle:',
    MARGIN, y, CONTENT_W,
  ) + 8;

  const ents = entregablesEco?.[it.item_key] || Array.from({ length: MAX_ENTREGABLES_LOCADOR }, (_, i) => ({
    nro: i + 1, um: 'Servicio', precio_unitario: 0, total: 0,
  }));
  let total = 0;
  const body = ents.slice(0, MAX_ENTREGABLES_LOCADOR).map((e, idx) => {
    total += Number(e.total || 0);
    return [
      String(idx + 1),
      idx === 0 ? String(servicio) : '',
      String(e.nro ?? idx + 1),
      e.um || 'Servicio',
      money(e.precio_unitario),
      money(e.total),
    ];
  });

  doc.autoTable({
    startY: y,
    head: [[
      'N°', 'Descripción del Servicio', 'N° de entregables', 'Unidad de medida',
      'Precio Unitario por cada entregable S/\n(Inc. IGV)', 'Precio Total S/\n(Inc. IGV)',
    ]],
    body,
    styles: { fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
    margin: { left: MARGIN, right: MARGIN },
  });

  y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text(`Precio Total S/ (Incluido IGV): ${money(total)}`, MARGIN, y);
  doc.setFont(undefined, 'normal');
  y += 16;

  doc.setFontSize(8);
  y = appendWrappedText(doc, IMPORTANTE_ANEXO11, MARGIN, y, CONTENT_W) + 6;
  y = appendWrappedText(doc, CONFIRMACION_ANEXO11, MARGIN, y, CONTENT_W) + 8;

  y = ensureSpace(doc, y, 20);
  doc.setFont(undefined, 'bold');
  doc.text('Plazo de ejecución:', MARGIN, y);
  doc.setFont(undefined, 'normal');
  const plazoEj = extra?.plazo_ejecucion
    || '-Hasta los ...... días calendario contados a partir del día de notificada la orden de servicio.';
  y = appendWrappedText(doc, plazoEj, MARGIN + 95, y, CONTENT_W - 95, 11) + 6;

  doc.setFont(undefined, 'bold');
  doc.text('Plazo para la presentación del producto:', MARGIN, y);
  doc.setFont(undefined, 'normal');
  y += 12;
  const plazos = extra?.plazos_entregables || [];
  PLAZOS_ENTREGABLES_LABELS.forEach((lbl, i) => {
    const val = plazos[i] || '…. días calendario contados a partir del día de notificada la o.s.';
    y = ensureSpace(doc, y, 14);
    doc.text(`-${lbl} ${val}`, MARGIN + 8, y);
    y += 11;
  });
  y += 4;
  y = appendWrappedText(doc, GLOSA_LOCADORES_FORMA_PAGO, MARGIN, y, CONTENT_W) + 6;
  y = appendWrappedText(doc, DECLARO_CONOCER_ANEXO11, MARGIN, y, CONTENT_W) + 6;
  y = appendWrappedText(doc, GLOSA_PENALIDAD_ANEXO11, MARGIN, y, CONTENT_W) + 4;
  doc.text(FORMULA_PENALIDAD_ANEXO11, MARGIN + 10, y);
  y += 11;
  doc.text(FORMULA_F_ANEXO11, MARGIN + 10, y);
  y += 11;
  y = appendWrappedText(doc, CIERRE_PENALIDAD_ANEXO11, MARGIN, y, CONTENT_W) + 10;

  doc.text('Lima,   de        de 20…', MARGIN, y);
  y += 14;
  doc.text(NOTA_COTIZACION_ANEXO11, MARGIN, y);
  y += 20;
  doc.text(`Firma: ${extra?.firma_nombre || ''}`, MARGIN, y);
  y += 13;
  doc.text(`Nombres completos: ${extra?.firma_nombre || datos?.representante_legal || ''}`, MARGIN, y);
  y += 13;
  doc.text(`DNI: ${extra?.firma_dni || ''}`, MARGIN, y);

  const codigo = solicitud?.codigo || 'SC';
  doc.save(`Anexo_11_${codigo.replace(/\s+/g, '_')}.pdf`);
}

export function readUploadFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Archivo no seleccionado'));
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      resolve({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nombre: file.name,
        mime_type: file.type || 'application/octet-stream',
        base64: dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl,
        size: file.size,
        uploaded_at: new Date().toISOString(),
      });
    };
    reader.onerror = () => reject(reader.error || new Error('Error al leer archivo'));
    reader.readAsDataURL(file);
  });
}

export function triggerFileInput(accept, onFile) {
  const input = document.createElement('input');
  input.type = 'file';
  if (accept) input.accept = accept;
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const meta = await readUploadFile(file);
      onFile(meta);
    } catch (err) {
      alert(err.message);
    }
  };
  input.click();
}

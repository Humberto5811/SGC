/** Generación PDF — Anexos de cotización (portal proveedores) */
import {
  GLOSA_SERVICIOS_06B_TODO_COSTO, GLOSA_SERVICIOS_06B_CONFIRMACION,
  TEXTO_CONFIRMACION_TR_06A, TEXTO_AUTORIZACION_CORREO_06,
  IMPORTANTE_ANEXO11, CONFIRMACION_ANEXO11, GLOSA_LOCADORES_FORMA_PAGO,
  DECLARO_CONOCER_ANEXO11, GLOSA_PENALIDAD_ANEXO11, FORMULA_PENALIDAD_ANEXO11,
  FORMULA_F_ANEXO11, CIERRE_PENALIDAD_ANEXO11, NOTA_COTIZACION_ANEXO11,
  cantidadPorTipo,
} from './proveedorCotizacionConfig.js';
import { sumPrecioEntregables } from './entregablesCotizacion.js';
import { TZ_LIMA } from './dateTimeLima.js';

const MARGIN = 54;
const PAGE_W = 612;
const CONTENT_W = PAGE_W - MARGIN * 2;

export const TEXTO_AUTORIZACION_CORREO = 'Asimismo, AUTORIZO que el correo electrónico consignado en la presente Declaración Jurada sea utilizado como medio formal de comunicación con la Entidad para que me notifique las siguientes actuaciones: i) emisión de la Orden o Contrato, ii) ampliación de plazo, iii) otras modificaciones a la Orden o Contrato, iv) Observaciones al bien y Levantamiento de Observaciones al bien, v) apercibimiento para cumplimiento de obligaciones contractuales, vi) Resolución Parcial o Total del Contrato u Orden, vii) comunicación de penalidades y descargos respectivos; y viii) otras actuaciones durante la etapa de ejecución contractual.';

export const TEXTO_LEY_27444 = '1.-El numeral 42.1 del artículo 42.- Presunción de veracidad de la Ley Nº 27444 - Ley del Procedimiento Administrativo General, establece que todas las declaraciones juradas, los documentos sucedáneos presentados y la información incluida en los escritos y formularios que presenten los administrados para la realización de procedimientos administrativos, se presumen verificados por quien hace uso de ellos, así como de contenido veraz para fines del procedimiento administrativo. Esta presunción admite prueba en contrario.';

function ensureJsPdf() {
  if (!window.jspdf?.jsPDF) throw new Error('Biblioteca PDF no disponible. Recargue la página.');
  return window.jspdf.jsPDF;
}

export function money(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Fecha larga en America/Lima p.ej. "Lima, 24 de julio de 2026" */
export function formatFechaCartaLima(valor = new Date()) {
  const d = valor instanceof Date ? valor : new Date(valor || Date.now());
  if (Number.isNaN(d.getTime())) return 'Lima,';
  try {
    const fmt = new Intl.DateTimeFormat('es-PE', {
      timeZone: TZ_LIMA,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return `Lima, ${fmt.format(d)}`;
  } catch (_) {
    return 'Lima,';
  }
}

/** Filas Anexo 11 a partir de entregables reales (sin pads fijos). */
export function buildAnexo11EntregablesRows(entregables = [], servicioDesc = '') {
  const list = Array.isArray(entregables) ? entregables.filter((e) => e && (
    String(e.nombre || e.descripcion || e.plazo_texto || e.plazo || '').trim() !== ''
    || Number(e.precio ?? e.precio_unitario ?? e.total ?? 0) > 0
  )) : [];
  return list.map((e, idx) => {
    const precio = Number(e.precio ?? e.precio_unitario ?? e.total ?? 0) || 0;
    const desc = String(e.nombre || e.descripcion || (idx === 0 ? servicioDesc : '') || '').trim();
    return {
      nro: e.numero ?? e.nro ?? idx + 1,
      descripcion: desc,
      plazo: String(e.plazo_texto || e.plazo || '').trim(),
      um: e.um || e.unidad_medida || 'Servicio',
      precio,
      total: precio,
    };
  });
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
  doc.text(formatFechaCartaLima(), MARGIN, y);
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

function renderFirmaRepresentante(doc, y, datos = {}) {
  y = ensureSpace(doc, y, 100);
  doc.setFontSize(9);
  // Espacio equivalente a ~4 líneas para firma manuscrita
  y += 48;
  doc.text('___________________________', MARGIN, y);
  y += 14;
  doc.text('Firma del Representante Legal', MARGIN, y);
  y += 14;
  const nombre = String(datos.representante_legal || '').trim();
  const dni = String(datos.firma_representante || datos.dni || '').trim();
  if (nombre) {
    doc.text(nombre, MARGIN, y);
    y += 12;
  }
  if (dni) {
    doc.text(`DNI: ${dni}`, MARGIN, y);
    y += 12;
  }
  return y + 6;
}

function appendDatosProveedor(doc, datos, startY) {
  const d = datos || {};
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
    ['Firma del Representante legal:', d.firma_representante || ''],
  ];
  rows.forEach(([label, val]) => {
    doc.setFont(undefined, 'bold');
    doc.text(label, 40, y);
    doc.setFont(undefined, 'normal');
    const lines = doc.splitTextToSize(String(val), 360);
    doc.text(lines, 170, y);
    y += Math.max(12, lines.length * 11);
  });
  return y + 8;
}

export function downloadAnexo05A({ solicitud, items, formItems, proveedor, datos }) {
  const jsPDF = ensureJsPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const codigo = solicitud?.codigo || 'SC';
  doc.setFontSize(12);
  doc.text('ANEXO 05-A — INFORMACIÓN TÉCNICA SOLICITADA (CUMPLIMIENTO DEL ÍTEM)', 40, 40);
  doc.setFontSize(9);
  doc.text(`Solicitud: ${codigo} — ${solicitud?.denominacion || solicitud?.objeto || ''}`, 40, 56);
  doc.text(`Proveedor: ${datos?.razon_social || proveedor?.razon_social || ''} · RUC ${datos?.ruc || proveedor?.ruc || ''}`, 40, 68);

  const head = [[
    'Req.', 'Código SIGA', 'Descripción', 'Cant.', 'Presentación', 'Cant.of.', 'Marca', 'Modelo',
    'País', 'Año', 'Garantía', 'Vigencia', 'Canje', 'Plazo', 'Doc.téc.',
  ]];
  const body = (items || []).map((it, idx) => {
    const f = formItems[idx] || {};
    return [
      it.requerimiento_codigo || '',
      it.codigo_sigamef || '',
      String(it.descripcion || '').slice(0, 40),
      String(it.cantidad ?? 1),
      f.presentacion || '',
      String(f.cantidad_ofertada ?? ''),
      f.marca || '',
      f.modelo || '',
      f.pais || '',
      f.anio_fabricacion || '',
      f.garantia || '',
      f.vigencia_minima || '',
      f.compromiso_canje || '',
      f.plazo_entrega || '',
      f.doc_tecnica || '',
    ];
  });

  doc.autoTable({
    startY: 82,
    head,
    body,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [13, 110, 253] },
    margin: { left: 40, right: 40 },
  });

  let y = doc.lastAutoTable.finalY + 24;
  doc.setFontSize(9);
  doc.text('Firma del proveedor:', 40, y);
  doc.line(40, y + 28, 280, y + 28);
  doc.save(`Anexo_05-A_${codigo.replace(/\s+/g, '_')}.pdf`);
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
      String(it.descripcion || '').slice(0, 60),
      String(it.cantidad ?? 1),
      money(p.unitario),
      money(p.total),
    ];
  });

  doc.autoTable({
    startY: 72,
    head: [['Req.', 'Descripción', 'Cant.', 'P.Unitario S/.', 'P.Total S/.']],
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [108, 117, 125] },
    margin: { left: 40, right: 40 },
  });

  let y = doc.lastAutoTable.finalY + 14;
  doc.setFontSize(10);
  doc.text(`Monto total de la oferta (incluido IGV): S/ ${money(total)}`, 40, y);
  y += 22;
  y = appendDatosProveedor(doc, datos, y);
  doc.setFontSize(8);
  y = appendWrappedText(doc, TEXTO_AUTORIZACION_CORREO, 40, y, 520);
  y += 6;
  appendWrappedText(doc, TEXTO_LEY_27444, 40, y, 520);
  doc.save(`Anexo_05-B_${codigo.replace(/\s+/g, '_')}.pdf`);
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
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak', cellWidth: 'wrap' },
    columnStyles: {
      2: { cellWidth: 220 },
    },
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
    margin: { left: MARGIN, right: MARGIN },
  });

  y = doc.lastAutoTable.finalY + 12;
  y = ensureSpace(doc, y, 30);
  doc.setFontSize(9);
  y = appendWrappedText(doc, TEXTO_CONFIRMACION_TR_06A, MARGIN, y, CONTENT_W) + 8;

  y = ensureSpace(doc, y, 40);
  doc.setFont(undefined, 'bold');
  doc.text('Plazo de ejecución:', MARGIN, y);
  doc.setFont(undefined, 'normal');
  y = appendWrappedText(
    doc,
    String(extra?.plazo_ejecucion || '[Debe indicar el plazo de ejecución ofertado]'),
    MARGIN + 110, y, CONTENT_W - 110, 11,
  ) + 4;
  doc.setFont(undefined, 'bold');
  doc.text('Forma de pago:', MARGIN, y);
  doc.setFont(undefined, 'normal');
  y = appendWrappedText(
    doc,
    String(extra?.forma_pago || 'De acuerdo a lo indicado en al Requerimiento.'),
    MARGIN + 80, y, CONTENT_W - 80, 11,
  ) + 10;

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
  renderFirmaRepresentante(doc, y, {
    representante_legal: datos?.representante_legal,
    firma_representante: datos?.firma_representante,
  });

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
  doc.text(formatFechaCartaLima(), MARGIN, y);
  y += 13;
  doc.text('Instituto Nacional de Salud', MARGIN, y);
  y += 13;
  doc.text('Presente. -', MARGIN, y);
  y += 15;
  doc.setFont(undefined, 'bold');
  y = appendWrappedText(doc, `SERVICIO: ${servicio}`, MARGIN, y, CONTENT_W, 11) + 4;
  doc.setFont(undefined, 'normal');
  y = appendWrappedText(
    doc,
    'Por medio de la presente, hago de su conocimiento mi propuesta económica, de acuerdo a los términos de referencia solicitados por la Unidad de Adquisiciones, conforme al siguiente detalle:',
    MARGIN, y, CONTENT_W,
  ) + 8;

  const rawEnts = entregablesEco?.[it.item_key]
    || (Array.isArray(entregablesEco) ? entregablesEco : null)
    || entregablesEco?.entregables_cotizados
    || [];
  const rows = buildAnexo11EntregablesRows(rawEnts, servicio);
  const total = sumPrecioEntregables(rows);
  const body = rows.map((e) => [
    String(e.nro),
    e.descripcion,
    e.um,
    money(e.precio),
  ]);

  doc.autoTable({
    startY: y,
    head: [[
      'N°', 'Entregable / Descripción', 'Unidad de medida',
      'Precio S/\n(Inc. IGV)',
    ]],
    body: body.length ? body : [['—', 'Sin entregables programados', '—', '0.00']],
    styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak', valign: 'top' },
    columnStyles: {
      1: { cellWidth: 260 },
    },
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
    margin: { left: MARGIN, right: MARGIN },
  });

  y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text(`Precio total de la propuesta: S/ ${money(total)}`, MARGIN, y);
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
  if (rows.length) {
    rows.forEach((e, i) => {
      const label = e.descripcion || `Entregable ${e.nro}`;
      const val = plazos[i] || e.plazo || '…. días calendario contados a partir del día de notificada la o.s.';
      y = ensureSpace(doc, y, 28);
      y = appendWrappedText(doc, `-${label}: ${val}`, MARGIN + 8, y, CONTENT_W - 8, 11) + 2;
    });
  }
  y += 4;
  y = appendWrappedText(doc, GLOSA_LOCADORES_FORMA_PAGO, MARGIN, y, CONTENT_W) + 6;
  y = appendWrappedText(doc, DECLARO_CONOCER_ANEXO11, MARGIN, y, CONTENT_W) + 6;
  y = appendWrappedText(doc, GLOSA_PENALIDAD_ANEXO11, MARGIN, y, CONTENT_W) + 4;
  doc.text(FORMULA_PENALIDAD_ANEXO11, MARGIN + 10, y);
  y += 11;
  doc.text(FORMULA_F_ANEXO11, MARGIN + 10, y);
  y += 11;
  y = appendWrappedText(doc, CIERRE_PENALIDAD_ANEXO11, MARGIN, y, CONTENT_W) + 10;

  y = appendWrappedText(doc, NOTA_COTIZACION_ANEXO11, MARGIN, y, CONTENT_W) + 8;
  renderFirmaRepresentante(doc, y, {
    representante_legal: datos?.representante_legal || extra?.firma_nombre || '',
    firma_representante: datos?.firma_representante || extra?.firma_dni || '',
  });

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

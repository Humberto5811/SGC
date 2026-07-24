/**
 * RC7.7C — Generación PDF institucional Bienes (07-A) / Servicios (07-B).
 * Usa buildValidationReportData como única fuente normalizada.
 */
import { getValidacionConfig, TIPO_VALIDACION } from './validacionFormatosConfig.js';
import { buildValidationReportData } from './validacionReportData.js';

function ensureJsPdf() {
  if (!window.jspdf?.jsPDF) throw new Error('Biblioteca PDF no disponible. Recargue la página.');
  return window.jspdf.jsPDF;
}

const COLOR_AUTO = [207, 232, 245];
const COLOR_EVAL = [212, 237, 218];
const COLOR_HEAD_TEXT = [10, 66, 117];
const COLOR_SECTION = [11, 83, 148];

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') return '';
  return String(v);
}

/** Columnas del PDF según formato institucional (sin Docs; Servicios sin Centro). */
function columnasPdf(config, tipoKey) {
  return (config.columnas || []).filter((c) => {
    if (c.kind === 'docs') return false;
    if (tipoKey === TIPO_VALIDACION.SERVICIOS && c.key === 'centro') return false;
    return true;
  });
}

function buildGroupedHead(cols, tipoKey) {
  if (tipoKey === TIPO_VALIDACION.SERVICIOS) {
    const nReq = cols.filter((c) => ['item', 'nro_req', 'codigo_siga', 'descripcion', 'cantidad', 'um'].includes(c.key)).length;
    const nCot = cols.filter((c) => ['cant_cotizaciones', 'razon_social'].includes(c.key)).length;
    const nEval = cols.filter((c) => c.kind === 'eval').length;
    return [
      [
        { content: 'DETALLE DEL REQUERIMIENTO', colSpan: nReq, styles: { fillColor: COLOR_AUTO, textColor: COLOR_SECTION, halign: 'center', fontStyle: 'bold', fontSize: 7 } },
        { content: 'DETALLE COTIZACIONES RECIBIDAS', colSpan: nCot, styles: { fillColor: COLOR_AUTO, textColor: COLOR_SECTION, halign: 'center', fontStyle: 'bold', fontSize: 7 } },
        { content: 'VALIDACIÓN DEL ÁREA USUARIA', colSpan: nEval, styles: { fillColor: COLOR_EVAL, textColor: [21, 87, 36], halign: 'center', fontStyle: 'bold', fontSize: 7 } },
      ],
      cols.map((c) => c.label),
    ];
  }
  // Bienes: grupos similares
  const nAuto = cols.filter((c) => c.kind === 'auto').length;
  const nEval = cols.filter((c) => c.kind === 'eval').length;
  return [
    [
      { content: 'DATOS DEL ÍTEM / COTIZACIÓN', colSpan: nAuto, styles: { fillColor: COLOR_AUTO, textColor: COLOR_SECTION, halign: 'center', fontStyle: 'bold', fontSize: 7 } },
      { content: 'VALIDACIÓN DEL ÁREA USUARIA', colSpan: nEval, styles: { fillColor: COLOR_EVAL, textColor: [21, 87, 36], halign: 'center', fontStyle: 'bold', fontSize: 7 } },
    ],
    cols.map((c) => c.label),
  ];
}

/**
 * @param {{ solicitud: object, matriz_v2: object, formulario?: object, meta?: object }} opts
 */
export function downloadFormatoValidacion(opts = {}) {
  const { solicitud, matriz_v2, formulario, meta } = opts;
  const tipoHint = matriz_v2?.tipo
    || solicitud?.tipo_formato
    || solicitud?.tipo_contratacion
    || solicitud?.tipo;
  const report = buildValidationReportData(
    {
      ...solicitud,
      matriz_v2,
      formulario_07a: formulario,
      tipo_formato: tipoHint,
    },
    { matriz_v2, formulario_07a: formulario },
  );

  const { tipoKey, config, cabecera, matriz_v2: mtx } = report;
  if (!config || tipoKey === TIPO_VALIDACION.LOCADORES) {
    throw new Error('No hay formato PDF institucional para este tipo de contratación.');
  }

  const jsPDF = ensureJsPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  const filas = mtx.filas || [];
  const cols = columnasPdf(config, tipoKey);
  const pageW = doc.internal.pageSize.getWidth();
  const usable = pageW - 56;

  // ——— Cabecera institucional ———
  doc.setFontSize(12);
  doc.setTextColor(...COLOR_HEAD_TEXT);
  doc.setFont(undefined, 'bold');
  const tituloLineas = String(config.anexoTitulo || '').split('–').map((s) => s.trim());
  if (tituloLineas.length >= 2) {
    doc.text(tituloLineas[0], 36, 28);
    doc.setFontSize(10);
    doc.text(tituloLineas.slice(1).join(' – '), 36, 42);
  } else {
    doc.text(config.anexoTitulo, 36, 32);
  }
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(40);

  let yHead = 56;
  if (tipoKey === TIPO_VALIDACION.SERVICIOS) {
    const sub = 'CUADRO DE VERIFICACIÓN, VALIDACIÓN Y EVALUACIÓN DE CUMPLIMIENTO DE LOS TÉRMINOS DE REFERENCIA DE LAS PROPUESTAS TÉCNICAS RECIBIDAS PARA LA PRESTACIÓN DE SERVICIO DE:';
    const subLines = doc.splitTextToSize(sub, usable);
    doc.text(subLines, 36, yHead);
    yHead += subLines.length * 10 + 4;
    doc.setFont(undefined, 'bold');
    const descLines = doc.splitTextToSize(cellText(cabecera.descripcion || '—'), usable);
    doc.text(descLines, 36, yHead);
    yHead += descLines.length * 11 + 8;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7.5);
    doc.text(
      `Solicitud: ${cabecera.solicitud_codigo || '—'}   REQ: ${cabecera.requerimientos || '—'}   Tipo: ${cabecera.tipo_label || 'Servicios'}   Centro: ${cabecera.centro_label || cabecera.centro || '—'}`,
      36,
      yHead,
    );
    yHead += 12;
  } else {
    doc.text('CUADRO DE VERIFICACIÓN, VALIDACIÓN Y EVALUACIÓN DE CUMPLIMIENTO', 36, yHead);
    yHead += 12;
    doc.text(`ADQUISICIÓN / SERVICIO: ${cabecera.descripcion || ''}`, 36, yHead);
    yHead += 11;
    doc.text(
      `Solicitud: ${cabecera.solicitud_codigo || ''}   REQ: ${cabecera.requerimientos || ''}   Tipo: ${cabecera.tipo_label || ''}   Centro: ${cabecera.centro_label || cabecera.centro || '—'}`,
      36,
      yHead,
    );
    yHead += 14;
  }

  const head = buildGroupedHead(cols, tipoKey);
  const body = filas.map((fila) => {
    const auto = fila.automaticos || {};
    const ev = fila.evaluacion || {};
    return cols.map((c) => {
      if (c.kind === 'auto') {
        if (c.key === 'codigo_siga') return cellText(auto.codigo_siga || auto.codigo_sigamef);
        if (c.key === 'um') return cellText(auto.um || auto.unidad_medida);
        return cellText(auto[c.key]);
      }
      return cellText(ev[c.key]);
    });
  });

  const weights = cols.map((c) => {
    if (c.key === 'observaciones' || c.key === 'obs_specs') return 2.6;
    if (c.key === 'descripcion' || c.key === 'razon_social') return 2.0;
    if (c.key === 'resultado') return 1.7;
    if (c.key === 'canal_autorizado' || c.key === 'experiencia_facturacion') return 1.5;
    return 1;
  });
  const sumW = weights.reduce((a, b) => a + b, 0);
  const colWidths = weights.map((w) => (usable * w) / sumW);

  doc.autoTable({
    head,
    body,
    startY: yHead,
    styles: { fontSize: 6, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
    headStyles: {
      fillColor: COLOR_AUTO,
      textColor: COLOR_HEAD_TEXT,
      fontSize: 5.2,
      halign: 'center',
      valign: 'middle',
      overflow: 'linebreak',
      cellPadding: 3,
      minCellHeight: 36,
    },
    columnStyles: Object.fromEntries(cols.map((_, i) => [i, { cellWidth: colWidths[i] }])),
    didParseCell(data) {
      if (data.section === 'head') {
        // Fila 0 = grupos; fila 1 = columnas
        if (data.row.index === 1) {
          const col = cols[data.column.index];
          data.cell.styles.fillColor = col?.kind === 'eval' ? COLOR_EVAL : COLOR_AUTO;
          if (col?.kind === 'eval') {
            data.cell.styles.textColor = [21, 87, 36];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      } else if (data.section === 'body') {
        const col = cols[data.column.index];
        data.cell.styles.fillColor = col?.kind === 'eval' ? [243, 250, 244] : [238, 247, 251];
      }
    },
    margin: { left: 28, right: 28 },
    rowPageBreak: 'auto',
    showHead: 'everyPage',
    didDrawPage(data) {
      const pageCount = doc.internal.getNumberOfPages();
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text(`Página ${data.pageNumber} / ${pageCount}`, pageW - 80, pageH - 16);
    },
  });

  let y = (doc.lastAutoTable?.finalY || 120) + 22;
  const pageH = doc.internal.pageSize.getHeight();
  if (y > pageH - 100) {
    doc.addPage();
    y = 48;
  }

  const fecha = meta?.fecha || cabecera.fecha || formulario?.fecha || new Date().toLocaleDateString('es-PE');
  const profesional = meta?.profesional || cabecera.profesional || formulario?.profesional || '';
  const lugar = formulario?.lugar || 'Chorrillos';

  doc.setFontSize(9);
  doc.setTextColor(20);
  doc.setFont(undefined, 'normal');
  doc.text(lugar, 36, y);
  doc.text(fecha, 160, y);
  y += 18;
  doc.text('NOMBRE Y APELLIDO DEL PROFESIONAL QUE REALIZÓ LA VALIDACIÓN:', 36, y);
  y += 14;
  doc.setFont(undefined, 'bold');
  doc.text(profesional || '_______________________________', 36, y);
  doc.setFont(undefined, 'normal');
  y += 28;
  doc.text('FIRMA:', 36, y);
  doc.setDrawColor(60);
  doc.line(90, y + 2, 320, y + 2);

  const codigo = String(cabecera.solicitud_codigo || solicitud?.solicitud_codigo || 'SC').replace(/\s+/g, '_');
  const sufijo = tipoKey === TIPO_VALIDACION.SERVICIOS ? '07B_Servicios' : '07A_Bienes';
  doc.save(`Anexo_${sufijo}_${codigo}.pdf`);
}

/** Alias compat: descarga según tipo del detalle. */
export function downloadAnexo07A({ solicitud, formulario, matriz_v2 }) {
  const mtx = matriz_v2 || solicitud?.matriz_v2;
  const tipoKey = getValidacionConfig(
    mtx?.tipo || solicitud?.tipo_formato || solicitud?.tipo_contratacion || solicitud?.tipo,
  ).tipoKey || 'BIENES';

  if (mtx?.filas) {
    return downloadFormatoValidacion({
      solicitud: { ...solicitud, tipo_formato: tipoKey },
      matriz_v2: { ...mtx, tipo: mtx.tipo || tipoKey },
      formulario,
      meta: {
        fecha: formulario?.fecha,
        profesional: formulario?.profesional,
      },
    });
  }
  const filas = (formulario?.items || []).map((it, idx) => ({
    item_key: it.item_key || `legacy-${idx}`,
    automaticos: {
      item: it.item,
      nro_req: it.nro_req,
      centro: it.centro || '',
      centro_costo: it.centro_costo || '',
      codigo_siga: it.codigo_sigamef || '',
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      um: it.um,
      cant_cotizaciones: it.cant_cotizaciones,
      razon_social: it.razon_social,
      marca: it.marca,
      procedencia: it.procedencia,
    },
    evaluacion: {
      inserto: it.inserto,
      certificado: it.certificado,
      obs_specs: it.obs_specs,
      acredita_doc: it.acredita_doc,
      vigencia_minima: it.vigencia_minima_val,
      plazos_entrega: it.plazos_entrega_val,
      plazo_ejecucion: it.plazos_entrega_val,
      formacion_academica: it.formacion_academica,
      capacitacion_personal: it.capacitacion_personal,
      experiencia_personal: it.experiencia_personal,
      experiencia_facturacion: it.experiencia_facturacion,
      canal_autorizado: it.canal_autorizado,
      resultado: it.resultado,
      observaciones: it.obs_validacion,
    },
  }));
  return downloadFormatoValidacion({
    solicitud: { ...solicitud, tipo_formato: tipoKey },
    matriz_v2: { version: 2, tipo: tipoKey, filas },
    formulario,
    meta: { fecha: formulario?.fecha, profesional: formulario?.profesional },
  });
}

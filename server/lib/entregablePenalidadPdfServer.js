/**
 * RC8.15.6G-7 — PDF institucional: formato de penalidad y carta al proveedor.
 */
import { formatCalendarDdMmYyyy } from '../../shared/calendarDate.js';
import { REGLA_PENALIDAD_VERSION } from '../../shared/penalidadCalculo.js';
import {
  PdfFormBuilder,
  assemblePdf,
} from './recepcionActaPdfServer.js';

const MARGIN = 42;
const CONTENT_W = 511;

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  if (!iso) return '—';
  const f = formatCalendarDdMmYyyy(iso);
  return f && f !== '—' ? f : '—';
}

function fmtMonto(n, moneda = 'PEN') {
  const val = Number(n || 0);
  const sym = String(moneda).toUpperCase() === 'USD' ? 'US$' : 'S/';
  return `${sym} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderSection(builder, title, rows, yStart) {
  let y = yStart;
  builder.text(title, MARGIN, y, { size: 11, bold: true });
  y += 16;
  for (const [label, value] of rows) {
    builder.text(`${label}:`, MARGIN, y, { size: 9, bold: true });
    builder.text(String(value ?? '—'), MARGIN + 170, y, { size: 9, maxW: CONTENT_W - 180 });
    y += 14;
  }
  return y + 8;
}

function buildPdfDocument({ titulo, secciones = [], pie = '' }) {
  const builder = new PdfFormBuilder();
  let y = 48;
  builder.text(titulo, MARGIN, y, { size: 14, bold: true });
  y += 24;

  for (const sec of secciones) {
    y = renderSection(builder, sec.titulo, sec.filas, y);
    if (y > 720) break;
  }

  if (pie) {
    y += 6;
    builder.text(pie, MARGIN, y, { size: 8, maxW: CONTENT_W });
  }

  const stream = builder.buildStream();
  const pdfBytes = assemblePdf(stream);
  const base64 = Buffer.from(pdfBytes, 'latin1').toString('base64');
  return {
    base64,
    bytes: Buffer.byteLength(pdfBytes, 'latin1'),
    mime: 'application/pdf',
  };
}

export function generateFormatoPenalidadPdf(data = {}) {
  const orden = `${data.tipo_orden || 'OS'} ${data.numero_orden || ''}`.trim();
  const general = [
    ['Orden', orden],
    ['Proveedor', data.proveedor_razon_social || '—'],
    ['RUC', data.proveedor_ruc || '—'],
    ['Tipo contratación', data.tipo_contratacion || '—'],
    ['Objeto', data.objeto || data.descripcion || '—'],
    ['Área usuaria', data.area_usuaria || '—'],
    ['Entregable', `N.° ${data.numero_entrega ?? '—'}`],
  ];
  const plazos = [
    ['Fecha orden / notificación', fmtFecha(data.fecha_notificacion || data.fecha_orden)],
    ['Fecha inicio plazo', fmtFecha(data.fecha_inicio_plazo)],
    ['Plazo contractual (días)', data.dias_plazo ?? '—'],
    ['Fecha máxima contractual', fmtFecha(data.fecha_maxima_contractual)],
    ['Total días ampliación', data.total_dias_ampliacion ?? 0],
    ['Fecha máxima ajustada', fmtFecha(data.fecha_maxima_ajustada)],
    ['Fecha recepción / presentación', fmtFecha(data.fecha_presentacion)],
    ['Días de atraso', data.dias_atraso ?? 0],
  ];
  const calc = data.resultado || {};
  const calculo = [
    ['Monto base aplicable', fmtMonto(calc.monto_base_aplicable, data.moneda)],
    ['Penalidad diaria', fmtMonto(calc.penalidad_diaria, data.moneda)],
    ['Días de atraso', calc.dias_atraso ?? 0],
    ['Penalidad calculada', fmtMonto(calc.penalidad_calculada, data.moneda)],
    ['Penalidad máxima (10%)', fmtMonto(calc.penalidad_maxima, data.moneda)],
    ['Penalidad aplicable', fmtMonto(calc.penalidad_aplicable, data.moneda)],
    ['Monto a pagar', fmtMonto(calc.monto_a_pagar, data.moneda)],
  ];

  const pdf = buildPdfDocument({
    titulo: 'FORMATO DE PENALIDAD POR MORA',
    secciones: [
      { titulo: 'DATOS GENERALES', filas: general },
      { titulo: 'PLAZOS', filas: plazos },
      { titulo: 'CÁLCULO', filas: calculo },
      {
        titulo: 'SUSTENTO NORMATIVO',
        filas: [
          ['Glosa', 'Penalidad por mora hasta 10% del monto del ítem, conforme Anexo 11.'],
          ['Fórmula', 'Penalidad diaria = 0.10 × monto / (0.40 × plazo días)'],
          ['Factor F', '0.40'],
          ['Versión regla', calc.regla_version || data.regla_version || REGLA_PENALIDAD_VERSION],
        ],
      },
    ],
    pie: data.sustento || 'Documento generado por el SGC para revisión y firma del Analista CM.',
  });

  const nombre = `formato-penalidad-${orden.replace(/\s+/g, '-')}-E${data.numero_entrega || '1'}-v${data.version || 1}.pdf`;
  return { ...pdf, nombre };
}

export function generateCartaPenalidadPdf(data = {}) {
  const orden = `${data.tipo_orden || 'OS'} ${data.numero_orden || ''}`.trim();
  const calc = data.resultado || {};
  const cuerpo = [
    `Señores`,
    `${data.proveedor_razon_social || '—'}`,
    `RUC: ${data.proveedor_ruc || '—'}`,
    '',
    `Por medio de la presente comunicamos que, respecto de la ${orden}, entregable N.° ${data.numero_entrega ?? '—'},`,
    `objeto: ${data.objeto || data.descripcion || '—'}, se ha determinado una penalidad por mora.`,
    '',
    `Días de atraso imputables: ${calc.dias_atraso ?? 0}.`,
    `Penalidad aplicable: ${fmtMonto(calc.penalidad_aplicable, data.moneda)}.`,
    `Monto del entregable: ${fmtMonto(calc.monto_base_aplicable, data.moneda)}.`,
    `Monto resultante a pagar: ${fmtMonto(calc.monto_a_pagar, data.moneda)}.`,
    '',
    `Sustento: ${data.referencia_sustento || 'Formato de penalidad generado en el SGC.'}`,
    '',
    'La presente carta se emite para revisión y firma. No constituye notificación electrónica automática.',
  ].join('\n');

  const pdf = buildPdfDocument({
    titulo: 'CARTA DE COMUNICACIÓN DE PENALIDAD',
    secciones: [
      {
        titulo: 'REFERENCIA',
        filas: [
          ['Orden', orden],
          ['Entregable', `N.° ${data.numero_entrega ?? '—'}`],
          ['Proveedor', data.proveedor_razon_social || '—'],
          ['RUC', data.proveedor_ruc || '—'],
        ],
      },
      {
        titulo: 'CONTENIDO',
        filas: [['Texto', cuerpo]],
      },
    ],
    pie: `Generado el ${fmtFecha(data.fecha_generacion || new Date().toISOString())}. Versión ${data.version || 1}.`,
  });

  const nombre = `carta-penalidad-${orden.replace(/\s+/g, '-')}-E${data.numero_entrega || '1'}-v${data.version || 1}.pdf`;
  return { ...pdf, nombre };
}

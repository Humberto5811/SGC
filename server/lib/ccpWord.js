/**
 * Generación Word (.docx) — Solicitud de Certificación de Crédito Presupuestal.
 */
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, WidthType, AlignmentType, BorderStyle, HeadingLevel,
} from 'docx';
import { buildAsuntoCcp } from './ccpCertificacion.js';

function fmtMonto(n, moneda = 'PEN') {
  const num = Number(n) || 0;
  const symbol = String(moneda).toUpperCase() === 'USD' ? 'US$' : 'S/';
  return `${symbol} ${num.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cell(text, opts = {}) {
  const {
    bold = false, align = AlignmentType.LEFT, width = 1200, fill,
  } = opts;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: 'clear', fill } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: '666666' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '666666' },
      left: { style: BorderStyle.SINGLE, size: 4, color: '666666' },
      right: { style: BorderStyle.SINGLE, size: 4, color: '666666' },
    },
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: String(text ?? '—'),
            bold,
            size: 16,
            font: 'Arial',
          }),
        ],
      }),
    ],
  });
}

/**
 * @param {object} consolidacion — resultado de getConsolidacionCcp
 * @returns {Promise<{ buffer: Buffer, filename: string, asunto: string }>}
 */
export async function generarWordSolicitudCcp(consolidacion = {}) {
  const filas = Array.isArray(consolidacion.filas) ? consolidacion.filas : [];
  const reqCodes = (consolidacion.requerimientos || []).map((r) => r.requerimiento_codigo);
  const codigos = [...new Set((consolidacion.requerimientos || []).map((r) => r.codigo_ccp).filter(Boolean))];
  const asunto = consolidacion.asunto || buildAsuntoCcp({ reqCodes, codigosCcp: codigos });
  const total = consolidacion.total_monto != null
    ? Number(consolidacion.total_monto)
    : filas.reduce((a, f) => a + Number(f.monto || 0), 0);
  const moneda = consolidacion.moneda || 'PEN';

  const widths = [1100, 1100, 2200, 1100, 1000, 1400, 1200, 1200];
  const headers = [
    'N.° CCP', 'Centro', 'Descripción', 'Meta', 'Fte. Fto.',
    'Específica de gasto', 'Requerimiento', 'Monto presupuestal',
  ];

  const headerRow = new TableRow({
    children: headers.map((h, i) => cell(h, {
      bold: true,
      width: widths[i],
      fill: 'D9E8F5',
      align: i === 7 ? AlignmentType.RIGHT : AlignmentType.CENTER,
    })),
  });

  const dataRows = filas.map((f) => new TableRow({
    children: [
      cell(f.codigo_ccp || 'Pendiente', { width: widths[0] }),
      cell(f.centro || '—', { width: widths[1] }),
      cell(f.descripcion || '—', { width: widths[2] }),
      cell(f.meta || '—', { width: widths[3] }),
      cell(f.fuente_fto || '—', { width: widths[4] }),
      cell(f.especifica || '—', { width: widths[5] }),
      cell(f.requerimiento || '—', { width: widths[6] }),
      cell(fmtMonto(f.monto, moneda), { width: widths[7], align: AlignmentType.RIGHT }),
    ],
  }));

  const totalRowFixed = new TableRow({
    children: [
      cell('', { width: widths[0], fill: 'FFF3CD' }),
      cell('', { width: widths[1], fill: 'FFF3CD' }),
      cell('', { width: widths[2], fill: 'FFF3CD' }),
      cell('', { width: widths[3], fill: 'FFF3CD' }),
      cell('', { width: widths[4], fill: 'FFF3CD' }),
      cell('', { width: widths[5], fill: 'FFF3CD' }),
      cell('TOTAL GENERAL', { bold: true, width: widths[6], fill: 'FFF3CD', align: AlignmentType.RIGHT }),
      cell(fmtMonto(total, moneda), {
        bold: true, width: widths[7], align: AlignmentType.RIGHT, fill: 'FFF3CD',
      }),
    ],
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { orientation: 'landscape' },
          margin: {
            top: 720, bottom: 720, left: 720, right: 720,
          },
        },
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
          children: [new TextRun({ text: 'CERTIFICACIÓN DE CRÉDITO PRESUPUESTAL', bold: true, size: 28, font: 'Arial' })],
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: 'Asunto: ', bold: true, size: 22, font: 'Arial' }),
            new TextRun({ text: asunto, size: 22, font: 'Arial' }),
          ],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({
            text: 'Tengo a bien dirigirme a usted para saludarlo cordialmente y, al mismo tiempo, solicitar la emisión de la Certificación de Crédito Presupuestal detallada en el cuadro, la cual se ejecutará de la siguiente manera:',
            size: 20,
            font: 'Arial',
          })],
        }),
        new Table({
          width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
          columnWidths: widths,
          rows: [headerRow, ...dataRows, totalRowFixed],
        }),
        new Paragraph({ spacing: { before: 300 }, children: [] }),
        new Paragraph({
          spacing: { after: 300 },
          children: [new TextRun({
            text: 'A la espera de su gentil atención, quedo de usted.',
            size: 20,
            font: 'Arial',
          })],
        }),
        new Paragraph({
          spacing: { before: 400 },
          children: [new TextRun({ text: '______________________________', size: 20, font: 'Arial' })],
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Firma y sello', size: 18, font: 'Arial', italics: true })],
        }),
        new Paragraph({
          spacing: { before: 120 },
          children: [new TextRun({
            text: `Documento: ${consolidacion.codigo_interno || ''} · ${filas.length} fila(s)`,
            size: 16,
            font: 'Arial',
            color: '666666',
          })],
        }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `${String(consolidacion.codigo_interno || 'CCP-SOL').replace(/\s+/g, '_')}.docx`;
  return { buffer, filename, asunto, total };
}

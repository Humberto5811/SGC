/**
 * Anexo 07-A BIENES — layout PDF institucional (funciones puras).
 *
 *   node scripts/test-anexo07a-pdf-bienes-layout.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatFechaCalendarioLima,
  resolveFechaValidacionParaPdf,
  stampFechaValidacionCalendarioLima,
} from '../shared/calendarDate.js';
import {
  ANEXO_07A_TITULO_LINE1,
  ANEXO_07A_TITULO_LINE2,
  ANEXO_07A_TITULO_UNA_LINEA,
  CUADRO_INSTITUCIONAL_BIENES,
  BIENES_GROUP_TITLES,
  BIENES_BLOCK_2_LAST,
  BIENES_BLOCK_3_LAST,
  columnasPdfBienes,
  computeBienesBlockLayout,
  buildGroupedHeadBienes,
  buildCabeceraGlobalBienes,
  formatNroInvitacionCabecera,
  bienesPdfColumnBlock,
} from '../shared/validacionAnexo07aBienesLayout.js';
import { VALIDACION_CONFIG } from '../src/utils/validacionFormatosConfig.js';
import { buildValidationReportData } from '../src/utils/validacionReportData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== Anexo 07-A BIENES — layout PDF ===\n');

ok(/07-A/.test(ANEXO_07A_TITULO_LINE1), '1 — título institucional 07-A');
ok(ANEXO_07A_TITULO_LINE2 === 'BIENES', '1 — subtítulo BIENES');
ok(ANEXO_07A_TITULO_UNA_LINEA.includes('BIENES') && !ANEXO_07A_TITULO_UNA_LINEA.endsWith('\n'), '1 — título una línea incluye BIENES');

ok(CUADRO_INSTITUCIONAL_BIENES.includes('CUADRO DE VERIFICACIÓN'), '2 — cuadro institucional');
ok(CUADRO_INSTITUCIONAL_BIENES.includes('PARA LA ADQUISICIÓN DE PRODUCTOS DE:'), '2 — cierre institucional');
ok(!CUADRO_INSTITUCIONAL_BIENES.includes('ADQUISICIÓN / SERVICIO:'), '3 — sin producto en subtítulo fijo');

const det = {
  id: 100,
  solicitud_codigo: 'SC-2026-001',
  nro_invitacion: 7,
  razon_social: 'PROV SA',
  matriz_v2: {
    tipo: 'BIENES',
    cotizacion_id: 100,
    filas: [
      { item_key: '1', automaticos: { item: 1 }, evaluacion: {} },
      { item_key: '2', automaticos: { item: 2 }, evaluacion: {} },
    ],
  },
  formulario_07a: { fecha: '04/10/2026' },
};
const report = buildValidationReportData(det);
ok(report.cabecera.solicitud_codigo === 'SC-2026-001', '4 — solicitud_codigo en cabecera');
ok(report.cabecera.nro_invitacion === 7, '4 — nro_invitacion en cabecera');

ok(formatNroInvitacionCabecera(null) === '—', '5 — invitación null → —');
ok(buildCabeceraGlobalBienes({ solicitud_codigo: 'X', nro_invitacion: null }).includes('Invitación: —'), '5 — sin inferencia');

const cols = columnasPdfBienes(VALIDACION_CONFIG.BIENES);
ok(cols.length === 19, '19 columnas PDF sin docs');
const layout = computeBienesBlockLayout(cols);
ok(layout.ok, '6 — layout válido');
ok(layout.block1Span === 8, '6 — bloque 1 span por keys (8)');
ok(layout.block2Span === 6, '7 — bloque 2 span (6)');
ok(layout.block3Span === 5, '8 — bloque 3 span (5)');

ok(cols[0].key === 'item' && cols[7].key === 'cant_cotizaciones', '6 — bloque 1 item → cant_cotizaciones');
ok(cols[8].key === 'razon_social' && cols[13].key === BIENES_BLOCK_2_LAST, '7 — bloque 2 razon_social → obs_specs');
ok(cols[14].key === 'acredita_doc' && cols[18].key === BIENES_BLOCK_3_LAST, '8 — bloque 3 acredita_doc → observaciones');

ok(layout.separatorAfterColumnIndices.join(',') === '7,13', '10 — separadores tras cant_cotizaciones y obs_specs');
ok(BIENES_BLOCK_2_LAST === 'obs_specs', '11 — obs_specs en bloque 2');
ok(BIENES_BLOCK_3_LAST === 'observaciones', '12 — observaciones en bloque 3');

const head = buildGroupedHeadBienes(cols);
ok(head[0][0].content === BIENES_GROUP_TITLES.block1, 'F — DETALLE DEL REQUERIMIENTO');
ok(head[0][1].content === BIENES_GROUP_TITLES.block2, 'I — ESPECIFICACIONES TÉCNICAS RECIBIDAS');
ok(head[0][2].content === BIENES_GROUP_TITLES.block3, 'M — VALIDACIÓN DEL ÁREA USUARIA');
ok(head[0][0].colSpan === 8 && head[0][1].colSpan === 6 && head[0][2].colSpan === 5, '9 — spans en grouped head');

ok(formatFechaCalendarioLima('2026-10-05T03:00:00.000Z') === '04/10/2026', '13 — fecha Lima 04/10 desde UTC');
ok(formatFechaCalendarioLima('2026-10-05T04:04:55.000Z') === '04/10/2026', '13b — 04:04:55Z => 04/10 Lima');
ok(formatFechaCalendarioLima('2026-10-05T05:04:55.000Z') === '05/10/2026', '13c — 05:04:55Z => 05/10 Lima');
ok(formatFechaCalendarioLima('04/10/2026') === '04/10/2026', '13d — calendario explícito preservado');
ok(
  resolveFechaValidacionParaPdf({ fecha: '05/10/2026', fecha_instant: '2026-10-05T04:04:55.000Z' }) === '04/10/2026',
  '13e — PDF prioriza fecha_instant sobre DD/MM legacy',
);
const stamp = stampFechaValidacionCalendarioLima(new Date('2026-10-05T04:04:55.000Z'));
ok(stamp.fecha === '04/10/2026' && stamp.fecha_instant.endsWith('Z'), '13f — stamp coherente');

ok(bienesPdfColumnBlock(layout, 8) === 2 && bienesPdfColumnBlock(layout, 13) === 2, 'bloque 2 verde: razon_social..obs_specs');
ok(bienesPdfColumnBlock(layout, 7) === 1 && bienesPdfColumnBlock(layout, 14) === 3, 'bloques 1 y 3 límites');

ok(report.matriz_v2.filas.length === 2, '14 — varias filas conservadas');
ok(report.matriz_v2.cotizacion_id === 100, '15 — ancla cotización única');

const pdfSrc = readFileSync(path.join(__dirname, '../src/utils/validacionFormatosPdf.js'), 'utf8');
ok(/paintBienesCabeceraInstitucional/.test(pdfSrc) && /ANEXO_07A_TITULO_UNA_LINEA/.test(pdfSrc), 'centrado BIENES título una línea');
ok(/bienesPdfColumnBlock/.test(pdfSrc), 'colores por bloque keys');
ok(!/DATOS DEL ÍTEM \/ COTIZACIÓN/.test(pdfSrc), 'sin título antiguo 2 bloques');
ok(/didDrawCell/.test(pdfSrc) && /separatorCols/.test(pdfSrc), '10 — hooks separador');
ok(!/expediente:\s*true/.test(pdfSrc), '16 — no expediente:true en PDF');

ok(/if \(tipoKey === TIPO_VALIDACION\.SERVICIOS\)/.test(pdfSrc), '17 — rama 07-B Servicios presente');
ok(/DETALLE COTIZACIONES RECIBIDAS/.test(pdfSrc), '17 — 07-B conserva DETALLE COTIZACIONES RECIBIDAS');
ok(/PRESTACIÓN DE SERVICIO DE:/.test(pdfSrc), '17 — subtítulo Servicios sin cambio');

console.log('\n✅ Anexo 07-A layout OK\n');

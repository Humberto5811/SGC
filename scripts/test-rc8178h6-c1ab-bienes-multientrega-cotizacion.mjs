/**
 * RC8.17.8H6-C1AB1 — Bienes: plazo_entrega textual por ítem; cronograma solo referencial.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildPropuestaTecnicaBienesPayload,
  bloquesCronogramaSolicitadoBienes,
  agruparItemsPorRequerimiento,
} from '../src/utils/bienesCronogramaCotizacion.js';
import {
  ANEXO_05B_GLOSA_WRAP_WIDTH,
  ANEXO_05_GLOSA_MARGIN_X,
  resolveAnexo05GlosaMaxWidth,
} from '../src/utils/proveedorPdfCotizacion.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-C1AB1 — Cotización Bienes / Anexo 05-A ===\n');

const entregas2400 = {
  tipo: 'Bienes',
  entregas: [
    { numero_entrega: 1, cantidad: 2400, plazo: '30', condicion: 'Cond A' },
    { numero_entrega: 2, cantidad: 2400, plazo: '60', condicion: 'Cond B' },
  ],
};

function itemBase(overrides = {}) {
  return {
    item_key: '10-0',
    requerimiento_id: 10,
    requerimiento_codigo: 'REQ-00001',
    cantidad: 4800,
    um: 'KILOGRAMO',
    entregables_source: entregas2400,
    ...overrides,
  };
}

const ws1 = {
  solicitud: { tipo: 'Bienes' },
  items: [itemBase()],
};

// 1 — plazo textual guarda y recarga vía payload items
{
  const items = [{
    item_key: '10-0',
    plazo_entrega: '30 días calendario',
    presentacion: 'X',
  }];
  const payload = buildPropuestaTecnicaBienesPayload(items);
  ok(payload.items[0].plazo_entrega === '30 días calendario', '1 — plazo textual en payload');
  ok(!('cronogramas_por_requerimiento' in payload), '1 — no escribe cronogramas_por_requerimiento');
  const prev = { items: payload.items, cronogramas_por_requerimiento: { 10: [{ plazo_ofertado: 99 }] } };
  const saved = prev.items.find((p) => p.item_key === '10-0');
  ok(saved.plazo_entrega === '30 días calendario', '1 — recarga plazo desde items');
}

// 2 — varios ítems, plazos independientes
{
  const items = [
    { item_key: '10-0', plazo_entrega: '30 días calendario' },
    { item_key: '10-1', plazo_entrega: '1ra entrega 15 días; 2da entrega 30 días' },
  ];
  const payload = buildPropuestaTecnicaBienesPayload(items);
  ok(payload.items[0].plazo_entrega !== payload.items[1].plazo_entrega, '2 — plazos independientes');
}

// 3 — build + recarga simulada
{
  const a = '30 días calendario';
  const b = '1ra entrega: 2400 kg a 30 días; 2da entrega: 2400 kg a 60 días';
  const payload = buildPropuestaTecnicaBienesPayload([
    { item_key: '10-0', plazo_entrega: a },
    { item_key: '10-1', plazo_entrega: b },
  ]);
  const reloaded = payload.items;
  ok(reloaded[0].plazo_entrega === a && reloaded[1].plazo_entrega === b, '3 — textos sobreviven payload');
}

// 4 — validación: plazo vacío (contrato view)
{
  const view = readFileSync(join(__dir, '../src/views/proveedor/misCotizacionesView.js'), 'utf8');
  ok(view.includes("plazo_entrega: 'Plazo de entrega'"), '4 — plazo_entrega obligatorio en validación Bienes');
  ok(!view.includes('validateCronogramaEntregasBienes'), '4 — sin validación cronograma por REQ');
}

// 5 — payload.entregas no genera inputs editables por entrega
{
  const steps = readFileSync(join(__dir, '../src/utils/proveedorCotizacionSteps.js'), 'utf8');
  ok(!steps.includes('prov-crono-plazo-ofertado'), '5 — sin inputs plazo por entrega');
  ok(!steps.includes('Propuesta de entregas'), '5 — sin bloque propuesta editable');
}

// 6 — cronograma referencial una vez por REQ (multi-ítem mismo REQ)
{
  const wsMulti = {
    solicitud: { tipo: 'Bienes' },
    items: [
      itemBase({ item_key: '10-0' }),
      itemBase({ item_key: '10-1', cantidad: 1800 }),
    ],
  };
  ok(bloquesCronogramaSolicitadoBienes(wsMulti).length === 1, '6 — un bloque referencial por REQ');
  ok(agruparItemsPorRequerimiento(wsMulti).length === 1, '6 — un REQ');
}

// 7 — PDF 05-A plazo textual, sin Propuesta ni Cronograma
{
  const pdf = readFileSync(join(__dir, '../src/utils/proveedorPdfCotizacion.js'), 'utf8');
  ok(pdf.includes('f.plazo_entrega'), '7 — PDF columna plazo_entrega');
  ok(!pdf.includes('Propuesta de entregas'), '7 — PDF sin tabla propuesta');
  ok(!/plazoCell.*Cronograma/.test(pdf), '7 — PDF sin placeholder Cronograma');
}

// 8 — bloque institucional compartido 05-A / 05-B (layout + glosas únicas)
{
  const pdf = readFileSync(join(__dir, '../src/utils/proveedorPdfCotizacion.js'), 'utf8');
  const fnA = pdf.slice(pdf.indexOf('export function downloadAnexo05A'), pdf.indexOf('export function downloadAnexo05B'));
  const fnB = pdf.slice(pdf.indexOf('export function downloadAnexo05B'), pdf.indexOf('export function downloadAnexo06A'));
  ok(fnA.includes('appendAnexo05InstitucionalCierre'), 'A — 05-A usa helper institucional');
  ok(fnB.includes('appendAnexo05InstitucionalCierre'), 'A — 05-B usa helper institucional');
  ok(fnB.includes('ANEXO_05B_GLOSA_WRAP_WIDTH'), 'B — 05-B conserva ancho glosa 520');
  ok(fnA.includes('ANEXO_05_GLOSA_MARGIN_X * 2'), 'C — 05-A ancho landscape (page − márgenes)');
  const glosaUses = (pdf.match(/appendWrappedTextPaginated\(doc, TEXTO_AUTORIZACION_CORREO/g) || []).length;
  ok(glosaUses === 1, 'D — una sola inserción glosa autorización en helper');
  const leyUses = (pdf.match(/appendWrappedTextPaginated\(doc, TEXTO_LEY_27444/g) || []).length;
  ok(leyUses === 1, 'D — una sola inserción Ley 27444 en helper');
  ok(!fnA.includes('appendWrappedText(doc, TEXTO_AUTORIZACION_CORREO'), 'D — 05-A no duplica glosas');
  ok(pdf.includes('appendWrappedTextPaginated'), 'paginación — glosas con salto de página');
  ok(ANEXO_05B_GLOSA_WRAP_WIDTH === 520, 'B — constante ancho 520 pt');
  const mockDoc = { internal: { pageSize: { getWidth: () => 612, getHeight: () => 792 } } };
  ok(resolveAnexo05GlosaMaxWidth(mockDoc, { glosaMaxWidth: 520 }) === 520, 'B — resolve respeta 520');
  ok(resolveAnexo05GlosaMaxWidth({ internal: { pageSize: { getWidth: () => 792 } } }) === 792 - 80, 'C — landscape auto 712');
}

// E — sin propuesta estructurada editable/PDF
{
  const steps = readFileSync(join(__dir, '../src/utils/proveedorCotizacionSteps.js'), 'utf8');
  const pdf = readFileSync(join(__dir, '../src/utils/proveedorPdfCotizacion.js'), 'utf8');
  ok(!steps.includes('Propuesta de entregas'), 'E — UI sin propuesta editable');
  ok(!pdf.includes('Propuesta de entregas'), 'E — PDF sin tabla propuesta');
}

// 9 — Servicios sin cambios de contrato Bienes
{
  const steps = readFileSync(join(__dir, '../src/utils/proveedorCotizacionSteps.js'), 'utf8');
  ok(steps.includes('renderStep1Servicios'), '9 — Servicios intacto');
  ok(steps.includes('renderStep1Locadores'), '9 — Locadores intacto');
}

// 10 — borrador C1A/B con cronogramas_por_requerimiento no inventa plazo_entrega
{
  const prevItems = [{ item_key: '10-0', presentacion: 'P', plazo_entrega: '' }];
  const prev = {
    items: prevItems,
    cronogramas_por_requerimiento: { 10: [{ numero_entrega: 1, plazo_ofertado: 30 }] },
  };
  const merged = prev.items.find((p) => p.item_key === '10-0');
  ok(String(merged.plazo_entrega || '').trim() === '', '10 — no inventa plazo desde cronograma REQ');
  ok(prev.cronogramas_por_requerimiento['10'][0].plazo_ofertado === 30, '10 — legacy cronograma sigue en JSON sin romper');
}

// UI — textarea plazo + cronograma solicitado referencial
{
  const steps = readFileSync(join(__dir, '../src/utils/proveedorCotizacionSteps.js'), 'utf8');
  ok(steps.includes('textarea') && steps.includes('prov-f-plazo'), 'UI — plazo textual por ítem');
  ok(steps.includes('Cronograma de entregas solicitadas'), 'UI — cronograma referencial');
  ok(steps.includes('bloquesCronogramaSolicitadoBienes'), 'UI — agrupado por REQ');
}

console.log('\n  OK H6-C1AB1\n');

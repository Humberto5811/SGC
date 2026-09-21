/**
 * RC8.17.8H6-C1AB1/C1AB2 — Bienes: plazo_entrega por ítem; Anexo 05-A/B.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildPropuestaTecnicaBienesPayload } from '../src/utils/bienesCronogramaCotizacion.js';
import {
  ANEXO_05B_GLOSA_WRAP_WIDTH,
  resolveAnexo05GlosaMaxWidth,
  formatFechaCartaLima,
} from '../src/utils/proveedorPdfCotizacion.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-C1AB1/C1AB2 — Cotización Bienes / Anexo 05 ===\n');

// 1 — UI sin cronograma referencial
{
  const steps = readFileSync(join(__dir, '../src/utils/proveedorCotizacionSteps.js'), 'utf8');
  ok(!steps.includes('Cronograma de entregas solicitadas'), '1 — Bienes sin cronograma referencial UI');
  ok(!steps.includes('bienesCronogramaCotizacion'), '1 — steps sin import cronograma referencial');
}

// 2 — sin inputs por entrega
{
  const steps = readFileSync(join(__dir, '../src/utils/proveedorCotizacionSteps.js'), 'utf8');
  ok(!steps.includes('prov-crono-plazo-ofertado'), '2 — sin inputs editables por entrega');
  ok(!steps.includes('Propuesta de entregas'), '2 — sin propuesta estructurada');
}

// 3 — plazo_entrega textual
{
  const payload = buildPropuestaTecnicaBienesPayload([
    { item_key: '10-0', plazo_entrega: '30 días calendario' },
    { item_key: '10-1', plazo_entrega: 'Entrega única a 45 días calendario' },
  ]);
  ok(payload.items[0].plazo_entrega === '30 días calendario', '3 — plazo item A');
  ok(!('cronogramas_por_requerimiento' in payload), '3 — sin cronogramas_por_requerimiento');
  ok(stepsIncludesTextarea(), '3 — textarea plazo por ítem');
}

function stepsIncludesTextarea() {
  const steps = readFileSync(join(__dir, '../src/utils/proveedorCotizacionSteps.js'), 'utf8');
  return steps.includes('textarea') && steps.includes('prov-f-plazo');
}

// 4–6 — fecha Lima en 05-A y 05-B (helper compartido)
{
  const pdf = readFileSync(join(__dir, '../src/utils/proveedorPdfCotizacion.js'), 'utf8');
  const fnA = pdf.slice(pdf.indexOf('export function downloadAnexo05A'), pdf.indexOf('export function downloadAnexo05B'));
  const fnB = pdf.slice(pdf.indexOf('export function downloadAnexo05B'), pdf.indexOf('export function downloadAnexo06A'));
  ok(fnA.includes('renderAnexo05FechaLimaDerecha'), '4 — 05-A fecha helper');
  ok(fnB.includes('renderAnexo05FechaLimaDerecha'), '5 — 05-B fecha helper');
  ok(pdf.includes('formatFechaCartaLima'), '6 — fecha vía formatFechaCartaLima / TZ_Lima');
  ok(/^Lima, \d+ de .+ de \d{4}$/.test(formatFechaCartaLima(new Date('2026-09-21T12:00:00Z'))), '6 — formato institucional Lima');
}

// 7–8 — firma ampliada compartida
{
  const pdf = readFileSync(join(__dir, '../src/utils/proveedorPdfCotizacion.js'), 'utf8');
  ok(pdf.includes('appendAnexo05FirmaRepresentanteBlock'), '7 — bloque firma dedicado');
  ok(pdf.includes('(Nombre, firma y sello)'), '8 — leyenda firma y sello');
  const cierre = pdf.slice(pdf.indexOf('export function appendAnexo05InstitucionalCierre'), pdf.indexOf('export function downloadAnexo05A'));
  ok(cierre.includes('appendAnexo05FirmaRepresentanteBlock'), '7 — cierre compartido incluye firma');
  ok(!cierre.includes("['Firma del Representante legal:'"), '7 — sin fila compacta en datos');
}

// 9 — glosas compartidas paginadas
{
  const pdf = readFileSync(join(__dir, '../src/utils/proveedorPdfCotizacion.js'), 'utf8');
  ok((pdf.match(/appendWrappedTextPaginated\(doc, TEXTO_AUTORIZACION_CORREO/g) || []).length === 1, '9 — glosa autorización única');
  ok((pdf.match(/appendWrappedTextPaginated\(doc, TEXTO_LEY_27444/g) || []).length === 1, '9 — Ley 27444 única');
  ok(pdf.includes('appendWrappedTextPaginated'), '9 — paginación glosas');
}

// 10 — 05-B ancho 520
{
  ok(ANEXO_05B_GLOSA_WRAP_WIDTH === 520, '10 — constante 520');
  const mockDoc = { internal: { pageSize: { getWidth: () => 612 } } };
  ok(resolveAnexo05GlosaMaxWidth(mockDoc, { glosaMaxWidth: 520 }) === 520, '10 — resolve 520');
}

// 11 — Servicios/Locadores intactos
{
  const steps = readFileSync(join(__dir, '../src/utils/proveedorCotizacionSteps.js'), 'utf8');
  ok(steps.includes('renderStep1Servicios'), '11 — Servicios');
  ok(steps.includes('renderStep1Locadores'), '11 — Locadores');
}

// PDF plazo textual
{
  const pdf = readFileSync(join(__dir, '../src/utils/proveedorPdfCotizacion.js'), 'utf8');
  ok(pdf.includes('f.plazo_entrega'), 'PDF — columna plazo_entrega');
  ok(!pdf.includes('Propuesta de entregas'), 'PDF — sin propuesta estructurada');
}

console.log('\n  OK H6-C1AB1/C1AB2\n');

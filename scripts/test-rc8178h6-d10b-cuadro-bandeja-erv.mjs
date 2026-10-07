/**
 * RC8.17.8H6-C3-D10-B — Bandeja Cuadro Comparativo con ERV canónico.
 * Prueba estática: sin PostgreSQL, sin migraciones, sin mutación de datos.
 *
 *   node scripts/test-rc8178h6-d10b-cuadro-bandeja-erv.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-C3-D10-B — Bandeja Cuadro ERV (estático) ===\n');

const viewSrc = fs.readFileSync(
  path.join(__dirname, '../src/views/contratacion/cuadroComparativoView.js'),
  'utf8',
);
const bandejaSrc = fs.readFileSync(
  path.join(__dirname, '../server/lib/cuadroComparativo.js'),
  'utf8',
);

// A — columnas en thead
const expectedCols = [
  'Solicitud',
  'Invitación',
  'Requerimiento',
  'Centro',
  'Cotizaciones',
  'Etapa',
  'Estado',
  'Responsable',
  'Ver',
];
for (const col of expectedCols) {
  ok(new RegExp(`<th[^>]*>${col}`).test(viewSrc), `A — columna thead «${col}»`);
}

// B — helpers canónicos ERV (no badge cuadro local en fila bandeja)
ok(/renderBandejaCanonicoEtapaCell\(c\)/.test(viewSrc), 'B — Etapa vía renderBandejaCanonicoEtapaCell');
ok(/renderBandejaCanonicoEstadoCell\(c\)/.test(viewSrc), 'B — Estado vía renderBandejaCanonicoEstadoCell');
ok(/renderBandejaCanonicoResponsableCell\(c\)/.test(viewSrc), 'B — Responsable vía renderBandejaCanonicoResponsableCell');
ok(!/buildCuadroRowHtml[\s\S]*renderBadgeEstadoCuadroHtml/.test(viewSrc),
  'B — buildCuadroRowHtml sin renderBadgeEstadoCuadroHtml');

// C — Invitación columna independiente (no solo subtítulo bajo solicitud)
ok(/cc-col-inv/.test(viewSrc), 'C — clase columna Invitación');
ok(/buildCuadroRowHtml[\s\S]*cc-col-solicitud[\s\S]*cc-col-inv/.test(viewSrc),
  'C — celda Invitación separada de Solicitud');
ok(/cc-col-inv text-center[\s\S]*invLabel|invitacion_label[\s\S]*cc-col-inv/.test(viewSrc),
  'C — invitacion_label en columna Invitación');

// D/E — backend contador contextual D10-A (lectura de fuente, sin ejecutar API)
ok(/total_cotizaciones_ronda/.test(bandejaSrc), 'D — total_cotizaciones_ronda en API bandeja');
ok(/SQL_FILTER_ELEGIBLE_CUADRO_RONDA/.test(bandejaSrc), 'D — filtro elegible APTO→CUADRO en SQL bandeja');
ok(/GROUP BY sc\.id[\s\S]*nro_invitacion/.test(bandejaSrc), 'E — agrupación por solicitud + nro_invitacion');
ok(/enrichEstadoResponsableForBandeja\(result/.test(bandejaSrc), 'D — enrich ERV en listarCuadroComparativoExpedientes');

// Documentación multi-REQ
ok(/Multi-REQ|primer REQ|requerimiento_id/.test(viewSrc), 'Multi-REQ documentado en vista');

console.log('\n✅ RC8.17.8H6-C3-D10-B tests OK (estático, sin BD)\n');

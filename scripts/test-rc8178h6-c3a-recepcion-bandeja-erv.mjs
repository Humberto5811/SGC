/**
 * RC8.17.8H6-C3-A — Bandeja Recepción: columnas Etapa | Estado | Responsable (estático).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/views/contratacion/recepcionCotizacionesView.js'), 'utf8');

assert.match(src, /renderBandejaCanonicoEtapaCell/);
assert.match(src, /renderBandejaCanonicoEstadoCell/);
assert.match(src, /renderBandejaCanonicoResponsableCell/);
assert.match(src, /<th>Etapa<\/th>\s*\n\s*<th>Estado<\/th>\s*\n\s*<th>Responsable<\/th>/);
assert.match(src, /renderErvCanonicoHtml/);
assert.match(src, /getEtapaDisplayLabel/);
assert.match(src, /labelEstadoCotizacion\(c\)/);
assert.doesNotMatch(src, /badgeEstadoBandejaRecepcion/);

console.log('OK test-rc8178h6-c3a-recepcion-bandeja-erv');

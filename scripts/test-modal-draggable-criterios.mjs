/**
 * Drag global de modales + criterios procedimiento/metodología (08-A / 08-B).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  CRITERIOS_SELECCION,
  CRITERIOS_LABEL,
} from '../server/lib/cuadroComparativoAdjudicacion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== Modal drag + criterios metodología ===\n');

const dragSrc = fs.readFileSync(path.join(root, 'src/utils/modalDraggable.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const modalSrc = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoModal.js'), 'utf8');

assert(/export function makeModalDraggable/.test(dragSrc), 'export makeModalDraggable');
assert(/export function initSgcModalDragging/.test(dragSrc), 'export initSgcModalDragging');
assert(/shown\.bs\.modal/.test(dragSrc), 'hook shown.bs.modal');
assert(/cursor.*grab|grabbing/.test(dragSrc), 'cursores grab/grabbing');
assert(/btn-close/.test(dragSrc), 'ignora btn-close');
assert(/MIN_VISIBLE/.test(dragSrc), 'clamp con header visible');
assert(/initSgcModalDragging/.test(appSrc), 'app.js inicializa drag global');

assert(CRITERIOS_SELECCION[0] === 'VALOR_POR_DINERO', 'primer criterio VALOR_POR_DINERO');
assert(CRITERIOS_SELECCION[1] === 'MENOR_PRECIO_VALIDO', 'segundo MENOR_PRECIO_VALIDO');
assert(!CRITERIOS_SELECCION.includes('DISTINTO_MENOR_PRECIO'), 'sin DISTINTO_MENOR_PRECIO en selección');
assert(CRITERIOS_LABEL.VALOR_POR_DINERO === 'Valor por dinero', 'label Valor por dinero');

assert(/VALOR_POR_DINERO/.test(modalSrc) && /Valor por dinero/.test(modalSrc), 'UI tiene Valor por dinero');
assert(!/Selección distinta al menor precio/.test(modalSrc), 'UI sin Selección distinta al menor precio');
assert(/MENOR_PRECIO_VALIDO/.test(modalSrc), 'UI mantiene Menor precio válido');

const failed = tests.filter((t) => !t.ok);
console.log(`\nResultado: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('PASS\n');

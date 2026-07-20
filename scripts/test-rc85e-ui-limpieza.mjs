/**
 * RC8.5-E — Limpieza UI expediente (sin duplicados PDF / sin menú contextual).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.5-E Limpieza UI ===\n');

const tabs = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoExpedienteTabs.js'), 'utf8');
assert(!/ccCoordVerPdf|ccCoordDescargarPdf|ccCoordVerFirmadoPdf/.test(tabs),
  'pestaña Cuadro sin botones PDF duplicados');
assert(/Documentos del cuadro|barra de acciones superior/.test(tabs), 'estado PDF solo lectura en pestaña');
assert(/table-responsive/.test(tabs), 'tablas responsive');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordModal.js'), 'utf8');
assert(/ccExpActionBar/.test(modal), 'barra única de acciones');
assert(/closeBandejaDropdowns/.test(modal), 'cierra menú bandeja');
assert(/dropdown-menu/.test(modal) && /\.remove\(\)/.test(modal), 'elimina dropdowns en expediente');
assert(!/ccCoordVerPdf/.test(modal), 'modal sin bind de PDF duplicado en body');

const coord = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordinador.js'), 'utf8');
const dec = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoDec.js'), 'utf8');
assert(/ccBtnCoordDescargar/.test(coord) && /ccBtnDecDescargarFirmado/.test(dec), 'acciones Coord/DEC en barra');
assert(/Ver Firmado/.test(coord) && /Ver Firmado/.test(dec), 'labels consistentes Ver Firmado');

const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO/.test(wf), 'Workflow intacto');

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.5-E: PASS\n');

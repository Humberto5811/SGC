/**
 * RC8.5-C — Expediente documental integral (pestañas + barra acciones + sin menú bandeja).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EXPEDIENTE_TABS } from '../src/utils/cuadroComparativoExpedienteTabs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.5-C Expediente integral ===\n');

const expected = [
  'Resumen', 'Requerimientos', 'Pedidos SIGAMEF', 'Solicitud de Cotización',
  'Cotizaciones presentadas por proveedores', 'Validaciones', 'Cuadro Comparativo',
  'Observaciones', 'Trazabilidad',
];
assert(EXPEDIENTE_TABS.length === 9, '9 pestañas (sin Documentos redundante)');
expected.forEach((lab) => {
  assert(EXPEDIENTE_TABS.some((t) => t.label === lab), `pestaña ${lab}`);
});
assert(!EXPEDIENTE_TABS.some((t) => t.id === 'documentos'), 'sin pestaña Documentos');

const tabsSrc = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoExpedienteTabs.js'), 'utf8');
assert(/renderExpedienteDocsTable|sgc-adj-ver/.test(tabsSrc), 'reutiliza visor/tabla documental');
assert(/historialHtml/.test(tabsSrc), 'reutiliza historialHtml');
assert(/renderMatrizBienesHtml/.test(tabsSrc) && /editable:\s*false/.test(tabsSrc), 'matriz RO');
assert(/renderPanelSegundaFuente/.test(tabsSrc) && /editable:\s*false/.test(tabsSrc), 'segunda fuente RO');
assert(/renderTimeline/.test(tabsSrc), 'reutiliza timeline');
assert(/solo lectura|Solo lectura/.test(tabsSrc), 'mensaje solo lectura');

const modalSrc = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordModal.js'), 'utf8');
assert(/ccExpActionBar/.test(modalSrc), 'barra de acciones propia');
assert(/closeBandejaDropdowns/.test(modalSrc), 'cierra dropdown bandeja');
assert(/showValidarModal/.test(modalSrc), 'reutiliza modal Validaciones RO');
assert(/programacionService/.test(modalSrc), 'carga pedidos SIGAMEF');
assert(/requerimientosService/.test(modalSrc), 'carga requerimientos');
assert(!/renderActionMenuCell/.test(modalSrc), 'sin menú contextual de fila en detalle');

const viewSrc = fs.readFileSync(path.join(root, 'src/views/contratacion/cuadroComparativoView.js'), 'utf8');
assert(/closeBandejaDropdowns/.test(viewSrc), 'view cierra dropdowns al abrir');

const menuSrc = fs.readFileSync(path.join(root, 'src/services/menuService.js'), 'utf8');
assert(/dec\/actos/.test(menuSrc) && /dec\/cuadro/.test(menuSrc), 'menús Coord/Cuadro intactos');

const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO/.test(wf), 'Workflow intacto');

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.5-C: PASS\n');

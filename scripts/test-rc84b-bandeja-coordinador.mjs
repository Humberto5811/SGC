/**
 * RC8.4B — Bandeja operativa Coordinador CM (columnas, modal expediente, acciones).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BANDEJA_ESTADOS_POR_ROL, resolveRolRevision } from '../server/lib/cuadroComparativoRevision.js';
import { filtrarBandejaPorRolRevision } from '../server/lib/cuadroComparativo.js';
import { cuadroComparativoMenuItems } from '../src/utils/cuadroComparativoUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.4B Bandeja Coordinador CM ===\n');

assert(BANDEJA_ESTADOS_POR_ROL.COORDINADOR_CM.includes('PENDIENTE_COORDINADOR'), 'Coord ve PENDIENTE_COORDINADOR');
assert(BANDEJA_ESTADOS_POR_ROL.COORDINADOR_CM.includes('FIRMADO_COORDINADOR'), 'Coord ve FIRMADO_COORDINADOR');
assert(!BANDEJA_ESTADOS_POR_ROL.COORDINADOR_CM.includes('CUADRO_BORRADOR'), 'Coord no ve borradores');

const sample = [
  { solicitud_id: 1, estado_cuadro: 'PENDIENTE_COORDINADOR' },
  { solicitud_id: 2, estado_cuadro: 'CUADRO_BORRADOR' },
  { solicitud_id: 3, estado_cuadro: 'FIRMADO_COORDINADOR' },
  { solicitud_id: 4, estado_cuadro: 'PENDIENTE_DEC' },
];
const bCoord = filtrarBandejaPorRolRevision(sample, { cargo: 'Coordinador CM' });
assert(bCoord.rol === 'COORDINADOR_CM', 'rol COORDINADOR_CM');
assert(bCoord.data.length === 2, 'solo 2 expedientes para Coordinador');
assert(bCoord.data.every((x) => ['PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR'].includes(x.estado_cuadro)),
  'estados filtrados CM');

assert(resolveRolRevision({ cargo: 'Coordinación CM' }) === 'COORDINADOR_CM', 'resolve Coordinación CM');

const menu = cuadroComparativoMenuItems(
  { estado_cuadro: 'PENDIENTE_COORDINADOR', cuadro_id: 10 },
  { rol: 'COORDINADOR_CM' },
);
assert(menu.some((m) => m.act === 'abrirExpedienteCoord'), 'acción Abrir expediente');
assert(menu.some((m) => m.act === 'descargarCuadro'), 'acción Descargar Cuadro');
assert(menu.some((m) => m.act === 'trazabilidadCuadro'), 'acción Trazabilidad');
assert(!menu.some((m) => m.act === 'elaborarCuadro'), 'sin Elaborar para Coordinador');

const viewSrc = fs.readFileSync(path.join(root, 'src/views/contratacion/cuadroComparativoView.js'), 'utf8');
assert(/Proveedor/.test(viewSrc) && /abrirExpedienteCoord/.test(viewSrc), 'bandeja columnas + handler Coord');
assert(/showExpedienteCoordinadorModal/.test(viewSrc), 'import modal expediente Coord');

const modalSrc = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordModal.js'), 'utf8');
assert(/cuadroComparativoExpedienteTabs|renderTabNav|Pedidos SIGAMEF/.test(modalSrc), 'pestañas expediente integral');
assert(/renderPanelCoordinador/.test(modalSrc), 'panel acciones Coordinador');
assert(/CONFORMIDAD_COORDINADOR/.test(modalSrc) && /DERIVAR_DEC/.test(modalSrc) && /OBSERVAR_COORDINADOR/.test(modalSrc),
  'acciones conformidad / observar / derivar DEC');
assert(/pdf-validacion|cc-exp-pdf-val|Validaciones/.test(modalSrc), 'validación AU en expediente');
assert(/Trazabilidad|trazabilidad/.test(modalSrc), 'trazabilidad en modal');
assert(/closeBandejaDropdowns/.test(modalSrc), 'cierra menú bandeja al abrir');

const coordSrc = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordinador.js'), 'utf8');
assert(/Descargar Cuadro|Descargar/.test(coordSrc), 'label Descargar');
assert(/Adjuntar Cuadro Firmado|Adjuntar Firmado/.test(coordSrc), 'label Adjuntar Firmado');
assert(/Dar Conformidad/.test(coordSrc), 'label Dar Conformidad');
assert(/Derivar a DEC/.test(coordSrc), 'label Derivar a DEC');

const serverSrc = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
assert(/proveedores_nombres/.test(serverSrc) && /proveedor_display/.test(serverSrc), 'bandeja expone proveedor');

const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO/.test(wf), 'Workflow Transitions intacto');

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) process.exit(1);

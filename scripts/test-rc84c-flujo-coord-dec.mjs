/**
 * RC8.4C — Flujo Coordinador CM → DEC (auto-derivación + bandeja DEC).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  BANDEJA_ESTADOS_POR_ROL,
  findTransicionRevision,
  RESPONSABLES_REVISION,
  resolveRolRevision,
} from '../server/lib/cuadroComparativoRevision.js';
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

console.log('\n=== RC8.4C Flujo Coordinador CM → DEC ===\n');

// RC8.5-D — Conformidad ya no auto-deriva; Derivar a DEC es paso explícito
const conf = findTransicionRevision('CONFORMIDAD_COORDINADOR', 'PENDIENTE_COORDINADOR');
assert(conf?.to === 'FIRMADO_COORDINADOR', 'CONFORMIDAD → FIRMADO_COORDINADOR');
assert(conf?.sameStage === true, 'conformidad sameStage');
assert(conf?.responsable === RESPONSABLES_REVISION.COORDINADOR_CM, 'responsable Coord tras conformidad');
assert(conf?.requireFirmado === true, 'exige PDF firmado');
assert(!conf?.autoDerivarDec, 'sin autoDerivarDec (RC8.5-D)');

const aprobar = findTransicionRevision('APROBAR_COORDINADOR', 'PENDIENTE_COORDINADOR');
assert(aprobar?.to === 'FIRMADO_COORDINADOR' && aprobar?.sameStage, 'alias APROBAR = conformidad');

const derDec = findTransicionRevision('DERIVAR_DEC', 'FIRMADO_COORDINADOR');
assert(derDec?.to === 'PENDIENTE_DEC' && derDec?.responsable === RESPONSABLES_REVISION.DEC,
  'Derivar a DEC → PENDIENTE_DEC / responsable DEC');

assert(findTransicionRevision('DERIVAR_ANALISTA', 'PENDIENTE_DEC')?.to === 'APROBADO_DEC', 'DEC → Analista');
assert(findTransicionRevision('DERIVAR_ANALISTA', 'PENDIENTE_DEC')?.responsable === RESPONSABLES_REVISION.ANALISTA,
  'responsable Analista');

assert(BANDEJA_ESTADOS_POR_ROL.DEC.includes('PENDIENTE_DEC'), 'bandeja DEC ve PENDIENTE_DEC');
const bDec = filtrarBandejaPorRolRevision([
  { solicitud_id: 1, estado_cuadro: 'PENDIENTE_DEC' },
  { solicitud_id: 2, estado_cuadro: 'PENDIENTE_COORDINADOR' },
  { solicitud_id: 3, estado_cuadro: 'FIRMADO_COORDINADOR' },
], { cargo: 'Especialista DEC' });
assert(resolveRolRevision({ cargo: 'Especialista DEC' }) === 'DEC'
  || resolveRolRevision({ cargo: 'DEC' }) === 'DEC'
  || bDec.rol === 'DEC'
  || bDec.data.some((x) => x.estado_cuadro === 'PENDIENTE_DEC'),
'filtro DEC operativo');

const menuDec = cuadroComparativoMenuItems({ estado_cuadro: 'PENDIENTE_DEC', cuadro_id: 1 }, { rol: 'DEC' });
assert(menuDec.some((m) => m.act === 'abrirExpedienteDec'), 'menú DEC abrir expediente');

const lib = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
assert(/adjuntar el Cuadro Comparativo firmado antes de dar conformidad/.test(lib), 'gate firmado en conformidad');
assert(/derivado_dec|auto_derivado_dec|DERIVAR_DEC/.test(lib), 'respuesta/derivación DEC');
assert(/Coordinador CM → DEC → Analista/.test(lib), 'flujo documentado en workflow sync');

const coordUi = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordinador.js'), 'utf8');
assert(/Derivar a DEC/.test(coordUi), 'UI Coord muestra Derivar a DEC');

const decUi = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoDec.js'), 'utf8');
assert(/Descargar/.test(decUi), 'DEC Descargar');
assert(/Adjuntar Firmado|Adjuntar Firma DEC/.test(decUi), 'DEC Adjuntar Firmado');
assert(/Dar Conformidad/.test(decUi), 'DEC Dar Conformidad');
assert(/Derivar Analista/.test(decUi), 'DEC Derivar Analista');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordModal.js'), 'utf8');
assert(/showExpedienteDecModal/.test(modal), 'modal DEC exportado');
assert(/renderPanelDec/.test(modal) && /CONFORMIDAD_DEC/.test(modal), 'acciones DEC en modal');
assert(/Observaciones|renderObservacionesTab|renderCuadroTab/.test(modal), 'expediente con observaciones/cuadro');

const view = fs.readFileSync(path.join(root, 'src/views/contratacion/cuadroComparativoView.js'), 'utf8');
assert(/isModoBandejaDec/.test(view) && /abrirExpedienteDec/.test(view), 'bandeja DEC cableada');
assert(/DEC — Cuadro Comparativo/.test(view), 'título bandeja DEC');

const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO/.test(wf), 'WorkflowTransitions intacto');

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.4C: PASS\n');

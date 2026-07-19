/**
 * RC8.5 — Revisión Coordinador 8 UIT (solo lectura, conformidad, observar, derivar DEC).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  findTransicionRevision,
  TRANSICIONES_REVISION_CUADRO,
} from '../server/lib/cuadroComparativoRevision.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.5 Coordinador 8 UIT ===\n');

const conf = findTransicionRevision('CONFORMIDAD_COORDINADOR', 'PENDIENTE_COORDINADOR');
assert(!!conf && conf.to === 'FIRMADO_COORDINADOR', 'conformidad → FIRMADO_COORDINADOR');

const der = findTransicionRevision('DERIVAR_DEC', 'FIRMADO_COORDINADOR');
assert(!!der && der.requireConformidad && der.requireFirmado, 'DERIVAR_DEC exige conformidad+firmado');
assert(der.to === 'PENDIENTE_DEC', 'DERIVAR_DEC → PENDIENTE_DEC');

const obs = findTransicionRevision('OBSERVAR_COORDINADOR', 'PENDIENTE_COORDINADOR');
assert(!!obs?.requireObservacionEstructurada, 'observar exige estructura');

const lib = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
assert(/PENDIENTE_COORDINADOR/.test(lib) && /enCoord/.test(lib), 'firma conserva estado coordinador');
assert(/Motivo|descripcionObs|requireObservacionEstructurada/.test(lib), 'valida motivo/descripcion/obs');
assert(/puede_derivar_dec|conformidad_coordinador/.test(lib), 'flags conformidad/derivar DEC');

const ui = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordinador.js'), 'utf8');
assert(/Dar conformidad/.test(ui) && /Derivar al DEC/.test(ui), 'panel acciones coordinador');
assert(/Motivo/.test(ui) && /Descripción/.test(ui) && /Observación/.test(ui), 'modal observar 3 campos');
assert(/solo lectura|Solo lectura/.test(ui), 'mensaje solo lectura');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoModal.js'), 'utf8');
assert(/isModoCoordinador8Uit|bindCoordinadorActions/.test(modal), 'modal cablea modo coordinador');
assert(/ccBtnCoordDerivarDec|CONFORMIDAD_COORDINADOR|DERIVAR_DEC/.test(modal), 'acciones coord en modal');

// No tocar Workflow Engine
const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO.*CCP|CCP/.test(wf), 'Workflow Transitions intacto (salida CCP)');

assert(TRANSICIONES_REVISION_CUADRO.some((t) => t.accion === 'DERIVAR_DEC'), 'catálogo incluye DERIVAR_DEC');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC8.5: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.5: PASS\n');

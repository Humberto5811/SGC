/**
 * RC8.6 — Revisión final del DEC.
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

console.log('\n=== RC8.6 Revisión DEC ===\n');

const conf = findTransicionRevision('CONFORMIDAD_DEC', 'PENDIENTE_DEC');
assert(!!conf && conf.requireFirmado && conf.requireFirmadoDec, 'conformidad exige ambas firmas');
assert(conf.to === 'PENDIENTE_DEC', 'conformidad no cambia etapa documental');

const der = findTransicionRevision('DERIVAR_ANALISTA', 'PENDIENTE_DEC');
assert(!!der && der.to === 'APROBADO_DEC', 'Derivar Analista → APROBADO_DEC');
assert(der.requireConformidadDec && der.requireFirmado && der.requireFirmadoDec, 'derivar exige conformidad+firmas');

const apr = findTransicionRevision('APROBAR_DEC', 'PENDIENTE_DEC');
assert(!!apr && apr.to === 'APROBADO_DEC' && apr.requireConformidadDec, 'APROBAR_DEC alias con gates');

const obs = findTransicionRevision('OBSERVAR_DEC', 'PENDIENTE_DEC');
assert(!!obs && obs.to === 'OBSERVADO_DEC', 'Observar → Analista corrección');
assert(!!obs.requireObservacionDecEstructurada, 'observar DEC exige estructura');

const lib = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
assert(/adjuntarPdfFirmadoDecCuadro/.test(lib), 'adjuntar firma DEC');
assert(/eliminarPdfFirmadoDecCuadro/.test(lib), 'eliminar firma DEC');
assert(/CONFORMIDAD_DEC/.test(lib) && /revision_dec/.test(lib), 'persistencia conformidad DEC');
assert(/Motivo|comentarioObs|requireObservacionDecEstructurada/.test(lib), 'valida motivo/obs/comentario');
assert(/puede_derivar_analista|conformidad_dec/.test(lib), 'flags DEC en mapCuadroRow');

const mig = fs.readFileSync(path.join(root, 'server/migrations/024_cuadro_firma_dec.js'), 'utf8');
assert(/firmado_dec_contenido/.test(mig), 'migración 024 firma DEC');

const ui = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoDec.js'), 'utf8');
assert(/Conforme/.test(ui) && /Derivar al Analista/.test(ui), 'panel acciones DEC');
assert(/Motivo/.test(ui) && /Observación/.test(ui) && /Comentario/.test(ui), 'modal observar 3 campos DEC');
assert(/isModoDec/.test(ui), 'detector modo DEC');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoModal.js'), 'utf8');
assert(/bindDecActions|isModoDec|renderPanelDec/.test(modal), 'modal cablea panel DEC');
assert(/DERIVAR_ANALISTA|CONFORMIDAD_DEC|OBSERVAR_DEC/.test(modal), 'acciones DEC en modal');

const routes = fs.readFileSync(path.join(root, 'server/routes/portal.js'), 'utf8');
assert(/firmado-dec/.test(routes), 'rutas firmado-dec');

// No tocar Workflow Engine
const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO/.test(wf), 'Workflow Transitions intacto');

assert(TRANSICIONES_REVISION_CUADRO.some((t) => t.accion === 'DERIVAR_ANALISTA'), 'catálogo DERIVAR_ANALISTA');
assert(TRANSICIONES_REVISION_CUADRO.some((t) => t.accion === 'CONFORMIDAD_DEC'), 'catálogo CONFORMIDAD_DEC');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC8.6: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.6: PASS\n');

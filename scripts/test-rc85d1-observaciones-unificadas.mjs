/**
 * RC8.5-D1 — Unificación observaciones + depuración Validaciones Detalle.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TRANSICIONES_REVISION_CUADRO } from '../server/lib/cuadroComparativoRevision.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.5-D1 Observaciones unificadas / Validaciones ===\n');

const obsCoord = TRANSICIONES_REVISION_CUADRO.find((t) => t.accion === 'OBSERVAR_COORDINADOR');
const obsDec = TRANSICIONES_REVISION_CUADRO.find((t) => t.accion === 'OBSERVAR_DEC');
assert(obsCoord?.requireMotivoInstitucional === true, 'Coord exige motivo institucional');
assert(obsCoord?.requireObservacionEstructurada === false, 'Coord ya no exige triad Motivo/Desc/Obs');
assert(obsDec?.requireMotivoInstitucional === true, 'DEC exige motivo institucional');
assert(obsDec?.requireObservacionDecEstructurada === false, 'DEC ya no exige Motivo/Obs/Comentario');

const helper = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoObservaciones.js'), 'utf8');
assert(/openModalObservaciones/.test(helper), 'usa openModalObservaciones institucional');
assert(/transitarRevisionCuadro/.test(helper), 'transita revisión CC');
assert(/OBSERVAR_COORDINADOR/.test(helper) && /OBSERVAR_DEC/.test(helper), 'acciones Coord/DEC');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordModal.js'), 'utf8');
assert(/observarCuadroConModalInstitucional/.test(modal), 'expediente usa helper institucional');
assert(!/showObservarCoordinadorModal\(/.test(modal) || /observarCuadroConModalInstitucional/.test(modal),
  'expediente no usa modal CC propio en flujo');
assert(!/showValidarModal/.test(modal), 'sin showValidarModal (Detalle eliminado)');
assert(!/cc-exp-ver-val/.test(modal), 'sin bind Detalle');

const tabs = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoExpedienteTabs.js'), 'utf8');
assert(!/cc-exp-ver-val/.test(tabs) && !/>\s*Detalle\s*</.test(tabs), 'pestaña Validaciones sin botón Detalle');
assert(/cc-exp-pdf-val/.test(tabs), 'pestaña Validaciones conserva PDF');
assert(/historialHtml/.test(tabs), 'Observaciones usa historialHtml');
assert(!/historial del cuadro/.test(tabs), 'sin tabla independiente de obs del cuadro');

const elabor = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoModal.js'), 'utf8');
assert(/observarCuadroConModalInstitucional/.test(elabor), 'elaborar usa helper institucional');

const coordJs = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordinador.js'), 'utf8');
assert(!/ccObsMotivo/.test(coordJs), 'modal Motivo/Desc/Obs eliminado');

const decJs = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoDec.js'), 'utf8');
assert(!/ccDecObsMotivo/.test(decJs), 'modal DEC Motivo/Obs/Comentario eliminado');

const be = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
assert(/registrarObservacionInstitucionalDesdeCuadro/.test(be), 'BE escribe historial institucional');
assert(/emitirObservacion/.test(be), 'BE reutiliza emitirObservacion');
assert(/Motivo requerido/.test(be), 'BE valida Motivo institucional');
assert(!/Observación incompleta\. Obligatorio: Motivo, Descripción/.test(be),
  'BE ya no exige triad Coord');

const inst = fs.readFileSync(path.join(root, 'src/components/modalObservaciones.js'), 'utf8');
assert(/openModalObservaciones/.test(inst) && /showObservacionDirigidaModal/.test(inst),
  'componente institucional intacto');

const failed = tests.filter((t) => !t.ok);
console.log(`\n=== Resultado: ${tests.length - failed.length}/${tests.length} ===\n`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}

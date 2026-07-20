/**
 * RC8.5-D — Flujo revisión Coordinador CM (secuencia + gates + Derivar a DEC).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findTransicionRevision, RESPONSABLES_REVISION } from '../server/lib/cuadroComparativoRevision.js';
import {
  evaluarAccionesCoordinador,
  enRevisionCoordinador,
  getEstadoCuadro,
} from '../src/utils/cuadroComparativoCoordinador.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.5-D Flujo Coordinador CM ===\n');

// Transiciones: Conformidad NO auto-deriva; Derivar sí
const conf = findTransicionRevision('CONFORMIDAD_COORDINADOR', 'PENDIENTE_COORDINADOR');
assert(conf?.to === 'FIRMADO_COORDINADOR', 'CONFORMIDAD → FIRMADO_COORDINADOR (sin auto-derivar)');
assert(conf?.sameStage === true, 'conformidad sameStage');
assert(!conf?.autoDerivarDec, 'sin autoDerivarDec');
assert(conf?.requireFirmado === true, 'conformidad exige firmado');
assert(conf?.responsable === RESPONSABLES_REVISION.COORDINADOR_CM, 'responsable sigue Coord tras conformidad');

const der = findTransicionRevision('DERIVAR_DEC', 'FIRMADO_COORDINADOR');
assert(der?.to === 'PENDIENTE_DEC', 'DERIVAR_DEC → PENDIENTE_DEC');
assert(der?.requireConformidad && der?.requireFirmado, 'Derivar exige conformidad + firmado');
assert(der?.responsable === RESPONSABLES_REVISION.DEC, 'responsable DEC tras derivar');

const obs = findTransicionRevision('OBSERVAR_COORDINADOR', 'PENDIENTE_COORDINADOR');
assert(obs?.to === 'OBSERVADO_COORDINADOR', 'Observar → OBSERVADO_COORDINADOR');
assert(obs?.responsable === RESPONSABLES_REVISION.ANALISTA, 'Observar → responsable Analista');

// Gates UI
assert(getEstadoCuadro({ estado_cuadro: 'PENDIENTE_COORDINADOR' }) === 'PENDIENTE_COORDINADOR',
  'estado_cuadro canónico');
assert(getEstadoCuadro({ estado: 'C.C. en revisión', estado_cuadro: 'PENDIENTE_COORDINADOR' })
  === 'PENDIENTE_COORDINADOR', 'ignora label inválido en estado');
assert(enRevisionCoordinador({ estado: 'PENDIENTE_COORDINADOR' }), 'en revisión Coord');

const g0 = evaluarAccionesCoordinador({
  id: 1,
  estado: 'PENDIENTE_COORDINADOR',
  tiene_pdf: true,
});
assert(g0.puedeDescargar && g0.puedeAdjuntar && !g0.puedeVerFirmado && !g0.puedeConformidad,
  'inicio: Descargar+Adjuntar; sin Ver/Conformidad');
assert(!g0.puedeDerivar && g0.puedeObservar, 'inicio: Derivar off, Observar on');

const g1 = evaluarAccionesCoordinador({
  id: 1,
  estado: 'PENDIENTE_COORDINADOR',
  tiene_pdf: true,
  tiene_pdf_firmado: true,
  firmado_nombre: 'a.pdf',
});
assert(g1.puedeVerFirmado && g1.puedeConformidad && !g1.puedeDerivar,
  'con firmado: Ver+Conformidad; Derivar off');

const g2 = evaluarAccionesCoordinador({
  id: 1,
  estado: 'FIRMADO_COORDINADOR',
  estado_cuadro: 'FIRMADO_COORDINADOR',
  tiene_pdf: true,
  tiene_pdf_firmado: true,
  conformidad_coordinador: true,
  vigente: true,
});
assert(g2.puedeDerivar && !g2.puedeConformidad, 'con conformidad: Derivar on');

const gObs = evaluarAccionesCoordinador({
  id: 1,
  estado: 'FIRMADO_COORDINADOR',
  tiene_pdf_firmado: true,
  conformidad_coordinador: true,
  vigente: true,
  observacion_pendiente: { motivo: 'x' },
});
assert(!gObs.puedeDerivar, 'obs pendientes bloquean Derivar');

const ui = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordinador.js'), 'utf8');
assert(/Derivar a DEC/.test(ui) && /puedeDerivar|faltantesDerivar/.test(ui), 'Derivar a DEC condicionado por gates');
assert(/evaluarAccionesCoordinador/.test(ui), 'gates centralizados');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordModal.js'), 'utf8');
assert(/enRevisionCoordinador/.test(modal), 'modal usa estado de revisión Coord');
assert(!/isModoCoordinadorCm\(currentUser/.test(modal), 'bind no bloquea por rol doble-check');
assert(/DERIVAR_DEC/.test(modal) && /OBSERVAR_COORDINADOR/.test(modal), 'acciones cableadas');

const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO/.test(wf), 'Workflow intacto');

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.5-D: PASS\n');

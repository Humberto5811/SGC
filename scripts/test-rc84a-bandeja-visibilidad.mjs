/**
 * RC8.4A — Bandejas y visibilidad Cuadro Comparativo (Analista no pierde expedientes).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  BANDEJA_ESTADOS_POR_ROL,
  ESTADOS_REVISION_LABEL,
  RESPONSABLES_REVISION,
  resolveRolRevision,
  responsableBandejaPorEstado,
} from '../server/lib/cuadroComparativoRevision.js';
import { filtrarBandejaPorRolRevision } from '../server/lib/cuadroComparativo.js';
import { CUADRO_REVISION_ESTADO_LABELS } from '../src/utils/estadoVisualPresenter.js';
import {
  ESTADOS_CUADRO_LABEL,
  isCuadroEnRevisionExterna,
  cuadroComparativoMenuItems,
} from '../src/utils/cuadroComparativoUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.4A Bandeja / Visibilidad ===\n');

assert(BANDEJA_ESTADOS_POR_ROL.ANALISTA.includes('PENDIENTE_COORDINADOR'), 'Analista ve PENDIENTE_COORDINADOR');
assert(BANDEJA_ESTADOS_POR_ROL.ANALISTA.includes('PENDIENTE_DEC'), 'Analista ve PENDIENTE_DEC');
assert(BANDEJA_ESTADOS_POR_ROL.ANALISTA.includes('FIRMADO_COORDINADOR'), 'Analista ve FIRMADO_COORDINADOR');

const sample = [
  { solicitud_id: 1, estado_cuadro: 'PENDIENTE_COORDINADOR' },
  { solicitud_id: 2, estado_cuadro: 'CUADRO_BORRADOR' },
  { solicitud_id: 3, estado_cuadro: 'PENDIENTE_DEC' },
];
const bAn = filtrarBandejaPorRolRevision(sample, { cargo: 'Especialista Contrataciones' });
assert(bAn.data.length === 3, 'filtrar no oculta expedientes del Analista');
assert(bAn.data.find((x) => x.solicitud_id === 1)?.responsable_actual === 'Coordinador CM'
  || bAn.data.find((x) => x.solicitud_id === 1)?.responsable_revision === 'Coordinador CM',
'responsable Coordinador CM en revisión');

assert(responsableBandejaPorEstado('PENDIENTE_COORDINADOR') === 'Coordinador CM', 'responsableBandeja CM');
assert(RESPONSABLES_REVISION.COORDINADOR_CM === 'Coordinador CM', 'responsable label CM');
assert(resolveRolRevision({ cargo: 'Coordinador CM' }) === 'COORDINADOR_CM', 'resolve Coordinador CM');

assert(ESTADOS_REVISION_LABEL.PENDIENTE_COORDINADOR === 'C.C. en revisión Coordinador CM', 'label revisión CM');
assert(ESTADOS_REVISION_LABEL.OBSERVADO_COORDINADOR === 'Observado por Coordinador CM', 'label observado CM');
assert(ESTADOS_REVISION_LABEL.FIRMADO_COORDINADOR === 'Firmado por Coordinador CM', 'label firmado CM');
assert(ESTADOS_REVISION_LABEL.PENDIENTE_DEC === 'C.C. en revisión DEC', 'label revisión DEC');
assert(ESTADOS_REVISION_LABEL.PENDIENTE_CCP === 'Listo para CCP', 'label listo CCP');

assert(ESTADOS_CUADRO_LABEL.PENDIENTE_COORDINADOR === 'C.C. en Coordinación CM', 'UI label CM');
assert(CUADRO_REVISION_ESTADO_LABELS.PENDIENTE_COORDINADOR === 'C.C. en Coordinación CM', 'buildEstadoVisual label');
assert(CUADRO_REVISION_ESTADO_LABELS.APROBADO_DEC === 'C.C. aprobado', 'buildEstadoVisual aprobado DEC');

assert(isCuadroEnRevisionExterna('PENDIENTE_COORDINADOR'), 'en revisión externa');
const menu = cuadroComparativoMenuItems({ estado_cuadro: 'PENDIENTE_COORDINADOR', en_revision_externa: true });
assert(menu.every((m) => ['verCuadro', 'descargarCuadro', 'trazabilidadCuadro'].includes(m.act)), 'acciones Ver/Descargar/Trazabilidad');
assert(!menu.some((m) => m.act === 'elaborarCuadro'), 'sin Elaborar en revisión');

const revSrc = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativoRevision.js'), 'utf8');
assert(!/Pendiente Coordinador 8 UIT/.test(revSrc), 'sin label 8 UIT en revision');
assert(/Coordinador CM/.test(revSrc), 'usa Coordinador CM');

const uiSrc = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoUtils.js'), 'utf8');
assert(!/8 UIT/.test(uiSrc), 'sin 8 UIT en utils UI');

const viewSrc = fs.readFileSync(path.join(root, 'src/views/contratacion/cuadroComparativoView.js'), 'utf8');
assert(/<th>Estado<\/th>/.test(viewSrc) && /<th>Responsable<\/th>/.test(viewSrc),
  'columnas bandeja Estado/Responsable');
assert(!/Responsable actual/i.test(viewSrc) && !/Estado actual/i.test(viewSrc)
  && !/Estado vigente/i.test(viewSrc) && !/Responsable vigente/i.test(viewSrc),
  'sin labels visibles legacy Estado/Responsable');
assert(/cc-ver-exp/.test(viewSrc) && /openTrazabilidadCuadro/.test(viewSrc) && /descargar/i.test(viewSrc),
  'handlers Ver/Descargar/Trazabilidad');
assert(/verCuadro|descargarCuadro|trazabilidadCuadro/.test(uiSrc),
  'acts Ver/Descargar/Trazabilidad en menu utils');

// No tocar Workflow Engine
const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO/.test(wf), 'Workflow Transitions intacto');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC8.4A: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.4A: PASS\n');

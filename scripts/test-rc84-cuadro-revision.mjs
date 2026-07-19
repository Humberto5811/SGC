/**
 * RC8.4 — Workflow de revisión del Cuadro Comparativo.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ESTADOS_REVISION_CUADRO,
  TRANSICIONES_REVISION_CUADRO,
  findTransicionRevision,
  resolveRolRevision,
  BANDEJA_ESTADOS_POR_ROL,
  assertSalidaCcpOficial,
} from '../server/lib/cuadroComparativoRevision.js';
import { filtrarBandejaPorRolRevision } from '../server/lib/cuadroComparativo.js';
import { TRANSICIONES_POR_ACCION } from '../core/workflowEngine/WorkflowTransitions.js';
import { ETAPAS } from '../core/workflowEngine/WorkflowState.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.4 Revisión Cuadro Comparativo ===\n');

const required = [
  'CUADRO_BORRADOR', 'PENDIENTE_COORDINADOR', 'OBSERVADO_COORDINADOR',
  'FIRMADO_COORDINADOR', 'PENDIENTE_DEC', 'OBSERVADO_DEC',
  'APROBADO_DEC', 'PENDIENTE_CCP', 'DERIVADO_CCP',
];
required.forEach((s) => assert(ESTADOS_REVISION_CUADRO[s] === s, `estado ${s}`));

assert(TRANSICIONES_REVISION_CUADRO.length >= 6, 'catálogo de transiciones revisión');
assert(
  findTransicionRevision('DERIVAR_COORDINADOR', 'CUADRO_BORRADOR')?.to === 'PENDIENTE_COORDINADOR',
  'Analista → Coordinador',
);
assert(
  findTransicionRevision('CONFORMIDAD_COORDINADOR', 'PENDIENTE_COORDINADOR')?.to === 'FIRMADO_COORDINADOR',
  'Coordinador conformidad',
);
assert(
  findTransicionRevision('DERIVAR_DEC', 'FIRMADO_COORDINADOR')?.to === 'PENDIENTE_DEC',
  'Coordinador Derivar → DEC',
);
assert(
  findTransicionRevision('OBSERVAR_COORDINADOR', 'PENDIENTE_COORDINADOR')?.to === 'OBSERVADO_COORDINADOR',
  'Coordinador observa → Analista',
);
assert(
  findTransicionRevision('DERIVAR_ANALISTA', 'PENDIENTE_DEC')?.to === 'APROBADO_DEC',
  'DEC Derivar Analista → APROBADO_DEC',
);
assert(
  findTransicionRevision('APROBAR_DEC', 'PENDIENTE_DEC')?.to === 'APROBADO_DEC',
  'DEC Aprobar → Analista',
);
assert(
  findTransicionRevision('CONFORMIDAD_DEC', 'PENDIENTE_DEC')?.requireFirmadoDec === true,
  'DEC conformidad exige firma DEC',
);
assert(
  findTransicionRevision('OBSERVAR_DEC', 'PENDIENTE_DEC')?.to === 'OBSERVADO_DEC',
  'DEC observa → Analista',
);
assert(
  findTransicionRevision('GENERAR_CCP', 'APROBADO_DEC')?.to === 'PENDIENTE_CCP',
  'Analista Generar CCP',
);

assert(assertSalidaCcpOficial() === 'CCP', 'salida oficial CUADRO→CCP');
assert(TRANSICIONES_POR_ACCION.APROBAR[ETAPAS.CUADRO_COMPARATIVO] === ETAPAS.CCP, 'catálogo Workflow intacto');

assert(resolveRolRevision({ cargo: 'Coordinador 8 UIT' }) === 'COORDINADOR_8UIT', 'rol coordinador');
assert(resolveRolRevision({ cargo: 'Jefe DEC' }) === 'DEC', 'rol DEC');
assert(resolveRolRevision({ cargo: 'Especialista Contrataciones' }) === 'ANALISTA', 'rol analista');

const sample = [
  { solicitud_id: 1, estado_cuadro: 'PENDIENTE_COORDINADOR' },
  { solicitud_id: 2, estado_cuadro: 'CUADRO_BORRADOR' },
  { solicitud_id: 3, estado_cuadro: 'PENDIENTE_DEC' },
  { solicitud_id: 4, estado_cuadro: 'APROBADO_DEC' },
];
const bCoord = filtrarBandejaPorRolRevision(sample, { cargo: 'Coordinador 8 UIT' });
assert(bCoord.data.length === 1 && bCoord.data[0].solicitud_id === 1, 'bandeja coordinador');
const bDec = filtrarBandejaPorRolRevision(sample, { cargo: 'Especialista DEC' });
assert(bDec.data.some((x) => x.solicitud_id === 3), 'bandeja DEC');
const bAn = filtrarBandejaPorRolRevision(sample, { cargo: 'Analista' });
assert(bAn.data.every((x) => BANDEJA_ESTADOS_POR_ROL.ANALISTA.includes(x.estado_cuadro)
  || x.estado_cuadro === 'CUADRO_BORRADOR' || x.estado_cuadro === 'APROBADO_DEC'), 'bandeja analista');

const mig = fs.readFileSync(path.join(root, 'server/migrations/023_cuadro_revision_workflow.js'), 'utf8');
assert(/PENDIENTE_COORDINADOR/.test(mig) && /APROBADO_DEC/.test(mig), 'migración 023 estados');

const lib = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
assert(/transitarRevisionCuadro/.test(lib) && /syncRevisionCuadroWorkflow/.test(lib), 'funciones revisión');
assert(/registrarMovimiento/.test(fs.readFileSync(path.join(root, 'server/lib/cuadroComparativoRevision.js'), 'utf8')),
  'usa registrarMovimiento');

const portal = fs.readFileSync(path.join(root, 'server/routes/portal.js'), 'utf8');
assert(/cuadroId\/revision/.test(portal), 'ruta revision');

const valid = fs.readFileSync(path.join(root, 'server/lib/validacionesCotizacion.js'), 'utf8');
assert(/DESTINOS_SALIDA_VALIDACION|CUADRO_COMPARATIVO/.test(valid), 'Validaciones intactas');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC8.4: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.4: PASS\n');

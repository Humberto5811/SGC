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
  'Coordinador conformidad → FIRMADO_COORDINADOR (RC8.5-D)',
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

assert(resolveRolRevision({ cargo: 'Coordinador CM' }) === 'COORDINADOR_CM', 'rol coordinador CM');
assert(resolveRolRevision({ cargo: 'Coordinación CM' }) === 'COORDINADOR_CM', 'rol coordinación CM');
assert(resolveRolRevision({ cargo: 'Jefe DEC' }) === 'DEC', 'rol DEC');
assert(resolveRolRevision({ cargo: 'Especialista Contrataciones' }) === 'ANALISTA', 'rol analista');
// RC8.5-B1 — rol de sesión `dec` no implica DEC operativo (Analistas también usan rol dec)
assert(resolveRolRevision({ rol: 'dec', cargo: '' }) === 'ANALISTA', 'rol sistema dec ≠ DEC operativo');
assert(resolveRolRevision({ rol: 'admin' }) === 'ADMINISTRADOR', 'admin → ADMINISTRADOR');

const sample = [
  { solicitud_id: 1, estado_cuadro: 'PENDIENTE_COORDINADOR' },
  { solicitud_id: 2, estado_cuadro: 'CUADRO_BORRADOR' },
  { solicitud_id: 3, estado_cuadro: 'PENDIENTE_DEC' },
  { solicitud_id: 4, estado_cuadro: 'APROBADO_DEC' },
];
const bCoord = filtrarBandejaPorRolRevision(sample, { cargo: 'Coordinador CM' });
assert(bCoord.data.length === 1 && bCoord.data[0].solicitud_id === 1, 'bandeja coordinador');
const bDec = filtrarBandejaPorRolRevision(sample, { cargo: 'Especialista DEC' });
assert(bDec.data.some((x) => x.solicitud_id === 3), 'bandeja DEC');
const bAn = filtrarBandejaPorRolRevision(sample, { cargo: 'Analista' });
// RC8.4A — Analista ve también PENDIENTE_COORDINADOR / PENDIENTE_DEC
assert(bAn.data.length === 4, 'bandeja analista ve todos (incluye en revisión)');
assert(bAn.data.some((x) => x.solicitud_id === 1), 'analista ve PENDIENTE_COORDINADOR');
assert(BANDEJA_ESTADOS_POR_ROL.ANALISTA.includes('PENDIENTE_COORDINADOR'), 'allow-list analista incluye revisión CM');

const mig = fs.readFileSync(path.join(root, 'server/migrations/023_cuadro_revision_workflow.js'), 'utf8');
assert(/PENDIENTE_COORDINADOR/.test(mig) && /APROBADO_DEC/.test(mig), 'migración 023 estados');

const lib = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
assert(/transitarRevisionCuadro/.test(lib) && /syncRevisionCuadroWorkflow/.test(lib), 'funciones revisión');
assert(/esAdminReal/.test(lib) || /ADMINISTRADOR/.test(lib), 'Admin puede supervisar transiciones sin actuar_como UI');
assert(/registrarMovimiento/.test(fs.readFileSync(path.join(root, 'server/lib/cuadroComparativoRevision.js'), 'utf8')),
  'usa registrarMovimiento');

const viewCc = fs.readFileSync(path.join(root, 'src/views/contratacion/cuadroComparativoView.js'), 'utf8');
assert(/labelBandejaCuadroComparativo/.test(viewCc), 'bandeja CC etiqueta homogénea');
assert(!/>\s*Acciones\s*</.test(viewCc) && /text-center">Ver</.test(viewCc), 'bandeja CC: columna Ver sin Acciones');
assert(!/Actuar como/.test(viewCc), 'bandeja CC sin selector Actuar como');

const viewVal = fs.readFileSync(path.join(root, 'src/views/contratacion/validacionesView.js'), 'utf8');
assert(/openValidarExpediente/.test(viewVal) && /showValidarModal/.test(viewVal), 'Validaciones: Ver abre expediente');
assert(!/Cotizaciones en validación/.test(viewVal), 'sin ventana intermedia Cotizaciones en validación');

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

/**
 * RC90 — CCP bandeja: solo derivados, centro, código, roles, estados.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateCodigoCcp,
  normalizeCodigoCcp,
  ESTADOS_CCP_LABEL,
  ESTADOS_CCP_BANDEJA,
} from '../server/lib/ccpCertificacion.js';
import { resolveValidationCentro } from '../shared/validacionCentro.js';
import { ROUTE_ROLES } from '../src/utils/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC90 / CCP bandeja ===\n');

// Archivos clave
const files = [
  'server/migrations/025_ccp_certificacion.js',
  'server/lib/ccpCertificacion.js',
  'server/lib/ccpWord.js',
  'server/routes/ccp.js',
  'src/views/contratacion/ccpView.js',
];
files.forEach((f) => {
  assert(fs.existsSync(path.join(root, f)), `existe ${f}`);
});

const libSrc = fs.readFileSync(path.join(root, 'server/lib/ccpCertificacion.js'), 'utf8');
assert(libSrc.includes("DERIVADO_CCP"), 'bandeja filtra DERIVADO_CCP');
assert(libSrc.includes('resolveValidationCentro'), 'usa resolveValidationCentro');
assert(!libSrc.includes("'CNSP'") && !libSrc.includes('"CNSP"'), 'no hardcodea CNSP');

const viewSrc = fs.readFileSync(path.join(root, 'src/views/contratacion/ccpView.js'), 'utf8');
assert(viewSrc.includes('Requerimiento'), 'columna Requerimiento');
assert(viewSrc.includes('Solicitud de Cotización'), 'columna Solicitud');
assert(viewSrc.includes('Centro'), 'columna Centro');
assert(viewSrc.includes('Estado'), 'columna Estado');
assert(viewSrc.includes('CCP'), 'columna CCP');
assert(viewSrc.includes('Acciones') || viewSrc.includes('ccpMenuItems'), 'columna Acciones');
assert(viewSrc.includes('Consolidar solicitud CCP'), 'botón consolidar');
assert(!viewSrc.includes('Vista en construcción'), 'ya no es placeholder');
assert(viewSrc.includes('Certificado de Crédito Presupuestal -CCP'), 'título correcto');
assert(viewSrc.includes('loadGuard.begin()'), 'usa loadGuard.begin (no next)');
assert(!viewSrc.includes('loadGuard.next('), 'no usa loadGuard.next inexistente');

const indexSrc = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
assert(indexSrc.includes("app.use('/api/ccp'"), 'monta /api/ccp');

assert(
  Array.isArray(ROUTE_ROLES['dec/ccp']) && ROUTE_ROLES['dec/ccp'].includes('dec'),
  'ROUTE_ROLES dec/ccp incluye dec',
);
assert(ROUTE_ROLES['dec/ccp'].includes('admin'), 'ROUTE_ROLES incluye admin');

const routesSrc = fs.readFileSync(path.join(root, 'server/routes/ccp.js'), 'utf8');
assert(routesSrc.includes("ROLES_CCP"), 'valida roles en API');
assert(routesSrc.includes("status(403)") || routesSrc.includes('403'), 'rechaza no autorizados');

// Centro textual (no CMN numérico)
const centro = resolveValidationCentro({
  pedidoCentro: 'CNSP',
  requerimientoCentro: '05277',
  centroCosto: '99',
});
assert(centro.centro === 'CNSP', 'centro muestra denominación CNSP (pedido)');
assert(centro.centro !== '05277', 'no muestra CMN numérico');

const vacio = resolveValidationCentro({ pedidoCentro: '05277', requerimientoCentro: '' });
assert(vacio.centro === '', 'sin denominación textual → vacío (no --)');

// Validación código
assert(normalizeCodigoCcp('  AB-12  ') === 'AB-12', 'trim código');
try {
  validateCodigoCcp('');
  assert(false, 'vacío debe fallar');
} catch (e) {
  assert(e.code === 'CCP_CODIGO_VACIO', 'rechaza código vacío');
}
assert(validateCodigoCcp('CCP-2026-001') === 'CCP-2026-001', 'acepta código válido');

// Estados de bandeja (no nombre de módulo)
Object.values(ESTADOS_CCP_LABEL).forEach((label) => {
  assert(!/^CCP$/i.test(label), `estado no es nombre de módulo: ${label}`);
});
assert(
  ESTADOS_CCP_LABEL[ESTADOS_CCP_BANDEJA.PENDIENTE_CONSOLIDACION] === 'Pendiente de consolidación',
  'label pendiente consolidación',
);
assert(
  ESTADOS_CCP_LABEL[ESTADOS_CCP_BANDEJA.CCP_REGISTRADO] === 'CCP registrado',
  'label CCP registrado',
);

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC90: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLAS:', failed.map((f) => f.msg));
  process.exit(1);
}

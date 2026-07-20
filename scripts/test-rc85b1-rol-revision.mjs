/**
 * RC8.5-B1 — Entrada, resolución de rol, Admin supervisión, CCP por estado, labels.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveRolRevision,
  resolveModoAperturaExpediente,
  puedeMostrarBotonesCcp,
  ROLES_REVISION,
  BANDEJA_ESTADOS_POR_ROL,
} from '../shared/cuadroComparativoRol.js';
import { filtrarBandejaPorRolRevision } from '../server/lib/cuadroComparativo.js';
import { ESTADOS_REVISION_LABEL } from '../server/lib/cuadroComparativoRevision.js';
import { ESTADOS_CUADRO_LABEL, cuadroComparativoMenuItems } from '../src/utils/cuadroComparativoUtils.js';
import { CUADRO_REVISION_ESTADO_LABELS } from '../src/utils/estadoVisualPresenter.js';
import { resolveRolRevisionCliente } from '../src/utils/cuadroComparativoRevisionUi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.5-B1 Rol / Admin / CCP / Labels ===\n');

assert(resolveRolRevision({ cargo: 'Coordinador CM' }) === 'COORDINADOR_CM', 'Coord CM por cargo');
assert(resolveRolRevision({ cargo: 'COORDINACIÓN CM' }) === 'COORDINADOR_CM', 'Coord normaliza tildes');
assert(resolveRolRevision({ cargo: 'Coordinador de Contratos' }) === 'COORDINADOR_CM', 'Coord contratos');
assert(resolveRolRevision({ cargo: 'Jefe DEC' }) === 'DEC', 'DEC por cargo');
assert(resolveRolRevision({ rol: 'dec', cargo: 'Especialista Contrataciones' }) === 'ANALISTA',
  'Analista con rol sesión dec');
assert(resolveRolRevision({ rol: 'dec', cargo: '' }) === 'ANALISTA', 'dec vacío → Analista');
assert(resolveRolRevision({ rol: 'admin', cargo: '' }) === 'ADMINISTRADOR', 'Admin sin cargo');
assert(resolveRolRevision({ cargo: '' }) === 'ANALISTA', 'cargo vacío no concede Coord/DEC');

assert(resolveRolRevisionCliente({ cargo: 'Coordinador CM' }) === resolveRolRevision({ cargo: 'Coordinador CM' }),
  'FE/BE misma resolución Coord');
assert(resolveRolRevisionCliente({ rol: 'admin' }) === resolveRolRevision({ rol: 'admin' }),
  'FE/BE misma resolución Admin');

assert(resolveModoAperturaExpediente('PENDIENTE_COORDINADOR', 'ADMINISTRADOR') === 'COORDINADOR_CM',
  'Admin abre modo Coord');
assert(resolveModoAperturaExpediente('PENDIENTE_DEC', 'ADMINISTRADOR') === 'DEC', 'Admin abre modo DEC');
assert(resolveModoAperturaExpediente('CUADRO_BORRADOR', 'ADMINISTRADOR') === 'ANALISTA', 'Admin abre Analista');

assert(!puedeMostrarBotonesCcp('PENDIENTE_COORDINADOR'), 'CCP oculto en Coord');
assert(!puedeMostrarBotonesCcp('PENDIENTE_DEC'), 'CCP oculto en DEC');
assert(!puedeMostrarBotonesCcp('OBSERVADO_COORDINADOR'), 'CCP oculto observado');
assert(puedeMostrarBotonesCcp('APROBADO_DEC'), 'CCP visible APROBADO_DEC');
assert(puedeMostrarBotonesCcp('PENDIENTE_CCP'), 'CCP visible PENDIENTE_CCP');

const sample = [
  { solicitud_id: 1, estado_cuadro: 'PENDIENTE_COORDINADOR' },
  { solicitud_id: 2, estado_cuadro: 'CUADRO_BORRADOR' },
  { solicitud_id: 3, estado_cuadro: 'PENDIENTE_DEC' },
];
const bAdmin = filtrarBandejaPorRolRevision(sample, { rol: 'admin' });
assert(bAdmin.rol === 'ADMINISTRADOR', 'filtro rol ADMINISTRADOR');
assert(bAdmin.data.length === 3, 'Admin ve todos');
assert(bAdmin.data.find((x) => x.solicitud_id === 1)?.modo_apertura === 'COORDINADOR_CM', 'modo_apertura Coord');

const menuCoord = cuadroComparativoMenuItems(
  { estado_cuadro: 'PENDIENTE_COORDINADOR', cuadro_id: 1 },
  { rol: 'COORDINADOR_CM' },
);
assert(menuCoord.some((m) => m.act === 'abrirExpedienteCoord'), 'menú Abrir expediente Coord');
assert(!menuCoord.some((m) => m.act === 'verCuadro'), 'Coord no usa Ver Analista');

const menuAdmin = cuadroComparativoMenuItems(
  { estado_cuadro: 'PENDIENTE_COORDINADOR', cuadro_id: 1 },
  { rol: 'ADMINISTRADOR' },
);
assert(menuAdmin.some((m) => m.act === 'abrirExpedienteAdmin'), 'menú Admin Abrir expediente');

assert(ESTADOS_REVISION_LABEL.PENDIENTE_COORDINADOR === 'C.C. en revisión Coordinador CM', 'label server CM');
assert(ESTADOS_REVISION_LABEL.PENDIENTE_DEC === 'C.C. en revisión DEC', 'label server DEC');
assert(ESTADOS_CUADRO_LABEL.PENDIENTE_COORDINADOR === 'C.C. en revisión Coordinador CM', 'label UI CM');
assert(CUADRO_REVISION_ESTADO_LABELS.PENDIENTE_DEC === 'C.C. en revisión DEC', 'label presenter DEC');

assert(BANDEJA_ESTADOS_POR_ROL.ADMINISTRADOR?.length > 5, 'bandeja Admin allow-list');
assert(ROLES_REVISION.ADMINISTRADOR === 'ADMINISTRADOR', 'const ADMINISTRADOR');

const apiSrc = fs.readFileSync(path.join(root, 'src/services/apiService.js'), 'utf8');
assert(/x-user-cargo/.test(apiSrc) && /user\.cargo \?\?/.test(apiSrc), 'apiService envía cargo');

const portalSrc = fs.readFileSync(path.join(root, 'server/routes/portal.js'), 'utf8');
assert(/no elevar privilegios|solo desde cabeceras/i.test(portalSrc)
  || (!/req\.body\?\.cargo/.test(portalSrc.split('cuadro/:cuadroId/revision')[1]?.slice(0, 500) || '')),
  'revision no eleva con body.cargo');

const modalSrc = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoModal.js'), 'utf8');
assert(/puedeMostrarBotonesCcp/.test(modalSrc), 'modal usa gate CCP por estado');

const menuSrc = fs.readFileSync(path.join(root, 'src/services/menuService.js'), 'utf8');
assert(/dec\/actos/.test(menuSrc) && /Coordinación CM/.test(menuSrc), 'menú Coordinación CM intacto');
assert(/dec\/cuadro/.test(menuSrc) && /Cuadro Comparativo/.test(menuSrc), 'menú Cuadro intacto');

const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO/.test(wf), 'WorkflowTransitions intacto');

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.5-B1: PASS\n');

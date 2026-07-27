/**
 * OD35 / RC93 — Propagación “CCP registrado” + menú Acciones bandeja CCP.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveEstadoActualExpediente,
  badgeVisualEstadoVigente,
  prioridadEstadoCuadro,
  BADGE_COLOR_CCP,
  BADGE_COLOR_CCP_REGISTRADO,
} from '../shared/estadoExpedienteVigente.js';
import { buildEstadoVisual } from '../src/utils/estadoVisualPresenter.js';
import { ccpMenuItems } from '../src/utils/bandejaActions.js';
import {
  estadoExpedienteRecepcion,
  consolidarExpedientesRecepcion,
} from '../src/utils/recepcionCotizacionUtils.js';
import {
  estadoExpedienteValidacion,
  consolidarExpedientesValidacion,
} from '../src/utils/validacionesUtils.js';
import { renderBadgeEstadoCuadroHtml } from '../src/utils/cuadroComparativoUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC93 / OD35 CCP registrado + Acciones ===\n');

assert(
  prioridadEstadoCuadro('CCP_REGISTRADO') > prioridadEstadoCuadro('DERIVADO_CCP'),
  'prioridad CCP_REGISTRADO > DERIVADO_CCP',
);
assert(
  prioridadEstadoCuadro('DERIVADO_CCP') > prioridadEstadoCuadro('APROBADO_DEC'),
  'prioridad DERIVADO_CCP > APROBADO_DEC',
);

// 1) Derivado sin código
const sinCodigo = {
  solicitud_estado: 'EN_CCP',
  estado_cuadro: 'DERIVADO_CCP',
  payload: { workflowSnapshot: { etapaActual: 'CCP', revisionEstado: 'DERIVADO_CCP' } },
};
const v1 = resolveEstadoActualExpediente(sinCodigo);
assert(v1.code === 'DERIVADO_CCP' && v1.label === 'Derivado a CCP', 'sin código → Derivado a CCP');
assert(badgeVisualEstadoVigente(sinCodigo).color === BADGE_COLOR_CCP, 'badge morado derivado');

const menu1 = ccpMenuItems({ tiene_codigo: false, consolidacion_id: 1 }, { canManage: true });
assert(menu1.some((m) => m.act === 'registrarCcp'), 'menú: Registrar CCP visible');
assert(!menu1.some((m) => m.act === 'editarCcp'), 'menú: Editar oculto sin código');
assert(menu1.some((m) => m.act === 'ver'), 'menú: Ver visible');
assert(menu1.some((m) => m.act === 'descargarWord'), 'menú: Descargar Word si consolidado');

// 2) Con código → CCP registrado
const conCodigo = { ...sinCodigo, codigo_ccp: '355', ccp_activo: true };
const v2 = resolveEstadoActualExpediente(conCodigo);
assert(v2.code === 'CCP_REGISTRADO' && v2.label === 'CCP registrado', 'con código → CCP registrado');
assert(v2.ccpRegistrado === true, 'flag ccpRegistrado');
assert(badgeVisualEstadoVigente(conCodigo).color === BADGE_COLOR_CCP_REGISTRADO, 'badge verde registrado');
assert(badgeVisualEstadoVigente(conCodigo).label === 'CCP registrado', 'label badge registrado');

const menu2 = ccpMenuItems({ tiene_codigo: true, codigo_ccp: '355', consolidacion_id: 1 }, { canManage: true });
assert(!menu2.some((m) => m.act === 'registrarCcp'), 'con código: Registrar oculto');
assert(menu2.some((m) => m.act === 'editarCcp'), 'con código: Editar visible');
assert(menu2.some((m) => m.act === 'eliminarCcp'), 'con código: Eliminar visible');

const menuRol = ccpMenuItems({ tiene_codigo: false, consolidacion_id: 1 }, { canManage: false });
assert(!menuRol.some((m) => m.act === 'registrarCcp'), 'rol no autorizado: sin Registrar');
assert(menuRol.some((m) => m.act === 'ver'), 'rol no autorizado: Ver permitido');

// 3) Presenter + bandejas
const visual = buildEstadoVisual(conCodigo);
assert(visual.textoPrincipal === 'CCP registrado', 'presenter: CCP registrado');

const recep = estadoExpedienteRecepcion([], {
  solicitud_estado: 'EN_CCP',
  estado_cuadro: 'DERIVADO_CCP',
  codigo_ccp: '355',
  ccp_activo: true,
});
assert(recep.label === 'CCP registrado', 'Recepción: CCP registrado');

const val = estadoExpedienteValidacion([], {
  solicitud_estado: 'EN_CCP',
  estado_cuadro: 'DERIVADO_CCP',
  codigo_ccp: '355',
  ccp_activo: true,
});
assert(val.label === 'CCP registrado', 'Validaciones: CCP registrado');

const htmlCuadro = renderBadgeEstadoCuadroHtml(conCodigo, null, (s) => s);
assert(htmlCuadro.includes('CCP registrado'), 'Cuadro Comparativo badge texto');
assert(htmlCuadro.includes('#198754') || htmlCuadro.includes('198754'), 'Cuadro Comparativo badge verde');

const expRecep = consolidarExpedientesRecepcion([{
  solicitud_id: 1,
  solicitud_codigo: 'SC-1',
  solicitud_estado: 'EN_CCP',
  estado_cuadro: 'DERIVADO_CCP',
  codigo_ccp: '355',
  ccp_activo: true,
  fecha_presentacion: '2026-07-01',
}]);
assert(expRecep[0]?.estado_recepcion === 'CCP registrado', 'consolidación recepción');

const expVal = consolidarExpedientesValidacion([{
  solicitud_id: 2,
  solicitud_codigo: 'SC-2',
  solicitud_estado: 'EN_CCP',
  estado_cuadro: 'DERIVADO_CCP',
  codigo_ccp: '355',
  ccp_activo: true,
  fecha_presentacion: '2026-07-01',
}]);
assert(expVal[0]?.estado_bandeja === 'CCP registrado', 'consolidación validaciones');

// No mostrar ambos estados
assert(v2.label !== 'Derivado a CCP', 'estado único: no Derivado si hay CCP');

// UI Acciones
const viewSrc = fs.readFileSync(path.join(root, 'src/views/contratacion/ccpView.js'), 'utf8');
assert(viewSrc.includes('Acciones'), 'columna Acciones');
assert(!/<\/th>\s*Ver\s*<\/th>/i.test(viewSrc) && !viewSrc.includes('>Ver</th>'), 'sin columna Ver independiente');
assert(viewSrc.includes('ccpMenuItems'), 'usa ccpMenuItems');
assert(viewSrc.includes('openCcpCodigoModal'), 'modal Registrar/Editar');
assert(viewSrc.includes('Pendiente'), 'CCP muestra Pendiente sin código');
assert(fs.existsSync(path.join(root, 'src/utils/ccpCodigoModal.js')), 'existe ccpCodigoModal');
assert(fs.existsSync(path.join(root, 'server/lib/ccpEstadoFlags.js')), 'existe ccpEstadoFlags');

const routes = fs.readFileSync(path.join(root, 'server/routes/ccp.js'), 'utf8');
assert(routes.includes('ROLES_CCP') && routes.includes('403'), 'BE rechaza rol no autorizado');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC93: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLAS:', failed.map((f) => f.msg));
  process.exit(1);
}
console.log('\nPASS RC93 / OD35\n');

/**
 * RC94 — Registro de Órdenes: bandeja, menú, estados (alineado OD36).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveEstadoActualExpediente,
  prioridadEstadoCuadro,
  ESTADOS_ORDEN_LABEL,
  normalizeEstadoOrden,
} from '../shared/estadoExpedienteVigente.js';
import {
  registroOrdenesMenuItems,
  tipoOrdenSugerido,
} from '../src/utils/ordenesUtils.js';
import { calcularFechaMaxima } from '../server/lib/diasPlazo.js';
import { validarCronogramaContraItems } from '../server/lib/ordenesValidaciones.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC94 Registro de Órdenes — bandeja/estados ===\n');

assert(
  prioridadEstadoCuadro('EN_EJECUCION') > prioridadEstadoCuadro('ORDEN_RECEPCION_CONFIRMADA'),
  'prioridad EN_EJECUCION > recepción',
);
assert(
  prioridadEstadoCuadro('ORDEN_RECEPCION_CONFIRMADA') > prioridadEstadoCuadro('ORDEN_NOTIFICADA'),
  'prioridad recepción > notificada',
);
assert(
  prioridadEstadoCuadro('REGISTRO_ORDENES') > prioridadEstadoCuadro('CCP_REGISTRADO'),
  'prioridad REGISTRO_ORDENES > CCP registrado',
);
assert(
  prioridadEstadoCuadro('ORDEN_REGISTRADA') > prioridadEstadoCuadro('REGISTRO_ORDENES'),
  'prioridad ORDEN_REGISTRADA > REGISTRO_ORDENES',
);

const soloCcp = {
  codigo_ccp: '355',
  ccp_activo: true,
  solicitud_estado: 'EN_CCP',
  estado_cuadro: 'DERIVADO_CCP',
};
assert(resolveEstadoActualExpediente(soloCcp).code === 'CCP_REGISTRADO', 'solo CCP → CCP registrado');

const conFirmado = { ...soloCcp, ccp_firmado: true, en_registro_ordenes: true };
assert(
  resolveEstadoActualExpediente(conFirmado).code === 'REGISTRO_ORDENES',
  'en módulo → Registro de órdenes',
);

const enviada = { ...soloCcp, orden_estado: 'ORDEN_NOTIFICADA' };
assert(
  resolveEstadoActualExpediente(enviada).code === 'ORDEN_NOTIFICADA',
  'orden notificada',
);
assert(
  resolveEstadoActualExpediente(enviada).label === ESTADOS_ORDEN_LABEL.ORDEN_NOTIFICADA,
  'label Orden notificada',
);

const menuSinFirmado = registroOrdenesMenuItems({ ccp_firmado: false }, { canManage: true });
assert(menuSinFirmado.some((m) => m.act === 'adjuntarCcpFirmado'), 'menú: adjuntar CCP firmado');
assert(!menuSinFirmado.some((m) => m.act === 'registrarOrden'), 'menú: no registrar sin firmado');

const menuConFirmado = registroOrdenesMenuItems({ ccp_firmado: true }, { canManage: true });
assert(menuConFirmado.some((m) => m.act === 'registrarOrden'), 'menú: registrar con firmado');

const menuLista = registroOrdenesMenuItems({
  ccp_firmado: true, orden_id: 1, estado: 'ORDEN_LISTA_NOTIFICACION',
}, { canManage: true });
assert(menuLista.some((m) => m.act === 'notificarProveedor'), 'menú: notificar con orden lista');

assert(tipoOrdenSugerido('Bien') === 'OC', 'Bien → OC');
assert(tipoOrdenSugerido('Servicio') === 'OS', 'Servicio → OS');

assert(calcularFechaMaxima('2026-07-01', 10, 'calendario') === '2026-07-10', 'días calendario inclusivo');
assert(calcularFechaMaxima('2026-07-01', 5, 'habiles') === '2026-07-07', 'días hábiles inclusivo');

const orden = { monto_total: 2500, tipo_contratacion: 'Bien' };
const items = [{ id: 1, descripcion: 'X', cantidad: 100, precio_unitario: 25, precio_total: 2500 }];
try {
  validarCronogramaContraItems(orden, items, [{
    numero_entrega: 1,
    descripcion: 'Entrega 1',
    dias_plazo: 10,
    items: [{ orden_item_id: 1, cantidad: 100, precio_unitario: 25, precio_total: 2500 }],
  }]);
  assert(true, 'entrega total válida');
} catch (e) {
  assert(false, `entrega total válida: ${e.message}`);
}

try {
  validarCronogramaContraItems(orden, items, [
    { numero_entrega: 1, descripcion: 'E1', dias_plazo: 10, items: [{ orden_item_id: 1, cantidad: 40, precio_unitario: 25, precio_total: 1000 }] },
    { numero_entrega: 2, descripcion: 'E2', dias_plazo: 20, items: [{ orden_item_id: 1, cantidad: 30, precio_unitario: 25, precio_total: 750 }] },
    { numero_entrega: 3, descripcion: 'E3', dias_plazo: 30, items: [{ orden_item_id: 1, cantidad: 30, precio_unitario: 25, precio_total: 750 }] },
  ]);
  assert(true, 'varias entregas suma OK');
} catch (e) {
  assert(false, `varias entregas: ${e.message}`);
}

let rejected = false;
try {
  validarCronogramaContraItems(orden, items, [{
    numero_entrega: 1, descripcion: 'E1', dias_plazo: 10,
    items: [{ orden_item_id: 1, cantidad: 50, precio_unitario: 25, precio_total: 1250 }],
  }]);
} catch (_) { rejected = true; }
assert(rejected, 'rechaza suma cantidades incorrecta');

rejected = false;
try {
  validarCronogramaContraItems(orden, items, [{
    numero_entrega: 1, descripcion: '', dias_plazo: 10,
    items: [{ orden_item_id: 1, cantidad: 100, precio_unitario: 25, precio_total: 2500 }],
  }]);
} catch (_) { rejected = true; }
assert(!rejected, 'permite sin descripción operativa (se genera en BE)');

rejected = false;
try {
  validarCronogramaContraItems(orden, items, [{
    numero_entrega: 1, descripcion: 'E1', dias_plazo: 0,
    items: [{ orden_item_id: 1, cantidad: 100, precio_unitario: 25, precio_total: 2500 }],
  }]);
} catch (_) { rejected = true; }
assert(rejected, 'rechaza plazo aplicable 0');

assert(normalizeEstadoOrden('PENDIENTE_CONFIRMACION') === 'ORDEN_NOTIFICADA', 'alias estado → notificada');
assert(normalizeEstadoOrden('PENDIENTE_CCP_FIRMADO') === 'REGISTRO_ORDENES', 'alias → registro órdenes');

const mig = fs.readFileSync(path.join(root, 'server/migrations/026_ordenes_contratacion.js'), 'utf8');
assert(mig.includes('ordenes_contratacion'), 'migración crea ordenes_contratacion');
assert(!/DROP TABLE.*\bordenes\b/.test(mig), 'migración no elimina catálogo ordenes');
assert(!/ALTER TABLE\s+ordenes\b/.test(mig), 'migración no altera catálogo ordenes');

const stub = fs.readFileSync(path.join(root, 'src/views/ejecucion/registroOrdenView.js'), 'utf8');
assert(stub.includes('construcción') || stub.includes('inicializado'), 'placeholder ejecucion/registro intacto');

const menu = fs.readFileSync(path.join(root, 'src/services/menuService.js'), 'utf8');
assert(menu.includes('dec/registro-ordenes'), 'menú Contrataciones incluye Registro de Órdenes');
assert(menu.includes('REGISTRO_ORDENES_CONTRATACION'), 'permiso nuevo en menú');
assert(menu.includes("path: 'ejecucion/registro'"), 'placeholder Ejecución sigue en menú');
assert(menu.includes("path: 'mantenimiento/ordenes'"), 'catálogo mantenimiento/ordenes intacto');

const perms = fs.readFileSync(path.join(root, 'server/lib/permissionsCatalog.js'), 'utf8');
assert(perms.includes('REGISTRO_ORDENES_CONTRATACION'), 'permiso servidor');
assert(perms.includes("id: 'REGISTRO_ORDEN'"), 'permiso placeholder Ejecución intacto');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC94: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((f) => console.error(' -', f.msg));
  process.exit(1);
}

/**
 * RC100 / OD36 — Registro de Órdenes: columnas, estados, menú, fechas, isolation.
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
import { calcularFechasInicioActividad } from '../server/lib/ordenesContratacion.js';
import { validarCronogramaContraItems } from '../server/lib/ordenesValidaciones.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC100 / OD36 Registro de Órdenes ===\n');

// Prioridades OD36
assert(prioridadEstadoCuadro('EN_EJECUCION') > prioridadEstadoCuadro('ORDEN_RECEPCION_CONFIRMADA'), 'EN_EJECUCION > recepción');
assert(prioridadEstadoCuadro('ORDEN_NOTIFICADA') > prioridadEstadoCuadro('ORDEN_LISTA_NOTIFICACION'), 'notificada > lista');
assert(prioridadEstadoCuadro('ORDEN_REGISTRADA') > prioridadEstadoCuadro('REGISTRO_ORDENES'), 'registrada > registro');
assert(prioridadEstadoCuadro('REGISTRO_ORDENES') > prioridadEstadoCuadro('CCP_REGISTRADO'), 'registro órdenes > CCP registrado');

// Estado inicial en módulo
const enModulo = {
  codigo_ccp: '355',
  ccp_activo: true,
  en_registro_ordenes: true,
  solicitud_estado: 'EN_CCP',
  estado_cuadro: 'DERIVADO_CCP',
};
assert(resolveEstadoActualExpediente(enModulo).code === 'REGISTRO_ORDENES', 'estado inicial Registro de órdenes');
assert(resolveEstadoActualExpediente(enModulo).label === 'Registro de órdenes', 'label Registro de órdenes');

const notificada = { ...enModulo, orden_estado: 'ORDEN_NOTIFICADA' };
assert(resolveEstadoActualExpediente(notificada).code === 'ORDEN_NOTIFICADA', 'Orden notificada');
assert(resolveEstadoActualExpediente(notificada).label === 'Orden notificada', 'label Orden notificada');

assert(normalizeEstadoOrden('PENDIENTE_CCP_FIRMADO') === 'REGISTRO_ORDENES', 'alias pendiente CCP → REGISTRO_ORDENES');
assert(normalizeEstadoOrden('ORDEN_ENVIADA_PENDIENTE_CONFIRMACION') === 'ORDEN_NOTIFICADA', 'alias enviada → notificada');
assert(ESTADOS_ORDEN_LABEL.ORDEN_LISTA_NOTIFICACION === 'Orden lista para notificación', 'label lista notificación');

// Menú OD36
const mA = registroOrdenesMenuItems({ ccp_firmado: false }, { canManage: true });
assert(mA.some((x) => x.act === 'adjuntarCcpFirmado'), 'A: adjuntar CCP');
assert(!mA.some((x) => x.act === 'inicioActividad'), 'A: inicio actividad oculto (OD37)');
assert(!mA.some((x) => x.act === 'verCcp'), 'A: sin Ver CCP alert');
assert(!mA.some((x) => x.act === 'verExpediente'), 'A: sin Ver expediente alert');

const mB = registroOrdenesMenuItems({ ccp_firmado: true }, { canManage: true });
assert(mB.some((x) => x.act === 'verCcpFirmado'), 'B: ver CCP firmado');
assert(mB.some((x) => x.act === 'eliminarCcpFirmado'), 'B: eliminar CCP firmado');
assert(mB.some((x) => x.act === 'registrarOrden'), 'B: registrar orden');

const mC = registroOrdenesMenuItems({
  ccp_firmado: true, orden_id: 1, estado: 'ORDEN_REGISTRADA', tipo: 'Bien',
}, { canManage: true });
assert(mC.some((x) => x.act === 'adminEntregas' && /entregas/i.test(x.label)), 'C: Registrar entregas (Bien)');

const mCs = registroOrdenesMenuItems({
  ccp_firmado: true, orden_id: 1, estado: 'ORDEN_REGISTRADA', tipo: 'Servicio',
}, { canManage: true });
assert(mCs.some((x) => x.act === 'adminEntregas' && /entregables/i.test(x.label)), 'C: Registrar entregables (Servicio)');

const mD = registroOrdenesMenuItems({
  ccp_firmado: true, orden_id: 1, estado: 'ORDEN_LISTA_NOTIFICACION',
}, { canManage: true });
assert(mD.some((x) => x.act === 'notificarProveedor'), 'D: Notificar al proveedor');

const mE = registroOrdenesMenuItems({
  ccp_firmado: true, orden_id: 1, estado: 'ORDEN_NOTIFICADA',
}, { canManage: true });
assert(mE.some((x) => x.act === 'reenviar'), 'E: Reenviar');
assert(mE.some((x) => x.act === 'verNotificacion'), 'E: Ver notificación');

const mF = registroOrdenesMenuItems({
  ccp_firmado: true, orden_id: 1, estado: 'ORDEN_RECEPCION_CONFIRMADA',
}, { canManage: true });
assert(mF.some((x) => x.act === 'derivarEjecucion'), 'F: Derivar');

assert(tipoOrdenSugerido('Bien') === 'OC' && tipoOrdenSugerido('Servicio') === 'OS', 'OC/OS sugeridos');

// Inicio actividad + fechas
const emision = calcularFechasInicioActividad({
  condicion: 'EMISION_ORDEN',
  fechaOrden: '2026-07-20',
  diasPlazo: 10,
  tipoDias: 'calendario',
});
assert(emision.fecha_efectiva_inicio === '2026-07-20', 'emisión: efectiva = fecha orden');
assert(emision.fecha_maxima === '2026-07-29', 'emisión + 10 días inclusivo (= +9)');

const diaSig = calcularFechasInicioActividad({
  condicion: 'DIA_SIGUIENTE_NOTIFICACION',
  fechaNotificacion: '2026-07-27',
  diasPlazo: 10,
  tipoDias: 'calendario',
});
assert(diaSig.fecha_evento === '2026-07-27', 'notif: evento = 27/07');
assert(diaSig.fecha_efectiva_inicio === '2026-07-28', 'notif: efectiva = 28/07');
assert(diaSig.fecha_maxima === '2026-08-06', 'notif: máx inclusivo 28/07 + 9 = 06/08');

assert(calcularFechaMaxima('2026-01-25', 10, 'calendario') === '2026-02-03', 'límite de mes inclusivo');
assert(calcularFechaMaxima('2025-12-28', 5, 'calendario') === '2026-01-01', 'límite de año inclusivo');

// Columnas orden exacto
const view = fs.readFileSync(path.join(root, 'src/views/contratacion/registroOrdenesView.js'), 'utf8');
const thOrder = [
  'CCP</th>',
  'CCP firmado</th>',
  'Requerimiento</th>',
  'Pedido</th>',
  'RUC</th>',
  'Proveedor</th>',
  'Tipo</th>',
  'Cantidad</th>',
  'Precio unitario</th>',
  'Total</th>',
  'orden</th>',
  'Fecha orden</th>',
  'Entrega</th>',
  'Envío de orden</th>',
  'Recepción</th>',
  'Fecha máxima de entrega</th>',
  'Estado</th>',
  'Acciones</th>',
];
let lastIdx = -1;
let orderOk = true;
for (const th of thOrder) {
  const idx = view.indexOf(th);
  if (idx < 0 || idx < lastIdx) { orderOk = false; break; }
  lastIdx = idx;
}
assert(orderOk, 'orden exacto de columnas OD36');
assert(view.includes('Mostrando ${from}–${to} de ${metaTotal}'), 'paginación texto Mostrando X–Y de Z');
assert(view.includes('prev.disabled = page <= 1'), 'Anterior deshabilitado en primera');
assert(view.includes('next.disabled = page >= metaPages'), 'Siguiente deshabilitado en última');
assert(!view.includes("act === 'verCcp'") && !view.includes("act: 'verCcp'"), 'sin acción Ver CCP');

const modal = fs.readFileSync(path.join(root, 'src/utils/registroOrdenModal.js'), 'utf8');
assert(!modal.includes('roCcpSgdEnvio'), 'modal CCP sin SGD envío');
assert(!modal.includes('roCcpFechaEnvio'), 'modal CCP sin fecha OPPM');
assert(fs.readFileSync(path.join(root, 'src/utils/registroOrdenEntregasModal.js'), 'utf8').includes('Inicio de actividad'), 'modal inicio actividad integrado OD37');
assert(modal.includes('Notificar al proveedor'), 'modal notificar');

const stub = fs.readFileSync(path.join(root, 'src/views/ejecucion/registroOrdenView.js'), 'utf8');
assert(/construcción|inicializado/i.test(stub), 'placeholder ejecucion intacto');
const menu = fs.readFileSync(path.join(root, 'src/services/menuService.js'), 'utf8');
assert(menu.includes('mantenimiento/ordenes') && menu.includes('ejecucion/registro'), 'catálogo y placeholder en menú');
assert(menu.includes('dec/registro-ordenes'), 'menú registro órdenes');

const mig027 = fs.readFileSync(path.join(root, 'server/migrations/027_orden_inicio_actividad.js'), 'utf8');
assert(mig027.includes('orden_inicio_actividad'), 'migración inicio actividad');

// Validación entregas
try {
  validarCronogramaContraItems(
    { monto_total: 2500 },
    [{ id: 1, descripcion: 'X', cantidad: 100, precio_unitario: 25 }],
    [{ numero_entrega: 1, descripcion: 'E1', dias_plazo: 10, items: [{ orden_item_id: 1, cantidad: 100, precio_unitario: 25, precio_total: 2500 }] }],
  );
  assert(true, 'cronograma válido');
} catch (e) {
  assert(false, e.message);
}

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC100: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((f) => console.error(' -', f.msg));
  process.exit(1);
}

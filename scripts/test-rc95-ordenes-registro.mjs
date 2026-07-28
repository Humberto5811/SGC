/**
 * RC95–RC99 — Registro / entregas / envío / confirmación / derivación (lógica).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calcularFechaMaxima } from '../server/lib/diasPlazo.js';
import { validarCronogramaContraItems } from '../server/lib/ordenesValidaciones.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC95–99 Órdenes lógica ===\n');

const ocSrc = fs.readFileSync(path.join(root, 'server/lib/ordenesContratacion.js'), 'utf8');
assert(ocSrc.includes("ORDEN_REGISTRADA: 'ORDEN_REGISTRADA'"), 'estado registrada en fuente');
assert(ocSrc.includes('INICIO_PLAZO_CONFIRMACION_RECEPCION'), 'regla default confirmación');
assert(ocSrc.includes('export function httpError'), 'httpError disponible');

const ordenSrv = { monto_total: 1000, tipo_contratacion: 'Servicio' };
const itemsSrv = [{ id: 1, descripcion: 'Servicio', cantidad: 1, precio_unitario: 1000, precio_total: 1000 }];
try {
  validarCronogramaContraItems(ordenSrv, itemsSrv, [
    { numero_entrega: 1, tipo_entrega: 'ENTREGABLE', descripcion: 'Entregable 1', dias_plazo: 15, importe: 400, items: [] },
    { numero_entrega: 2, tipo_entrega: 'ENTREGABLE', descripcion: 'Entregable 2', dias_plazo: 30, importe: 300, items: [] },
    { numero_entrega: 3, tipo_entrega: 'ENTREGABLE', descripcion: 'Entregable final', dias_plazo: 45, importe: 300, items: [] },
  ]);
  assert(true, 'servicios entregables montos OK');
} catch (e) {
  assert(false, `servicios montos: ${e.message}`);
}

let rej = false;
try {
  validarCronogramaContraItems(ordenSrv, itemsSrv, [
    { numero_entrega: 1, descripcion: 'E1', dias_plazo: 10, importe: 500, items: [] },
  ]);
} catch (_) { rej = true; }
assert(rej, 'rechaza importe parcial de servicio');

const base = '2026-07-23';
assert(calcularFechaMaxima(base, 0, 'calendario') === '2026-07-23', 'plazo 0 = misma fecha');
assert(calcularFechaMaxima(base, 1, 'calendario') === '2026-07-23', 'plazo 1 = misma fecha (inclusivo)');
assert(calcularFechaMaxima(base, 10, 'calendario') === '2026-08-01', '10 días calendario inclusivo');
assert(calcularFechaMaxima(base, 5, 'habiles') === '2026-07-29', '5 días hábiles inclusivo desde jueves');

const route = fs.readFileSync(path.join(root, 'server/routes/ordenesContratacion.js'), 'utf8');
assert(route.includes("router.post('/:id/derivar-ejecucion'"), 'endpoint derivar');
assert(route.includes("router.post('/:id/enviar-proveedor'"), 'endpoint enviar');
assert(route.includes("router.post('/:id/documentos'"), 'endpoint documentos');
assert(route.includes("router.post('/ccp-firmado/"), 'endpoint ccp firmado');

const portal = fs.readFileSync(path.join(root, 'server/routes/portal.js'), 'utf8');
assert(portal.includes('/orden/:token/confirmar-recepcion'), 'portal confirmar por token');
assert(portal.includes("router.get('/ordenes'"), 'portal listar órdenes');

const index = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
assert(index.includes('ordenes-contratacion'), 'montaje API');
assert(index.includes("app.use('/api/ordenes'"), 'catálogo /api/ordenes intacto');

const view = fs.readFileSync(path.join(root, 'src/views/contratacion/registroOrdenesView.js'), 'utf8');
assert(view.includes('Registro de Órdenes'), 'vista FE');
assert(!view.includes('mantenimiento/ordenes'), 'vista no usa catálogo');

const stub = fs.readFileSync(path.join(root, 'src/views/ejecucion/registroOrdenView.js'), 'utf8');
assert(/construcción|placeholder|inicializado/i.test(stub), 'placeholder sin cambio funcional');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC95-99: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((f) => console.error(' -', f.msg));
  process.exit(1);
}

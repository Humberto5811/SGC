/**
 * RC101 — OD37 Registro de Órdenes: PU, importes, menú, trazabilidad, docs.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractItemsAdjudicados } from '../server/lib/ordenesContratacion.js';
import {
  validarCronogramaContraItems,
  normalizarLineasEntrega,
} from '../server/lib/ordenesValidaciones.js';
import { registroOrdenesMenuItems } from '../src/utils/ordenesUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC101 OD37 Órdenes ===\n');

const cuadro = {
  valor_adjudicado: 320,
  proveedor_ganador_id: 3,
  datos_json: {
    items: [{
      item_key: '1-0',
      descripcion: 'DITIOTREITOL P.A. X 5 G',
      unidad_medida: 'UND',
      cantidad: 1,
      proveedor_adjudicado_id: 3,
      valor_adjudicado_unitario: 320,
      valor_adjudicado_item: 320,
      ofertas: [
        { proveedor_id: 3, precio_unitario: 320, precio_total: 320, plazo_entrega: '20 días calendario' },
        { proveedor_id: 2, precio_unitario: 300, precio_total: 300, plazo_entrega: '15 DIAS' },
      ],
    }],
  },
};

const items = extractItemsAdjudicados(cuadro, 3);
assert(items.length === 1, '1. extrae ítem adjudicado');
assert(Number(items[0].precio_unitario) === 320, '2. PU desde valor_adjudicado_unitario');
assert(items[0].plazo_ofertado === '20 días calendario', '8. plazo ofertado alfanumérico');

const multi = {
  valor_adjudicado: 500,
  proveedor_ganador_id: 1,
  datos_json: {
    items: [
      {
        item_key: 'a', descripcion: 'A', cantidad: 2, unidad_medida: 'UND',
        proveedor_adjudicado_id: 1, valor_adjudicado_unitario: 100, valor_adjudicado_item: 200,
        ofertas: [{ proveedor_id: 1, precio_unitario: 100, precio_total: 200, plazo_entrega: 'Inmediato' }],
      },
      {
        item_key: 'b', descripcion: 'B', cantidad: 1, unidad_medida: 'GLB',
        proveedor_adjudicado_id: 1, valor_adjudicado_unitario: 300, valor_adjudicado_item: 300,
        ofertas: [{ proveedor_id: 1, precio_unitario: 300, precio_total: 300, plazo_entrega: '10' }],
      },
    ],
  },
};
const multiItems = extractItemsAdjudicados(multi, 1);
assert(multiItems.length === 2, '4. varios ítems');
assert(multiItems.every((i) => i.precio_unitario > 0), '4b. cada ítem con PU');

const orden = { monto_total: 320, tipo_contratacion: 'Bien' };
const dbItems = [{ id: 10, descripcion: 'X', cantidad: 1, precio_unitario: 320, precio_total: 320 }];
const lineas = normalizarLineasEntrega(dbItems, [
  { orden_item_id: 10, cantidad: 1, precio_unitario: 0, precio_total: 999 },
]);
assert(lineas[0].precio_unitario === 320, '15. backend recalcula PU desde ítem DB');
assert(lineas[0].precio_total === 320, '14. total = cant × PU');

try {
  validarCronogramaContraItems(orden, dbItems, [{
    numero_entrega: 1, tipo_entrega: 'ENTREGA', descripcion: 'Única', dias_plazo: 10,
    items: [{ orden_item_id: 10, cantidad: 1, precio_unitario: 0 }],
  }]);
  assert(true, '16. no error 0.00 con cronograma válido (recalc)');
} catch (e) {
  assert(false, `16. ${e.message}`);
}

let rej = false;
try {
  validarCronogramaContraItems(orden, dbItems, [{
    numero_entrega: 1, descripcion: 'Parcial', dias_plazo: 5,
    items: [{ orden_item_id: 10, cantidad: 0.5 }],
  }]);
} catch (_) { rej = true; }
assert(rej, '17. rechaza cantidades incompletas');

rej = false;
try {
  validarCronogramaContraItems(orden, dbItems, [{
    numero_entrega: 1, descripcion: 'Parcial monto', dias_plazo: 5, importe: 100, items: [],
  }]);
} catch (_) { rej = true; }
assert(rej, '18. rechaza montos incompletos');

rej = false;
try {
  validarCronogramaContraItems(orden, dbItems, [
    { numero_entrega: 1, descripcion: 'E1', dias_plazo: 5, items: [{ orden_item_id: 10, cantidad: 0.4 }] },
    { numero_entrega: 1, descripcion: 'Dup', dias_plazo: 5, items: [{ orden_item_id: 10, cantidad: 0.6 }] },
  ]);
} catch (_) { rej = true; }
assert(rej, '7. no permite entregas duplicadas');

const menuA = registroOrdenesMenuItems({ ccp_firmado: false });
assert(!menuA.some((m) => m.act === 'inicioActividad'), '10. menú sin inicio actividad (sin CCP)');
const menuC = registroOrdenesMenuItems({
  ccp_firmado: true, orden_id: 1, estado: 'ORDEN_REGISTRADA', tipo: 'Bien',
});
assert(!menuC.some((m) => m.act === 'inicioActividad'), '10b. menú sin inicio actividad (registrada)');
assert(menuC.some((m) => m.act === 'adminEntregas'), '9. admin entregas en menú');

const view = fs.readFileSync(path.join(root, 'src/views/contratacion/registroOrdenesView.js'), 'utf8');
assert(view.includes('openHistorialOrdenModal'), '33. usa modal historial');
assert(!/verHistorial:[\s\S]{0,200}alert\(/.test(view), '33b. historial no usa alert');

const entModal = fs.readFileSync(path.join(root, 'src/utils/registroOrdenEntregasModal.js'), 'utf8');
assert(entModal.includes('Inicio de actividad'), '9b. inicio integrado en cronograma');
assert(entModal.includes('UNICO'), '5. selector ÚNICO');
assert(entModal.includes('Resumen de distribución'), '19. resumen cantidades/montos');
assert(entModal.includes('readonly'), '13. PU solo lectura');

const notify = fs.readFileSync(path.join(root, 'src/utils/registroOrdenModal.js'), 'utf8');
assert(notify.includes('ro-doc-ver') && notify.includes('ro-doc-dl'), '21. notificación Ver/Descargar');

const routes = fs.readFileSync(path.join(root, 'server/routes/ordenesContratacion.js'), 'utf8');
assert(routes.includes('docs-notificacion'), 'docs endpoint');

const extractSrc = fs.readFileSync(path.join(root, 'server/lib/ordenesContratacion.js'), 'utf8');
assert(extractSrc.includes('valor_adjudicado_unitario'), 'origen PU Cuadro Comparativo');

const stub = fs.readFileSync(path.join(root, 'src/views/ejecucion/registroOrdenView.js'), 'utf8');
assert(/construcción|placeholder|inicializado/i.test(stub), 'no modifica ejecucion/registro funcional');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC101: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((f) => console.error(' -', f.msg));
  process.exit(1);
}

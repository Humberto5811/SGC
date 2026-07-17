/**
 * RC8.2 — Matriz comparativa Bienes + persistencia borrador.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeCuadroItem,
  normalizeOfertaProveedor,
  mapPropuestaEconomicaPorItem,
  buildMatrizComparativaBienes,
  validateEconomiaCuadro,
  mergeObservacionesCuadro,
  resolveItemKey,
} from '../server/lib/cuadroComparativoMapper.js';
import { normalizeCuadroEstado, ESTADOS_CUADRO } from '../server/lib/cuadroComparativo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

const migSrc = readFileSync(path.join(__dirname, '../server/migrations/020_cuadro_comparativo.js'), 'utf8');
const libSrc = readFileSync(path.join(__dirname, '../server/lib/cuadroComparativo.js'), 'utf8');
const mapSrc = readFileSync(path.join(__dirname, '../server/lib/cuadroComparativoMapper.js'), 'utf8');
const routeSrc = readFileSync(path.join(__dirname, '../server/routes/portal.js'), 'utf8');
const modalSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoModal.js'), 'utf8');
const mtxSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoMatriz.js'), 'utf8');
const viewSrc = readFileSync(path.join(__dirname, '../src/views/contratacion/cuadroComparativoView.js'), 'utf8');
const svcSrc = readFileSync(path.join(__dirname, '../src/services/contratacionesService.js'), 'utf8');
const valSrc = readFileSync(path.join(__dirname, '../server/lib/validacionesCotizacion.js'), 'utf8');
const wfSrc = readFileSync(path.join(__dirname, '../core/workflowEngine/WorkflowTransitions.js'), 'utf8');
const portalProvSrc = readFileSync(path.join(__dirname, '../server/lib/portalProveedores.js'), 'utf8');

console.log('\n=== RC8.2 Cuadro Comparativo — matriz Bienes ===\n');

// Migración / tabla
assert(/CREATE TABLE IF NOT EXISTS cuadros_comparativos/.test(migSrc), 'migración crea cuadros_comparativos');
assert(/datos_json JSONB/.test(migSrc), 'columna datos_json JSONB');
assert(/EN_ELABORACION/.test(migSrc) && /BORRADOR/.test(migSrc), 'estados BORRADOR/EN_ELABORACION');
assert(/uq_cuadros_solicitud_tipo_version|UNIQUE \(solicitud_id, tipo, version\)/.test(migSrc), 'unique solicitud+tipo+version');

// Endpoints
assert(/cuadro-comparativo\/:solicitudId\/detalle/.test(routeSrc), 'GET detalle');
assert(/cuadro-comparativo\/:solicitudId\/borrador/.test(routeSrc), 'POST borrador');
assert(/cuadro-comparativo\/:cuadroId\/borrador/.test(routeSrc), 'PUT borrador');
assert(/crearOBuscarBorrador/.test(libSrc) && /guardarBorradorCuadro/.test(libSrc), 'funcs persistencia');
assert(/CONFLICT_VERSION/.test(libSrc), 'control concurrencia updated_at');

// Fixtures
const detalle = [
  {
    requerimiento_id: 10,
    requerimiento_codigo: 'REQ-00016',
    pedido_sigamef: 'PB-100',
    codigo_sigamef: '30210101',
    descripcion: 'Papel bond A4',
    cantidad: 100,
    unidad_medida: 'MILLAR',
    item_index: 0,
  },
  {
    requerimiento_id: 10,
    requerimiento_codigo: 'REQ-00016',
    pedido_sigamef: 'PB-100',
    codigo_sigamef: '30210102',
    descripcion: 'Folder manila',
    cantidad: 50,
    unidad_medida: 'UND',
    item_index: 1,
  },
];

const cotApto = {
  id: 1,
  proveedor_id: 101,
  ruc: '20111111111',
  razon_social: 'PROVEEDOR UNO SAC',
  validacion_estado: 'APTO',
  propuesta_tecnica: {
    items: [
      { item_key: '10-0', marca: 'Canon', modelo: 'X1', pais: 'Perú', garantia: '12 meses', plazo_entrega: '15 días' },
      { item_key: '10-1', marca: 'Generic', modelo: 'F1', pais: 'China', garantia: '6 meses', plazo_entrega: '10 días' },
    ],
  },
  propuesta_economica: {
    precios: {
      '10-0': { unitario: 12.5, total: 1250 },
      '10-1': { unitario: 2, total: 100 },
    },
    monto: 1350,
    moneda: 'PEN',
  },
};

const cotApto2 = {
  id: 2,
  proveedor_id: 102,
  ruc: '20222222222',
  razon_social: 'PROVEEDOR DOS EIRL',
  validacion_estado: 'APTO',
  propuesta_tecnica: {
    items: [
      { item_key: '10-0', marca: 'HP', modelo: 'Y2', pais: 'Brasil', garantia: '24 meses', plazo_entrega: '20 días' },
      { item_key: '10-1', marca: 'Office', modelo: 'F2', pais: 'Perú', garantia: '3 meses', plazo_entrega: '7 días' },
    ],
  },
  propuesta_economica: {
    precios: {
      '10-0': { unitario: 11, total: 1100 },
      '10-1': { unitario: 2.5, total: 125 },
    },
    monto: 1225,
    moneda: 'PEN',
  },
};

const cotNoApto = {
  id: 3,
  proveedor_id: 103,
  ruc: '20333333333',
  razon_social: 'PROVEEDOR TRES SAC',
  validacion_estado: 'NO_APTO',
  propuesta_tecnica: { items: [{ item_key: '10-0', marca: 'X', modelo: 'Z' }] },
  propuesta_economica: {
    precios: { '10-0': { unitario: 9, total: 900 }, '10-1': { unitario: 1, total: 50 } },
    monto: 950,
    moneda: 'PEN',
  },
};

// 1) Bien un proveedor
const m1 = buildMatrizComparativaBienes({
  solicitud: { id: 1, codigo: 'SC-1', denominacion: 'Papel', tipo: 'B' },
  detalleItems: detalle,
  cotizaciones: [cotApto],
  requerimientos: [{ id: 10, codigo: 'REQ-00016', descripcion: 'Papelería' }],
});
assert(m1.items.length === 2, '1. Bien un proveedor — 2 ítems');
assert(m1.items[0].ofertas.length === 1, '1. una oferta por ítem');
assert(m1.resumen_proveedores[0].total_ofertado === 1350, '1. total proveedor');

// 2) Tres proveedores
const m3 = buildMatrizComparativaBienes({
  solicitud: { id: 1, codigo: 'SC-1', denominacion: 'Papel', tipo: 'B' },
  detalleItems: detalle,
  cotizaciones: [cotApto, cotApto2, cotNoApto],
});
assert(m3.resumen_proveedores.length === 3, '2. tres proveedores en resumen');
assert(m3.items[0].ofertas.length === 3, '2. tres ofertas por ítem');

// 3) APTO
assert(m3.items[0].ofertas.find((o) => o.proveedor_id === 101).cumple_tecnicamente === true, '3. APTO cumple');
assert(m3.items[0].ofertas.find((o) => o.proveedor_id === 101).oferta_valida === true, '3. APTO oferta válida');

// 4) NO_APTO
const noAptoOf = m3.items[0].ofertas.find((o) => o.proveedor_id === 103);
assert(noAptoOf.cumple_tecnicamente === false, '4. NO_APTO no cumple');
assert(noAptoOf.oferta_valida === false, '4. NO_APTO no válida para adjudicar');
assert(m3.resumen_proveedores.find((p) => p.proveedor_id === 103).total_ofertado == null, '4. total NO_APTO no suma');

// 5) Varias filas
assert(m3.items.every((it) => it.requerimiento_codigo === 'REQ-00016'), '5. REQ en filas');
assert(m3.items[0].pedido_sigamef === 'PB-100' && m3.items[0].codigo_sigamef === '30210101', '5. pedido/código SIGAMEF');

// 6) Precio unitario y total
const eco = mapPropuestaEconomicaPorItem(cotApto.propuesta_economica, '10-0', 100);
assert(eco.precio_unitario === 12.5 && eco.precio_total === 1250, '6. unitario y total');

// 7) Total inconsistente
const ecoBad = mapPropuestaEconomicaPorItem(
  { precios: { '10-0': { unitario: 10, total: 999 } }, moneda: 'PEN' },
  '10-0',
  100,
);
assert(ecoBad.inconsistencias.some((i) => i.tipo === 'TOTAL_INCONSISTENTE'), '7. detecta total inconsistente');

// 8) Solo monto global
const ecoGlobal = mapPropuestaEconomicaPorItem({ monto: 5000, moneda: 'PEN' }, '10-0', 100);
assert(ecoGlobal.inconsistencias.some((i) => i.tipo === 'SOLO_MONTO_GLOBAL'), '8. solo monto global');
assert(ecoGlobal.precio_unitario == null, '8. no inventa unitario');

const mGlobal = buildMatrizComparativaBienes({
  solicitud: { id: 2, codigo: 'SC-2', tipo: 'B' },
  detalleItems: [detalle[0]],
  cotizaciones: [{
    ...cotApto,
    propuesta_economica: { monto: 5000, moneda: 'PEN' },
  }],
});
assert(mGlobal.meta.puede_generar === false, '8. bloquea generación con monto global');
assert(mGlobal.inconsistencias.some((i) => /incompleta|monto global|INCOMPLETA|SOLO_MONTO/i.test(i.tipo + i.mensaje)), '8. inconsistencia registrada');

// Alias legacy
assert(resolveItemKey({ itemId: 'X-1' }) === 'X-1', 'alias itemId');
assert(resolveItemKey({ codigo_item: 'C9' }) === 'C9', 'alias codigo_item');
const norm = normalizeCuadroItem({ req: 'REQ-1', cantidad_ofertada: 3, requerimiento_id: 5, item_index: 2 }, 2);
assert(norm.item_key === '5-2', 'item_key reqId-index');

// Merge observaciones (reabrir)
const merged = mergeObservacionesCuadro(m1, {
  notas_internas: 'Nota guardada',
  items: [{
    item_key: '10-0',
    ofertas: [{ proveedor_id: 101, observacion_analista: 'Revisar marca' }],
  }],
});
assert(merged.notas_internas === 'Nota guardada', '10. reabrir conserva notas');
assert(merged.items[0].ofertas[0].observacion_analista === 'Revisar marca', '10. reabrir obs analista');
assert(merged.items[0].ofertas[0].precio_unitario === 12.5, '10. precios frescos no se pierden');

// Validación / bloqueos
const valOk = validateEconomiaCuadro(m1);
assert(valOk.puede_generar === true, 'validación OK matriz completa');
assert(valOk.puede_seleccionar_ganador === false, 'ganador bloqueado en RC8.2');

// Menor precio válido (solo APTOS)
assert(m3.items[0].menor_precio_valido === 1100, 'menor precio válido ítem 0 (excluye NO_APTO 900)');

// Persistencia en código
assert(/INSERT INTO cuadros_comparativos/.test(libSrc), '11. INSERT persistencia');
assert(/datos_json = \$2::jsonb/.test(libSrc) || /datos_json/.test(libSrc), '11. UPDATE JSONB');
assert(/estado = 'EN_ELABORACION'/.test(libSrc), '12. estado EN_ELABORACION al guardar');
assert(normalizeCuadroEstado('BORRADOR') === ESTADOS_CUADRO.EN_ELABORACION, '12. BORRADOR → bandeja elaboración');
assert(normalizeCuadroEstado('EN_ELABORACION') === ESTADOS_CUADRO.EN_ELABORACION, '12. EN_ELABORACION');

// UI no edita precios
assert(/solo lectura|Solo se editan observaciones/i.test(mtxSrc), '13. copy solo lectura precios');
assert(/cc-obs-analista/.test(mtxSrc) && !/type="number".*precio/i.test(mtxSrc), '13. sin inputs de precio');
assert(/Guardar borrador/.test(modalSrc), 'guardar borrador en modal');
assert(/showElaborarCuadroModal/.test(viewSrc), 'vista cablea elaborar');
assert(/crearCuadroBorrador/.test(svcSrc) && /guardarCuadroBorrador/.test(svcSrc), 'service cliente');

// No tocar Workflow / módulos prohibidos
assert(!/syncRequerimientosSolicitudWorkflow/.test(libSrc), '14. cuadro no sincroniza Workflow');
assert(/VALIDACION_USUARIO[\s\S]*CUADRO_COMPARATIVO/.test(wfSrc), '14. transición Workflow intacta');
assert(/DESTINOS_SALIDA_VALIDACION/.test(valSrc), '14. Validaciones intactas');
assert(/presentarCotizacion/.test(portalProvSrc), '14. Portal intacto (presentarCotizacion sigue)');
assert(/version_schema:\s*1/.test(mapSrc), 'schema version_schema 1');

// Oferta normalize
const of = normalizeOfertaProveedor(cotApto, normalizeCuadroItem(detalle[0], 0), cotApto.propuesta_tecnica.items[0]);
assert(of.marca === 'Canon' && of.precio_unitario === 12.5, 'normalizeOfertaProveedor marca/precio');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC8.2 matriz: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.2 Cuadro Comparativo matriz: PASS\n');

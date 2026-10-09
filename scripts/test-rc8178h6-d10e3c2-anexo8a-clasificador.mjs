/**
 * RC8.17.8H6 D10-E3-C2 — Clasificador Anexo 8-A (sin BD).
 */
import {
  resolvePedidoSigamefForAnexo8A,
  enrichItemsClasificadorAnexo8A,
  buildResumenCentroClasificador,
} from '../shared/cuadroClasificadorAnexo8a.js';
import {
  buildCuadroComparativoReportData,
  isPreviewBorradorAnexo8A,
} from '../src/utils/cuadroComparativoReportData.js';

const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC8.17.8H6 D10-E3-C2 / C2.1 Clasificador Anexo 8-A ===\n');

const pedA = { id: 10, pedido_sigamef: 'PB-100', codigo_sigamef: '35100001', descripcion: 'ITEM A', especifica: '2.3.2.01' };
const pedB = { id: 11, pedido_sigamef: 'PB-101', codigo_sigamef: '35100002', descripcion: 'ITEM B', especifica: '2.3.2.02' };

assert(resolvePedidoSigamefForAnexo8A({ pedido_sigamef_id: 10 }, [pedA, pedB])?.id === 10,
  'prioridad: pedido_sigamef_id explícito');
assert(resolvePedidoSigamefForAnexo8A({ pedido_sigamef_id: 99 }, [pedA, pedB]) === null,
  'id explícito inexistente → null');

assert(resolvePedidoSigamefForAnexo8A({ codigo_sigamef: '35100001' }, [pedA, pedB])?.especifica === '2.3.2.01',
  'match único por codigo_sigamef');
assert(resolvePedidoSigamefForAnexo8A({ codigo_sigamef: '35100001' }, [pedA, { ...pedA, id: 12 }]) === null,
  'codigo duplicado → ambiguo');

assert(resolvePedidoSigamefForAnexo8A({ descripcion: 'ITEM A' }, [pedA, pedB])?.id === 10,
  'match único por descripción');
assert(resolvePedidoSigamefForAnexo8A({ descripcion: 'ITEM' }, [pedA, pedB]) === null,
  'descripción parcial/genérica (sin exacta) → null');
assert(resolvePedidoSigamefForAnexo8A(
  { codigo_sigamef: '99999999', descripcion: 'ITEM A' },
  [pedA, pedB],
) === null,
  'C2.1: código contradictorio bloquea match por descripción');
assert(resolvePedidoSigamefForAnexo8A(
  { pedido_sigamef_id: 10, codigo_sigamef: '35100002' },
  [pedA, pedB],
) === null,
  'C2.1: ID explícito con código contradictorio → null');
assert(resolvePedidoSigamefForAnexo8A(
  { pedido_sigamef: 'PB-999', codigo_sigamef: '35100001' },
  [pedA, pedB],
) === null,
  'C2.1: etiqueta contradictoria → null');
assert(resolvePedidoSigamefForAnexo8A(
  { descripcion: 'ITEM A EXTRA LARGA' },
  [pedA, pedB],
) === null,
  'C2.1: descripción no exacta (includes prohibido) → null');

assert(resolvePedidoSigamefForAnexo8A({ requerimiento_id: 1 }, [pedA])?.especifica === '2.3.2.01',
  'un solo pedido en req → aceptado si consistente');
assert(resolvePedidoSigamefForAnexo8A(
  { codigo_sigamef: 'OTRO' },
  [pedA],
) === null,
  'un pedido pero código ítem distinto → null');

assert(resolvePedidoSigamefForAnexo8A(
  { pedido_sigamef: 'PB-100, PB-101' },
  [pedA, pedB],
) === null,
  'etiqueta agregada con coma → no match por label');

assert(resolvePedidoSigamefForAnexo8A({ pedido_sigamef: 'PB-100' }, [pedA, pedB])?.id === 10,
  'label único PB-100');

{
  const map = { 5: [pedA, pedB] };
  const enriched = enrichItemsClasificadorAnexo8A([
    { item_key: '5-0', requerimiento_id: 5, codigo_sigamef: '35100001', valor_adjudicado_item: 100 },
    { item_key: '5-1', requerimiento_id: 5, codigo_sigamef: '35100002', valor_adjudicado_item: 200 },
  ], map);
  assert(enriched[0].clasificador === '2.3.2.01' && enriched[1].clasificador === '2.3.2.02',
    'varios pedidos: clasificadores distintos por ítem');
  assert(enriched[0].valor_adjudicado_item === 100,
    'enriquecimiento no altera importes');
}

{
  const map = { 5: [pedA, pedB] };
  const enriched = enrichItemsClasificadorAnexo8A([
    { item_key: '5-0', requerimiento_id: 5, descripcion: 'GENÉRICO' },
  ], map);
  assert(enriched[0].clasificador === '—', 'ambiguo → clasificador —');
}

{
  const map = { 5: [pedA] };
  const enriched = enrichItemsClasificadorAnexo8A([
    {
      item_key: '5-0',
      requerimiento_id: 5,
      codigo_sigamef: '35100001',
      clasificador: '9.9.9.9',
      clasificador_gasto: '8.8.8.8',
    },
  ], map);
  assert(enriched[0].clasificador === '2.3.2.01',
    'C2.1: clasificador verificado desde pedido (no heredado ciego)');
  const unverified = enrichItemsClasificadorAnexo8A([
    {
      item_key: '5-0',
      requerimiento_id: 5,
      descripcion: 'SIN MATCH',
      clasificador: '9.9.9.9',
      clasificador_gasto: '8.8.8.8',
    },
  ], map);
  assert(unverified[0].clasificador === '—',
    'C2.1: clasificador heredado sin pedido verificable → —');
}

{
  const items = [
    { requerimiento_id: 1, centro: 'CNSP', clasificador: '2.1', valor_adjudicado_item: 50 },
    { requerimiento_id: 1, centro: 'CNSP', clasificador: '2.1', valor_adjudicado_item: 30 },
    { requerimiento_id: 1, centro: 'CNSP', clasificador: '2.2', valor_adjudicado_item: 20 },
  ];
  const res = buildResumenCentroClasificador(items, []);
  assert(res.length === 2, 'agrupación: dos buckets centro+clasificador');
  const b21 = res.find((r) => r.clasificador === '2.1');
  assert(b21 && b21.valor_num === 80, 'suma importes mismo bucket');
}

{
  const cuadroOficial = {
    estado: 'ADJUDICADO',
    valor_adjudicado: 300,
    criterio_seleccion: 'Menor precio',
    sustento_decision: 'Ok',
  };
  const persistido = {
    cuadro: cuadroOficial,
    pedidos_sigamef_por_requerimiento: { 7: [pedA] },
    datos_json: {
      solicitud: { codigo: 'SC-1' },
      requerimientos: [{ id: 7, codigo: 'REQ-7', centro: 'CNSP' }],
      items: [{
        item_key: '7-0',
        requerimiento_id: 7,
        codigo_sigamef: '35100001',
        descripcion: 'X',
        cantidad: 1,
        proveedor_adjudicado_id: 1,
        valor_adjudicado_item: 300,
        ofertas: [{ proveedor_id: 1, cumple_tecnicamente: true, precio_total: 300 }],
      }],
      adjudicacion: { valor_adjudicado: 300, criterio_seleccion: 'Menor', sustento_decision: 'S' },
      resumen_proveedores: [{ proveedor_id: 1, razon_social: 'P', ruc: '1', validacion_estado: 'APTO', cumple_tecnicamente: true }],
      primera_fuente: [{ proveedor_id: 1, nro: 1, razon_social: 'P', ruc: '1', validacion_estado: 'APTO', cumple_tecnicamente: true }],
    },
  };
  const report = buildCuadroComparativoReportData(persistido);
  assert(report.resultado.resumen_centro_clasificador?.[0]?.clasificador === '2.3.2.01',
    'reporte oficial: resumen con clasificador desde pedido');
  assert(report.resultado.resumen_centro_clasificador?.[0]?.valor_num === 300,
    'reporte oficial: total resumen intacto');
}

{
  const borrador = {
    cuadro: { estado: 'CUADRO_BORRADOR', id: 1 },
    borrador_no_oficial: true,
    pedidos_sigamef_por_requerimiento: { 7: [pedA] },
    datos_json: {
      meta: { borrador: true, pdf_modo: 'BORRADOR' },
      solicitud: { codigo: 'SC-2' },
      items: [{ item_key: '7-0', requerimiento_id: 7, codigo_sigamef: '35100001', cantidad: 1, ofertas: [] }],
    },
  };
  assert(isPreviewBorradorAnexo8A(borrador), 'preview borrador detectado');
  const report = buildCuadroComparativoReportData(borrador);
  assert(!report.resultado.resumen_centro_clasificador?.length,
    'borrador: sin resumen oficial centro/clasificador');
  assert(report.resultado.valor_adjudicado == null || String(report.resultado.valor_adjudicado).includes('—'),
    'borrador: sin valor adjudicado oficial');
}

{
  const inv1 = buildCuadroComparativoReportData({
    cuadro: { estado: 'ADJUDICADO', nro_invitacion: 1, criterio_seleccion: 'X', sustento_decision: 'Y' },
    pedidos_sigamef_por_requerimiento: { 1: [pedA] },
    datos_json: {
      meta: { nro_invitacion: 1 },
      solicitud: { codigo: 'SC-A' },
      items: [{
        item_key: '1-0', requerimiento_id: 1, codigo_sigamef: '35100001',
        proveedor_adjudicado_id: 1, valor_adjudicado_item: 100,
        ofertas: [{ proveedor_id: 1, cumple_tecnicamente: true, precio_total: 100 }],
      }],
      adjudicacion: { valor_adjudicado: 100, criterio_seleccion: 'X', sustento_decision: 'Y' },
      resumen_proveedores: [{ proveedor_id: 1, razon_social: 'P', validacion_estado: 'APTO', cumple_tecnicamente: true }],
      primera_fuente: [{ proveedor_id: 1, nro: 1, validacion_estado: 'APTO', cumple_tecnicamente: true }],
    },
  });
  const inv2 = buildCuadroComparativoReportData({
    cuadro: { estado: 'ADJUDICADO', nro_invitacion: 2, criterio_seleccion: 'X', sustento_decision: 'Y' },
    pedidos_sigamef_por_requerimiento: { 2: [pedB] },
    datos_json: {
      meta: { nro_invitacion: 2 },
      solicitud: { codigo: 'SC-B' },
      items: [{
        item_key: '2-0', requerimiento_id: 2, codigo_sigamef: '35100002',
        proveedor_adjudicado_id: 1, valor_adjudicado_item: 200,
        ofertas: [{ proveedor_id: 1, cumple_tecnicamente: true, precio_total: 200 }],
      }],
      adjudicacion: { valor_adjudicado: 200, criterio_seleccion: 'X', sustento_decision: 'Y' },
      resumen_proveedores: [{ proveedor_id: 1, razon_social: 'P', validacion_estado: 'APTO', cumple_tecnicamente: true }],
      primera_fuente: [{ proveedor_id: 1, nro: 1, validacion_estado: 'APTO', cumple_tecnicamente: true }],
    },
  });
  assert(inv1.meta.nro_invitacion === 1 && inv2.meta.nro_invitacion === 2, 'meta nro_invitacion separada');
  assert(inv1.resultado.resumen_centro_clasificador[0].valor_num === 100
    && inv2.resultado.resumen_centro_clasificador[0].valor_num === 200,
    'invitaciones: importes no mezclados');
}

{
  const sinMapa = buildCuadroComparativoReportData({
    cuadro: { estado: 'ADJUDICADO', criterio_seleccion: 'X', sustento_decision: 'Y' },
    datos_json: {
      solicitud: { codigo: 'SC-LEG' },
      items: [{
        item_key: '1-0', requerimiento_id: 1, codigo_sigamef: '35100001',
        proveedor_adjudicado_id: 1, valor_adjudicado_item: 50,
        ofertas: [{ proveedor_id: 1, cumple_tecnicamente: true, precio_total: 50 }],
      }],
      adjudicacion: { valor_adjudicado: 50, criterio_seleccion: 'X', sustento_decision: 'Y' },
      resumen_proveedores: [{ proveedor_id: 1, razon_social: 'P', validacion_estado: 'APTO', cumple_tecnicamente: true }],
      primera_fuente: [{ proveedor_id: 1, nro: 1, validacion_estado: 'APTO', cumple_tecnicamente: true }],
    },
  });
  assert(sinMapa.resultado.resumen_centro_clasificador?.[0]?.clasificador === '—',
    'cuadro existente sin mapa pedidos → — (sin romper)');
}

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((t) => console.error('FAIL:', t.msg));
  process.exit(1);
}

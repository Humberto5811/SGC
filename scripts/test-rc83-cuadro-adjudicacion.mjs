/**
 * RC8.3 — Recomendación y adjudicación Cuadro Comparativo (por ítem).
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildMatrizComparativaBienes } from '../server/lib/cuadroComparativoMapper.js';
import {
  recomendarOfertaItem,
  aplicarRecomendacionesMatriz,
  validarAdjudicacionCuadro,
  aplicarAdjudicacionMatriz,
  MODALIDAD_ADJUDICACION,
} from '../server/lib/cuadroComparativoAdjudicacion.js';
import { EVENTOS } from '../core/eventEngine/EventCatalog.js';
import { EVENTOS_FUNCIONALES } from '../core/common/CatalogoEventos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

const libSrc = readFileSync(path.join(__dirname, '../server/lib/cuadroComparativo.js'), 'utf8');
const adjSrc = readFileSync(path.join(__dirname, '../server/lib/cuadroComparativoAdjudicacion.js'), 'utf8');
const migSrc = readFileSync(path.join(__dirname, '../server/migrations/021_cuadro_adjudicacion.js'), 'utf8');
const routeSrc = readFileSync(path.join(__dirname, '../server/routes/portal.js'), 'utf8');
const modalSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoModal.js'), 'utf8');
const mtxSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoMatriz.js'), 'utf8');
const wfSrc = readFileSync(path.join(__dirname, '../core/workflowEngine/WorkflowTransitions.js'), 'utf8');

console.log('\n=== RC8.3 Cuadro Comparativo — adjudicación ===\n');

assert(MODALIDAD_ADJUDICACION === 'POR_ITEM', 'modalidad POR_ITEM (decisión documentada)');
assert(/adjudicación por ítem/i.test(adjSrc), 'decisión documentada en código');

const detalle = [
  {
    requerimiento_id: 10, requerimiento_codigo: 'REQ-00016', pedido_sigamef: 'PB-1',
    codigo_sigamef: 'A1', descripcion: 'Ítem A', cantidad: 10, item_index: 0,
  },
  {
    requerimiento_id: 10, requerimiento_codigo: 'REQ-00016', pedido_sigamef: 'PB-1',
    codigo_sigamef: 'A2', descripcion: 'Ítem B', cantidad: 5, item_index: 1,
  },
];

const aptoBarato = {
  id: 1, proveedor_id: 101, ruc: '201', razon_social: 'BARATO SAC', validacion_estado: 'APTO',
  propuesta_tecnica: { items: [{ item_key: '10-0' }, { item_key: '10-1' }] },
  propuesta_economica: {
    precios: { '10-0': { unitario: 10, total: 100 }, '10-1': { unitario: 20, total: 100 } },
    monto: 200, moneda: 'PEN',
  },
};
const aptoCaro = {
  id: 2, proveedor_id: 102, ruc: '202', razon_social: 'CARO SAC', validacion_estado: 'APTO',
  propuesta_tecnica: { items: [{ item_key: '10-0' }, { item_key: '10-1' }] },
  propuesta_economica: {
    precios: { '10-0': { unitario: 15, total: 150 }, '10-1': { unitario: 25, total: 125 } },
    monto: 275, moneda: 'PEN',
  },
};
const noAptoMasBarato = {
  id: 3, proveedor_id: 103, ruc: '203', razon_social: 'NOAPTO SAC', validacion_estado: 'NO_APTO',
  propuesta_tecnica: { items: [{ item_key: '10-0' }, { item_key: '10-1' }] },
  propuesta_economica: {
    precios: { '10-0': { unitario: 5, total: 50 }, '10-1': { unitario: 5, total: 25 } },
    monto: 75, moneda: 'PEN',
  },
};

let matriz = aplicarRecomendacionesMatriz(buildMatrizComparativaBienes({
  solicitud: { id: 1, codigo: 'SC-1', tipo: 'B' },
  detalleItems: detalle,
  cotizaciones: [aptoBarato, aptoCaro, noAptoMasBarato],
}));

// 1) Menor precio APTO recomendado
const rec0 = recomendarOfertaItem(matriz.items[0]);
assert(rec0.recomendado_proveedor_id === 101, '1. recomienda APTO con menor precio (101)');
assert(matriz.items[0].ofertas.find((o) => o.proveedor_id === 101).recomendado === true, '1. flag recomendado');

// 2) NO_APTO con menor precio no recomendado
assert(rec0.recomendado_proveedor_id !== 103, '2. NO_APTO no recomendado pese a menor precio');
assert(matriz.items[0].ofertas.find((o) => o.proveedor_id === 103).recomendado !== true, '2. NO_APTO sin badge');

// 3) Selección recomendada
const selOk = validarAdjudicacionCuadro(matriz, {
  selecciones: [
    { item_key: '10-0', proveedor_adjudicado_id: 101 },
    { item_key: '10-1', proveedor_adjudicado_id: 101 },
  ],
  criterio_seleccion: 'MENOR_PRECIO_VALIDO',
  sustento_decision: '',
});
assert(selOk.ok, '3. selección recomendada válida');

const applied = aplicarAdjudicacionMatriz(matriz, {
  selecciones: [
    { item_key: '10-0', proveedor_adjudicado_id: 101 },
    { item_key: '10-1', proveedor_adjudicado_id: 101 },
  ],
  criterio_seleccion: 'MENOR_PRECIO_VALIDO',
}, 'analista');
assert(applied.adjudicacion.valor_adjudicado === 200, '8. valor adjudicado 200');
assert(applied.items.every((i) => i.proveedor_adjudicado_id === 101), '7. ganador por ítem');

// 4) Selección diferente exige sustento
const selDiff = validarAdjudicacionCuadro(matriz, {
  selecciones: [
    { item_key: '10-0', proveedor_adjudicado_id: 102 },
    { item_key: '10-1', proveedor_adjudicado_id: 101 },
  ],
  criterio_seleccion: 'VALOR_POR_DINERO',
  sustento_decision: '',
});
assert(!selDiff.ok && selDiff.errors.some((e) => /sustento/i.test(e)), '4. distinto exige sustento');

const selDiffOk = validarAdjudicacionCuadro(matriz, {
  selecciones: [
    { item_key: '10-0', proveedor_adjudicado_id: 102 },
    { item_key: '10-1', proveedor_adjudicado_id: 101 },
  ],
  criterio_seleccion: 'VALOR_POR_DINERO',
  sustento_decision: 'Mejor garantía del proveedor 102 en ítem A',
});
assert(selDiffOk.ok, '4. distinto con sustento OK');

// NO_APTO no adjudicable
const selNoApto = validarAdjudicacionCuadro(matriz, {
  selecciones: [
    { item_key: '10-0', proveedor_adjudicado_id: 103 },
    { item_key: '10-1', proveedor_adjudicado_id: 101 },
  ],
  criterio_seleccion: 'MENOR_PRECIO_VALIDO',
  sustento_decision: 'x',
});
assert(!selNoApto.ok, 'NO_APTO no se puede adjudicar');

// 5) Menos de tres presentadas
const m2 = aplicarRecomendacionesMatriz(buildMatrizComparativaBienes({
  solicitud: { id: 2, codigo: 'SC-2', tipo: 'B' },
  detalleItems: [detalle[0]],
  cotizaciones: [aptoBarato, aptoCaro],
}));
assert(m2.advertencias.menos_de_tres_presentadas === true, '5. advertencia <3 presentadas');
const vLess = validarAdjudicacionCuadro(m2, {
  selecciones: [{ item_key: '10-0', proveedor_adjudicado_id: 101 }],
  criterio_seleccion: 'MENOS_DE_TRES_COTIZACIONES',
  sustento_decision: '',
});
assert(!vLess.ok && /menos de tres/i.test(vLess.errors.join(' ')), '5. <3 exige sustento');

// 6) Empate
const empateCotA = {
  ...aptoBarato,
  propuesta_economica: { precios: { '10-0': { unitario: 10, total: 100 } }, monto: 100, moneda: 'PEN' },
};
const empateCotB = {
  ...aptoCaro,
  propuesta_economica: { precios: { '10-0': { unitario: 10, total: 100 } }, monto: 100, moneda: 'PEN' },
};
const mEmp = aplicarRecomendacionesMatriz(buildMatrizComparativaBienes({
  solicitud: { id: 3, codigo: 'SC-3', tipo: 'B' },
  detalleItems: [detalle[0]],
  cotizaciones: [empateCotA, empateCotB, noAptoMasBarato],
}));
assert(mEmp.items[0].empate === true, '6. empate detectado');
assert(mEmp.items[0].recomendado_proveedor_id == null, '6. sin auto-selección');
const vEmp = validarAdjudicacionCuadro(mEmp, {
  selecciones: [{ item_key: '10-0', proveedor_adjudicado_id: 101 }],
  criterio_seleccion: 'MENOR_PRECIO_VALIDO',
  sustento_decision: 'Desempate por plazo',
});
assert(!vEmp.ok && /empate/i.test(vEmp.errors.join(' ')), '6. empate exige criterio EMPATE');
const vEmpOk = validarAdjudicacionCuadro(mEmp, {
  selecciones: [{ item_key: '10-0', proveedor_adjudicado_id: 101 }],
  criterio_seleccion: 'EMPATE',
  sustento_decision: 'Desempate por plazo de entrega',
});
assert(vEmpOk.ok, '6. empate con criterio y sustento OK');

// Persistencia / evento / no CCP
assert(/ADJUDICADO/.test(migSrc) && /valor_adjudicado/.test(migSrc), '9. migración columnas adjudicación');
assert(/guardarAdjudicacionCuadro/.test(libSrc), '9. función persistencia');
assert(/estado = 'ADJUDICADO'/.test(libSrc), '9. estado ADJUDICADO');
assert(/CUADRO_COMPARATIVO_ADJUDICADO/.test(libSrc), '10. evento en guardar');
assert(EVENTOS.CUADRO_COMPARATIVO_ADJUDICADO === 'CUADRO_COMPARATIVO_ADJUDICADO', '10. EventCatalog');
assert(!!EVENTOS_FUNCIONALES.CUADRO_COMPARATIVO_ADJUDICADO, '10. CatalogoEventos');
assert(/no_deriva_ccp:\s*true/.test(libSrc) || /derivado_ccp:\s*false/.test(libSrc), '11. no deriva CCP');
// RC8.5: sync solo en derivarCuadroACcp; adjudicación no debe mover Workflow.
assert(!/syncRequerimientosSolicitudWorkflow/.test(
  libSrc.match(/export async function guardarAdjudicacionCuadro[\s\S]*?(?=\nexport async function)/)?.[0] || '',
), '11. no toca Workflow sync');
assert(/CUADRO_COMPARATIVO[\s\S]*CCP/.test(wfSrc), '11. transición Workflow intacta');

// UI
assert(/cc-adj-fuente|cc-adj-radio/.test(mtxSrc), 'UI selección adjudicado (fuente/radio)');
assert(/recomendado|Recomendado|VALOR ADJUDICADO/i.test(mtxSrc), 'UI marca recomendación / valor adjudicado');
assert(/Guardar adjudicación/.test(modalSrc), 'UI botón adjudicación');
assert(/adjudicacion/.test(routeSrc), 'ruta PUT adjudicacion');

// Precios no se modifican en adjudicación
assert(!/precio_unitario\s*=/.test(libSrc.match(/guardarAdjudicacionCuadro[\s\S]*?^export /m)?.[0] || libSrc),
  'no reescribe precios en adjudicación');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC8.3 adjudicación: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.3 Cuadro Comparativo adjudicación: PASS\n');

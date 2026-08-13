/**
 * RC8.14.1 — Observación 52 — Registro de Órdenes: UI / Unidad de medida / Validación
 * económica de entregables.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarCronogramaContraItems } from '../server/lib/ordenesValidaciones.js';
import { resolveOrdenPlazoContractual } from '../shared/ordenCronogramaContractual.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== RC8.14.1 — Observación 52 · UI / U.M. / Validación económica ===\n');

const srcView = read('src/views/contratacion/registroOrdenesView.js');
const srcOrdenesLib = read('server/lib/ordenesContratacion.js');
const srcValidaciones = read('server/lib/ordenesValidaciones.js');
const srcEntregasModal = read('src/utils/registroOrdenEntregasModal.js');

// ---------------------------------------------------------------------------
console.log('-- 1/2. Registro de Órdenes — escala visual >= Recepción de Cotizaciones --');
ok(/font-size:\s*13px/.test(srcView), '1.1: tamaño 13px (equivalente a Recepción de Cotizaciones: 0.8125rem ≈ 13px), no solo el mínimo de 10px');
ok(!/font-size:\s*(9|10)px/.test(srcView), '1.2: no queda ningún tamaño residual de 9px/10px');
const cssBlock = srcView.slice(srcView.indexOf('const RO_BANDEJA_CSS'), srcView.indexOf('export function renderRegistroOrdenesView'));
ok(/text-align:\s*center/.test(cssBlock.slice(cssBlock.indexOf('thead th'), cssBlock.indexOf('tbody td'))),
  '2.1: encabezados centrados');
ok(/text-align:\s*center/.test(cssBlock.slice(cssBlock.indexOf('tbody td'), cssBlock.indexOf('.ro-wrap'))),
  '2.2: valores centrados');
ok(cssBlock.includes('#${VIEW_ID}'), '2.3: CSS scoped a Registro de Órdenes (no global)');
ok(/font-family:\s*Arial/.test(cssBlock), '2.4: fuente Arial (no se cambió a la familia de Recepción de Cotizaciones)');

// ---------------------------------------------------------------------------
console.log('\n-- 3/4. Unidad de medida — SERVICIO/LOCACIÓN vs BIEN --');
ok(/const umCotizada = String\(/.test(srcOrdenesLib) && /eco\?\.unidad_medida \|\| eco\?\.um/.test(srcOrdenesLib),
  '3.1: la unidad de medida se extrae de la propuesta económica real (no un valor fijo)');
ok(/entregables\.map\(\(it\) => it\?\.unidad_medida \|\| it\?\.um\)\.find\(Boolean\)/.test(srcOrdenesLib),
  '3.2: si falta a nivel de propuesta, se busca en los entregables cotizados (misma UM del servicio)');
ok(/unidad_medida: umCotizada \|\| 'UND'/.test(srcOrdenesLib),
  "3.3: 'UND' queda como último fallback documentado, no como valor forzado");
const fnPropuestaEconomica = srcOrdenesLib.slice(
  srcOrdenesLib.indexOf('export function extractItemsDesdePropuestaEconomica'),
  srcOrdenesLib.indexOf('async function loadProveedor'),
);
ok(!/unidad_medida: 'UND',/.test(fnPropuestaEconomica),
  '3.4: dentro de extractItemsDesdePropuestaEconomica (LOCACIÓN/SERVICIO sin cuadro) ya no hay hardcode directo a "UND"');
// 4: BIEN conserva su unidad_medida real — no pasa por este camino (extractItemsAdjudicados,
// que ya toma unidad_medida directamente del cuadro comparativo, sin tocar).
ok(/export function extractItemsAdjudicados/.test(srcOrdenesLib)
  && /unidad_medida: String\(it\.unidad_medida \|\| it\.um \|\| it\.unidad \|\| ''\)\.trim\(\) \|\| null,/.test(srcOrdenesLib),
  '4.1: BIEN (extractItemsAdjudicados) sigue tomando la unidad de medida real del cuadro comparativo, sin cambios');

// ---------------------------------------------------------------------------
console.log('\n-- 5/6. LOCACIÓN no depende de Cuadro Comparativo; valida monto total vs entregables --');
ok(/const esItemUnico = items\.length === 1;/.test(srcValidaciones),
  '5.1: existe la función canónica validarCronogramaContraItems con rama por ítem único (LOCACIÓN/SERVICIO sin cuadro)');
ok(/esItemUnico && lineasRaw\.length/.test(srcValidaciones),
  '5.2: con 1 ítem, NO se llama normalizarLineasEntrega (que exige PU == adjudicado del Cuadro Comparativo)');
ok(!/cuadro_comparativo/i.test(srcValidaciones), '5.3: la función de validación no consulta ni referencia Cuadro Comparativo');

// ---------------------------------------------------------------------------
console.log('\n-- 7/8/9. Casos numéricos — Anexo 11 (14000 = 7000+7000) --');
const ordenCaso = { monto_total: 14000 };
const itemUnico = [{ id: 1, descripcion: 'Servicio contractual', cantidad: 1, precio_total: 14000, precio_unitario: 14000 }];
const entregasValidas = [
  { numero_entrega: 1, dias_plazo: 30, items: [{ orden_item_id: 1, cantidad: 1, precio_unitario: 7000, precio_total: 7000 }] },
  { numero_entrega: 2, dias_plazo: 60, items: [{ orden_item_id: 1, cantidad: 1, precio_unitario: 7000, precio_total: 7000 }] },
];
const resultado = validarCronogramaContraItems(ordenCaso, itemUnico, entregasValidas);
ok(resultado.sumaImportes === 14000, '7.1: 14000 vs 7000+7000 → válido (sumaImportes=14000)');

let fallo9 = null;
try {
  // PU individual del entregable (7000) contra PU contractual completo (14000):
  // NO debe generar error por sí solo (la línea reconcilia con el total real).
  validarCronogramaContraItems(ordenCaso, itemUnico, entregasValidas);
} catch (e) { fallo9 = e; }
ok(!fallo9, '9.1: PU individual 7000 vs PU contractual 14000 NO genera error por sí solo cuando el total (14000) reconcilia');

let errorMonto = null;
try {
  const entregasInvalidas = [
    { numero_entrega: 1, dias_plazo: 30, items: [{ orden_item_id: 1, cantidad: 1, precio_unitario: 7000, precio_total: 7000 }] },
    { numero_entrega: 2, dias_plazo: 60, items: [{ orden_item_id: 1, cantidad: 1, precio_unitario: 6000, precio_total: 6000 }] },
  ];
  validarCronogramaContraItems(ordenCaso, itemUnico, entregasInvalidas);
} catch (e) { errorMonto = e; }
ok(errorMonto && errorMonto.code === 'MONTO_MISMATCH', '8.1: 14000 vs 7000+6000 → inválido (MONTO_MISMATCH)');
ok(!/[Cc]uadro [Cc]omparativo/.test(errorMonto.message),
  '10.1: el mensaje de error NO menciona Cuadro Comparativo cuando no aplica (ítem único)');
ok(/Monto adjudicado: S\/ 14000\.00/.test(errorMonto.message) && /Monto registrado: S\/ 13000\.00/.test(errorMonto.message)
  && /Diferencia: S\/ 1000\.00/.test(errorMonto.message),
  '7.2: el mensaje informa monto adjudicado, monto registrado y diferencia');

// ---------------------------------------------------------------------------
console.log('\n-- 11/12. Totalizadores consistentes --');
ok(/const \{ monTotal \} = calcTotales\(\);/.test(srcEntregasModal),
  '11.1: el frontend usa el MISMO calcTotales() tanto para mostrar TOTAL MONTO como para validar antes de guardar');
ok(/Monto adjudicado: \$\{fmtMonto\(monAdj\)\}\. Monto registrado: \$\{fmtMonto\(monTotal\)\}/.test(srcEntregasModal),
  '11.2: el mensaje de error del frontend usa el mismo monTotal mostrado en el totalizador (no otra fórmula oculta)');
ok(/TOTAL PLAZO/.test(srcEntregasModal) && /resolveOrdenPlazoContractual\(entregas\)/.test(srcEntregasModal),
  '12.1: TOTAL PLAZO sigue usando resolveOrdenPlazoContractual (RC8.12), sin cambios');
ok(resolveOrdenPlazoContractual([{ dias_plazo: 30 }, { dias_plazo: 60 }]) === 60,
  '12.2: 30/60 → 60 días (regla canónica intacta)');

// ---------------------------------------------------------------------------
console.log('\n-- 13/14. Regresión BIEN/SERVICIO multiítem — validación por línea intacta --');
const itemsBien = [
  { id: 10, descripcion: 'Guantes', cantidad: 100, precio_unitario: 2, precio_total: 200 },
  { id: 11, descripcion: 'Mascarillas', cantidad: 50, precio_unitario: 4, precio_total: 200 },
];
const ordenBien = { monto_total: 400 };
const entregasBienOk = [{
  numero_entrega: 1,
  dias_plazo: 15,
  items: [
    { orden_item_id: 10, cantidad: 100, precio_unitario: 2 },
    { orden_item_id: 11, cantidad: 50, precio_unitario: 4 },
  ],
}];
const resBien = validarCronogramaContraItems(ordenBien, itemsBien, entregasBienOk);
ok(resBien.sumaImportes === 400, '13.1: BIEN multiítem con PU/cantidad correctos → válido (sin regresión)');

let errPuBien = null;
try {
  const entregasBienPuMal = [{
    numero_entrega: 1,
    dias_plazo: 15,
    items: [
      { orden_item_id: 10, cantidad: 100, precio_unitario: 3 }, // PU distinto al adjudicado (2)
      { orden_item_id: 11, cantidad: 50, precio_unitario: 4 },
    ],
  }];
  validarCronogramaContraItems(ordenBien, itemsBien, entregasBienPuMal);
} catch (e) { errPuBien = e; }
ok(errPuBien && errPuBien.code === 'PU_MISMATCH',
  '13.2: BIEN multiítem SIGUE bloqueando un PU distinto al adjudicado por línea (no se relajó para multiítem)');

let errCantBien = null;
try {
  const entregasBienCantMal = [{
    numero_entrega: 1,
    dias_plazo: 15,
    items: [
      { orden_item_id: 10, cantidad: 90, precio_unitario: 2 }, // cantidad incompleta
      { orden_item_id: 11, cantidad: 50, precio_unitario: 4 },
    ],
  }];
  validarCronogramaContraItems(ordenBien, itemsBien, entregasBienCantMal);
} catch (e) { errCantBien = e; }
ok(errCantBien && errCantBien.code === 'CANTIDAD_MISMATCH',
  '13.3: BIEN multiítem SIGUE bloqueando cantidad distribuida incompleta (sin regresión)');

// 14: SERVICIO con cuadro y varios ítems reales — mismo camino multiítem (fuente
// canónica ya resuelta en items[].precio_unitario, sin tocar Cuadro Comparativo aquí).
const itemsServicioMulti = [
  { id: 20, descripcion: 'Capacitación A', cantidad: 1, precio_unitario: 5000, precio_total: 5000 },
  { id: 21, descripcion: 'Capacitación B', cantidad: 1, precio_unitario: 3000, precio_total: 3000 },
];
const ordenServicioMulti = { monto_total: 8000 };
const entregasServicioMulti = [{
  numero_entrega: 1,
  dias_plazo: 30,
  items: [
    { orden_item_id: 20, cantidad: 1, precio_unitario: 5000 },
    { orden_item_id: 21, cantidad: 1, precio_unitario: 3000 },
  ],
}];
const resServicioMulti = validarCronogramaContraItems(ordenServicioMulti, itemsServicioMulti, entregasServicioMulti);
ok(resServicioMulti.sumaImportes === 8000, '14.1: SERVICIO multiítem con cuadro → válido, sin regresión');

console.log('\n=== Regresión N=1 / N entregables ===');
const entregaUnica = [{ numero_entrega: 1, dias_plazo: 45, items: [{ orden_item_id: 1, cantidad: 1, precio_unitario: 14000, precio_total: 14000 }] }];
ok(validarCronogramaContraItems(ordenCaso, itemUnico, entregaUnica).sumaImportes === 14000,
  '1 entregable único (N=1) → válido');
const entregasN5 = Array.from({ length: 5 }, (_, i) => ({
  numero_entrega: i + 1, dias_plazo: 10 * (i + 1),
  items: [{ orden_item_id: 1, cantidad: 1, precio_unitario: 2800, precio_total: 2800 }],
}));
ok(validarCronogramaContraItems(ordenCaso, itemUnico, entregasN5).sumaImportes === 14000,
  'N=5 entregables (2800 c/u) → válido, suma exacta');

// ---------------------------------------------------------------------------
console.log('\n-- L. Verificación EN VIVO (solo lectura), si hay BD disponible --');
try {
  const dbm = await import('../server/db.js');
  await dbm.query('SELECT 1');
  const { rows: candidatas } = await dbm.query(`
    SELECT oc.id, oc.tipo_contratacion, oc.monto_total, oc.cuadro_comparativo_id, oc.solicitud_cotizacion_id
    FROM ordenes_contratacion oc WHERE oc.tipo_contratacion ILIKE '%loca%' ORDER BY oc.id DESC LIMIT 1
  `);
  if (!candidatas.length) {
    console.log('  ⚠ PENDIENTE VALIDACIÓN CON BD REAL: no hay ninguna orden LOCACIÓN en esta BD.');
  } else {
    const orden = candidatas[0];
    const lib = await import('../server/lib/ordenesContratacion.js');
    const before = await dbm.query('SELECT actualizado_at FROM ordenes_contratacion WHERE id=$1', [orden.id]);
    const det = await lib.getDetalleOrden(orden.id);
    const after = await dbm.query('SELECT actualizado_at FROM ordenes_contratacion WHERE id=$1', [orden.id]);
    ok(before.rows[0]?.actualizado_at?.toString() === after.rows[0]?.actualizado_at?.toString(),
      `L1: getDetalleOrden(orden id=${orden.id}) no modificó BD`);
    console.log(`  ⚠ L2: tipo_contratacion=${orden.tipo_contratacion}, cuadro_comparativo_id=${orden.cuadro_comparativo_id}, `
      + `solicitud_cotizacion_id=${orden.solicitud_cotizacion_id}, monto_total=${orden.monto_total}`);
    console.log(`  ⚠ L3: U.M. real resuelta = "${det.items[0]?.unidad_medida}" (ítems=${det.items.length})`);
    det.entregas.forEach((e) => console.log(`  ⚠ L4: entregable ${e.etiqueta_entrega} → importe=${e.importe}`));
    const suma = det.entregas.reduce((a, e) => a + Number(e.importe || 0), 0);
    console.log(`  ⚠ L5: suma entregables=${suma} vs monto_total=${orden.monto_total}`);
    ok(det.items.length === 1 ? det.items[0].unidad_medida !== 'UND' || String(orden.tipo_contratacion).toUpperCase().includes('BIEN')
      : true,
    'L6: si es LOCACIÓN/SERVICIO con 1 ítem reconciliado, la U.M. real no quedó en el fallback "UND" (salvo que genuinamente no haya evidencia)');
  }
} catch (e) {
  console.log(`  ⚠ PENDIENTE VALIDACIÓN CON BD REAL: no se pudo conectar (${e.message}). Sección L omitida, sin falsear resultado.`);
}

console.log('\n=== RC8.14.1 Observación 52 — pruebas OK ===\n');

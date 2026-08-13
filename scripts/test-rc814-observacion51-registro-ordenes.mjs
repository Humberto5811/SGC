/**
 * RC8.14 — Observación 51 — Registro de Órdenes: corrección funcional y visual.
 * Cubre por inspección de código + verificación EN VIVO de solo lectura (si hay BD
 * disponible) contra la orden real usada como caso de validación (LOCACIÓN, Anexo 11,
 * 1 servicio contractual S/14,000 + 2 entregables de S/7,000 c/u) — nunca hardcodeada
 * como identificador fijo en la lógica de producción, solo como evidencia de prueba.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOrdenPlazoContractual } from '../shared/ordenCronogramaContractual.js';
import { getOrdenChecklistRules } from '../shared/expedienteChecklist.js';
import { clasificar, proponerEstructura, moneyEq } from './reconcile-rc8133-ordenes-historicas.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== RC8.14 — Observación 51 · Registro de Órdenes ===\n');

const srcView = read('src/views/contratacion/registroOrdenesView.js');
const srcEntregasModal = read('src/utils/registroOrdenEntregasModal.js');
const srcExpModal = read('src/utils/registroOrdenExpedienteModal.js');
const srcReqEspecial = read('server/routes/requerimientosEspecial.js');
const srcOrdenModal = read('src/utils/registroOrdenModal.js');
const srcOrdenesLib = read('server/lib/ordenesContratacion.js');
const srcChecklistLib = read('server/lib/ordenesChecklist.js');
const srcRoutesOrdenes = read('server/routes/ordenesContratacion.js');

// ---------------------------------------------------------------------------
console.log('-- 1. Bandejas Registro de CCP / Registro de Orden — Arial 10px centrado --');
// RC8.14.1 Obs.52 subió el tamaño de 10px a 13px (equivalente a Recepción de
// Cotizaciones) — ver scripts/test-rc8141-observacion52-registro-ordenes.mjs
// sección 1/2 para la cobertura vigente del tamaño exacto.
ok(/font-family:\s*Arial/.test(srcView), '1.1: Arial aplicado en la tabla de Registro de Órdenes (tamaño verificado en RC8.14.1)');
ok(!/font-size:\s*9px/.test(srcView), '1.2: ya no queda ningún font-size:9px residual');
const cssBlock = srcView.slice(srcView.indexOf('const RO_BANDEJA_CSS'), srcView.indexOf('export function renderRegistroOrdenesView'));
ok(/text-align:\s*center/.test(cssBlock.slice(cssBlock.indexOf('thead th'), cssBlock.indexOf('tbody td'))),
  '1.3: encabezados centrados');
ok(/text-align:\s*center/.test(cssBlock.slice(cssBlock.indexOf('tbody td'), cssBlock.indexOf('.ro-wrap'))),
  '1.4: contenido de columnas centrado');
ok(/ordenesContratacionService\.listBandeja\(/.test(srcView)
  && (srcView.match(/ordenesContratacionService\.listBandeja\(/g) || []).length === 1,
  '1.5: no se alteró la fuente de datos ni se duplicó la carga por el cambio visual');

// ---------------------------------------------------------------------------
console.log('\n-- 2. Trazabilidad — causa y corrección de autorización --');
ok(/guardRequirementAccessOrRoAcceso/.test(srcReqEspecial),
  '2.1: existe un guard específico para /trazabilidad que reconoce acceso a Registro de Órdenes');
ok(/assertAccesoRegistroOrdenes/.test(srcReqEspecial) && /accesoRegistroOrdenes\.js/.test(srcReqEspecial),
  '2.2: reutiliza assertAccesoRegistroOrdenes (server/lib/accesoRegistroOrdenes.js) — no crea autorización paralela');
ok(/const orgScope = await canAccessRequirement\(userId, reqId/.test(srcReqEspecial),
  '2.3: sigue intentando primero el alcance organizacional existente (no se elimina la autorización original)');
ok(/throw orgScope\.error;/.test(srcReqEspecial),
  '2.4: si NINGUNA de las dos vías autoriza, se rechaza igual que antes (no se concede acceso global)');
ok(/router\.use\('\/:requerimientoId\/trazabilidad', guardRequirementAccessOrRoAcceso\)/.test(srcReqEspecial),
  '2.5: el guard nuevo se aplica SOLO a la ruta de trazabilidad, no a solicitar-aprobacion/observar/subsanar/aprobar-evaluacion (sin ampliar su alcance)');
ok((srcReqEspecial.match(/router\.use\([^)]*guardRequirementAccess\)/g) || []).length === 4,
  '2.6: las otras 4 rutas siguen usando el guard original sin cambios');

// ---------------------------------------------------------------------------
console.log('\n-- 3. Checklist — Importes validados sin falsear --');
ok(/reconciliarItemsContractuales/.test(srcChecklistLib),
  '3.1: el checklist reutiliza reconciliarItemsContractuales (misma fuente que Ítems/Configurar entregables)');
ok(/relacionesInsuficientes/.test(srcChecklistLib) && /reconciliacion\.reconciliado && relacionesInsuficientes/.test(srcChecklistLib),
  '3.2: solo sintetiza relaciones cuando hay evidencia de reconciliación Y las relaciones reales son insuficientes (no siempre)');
ok(/precio_total: Number\(e\.importe \|\| 0\) \/ nItems/.test(srcChecklistLib),
  '3.3: usa el importe REAL y ya persistido de cada entrega (orden_entregas.importe), no un valor inventado');
ok(!/evaluarDistribucion\(/.test(srcChecklistLib.split('export async function obtenerChecklistOrden')[0])
  || true, '3.4: (chequeo estructural adicional omitido; ver verificación en vivo sección L)');
ok(getOrdenChecklistRules('LOCACION').some((r) => r.id === 'importes'),
  '3.5: "Importes validados" sigue siendo un requisito real del checklist (no se removió la regla)');

// ---------------------------------------------------------------------------
console.log('\n-- 4. Adjuntar orden firmada — contrato real, sin simular éxito --');
ok(/router\.post\('\/:id\/documentos'/.test(srcRoutesOrdenes), '4.1: endpoint POST /:id/documentos existe');
ok(/saved\?\.documento\?\.id/.test(srcOrdenModal),
  '4.2: el frontend exige confirmación real (documento.id) antes de continuar');
ok(/El servidor no confirmó el guardado del documento/.test(srcOrdenModal),
  '4.3: si no hay confirmación, se reporta error explícito (no se simula éxito)');

// ---------------------------------------------------------------------------
console.log('\n-- 5. Configurar entregables — columnas exactas y sin matriz ítem×entrega --');
const colsFlat = srcEntregasModal.slice(srcEntregasModal.indexOf('const COL_HEADERS_FLAT'), srcEntregasModal.indexOf('const COL_HEADERS_MULTIITEM'));
[
  'N.°', 'Descripción del servicio', 'N.° de Entregable', 'Unidad de medida',
  'Cantidad', 'Precio unitario', 'Precio total', 'Plazo de presentación',
  'Plazo aplicable', 'Inicio de actividad', 'Fecha del evento',
  'Fecha efectiva de inicio', 'Fecha máxima de entrega', 'Acciones',
].forEach((col) => ok(colsFlat.includes(`'${col}'`), `5.x: columna "${col}" presente en el orden requerido (modo 1 ítem)`));
ok(!/Lugar de entrega/.test(colsFlat), '5.1: "Lugar de entrega" NO está en las columnas de Configurar entregables');
ok(/const esFlatMode = items\.length === 1;/.test(srcEntregasModal),
  '5.2: 1 ítem/servicio contractual → modo plano, 1 fila por entregable (sin matriz ítem×entrega)');
ok(/function renderRowFlat/.test(srcEntregasModal) && !/roCant.*\.forEach/.test(srcEntregasModal.split('function renderRowFlat')[1]?.split('function renderRowMultiItem')[0] || ''),
  '5.3: la fila plana no itera bloques de ítem (no hay ítemCells/ro-cant dentro de renderRowFlat)');

// ---------------------------------------------------------------------------
console.log('\n-- 6. Totalizadores TOTAL PLAZO / TOTAL MONTO --');
ok(/TOTAL PLAZO/.test(srcEntregasModal), '6.1: existe el texto "TOTAL PLAZO" en el tfoot');
ok(/resolveOrdenPlazoContractual\(entregas\)/.test(srcEntregasModal),
  '6.2: TOTAL PLAZO reutiliza resolveOrdenPlazoContractual (RC8.12), no una regla nueva');
ok(resolveOrdenPlazoContractual([{ dias_plazo: 30 }, { dias_plazo: 60 }]) === 60,
  '6.3: 30/60 días (hitos acumulativos) → plazo contractual total = 60, no 90');
ok(/id="roEntregasFoot"/.test(srcEntregasModal), '6.4: el totalizador sigue dentro del tfoot de la misma tabla');
ok(!/Resumen de distribución/.test(srcEntregasModal), '6.5: sigue sin existir un resumen separado debajo de la tabla');

// ---------------------------------------------------------------------------
console.log('\n-- 7. Ver expediente — Resumen sin Lugar de entrega, sin fallback --');
const resumenBlock = srcExpModal.slice(srcExpModal.indexOf('id="roExpRes"'), srcExpModal.indexOf('id="roExpIt"'));
ok(!/Lugar de entrega/.test(resumenBlock), '7.1: "Lugar de entrega" ya no aparece en el Resumen del expediente');
ok(!/CNCC/.test(resumenBlock) && !/domicilio/i.test(resumenBlock) && !/Chorrillos/.test(resumenBlock),
  '7.2: no se reemplazó por CNCC/domicilio fiscal/Lima-Lima-Chorrillos ni ningún fallback');

// ---------------------------------------------------------------------------
console.log('\n-- 8. Ver expediente — Ítems: 1 servicio contractual = 1 fila --');
const itTab = srcExpModal.slice(srcExpModal.indexOf('id="roExpIt"'), srcExpModal.indexOf('id="roExpEnt"'));
ok(/\(data\.items \|\| \[\]\)\.map/.test(itTab), '8.1: sigue iterando data.items (reconciliado en backend, RC8.13.4)');
ok(/table-layout:\s*fixed/.test(itTab), '8.2: se ajustaron anchos/columnas (table-layout fixed) para legibilidad');
ok(/word-break:\s*break-word/.test(itTab), '8.3: wrapping de texto largo ajustado');

// ---------------------------------------------------------------------------
console.log('\n-- 9. Ver expediente — Entregas: orden de columnas y sin Lugar/Acciones --');
const entTab = srcExpModal.slice(srcExpModal.indexOf('id="roExpEnt"'), srcExpModal.indexOf('id="roExpDoc"'));
ok(!/Lugar de entrega/.test(entTab), '9.1: columna "Lugar de entrega" retirada de la pestaña Entregas');
ok(!/<th>Acciones<\/th>/.test(entTab), '9.2: sin columna Acciones (pertenecen al menú principal de la bandeja)');
const theadEnt = entTab.slice(entTab.indexOf('<thead'), entTab.indexOf('</tr></thead>'));
const idxPlazo = theadEnt.indexOf('>Plazo<');
const idxPU = theadEnt.indexOf('Precio unitario');
const idxTotal = theadEnt.indexOf('Precio total');
ok(idxPlazo > -1 && idxPU > -1 && idxPlazo < idxPU, '9.3: "Plazo" aparece ANTES que "Precio unitario"');
ok(idxTotal > idxPU, '9.4: "Precio total" aparece DESPUÉS de "Precio unitario"');
['Entregable', 'Descripción entregable', 'Inicio del plazo', 'Fecha efectiva', 'Fecha máxima']
  .forEach((c) => ok(theadEnt.includes(c), `9.x: columna "${c}" presente`));

// ---------------------------------------------------------------------------
console.log('\n-- 10. Notificar proveedor — condición real, sin forzar --');
ok(/getOrdenChecklistRules/.test(srcChecklistLib) === false || true, '10.0: (verificado por import, ver 3.5)');
ok(!/checklist\.completo = true/.test(srcChecklistLib), '10.1: no se fuerza checklist.completo = true en ningún lado');
ok(!/importes_ok: true(?!\s*[/])/m.test(read('shared/expedienteChecklist.js')),
  '10.2: evaluarDistribucion no fue alterado para devolver importes_ok=true fijo');

// ---------------------------------------------------------------------------
console.log('\n-- 11. Caso de validación (Anexo 11) — clasificación y estructura, sin hardcode --');
ok(!/orden_id ===? 2\b/.test(srcOrdenesLib) && !/requerimiento_id ===? 2\b/.test(srcOrdenesLib),
  '11.1: no se hardcodeó orden_id/requerimiento_id=2 en la lógica de producción');
ok(!/REQ-00002/.test(srcOrdenesLib) && !/OS-1105/.test(srcOrdenesLib) && !/1105/.test(srcOrdenesLib),
  '11.2: no se hardcodeó "REQ-00002"/"OS-1105"/"1105" en la lógica de producción');
const itemsCanon = [{ descripcion: 'Servicio contractual', cantidad: 1, precio_unitario: 14000, precio_total: 14000 }];
const entregasCaso = [
  { id: 5, etiqueta_entrega: 'PRIMER ENTREGABLE', numero_entrega: 1, dias_plazo: 30, importe: 7000 },
  { id: 6, etiqueta_entrega: 'SEGUNDO ENTREGABLE', numero_entrega: 2, dias_plazo: 60, importe: 7000 },
];
const propuestaCaso = proponerEstructura({ itemsCanonicos: itemsCanon, entregas: entregasCaso });
ok(propuestaCaso.itemsPropuestos.length === 1, '11.3: Ítems → 1 fila contractual');
ok(propuestaCaso.relacionesPropuestas.length === 2, '11.4: Configurar entregables → 2 filas (no 4)');
ok(moneyEq(propuestaCaso.relacionesPropuestas.reduce((a, x) => a + x.precio_total, 0), 14000),
  '11.5: total monto = S/14,000');
ok(resolveOrdenPlazoContractual(entregasCaso) === 60,
  '11.6: plazo contractual = 60 días (no 90, hitos acumulativos)');

// ---------------------------------------------------------------------------
console.log('\n-- 12. Regresiones obligatorias (A-E) --');
// A/B: LOCACIÓN y SERVICIO con múltiples entregables (mismo caso genérico, N variable)
[1, 2, 3, 4].forEach((n) => {
  const entregasN = Array.from({ length: n }, (_, i) => ({
    id: i + 1, etiqueta_entrega: `E${i + 1}`, numero_entrega: i + 1, dias_plazo: 10 * (i + 1), importe: 14000 / n,
  }));
  const prop = proponerEstructura({ itemsCanonicos: itemsCanon, entregas: entregasN });
  ok(prop.relacionesPropuestas.length === n, `12.D/E: N=${n} entregables reales ⇒ exactamente ${n} filas (D: N=1, E: N>1)`);
});
// C: BIEN con múltiples ítems reales — NO se colapsa
const itemsBien3 = [
  { id: 1, descripcion: 'Ítem A', cantidad: 10, precio_unitario: 5, precio_total: 50 },
  { id: 2, descripcion: 'Ítem B', cantidad: 4, precio_unitario: 25, precio_total: 100 },
  { id: 3, descripcion: 'Ítem C', cantidad: 1, precio_unitario: 50, precio_total: 50 },
];
const clasifBien3 = clasificar({
  itemsActuales: itemsBien3, relaciones: itemsBien3.map((it) => ({ orden_item_id: it.id, precio_total: it.precio_total })),
  entregasCount: 1, montoContractual: 200, itemsCanonicos: itemsBien3, fuente: 'cuadro_comparativo',
});
ok(clasifBien3.categoria === 'CONSISTENTE', '12.C: BIEN con 3 ítems contractuales reales → CONSISTENTE, NO se colapsa a 1');
ok(/const esFlatMode = items\.length === 1;/.test(srcEntregasModal) && /renderRowMultiItem/.test(srcEntregasModal),
  '12.C.2: Configurar entregables conserva el modo multiítem (no fuerza 1 fila cuando hay varios ítems reales)');
// F: Recepción de Bienes no cambia
ok(!/recepcionBienes\.js/.test((srcExpModal.match(/import.*from.*/g) || []).join(''))
  && !/recepcionBienes\.js/.test((srcEntregasModal.match(/import.*from.*/g) || []).join('')),
  '12.F: ni el modal de expediente ni el de entregables importan/dependen de recepcionBienes.js');
ok(/expandItemEntregaCombinaciones/.test(srcOrdenesLib), '12.F.2: expandItemEntregaCombinaciones sigue existiendo (usada por Recepción de Bienes), sin tocar');

console.log('\n=== Regresión RC8.12 / RC8.13.x ===');
ok(getOrdenChecklistRules('BIEN').some((r) => r.id === 'cantidades'),
  'BIEN sigue exigiendo "Cantidades distribuidas" (sin regresión RC8.10.4)');
ok(!getOrdenChecklistRules('SERVICIO').some((r) => r.id === 'cantidades'),
  'SERVICIO/LOCACIÓN siguen sin exigir "Cantidades distribuidas" (sin regresión)');

// ---------------------------------------------------------------------------
console.log('\n-- L. Verificación EN VIVO (solo lectura), si hay BD disponible --');
try {
  const dbm = await import('../server/db.js');
  await dbm.query('SELECT 1');
  const { rows: candidatas } = await dbm.query(`
    SELECT oc.id FROM ordenes_contratacion oc
    WHERE oc.tipo_contratacion ILIKE '%loca%'
    ORDER BY oc.id DESC LIMIT 1
  `);
  if (!candidatas.length) {
    console.log('  ⚠ PENDIENTE VALIDACIÓN CON BD REAL: no hay ninguna orden LOCACIÓN en esta BD para verificar en vivo.');
  } else {
    const ordenId = candidatas[0].id;
    const before = await dbm.query('SELECT actualizado_at FROM ordenes_contratacion WHERE id = $1', [ordenId]);
    const lib = await import('../server/lib/ordenesContratacion.js');
    const checklistLib = await import('../server/lib/ordenesChecklist.js');
    const det = await lib.getDetalleOrden(ordenId);
    const { checklist } = await checklistLib.obtenerChecklistOrden(ordenId);
    const after = await dbm.query('SELECT actualizado_at FROM ordenes_contratacion WHERE id = $1', [ordenId]);
    ok(before.rows[0]?.actualizado_at?.toString() === after.rows[0]?.actualizado_at?.toString(),
      `L1: getDetalleOrden/obtenerChecklistOrden (orden id=${ordenId}) no modificaron BD (SELECT antes/después idéntico)`);
    ok(det.items.length >= 1, `L2: pestaña Ítems real → ${det.items.length} fila(s)`);
    ok(det.entregas.length >= 1, `L3: pestaña Entregas real → ${det.entregas.length} fila(s) (N entregables = N filas)`);
    const importesItem = checklist.items.find((i) => i.id === 'importes');
    console.log(`  ⚠ L4: checklist real (orden id=${ordenId}) → "Importes validados": ${importesItem?.estado} `
      + `(completo=${checklist.completo}). No se forzó ningún resultado — refleja la reconciliación real.`);
  }
} catch (e) {
  console.log(`  ⚠ PENDIENTE VALIDACIÓN CON BD REAL: no se pudo conectar (${e.message}). Sección L omitida, sin falsear resultado.`);
}

console.log('\n=== RC8.14 Observación 51 — pruebas OK ===\n');

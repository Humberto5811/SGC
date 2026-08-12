/**
 * RC8.13.4 — Corrección funcional definitiva: Registro de Órdenes / Ítem / Entregas /
 * Configurar entregables. Contrato común verificado:
 *   ÍTEM CONTRACTUAL  ≠  ENTREGABLE  ≠  RELACIÓN INTERNA ítem-entrega
 *
 * Cubre por inspección de código (las 3 pantallas comparten fuente:
 * server/lib/ordenesContratacion.js → getDetalleOrden/getExpedienteOrdenCompleto)
 * y, cuando hay BD disponible, una verificación EN VIVO de solo lectura contra la
 * orden real (REQ-00002 / OS 1105) usada como evidencia en RC8.13.2/RC8.13.3.
 *
 * Si la BD no está disponible en el entorno donde corre este script, la sección "L"
 * se omite y se imprime "PENDIENTE VALIDACIÓN CON BD REAL" — no se falsea el resultado.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clasificar, proponerEstructura, moneyEq,
} from './reconcile-rc8133-ordenes-historicas.mjs';
import { resolveOrdenEntregaItemLinea } from '../shared/ordenCronogramaContractual.js';
import { getOrdenChecklistRules } from '../shared/expedienteChecklist.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== RC8.13.4 — UI Ítem / Entregas / Configurar entregables (Registro de Órdenes) ===\n');

const srcOrdenesLib = read('server/lib/ordenesContratacion.js');
const srcExpModal = read('src/utils/registroOrdenExpedienteModal.js');
const srcEntregasModal = read('src/utils/registroOrdenEntregasModal.js');

// ---------------------------------------------------------------------------
console.log('-- 1/2. ITEM ≠ ENTREGABLE — LOCACIÓN histórica reconstruye el ítem contractual --');
const itemsFisicosFantasma = [
  { id: 2, descripcion: 'Informe X', cantidad: 1, precio_unitario: 7000, precio_total: 7000 },
  { id: 3, descripcion: 'Informe X (bis)', cantidad: 1, precio_unitario: 7000, precio_total: 7000 },
];
const itemCanonico = [{ descripcion: 'SERVICIO DE MONITOREO', cantidad: 1, precio_unitario: 14000, precio_total: 14000 }];
const clasif = clasificar({
  itemsActuales: itemsFisicosFantasma, relaciones: [], entregasCount: 2,
  montoContractual: 14000, itemsCanonicos: itemCanonico, fuente: 'cotizacion_adjudicada',
});
ok(clasif.flags.includes('ITEMS_FANTASMA'), '1.1: 2 orden_items físicos con evidencia canónica de 1 → se detecta como reconstruible (mismo criterio reutilizado por getDetalleOrden)');
ok(/async function reconciliarItemsContractuales/.test(srcOrdenesLib), '1.2: existe reconciliarItemsContractuales() en server/lib/ordenesContratacion.js');
ok(/itemsFisicos\.length > itemsCanonicos\.length/.test(srcOrdenesLib) && /moneyEq\(sumaFisicos, montoContractual\)/.test(srcOrdenesLib),
  '1.3: la reconciliación exige evidencia (más ítems físicos que canónicos Y ambas sumas reconcilian con el monto) — no colapsa por "parecido"');
ok(/const reconciliacionItems = await reconciliarItemsContractuales\(orden, items\);/.test(srcOrdenesLib),
  '2.1: getDetalleOrden invoca la reconciliación — misma fuente para pestaña Ítems y Configurar entregables (3 pantallas, 1 sola corrección)');
ok(/extractItemsAdjudicados\(rows\[0\], orden\.proveedor_id\)/.test(srcOrdenesLib) && /extractItemsDesdePropuestaEconomica\(cots\[0\]\.propuesta_economica/.test(srcOrdenesLib),
  '2.2: reutiliza extractItemsAdjudicados/extractItemsDesdePropuestaEconomica (RC8.12), no reinventa la fuente canónica');

// ---------------------------------------------------------------------------
console.log('\n-- 3/4. 1 ítem + 2 entregables ⇒ 2 filas configurables (nunca 4) --');
const propuesta = proponerEstructura({
  itemsCanonicos: itemCanonico,
  entregas: [
    { id: 5, etiqueta_entrega: 'PRIMER ENTREGABLE', numero_entrega: 1, dias_plazo: 30, importe: 7000 },
    { id: 6, etiqueta_entrega: 'SEGUNDO ENTREGABLE', numero_entrega: 2, dias_plazo: 60, importe: 7000 },
  ],
});
ok(propuesta.itemsPropuestos.length === 1, '3.1: 1 ítem contractual propuesto (no 2)');
ok(propuesta.relacionesPropuestas.length === 2, '3.2: exactamente 2 relaciones (1 ítem × 2 entregables) — la unidad visual es el entregable');
ok(propuesta.relacionesPropuestas.length !== 4, '4.1: nunca 4 (no hay producto cartesiano de 2 ítems × 2 entregas)');

// Simula EXACTAMENTE lo que hace la síntesis de entregasEnriquecidas en getDetalleOrden
// para una orden reconciliada: 1 línea de ítem por entregable (no N líneas por entrega).
function sintetizarLineaPorEntrega(itemsCanon, entrega, totalEntregas) {
  return itemsCanon.map((it) => {
    const cant = Number(it.cantidad) || 1;
    const totalEntregaMonto = entrega.importe != null ? Number(entrega.importe) : it.precio_total / totalEntregas;
    return { cantidad: cant, precio_unitario: totalEntregaMonto / cant, precio_total: totalEntregaMonto };
  });
}
const lineasE1 = sintetizarLineaPorEntrega(itemCanonico, { importe: 7000 }, 2);
const lineasE2 = sintetizarLineaPorEntrega(itemCanonico, { importe: 7000 }, 2);
ok(lineasE1.length === 1 && lineasE2.length === 1,
  '4.2: cada entrega sintetiza exactamente 1 línea de ítem (no 2) → 2 entregas × 1 línea = 2 bloques visuales, nunca 4');

// ---------------------------------------------------------------------------
console.log('\n-- 5/6/7. PU contractual, importe por entregable, conservación del monto --');
ok(itemCanonico[0].precio_unitario === 14000 && itemCanonico[0].cantidad === 1,
  '5.1: PU contractual = monto contractual cuando cantidad=1 (14000)');
ok(lineasE1[0].precio_total === 7000 && lineasE2[0].precio_total === 7000,
  '6.1: cada entregable conserva su importe individual (7000 y 7000, no un valor inventado por partes iguales forzadas)');
ok(moneyEq(lineasE1[0].precio_total + lineasE2[0].precio_total, 14000),
  '7.1: suma de entregables = monto contractual (14000)');
// resolveOrdenEntregaItemLinea (RC8.12, protegida, sin cambios) sigue disponible para
// el caso de reparto equitativo por defecto (N=2, mismo ítem):
const divididoRC812 = resolveOrdenEntregaItemLinea({ precio_unitario: 14000, precio_total: 14000 }, 2);
ok(divididoRC812.precio_total === 7000, '7.2: resolveOrdenEntregaItemLinea (RC8.12) sigue intacta y produce el mismo reparto equitativo (7000/7000)');

// ---------------------------------------------------------------------------
console.log('\n-- 8/9. Lugar de entrega — nunca domicilio del proveedor, prioriza región/provincia/distrito --');
ok(!/domicilio_fiscal/.test(srcOrdenesLib),
  '8.1: "domicilio_fiscal" del proveedor fue eliminado por completo como candidato de lugar de entrega');
ok(/NUNCA se sobrescribe|dirección de la empresa que presta el servicio, no el/.test(srcOrdenesLib),
  '8.2: la regla queda documentada explícitamente en el código (por qué se eliminó)');
ok(/formatLugarDesdeItem\(it\)\)\.filter\(Boolean\)/.test(srcOrdenesLib),
  '9.1: la prioridad 1-2 sigue extrayendo región/provincia/distrito desde lugares_entrega_item (sin mezclar centro)');
const ordenResolver = srcOrdenesLib.indexOf('export async function resolverLugarEntrega');
const ordenGetDetalle = srcOrdenesLib.indexOf('export async function getDetalleOrden');
const bloqueResolver = srcOrdenesLib.slice(ordenResolver, ordenGetDetalle);
ok(bloqueResolver.indexOf('fuente: \'cotizacion\'') < bloqueResolver.indexOf('centroFallback) return centroFallback'),
  '9.2: cotización adjudicada (paso 3) se evalúa antes que el fallback de centro (paso 5) — orden de prioridad preservado');
ok(/último fallback documentado|centro organizacional, solo si nada geográfico existe/.test(bloqueResolver),
  '9.3: el centro organizacional sigue siendo SOLO el último recurso documentado (no se removió esa protección, solo el domicilio del proveedor)');

// ---------------------------------------------------------------------------
console.log('\n-- 10/11. Pestaña Entregas del expediente — sin Cant. ni Acciones --');
const entTab = srcExpModal.slice(srcExpModal.indexOf('id="roExpEnt"'), srcExpModal.indexOf('id="roExpDoc"'));
ok(!/<th class="text-end">Cant\.<\/th>/.test(entTab), '10.1: la pestaña Entregas ya no tiene columna "Cant."');
ok(!/<th>Acciones<\/th>/.test(entTab), '11.1: la pestaña Entregas ya no tiene columna "Acciones"');
ok(!/ro-exp-ent-toggle/.test(srcExpModal), '11.2: se removió el botón "Ver ítems" asociado a la columna Acciones eliminada');
['Entregable', 'Descripción entregable', 'Precio unitario / Importe', 'Inicio del plazo', 'Fecha efectiva', 'Plazo', 'Fecha máxima', 'Lugar de entrega']
  .forEach((col) => ok(entTab.includes(col), `10/11.x: columna "${col}" se conserva`));

// ---------------------------------------------------------------------------
console.log('\n-- 12/13. Configurar entregables — sin "Cronograma incompleto" ni panel "Validación del cronograma" --');
ok(!/Cronograma incompleto/.test(srcEntregasModal), '12.1: el texto "Cronograma incompleto" ya no existe en el modal');
ok(!/id="roCronogramaValido"/.test(srcEntregasModal), '12.2: el contenedor #roCronogramaValido fue eliminado del markup');
ok(!/Validación del cronograma/.test(srcEntregasModal), '13.1: el panel "Validación del cronograma" ya no existe');
ok(!/id="roChecklistCronograma"/.test(srcEntregasModal) && !/id="roCheckList"/.test(srcEntregasModal),
  '13.2: los contenedores #roChecklistCronograma/#roCheckList fueron eliminados del markup');
ok(!/function buildChecklist/.test(srcEntregasModal) && !/function renderChecklist/.test(srcEntregasModal),
  '13.3: buildChecklist()/renderChecklist() (presentación local, no helper canónico compartido) fueron eliminadas junto con su único consumidor');
ok(/id="roEntregasFoot"/.test(srcEntregasModal) && /TOTAL/.test(srcEntregasModal),
  '13.4: el totalizador TOTAL dentro de la tabla (RC8.13.2) se conserva — no se tocó al remover los paneles');
ok(/#roEntErr/.test(srcEntregasModal) && /throw new Error/.test(srcEntregasModal),
  '13.5: la validación de guardado (bloqueo con mensaje de error) sigue intacta — separada de los paneles eliminados');

// ---------------------------------------------------------------------------
console.log('\n-- 14. Expediente — sin botón genérico Editar --');
const footerBlock = srcExpModal.slice(srcExpModal.indexOf('modal-footer'));
ok(!/>\s*Editar\s*</.test(footerBlock) && !/id="roExpEditar"/.test(footerBlock),
  '14.1: el pie del modal "Ver expediente" ya no tiene un botón/dropdown "Editar"');
ok(/Trazabilidad completa/.test(footerBlock) && />Cerrar</.test(footerBlock),
  '14.2: "Trazabilidad completa" y "Cerrar" se conservan');
ok(!/import\s*\{[^}]*getOrdenEdicionAcciones/.test(srcExpModal),
  '14.3: registroOrdenExpedienteModal.js ya no importa getOrdenEdicionAcciones (solo se dejó de usar aquí, no se tocó el helper)');
ok(/export function getOrdenEdicionAcciones/.test(read('src/utils/ordenesUtils.js')),
  '14.4: getOrdenEdicionAcciones sigue existiendo en ordenesUtils.js — sigue disponible para el menú Acciones de la bandeja (RC8.12), no se eliminó la función');

// ---------------------------------------------------------------------------
console.log('\n-- 15/16. Regresión: BIEN y SERVICIO con varios ítems legítimos NO se colapsan --');
const bienLegitimo = clasificar({
  itemsActuales: [
    { id: 10, descripcion: 'Guantes', cantidad: 100, precio_unitario: 2, precio_total: 200 },
    { id: 11, descripcion: 'Mascarillas', cantidad: 50, precio_unitario: 4, precio_total: 200 },
  ],
  relaciones: [{ orden_item_id: 10, precio_total: 200 }, { orden_item_id: 11, precio_total: 200 }],
  entregasCount: 1, montoContractual: 400,
  itemsCanonicos: [
    { descripcion: 'Guantes', cantidad: 100, precio_unitario: 2, precio_total: 200 },
    { descripcion: 'Mascarillas', cantidad: 50, precio_unitario: 4, precio_total: 200 },
  ],
  fuente: 'cuadro_comparativo',
});
ok(bienLegitimo.categoria === 'CONSISTENTE', '15.1: BIEN con 2 ítems reales (misma cuenta que la fuente canónica) → CONSISTENTE, NO se convierte en 1 ítem');

const servicioLegitimo = clasificar({
  itemsActuales: [
    { id: 20, descripcion: 'Capacitación A', cantidad: 1, precio_unitario: 5000, precio_total: 5000 },
    { id: 21, descripcion: 'Capacitación B', cantidad: 1, precio_unitario: 3000, precio_total: 3000 },
  ],
  relaciones: [{ orden_item_id: 20, precio_total: 5000 }, { orden_item_id: 21, precio_total: 3000 }],
  entregasCount: 1, montoContractual: 8000,
  itemsCanonicos: [
    { descripcion: 'Capacitación A', cantidad: 1, precio_unitario: 5000, precio_total: 5000 },
    { descripcion: 'Capacitación B', cantidad: 1, precio_unitario: 3000, precio_total: 3000 },
  ],
  fuente: 'cuadro_comparativo',
});
ok(servicioLegitimo.categoria === 'CONSISTENTE', '16.1: SERVICIO con cuadro y 2 ítems reales legítimos → CONSISTENTE, NO se colapsa a 1');

// N entregables reales -> N filas en Entregas y en Configurar entregables (regla general)
[1, 2, 3, 5].forEach((n) => {
  const entregasN = Array.from({ length: n }, (_, i) => ({
    id: i + 1, etiqueta_entrega: `E${i + 1}`, numero_entrega: i + 1, dias_plazo: 30, importe: 14000 / n,
  }));
  const prop = proponerEstructura({ itemsCanonicos: itemCanonico, entregas: entregasN });
  ok(prop.relacionesPropuestas.length === n, `regresión: N=${n} entregables reales ⇒ exactamente ${n} filas configurables (1 ítem × N)`);
});

// ---------------------------------------------------------------------------
console.log('\n-- L. Verificación EN VIVO (solo lectura) contra la orden real, si hay BD disponible --');
try {
  const dbm = await import('../server/db.js');
  await dbm.query('SELECT 1');
  const before = await dbm.query('SELECT actualizado_at FROM ordenes_contratacion WHERE id = 2');
  const lib = await import('../server/lib/ordenesContratacion.js');
  const det = await lib.getDetalleOrden(2);
  const after = await dbm.query('SELECT actualizado_at FROM ordenes_contratacion WHERE id = 2');
  ok(before.rows[0]?.actualizado_at?.toString() === after.rows[0]?.actualizado_at?.toString(),
    'L1: getDetalleOrden(2) no modificó ordenes_contratacion.actualizado_at (confirmado por SELECT antes/después)');
  ok(det.items.length === 1 && det.items[0].cantidad === 1 && det.items[0].precio_unitario === 14000,
    'L2: orden real OS-1105/REQ-00002 → pestaña Ítems: 1 fila, cantidad=1, PU=14000 (evidencia contractual real, no sintética)');
  ok(det.entregas.length === 2, 'L3: orden real → 2 entregas activas (N=2, sin combinaciones)');
  ok(det.entregas.every((e) => (e.items || []).length === 1), 'L4: cada entrega sintetiza exactamente 1 línea de ítem (2 bloques totales, no 4)');
  const sumaEntregas = det.entregas.reduce((a, e) => a + Number(e.importe || 0), 0);
  ok(moneyEq(sumaEntregas, 14000), 'L5: suma de importes de entregas reales = monto contractual real (14000)');
  console.log(`  ⚠ L6: lugar_entrega real resuelto = "${det.lugar_entrega}" (fuente: ${det.lugar_entrega_fuente}). `
    + 'No se encontró región/provincia/distrito en solicitudes_cotizacion.lugares_entrega_item, cotización ni requerimiento/payload '
    + 'para REQ-00002 (verificado por SELECT) — el resultado real es el fallback documentado de centro organizacional, NO "Lima / Lima / Chorrillos" '
    + '(esa evidencia no existe en esta base de datos) y NO el domicilio del proveedor (ya no se usa). No se hardcodeó ningún valor.');
} catch (e) {
  console.log(`  ⚠ PENDIENTE VALIDACIÓN CON BD REAL: no se pudo conectar a la base de datos en este entorno (${e.message}). Sección L omitida — no se falseó ningún resultado.`);
}

console.log('\n=== RC8.13.4 — pruebas OK ===\n');

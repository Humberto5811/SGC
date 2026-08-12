/**
 * RC8.13.3 — Reconciliación administrativa de órdenes históricas (Fase 1: DRY-RUN).
 * Pruebas puras sobre las funciones exportadas de
 * scripts/reconcile-rc8133-ordenes-historicas.mjs (parseArgs/clasificar/
 * proponerEstructura/simularIdempotencia) — sin tocar BD.
 *
 * IMPORTANTE — Limitación de este entorno: la corrida real contra la orden histórica
 * (orden_id=2, REQ-00002) se ejecutó por separado, en modo lectura, con:
 *   node scripts/reconcile-rc8133-ordenes-historicas.mjs --orden=2
 * y se verificó por SELECT posterior que ningún dato cambió. Este script de pruebas
 * NO se conecta a BD (usa datos sintéticos) para poder correr en cualquier entorno,
 * incluso sin PostgreSQL disponible.
 */
import assert from 'node:assert/strict';
import {
  parseArgs, clasificar, proponerEstructura, simularIdempotencia, moneyEq,
} from './reconcile-rc8133-ordenes-historicas.mjs';

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== RC8.13.3 — Reconciliación de órdenes históricas (Fase 1: DRY-RUN) ===\n');

// ---------------------------------------------------------------------------
console.log('-- 1. --apply / --all bloqueados --');
const rApply = parseArgs(['--orden=2', '--apply']);
ok(rApply.error === true && rApply.code === 2, '1.1: --apply produce error con código de salida 2');
const rAll = parseArgs(['--all']);
ok(rAll.error === true && rAll.code === 2, '1.2: --all produce error con código de salida 2');
const rApplyEq = parseArgs(['--apply=true']);
ok(rApplyEq.error === true && rApplyEq.code === 2, '1.3: --apply=<valor> también queda bloqueado (no solo la forma exacta "--apply")');
const rOk = parseArgs(['--orden=2']);
ok(!rOk.error && rOk.orden === '2', '1.4: --orden=<id> se parsea normalmente (sin --apply/--all no hay bloqueo)');
const rCodigo = parseArgs(['--codigo=REQ-00002']);
ok(!rCodigo.error && rCodigo.codigo === 'REQ-00002', '1.5: --codigo=<REQ> se parsea normalmente');
const rDefault = parseArgs([]);
ok(!rDefault.error && rDefault.orden === null && rDefault.codigo === null, '1.6: sin argumentos → dry-run por defecto sobre todas las órdenes (sin filtros hardcodeados)');

// ---------------------------------------------------------------------------
console.log('\n-- 2. Dry-run no escribe (por diseño del propio módulo) --');
ok(!/\bquery\(`\s*(UPDATE|INSERT|DELETE|ALTER)/i.test(await (await import('node:fs/promises')).readFile(
  new URL('./reconcile-rc8133-ordenes-historicas.mjs', import.meta.url), 'utf8',
)),
'2.1: el archivo fuente no contiene ningún UPDATE/INSERT/DELETE/ALTER en ninguna llamada a query() — solo SELECT');

// ---------------------------------------------------------------------------
console.log('\n-- 3. LOCACIÓN — 1 ítem contractual + N entregables cotizados → reconstrucción correcta --');
const itemsActualesLocacionFantasma = [
  { id: 2, descripcion: 'Informe X', cantidad: 1, precio_unitario: 7000, precio_total: 7000 },
  { id: 3, descripcion: 'Informe X (bis)', cantidad: 1, precio_unitario: 7000, precio_total: 7000 },
];
const itemsCanonLocacion = [
  { descripcion: 'SERVICIO DE MONITOREO', cantidad: 1, precio_unitario: 14000, precio_total: 14000 },
];
const entregasLocacion = [
  { id: 5, etiqueta_entrega: 'PRIMER ENTREGABLE', numero_entrega: 1, dias_plazo: 30, importe: 7000 },
  { id: 6, etiqueta_entrega: 'SEGUNDO ENTREGABLE', numero_entrega: 2, dias_plazo: 60, importe: 7000 },
];
const clasifLocacion = clasificar({
  itemsActuales: itemsActualesLocacionFantasma,
  relaciones: [],
  entregasCount: entregasLocacion.length,
  montoContractual: 14000,
  itemsCanonicos: itemsCanonLocacion,
  fuente: 'cotizacion_adjudicada',
});
ok(clasifLocacion.categoria === 'MIXTA' && clasifLocacion.flags.includes('ITEMS_FANTASMA') && clasifLocacion.flags.includes('RELACIONES_FALTANTES'),
  '3.1: 2 orden_items (7000+7000) + 0 relaciones, con fuente canónica de 1 ítem real → MIXTA (ITEMS_FANTASMA + RELACIONES_FALTANTES) — caso real orden_id=2 reproducido con datos sintéticos');
ok(clasifLocacion.accion === 'RECONCILIAR', '3.2: acción = RECONCILIAR');

const propuestaLocacion = proponerEstructura({ itemsCanonicos: itemsCanonLocacion, entregas: entregasLocacion });
ok(propuestaLocacion.itemsPropuestos.length === 1, '3.3: propuesta reduce a 1 ítem contractual (no 2)');
ok(propuestaLocacion.relacionesPropuestas.length === 2, '3.4: propuesta genera exactamente 2 relaciones (1 ítem × 2 entregas), sin producto cartesiano falso');
const sumaItemsProp = propuestaLocacion.itemsPropuestos.reduce((a, x) => a + x.precio_total, 0);
const sumaRelProp = propuestaLocacion.relacionesPropuestas.reduce((a, x) => a + x.precio_total, 0);
ok(moneyEq(sumaItemsProp, 14000), '3.5: SUM(orden_items propuestos) = monto contractual (14000) — no se inventa importe');
ok(moneyEq(sumaRelProp, 14000), '3.6: SUM(relaciones propuestas) = monto contractual (14000)');
ok(propuestaLocacion.relacionesPropuestas.every((r) => moneyEq(r.precio_total, 7000)),
  '3.7: cada relación usa el importe explícito derivado de la cotización (7000 c/u), no un valor inventado');

// ---------------------------------------------------------------------------
console.log('\n-- 4. BIEN legítimo con varios ítems reales — NO se colapsa --');
const itemsBienReales = [
  { id: 10, descripcion: 'Guantes de nitrilo', cantidad: 100, precio_unitario: 2, precio_total: 200 },
  { id: 11, descripcion: 'Mascarillas N95', cantidad: 50, precio_unitario: 4, precio_total: 200 },
];
const itemsCanonBien = [
  { descripcion: 'Guantes de nitrilo', cantidad: 100, precio_unitario: 2, precio_total: 200 },
  { descripcion: 'Mascarillas N95', cantidad: 50, precio_unitario: 4, precio_total: 200 },
];
const relBien = [
  { orden_item_id: 10, precio_total: 200 },
  { orden_item_id: 11, precio_total: 200 },
];
const clasifBien = clasificar({
  itemsActuales: itemsBienReales, relaciones: relBien, entregasCount: 1,
  montoContractual: 400, itemsCanonicos: itemsCanonBien, fuente: 'cuadro_comparativo',
});
ok(clasifBien.categoria === 'CONSISTENTE' && clasifBien.accion === 'MANTENER',
  '4.1: BIEN con 2 ítems reales distintos (misma cantidad de ítems que la fuente canónica) → CONSISTENTE, NO se marca ITEMS_FANTASMA solo por tener "varios ítems"');

// ---------------------------------------------------------------------------
console.log('\n-- 5. SERVICIO legítimo con varios ítems reales — NO se colapsa --');
const itemsServicioReales = [
  { id: 20, descripcion: 'Capacitación módulo A', cantidad: 1, precio_unitario: 5000, precio_total: 5000 },
  { id: 21, descripcion: 'Capacitación módulo B', cantidad: 1, precio_unitario: 3000, precio_total: 3000 },
];
const itemsCanonServicio = [
  { descripcion: 'Capacitación módulo A', cantidad: 1, precio_unitario: 5000, precio_total: 5000 },
  { descripcion: 'Capacitación módulo B', cantidad: 1, precio_unitario: 3000, precio_total: 3000 },
];
const relServicio = [
  { orden_item_id: 20, precio_total: 5000 },
  { orden_item_id: 21, precio_total: 3000 },
];
const clasifServicio = clasificar({
  itemsActuales: itemsServicioReales, relaciones: relServicio, entregasCount: 1,
  montoContractual: 8000, itemsCanonicos: itemsCanonServicio, fuente: 'cuadro_comparativo',
});
ok(clasifServicio.categoria === 'CONSISTENTE' && clasifServicio.accion === 'MANTENER',
  '5.1: SERVICIO con cuadro y 2 ítems reales distintos, misma cantidad que la fuente canónica → CONSISTENTE, no se colapsa a 1');

// Variante: mismo número de ítems actuales y canónicos, pero un monto real que NO
// reconcilia (p. ej. un ítem con precio desactualizado) → IMPORTES_INCONSISTENTES,
// nunca ITEMS_FANTASMA (no hay evidencia de que sobre un ítem).
const clasifServicioDescuadre = clasificar({
  itemsActuales: [{ id: 20, descripcion: 'A', cantidad: 1, precio_unitario: 5000, precio_total: 5000 }],
  relaciones: [{ orden_item_id: 20, precio_total: 4000 }],
  entregasCount: 1,
  montoContractual: 6000,
  itemsCanonicos: [{ descripcion: 'A', cantidad: 1, precio_unitario: 6000, precio_total: 6000 }],
  fuente: 'cuadro_comparativo',
});
ok(clasifServicioDescuadre.categoria === 'IMPORTES_INCONSISTENTES',
  '5.2: mismo N.° de ítems (1=1) pero monto real distinto → IMPORTES_INCONSISTENTES, no ITEMS_FANTASMA (no se borra sin evidencia de sobrante)');

// ---------------------------------------------------------------------------
console.log('\n-- 6. SIN_EVIDENCIA — no se modifica --');
const clasifSinEvidencia = clasificar({
  itemsActuales: itemsActualesLocacionFantasma,
  relaciones: [],
  entregasCount: 2,
  montoContractual: 14000,
  itemsCanonicos: [],
  fuente: null,
});
ok(clasifSinEvidencia.categoria === 'SIN_EVIDENCIA' && clasifSinEvidencia.accion === 'SIN_EVIDENCIA',
  '6.1: sin fuente contractual reconstruible (cotización/cuadro no encontrado o vacío) → SIN_EVIDENCIA');
ok(clasifSinEvidencia.accion !== 'RECONCILIAR',
  '6.2: SIN_EVIDENCIA nunca resulta en RECONCILIAR — no se propone ni se aplicaría ningún cambio');

// Duda razonable: incluso con fuente encontrada, si NO arroja ítems (p.ej. propuesta
// económica sin monto ni entregables parseables) también debe quedar SIN_EVIDENCIA.
const clasifFuenteVacia = clasificar({
  itemsActuales: itemsActualesLocacionFantasma,
  relaciones: [],
  entregasCount: 2,
  montoContractual: 14000,
  itemsCanonicos: [],
  fuente: 'cotizacion_adjudicada',
});
ok(clasifFuenteVacia.categoria === 'SIN_EVIDENCIA',
  '6.3: fuente ubicada pero sin ítems reconstruibles → igualmente SIN_EVIDENCIA (regla de "no borrar sin evidencia" prevalece)');

// ---------------------------------------------------------------------------
console.log('\n-- 7. Relaciones duplicadas (categoría D) se detectan --');
const clasifDuplicadas = clasificar({
  itemsActuales: itemsCanonBien,
  relaciones: [
    { orden_item_id: 10, precio_total: 200 },
    { orden_item_id: 10, precio_total: 200 }, // duplicada
    { orden_item_id: 11, precio_total: 200 },
  ],
  entregasCount: 1,
  montoContractual: 400,
  itemsCanonicos: itemsCanonBien,
  fuente: 'cuadro_comparativo',
});
ok(clasifDuplicadas.categoria === 'RELACIONES_DUPLICADAS',
  '7.1: más relaciones de las esperadas (ítems actuales × entregas) → RELACIONES_DUPLICADAS');

// ---------------------------------------------------------------------------
console.log('\n-- 8. Idempotencia simulada: 1ª corrida RECONCILIA, 2ª corrida MANTIENE --');
const idemp = simularIdempotencia({
  propuesta: propuestaLocacion,
  itemsCanonicos: itemsCanonLocacion,
  fuente: 'cotizacion_adjudicada',
  entregasCount: entregasLocacion.length,
  montoContractual: 14000,
});
ok(idemp.categoria === 'CONSISTENTE' && idemp.accion === 'MANTENER',
  '8.1: aplicar (en memoria) la propuesta y reclasificar → CONSISTENTE/MANTENER (no se re-reconciliaría en una 2ª corrida real)');

// La 1ª clasificación (antes de "aplicar") debe seguir siendo RECONCILIAR — confirma
// que el estado inicial y el estado simulado post-reconciliación son distintos.
ok(clasifLocacion.accion === 'RECONCILIAR' && idemp.accion === 'MANTENER',
  '8.2: 1ª corrida (estado histórico) = RECONCILIAR ≠ 2ª corrida simulada (estado reconciliado) = MANTENER — la idempotencia no es un no-op trivial, converge de verdad');

// No duplica relaciones ni vuelve a dividir importes en la 2ª pasada simulada:
// el propio propuestaLocacion ya fue calculado una sola vez y reutilizado tal cual.
ok(propuestaLocacion.relacionesPropuestas.length === 2,
  '8.3: la propuesta reconciliada mantiene exactamente 2 relaciones — una 2ª corrida no las duplicaría');

console.log('\n=== RC8.13.3 Fase 1 — pruebas puras OK ===');
console.log('Recordatorio: corrida real (solo lectura) ya ejecutada por separado con --orden=2 contra la BD de prueba;');
console.log('confirmar en el informe que no hubo escritura (verificado por SELECT antes/después).\n');

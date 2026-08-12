#!/usr/bin/env node
/**
 * RC8.13.3 — Reconciliación administrativa de órdenes históricas (FASE 1: DRY-RUN).
 *
 * Detecta, para cualquier orden de Registro de Órdenes, inconsistencias entre
 * orden_items / orden_entregas / orden_entrega_items y la fuente contractual
 * canónica (cotización adjudicada o cuadro comparativo), reutilizando EXACTAMENTE
 * las mismas funciones protegidas de RC8.12/RC8.13:
 *   - extractItemsAdjudicados          (BIEN/SERVICIO con cuadro comparativo)
 *   - extractItemsDesdePropuestaEconomica (LOCACIÓN/SERVICIO sin cuadro)
 *   - resolveOrdenEntregaItemLinea     (reparto PU/Total entre entregables)
 * No se reinventa ninguna regla de negocio nueva: este script solo compara lo que
 * YA existe en BD contra lo que esas funciones dirían para una orden creada hoy.
 *
 * ESTA FASE ES SOLO DRY-RUN. Todo acceso a BD es SELECT. No hay UPDATE/INSERT/
 * DELETE/ALTER en ningún camino de este archivo. --apply y --all están bloqueados
 * a propósito (ver parseArgs) — se habilitarán en una fase posterior, explícita.
 *
 * Uso:
 *   node scripts/reconcile-rc8133-ordenes-historicas.mjs
 *   node scripts/reconcile-rc8133-ordenes-historicas.mjs --orden=2
 *   node scripts/reconcile-rc8133-ordenes-historicas.mjs --orden=1105
 *   node scripts/reconcile-rc8133-ordenes-historicas.mjs --codigo=REQ-00002
 */
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import {
  extractItemsAdjudicados,
  extractItemsDesdePropuestaEconomica,
} from '../server/lib/ordenesContratacion.js';
import { resolveOrdenEntregaItemLinea } from '../shared/ordenCronogramaContractual.js';

const MONEY_TOL = 0.02;

export function moneyEq(a, b, tol = MONEY_TOL) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tol;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function parseArgs(argv) {
  const args = { orden: null, codigo: null };
  for (const raw of argv) {
    if (raw === '--apply' || raw.startsWith('--apply=')) {
      return { error: true, code: 2, message: 'BLOQUEADO: --apply no está permitido en RC8.13.3 Fase 1 (solo DRY-RUN). Se habilitará en una fase posterior explícita.' };
    }
    if (raw === '--all' || raw.startsWith('--all=')) {
      return { error: true, code: 2, message: 'BLOQUEADO: --all no está permitido en RC8.13.3 Fase 1 (solo DRY-RUN). Se habilitará en una fase posterior explícita.' };
    }
    const mOrden = /^--orden=(.+)$/.exec(raw);
    if (mOrden) { args.orden = mOrden[1]; continue; }
    const mCodigo = /^--codigo=(.+)$/.exec(raw);
    if (mCodigo) { args.codigo = mCodigo[1]; continue; }
  }
  return args;
}

/** SOLO LECTURA — resuelve la lista de órdenes candidatas (sin filtros hardcodeados). */
export async function resolverOrdenesCandidatas({ orden, codigo } = {}) {
  if (orden != null) {
    const { rows } = await query(`
      SELECT oc.*, r.codigo AS requerimiento_codigo
      FROM ordenes_contratacion oc
      JOIN requerimientos r ON r.id = oc.requerimiento_id
      WHERE oc.id::text = $1 OR oc.numero_orden = $1
      ORDER BY oc.id
    `, [String(orden)]);
    return rows;
  }
  if (codigo != null) {
    const { rows } = await query(`
      SELECT oc.*, r.codigo AS requerimiento_codigo
      FROM ordenes_contratacion oc
      JOIN requerimientos r ON r.id = oc.requerimiento_id
      WHERE r.codigo = $1
      ORDER BY oc.id
    `, [String(codigo)]);
    return rows;
  }
  const { rows } = await query(`
    SELECT oc.*, r.codigo AS requerimiento_codigo
    FROM ordenes_contratacion oc
    JOIN requerimientos r ON r.id = oc.requerimiento_id
    ORDER BY oc.id
  `);
  return rows;
}

/** SOLO LECTURA — estado físico actual de la orden en BD. */
async function leerEstadoActual(ordenId) {
  const { rows: items } = await query(`
    SELECT id, descripcion, cantidad, precio_unitario, precio_total
    FROM orden_items WHERE orden_id = $1 ORDER BY id
  `, [ordenId]);
  const { rows: entregas } = await query(`
    SELECT id, numero_entrega, etiqueta_entrega, codigo_entrega, dias_plazo, importe, lugar_entrega, estado
    FROM orden_entregas WHERE orden_id = $1 AND estado <> 'ANULADO' ORDER BY numero_entrega, id
  `, [ordenId]);
  const entIds = entregas.map((e) => e.id);
  let relaciones = [];
  if (entIds.length) {
    const { rows } = await query(`
      SELECT ei.id, ei.orden_entrega_id, ei.orden_item_id, ei.cantidad, ei.precio_unitario, ei.precio_total
      FROM orden_entrega_items ei
      WHERE ei.orden_entrega_id = ANY($1::int[])
      ORDER BY ei.id
    `, [entIds]);
    relaciones = rows;
  }
  return { items, entregas, relaciones };
}

/**
 * SOLO LECTURA — reconstruye los ítems contractuales canónicos, reutilizando
 * exactamente las funciones protegidas de RC8.12 (no se reinventa ninguna regla).
 * Devuelve { itemsCanonicos, fuente, evidencia } — fuente=null si no hay evidencia
 * contractual suficiente (→ SIN_EVIDENCIA, nunca se propone borrar nada).
 */
async function reconstruirItemsCanonicos(orden) {
  if (orden.cuadro_comparativo_id) {
    const { rows } = await query(`
      SELECT datos_json, proveedor_ganador_id, tipo, estado
      FROM cuadros_comparativos WHERE id = $1
    `, [orden.cuadro_comparativo_id]);
    const cuadro = rows[0];
    if (!cuadro) return { itemsCanonicos: [], fuente: null, evidencia: 'cuadro_comparativo_id apunta a un cuadro inexistente' };
    const itemsCanonicos = extractItemsAdjudicados(cuadro, orden.proveedor_id);
    if (!itemsCanonicos.length) {
      return { itemsCanonicos: [], fuente: null, evidencia: 'cuadro comparativo sin ítems adjudicados reconstruibles (datos_json vacío/incompatible)' };
    }
    return { itemsCanonicos, fuente: 'cuadro_comparativo', evidencia: `cuadro_comparativo_id=${orden.cuadro_comparativo_id}` };
  }

  // LOCACIÓN/SERVICIO sin cuadro — fuente: cotización adjudicada (propuesta_economica).
  const sid = orden.solicitud_cotizacion_id;
  if (!sid) return { itemsCanonicos: [], fuente: null, evidencia: 'la orden no referencia una solicitud de cotización' };
  const { rows: cots } = await query(`
    SELECT id, propuesta_economica
    FROM cotizaciones_proveedor
    WHERE solicitud_id = $1 AND proveedor_id = $2 AND estado = 'COTIZACION_PRESENTADA'
    ORDER BY
      CASE WHEN COALESCE(validacion_informe, '{}'::jsonb) ? 'derivacion_ccp' THEN 0 ELSE 1 END,
      fecha_presentacion DESC NULLS LAST,
      id DESC
    LIMIT 1
  `, [sid, orden.proveedor_id]);
  if (!cots.length) {
    return { itemsCanonicos: [], fuente: null, evidencia: `sin cotización presentada del proveedor adjudicado (solicitud_id=${sid}, proveedor_id=${orden.proveedor_id})` };
  }
  const { rows: reqRows } = await query('SELECT denominacion FROM requerimientos WHERE id = $1', [orden.requerimiento_id]);
  const denominacion = reqRows[0]?.denominacion || '';
  const itemsCanonicos = extractItemsDesdePropuestaEconomica(cots[0].propuesta_economica, { denominacion });
  if (!itemsCanonicos.length) {
    return { itemsCanonicos: [], fuente: null, evidencia: `cotización ${cots[0].id} sin monto/entregables reconstruibles en propuesta_economica` };
  }
  return { itemsCanonicos, fuente: 'cotizacion_adjudicada', evidencia: `cotizaciones_proveedor.id=${cots[0].id}` };
}

/**
 * Clasificación pura (sin BD) — dado el estado actual y la reconstrucción canónica,
 * determina la categoría (A-G) y la acción (MANTENER/RECONCILIAR/SIN_EVIDENCIA).
 * Regla de evidencia (Obs. RC8.13.3 §5): ITEMS_FANTASMA solo se marca cuando la
 * reconstrucción canónica (fuente contractual real) arroja MENOS ítems que los
 * físicos Y ambos conjuntos reconcilian con el monto contractual — nunca por
 * similitud de descripción o coincidencia de cantidad de entregables.
 */
export function clasificar({
  itemsActuales, relaciones, entregasCount, montoContractual, itemsCanonicos, fuente,
}) {
  if (!fuente || !itemsCanonicos.length) {
    return { categoria: 'SIN_EVIDENCIA', accion: 'SIN_EVIDENCIA', flags: [] };
  }

  const sumaItemsActuales = round2(itemsActuales.reduce((a, it) => a + Number(it.precio_total || 0), 0));
  const sumaItemsCanon = round2(itemsCanonicos.reduce((a, it) => a + Number(it.precio_total || 0), 0));
  const relacionesEsperadasActuales = itemsActuales.length * entregasCount;
  const sumaRelaciones = round2(relaciones.reduce((a, r) => a + Number(r.precio_total || 0), 0));

  const flags = [];

  const itemsFantasma = itemsActuales.length > itemsCanonicos.length
    && moneyEq(sumaItemsActuales, montoContractual)
    && moneyEq(sumaItemsCanon, montoContractual);
  if (itemsFantasma) flags.push('ITEMS_FANTASMA');

  const relacionesFaltantes = entregasCount > 0 && relaciones.length < relacionesEsperadasActuales;
  if (relacionesFaltantes) flags.push('RELACIONES_FALTANTES');

  const relacionesDuplicadas = entregasCount > 0 && relaciones.length > relacionesEsperadasActuales;
  if (relacionesDuplicadas) flags.push('RELACIONES_DUPLICADAS');

  // Importes inconsistentes: el monto físico de items NO reconcilia con el contractual
  // y esa discrepancia no queda ya explicada por ITEMS_FANTASMA (que sí reconcilia).
  const importesInconsistentes = !itemsFantasma && !moneyEq(sumaItemsActuales, montoContractual);
  if (importesInconsistentes) flags.push('IMPORTES_INCONSISTENTES');

  // Si las relaciones existen pero su suma no reconcilia con el contractual, y no es
  // explicable por faltantes/duplicadas (conteo correcto pero montos mal repartidos).
  if (!relacionesFaltantes && !relacionesDuplicadas && relaciones.length > 0
    && !moneyEq(sumaRelaciones, montoContractual)) {
    if (!flags.includes('IMPORTES_INCONSISTENTES')) flags.push('IMPORTES_INCONSISTENTES');
  }

  if (!flags.length) return { categoria: 'CONSISTENTE', accion: 'MANTENER', flags };
  if (flags.length > 1) return { categoria: 'MIXTA', accion: 'RECONCILIAR', flags };
  return { categoria: flags[0], accion: 'RECONCILIAR', flags };
}

/** Construye (sin aplicar) la estructura DESPUÉS propuesta, reutilizando resolveOrdenEntregaItemLinea. */
export function proponerEstructura({ itemsCanonicos, entregas }) {
  const n = entregas.length || 1;
  const itemsPropuestos = itemsCanonicos.map((it, idx) => ({
    id: `(reconstruido#${idx + 1})`,
    descripcion: it.descripcion,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    precio_total: it.precio_total,
  }));
  const relacionesPropuestas = [];
  for (const it of itemsCanonicos) {
    const linea = resolveOrdenEntregaItemLinea(it, n);
    for (const e of entregas) {
      relacionesPropuestas.push({
        entrega: e.etiqueta_entrega || e.codigo_entrega || `#${e.numero_entrega}`,
        item: it.descripcion,
        cantidad: it.cantidad,
        precio_unitario: linea.precio_unitario,
        precio_total: linea.precio_total,
      });
    }
  }
  return { itemsPropuestos, entregasPropuestas: entregas, relacionesPropuestas };
}

/** Simula una 2ª ejecución sobre el estado YA reconciliado (en memoria, sin BD). */
export function simularIdempotencia({ propuesta, itemsCanonicos, fuente, entregasCount, montoContractual }) {
  const itemsActualesSimulados = propuesta.itemsPropuestos.map((it) => ({
    descripcion: it.descripcion, cantidad: it.cantidad,
    precio_unitario: it.precio_unitario, precio_total: it.precio_total,
  }));
  const relacionesSimuladas = propuesta.relacionesPropuestas.map((r) => ({
    precio_total: r.precio_total,
  }));
  return clasificar({
    itemsActuales: itemsActualesSimulados,
    relaciones: relacionesSimuladas,
    entregasCount,
    montoContractual,
    itemsCanonicos,
    fuente,
  });
}

function fmtMonto(n) {
  return `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function printTablaAntes(titulo, items, entregas, relaciones) {
  console.log(`\n  -- ${titulo} --`);
  console.log('  orden_items:');
  console.log('    id | descripción (60) | cantidad | PU | total');
  items.forEach((it) => console.log(`    ${it.id ?? '—'} | ${String(it.descripcion || '').slice(0, 60)} | ${it.cantidad} | ${fmtMonto(it.precio_unitario)} | ${fmtMonto(it.precio_total)}`));
  console.log('  orden_entregas:');
  console.log('    id | entregable | plazo | importe');
  entregas.forEach((e) => console.log(`    ${e.id ?? '—'} | ${e.etiqueta_entrega || e.codigo_entrega} | ${e.dias_plazo ?? '—'}d | ${fmtMonto(e.importe)}`));
  console.log('  orden_entrega_items:');
  if (!relaciones.length) console.log('    (sin filas)');
  relaciones.forEach((r) => console.log(`    ${r.id ?? '—'} | entrega=${r.entrega ?? r.orden_entrega_id} | item=${r.item ?? r.orden_item_id} | cant=${r.cantidad} | PU=${fmtMonto(r.precio_unitario)} | total=${fmtMonto(r.precio_total)}`));
}

async function auditarOrden(orden) {
  const { items, entregas, relaciones } = await leerEstadoActual(orden.id);
  const { itemsCanonicos, fuente, evidencia } = await reconstruirItemsCanonicos(orden);
  const montoContractual = Number(orden.monto_total || 0);
  const sumaRelacionesActuales = round2(relaciones.reduce((a, r) => a + Number(r.precio_total || 0), 0));

  const { categoria, accion, flags } = clasificar({
    itemsActuales: items, relaciones, entregasCount: entregas.length,
    montoContractual, itemsCanonicos, fuente,
  });

  let propuesta = null;
  let idempotenciaSegundaCorrida = null;
  if (accion === 'RECONCILIAR') {
    propuesta = proponerEstructura({ itemsCanonicos, entregas });
    idempotenciaSegundaCorrida = simularIdempotencia({
      propuesta, itemsCanonicos, fuente, entregasCount: entregas.length, montoContractual,
    });
  }

  return {
    orden, items, entregas, relaciones, itemsCanonicos, fuente, evidencia,
    montoContractual, sumaRelacionesActuales, categoria, accion, flags, propuesta,
    idempotenciaSegundaCorrida,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(args.message);
    process.exit(args.code);
  }

  console.log('\n=== RC8.13.3 — Reconciliación administrativa de órdenes históricas (DRY-RUN, solo lectura) ===\n');

  const candidatas = await resolverOrdenesCandidatas(args);
  if (!candidatas.length) {
    console.log('No se encontraron órdenes candidatas para los filtros indicados.');
    return;
  }

  const filas = [];
  for (const orden of candidatas) {
    // eslint-disable-next-line no-await-in-loop
    const r = await auditarOrden(orden);
    filas.push(r);
  }

  console.log('Orden | REQ | Tipo | Items act. | Items prop. | Entregas | Rel. act. | Rel. prop. | Monto contractual | Monto dist. actual | Monto dist. propuesto | Clasificación | Acción');
  for (const r of filas) {
    const itemsProp = r.propuesta ? r.propuesta.itemsPropuestos.length : r.items.length;
    const relProp = r.propuesta ? r.propuesta.relacionesPropuestas.length : r.relaciones.length;
    const montoDistProp = r.propuesta
      ? round2(r.propuesta.relacionesPropuestas.reduce((a, x) => a + x.precio_total, 0))
      : r.sumaRelacionesActuales;
    console.log([
      `${r.orden.tipo_orden}-${r.orden.numero_orden}/${r.orden.anio_orden} (id=${r.orden.id})`,
      r.orden.requerimiento_codigo,
      r.orden.tipo_contratacion,
      r.items.length,
      itemsProp,
      r.entregas.length,
      r.relaciones.length,
      relProp,
      fmtMonto(r.montoContractual),
      fmtMonto(r.sumaRelacionesActuales),
      fmtMonto(montoDistProp),
      r.categoria,
      r.accion,
    ].join(' | '));
  }

  for (const r of filas) {
    if (r.accion === 'SIN_EVIDENCIA') {
      console.log(`\n[orden ${r.orden.id}] SIN_EVIDENCIA — ${r.evidencia}. No se propone ningún cambio.`);
      continue;
    }
    if (r.accion === 'MANTENER') continue;

    console.log(`\n[orden ${r.orden.id} — ${r.orden.tipo_orden} ${r.orden.numero_orden}] Clasificación: ${r.categoria} (${r.flags.join(', ')}) — fuente contractual: ${r.fuente} (${r.evidencia})`);
    printTablaAntes('ANTES (estado físico actual)', r.items, r.entregas, r.relaciones.map((x) => ({ ...x, entrega: x.orden_entrega_id, item: x.orden_item_id })));
    printTablaAntes('DESPUÉS PROPUESTO (NO aplicado)', r.propuesta.itemsPropuestos, r.propuesta.entregasPropuestas, r.propuesta.relacionesPropuestas);
    const sumaItemsProp = round2(r.propuesta.itemsPropuestos.reduce((a, x) => a + x.precio_total, 0));
    const sumaRelProp = round2(r.propuesta.relacionesPropuestas.reduce((a, x) => a + x.precio_total, 0));
    console.log(`  Verificación de conservación: SUM(items propuestos)=${fmtMonto(sumaItemsProp)} vs monto contractual=${fmtMonto(r.montoContractual)} → ${moneyEq(sumaItemsProp, r.montoContractual) ? 'OK' : 'DESCUADRA'}`);
    console.log(`  Verificación de conservación: SUM(relaciones propuestas)=${fmtMonto(sumaRelProp)} vs monto contractual=${fmtMonto(r.montoContractual)} → ${moneyEq(sumaRelProp, r.montoContractual) ? 'OK' : 'DESCUADRA'}`);
    console.log(`  Simulación de idempotencia (2ª corrida sobre el estado ya reconciliado): categoria=${r.idempotenciaSegundaCorrida.categoria}, accion=${r.idempotenciaSegundaCorrida.accion} → ${r.idempotenciaSegundaCorrida.accion === 'MANTENER' ? 'OK (converge, no seguiría reconciliando)' : 'ALERTA (no converge)'}`);
  }

  console.log('\n=== FIN DRY-RUN — NINGÚN DATO FUE MODIFICADO (solo SELECT) ===\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('Error en dry-run:', err.message);
    process.exit(1);
  });
}

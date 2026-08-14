/**
 * Validaciones puras del cronograma de órdenes (sin DB).
 * OD37: el importe se recalcula siempre como cantidad × precio_unitario_adjudicado (ítem DB).
 */

const MONEY_TOL = 0.01;

function moneyEq(a, b, tol = MONEY_TOL) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tol;
}

function qtyEq(a, b, tol = 0.0001) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tol;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function round4(n) {
  return Math.round(Number(n || 0) * 10000) / 10000;
}

export function httpError(message, status = 400, code = 'ORDEN_ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Recalcula líneas de entrega usando el PU adjudicado persistido en orden_items.
 * No confía en precio_unitario / precio_total enviados por el cliente.
 */
export function normalizarLineasEntrega(items, lineasPayload) {
  const lineas = Array.isArray(lineasPayload) ? lineasPayload : [];
  const out = [];
  for (const li of lineas) {
    const item = items.find((it) => Number(it.id) === Number(li.orden_item_id));
    if (!item) throw httpError('Ítem de entrega inválido', 400, 'ITEM_INVALIDO');
    const cant = Number(li.cantidad || 0);
    if (cant < 0) {
      throw httpError('Cantidades negativas no permitidas', 400, 'CANTIDAD_INVALIDA');
    }
    // 0 = ítem no incluido en esta entrega (distribución parcial)
    if (!(cant > 0)) continue;
    const pu = Number(item.precio_unitario);
    if (!(pu > 0)) {
      throw httpError(
        `El precio unitario adjudicado del ítem "${item.descripcion}" no está disponible`,
        400,
        'PU_MISSING',
      );
    }
    if (li.precio_unitario != null && Number(li.precio_unitario) > 0
      && !moneyEq(li.precio_unitario, pu)) {
      throw httpError(
        'El precio unitario debe coincidir con el adjudicado del Cuadro Comparativo',
        400,
        'PU_MISMATCH',
      );
    }
    out.push({
      orden_item_id: item.id,
      cantidad: cant,
      precio_unitario: pu,
      precio_total: round2(cant * pu),
      porcentaje: li.porcentaje != null ? Number(li.porcentaje) : null,
    });
  }
  return out;
}

/**
 * Normaliza hitos de un único servicio contractual por su importe real.
 * El PU del ítem representa el servicio completo; el PU del entregable representa
 * solo ese hito y por ello no son magnitudes comparables.
 */
export function normalizarLineasEntregableItemUnico(items, lineasPayload) {
  if (!Array.isArray(items) || items.length !== 1) {
    return normalizarLineasEntrega(items, lineasPayload);
  }
  const item = items[0];
  const lineas = Array.isArray(lineasPayload) ? lineasPayload : [];
  const out = [];
  for (const li of lineas) {
    if (Number(item.id) !== Number(li.orden_item_id)) {
      throw httpError('Ítem de entrega inválido', 400, 'ITEM_INVALIDO');
    }
    const cant = Number(li.cantidad || 0);
    if (cant < 0) {
      throw httpError('Cantidades negativas no permitidas', 400, 'CANTIDAD_INVALIDA');
    }
    if (!(cant > 0)) continue;
    const totalRaw = li.precio_total != null
      ? Number(li.precio_total)
      : cant * Number(li.precio_unitario || 0);
    if (!Number.isFinite(totalRaw) || totalRaw < 0) {
      throw httpError('Importe de entregable inválido', 400, 'IMPORTE_INVALIDO');
    }
    const total = round2(totalRaw);
    out.push({
      orden_item_id: item.id,
      cantidad: cant,
      precio_unitario: round4(total / cant),
      precio_total: total,
      porcentaje: li.porcentaje != null ? Number(li.porcentaje) : null,
    });
  }
  return out;
}

export function esCronogramaPorHitos(orden, items) {
  const tipo = String(orden?.tipo_contratacion || '').toLowerCase();
  return Array.isArray(items)
    && items.length === 1
    && /servicio|locad|locaci/.test(tipo);
}

/**
 * RC8.14.1 Obs.52 — función canónica de validación económica del cronograma. Con
 * exactamente 1 ítem/servicio contractual (el caso general de LOCACIÓN/SERVICIO sin
 * cuadro, ya reconciliado — mismo criterio que esFlatMode en el frontend), el PU por
 * línea NO se valida contra "el adjudicado del Cuadro Comparativo": ese PU completo
 * (p. ej. 14000) no es comparable contra el importe de UN entregable (p. ej. 7000) —
 * ambos son correctos, representan una distribución en hitos del mismo servicio, no
 * ítems distintos. La validación real es económica: SUM(importes de los entregables
 * configurados) === monto adjudicado de la orden (que ya es la fuente correcta según
 * el tipo de proceso: cuadro comparativo o cotización adjudicada — resuelta una sola
 * vez al registrar la orden, no se recalcula aquí ni se reintroduce una dependencia
 * del Cuadro Comparativo para LOCACIÓN).
 * Con más de 1 ítem contractual real (BIEN multiítem, o SERVICIO/BIEN con cuadro y
 * varios productos) se preserva SIN CAMBIOS la validación original por línea
 * (cantidad exacta distribuida + PU exacto adjudicado), necesaria para no permitir
 * que se mezclen cantidades/precios entre productos distintos.
 */
export function validarCronogramaContraItems(orden, items, entregasPayload) {
  if (!Array.isArray(entregasPayload) || !entregasPayload.length) {
    throw httpError('Debe existir al menos una entrega o entregable', 400, 'SIN_ENTREGAS');
  }
  if (!Array.isArray(items) || !items.length) {
    throw httpError('La orden no tiene ítems adjudicados', 400, 'SIN_ITEMS');
  }

  const esPorHitos = esCronogramaPorHitos(orden, items);
  const correlativos = new Set();
  let sumaImportes = 0;
  const qtyPorItem = new Map();

  for (const e of entregasPayload) {
    const num = Number(e.numero_entrega);
    if (!Number.isFinite(num) || num < 1 || num > 24) {
      throw httpError('Número de entrega inválido (1–24)', 400);
    }
    if (correlativos.has(num)) {
      throw httpError(`Correlativo duplicado: ${num}`, 400, 'CORRELATIVO_DUPLICADO');
    }
    correlativos.add(num);

    // Descripción operativa retirada de la UI; se genera automáticamente si falta
    const dias = Number(e.dias_plazo);
    if (!Number.isFinite(dias) || dias < 1) {
      throw httpError('Cada entrega debe tener plazo aplicable (días ≥ 1)', 400, 'SIN_PLAZO');
    }

    const lineasRaw = Array.isArray(e.items) ? e.items : [];
    let importeEntrega = 0;

    if (esPorHitos && lineasRaw.length) {
      // Monto del entregable tal cual lo registró el usuario (importe real del
      // hito), sin validar PU aislado contra el ítem contractual completo.
      const lineas = normalizarLineasEntregableItemUnico(items, lineasRaw);
      importeEntrega = round2(lineas.reduce((a, li) => a + li.precio_total, 0));
    } else if (lineasRaw.length) {
      const lineas = normalizarLineasEntrega(items, lineasRaw);
      for (const li of lineas) {
        qtyPorItem.set(li.orden_item_id, (qtyPorItem.get(li.orden_item_id) || 0) + li.cantidad);
        importeEntrega += li.precio_total;
      }
    } else if (e.porcentaje != null && !(Number(e.importe) > 0)) {
      importeEntrega = round2((Number(e.porcentaje) / 100) * Number(orden.monto_total));
      if (importeEntrega < 0) throw httpError('Importe negativo no permitido', 400);
    } else {
      importeEntrega = round2(Number(e.importe || 0));
      if (importeEntrega < 0) throw httpError('Importe negativo no permitido', 400);
    }

    if (!(importeEntrega > 0)) {
      throw httpError(
        `La entrega ${num} tiene importe 0.00; revise cantidades y precio unitario adjudicado`,
        400,
        'IMPORTE_CERO',
      );
    }
    sumaImportes += importeEntrega;
  }

  // La validación de cantidad distribuida por ítem solo aplica con varios ítems
  // contractuales reales — con 1 solo ítem/servicio, la cantidad (típicamente 1) no
  // se reparte entre entregables (son hitos del mismo servicio, no unidades físicas).
  const hayDistribucion = !esPorHitos
    && entregasPayload.some((e) => Array.isArray(e.items) && e.items.length);
  if (hayDistribucion) {
    for (const it of items) {
      const sum = qtyPorItem.get(it.id) || 0;
      if (!qtyEq(sum, it.cantidad)) {
        throw httpError(
          `La cantidad distribuida del ítem "${it.descripcion}" (${sum}) no coincide con la adjudicada (${it.cantidad})`,
          400,
          'CANTIDAD_MISMATCH',
        );
      }
    }
  }

  if (!moneyEq(sumaImportes, orden.monto_total)) {
    const montoAdj = Number(orden.monto_total || 0);
    const diferencia = round2(montoAdj - sumaImportes);
    const mensaje = esPorHitos
      ? 'El monto total de los entregables debe coincidir con el monto adjudicado de la cotización. '
        + `Monto adjudicado: S/ ${montoAdj.toFixed(2)}. Monto registrado: S/ ${sumaImportes.toFixed(2)}. `
        + `Diferencia: S/ ${diferencia.toFixed(2)}.`
      : `La suma de importes (${sumaImportes.toFixed(2)}) no coincide con el total adjudicado (${montoAdj.toFixed(2)})`;
    throw httpError(mensaje, 400, 'MONTO_MISMATCH');
  }

  return { sumaImportes: round2(sumaImportes), qtyPorItem };
}

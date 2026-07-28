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

export function validarCronogramaContraItems(orden, items, entregasPayload) {
  if (!Array.isArray(entregasPayload) || !entregasPayload.length) {
    throw httpError('Debe existir al menos una entrega o entregable', 400, 'SIN_ENTREGAS');
  }
  if (!Array.isArray(items) || !items.length) {
    throw httpError('La orden no tiene ítems adjudicados', 400, 'SIN_ITEMS');
  }

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

    if (lineasRaw.length) {
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

  const hayDistribucion = entregasPayload.some((e) => Array.isArray(e.items) && e.items.length);
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
    throw httpError(
      `La suma de importes (${sumaImportes.toFixed(2)}) no coincide con el total adjudicado (${Number(orden.monto_total).toFixed(2)})`,
      400,
      'MONTO_MISMATCH',
    );
  }

  return { sumaImportes: round2(sumaImportes), qtyPorItem };
}

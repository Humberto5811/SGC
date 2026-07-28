/**
 * Checklist de validación preventiva de expediente (FE/BE).
 * Extensible por etapa: Registro de Órdenes → Recepción → Ejecución → Pago.
 */

export const ETAPAS_CHECKLIST = Object.freeze({
  REGISTRO_ORDENES_NOTIFICACION: 'REGISTRO_ORDENES_NOTIFICACION',
  RECEPCION: 'RECEPCION',
  EJECUCION: 'EJECUCION',
  PAGO: 'PAGO',
});

const MONEY_TOL = 0.01;
const QTY_TOL = 0.0001;

function moneyEq(a, b, tol = MONEY_TOL) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tol;
}

function qtyEq(a, b, tol = QTY_TOL) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tol;
}

/** Catálogo de requisitos por etapa (acciones UI reutilizables). */
export const REQUISITOS_POR_ETAPA = Object.freeze({
  [ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION]: [
    {
      id: 'ccp_firmado',
      label: 'CCP firmado',
      action: 'adjuntarCcpFirmado',
      mensajePendiente: 'Falta adjuntar el CCP firmado.',
    },
    {
      id: 'numero_orden',
      label: 'Número de orden',
      action: 'editarOrden',
      mensajePendiente: 'Falta registrar el número de orden.',
    },
    {
      id: 'fecha_orden',
      label: 'Fecha de orden',
      action: 'editarOrden',
      mensajePendiente: 'Falta registrar la fecha de orden.',
    },
    {
      id: 'orden_firmada',
      label: 'Orden firmada',
      action: 'adjuntarOrdenFirmada',
      mensajePendiente: 'Falta adjuntar la orden firmada.',
    },
    {
      id: 'entregas',
      label: 'Entregas / entregables',
      action: 'adminEntregas',
      mensajePendiente: 'Falta configurar el cronograma de entregas/entregables.',
    },
    {
      id: 'inicio_actividad',
      label: 'Inicio de actividad',
      action: 'adminEntregas',
      mensajePendiente: 'Falta configurar el inicio de actividad.',
    },
    {
      id: 'cantidades',
      label: 'Cantidades distribuidas',
      action: 'adminEntregas',
      mensajePendiente: 'La cantidad distribuida no coincide con la adjudicada.',
    },
    {
      id: 'importes',
      label: 'Importes validados',
      action: 'adminEntregas',
      mensajePendiente: 'El monto distribuido no coincide con el monto adjudicado.',
    },
  ],
  [ETAPAS_CHECKLIST.RECEPCION]: [
    {
      id: 'orden_notificada',
      label: 'Orden notificada',
      action: 'verNotificacion',
      mensajePendiente: 'La orden aún no ha sido notificada al proveedor.',
    },
    {
      id: 'recepcion_confirmada',
      label: 'Recepción confirmada',
      action: 'verConfirmacion',
      mensajePendiente: 'El proveedor aún no confirmó la recepción.',
    },
  ],
  [ETAPAS_CHECKLIST.EJECUCION]: [
    {
      id: 'recepcion_confirmada',
      label: 'Recepción confirmada',
      action: 'verConfirmacion',
      mensajePendiente: 'Se requiere recepción confirmada antes de ejecutar.',
    },
    {
      id: 'derivado_ejecucion',
      label: 'Derivado a Ejecución',
      action: 'derivarEjecucion',
      mensajePendiente: 'La orden aún no fue derivada a Ejecución.',
    },
  ],
  [ETAPAS_CHECKLIST.PAGO]: [
    {
      id: 'en_ejecucion',
      label: 'En ejecución',
      action: 'verHistorial',
      mensajePendiente: 'La orden debe estar en ejecución para iniciar pagos.',
    },
  ],
});

/**
 * Evalúa si cantidades e importes del snapshot cuadran.
 * snapshot.items: [{ id, cantidad, precio_unitario, precio_total }]
 * snapshot.entrega_items: [{ orden_item_id, cantidad, precio_total }]
 * snapshot.entregas_importe_sum / monto_total
 */
export function evaluarDistribucion(snapshot = {}) {
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const lineas = Array.isArray(snapshot.entrega_items) ? snapshot.entrega_items : [];
  if (!items.length) {
    return { cantidades_ok: false, importes_ok: false };
  }
  if (!(Number(snapshot.entregas_count || 0) > 0)) {
    return { cantidades_ok: false, importes_ok: false };
  }

  const qty = new Map();
  let sumaImp = 0;
  for (const li of lineas) {
    const id = Number(li.orden_item_id);
    const cant = Number(li.cantidad || 0);
    qty.set(id, (qty.get(id) || 0) + cant);
    const pu = Number(items.find((it) => Number(it.id) === id)?.precio_unitario || 0);
    const tot = li.precio_total != null
      ? Number(li.precio_total)
      : Math.round(cant * pu * 100) / 100;
    sumaImp += tot;
  }

  let cantidadesOk = true;
  for (const it of items) {
    const dist = qty.get(Number(it.id)) || 0;
    if (!qtyEq(dist, it.cantidad)) {
      cantidadesOk = false;
      break;
    }
  }

  const monto = Number(snapshot.monto_total != null
    ? snapshot.monto_total
    : items.reduce((a, it) => a + Number(it.precio_total || 0), 0));
  const importesOk = moneyEq(sumaImp, monto);
  return { cantidades_ok: cantidadesOk, importes_ok: importesOk };
}

function okDeSnapshot(id, snap, dist) {
  switch (id) {
    case 'ccp_firmado':
      return !!snap.ccp_firmado;
    case 'numero_orden':
      return !!String(snap.numero_orden || '').trim();
    case 'fecha_orden':
      return !!snap.fecha_orden;
    case 'orden_firmada':
      return !!snap.orden_firmada;
    case 'entregas':
      return Number(snap.entregas_count || 0) > 0;
    case 'inicio_actividad':
      return !!snap.inicio_actividad;
    case 'cantidades':
      return dist.cantidades_ok === true;
    case 'importes':
      return dist.importes_ok === true;
    case 'orden_notificada':
      return !!snap.orden_notificada || !!snap.enviado_proveedor_at;
    case 'recepcion_confirmada':
      return !!snap.recepcion_confirmada || !!snap.recibido_proveedor_at;
    case 'derivado_ejecucion':
      return !!snap.derivado_ejecucion || !!snap.derivado_ejecucion_at;
    case 'en_ejecucion':
      return !!snap.en_ejecucion
        || String(snap.estado || '').toUpperCase() === 'EN_EJECUCION';
    default:
      return false;
  }
}

/**
 * Evalúa checklist de una etapa.
 * @returns {{ etapa, completo, items, pendientes, primerPendiente, resumen }}
 */
export function evaluarChecklist(etapa, snapshot = {}) {
  const defs = REQUISITOS_POR_ETAPA[etapa] || [];
  const dist = (snapshot.cantidades_ok != null && snapshot.importes_ok != null)
    ? { cantidades_ok: !!snapshot.cantidades_ok, importes_ok: !!snapshot.importes_ok }
    : evaluarDistribucion(snapshot);

  const items = defs.map((def) => {
    const ok = okDeSnapshot(def.id, snapshot, dist);
    return {
      id: def.id,
      label: def.label,
      action: def.action,
      ok,
      estado: ok ? 'Completo' : 'Pendiente',
      mensaje: ok ? null : def.mensajePendiente,
    };
  });
  const pendientes = items.filter((i) => !i.ok);
  return {
    etapa,
    completo: pendientes.length === 0,
    items,
    pendientes,
    primerPendiente: pendientes[0] || null,
    resumen: pendientes.length
      ? `Faltan ${pendientes.length} requisito(s): ${pendientes.map((p) => p.label).join(', ')}`
      : 'Todos los requisitos están completos',
  };
}

/** ¿Puede pasar a ORDEN_LISTA_NOTIFICACION? */
export function listoParaNotificacion(snapshot) {
  return evaluarChecklist(ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION, snapshot).completo;
}

export function etiquetaEstadoChecklist(completo) {
  return completo ? 'Completo' : 'Pendiente';
}

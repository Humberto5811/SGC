/**
 * Reglas de saldo / recepción por combinación Orden → Ítem → Entrega.
 */

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

/**
 * @param {{
 *   orden?: object,
 *   itemEntregas?: array,
 *   recepciones?: array,
 *   montoTotal?: number,
 *   montoLiquidarAcumulado?: number,
 * }} input
 * @returns {{ permitido: boolean, motivo: string, combinacionesPendientes: array, recepcionCompleta: boolean }}
 */
export function canRegistrarRecepcion({
  orden = {},
  itemEntregas = [],
  recepciones = [],
  montoTotal = null,
  montoLiquidarAcumulado = null,
} = {}) {
  const total = money(montoTotal != null ? montoTotal : orden.monto_total);
  const acum = money(
    montoLiquidarAcumulado != null
      ? montoLiquidarAcumulado
      : (orden.monto_liquidar_acumulado ?? orden.monto_a_liquidar),
  );
  const combos = Array.isArray(itemEntregas) ? itemEntregas : [];
  const recs = Array.isArray(recepciones) ? recepciones : [];

  let pendientes = combos.filter((c) => Number(c.saldo_pendiente ?? c.cantidad_programada ?? c.cantidad ?? 0) > 0.0001);

  // Recepciones sin líneas de ítem: saldos aparentan “completos” aunque ya se liquidó.
  if (recs.length && combos.length) {
    const saldosIntactos = combos.every((c) => {
      const prog = Number(c.cantidad_programada ?? c.cantidad ?? 0);
      const saldo = Number(c.saldo_pendiente ?? prog);
      return Math.abs(saldo - prog) < 0.0001;
    });
    if (saldosIntactos && total > 0 && acum >= total - 0.01) {
      pendientes = [];
    }
  }

  // Sin combinaciones: usar monto liquidado vs total
  if (!combos.length) {
    if (recs.length && total > 0 && acum >= total - 0.01) {
      return {
        permitido: false,
        motivo: 'La entrega ya fue recibida completamente y no admite otra recepción.',
        combinacionesPendientes: [],
        recepcionCompleta: true,
      };
    }
    return {
      permitido: true,
      motivo: '',
      combinacionesPendientes: [],
      recepcionCompleta: false,
    };
  }

  if (!pendientes.length) {
    return {
      permitido: false,
      motivo: 'La entrega ya fue recibida completamente y no admite otra recepción.',
      combinacionesPendientes: [],
      recepcionCompleta: true,
    };
  }

  return {
    permitido: true,
    motivo: '',
    combinacionesPendientes: pendientes,
    recepcionCompleta: false,
  };
}

/**
 * Flags de menú a partir de bandeja / detalle.
 */
export function resolveAccionesRecepcionBienes({
  estado,
  rol = 'dec',
  puedeRegistrarRecepcion = false,
  tieneRecepcion = false,
  actaEstado = null,
  actaVisada = false,
  derivadoAu = false,
} = {}) {
  const r = String(rol || '').toLowerCase();
  const isAlmacen = r === 'dec' || r === 'admin' || r === 'almacen';
  const isAu = r === 'au' || r === 'area_usuaria';
  const est = String(estado || '');

  const acciones = {
    verExpediente: true,
    registrarRecepcion: false,
    registrarActa: false,
    administrarActa: false,
    adjuntarActaVisada: false,
    derivarAu: false,
    verHistorial: true,
    cargarActaAu: false,
    observarAu: false,
  };

  if (derivadoAu || est === 'CONFORMIDAD_PENDIENTE_AU') {
    if (isAu) {
      acciones.cargarActaAu = true;
      acciones.observarAu = true;
    }
    acciones.administrarActa = isAlmacen || isAu;
    return acciones;
  }

  if (isAlmacen) {
    if (['RECEPCION_BIENES_PENDIENTE', 'RECEPCION_BIENES_OBSERVADA', 'BIEN_RECIBIDO_ALMACEN'].includes(est)) {
      acciones.registrarRecepcion = !!puedeRegistrarRecepcion;
    }
    if (tieneRecepcion && ['BIEN_RECIBIDO_ALMACEN', 'RECEPCION_BIENES_OBSERVADA'].includes(est)) {
      const borradorOGenerada = !actaEstado
        || ['ACTA_RECEPCION_BORRADOR', 'ACTA_RECEPCION_GENERADA', 'ACTA_RECEPCION_EDITADA'].includes(actaEstado);
      if (!actaEstado || borradorOGenerada) {
        acciones.registrarActa = true;
        acciones.administrarActa = !!actaEstado;
      }
      if (['ACTA_RECEPCION_GENERADA', 'ACTA_RECEPCION_EDITADA', 'ACTA_RECEPCION_BORRADOR'].includes(actaEstado)) {
        acciones.adjuntarActaVisada = true;
        acciones.administrarActa = true;
        acciones.registrarActa = false; // pasa a administrar
      }
      if (actaEstado === 'ACTA_RECEPCION_VISADA_ALMACEN' || actaVisada) {
        acciones.administrarActa = true;
        acciones.adjuntarActaVisada = true; // reemplazar antes de derivar
        acciones.derivarAu = true;
        acciones.registrarActa = false;
      }
    }
  }

  return acciones;
}

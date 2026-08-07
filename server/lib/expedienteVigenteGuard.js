/**
 * RC8.7.1 — Blindaje de escritura sobre fuente única.
 *
 * Únicos mecanismos autorizados para cambiar expediente_estado_vigente
 * y expediente_asignaciones (cuando ya hay vigente confirmado):
 *   - transicionarExpediente()
 *   - reconciliarEstadoResponsablePorEvidencia()  (incluye F.3 apply)
 *
 * Backfill / migraciones: SOLO si no existe fila vigente, o marca
 * explícita de no inicializado (responsable_fuente = backfill_inicial
 * y version = 1 sin reconciliación/transición previa).
 */
export const ORIGEN_ESCRITURA_VIGENTE = Object.freeze({
  TRANSICION: 'transicionarExpediente',
  RECONCILIACION: 'reconciliarEstadoResponsablePorEvidencia',
  /** Solo inserta si no hay fila; nunca pisa confirmado. */
  BACKFILL_VACIO: 'backfill_solo_si_vacio',
});

const AUTORIZADOS_MUTACION = new Set([
  ORIGEN_ESCRITURA_VIGENTE.TRANSICION,
  ORIGEN_ESCRITURA_VIGENTE.RECONCILIACION,
]);

const AUTORIZADOS_CUALQUIERA = new Set([
  ...AUTORIZADOS_MUTACION,
  ORIGEN_ESCRITURA_VIGENTE.BACKFILL_VACIO,
]);

/** Fuentes que indican vigente aún no confirmado por flujo/reconciliación. */
const FUENTES_NO_INICIALIZADAS = new Set([
  'backfill_inicial',
  'pendiente',
  'BACKFILL',
]);

/**
 * @param {object|null} row — fila expediente_estado_vigente
 * @returns {boolean}
 */
export function isVigenteConfirmado(row) {
  if (!row) return false;
  const fuente = String(row.responsable_fuente || row.responsableFuente || '').trim();
  const version = Number(row.version || 0);
  const actualizadoPor = String(row.actualizado_por || row.actualizadoPor || '').trim();
  // Confirmado si ya pasó por transición/reconciliación o tiene versión > backfill.
  if (AUTORIZADOS_MUTACION.has(fuente)) return true;
  if (/^transicionarExpediente|^reconciliacion|^RECONCILIACION|^obs45|^rc87|^rc86/i.test(fuente)) {
    return true;
  }
  if (/^transicionarExpediente|^rc86|^rc87|^obs45|^reconcili/i.test(actualizadoPor)) {
    return true;
  }
  if (version > 1 && !FUENTES_NO_INICIALIZADAS.has(fuente)) return true;
  if (fuente && !FUENTES_NO_INICIALIZADAS.has(fuente) && version >= 1) {
    // Unidad/persona asignada por flujo (unidad_etapa, asignacion_explicita, etc.)
    if (/unidad_etapa|asignacion_explicita|unidad_destino|reconciliacion/i.test(fuente)) {
      return true;
    }
  }
  // backfill_inicial version 1 → no confirmado
  if (FUENTES_NO_INICIALIZADAS.has(fuente) && version <= 1) return false;
  // Fila presente con datos reales de etapa avanzada → confirmar
  const etapa = String(row.etapa_codigo || '').toUpperCase();
  if (etapa && !['REGISTRO', ''].includes(etapa) && version >= 1
    && !FUENTES_NO_INICIALIZADAS.has(fuente)) {
    return true;
  }
  return false;
}

export function assertOrigenEscrituraVigente(origenEscritura, { allowBackfill = false } = {}) {
  const o = String(origenEscritura || '').trim();
  const ok = allowBackfill
    ? AUTORIZADOS_CUALQUIERA.has(o)
    : AUTORIZADOS_MUTACION.has(o);
  if (!ok) {
    const err = new Error(
      `RC8.7.1: escritura a vigente no autorizada (origen=${o || '∅'}). `
      + `Use transicionarExpediente() o reconciliarEstadoResponsablePorEvidencia().`,
    );
    err.code = 'VIGENTE_ESCRITURA_NO_AUTORIZADA';
    err.status = 403;
    throw err;
  }
  return o;
}

/**
 * Decide si un UPSERT/UPDATE puede proceder.
 * @returns {{ ok: boolean, noop?: boolean, motivo?: string }}
 */
export function evaluarEscrituraVigente({ origenEscritura, existente = null } = {}) {
  const origen = assertOrigenEscrituraVigente(origenEscritura, { allowBackfill: true });

  if (origen === ORIGEN_ESCRITURA_VIGENTE.BACKFILL_VACIO) {
    if (!existente) return { ok: true, motivo: 'backfill_sin_fila' };
    if (!isVigenteConfirmado(existente)) {
      // Permitir reemplazar backfill no inicializado solo vía reconciliación/transición,
      // no vía backfill repetido.
      return { ok: false, noop: true, motivo: 'backfill_omitido_fila_existente' };
    }
    return { ok: false, noop: true, motivo: 'backfill_omitido_vigente_confirmado' };
  }

  if (AUTORIZADOS_MUTACION.has(origen)) {
    return { ok: true, motivo: 'origen_autorizado' };
  }

  return { ok: false, noop: true, motivo: 'origen_denegado' };
}

export default {
  ORIGEN_ESCRITURA_VIGENTE,
  isVigenteConfirmado,
  assertOrigenEscrituraVigente,
  evaluarEscrituraVigente,
};

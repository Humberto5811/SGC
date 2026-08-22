/**
 * RC8.15.6G-7 — Cálculo institucional de penalidad (Anexo 11).
 *
 * Fórmula:
 *   penalidad_diaria = 0.10 × monto_base / (F × plazo_días)
 *   F = 0.40
 *   penalidad_calculada = penalidad_diaria × días_atraso
 *   penalidad_máxima = 10% × monto_base
 *   penalidad_aplicable = MIN(penalidad_calculada, penalidad_máxima)
 *   monto_a_pagar = monto_base − penalidad_aplicable
 */
export const REGLA_PENALIDAD_VERSION = 'G7-ANEXO11-V1';

export const FACTOR_F_ANEXO11 = 0.40;
export const TASA_BASE_ANEXO11 = 0.10;
export const TOPE_PORCENTAJE_ANEXO11 = 0.10;

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function buildFaltante(campo, mensaje) {
  return { campo, mensaje };
}

/**
 * @param {object} input
 * @returns {{ ok: true, entrada, resultado } | { ok: false, faltantes: Array }}
 */
export function calcularPenalidadInstitucional(input = {}) {
  const faltantes = [];
  const montoBase = Number(input.monto_base);
  const plazoDias = Number(input.plazo_dias);
  const diasAtraso = Number(input.dias_atraso ?? 0);

  if (!Number.isFinite(montoBase) || montoBase <= 0) {
    faltantes.push(buildFaltante('monto_base', 'Falta monto del entregable (importe o precio total del ítem)'));
  }
  if (!Number.isFinite(plazoDias) || plazoDias <= 0) {
    faltantes.push(buildFaltante('plazo_dias', 'Falta plazo contractual del entregable (días)'));
  }
  if (input.dias_atraso == null || !Number.isFinite(diasAtraso) || diasAtraso < 0) {
    faltantes.push(buildFaltante('dias_atraso', 'No se pudo determinar los días de atraso (fechas contractuales o recepción)'));
  }
  if (faltantes.length) {
    return { ok: false, faltantes };
  }

  const penalidadDiaria = roundMoney(
    (TASA_BASE_ANEXO11 * montoBase) / (FACTOR_F_ANEXO11 * plazoDias),
  );
  const penalidadCalculada = diasAtraso > 0
    ? roundMoney(penalidadDiaria * diasAtraso)
    : 0;
  const penalidadMaxima = roundMoney(TOPE_PORCENTAJE_ANEXO11 * montoBase);
  const penalidadAplicable = roundMoney(Math.min(penalidadCalculada, penalidadMaxima));
  const montoAPagar = roundMoney(Math.max(0, montoBase - penalidadAplicable));

  const entrada = {
    monto_base: roundMoney(montoBase),
    plazo_dias: Math.trunc(plazoDias),
    dias_atraso: Math.trunc(diasAtraso),
    total_dias_ampliacion: Number(input.total_dias_ampliacion || 0),
    fecha_maxima_contractual: input.fecha_maxima_contractual || null,
    fecha_maxima_ajustada: input.fecha_maxima_ajustada || null,
    fecha_presentacion: input.fecha_presentacion || null,
    monto_total_orden: input.monto_total_orden != null ? roundMoney(input.monto_total_orden) : null,
    regla_version: REGLA_PENALIDAD_VERSION,
  };

  const resultado = {
    monto_base_aplicable: entrada.monto_base,
    plazo_aplicable: entrada.plazo_dias,
    dias_atraso: entrada.dias_atraso,
    penalidad_diaria: penalidadDiaria,
    penalidad_calculada: penalidadCalculada,
    penalidad_maxima: penalidadMaxima,
    penalidad_aplicable: penalidadAplicable,
    monto_a_pagar: montoAPagar,
    tope_porcentaje: TOPE_PORCENTAJE_ANEXO11,
    factor_f: FACTOR_F_ANEXO11,
    tasa_base: TASA_BASE_ANEXO11,
    regla_version: REGLA_PENALIDAD_VERSION,
    formula_diaria: '0.10 × monto_base / (0.40 × plazo_días)',
    formula_calculada: 'penalidad_diaria × días_atraso',
    formula_tope: '10% × monto_base',
  };

  return { ok: true, entrada, resultado };
}

export function describirFormulaPenalidad() {
  return {
    regla_version: REGLA_PENALIDAD_VERSION,
    penalidad_diaria: '0.10 × monto_base / (0.40 × plazo_días)',
    penalidad_calculada: 'penalidad_diaria × días_atraso',
    penalidad_maxima: '10% × monto_base',
    penalidad_aplicable: 'MIN(penalidad_calculada, penalidad_máxima)',
    monto_a_pagar: 'monto_base − penalidad_aplicable',
  };
}

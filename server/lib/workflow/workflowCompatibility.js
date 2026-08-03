/**
 * Workflow Compatibility — lectura compatible con el sistema legacy.
 *
 * Reglas:
 * - `requerimientos.estado_actual` es prioridad ABSOLUTA de ubicación.
 * - Aliases legados se convierten SOLO para lectura (nunca para decisiones nuevas).
 * - NUNCA se convierte estado de cotización en etapa de expediente.
 * - NUNCA se convierte estado de cuadro en etapa de expediente.
 * - NUNCA workflowSnapshot sobrescribe estado_actual.
 * - Expone advertencias ante divergencia.
 * - NO escribe datos.
 */
import { normalizarEtapaCodigo } from '../../../shared/workflow/workflowContract.js';
import { normalizarTipo } from '../../../shared/workflow/tiposContratacion.js';

/**
 * Lee la etapa vigente priorizando estado_actual.
 * @returns {{ etapa: string, fuente: string, advertencias: string[] }}
 */
export function resolverEtapaLegacy(row = {}) {
  const advertencias = [];
  const fromDb = String(row?.estado_actual || row?.estadoActual || '').trim().toUpperCase();
  const fromDbNormalizado = normalizarEtapaCodigo(fromDb);

  if (fromDbNormalizado) {
    // Snapshot jamás sobrescribe BD.
    const snap = extraerSnapshot(row);
    if (snap?.etapaActual) {
      const snapEtapa = String(snap.etapaActual).toUpperCase();
      if (snapEtapa !== fromDbNormalizado) {
        advertencias.push(`MON_SNAPSHOT_DIVERGENTE: estado_actual=${fromDbNormalizado}, snapshot=${snapEtapa}`);
      }
    }
    return { etapa: fromDbNormalizado, fuente: 'estado_actual', advertencias };
  }

  // Fallback SOLO lectura: estado negocio → etapa (mapa legacy declarativo).
  const estadoNegocio = String(row?.estado || '').trim();
  const etapaFromNegocio = mapEstadoNegocioLegacy(estadoNegocio);
  if (etapaFromNegocio) {
    advertencias.push(`MON_FALLBACK_NEGOCIO: estado_actual vacío, se usó estado negocio "${estadoNegocio}"`);
    return { etapa: etapaFromNegocio, fuente: 'estado_negocio', advertencias };
  }

  return { etapa: '', fuente: 'none', advertencias };
}

/** Extrae workflowSnapshot del payload sin mutar nada. */
export function extraerSnapshot(row = {}) {
  let payload = row?.payload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (_) {
      return null;
    }
  }
  if (!payload || typeof payload !== 'object') return null;
  const snap = payload.workflowSnapshot || payload.workflow_snapshot;
  return snap && typeof snap === 'object' ? snap : null;
}

/**
 * Mapa legacy de negocio → etapa (SOLO lectura).
 * Nunca escribe y nunca se usa para decidir transiciones.
 */
export function mapEstadoNegocioLegacy(estado) {
  const e = String(estado || '').trim().toLowerCase();
  if (!e || e === 'registrado') return 'REGISTRO';
  if (e === 'aprobado dec' || /observado dec/i.test(e)) return 'PROGRAMACION';
  if (e === 'aprobado' || /tr[aá]mite/i.test(e)) return 'EVALUACION';
  if (e === 'programado' || /aprobad.*program/i.test(e)) return 'COORDINACION_CM';
  if (/invitaci|sol\.?\s*cot/i.test(e)) return 'INVITACIONES';
  if (/cotizaci/i.test(e)) return 'RECEPCION_COTIZACIONES';
  if (/valid/i.test(e)) return 'VALIDACIONES';
  if (/cuadro comp/i.test(e)) return 'CUADRO_COMPARATIVO';
  if (/\bccp\b/i.test(e)) return 'CCP';
  if (/ejecuci/i.test(e)) return 'RECEPCION_BIENES';
  if (/finaliz/i.test(e)) return 'FINALIZADO';
  if (/observ/i.test(e)) {
    // Observación sin contexto → no podemos decidir etapa; devuelve vacío.
    return '';
  }
  return '';
}

/**
 * Detecta si una fila tiene estado de dominio que NUNCA debe convertirse en etapa.
 * Cotización y cuadro son dominios separados.
 * @returns {{ cruceDetectado: boolean, advertencias: string[] }}
 */
export function detectarCruceDomino(row = {}) {
  const advertencias = [];
  const etapa = String(row?.estado_actual || '').trim().toUpperCase();

  // Cotización nunca define etapa de expediente.
  const cozEstado = String(row?.cotizacion_estado || row?.estado_cotizacion || row?.validacion_estado || '').toUpperCase();
  if (cozEstado && /COT_|PRESENTADA|VALIDADA|NO_VALIDA/.test(cozEstado)) {
    if (!etapa) {
      advertencias.push('MON_DOMINIO_INCOMPATIBLE: no se deriva etapa desde estado de cotización');
    }
  }

  // Cuadro nunca define etapa de expediente.
  const cuaEstado = String(row?.cuadro_estado || row?.estado_cuadro || '').toUpperCase();
  if (cuaEstado && /CUA_|BORRADOR|GENERADO|FIRMADO|DERIVADO_CCP/.test(cuaEstado)) {
    if (!etapa) {
      advertencias.push('MON_DOMINIO_INCOMPATIBLE: no se deriva etapa desde estado de cuadro');
    }
  }

  return { cruceDetectado: advertencias.length > 0, advertencias };
}

/** Lee tipo de contratación legacy con alias (solo lectura). */
export function resolverTipoLegacy(row = {}) {
  return normalizarTipo(row?.tipo || '');
}

export default {
  resolverEtapaLegacy,
  extraerSnapshot,
  mapEstadoNegocioLegacy,
  detectarCruceDomino,
  resolverTipoLegacy,
};
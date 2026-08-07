/**
 * RC8.7 — Reconciliación única de estado/responsable por evidencia real.
 * Fachada sobre RC8.6F.3 ampliada (EN_ORDEN → REGISTRO_ORDEN, etc.).
 * Dry-run por defecto. Apply idempotente vía expedienteEstadoPersistido.
 */
import {
  planReconciliarEtapaResponsableEjecucion,
  aplicarReconciliarEtapaResponsableEjecucion,
  resolverEtapaDesdeEvidencia,
  resolverResponsableParaEtapa,
  ORIGEN_RECONCILIACION_F3,
} from './reconciliarEtapaResponsableEjecucion.js';

export const ORIGEN_RECONCILIACION_RC87 = 'RECONCILIACION_RC87_EVIDENCIA';

/**
 * @param {{ requerimientoId?: number, requerimientoIds?: number[], dryRun?: boolean, motivo?: string, actor?: string }} opts
 */
export async function reconciliarEstadoResponsablePorEvidencia({
  requerimientoId = null,
  requerimientoIds = null,
  dryRun = true,
  motivo = '',
  actor = 'rc87_reconcile',
} = {}) {
  const ids = [];
  if (requerimientoId != null) ids.push(Number(requerimientoId));
  if (Array.isArray(requerimientoIds)) ids.push(...requerimientoIds.map(Number));
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))];

  const plan = await planReconciliarEtapaResponsableEjecucion({
    requerimientoIds: unique.length ? unique : null,
  });

  const inconsistencias = (plan.rows || []).filter((r) => r.accion === 'RECONCILIAR');

  if (dryRun !== false) {
    return {
      ok: true,
      dryRun: true,
      origen: ORIGEN_RECONCILIACION_RC87,
      motivo: motivo || null,
      actor: actor || null,
      rows: plan.rows,
      inconsistencias,
    };
  }

  const applied = await aplicarReconciliarEtapaResponsableEjecucion({
    requerimientoIds: unique.length ? unique : null,
    dryRun: false,
  });

  return {
    ok: true,
    dryRun: false,
    origen: ORIGEN_RECONCILIACION_RC87,
    motivo: motivo || null,
    actor: actor || null,
    ...applied,
    inconsistencias,
  };
}

export {
  planReconciliarEtapaResponsableEjecucion,
  aplicarReconciliarEtapaResponsableEjecucion,
  resolverEtapaDesdeEvidencia,
  resolverResponsableParaEtapa,
  ORIGEN_RECONCILIACION_F3,
};

export default reconciliarEstadoResponsablePorEvidencia;

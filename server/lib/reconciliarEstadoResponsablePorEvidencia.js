/**
 * RC8.7 / RC8.11 — Reconciliación única de estado/responsable por evidencia real.
 * RC8.11: bootstrap canónico completo pre-CCP + post-CCP (dry-run por defecto).
 */
import {
  planReconciliarBootstrapCanonico,
  aplicarReconciliarBootstrapCanonico,
  resolverEtapaDesdeEvidencia,
  resolverResponsableBootstrap,
  ORIGEN_RECONCILIACION_RC811,
  CLASIFICACION,
} from './reconciliarBootstrapCanonico.js';
import {
  planReconciliarEtapaResponsableEjecucion,
  aplicarReconciliarEtapaResponsableEjecucion,
  resolverResponsableParaEtapa,
  ORIGEN_RECONCILIACION_F3,
} from './reconciliarEtapaResponsableEjecucion.js';

export const ORIGEN_RECONCILIACION_RC87 = 'RECONCILIACION_RC87_EVIDENCIA';

/**
 * @param {{ requerimientoId?: number, requerimientoIds?: number[], dryRun?: boolean, motivo?: string, actor?: string, modo?: string }} opts
 * modo: 'bootstrap' (RC8.11, default) | 'ejecucion' (solo CCP+)
 */
export async function reconciliarEstadoResponsablePorEvidencia({
  requerimientoId = null,
  requerimientoIds = null,
  dryRun = true,
  motivo = '',
  actor = 'rc87_reconcile',
  modo = 'bootstrap',
} = {}) {
  const ids = [];
  if (requerimientoId != null) ids.push(Number(requerimientoId));
  if (Array.isArray(requerimientoIds)) ids.push(...requerimientoIds.map(Number));
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))];

  if (modo === 'ejecucion') {
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

  // RC8.11 — bootstrap canónico (default)
  const plan = await planReconciliarBootstrapCanonico({
    requerimientoIds: unique.length ? unique : null,
  });
  const inconsistencias = (plan.rows || []).filter((r) => r.accion === 'RECONCILIAR');

  if (dryRun !== false) {
    return {
      ok: true,
      dryRun: true,
      origen: ORIGEN_RECONCILIACION_RC811,
      motivo: motivo || null,
      actor: actor || null,
      rows: plan.rows,
      inconsistencias,
      contadores: plan.contadores,
      clasificacion: CLASIFICACION,
    };
  }

  // Apply solo vía bootstrap (origenEscritura=RECONCILIACION). Scripts RC8.11 no deben usarlo.
  const applied = await aplicarReconciliarBootstrapCanonico({
    requerimientoIds: unique.length ? unique : null,
    dryRun: false,
  });

  return {
    ok: true,
    dryRun: false,
    origen: ORIGEN_RECONCILIACION_RC811,
    motivo: motivo || null,
    actor: actor || null,
    ...applied,
    inconsistencias,
    contadores: applied.contadores || plan.contadores,
  };
}

export {
  planReconciliarBootstrapCanonico,
  aplicarReconciliarBootstrapCanonico,
  planReconciliarEtapaResponsableEjecucion,
  aplicarReconciliarEtapaResponsableEjecucion,
  resolverEtapaDesdeEvidencia,
  resolverResponsableParaEtapa,
  resolverResponsableBootstrap,
  ORIGEN_RECONCILIACION_F3,
  ORIGEN_RECONCILIACION_RC811,
  CLASIFICACION,
};

export default reconciliarEstadoResponsablePorEvidencia;

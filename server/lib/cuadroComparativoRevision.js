/**
 * RC8.4 — Revisión institucional del Cuadro Comparativo.
 * Estados documentales del cuadro + sync Workflow oficial (registrarMovimiento).
 * Etapa Workflow permanece CUADRO_COMPARATIVO hasta la salida a CCP.
 */
import { query } from '../db.js';
import { registrarMovimiento, ETAPAS as ETAPAS_TRAZA } from './trazabilidad.js';
import { getSubModuloMeta } from './movimientos.js';
import { ETAPAS } from '../../core/workflowEngine/WorkflowState.js';
import { TRANSICIONES_POR_ACCION } from '../../core/workflowEngine/WorkflowTransitions.js';
import {
  ROLES_REVISION,
  BANDEJA_ESTADOS_POR_ROL,
  ROLES_ACTUAR_COMO,
  resolveRolRevision,
  resolveModoAperturaExpediente,
  resolveRolEfectivoRevision,
  normalizeActuarComo,
  labelRolRevision,
  puedeMostrarBotonesCcp,
  isRolSistemaAdmin,
} from '../../shared/cuadroComparativoRol.js';

export {
  ROLES_REVISION,
  BANDEJA_ESTADOS_POR_ROL,
  ROLES_ACTUAR_COMO,
  resolveRolRevision,
  resolveModoAperturaExpediente,
  resolveRolEfectivoRevision,
  normalizeActuarComo,
  labelRolRevision,
  puedeMostrarBotonesCcp,
  isRolSistemaAdmin,
};

/** Estados de revisión (documentales en cuadros_comparativos.estado). */
export const ESTADOS_REVISION_CUADRO = Object.freeze({
  CUADRO_BORRADOR: 'CUADRO_BORRADOR',
  PENDIENTE_COORDINADOR: 'PENDIENTE_COORDINADOR',
  OBSERVADO_COORDINADOR: 'OBSERVADO_COORDINADOR',
  FIRMADO_COORDINADOR: 'FIRMADO_COORDINADOR',
  PENDIENTE_DEC: 'PENDIENTE_DEC',
  OBSERVADO_DEC: 'OBSERVADO_DEC',
  APROBADO_DEC: 'APROBADO_DEC',
  PENDIENTE_CCP: 'PENDIENTE_CCP',
  DERIVADO_CCP: 'DERIVADO_CCP',
});

export const ESTADOS_REVISION_LABEL = Object.freeze({
  CUADRO_BORRADOR: 'Cuadro borrador',
  PENDIENTE_COORDINADOR: 'C.C. en revisión Coordinador CM',
  OBSERVADO_COORDINADOR: 'Observado por Coordinador CM',
  FIRMADO_COORDINADOR: 'Firmado por Coordinador CM',
  PENDIENTE_DEC: 'C.C. en revisión DEC',
  OBSERVADO_DEC: 'Observado por DEC',
  APROBADO_DEC: 'Aprobado por DEC',
  PENDIENTE_CCP: 'Listo para CCP',
  DERIVADO_CCP: 'Derivado a CCP',
});

export const RESPONSABLES_REVISION = Object.freeze({
  ANALISTA: 'Especialista Contrataciones',
  COORDINADOR_CM: 'Coordinador CM',
  DEC: 'DEC',
  CCP: 'Comité de Compras Públicas',
});

/**
 * Transiciones oficiales del ciclo de revisión (capa documental).
 * La única transición de etapa Workflow sigue siendo CUADRO_COMPARATIVO → CCP.
 */
export const TRANSICIONES_REVISION_CUADRO = Object.freeze([
  {
    accion: 'DERIVAR_COORDINADOR',
    rol: ROLES_REVISION.ANALISTA,
    from: [
      ESTADOS_REVISION_CUADRO.CUADRO_BORRADOR,
      'EN_ELABORACION', 'BORRADOR', 'GENERADO', 'GENERADO_PRELIMINAR',
      'ADJUDICADO', 'FIRMADO',
      ESTADOS_REVISION_CUADRO.OBSERVADO_COORDINADOR,
      ESTADOS_REVISION_CUADRO.OBSERVADO_DEC,
    ],
    to: ESTADOS_REVISION_CUADRO.PENDIENTE_COORDINADOR,
    responsable: RESPONSABLES_REVISION.COORDINADOR_CM,
  },
  /**
   * RC8.5-D — Dar Conformidad: exige PDF firmado y registra conformidad.
   * Permanece en Coordinador (FIRMADO_COORDINADOR) hasta Derivar a DEC.
   */
  {
    accion: 'CONFORMIDAD_COORDINADOR',
    rol: ROLES_REVISION.COORDINADOR_CM,
    from: [
      ESTADOS_REVISION_CUADRO.PENDIENTE_COORDINADOR,
      ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
    ],
    to: ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
    responsable: RESPONSABLES_REVISION.COORDINADOR_CM,
    requireFirmado: true,
    sameStage: true,
  },
  /** Alias: misma conformidad sin derivar */
  {
    accion: 'APROBAR_COORDINADOR',
    rol: ROLES_REVISION.COORDINADOR_CM,
    from: [
      ESTADOS_REVISION_CUADRO.PENDIENTE_COORDINADOR,
      ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
    ],
    to: ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
    responsable: RESPONSABLES_REVISION.COORDINADOR_CM,
    requireFirmado: true,
    sameStage: true,
  },
  /**
   * RC8.5-D — Derivar a DEC (paso explícito tras conformidad).
   * Gates: PDF firmado + conformidad (versión vigente / sin obs se validan en UI y requireConformidad).
   */
  {
    accion: 'DERIVAR_DEC',
    rol: ROLES_REVISION.COORDINADOR_CM,
    from: [
      ESTADOS_REVISION_CUADRO.PENDIENTE_COORDINADOR,
      ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
    ],
    to: ESTADOS_REVISION_CUADRO.PENDIENTE_DEC,
    via: ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
    responsable: RESPONSABLES_REVISION.DEC,
    requireConformidad: true,
    requireFirmado: true,
  },
  {
    accion: 'OBSERVAR_COORDINADOR',
    rol: ROLES_REVISION.COORDINADOR_CM,
    from: [
      ESTADOS_REVISION_CUADRO.PENDIENTE_COORDINADOR,
      ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
    ],
    to: ESTADOS_REVISION_CUADRO.OBSERVADO_COORDINADOR,
    responsable: RESPONSABLES_REVISION.ANALISTA,
    /** RC8.5-D1 — Motivo vía componente institucional (no triad propia). */
    requireObservacionEstructurada: false,
    requireMotivoInstitucional: true,
  },
  /** RC8.6 — Conformidad DEC (exige PDF Coordinador + PDF DEC; no deriva aún) */
  {
    accion: 'CONFORMIDAD_DEC',
    rol: ROLES_REVISION.DEC,
    from: [
      ESTADOS_REVISION_CUADRO.PENDIENTE_DEC,
      ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
    ],
    to: ESTADOS_REVISION_CUADRO.PENDIENTE_DEC,
    responsable: RESPONSABLES_REVISION.DEC,
    sameStage: true,
    requireFirmado: true,
    requireFirmadoDec: true,
  },
  /** RC8.6 — Aprobar y derivar al Analista (Generación CCP) */
  {
    accion: 'DERIVAR_ANALISTA',
    rol: ROLES_REVISION.DEC,
    from: [
      ESTADOS_REVISION_CUADRO.PENDIENTE_DEC,
      ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
    ],
    to: ESTADOS_REVISION_CUADRO.APROBADO_DEC,
    responsable: RESPONSABLES_REVISION.ANALISTA,
    requireConformidadDec: true,
    requireFirmado: true,
    requireFirmadoDec: true,
  },
  /** Alias: Aprobar DEC = derivar al Analista conforme */
  {
    accion: 'APROBAR_DEC',
    rol: ROLES_REVISION.DEC,
    from: [
      ESTADOS_REVISION_CUADRO.PENDIENTE_DEC,
      ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
    ],
    to: ESTADOS_REVISION_CUADRO.APROBADO_DEC,
    responsable: RESPONSABLES_REVISION.ANALISTA,
    requireConformidadDec: true,
    requireFirmado: true,
    requireFirmadoDec: true,
  },
  {
    accion: 'OBSERVAR_DEC',
    rol: ROLES_REVISION.DEC,
    from: [
      ESTADOS_REVISION_CUADRO.PENDIENTE_DEC,
      ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
    ],
    to: ESTADOS_REVISION_CUADRO.OBSERVADO_DEC,
    responsable: RESPONSABLES_REVISION.ANALISTA,
    /** RC8.5-D1 — Motivo vía componente institucional (no triad propia). */
    requireObservacionDecEstructurada: false,
    requireMotivoInstitucional: true,
  },
  /** RC8.8 — Generar CCP (solo con cuadro plenamente aprobado; no deriva aún) */
  {
    accion: 'GENERAR_CCP',
    rol: ROLES_REVISION.ANALISTA,
    from: [
      ESTADOS_REVISION_CUADRO.APROBADO_DEC,
      ESTADOS_REVISION_CUADRO.PENDIENTE_CCP,
    ],
    to: ESTADOS_REVISION_CUADRO.PENDIENTE_CCP,
    responsable: RESPONSABLES_REVISION.ANALISTA,
    requireConformidad: true,
    requireConformidadDec: true,
    requireFirmado: true,
    requireFirmadoDec: true,
    requireVersionVigente: true,
  },
]);

/** Eventos de trazabilidad RC8.8 (vía registrarMovimiento). */
export const EVENTOS_TRAZA_CUADRO_CCP = Object.freeze({
  CUADRO_APROBADO_DEC: 'CUADRO_APROBADO_DEC',
  CCP_GENERADO: 'CCP_GENERADO',
  CCP_DERIVADO: 'CCP_DERIVADO',
});

/** Responsable de bandeja según estado documental del cuadro. */
export function responsableBandejaPorEstado(estado) {
  const e = String(estado || '').toUpperCase();
  if (['PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR'].includes(e)) {
    return RESPONSABLES_REVISION.COORDINADOR_CM;
  }
  if (e === 'PENDIENTE_DEC') return RESPONSABLES_REVISION.DEC;
  if (e === 'DERIVADO_CCP') return RESPONSABLES_REVISION.CCP;
  return RESPONSABLES_REVISION.ANALISTA;
}

export function findTransicionRevision(accion, estadoActual) {
  const a = String(accion || '').toUpperCase();
  const e = String(estadoActual || '').toUpperCase();
  return TRANSICIONES_REVISION_CUADRO.find((t) => (
    t.accion === a && t.from.map((x) => String(x).toUpperCase()).includes(e)
  )) || null;
}

function parsePayload(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
  } catch (_) {
    return {};
  }
}

async function requerimientoIdsDeSolicitud(solicitudId) {
  const { rows } = await query(`
    SELECT DISTINCT requerimiento_id AS id FROM solicitud_requerimientos
    WHERE solicitud_id = $1 AND requerimiento_id IS NOT NULL
    UNION
    SELECT DISTINCT requerimiento_id AS id FROM cotizaciones_proveedor
    WHERE solicitud_id = $1 AND requerimiento_id IS NOT NULL
  `, [solicitudId]);
  return rows.map((r) => r.id).filter(Boolean);
}

/**
 * Actualiza responsable/submódulo/snapshot vía Workflow oficial
 * sin salir de la etapa CUADRO_COMPARATIVO.
 */
export async function syncRevisionCuadroWorkflow(solicitudId, {
  revisionEstado,
  responsable,
  usuario = 'Sistema',
  observacion = '',
  accion = 'derivado',
} = {}) {
  if (!solicitudId || !revisionEstado) return { actualizados: 0 };
  const etapa = ETAPAS.CUADRO_COMPARATIVO;
  const estadoNegocio = 'En Cuadro Comparativo';
  const resp = responsable || RESPONSABLES_REVISION.ANALISTA;
  const meta = getSubModuloMeta(etapa);
  const ids = await requerimientoIdsDeSolicitud(solicitudId);
  let actualizados = 0;

  for (const requerimientoId of ids) {
    await registrarMovimiento({
      requerimientoId,
      estadoNuevo: estadoNegocio,
      usuario,
      accion,
      observacion: observacion || `Revisión cuadro: ${revisionEstado}`,
      responsable: resp,
      etapaEjecutor: etapa,
      etapaDestino: etapa,
    });

    const { rows } = await query('SELECT payload, estado_actual, sub_modulo_actual, responsable_actual FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!rows.length) continue;
    const payload = parsePayload(rows[0].payload);
    payload.workflowSnapshot = {
      ...(payload.workflowSnapshot || {}),
      etapaActual: etapa,
      subModuloActual: meta.subModulo || 'Cuadro Comparativo',
      moduloActual: meta.modulo || 'Contrataciones',
      responsableActual: resp,
      revisionEstado,
      fechaEstadoActual: new Date().toISOString(),
    };
    await query(`
      UPDATE requerimientos
      SET responsable_actual = $2,
          sub_modulo_actual = $3,
          estado_actual = $4,
          payload = $5::jsonb
      WHERE id = $1
    `, [
      requerimientoId,
      resp,
      meta.subModulo || 'Cuadro Comparativo',
      etapa,
      JSON.stringify(payload),
    ]);
    actualizados += 1;
  }

  return { actualizados, etapa, revisionEstado, responsable: resp };
}

/**
 * RC8.8 — Registra evento nombrado en historial_movimientos vía registrarMovimiento.
 * No altera el catálogo Workflow (etapa permanece salvo etapaDestino explícito).
 */
export async function registrarEventoCuadroCcp(solicitudId, {
  evento,
  usuario = 'Sistema',
  observacion = '',
  responsable = RESPONSABLES_REVISION.ANALISTA,
  etapaDestino = null,
  estadoNegocio = null,
} = {}) {
  if (!solicitudId || !evento) return { actualizados: 0 };
  const etapa = ETAPAS.CUADRO_COMPARATIVO;
  const dest = etapaDestino ? String(etapaDestino).toUpperCase() : etapa;
  const estado = estadoNegocio
    || (dest === ETAPAS.CCP ? 'En CCP' : 'En Cuadro Comparativo');
  const ids = await requerimientoIdsDeSolicitud(solicitudId);
  let actualizados = 0;
  for (const requerimientoId of ids) {
    await registrarMovimiento({
      requerimientoId,
      estadoNuevo: estado,
      usuario,
      accion: evento,
      observacion: observacion || evento,
      responsable: responsable || RESPONSABLES_REVISION.ANALISTA,
      etapaEjecutor: etapa,
      etapaDestino: dest,
    });
    actualizados += 1;
  }
  return { actualizados, evento, etapaDestino: dest };
}

/** Verifica que la salida Workflow oficial CUADRO → CCP siga vigente. */
export function assertSalidaCcpOficial() {
  const dest = TRANSICIONES_POR_ACCION.APROBAR?.[ETAPAS.CUADRO_COMPARATIVO];
  if (String(dest || '').toUpperCase() !== 'CCP') {
    throw new Error('Transición Workflow CUADRO_COMPARATIVO → CCP no disponible en catálogo');
  }
  return dest;
}

export function accionesDisponiblesRevision(estado, rol) {
  const e = String(estado || '').toUpperCase();
  const r = String(rol || ROLES_REVISION.ANALISTA).toUpperCase();
  return TRANSICIONES_REVISION_CUADRO
    .filter((t) => t.rol === r && t.from.map((x) => String(x).toUpperCase()).includes(e))
    .map((t) => ({
      accion: t.accion,
      destino: t.to,
      label: ESTADOS_REVISION_LABEL[t.to] || t.to,
    }));
}

export { ETAPAS_TRAZA };

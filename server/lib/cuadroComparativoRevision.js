/**
 * RC8.4 — Revisión institucional del Cuadro Comparativo.
 * Estados documentales del cuadro + sync Workflow oficial (registrarMovimiento).
 * Etapa Workflow permanece CUADRO_COMPARATIVO hasta la salida a CCP.
 */
import { query } from '../db.js';
import { ETAPAS as ETAPAS_TRAZA } from './trazabilidad.js';
import { getSubModuloMeta } from './movimientos.js';
import { ETAPAS } from '../../core/workflowEngine/WorkflowState.js';
import { TRANSICIONES_POR_ACCION } from '../../core/workflowEngine/WorkflowTransitions.js';
import { transicionarExpediente } from './expedienteTransicion.js';
import { withTransaction } from './workflow/workflowTransaction.js';
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
  /** DEC observa y devuelve al Coordinador CM (no al Analista). */
  {
    accion: 'OBSERVAR_DEC_A_COORD',
    rol: ROLES_REVISION.DEC,
    from: [
      ESTADOS_REVISION_CUADRO.PENDIENTE_DEC,
      ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
    ],
    to: ESTADOS_REVISION_CUADRO.PENDIENTE_COORDINADOR,
    responsable: RESPONSABLES_REVISION.COORDINADOR_CM,
    requireMotivoInstitucional: true,
  },
  /**
   * DEC aprueba y deriva a CCP (flujo único).
   * Requiere firmas Coord+DEC; registra conformidad DEC; genera CCP y deriva.
   */
  {
    accion: 'APROBAR_DERIVAR_CCP',
    rol: ROLES_REVISION.DEC,
    from: [
      ESTADOS_REVISION_CUADRO.PENDIENTE_DEC,
      ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
      ESTADOS_REVISION_CUADRO.APROBADO_DEC,
      ESTADOS_REVISION_CUADRO.PENDIENTE_CCP,
    ],
    to: ESTADOS_REVISION_CUADRO.DERIVADO_CCP,
    responsable: RESPONSABLES_REVISION.CCP,
    requireFirmado: true,
    requireFirmadoDec: true,
    requireVersionVigente: true,
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
 * RC8.6A.1 — sync revisión cuadro vía transicionarExpediente (misma tx, sin doble UPDATE).
 */
export async function syncRevisionCuadroWorkflow(solicitudId, {
  revisionEstado,
  responsable,
  usuario = 'Sistema',
  observacion = '',
  accion = 'derivado',
  evento = null,
} = {}) {
  if (!solicitudId || !revisionEstado) return { actualizados: 0 };
  const etapa = ETAPAS.CUADRO_COMPARATIVO;
  const resp = responsable || RESPONSABLES_REVISION.ANALISTA;
  const meta = getSubModuloMeta(etapa);
  const a = String(accion || '').toUpperCase();
  const r = String(revisionEstado || '').toUpperCase();
  let eventoCodigo = evento;
  if (!eventoCodigo) {
    if (a.includes('OBSERV') || r.includes('OBSERV')) {
      eventoCodigo = (r.includes('DEC') || a.includes('DEC'))
        ? 'CUADRO_OBSERVADO_DEC'
        : 'CUADRO_OBSERVADO_COORDINACION';
    } else if (a.includes('APROBAR') && (a.includes('COORD') || r.includes('COORD'))) {
      eventoCodigo = 'CUADRO_APROBADO_COORDINACION';
    } else if (a.includes('DERIV') && a.includes('DEC')) {
      eventoCodigo = 'CUADRO_DERIVADO_DEC';
    } else if (a.includes('GENER')) {
      eventoCodigo = 'CUADRO_GENERADO';
    } else {
      eventoCodigo = 'CUADRO_DERIVADO_COORDINACION';
    }
  }
  const uid = /^\d+$/.test(String(resp).trim()) ? Number(resp) : null;

  return withTransaction(async (tx) => {
    const ids = await requerimientoIdsDeSolicitud(solicitudId);
    let actualizados = 0;
    for (const requerimientoId of ids) {
      try {
        await transicionarExpediente({
          requerimientoId,
          evento: eventoCodigo,
          usuarioDestinoId: uid,
          unidadDestino: uid ? null : String(resp),
          motivo: observacion || `Revisión cuadro: ${revisionEstado}`,
          metadata: {
            client_request_id: `cuadro-rev:${solicitudId}:${requerimientoId}:${eventoCodigo}:${revisionEstado}`,
            revisionEstado,
            via: 'syncRevisionCuadroWorkflow',
          },
          actorRol: usuario,
          domainMutator: async (client) => {
            const { rows } = await client.query(
              'SELECT payload FROM requerimientos WHERE id = $1',
              [requerimientoId],
            );
            if (!rows.length) return null;
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
            await client.query(
              'UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1',
              [requerimientoId, JSON.stringify(payload)],
            );
            return { revisionEstado };
          },
          client: tx,
        });
        actualizados += 1;
      } catch (err) {
        if (err?.code === 'TRANSITION_NOT_FOUND' || err?.code === '42P01') continue;
        throw err;
      }
    }
    return { actualizados, etapa, revisionEstado, responsable: resp };
  });
}

/**
 * RC8.6A.1 — evento cuadro/CCP vía transicionarExpediente (CUADRO_APROBADO_DEC si dest=CCP).
 */
export async function registrarEventoCuadroCcp(solicitudId, {
  evento,
  usuario = 'Sistema',
  observacion = '',
  responsable = RESPONSABLES_REVISION.ANALISTA,
  etapaDestino = null,
  estadoNegocio = null,
  revisionEstado = null,
} = {}) {
  if (!solicitudId || !evento) return { actualizados: 0 };
  const etapa = ETAPAS.CUADRO_COMPARATIVO;
  const dest = etapaDestino ? String(etapaDestino).toUpperCase() : etapa;
  const revEstado = revisionEstado
    || (dest === ETAPAS.CCP ? ESTADOS_REVISION_CUADRO.DERIVADO_CCP : null);
  const uid = /^\d+$/.test(String(responsable || '').trim()) ? Number(responsable) : null;
  const eventoCodigo = dest === ETAPAS.CCP
    ? 'CUADRO_APROBADO_DEC'
    : String(evento).toUpperCase().replace(/^CCP_DERIVADO$/, 'CUADRO_APROBADO_DEC');

  return withTransaction(async (tx) => {
    const ids = await requerimientoIdsDeSolicitud(solicitudId);
    let actualizados = 0;
    for (const requerimientoId of ids) {
      try {
        await transicionarExpediente({
          requerimientoId,
          evento: eventoCodigo === 'CCP_DERIVADO' ? 'CUADRO_APROBADO_DEC' : eventoCodigo,
          usuarioDestinoId: uid,
          unidadDestino: uid ? null : String(responsable || ''),
          motivo: observacion || evento,
          metadata: {
            client_request_id: `cuadro-ccp:${solicitudId}:${requerimientoId}:${eventoCodigo}`,
            evento_traza: evento,
            revisionEstado: revEstado,
            via: 'registrarEventoCuadroCcp',
            estadoNegocio,
          },
          actorRol: usuario,
          domainMutator: async (client) => {
            const { rows } = await client.query(
              'SELECT payload FROM requerimientos WHERE id = $1',
              [requerimientoId],
            );
            if (!rows.length) return null;
            const payload = parsePayload(rows[0].payload);
            const meta = getSubModuloMeta(dest);
            payload.workflowSnapshot = {
              ...(payload.workflowSnapshot || {}),
              etapaActual: dest,
              subModuloActual: meta.subModulo || (dest === ETAPAS.CCP ? 'CCP' : 'Cuadro Comparativo'),
              moduloActual: meta.modulo || 'Contrataciones',
              responsableActual: responsable || RESPONSABLES_REVISION.ANALISTA,
              fechaEstadoActual: new Date().toISOString(),
              ...(revEstado ? { revisionEstado: revEstado } : {}),
            };
            await client.query(
              'UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1',
              [requerimientoId, JSON.stringify(payload)],
            );
            return { revisionEstado: revEstado };
          },
          client: tx,
        });
        actualizados += 1;
      } catch (err) {
        if (err?.code === 'TRANSITION_NOT_FOUND' || err?.code === '42P01') continue;
        throw err;
      }
    }
    return { actualizados, evento: eventoCodigo, etapaDestino: dest, revisionEstado: revEstado };
  });
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

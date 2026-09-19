/**
 * RC8.17.8H6-B3 — Normalización idempotente de expedientes con consulta pendiente
 * creada antes de CONSULTA_PROVEEDOR_REGISTRADA (ERV aún en Invitaciones/Proveedores).
 */
import { query } from '../db.js';
import {
  ETAPA_CONSULTAS,
  resolveAnalistaInvitacionesPrevio,
} from './consultasExpedienteEstado.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../../shared/invitacionesExpedienteCanon.js';
import { TIPO_RESPONSABLE } from '../../shared/resolvedorEstadoResponsable.js';

export function esErvInvitacionesEsperandoProveedores(estadoVigente) {
  if (!estadoVigente) return false;
  const etapa = String(estadoVigente.etapa_codigo || '').toUpperCase();
  const estado = String(estadoVigente.estado_codigo || '').toUpperCase();
  const tipo = String(estadoVigente.responsable_tipo || '').toUpperCase();
  const unidad = String(estadoVigente.responsable_unidad || '').trim();
  return etapa === 'INVITACIONES'
    && estado === ESTADO_ESPERANDO_COTIZACIONES
    && tipo === TIPO_RESPONSABLE.UNIDAD
    && unidad === UNIDAD_RESPONSABLE_PROVEEDORES;
}

export async function countConsultasPendientesPorRequerimiento(requerimientoId, client = null) {
  const rid = parseInt(requerimientoId, 10);
  if (!Number.isFinite(rid) || rid <= 0) return 0;
  const q = client?.query ? client.query.bind(client) : query;
  const { rows } = await q(
    `SELECT COUNT(*)::int AS n FROM consultas_proveedor
     WHERE requerimiento_id = $1 AND UPPER(estado) = 'PENDIENTE'`,
    [rid],
  );
  return rows[0]?.n || 0;
}

/**
 * Analista histórico de Invitaciones: resolveAnalistaInvitacionesPrevio (ERV metadata,
 * payload requerimiento, expediente_asignaciones INVITACIONES/PERSONA).
 */
export async function resolverAnalistaLegacyConsultas(requerimientoId, estadoVigente = null, client = null) {
  return resolveAnalistaInvitacionesPrevio(requerimientoId, estadoVigente, client);
}

/**
 * Antes de operar en Consultas/Observaciones: I/ESPERANDO/Proveedores + consulta pendiente
 * → CONSULTA_PROVEEDOR_REGISTRADA (CO / EN_TRAMITE / PERSONA analista).
 */
export async function asegurarExpedienteConsultasCanonico(requerimientoId, opts = {}) {
  const rid = parseInt(requerimientoId, 10);
  if (!Number.isFinite(rid) || rid <= 0) {
    const err = new Error('requerimientoId inválido');
    err.status = 400;
    throw err;
  }

  const { rows: evRows } = await query(
    'SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1 LIMIT 1',
    [rid],
  );
  const ev = evRows[0] || null;
  const etapa = String(ev?.etapa_codigo || '').toUpperCase();
  if (etapa === ETAPA_CONSULTAS) {
    return { aplicada: false, razon: 'ya_en_consultas', estado_vigente: ev };
  }
  if (!esErvInvitacionesEsperandoProveedores(ev)) {
    return { aplicada: false, razon: 'erv_no_legacy', estado_vigente: ev };
  }

  const pendientes = await countConsultasPendientesPorRequerimiento(rid);
  if (pendientes <= 0) {
    return { aplicada: false, razon: 'sin_consulta_pendiente', estado_vigente: ev };
  }

  const analistaId = await resolverAnalistaLegacyConsultas(rid, ev);
  if (analistaId == null || !Number.isFinite(Number(analistaId))) {
    const err = new Error('No se pudo resolver analista de Invitaciones para normalizar la consulta legacy');
    err.code = 'CONSULTA_SIN_ANALISTA';
    err.status = 409;
    throw err;
  }

  const clientRequestId = opts.clientRequestId || `consulta-legacy-norm:${rid}`;
  const { transicionarExpediente } = await import('./expedienteTransicion.js');
  const result = await transicionarExpediente({
    requerimientoId: rid,
    evento: 'CONSULTA_PROVEEDOR_REGISTRADA',
    usuarioDestinoId: Number(analistaId),
    metadata: {
      client_request_id: clientRequestId,
      via: opts.via || 'consultasLegacyNormalizacion',
      normalizacion_legacy: true,
      analista_invitaciones_previo_id: Number(analistaId),
    },
    actorRol: opts.actorRol || 'consultas-legacy-norm',
  });

  return {
    aplicada: true,
    idempotente: !!result.idempotente,
    analista_id: Number(analistaId),
    estado_vigente: result.estado_vigente || null,
    evento: result.evento || null,
  };
}

export default {
  esErvInvitacionesEsperandoProveedores,
  countConsultasPendientesPorRequerimiento,
  resolverAnalistaLegacyConsultas,
  asegurarExpedienteConsultasCanonico,
};

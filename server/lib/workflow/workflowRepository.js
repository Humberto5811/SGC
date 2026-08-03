/**
 * Workflow Repository — acceso a BD del Workflow Engine.
 * Lectura de expediente, estados de dominio y verificación de idempotencia.
 */
import { query } from '../../db.js';
import { normalizarTipo } from '../../../shared/workflow/tiposContratacion.js';
import { normalizarEtapaCodigo } from '../../../shared/workflow/workflowContract.js';

export async function getExistingEventByIdempotencyKey(key, client = null) {
  const q = `
    SELECT id, expediente_id, evento_codigo, etapa_origen, etapa_destino,
           metadata, created_at
    FROM workflow_eventos
    WHERE idempotency_key = $1
    LIMIT 1
  `;
  try {
    const { rows } = client
      ? await client.query(q, [key])
      : await query(q, [key]);
    return rows[0] || null;
  } catch (err) {
    // Si la tabla no existe aún (migraciones no ejecutadas), no fallar en modo lectura-safe.
    if (err?.code === '42P01') return null;
    throw err;
  }
}

export async function getRequerimientoById(expedienteId, client = null) {
  const q = `
    SELECT r.id AS expediente_id,
           r.tipo,
           r.estado,
           r.estado_actual,
           r.sub_modulo_actual,
           r.responsable_actual,
           r.fecha_estado_actual,
           r.payload,
           r.created_at,
           r.updated_at
    FROM requerimientos r
    WHERE r.id = $1
    LIMIT 1
  `;
  const { rows } = client
    ? await client.query(q, [expedienteId])
    : await query(q, [expedienteId]);
  return rows[0] || null;
}

/** Normaliza tipo de contratación desde fila (columna `tipo` legacy). */
export function tipoDeRequerimiento(row) {
  return normalizarTipo(row?.tipo || '');
}

/** Normaliza etapa vigente desde fila. Prioriza estado_actual. */
export function etapaDeRequerimiento(row) {
  const raw = row?.estado_actual || row?.estadoActual || '';
  const norm = normalizarEtapaCodigo(raw);
  return norm || '';
}

/**
 * Lee estados de dominio de un expediente (constructor inyectable).
 * En esta fase base no hay mutadores productivos; retorna dominio expediente
 * y deja el resto en null salvo que el caller proporcione domainReader.
 *
 * @param {number} expedienteId
 * @param {object} [opts]
 * @param {Function} [opts.domainReader] — async (expedienteId, client) => ({ dominio: {codigo,label} })
 * @param {object} [opts.row] — fila ya cargada para evitar doble query
 * @param {object} [client]
 */
export async function getDomainStates(expedienteId, opts = {}, client = null) {
  const row = opts.row || await getRequerimientoById(expedienteId, client);
  if (!row) return null;

  const tipo = tipoDeRequerimiento(row);
  const etapa = etapaDeRequerimiento(row) || 'REGISTRO';

  const states = {};

  // Dominio expediente siempre derivado de la etapa vigente.
  const { getEstadoExpedienteDeEtapa } = await import('../../../shared/workflow/estadosPorDominio.js');
  const expEstado = getEstadoExpedienteDeEtapa(etapa);
  states.expediente = expEstado
    ? { codigo: expEstado.codigo, label: expEstado.label }
    : { codigo: 'EXP_REGISTRO', label: 'En Registro' };

  // Dominios adicionales vía reader inyectable (fases futuras).
  if (opts.domainReader && typeof opts.domainReader === 'function') {
    const extra = await opts.domainReader(expedienteId, client, { tipo, etapa, row });
    if (extra && typeof extra === 'object') {
      for (const [k, v] of Object.entries(extra)) {
        if (v && typeof v === 'object' && v.codigo) {
          states[k] = { codigo: String(v.codigo), label: String(v.label || v.codigo) };
        }
      }
    }
  }

  return states;
}

export default {
  getExistingEventByIdempotencyKey,
  getRequerimientoById,
  getDomainStates,
  tipoDeRequerimiento,
  etapaDeRequerimiento,
};
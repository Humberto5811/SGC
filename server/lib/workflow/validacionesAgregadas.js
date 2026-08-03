/**
 * Fase 2A.4B — devolución agregada de Validaciones a Invitaciones.
 *
 * Guard transaccional (usa el MISMO tx del motor) que evalúa todas las
 * cotizaciones de una solicitud y decide si corresponde COTIZACIONES_INVALIDAS_DEVUELTAS.
 *
 * Regla funcional:
 * - total_consideradas > 0;
 * - aptas === 0;
 * - pendientes === 0;
 * - no_aptas === total_consideradas.
 *
 * Bloquea si hay al menos una APTO, alguna pendiente (null/''/PENDIENTE/DERIVADA/
 * EN_PROCESO/OBSERVADO), ninguna cotización considerada, o si el tipo no es BIEN/SERVICIO.
 *
 * DomainMutator: conserva cotizaciones NO_APTO como históricas (sin tocar
 * fecha_presentacion/nro_invitacion/proveedores/contador_envios), actualiza
 * payload.historial_validaciones + payload.historial_invitaciones, y NO crea
 * reinvitación ni envía correo.
 */
import { query } from '../../db.js';

const ESTADO_APTO = new Set(['APTO']);
const ESTADO_NO_APTO = new Set(['NO_APTO']);
const ESTADO_PENDIENTE = new Set(['', 'PENDIENTE', 'DERIVADA', 'EN_PROCESO', 'OBSERVADO', null, undefined]);

/**
 * Evalúa el resultado agregado de validaciones de una solicitud.
 * @param {object} client — tx del motor (o null para pool).
 * @param {object} opts
 * @param {number} opts.solicitudId
 * @param {number} [opts.requerimientoId] — para validar origen real en la transición (opcional, el motor lo hace).
 * @returns {Promise<{
 *   total_consideradas, total_evaluadas, aptas, no_aptas, pendientes, omitidas, todas_no_aptas
 * }>}
 */
export function evaluarAgregadoDesdeFilas(cotizaciones = []) {
  let aptas = 0;
  let no_aptas = 0;
  let pendientes = 0;
  let omitidas = 0;

  for (const c of cotizaciones) {
    const ve = String(c?.ve ?? c?.validacion_estado ?? '').trim().toUpperCase();
    if (ESTADO_APTO.has(ve)) aptas += 1;
    else if (ESTADO_NO_APTO.has(ve)) no_aptas += 1;
    else {
      // Cualquier valor desconocido/no terminal cuenta como pendiente.
      pendientes += 1;
    }
  }

  const totalConsideradas = cotizaciones.length;
  const totalEvaluadas = aptas + no_aptas;
  const pendientesFinal = pendientes + omitidas;

  return {
    total_consideradas: totalConsideradas,
    total_evaluadas: totalEvaluadas,
    aptas,
    no_aptas,
    pendientes: pendientesFinal,
    omitidas,
    todas_no_aptas: totalConsideradas > 0 && aptas === 0 && pendientesFinal === 0 && no_aptas === totalConsideradas,
  };
}

export async function evaluarResultadoAgregadoValidaciones(client, { solicitudId }) {
  const run = client && typeof client.query === 'function' ? client.query.bind(client) : query;
  const { rows } = await run(`
    SELECT COALESCE(UPPER(TRIM(validacion_estado)), '') AS ve
    FROM cotizaciones_proveedor
    WHERE solicitud_id = $1
      AND estado = 'COTIZACION_PRESENTADA'
  `, [solicitudId]);

  return evaluarAgregadoDesdeFilas(rows);
}

/**
 * Fase 2A.4B — domainMutator de retorno agregado.
 * Ejecuta el guard con el tx, luego actualiza payload y solicitud con el mismo tx.
 *
 * @param {object} opts
 * @param {number} opts.solicitudId
 * @param {string} [opts.usuario]
 * @param {string} [opts.observacion]
 * @returns {Function} async (tx, { expediente_id, row }) => { ...metadata }
 */
export function buildRetornoInvalidasDomainMutator({ solicitudId, usuario = 'SISTEMA', observacion = '' } = {}) {
  return async function retornoInvalidasMutator(tx, { expediente_id, row }) {
    // 1. Guard agregado dentro de la transacción.
    const res = await evaluarResultadoAgregadoValidaciones(tx, { solicitudId });

    if (res.total_consideradas === 0) {
      const err = new Error('VALIDACIONES_SIN_COTIZACIONES');
      err.code = 'VALIDACIONES_SIN_COTIZACIONES';
      throw err;
    }
    if (res.aptas > 0) {
      const err = new Error('VALIDACIONES_CON_APTAS');
      err.code = 'VALIDACIONES_CON_APTAS';
      throw err;
    }
    if (res.pendientes > 0) {
      const err = new Error('VALIDACIONES_PENDIENTES');
      err.code = 'VALIDACIONES_PENDIENTES';
      throw err;
    }
    if (!res.todas_no_aptas) {
      const err = new Error('VALIDACIONES_NO_TODAS_INVALIDAS');
      err.code = 'VALIDACIONES_NO_TODAS_INVALIDAS';
      throw err;
    }

    // 1b. Fase 2A.4D — compatibilidad de la solicitud al retornar a Invitaciones.
    // Leer estado/contador de la solicitud con el MISMO tx. Si está CERRADA, bloquear
    // ANTES de cualquier escritura (no mover expediente, no payload, no evento/historial).
    const { rows: solRows } = await tx.query(
      'SELECT estado, contador_envios FROM solicitudes_cotizacion WHERE id = $1',
      [solicitudId],
    );
    const sol = solRows[0];
    if (!sol) {
      const err = new Error('SOLICITUD_NO_ENCONTRADA');
      err.code = 'SOLICITUD_NO_ENCONTRADA';
      throw err;
    }
    if (String(sol.estado || '').toUpperCase() === 'CERRADA') {
      const err = new Error('SOLICITUD_CERRADA_NO_REABRIBLE');
      err.code = 'SOLICITUD_CERRADA_NO_REABRIBLE';
      throw err;
    }
    const contadorConservado = Number(sol.contador_envios || 0);

    // 1c. Reiniciar la solicitud al estado que Invitaciones conoce ("PUBLICADA").
    // No incrementa contador_envios, no toca fecha_publicacion, cronograma,
    // nro_invitacion, invitacion_proveedores ni cotizaciones NO_APTO.
    const upd = await tx.query(
      `UPDATE solicitudes_cotizacion
       SET estado = 'PUBLICADA', updated_at = NOW()
       WHERE id = $1 AND estado <> 'CERRADA'
       RETURNING id, estado, contador_envios`,
      [solicitudId],
    );
    const solicitudEstado = upd.rows[0]?.estado || 'PUBLICADA';

    // 2. Payload legacy (preservar todos los campos).
    let payload = {};
    try { payload = JSON.parse(row?.payload || '{}'); } catch (_) { payload = {}; }

    if (!Array.isArray(payload.historial_validaciones)) payload.historial_validaciones = [];
    payload.historial_validaciones.push({
      tipo: 'todas_no_aptas',
      solicitud_id: solicitudId,
      total_evaluadas: res.total_evaluadas,
      no_aptas: res.no_aptas,
      usuario,
      observacion: observacion || '',
      fecha: new Date().toISOString(),
      destino: 'INVITACIONES',
    });

    if (!Array.isArray(payload.historial_invitaciones)) payload.historial_invitaciones = [];
    payload.historial_invitaciones.push({
      tipo: 'retorno_desde_validaciones',
      solicitud_id: solicitudId,
      motivo: 'Todas las cotizaciones fueron declaradas NO_APTO',
      usuario,
      fecha: new Date().toISOString(),
      requiere_reinvitacion: true,
    });

    // Snapshot legacy: solo caché compatible; nunca decide la transición ni sobrescribe BD.
    payload.workflowSnapshot = {
      ...(payload.workflowSnapshot || {}),
      etapaActual: 'INVITACIONES',
      subModuloActual: 'Invitaciones',
      fechaEstadoActual: new Date().toISOString(),
    };

    await tx.query(
      `UPDATE requerimientos SET payload = $2, updated_at = NOW() WHERE id = $1`,
      [Number(expediente_id), JSON.stringify(payload)],
    );

    return {
      solicitud_id: solicitudId,
      solicitud_estado: solicitudEstado,
      contador_envios_conservado: contadorConservado,
      solicitud_reabierta: true,
      total_consideradas: res.total_consideradas,
      total_evaluadas: res.total_evaluadas,
      aptas: res.aptas,
      no_aptas: res.no_aptas,
      pendientes: res.pendientes,
      todas_no_aptas: res.todas_no_aptas,
      retorno_invitaciones: true,
      reinvitacion_creada: false,
      correo_enviado: false,
    };
  };
}

export default {
  evaluarResultadoAgregadoValidaciones,
  buildRetornoInvalidasDomainMutator,
};
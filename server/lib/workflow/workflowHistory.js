/**
 * Workflow History — escritura append-only del historial.
 * Escribe:
 * 1. workflow_eventos (canónico, con idempotency_key UNIQUE).
 * 2. requerimientos.historial_movimientos (bitácora legible, append JSONB).
 *
 * La misma transacción del motor garantiza consistencia.
 */
export async function insertWorkflowEvento(client, {
  expediente_id,
  tipo_contratacion,
  evento_codigo,
  etapa_origen,
  etapa_destino,
  actor_id = null,
  actor_rol = 'SISTEMA',
  responsable_destino = null,
  metadata = {},
  idempotency_key,
}) {
  const q = `
    INSERT INTO workflow_eventos (
      expediente_id, tipo_contratacion, evento_codigo,
      etapa_origen, etapa_destino, actor_id, actor_rol,
      responsable_destino, metadata, idempotency_key
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id, expediente_id, evento_codigo, etapa_origen, etapa_destino, created_at
  `;
  const { rows } = await client.query(q, [
    expediente_id, tipo_contratacion, evento_codigo,
    etapa_origen || null, etapa_destino || null, actor_id || null, actor_rol,
    responsable_destino || null, JSON.stringify(metadata || {}), idempotency_key,
  ]);
  return rows[0];
}

/**
 * Agrega una entrada a historial_movimientos (JSONB array) sin duplicar.
 * Formato compatible con server/lib/movimientos.js (buildMovimientoEntry).
 */
export async function appendMovimiento(client, requid, entry) {
  const q = `
    UPDATE requerimientos
    SET historial_movimientos = COALESCE(historial_movimientos, '[]'::jsonb) || $2::jsonb,
        updated_at = NOW()
    WHERE id = $1
  `;
  await client.query(q, [requid, JSON.stringify([entry])]);
}

/**
 * Construye entrada de movimiento legible (estilo buildMovimientoEntry).
 */
export function buildMovimientoEntry({
  fecha,
  accion,
  etapa,
  usuario,
  responsable,
  observacion = '',
  subModuloOrigen = '',
  subModuloDestino = '',
} = {}) {
  return {
    fecha: fecha || new Date().toISOString(),
    accion: String(accion || 'DERIVADO').toUpperCase(),
    modulo: 'Contrataciones',
    subModulo: String(etapa || 'REGISTRO').toUpperCase(),
    etapa: String(etapa || 'REGISTRO').toUpperCase(),
    subModuloOrigen: subModuloOrigen || '',
    subModuloDestino: subModuloDestino || '',
    usuario: usuario || 'Sistema',
    responsable: responsable || usuario || 'Sistema',
    observacion: observacion || '',
  };
}

export default {
  insertWorkflowEvento,
  appendMovimiento,
  buildMovimientoEntry,
};
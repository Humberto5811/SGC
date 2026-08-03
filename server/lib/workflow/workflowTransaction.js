/**
 * Workflow Transaction — wrapper transaccional.
 * Abre transacción si no se recibió client; ejecuta callback; COMMIT o ROLLBACK.
 */
import { getClient } from '../../db.js';

/**
 * Ejecuta un callback dentro de una transacción.
 *
 * @param {Function} fn — async (client) => resultado
 * @param {object} [client] — cliente ya conectado (opcional)
 * @returns {Promise<*>} resultado de fn
 */
export async function withTransaction(fn, client = null) {
  const ownClient = client === null || client === undefined;
  const used = ownClient ? await getClient() : client;
  try {
    if (ownClient) await used.query('BEGIN');
    const result = await fn(used);
    if (ownClient) await used.query('COMMIT');
    return result;
  } catch (err) {
    if (ownClient) {
      try { await used.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    }
    throw err;
  } finally {
    if (ownClient) used.release();
  }
}

export default { withTransaction };
import { api } from './apiService.js';

/**
 * Busca una Ficha NET por código SIGAMEF (idcartcodigosiga).
 * @param {string} codigoSigamef
 * @returns {Promise<object|null>}
 */
export async function getByCodigoSigamef(codigoSigamef) {
  const codigo = String(codigoSigamef || '').trim();
  if (!codigo) return null;
  try {
    const row = await api.get(`/fichanet/por-codigo/${encodeURIComponent(codigo)}`);
    return row && row.idfichanet != null ? row : null;
  } catch (e) {
    if (/404|no encontr/i.test(e.message || '')) return null;
    throw e;
  }
}

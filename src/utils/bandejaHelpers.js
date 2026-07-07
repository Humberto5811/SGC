/**
 * Helper universal para resolver el valor de "Pedido SIGAMEF"
 * Prioriza el valor del módulo de mantenimiento (PB-xxx, PS-xxx)
 */

/**
 * Resuelve el valor correcto de "Pedido SIGAMEF" para cualquier bandeja
 * @param {Object} row - Fila de datos del backend
 * @returns {string} Valor del pedido SIGAMEF (PB-xxx, PS-xxx, o '—')
 */
export function resolvePedidoSigamef(row) {
  if (!row) return '—';

  if (row.pedido_sigamef && row.pedido_sigamef !== '—' && row.pedido_sigamef !== '') {
    return row.pedido_sigamef;
  }

  const pedidosSigamef = row.pedidos_sigamef ?? row.pedidosSigamef;
  if (pedidosSigamef && pedidosSigamef !== '—' && pedidosSigamef !== '') {
    return pedidosSigamef;
  }

  if (row.codigo_sigamef && row.codigo_sigamef !== '—' && row.codigo_sigamef !== '') {
    return row.codigo_sigamef;
  }

  return '—';
}

/**
 * Verifica si un valor tiene formato PB-xxx o PS-xxx
 * @param {string} value
 * @returns {boolean}
 */
export function isValidPedidoSigamef(value) {
  const first = String(value || '').split(',')[0].trim();
  return /^P[BS]-\d+$/i.test(first);
}

/**
 * Generación del código operativo Pedido SIGAMEF (PB-/PS-/PL-/P-).
 */

export function generatePedidoSigamef(tipo, nroPedido) {
  const nro = String(nroPedido ?? '').trim();
  if (!nro) return '';
  const t = String(tipo ?? '').trim().toUpperCase();
  if (t === 'B' || t.startsWith('B')) return `PB-${nro}`;
  if (t === 'S' || t.startsWith('S')) return `PS-${nro}`;
  if (t === 'L' || t.startsWith('L')) return `PL-${nro}`;
  return `P-${nro}`;
}

export function isValidPedidoSigamefCode(value) {
  const first = String(value || '').split(',')[0].trim();
  return /^P[BSL]?-\d+/i.test(first);
}

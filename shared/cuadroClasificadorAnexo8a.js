/**
 * RC8.17.8H6 D10-E3-C2 / C2.1 — Clasificador Anexo 8-A (solo lectura, sin mutar cuadro persistido).
 * Empareja ítems del cuadro con pedidos_sigamef.especifica vía requerimiento_pedidos.
 */

function pedidoLabel(p) {
  return String(p?.pedido_sigamef ?? p?.nro_pedido ?? '').trim();
}

function itemCodigo(item) {
  return String(item?.codigo_sigamef ?? item?.codigo ?? '').trim();
}

function normalizeDescText(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** Coincidencia exacta normalizada (sin includes parciales). */
function descExactMatch(pedDesc, itemDesc) {
  const pd = normalizeDescText(pedDesc);
  const id = normalizeDescText(itemDesc);
  if (!pd || !id) return false;
  return pd === id;
}

function pedMatchesExplicitConstraints(item, ped) {
  if (!ped) return false;
  const cod = itemCodigo(item);
  const pCod = String(ped.codigo_sigamef || '').trim();
  if (cod && pCod && cod !== pCod) return false;

  const pedStr = String(item.pedido_sigamef ?? '').trim();
  if (pedStr && !pedStr.includes(',')) {
    const lbl = pedidoLabel(ped);
    const nro = String(ped.nro_pedido || '').trim();
    if (lbl !== pedStr && nro !== pedStr) return false;
  }

  const explicitId = item.pedido_sigamef_id ?? item.pedido_id;
  if (explicitId != null && explicitId !== '' && Number(ped.id) !== Number(explicitId)) {
    return false;
  }
  return true;
}

/**
 * Emparejamiento estricto: sin fallback por índice; sin sustituir códigos/IDs contradictorios.
 * @returns {object|null} fila pedido normalizada o null si ambiguo / sin match verificable
 */
export function resolvePedidoSigamefForAnexo8A(item = {}, pedidos = []) {
  const list = Array.isArray(pedidos) ? pedidos.filter(Boolean) : [];
  if (!list.length) return null;

  const cod = itemCodigo(item);
  const pedStr = String(item.pedido_sigamef ?? '').trim();
  const explicitId = item.pedido_sigamef_id ?? item.pedido_id;

  const accept = (ped) => (ped && pedMatchesExplicitConstraints(item, ped) ? ped : null);

  if (explicitId != null && explicitId !== '') {
    const hit = list.filter((p) => Number(p.id) === Number(explicitId));
    if (hit.length !== 1) return null;
    return accept(hit[0]);
  }

  if (pedStr && !pedStr.includes(',')) {
    const byLabel = list.filter((p) => {
      const lbl = pedidoLabel(p);
      return lbl && (lbl === pedStr || String(p.nro_pedido || '').trim() === pedStr);
    });
    if (byLabel.length === 1) return accept(byLabel[0]);
    if (byLabel.length > 1) return null;
    return null;
  }

  if (pedStr && pedStr.includes(',')) {
    return null;
  }

  if (cod) {
    const byCod = list.filter((p) => String(p.codigo_sigamef || '').trim() === cod);
    if (byCod.length === 1) return accept(byCod[0]);
    return null;
  }

  const desc = String(item.descripcion || '').trim();
  if (desc) {
    const byDesc = list.filter((p) => descExactMatch(p.descripcion, desc));
    if (byDesc.length === 1) return accept(byDesc[0]);
    return null;
  }

  if (list.length === 1) {
    return accept(list[0]);
  }

  return null;
}

export function clasificadorFromPedido(ped) {
  const raw = ped?.especifica ?? ped?.clasificador ?? ped?.clasificador_gasto ?? '';
  const s = String(raw || '').trim();
  return s || '—';
}

function pedidosMapFromPayload(pedidosPorRequerimiento) {
  if (pedidosPorRequerimiento instanceof Map) return pedidosPorRequerimiento;
  if (!pedidosPorRequerimiento || typeof pedidosPorRequerimiento !== 'object') return new Map();
  const m = new Map();
  Object.entries(pedidosPorRequerimiento).forEach(([k, v]) => {
    m.set(Number(k), Array.isArray(v) ? v : []);
  });
  return m;
}

/**
 * Copia superficial de ítems con clasificador verificado desde pedido (no altera importes ni adjudicación).
 * Valores heredados en el ítem sin pedido demostrable → «—» en reporte.
 */
export function enrichItemsClasificadorAnexo8A(items = [], pedidosPorRequerimiento = {}) {
  const map = pedidosMapFromPayload(pedidosPorRequerimiento);
  return (Array.isArray(items) ? items : []).map((it) => {
    const reqId = it.requerimiento_id;
    const pedidos = map.get(Number(reqId)) || [];
    const ped = resolvePedidoSigamefForAnexo8A(it, pedidos);
    const clasificador = ped ? clasificadorFromPedido(ped) : '—';
    return { ...it, clasificador };
  });
}

/**
 * Resumen oficial por centro + clasificador (un valor por ítem adjudicado).
 */
export function buildResumenCentroClasificador(items = [], requerimientos = []) {
  const reqById = new Map();
  const reqByCode = new Map();
  (requerimientos || []).forEach((r) => {
    if (r?.id != null) reqById.set(Number(r.id), r);
    if (r?.codigo) reqByCode.set(String(r.codigo).toUpperCase(), r);
  });
  const buckets = new Map();
  (items || []).forEach((it) => {
    const req = (it.requerimiento_id != null && reqById.get(Number(it.requerimiento_id)))
      || (it.requerimiento_codigo && reqByCode.get(String(it.requerimiento_codigo).toUpperCase()))
      || null;
    const centro = String(
      it.centro || req?.centro || req?.centro_nombre || req?.centro_display || '—',
    ).trim() || '—';
    const clasificador = String(it.clasificador ?? '—').trim() || '—';
    const key = `${centro}|${clasificador}`;
    const vt = Number(it.valor_adjudicado_item);
    const prev = buckets.get(key) || { centro, clasificador, valor_num: 0 };
    prev.valor_num += Number.isFinite(vt) ? vt : 0;
    buckets.set(key, prev);
  });
  return [...buckets.values()];
}

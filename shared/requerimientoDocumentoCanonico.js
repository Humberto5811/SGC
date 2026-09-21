/**
 * RC8.17.8H6-C2 — Resolución del PDF canónico del requerimiento (sin binarios).
 * Alineado con taxonomía RC8.5-C1 (pedido / ficha / requerimiento).
 */

const TIPOS_EXPLICITOS = new Set([
  'DOCUMENTO_REQUERIMIENTO',
  'REQUERIMIENTO_ORIGINAL',
  'REQUERIMIENTO_PDF',
  'DOCUMENTO_REQUERIMIENTO_ORIGINAL',
]);

const CATEGORIAS_EXPLICITAS = new Set([
  'REQUERIMIENTO',
  'DOCUMENTO_REQUERIMIENTO',
]);

export const RESOLUCION_DOC_REQ = Object.freeze({
  FOUND: 'found',
  NONE: 'none',
  AMBIGUOUS: 'ambiguous',
});

function normToken(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function normName(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isPdfAdjunto(adj = {}) {
  const mime = String(adj.mime_type || adj.mime || '').toLowerCase();
  const name = normName(adj.nombre_archivo || adj.nombre);
  return mime.includes('pdf') || name.endsWith('.pdf');
}

/** Marcador explícito en fila de adjunto (sin depender del nombre). */
export function hasMarcadorExplicitoDocumentoRequerimiento(adj = {}) {
  if (adj.es_documento_requerimiento === true) return true;
  if (adj.documento_requerimiento === true) return true;
  if (adj.documento_canonico === true) {
    const rol = normToken(adj.rol_adjunto || adj.rol || adj.tipo_rol);
    if (!rol || rol.includes('REQUERIMIENTO')) return true;
  }
  const tipo = normToken(adj.tipo_documento || adj.tipo_adjunto);
  if (TIPOS_EXPLICITOS.has(tipo)) return true;
  const cat = normToken(adj.categoria || adj.tipo_doc);
  if (CATEGORIAS_EXPLICITAS.has(cat)) return true;
  return false;
}

/** Excluye pedidos SIGAMEF, fichas, planos y anexos técnicos del documento principal. */
export function isAdjuntoExcluidoComoDocumentoRequerimiento(adj = {}, ctx = {}) {
  if (hasMarcadorExplicitoDocumentoRequerimiento(adj)) return false;
  const blob = normName([
    adj.nombre_archivo,
    adj.nombre,
    adj.categoria,
    adj.tipo_documento,
    ctx.requerimientoCodigo,
  ].filter(Boolean).join(' '));

  if (/\bpedido\b|\bsigamef\b|\bpb-\d|\bp[bs]-\d/.test(blob)) return true;
  if (/\bficha\b|\bfichanet\b|\bficha_tecnica\b|\bf\.?\s*t\.?\b/.test(blob)) return true;
  if (/\bplano\b|\bblueprint\b|\.dwg\b|\.dxf\b/.test(blob)) return true;
  if (/\banexo\s*0?5\b|\bcotizaci[oó]n\b|\bpropuesta\s*(t[eé]cnica|econ[oó]mica)\b/.test(blob)) return true;
  if (/\bcuadro\s*comp|\bvalidaci[oó]n\b|\bsolicitud\s*(de\s*)?cotiz/.test(blob)) return true;
  return false;
}

export function extractPayloadReferenciasDocumento(payload) {
  const ids = new Set();
  let p = payload;
  if (typeof p === 'string') {
    try { p = JSON.parse(p || '{}'); } catch (_) { p = {}; }
  }
  if (!p || typeof p !== 'object') return ids;

  const directKeys = [
    'documento_requerimiento_adjunto_id',
    'adjunto_documento_requerimiento_id',
    'documento_adjunto_id',
    'adjunto_id_documento_requerimiento',
    'documento_requerimiento_id',
  ];
  for (const k of directKeys) {
    const v = Number(p[k]);
    if (Number.isInteger(v) && v > 0) ids.add(v);
  }
  const nested = p.documento_requerimiento || p.documentoRequerimiento;
  if (nested && typeof nested === 'object') {
    const v = Number(nested.adjunto_id ?? nested.adjuntoId ?? nested.id);
    if (Number.isInteger(v) && v > 0) ids.add(v);
  }
  return ids;
}

function scoreHeuristico(adj, ctx) {
  if (!isPdfAdjunto(adj)) return null;
  if (isAdjuntoExcluidoComoDocumentoRequerimiento(adj, ctx)) return null;

  let score = 0;
  const name = normName(adj.nombre_archivo || adj.nombre);
  const codigo = normName(ctx.requerimientoCodigo || '').replace(/\s+/g, '');

  if (codigo && name.includes(codigo.replace(/-/g, ''))) score += 80;
  if (codigo && name.includes(codigo)) score += 40;
  if (/^requerimiento\b|\brequerimiento\s*n[°o]?\b|\breq[-\s]?\d/.test(name)) score += 50;
  if (/\brequerimiento\b/.test(name) && !/\bpedido\b/.test(name)) score += 20;

  if (score <= 0) return null;
  return score;
}

/**
 * @param {Array<object>} adjuntos — metadatos (id, nombre_archivo, mime_type, created_at, …)
 * @param {{ requerimientoCodigo?: string, payloadRefs?: Set<number>|number[] }} ctx
 */
export function resolveDocumentoRequerimientoCanonicoFromList(adjuntos = [], ctx = {}) {
  const list = Array.isArray(adjuntos) ? adjuntos : [];
  const payloadRefs = ctx.payloadRefs instanceof Set
    ? ctx.payloadRefs
    : new Set(Array.isArray(ctx.payloadRefs) ? ctx.payloadRefs : []);

  const explicit = list.filter((a) => hasMarcadorExplicitoDocumentoRequerimiento(a) && isPdfAdjunto(a));
  if (explicit.length === 1) {
    return {
      status: RESOLUCION_DOC_REQ.FOUND,
      adjunto: explicit[0],
      razon: 'marcador_explicito',
    };
  }
  if (explicit.length > 1) {
    return {
      status: RESOLUCION_DOC_REQ.AMBIGUOUS,
      adjunto: null,
      candidatos: explicit,
      razon: 'multiples_marcadores_explicitos',
    };
  }

  if (payloadRefs.size) {
    const byRef = list.filter((a) => payloadRefs.has(Number(a.id)) && isPdfAdjunto(a));
    if (byRef.length === 1) {
      return {
        status: RESOLUCION_DOC_REQ.FOUND,
        adjunto: byRef[0],
        razon: 'referencia_payload',
      };
    }
    if (byRef.length > 1) {
      return {
        status: RESOLUCION_DOC_REQ.AMBIGUOUS,
        adjunto: null,
        candidatos: byRef,
        razon: 'multiples_referencias_payload',
      };
    }
  }

  const scored = [];
  for (const adj of list) {
    const s = scoreHeuristico(adj, ctx);
    if (s != null) scored.push({ adj, score: s });
  }
  if (!scored.length) {
    return { status: RESOLUCION_DOC_REQ.NONE, adjunto: null, razon: 'sin_candidato' };
  }

  scored.sort((a, b) => b.score - a.score || Number(a.adj.id) - Number(b.adj.id));
  const topScore = scored[0].score;
  const top = scored.filter((x) => x.score === topScore);
  if (top.length > 1) {
    return {
      status: RESOLUCION_DOC_REQ.AMBIGUOUS,
      adjunto: null,
      candidatos: top.map((x) => x.adj),
      razon: 'empate_heuristica',
    };
  }

  return {
    status: RESOLUCION_DOC_REQ.FOUND,
    adjunto: top[0].adj,
    razon: 'heuristica_nombre',
  };
}

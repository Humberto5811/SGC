/**
 * RC8.4B — Wrapper server-side del resolvedor central.
 *
 * Single-pass: resuelve estado UNA vez por expediente (sin doble ejecución).
 * True batch: carga filas + evidencias + asignaciones en queries masivas.
 */
import { query } from '../db.js';
import {
  resolveEstadoResponsableVigente,
  TIPO_RESPONSABLE,
  etapaDesdeEstadoCodigo,
} from '../../shared/resolvedorEstadoResponsable.js';
import {
  loadEstadoExpedienteEvidenceByIds,
  applyEstadoEvidenceToRow,
} from './estadoExpedienteEvidence.js';
import { getUsuarioMap, resolveUsuarioNombreSync } from './usuarioDisplay.js';
import { isRolGenerico } from '../../shared/identificadoresUsuarios.js';

// ==========================================================================
// ASIGNACIÓN EXPLÍCITA — true batch (una query por dominio, no por ID)
// ==========================================================================

async function loadAsignacionesBatch(ids, rows, estados) {
  const map = new Map();
  ids.forEach((id) => map.set(id, null));

  // ── Invitaciones / Recepción Cotizaciones (solicitudes_cotizacion) ──
  try {
    const { rows: inv } = await query(
      `SELECT sr.requerimiento_id, sc.created_by, sc.responsable
       FROM solicitud_requerimientos sr
       JOIN solicitudes_cotizacion sc ON sc.id = sr.solicitud_id
       WHERE sr.requerimiento_id = ANY($1::int[])
         AND sc.estado <> 'ANULADA'
       ORDER BY sc.id DESC`,
      [ids],
    );
    const byReq = new Map();
    inv.forEach((r) => {
      const rid = Number(r.requerimiento_id);
      if (!byReq.has(rid)) byReq.set(rid, r);
    });
    for (const [rid, r] of byReq) {
      const u = String(r.created_by || '').trim();
      if (u && !isRolGenerico(u)) {
        const nombre = await resolveNombre(u);
        map.set(rid, {
          usuarioId: null,
          username: u,
          nombre: nombre || u,
          unidad: 'Invitaciones',
        });
      } else {
        const resp = String(r.responsable || '').trim();
        if (resp && !isRolGenerico(resp)) {
          map.set(rid, {
            usuarioId: null,
            username: resp,
            nombre: resp,
            unidad: 'Invitaciones',
          });
        }
      }
    }
  } catch (_) { /* ok */ }

  // ── Cuadro Comparativo ──
  try {
    const { rows: cc } = await query(
      `SELECT sr.requerimiento_id, cc.creado_por, cc.actualizado_por
       FROM solicitud_requerimientos sr
       JOIN cuadros_comparativos cc ON cc.solicitud_id = sr.solicitud_id
       WHERE sr.requerimiento_id = ANY($1::int[])
         AND COALESCE(cc.estado, '') <> 'ANULADO'
       ORDER BY cc.id DESC`,
      [ids],
    );
    const byReq = new Map();
    cc.forEach((r) => {
      const rid = Number(r.requerimiento_id);
      if (!byReq.has(rid)) byReq.set(rid, r);
    });
    for (const [rid, r] of byReq) {
      if (map.has(rid) && map.get(rid) !== null) continue;
      const u = String(r.actualizado_por || r.creado_por || '').trim();
      if (u && !isRolGenerico(u)) {
        const nombre = await resolveNombre(u);
        map.set(rid, {
          usuarioId: null,
          username: u,
          nombre: nombre || u,
          unidad: 'Cuadro Comparativo',
        });
      }
    }
  } catch (_) { /* ok */ }

  // ── Recepción Bienes ──
  try {
    const { rows: rb } = await query(
      `SELECT requerimiento_id, usuario_asignado
       FROM recepcion_bienes_expedientes
       WHERE requerimiento_id = ANY($1::int[])
       ORDER BY updated_at DESC`,
      [ids],
    );
    const byReq = new Map();
    rb.forEach((r) => {
      const rid = Number(r.requerimiento_id);
      if (!byReq.has(rid)) byReq.set(rid, r);
    });
    for (const [rid, r] of byReq) {
      if (map.has(rid) && map.get(rid) !== null) continue;
      const u = String(r.usuario_asignado || '').trim();
      if (u && !isRolGenerico(u)) {
        const nombre = await resolveNombre(u);
        map.set(rid, { usuarioId: null, username: u, nombre: nombre || u, unidad: 'Almacén' });
      }
    }
  } catch (_) { /* ok */ }

  // ── Órdenes ──
  try {
    const { rows: oc } = await query(
      `SELECT requerimiento_id, creado_por, actualizado_por
       FROM ordenes_contratacion
       WHERE requerimiento_id = ANY($1::int[])
         AND COALESCE(estado, '') <> 'ORDEN_ANULADA'
         AND COALESCE(estado, '') <> 'ANULADA'
       ORDER BY id DESC`,
      [ids],
    );
    const byReq = new Map();
    oc.forEach((r) => {
      const rid = Number(r.requerimiento_id);
      if (!byReq.has(rid)) byReq.set(rid, r);
    });
    for (const [rid, r] of byReq) {
      if (map.has(rid) && map.get(rid) !== null) continue;
      const u = String(r.actualizado_por || r.creado_por || '').trim();
      if (u && !isRolGenerico(u)) {
        const nombre = await resolveNombre(u);
        map.set(rid, {
          usuarioId: null,
          username: u,
          nombre: nombre || u,
          unidad: 'Registro de Órdenes',
        });
      }
    }
  } catch (_) { /* ok */ }

  // ── Actos Preparatorios (payload.historial_actos) ──
  for (const rid of ids) {
    if (map.has(rid) && map.get(rid) !== null) continue;
    const row = rows.get(rid);
    if (!row) continue;
    const estado = estados.get(rid);
    const etapa = estado?.etapaCodigo || '';
    if (etapa !== 'COORDINACION_CM' && etapa !== 'ACTOS_PREPARATORIOS') continue;
    try {
      const p = safeJson(row.payload);
      const hist = Array.isArray(p.historial_actos) ? p.historial_actos : [];
      for (let i = hist.length - 1; i >= 0; i--) {
        const h = hist[i];
        if (h.tipo === 'asignacion' && h.analista && !isRolGenerico(h.analista)) {
          const nombre = await resolveNombre(h.analista);
          map.set(rid, {
            usuarioId: null,
            username: h.analista,
            nombre: nombre || h.analista,
            unidad: 'Coordinación CM',
          });
          break;
        }
      }
    } catch (_) { /* ok */ }
  }

  return map;
}

// ==========================================================================
// API PÚBLICA
// ==========================================================================

/**
 * Resuelve UN expediente (usa batch internamente si se llama muchas veces).
 */
export async function resolveEstadoResponsableParaExpediente(requerimientoId, row = null) {
  const map = await resolveEstadoResponsableBatch([requerimientoId], row ? [row] : null);
  return map.get(Number(requerimientoId)) || resolveEstadoResponsableVigente({});
}

/**
 * True batch: resuelve N expedientes con queries masivas.
 * Single-pass: estado se resuelve UNA vez por expediente.
 */
export async function resolveEstadoResponsableBatch(requerimientoIds = [], preloadedRows = null) {
  const ids = [...new Set(
    (requerimientoIds || []).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0),
  )];
  const resultados = new Map();
  if (!ids.length) return resultados;

  // ── Cargar filas (un solo query) ──
  let rows;
  if (preloadedRows && Array.isArray(preloadedRows) && preloadedRows.length) {
    rows = preloadedRows;
  } else {
    const { rows: r } = await query(
      `SELECT * FROM requerimientos WHERE id = ANY($1::int[])`,
      [ids],
    );
    rows = r;
  }
  const rowMap = new Map(rows.map((r) => [Number(r.id), r]));

  // ── Cargar evidencias CCP/Orden/Recepción (un batch) ──
  const evidenceMap = await loadEstadoExpedienteEvidenceByIds(ids);

  // ── Estado + etapa (single pass) ──
  const estados = new Map();
  for (const id of ids) {
    const row = rowMap.get(id);
    if (!row) {
      resultados.set(id, resolveEstadoResponsableVigente({}));
      continue;
    }
    const evidence = evidenceMap.get(id) || {};
    const enriched = applyEstadoEvidenceToRow(row, evidence);
    const vigente = resolveEstadoResponsableVigente(enriched, {});
    estados.set(id, vigente);
  }

  // ── Cargar asignaciones explícitas en batch ──
  const asignaciones = await loadAsignacionesBatch(ids, rowMap, estados);

  // ── Reconstruir con asignaciones (sin volver a resolver estado) ──
  for (const id of ids) {
    const row = rowMap.get(id);
    if (!row) continue;
    const evidence = evidenceMap.get(id) || {};
    const enriched = applyEstadoEvidenceToRow(row, evidence);
    const asig = asignaciones.get(id);
    if (asig) {
      resultados.set(id, resolveEstadoResponsableVigente(enriched, {
        asignaciones: { _result: asig },
      }));
    } else {
      resultados.set(id, estados.get(id));
    }
  }

  return resultados;
}

// ==========================================================================
// HELPERS
// ==========================================================================

function safeJson(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); } catch (_) { return {}; }
}

let _usuarioMapPromise = null;
async function resolveNombre(username) {
  try {
    if (!_usuarioMapPromise) _usuarioMapPromise = getUsuarioMap();
    const map = await _usuarioMapPromise;
    const n = resolveUsuarioNombreSync(username, map);
    return (n && n !== username && n !== '—') ? n : null;
  } catch (_) { return null; }
}

// Re-export
export {
  resolveEstadoResponsableVigente,
  TIPO_RESPONSABLE,
  etapaDesdeEstadoCodigo,
} from '../../shared/resolvedorEstadoResponsable.js';

export default {
  resolveEstadoResponsableParaExpediente,
  resolveEstadoResponsableBatch,
  resolveEstadoResponsableVigente,
  TIPO_RESPONSABLE,
};
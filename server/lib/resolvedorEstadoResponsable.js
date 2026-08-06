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

/** Unidad/submódulo según etapa vigente del expediente. */
function unidadPorEtapa(estadoVigente) {
  const etapa = String(estadoVigente?.etapaCodigo || '').toUpperCase();
  if (etapa === 'RECEPCION_COTIZACIONES') return 'Recepción de Cotizaciones';
  if (etapa === 'VALIDACIONES' || etapa === 'VALIDACION_USUARIO') return 'Validaciones';
  if (etapa === 'CUADRO_COMPARATIVO') return 'Cuadro Comparativo';
  if (etapa === 'CCP') return 'CCP';
  if (etapa === 'REGISTRO_ORDEN' || etapa === 'ORDEN') return 'Registro de Órdenes';
  if (etapa === 'COORDINACION_CM' || etapa === 'ACTOS_PREPARATORIOS') return 'Coordinación CM';
  return 'Invitaciones';
}

function displayFromUserFields({ usuarioId, username, nombre }) {
  const uid = usuarioId != null && Number.isFinite(Number(usuarioId)) ? Number(usuarioId) : null;
  const uname = String(username || '').trim();
  const nom = String(nombre || '').trim();
  const unameOk = uname && !/^\d+$/.test(uname);
  const nomOk = nom && !/^\d+$/.test(nom);
  return {
    usuarioId: uid,
    username: unameOk ? uname : '',
    nombre: nomOk ? nom : (unameOk ? uname : (uid ? `Usuario #${uid}` : '')),
  };
}

async function loadAsignacionesBatch(ids, rows, estados) {
  const map = new Map();
  ids.forEach((id) => map.set(id, null));

  // ── RC8.6A / RC8.6C.1 — fuente única persistida + JOIN usuarios (sin N+1) ──
  try {
    const { loadEstadoAsignacionPersistidaBatch } = await import('./expedienteEstadoPersistido.js');
    const persistidos = await loadEstadoAsignacionPersistidaBatch(ids);
    for (const [rid, pack] of persistidos) {
      const a = pack?.asignacion;
      const e = pack?.estado;
      if (a && a.tipo_responsable === 'PERSONA' && a.usuario_id) {
        const disp = displayFromUserFields({
          usuarioId: a.usuario_id,
          username: a.usuario_username,
          nombre: a.usuario_nombre,
        });
        map.set(rid, {
          usuarioId: disp.usuarioId,
          username: disp.username,
          nombre: disp.nombre,
          unidad: a.unidad_codigo || e?.responsable_unidad || unidadPorEtapa(estados.get(rid)),
          fuente: e?.responsable_fuente || a.origen_asignacion || 'asignacion_explicita_db',
          tipoResponsable: 'PERSONA',
        });
        continue;
      }
      if (e?.responsable_tipo === 'PERSONA' && e.responsable_usuario_id) {
        const disp = displayFromUserFields({
          usuarioId: e.responsable_usuario_id,
          username: e.responsable_username,
          nombre: e.responsable_nombre,
        });
        map.set(rid, {
          usuarioId: disp.usuarioId,
          username: disp.username,
          nombre: disp.nombre,
          unidad: e.responsable_unidad || unidadPorEtapa(estados.get(rid)),
          fuente: e.responsable_fuente || 'asignacion_explicita_db',
          tipoResponsable: 'PERSONA',
        });
        continue;
      }
      if (a || e) {
        map.set(rid, {
          usuarioId: null,
          username: '',
          nombre: '',
          unidad: a?.unidad_codigo || e?.responsable_unidad || unidadPorEtapa(estados.get(rid)),
          fuente: e?.responsable_fuente || a?.origen_asignacion || 'unidad_destino_etapa',
          tipoResponsable: a?.tipo_responsable || e?.responsable_tipo || 'UNIDAD',
        });
      }
    }
  } catch (_) { /* migración pendiente */ }

  // ── Legacy heurísticas (created_by / sc.responsable) DESHABILITADAS en RC8.6A.
  // Solo cuenta asignación persistida. created_by queda en auditoría, no como vigente.
  // Si el expediente ya tiene fila en expediente_estado_vigente / asignación activa,
  // no se completa con fuentes legacy (cuadro.creado_por, etc.).

  // ── Cuadro Comparativo (solo si aún no hay fuente persistida) ──
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
      if (map.get(rid) != null) continue;
      // RC8.6A: no inferir persona desde creado_por/actualizado_por.
      void r;
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
      // usuario_asignado de recepción bienes SÍ es asignación de dominio (explícita).
      const u = String(r.usuario_asignado || '').trim();
      if (u && !isRolGenerico(u)) {
        const nombre = await resolveNombre(u);
        map.set(rid, {
          usuarioId: null,
          username: u,
          nombre: nombre || u,
          unidad: 'Almacén',
          fuente: 'asignacion_explicita_db',
        });
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
    for (const [rid] of byReq) {
      if (map.has(rid) && map.get(rid) !== null) continue;
      // RC8.6A: no inferir desde creado_por/actualizado_por de órdenes.
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
        // Solo asignaciones explícitas tipadas (no "último editor").
        if (h.tipo === 'asignacion' && h.analista && !isRolGenerico(h.analista)) {
          const nombre = await resolveNombre(h.analista);
          map.set(rid, {
            usuarioId: null,
            username: h.analista,
            nombre: nombre || h.analista,
            unidad: 'Coordinación CM',
            fuente: 'asignacion_explicita_db',
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
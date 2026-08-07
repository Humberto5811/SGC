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
  const etapa = String(estadoVigente?.etapaCodigo || estadoVigente?.etapa_codigo || '').toUpperCase();
  if (etapa === 'RECEPCION_COTIZACIONES') return 'Recepción de Cotizaciones';
  if (etapa === 'VALIDACIONES' || etapa === 'VALIDACION_USUARIO') return 'Validaciones';
  if (etapa === 'CUADRO_COMPARATIVO') return 'Cuadro Comparativo';
  if (etapa === 'CCP') return 'CCP';
  if (etapa === 'REGISTRO_ORDEN' || etapa === 'REGISTRO_ORDENES' || etapa === 'ORDEN') {
    return 'Registro de Órdenes';
  }
  if (etapa === 'RECEPCION_BIENES' || etapa === 'EN_EJECUCION' || etapa === 'EJECUCION') {
    return 'Almacén';
  }
  if (etapa === 'COORDINACION_CM' || etapa === 'ACTOS_PREPARATORIOS') return 'Coordinación CM';
  if (etapa === 'INVITACIONES') return 'Invitaciones';
  if (etapa === 'PROGRAMACION') return 'Programación';
  if (etapa === 'DEC') return 'DEC';
  if (etapa === 'EVALUACION') return 'Evaluación';
  if (etapa === 'REGISTRO') return 'Registro';
  // Nunca inventar "Invitaciones" para etapas desconocidas o vacías.
  return null;
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
        const tipo = String(a?.tipo_responsable || e?.responsable_tipo || 'UNIDAD').toUpperCase();
        // Unidad: preferir persistida; si falta, mapear por ETAPA PERSISTIDA (no evidencia overlay).
        const etapaPersistida = {
          etapaCodigo: e?.etapa_codigo || a?.etapa_codigo || '',
        };
        let unidad = a?.unidad_codigo || e?.responsable_unidad || null;
        if (!unidad && tipo !== 'PENDIENTE') {
          unidad = unidadPorEtapa(etapaPersistida) || unidadPorEtapa(estados.get(rid));
        }
        // PENDIENTE sin unidad: no inventar "Invitaciones" ni otra etapa ajena.
        if (tipo === 'PENDIENTE' && !unidad) {
          map.set(rid, {
            usuarioId: null,
            username: '',
            nombre: '',
            unidad: null,
            fuente: e?.responsable_fuente || a?.origen_asignacion || 'pendiente_asignacion',
            tipoResponsable: 'PENDIENTE',
          });
          continue;
        }
        map.set(rid, {
          usuarioId: null,
          username: '',
          nombre: '',
          unidad,
          fuente: e?.responsable_fuente || a?.origen_asignacion || 'unidad_destino_etapa',
          tipoResponsable: tipo === 'PENDIENTE' ? 'PENDIENTE' : (tipo || 'UNIDAD'),
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
 * RC8.8.1 — SOLO getEstadoResponsableCanonico. Sin evidencia en lectura.
 * Si falta vigente → canonicalMissing (no reconstruir).
 */
export async function resolveEstadoResponsableBatch(requerimientoIds = [], preloadedRows = null) {
  const ids = [...new Set(
    (requerimientoIds || []).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0),
  )];
  const resultados = new Map();
  if (!ids.length) return resultados;

  void preloadedRows; // ya no se usa para reinferir presentación
  const { getEstadoResponsableCanonico } = await import('./estadoResponsableCanonico.js');
  const canon = await getEstadoResponsableCanonico({ requerimientoIds: ids });
  for (const id of ids) {
    resultados.set(id, canon.get(id));
  }
  return resultados;
}

/**
 * @deprecated RC8.8 — use buildContratoCanonico from estadoResponsableCanonico.js
 */
function buildContratoDesdePersistido(estadoRow, asignacion = null) {
  const e = estadoRow || {};
  const a = asignacion || null;
  let estadoCodigo = String(e.estado_codigo || '').trim();
  if (estadoCodigo === 'REGISTRO_ORDEN' || estadoCodigo === 'ORDEN') {
    estadoCodigo = 'REGISTRO_ORDENES';
  }
  const estadoLabel = String(e.estado_label || '').trim()
    || (estadoCodigo === 'REGISTRO_ORDENES' ? 'Registro de órdenes' : estadoCodigo);
  let etapaCodigo = String(e.etapa_codigo || '').trim().toUpperCase();
  if (etapaCodigo === 'REGISTRO_ORDENES' || etapaCodigo === 'ORDEN') etapaCodigo = 'REGISTRO_ORDEN';
  const etapaLabel = String(e.etapa_label || '').trim()
    || (etapaCodigo === 'REGISTRO_ORDEN' ? 'Registro de Órdenes' : etapaCodigo);
  let responsableTipo = String(
    a?.tipo_responsable || e.responsable_tipo || TIPO_RESPONSABLE.PENDIENTE,
  ).toUpperCase();
  let responsableUsuarioId = a?.usuario_id ?? e.responsable_usuario_id ?? null;
  let responsableUsername = String(a?.usuario_username || e.responsable_username || '').trim();
  let responsableNombre = String(a?.usuario_nombre || e.responsable_nombre || '').trim();
  let responsableUnidad = String(a?.unidad_codigo || e.responsable_unidad || '').trim();
  let responsableFuente = String(
    e.responsable_fuente || a?.origen_asignacion || 'persistido',
  ).trim();
  if (responsableTipo === 'PERSONA' && !responsableUsuarioId && !responsableUsername && !responsableNombre) {
    responsableTipo = responsableUnidad ? TIPO_RESPONSABLE.UNIDAD : TIPO_RESPONSABLE.PENDIENTE;
  }
  if (responsableTipo === 'PENDIENTE') {
    responsableUsuarioId = null;
    responsableUsername = '';
    responsableNombre = '';
  }
  if (responsableTipo === 'UNIDAD') {
    responsableUsuarioId = null;
    responsableUsername = '';
    responsableNombre = '';
  }
  return {
    estadoCodigo,
    estadoLabel,
    etapaCodigo,
    etapaLabel,
    responsableTipo,
    responsableUsuarioId,
    responsableUsername,
    responsableNombre,
    responsableUnidad: responsableTipo === 'PENDIENTE' ? '' : responsableUnidad,
    responsableFuente,
    actualizadoAt: e.actualizado_at || null,
    canonicalMissing: false,
  };
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
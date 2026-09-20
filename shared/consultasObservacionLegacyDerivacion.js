/**
 * RC8.17.8H6-B5.1 — Derivación operativa de observaciones Consultas pre-B5.
 * Enriquecimiento en lectura desde workflow_eventos CONSULTAS_OBSERVADA (sin UPDATE payload).
 */
import { getModuloEmisor, getModuloReceptor } from './observacionesMotor.js';

export const VIA_OBSERVAR_CONSULTAS = 'observarConsultasObservaciones';

export function isPreB5ConsultasObservacionPersona(o) {
  if (!o || typeof o !== 'object') return false;
  const uid = o.usuario_destino_id ?? o.usuarioDestinoId;
  if (uid == null || !Number.isFinite(Number(uid))) return false;
  const deriv = String(o.destino_derivacion_submodulo || o.destinoDerivacionSubmodulo || '').trim();
  if (deriv) return false;
  if (getModuloEmisor(o) !== 'CONSULTAS_OBSERVACIONES') return false;
  if (getModuloReceptor(o) !== 'CONSULTAS_OBSERVACIONES') return false;
  return true;
}

function parseEventMetadata(ev) {
  const raw = ev?.metadata;
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

/** Evento workflow con metadata determinista de derivación (emisión Consultas). */
export function extractConsultasObservadaDerivacionEvent(ev) {
  const codigo = String(ev?.evento_codigo || ev?.eventoCodigo || '').trim();
  if (codigo !== 'CONSULTAS_OBSERVADA') return null;
  const meta = parseEventMetadata(ev);
  if (String(meta.via || '').trim() !== VIA_OBSERVAR_CONSULTAS) return null;

  const destSub = String(meta.destino_submodulo || '').trim();
  if (!destSub) return null;

  const uidRaw = meta.usuario_destino_id ?? meta.usuarioDestinoId;
  const uid = uidRaw != null && Number.isFinite(Number(uidRaw)) ? Number(uidRaw) : null;
  if (uid == null) return null;

  const etapaDest = String(
    meta.etapa_destino || meta.destino_etapa || '',
  ).trim().toUpperCase();

  return {
    destino_derivacion_submodulo: destSub,
    destino_derivacion_etapa: etapaDest,
    usuario_destino_id: uid,
    created_at: ev.created_at || ev.createdAt || null,
    eventId: ev.id ?? null,
  };
}

export function listConsultasObservadaDerivacionEvents(workflowEvents = []) {
  return (workflowEvents || [])
    .map((ev) => extractConsultasObservadaDerivacionEvent(ev))
    .filter(Boolean);
}

/**
 * Resuelve derivación para una observación legacy; null si no hay match único y determinista.
 */
export function resolveLegacyDerivacionForObs(obs, derivEvents = []) {
  if (!isPreB5ConsultasObservacionPersona(obs)) return null;
  const uid = Number(obs.usuario_destino_id ?? obs.usuarioDestinoId);
  const candidates = (derivEvents || []).filter((e) => Number(e.usuario_destino_id) === uid);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const obsTime = Date.parse(obs.fecha || obs.created_at || '') || 0;
  if (!obsTime) return null;

  let best = null;
  let bestDiff = Infinity;
  let ties = 0;
  for (const c of candidates) {
    const t = Date.parse(c.created_at || '') || 0;
    if (!t) continue;
    const diff = Math.abs(t - obsTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
      ties = 1;
    } else if (diff === bestDiff) {
      ties += 1;
    }
  }
  if (!best || ties > 1) return null;
  return best;
}

/** Devuelve copia de observaciones con derivación operativa enriquecida (solo lectura). */
export function applyConsultasLegacyDerivacionEnrichment(observaciones, workflowEvents = []) {
  const derivEvents = listConsultasObservadaDerivacionEvents(workflowEvents);
  const list = Array.isArray(observaciones) ? observaciones : [];
  return list.map((o) => {
    const resolved = resolveLegacyDerivacionForObs(o, derivEvents);
    if (!resolved) return o;
    return {
      ...o,
      destino_derivacion_submodulo: resolved.destino_derivacion_submodulo,
      destino_derivacion_etapa: resolved.destino_derivacion_etapa || o.destino_derivacion_etapa || '',
    };
  });
}

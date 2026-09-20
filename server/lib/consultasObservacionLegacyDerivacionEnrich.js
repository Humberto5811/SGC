/**
 * RC8.17.8H6-B5.1 — Enriquecer payload.observaciones en lectura (API) desde workflow_eventos.
 */
import { query } from '../db.js';
import { applyConsultasLegacyDerivacionEnrichment } from '../../shared/consultasObservacionLegacyDerivacion.js';

function parsePayload(payload) {
  if (payload == null) return {};
  if (typeof payload === 'object') return { ...payload };
  try {
    return JSON.parse(String(payload || '{}'));
  } catch {
    return {};
  }
}

export async function fetchConsultasObservadaEventsByExpedienteIds(expedienteIds = []) {
  const ids = [...new Set(expedienteIds.map((id) => Number(id)).filter((n) => Number.isFinite(n)))];
  const map = new Map();
  if (!ids.length) return map;

  const { rows } = await query(
    `SELECT id, expediente_id, evento_codigo, metadata, created_at
     FROM workflow_eventos
     WHERE expediente_id = ANY($1::int[])
       AND evento_codigo = 'CONSULTAS_OBSERVADA'
     ORDER BY id ASC`,
    [ids],
  );

  for (const r of rows) {
    const eid = r.expediente_id;
    if (!map.has(eid)) map.set(eid, []);
    map.get(eid).push(r);
  }
  return map;
}

export function enrichPayloadConsultasLegacyDerivacion(payload, workflowEvents = []) {
  const p = parsePayload(payload);
  if (!Array.isArray(p.observaciones) || !p.observaciones.length) return p;
  p.observaciones = applyConsultasLegacyDerivacionEnrichment(p.observaciones, workflowEvents);
  return p;
}

export function enrichRowPayloadConsultasLegacyDerivacion(row, workflowEvents = []) {
  if (!row) return row;
  row.payload = enrichPayloadConsultasLegacyDerivacion(row.payload, workflowEvents);
  return row;
}

export async function enrichRowsPayloadConsultasLegacyDerivacion(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;
  const eventMap = await fetchConsultasObservadaEventsByExpedienteIds(list.map((r) => r.id));
  for (const row of list) {
    enrichRowPayloadConsultasLegacyDerivacion(row, eventMap.get(row.id) || []);
  }
  return list;
}

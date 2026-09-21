/** RC8.17.8H6-B6 — Reglas portal Mis Consultas (testeable FE/BE). */

export function consultaRespuestaAnalistaVisible(consulta) {
  if (!consulta) return false;
  const estado = String(consulta.estado || '').toUpperCase();
  const texto = String(consulta.respuesta ?? '').trim();
  return estado === 'RESPONDIDA' && texto.length > 0;
}

export function consultaPreviewRespuesta(consulta, maxLen = 80) {
  if (!consultaRespuestaAnalistaVisible(consulta)) return '';
  const t = String(consulta.respuesta).trim();
  return t.length <= maxLen ? t : `${t.slice(0, maxLen)}…`;
}

export function puedeVolverAConsultar(consulta) {
  return consultaRespuestaAnalistaVisible(consulta);
}

/** Mensaje cuando la SC no está en options de listMisInvitaciones. */
export const MSG_SOLICITUD_NO_DISPONIBLE_CONSULTA =
  'Esta solicitud ya no está disponible para registrar nuevas consultas.';

/** Preselección reconsulta: solo si value existe en el select canónico. */
export function solicitudIdEnOpcionesFormulario(solicitudId, optionValues) {
  if (solicitudId == null || solicitudId === '') return true;
  const v = String(solicitudId);
  return (optionValues || []).some((ov) => String(ov) === v);
}

export function parseConsultaAdjuntos(raw) {
  if (raw == null || raw === '') return [];
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch (_) { return []; }
  }
  if (!Array.isArray(v)) return [];
  return v
    .filter((a) => a && typeof a === 'object')
    .map((a, i) => ({
      label: String(a.nombre || a.name || a.filename || a.label || `Adjunto ${i + 1}`).trim(),
    }))
    .filter((a) => a.label);
}

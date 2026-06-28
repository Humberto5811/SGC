// Normalización del historial de movimientos (historialMovimientos)
import { normalizeLegacyActosLabel } from '../utils/observacionDestino.js';

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function normalizeMovimientos(raw) {
  if (!raw?.length) return [];
  return raw.map((m, idx) => ({
    id: m.id || idx + 1,
    fecha: m.fecha,
    accion: String(m.accion || '').toUpperCase(),
    modulo: m.modulo || 'SGC',
    subModulo: normalizeLegacyActosLabel(m.subModulo || m.sub_modulo || '—'),
    subModuloOrigen: normalizeLegacyActosLabel(m.subModuloOrigen || m.sub_modulo_origen || ''),
    subModuloDestino: normalizeLegacyActosLabel(m.subModuloDestino || m.sub_modulo_destino || ''),
    etapa: m.etapa || '',
    usuario: m.usuario || '—',
    responsable: m.responsable || m.usuario || '—',
    observacion: normalizeLegacyActosLabel(m.observacion || ''),
    fechaTexto: fmtDateTime(m.fecha),
  }));
}

export function movimientosToTimelineEvents(movimientos) {
  return normalizeMovimientos(movimientos).map((m, idx, arr) => ({
    ...m,
    esActual: idx === arr.length - 1,
    fechaIngreso: m.fecha,
    estadoTexto: m.subModulo,
    accion: m.accion.toLowerCase(),
    tipoEvento: m.accion === 'OBSERVADO' ? 'observacion'
      : m.accion === 'SUBSANADO' ? 'subsanacion' : 'etapa',
  }));
}

export default { normalizeMovimientos, movimientosToTimelineEvents };

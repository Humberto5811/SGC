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
    eventoId: m.eventoId || m.id || idx + 1,
    fecha: m.fecha,
    accion: String(m.accion || '').toUpperCase(),
    etiquetaAccion: m.etiquetaAccion || null,
    etiquetaEstadoNuevo: m.etiquetaEstadoNuevo || null,
    estadoAnterior: m.estadoAnterior || m.estado_anterior || null,
    estadoNuevo: m.estadoNuevo || m.estado_nuevo || null,
    modulo: m.modulo || 'SGC',
    subModulo: normalizeLegacyActosLabel(m.subModulo || m.sub_modulo || '—'),
    subModuloOrigen: normalizeLegacyActosLabel(m.subModuloOrigen || m.sub_modulo_origen || ''),
    subModuloDestino: normalizeLegacyActosLabel(m.subModuloDestino || m.sub_modulo_destino || ''),
    etapa: m.etapa || '',
    usuario: m.usuario || m.actor || '—',
    actor: m.actor || m.usuario || '—',
    rol: m.rol || '',
    responsable: m.responsable || m.usuario || '—',
    observacion: normalizeLegacyActosLabel(m.observacion || ''),
    fuente: m.fuente || m.origen || '',
    ordenId: m.ordenId || m.orden_id || null,
    recepcionBienesId: m.recepcionBienesId || m.recepcionBienId || null,
    fechaTexto: fmtDateTime(m.fecha),
  }));
}

export function movimientosToTimelineEvents(movimientos) {
  return normalizeMovimientos(movimientos).map((m) => ({
    ...m,
    esActual: false,
    fechaIngreso: m.fecha,
    estadoTexto: m.etiquetaAccion || m.subModulo,
    tipoEvento: m.accion === 'OBSERVADO' ? 'observacion'
      : m.accion === 'SUBSANADO' ? 'subsanacion' : 'etapa',
  }));
}

export default { normalizeMovimientos, movimientosToTimelineEvents };

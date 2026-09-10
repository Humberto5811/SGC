/**
 * RC8.17 Fase 1 — Contrato homogéneo de fila de bandeja expediente.
 * Normaliza Etapa/Estado/Responsable/Días desde estado_responsable_vigente.
 * No elimina propiedades legacy del row original.
 */
import { getLabelEtapa } from '../../shared/workflow/etapas.js';
import { getLabelEstado } from '../../shared/estadoExpedienteCatalog.js';
import { buildContratoCanonico } from './estadoResponsableCanonico.js';

const UNIDADES_NO_PERSONA = new Set([
  'AREA USUARIA', 'ÁREA USUARIA', 'DEC', 'PROGRAMACION', 'PROGRAMACIÓN',
  'COORDINACION CM', 'COORDINACIÓN CM', 'AU', 'ANALISTA CM', 'ALMACEN', 'ALMACÉN',
]);

function clean(v) {
  return String(v ?? '').trim();
}

export function calcDiasEnEstadoDesdeFecha(fechaRef) {
  if (!fechaRef) return 0;
  const t = new Date(fechaRef).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function resolveFechaVigente(row, erv) {
  return erv?.actualizadoAt
    || erv?.actualizado_at
    || row?.fecha_estado_vigente
    || row?.fecha_estado_actual
    || row?.fechaEstadoActual
    || null;
}

function resolveResponsableContrato(erv) {
  if (!erv || erv.canonicalMissing === true) {
    return {
      tipo: 'PENDIENTE',
      usuarioId: null,
      nombre: 'Pendiente de asignación',
      unidad: '',
      rol: '',
    };
  }

  const tipoRaw = clean(erv.responsableTipo || erv.responsable_tipo).toUpperCase();
  const usuarioId = erv.responsableUsuarioId ?? erv.responsable_usuario_id ?? null;
  const nombre = clean(erv.responsableNombre || erv.responsable_nombre);
  const username = clean(erv.responsableUsername || erv.responsable_username);
  const unidad = clean(erv.responsableUnidad || erv.responsable_unidad);

  if (
    (tipoRaw === 'PERSONA' || usuarioId || nombre || username)
    && !(nombre && UNIDADES_NO_PERSONA.has(nombre.toUpperCase()))
  ) {
    let display = nombre;
    if (!display || /^\d+$/.test(display)) {
      display = username || (usuarioId ? `Usuario #${usuarioId}` : '');
    }
    if (display) {
      return {
        tipo: 'PERSONA',
        usuarioId: usuarioId != null ? Number(usuarioId) : null,
        nombre: display,
        unidad: unidad || '',
        rol: unidad || '',
      };
    }
  }

  if (tipoRaw === 'UNIDAD' || unidad) {
    return {
      tipo: 'UNIDAD',
      usuarioId: null,
      nombre: unidad || 'Equipo sin asignar',
      unidad,
      rol: unidad,
    };
  }

  return {
    tipo: 'PENDIENTE',
    usuarioId: null,
    nombre: 'Pendiente de asignación',
    unidad: '',
    rol: '',
  };
}

function resolveEtapaEstado(erv) {
  if (!erv || erv.canonicalMissing === true) {
    return {
      etapa: { codigo: '', label: 'Estado no disponible' },
      estado: { codigo: '', label: 'Estado no disponible' },
    };
  }

  const etapaCodigo = clean(erv.etapaCodigo || erv.etapa_codigo);
  const estadoCodigo = clean(erv.estadoCodigo || erv.estado_codigo);
  const etapaLabel = clean(erv.etapaLabel || erv.etapa_label)
    || getLabelEtapa(etapaCodigo)
    || etapaCodigo;
  let estadoLabel = clean(erv.estadoLabel || erv.estado_label)
    || getLabelEstado(estadoCodigo)
    || estadoCodigo;
  if (estadoCodigo && (estadoLabel === estadoCodigo) && etapaLabel) {
    estadoLabel = etapaLabel;
  }

  return {
    etapa: { codigo: etapaCodigo, label: etapaLabel || '—' },
    estado: { codigo: estadoCodigo, label: estadoLabel || '—' },
  };
}

/**
 * Construye contrato mínimo desde fila (requiere estado_responsable_vigente enriquecido).
 */
export function buildBandejaExpedienteContrato(row = {}) {
  const erv = row.estado_responsable_vigente || null;
  const { etapa, estado } = resolveEtapaEstado(erv);
  const responsable = resolveResponsableContrato(erv);
  const fechaVigente = resolveFechaVigente(row, erv);
  const dias = calcDiasEnEstadoDesdeFecha(fechaVigente);

  return {
    requerimiento_id: row.requerimiento_id || row.id || null,
    codigo: row.codigo || '',
    fecha_referencia: row.created_at || fechaVigente || null,
    fecha_estado_vigente: fechaVigente,
    tipo: row.tipo || '',
    descripcion: row.denominacion || '',
    centro: row.centro_nombre || row.centro || '',
    etapa,
    estado,
    responsable,
    dias_en_estado: dias,
    acciones: row.acciones || null,
  };
}

/**
 * Aplica contrato in-place conservando campos legacy.
 */
export function applyBandejaExpedienteContrato(row) {
  if (!row || typeof row !== 'object') return row;
  const contrato = buildBandejaExpedienteContrato(row);
  row.bandeja_contrato = contrato;
  row.dias_en_estado = contrato.dias_en_estado;
  row.diasEnEstado = contrato.dias_en_estado;
  row.fecha_estado_vigente = contrato.fecha_estado_vigente;
  row.responsable_display = contrato.responsable.nombre;
  row.responsableDisplay = contrato.responsable.nombre;
  row.responsable_vigente_tipo = contrato.responsable.tipo;
  row.etapa_codigo_vigente = contrato.etapa.codigo;
  row.etapa_label_vigente = contrato.etapa.label;
  row.estado_codigo_vigente = contrato.estado.codigo;
  row.estado_label_vigente = contrato.estado.label;
  return row;
}

export function applyBandejaExpedienteContratoBatch(rows = []) {
  if (!Array.isArray(rows)) return rows;
  rows.forEach((row) => applyBandejaExpedienteContrato(row));
  return rows;
}

/** Helper tests — construye contrato desde filas ERV/asignación persistidas. */
export function buildBandejaContratoFromPersistido(estadoRow, asignacion = null, rowExtra = {}) {
  const canon = buildContratoCanonico(estadoRow, asignacion);
  const base = {
    id: canon.requerimientoId,
    requerimiento_id: canon.requerimientoId,
    codigo: rowExtra.codigo || `REQ-${canon.requerimientoId}`,
    tipo: rowExtra.tipo || 'bienes',
    denominacion: rowExtra.denominacion || 'Test',
    centro_nombre: rowExtra.centro_nombre || 'Centro',
    created_at: rowExtra.created_at || new Date().toISOString(),
    estado_responsable_vigente: {
      ...canon,
      etapaCodigo: canon.etapaCodigo,
      etapaLabel: canon.etapaLabel,
      estadoCodigo: canon.estadoCodigo,
      estadoLabel: canon.estadoLabel,
      responsableTipo: canon.responsableTipo,
      responsableUsuarioId: canon.responsableUsuarioId,
      responsableNombre: canon.responsableNombre,
      responsableUsername: canon.responsableUsername,
      responsableUnidad: canon.responsableUnidad,
      actualizadoAt: canon.actualizadoAt,
    },
    ...rowExtra,
  };
  applyBandejaExpedienteContrato(base);
  return base;
}

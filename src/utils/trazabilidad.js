// Utilidades UI de trazabilidad de expedientes (frontend)
import { computeMotorSnapshot, obtenerEstadoObservaciones } from '../../shared/observacionesMotor.js';
import { buildEstadoVisual, renderEstadoVisualHtml } from './estadoVisualPresenter.js';

export const ETAPA_BADGES = {
  REGISTRADO: 'secondary',
  EVALUACION: 'warning',
  DEC: 'primary',
  PROGRAMACION: 'success',
  ACTOS_PREPARATORIOS: 'info',
  INVITACIONES: 'info',
  RECEPCION_COTIZACIONES: 'info',
  VALIDACION_USUARIO: 'warning',
  CUADRO_COMPARATIVO: 'secondary',
  CCP: 'orange',
  EJECUCION: 'purple',
  REGISTRO_ORDEN: 'secondary',
  ALMACEN: 'secondary',
  TESORERIA: 'secondary',
  FINALIZADO: 'secondary',
  OBSERVADO: 'danger',
};

export const ETAPA_LABELS = {
  REGISTRADO: 'Registrado',
  EVALUACION: 'Evaluación',
  DEC: 'DEC',
  PROGRAMACION: 'Programación',
  ACTOS_PREPARATORIOS: 'Coordinación CM',
  INVITACIONES: 'Invitaciones',
  RECEPCION_COTIZACIONES: 'Recepción Cotizaciones',
  VALIDACION_USUARIO: 'Validación Usuario',
  CUADRO_COMPARATIVO: 'Cuadro Comparativo',
  CCP: 'CCP',
  EJECUCION: 'Ejecución Contractual',
  REGISTRO_ORDEN: 'Registro de Orden',
  ALMACEN: 'Almacén',
  TESORERIA: 'Tesorería',
  FINALIZADO: 'Finalizado',
  OBSERVADO: 'Observado',
};

/** Texto columna "Estado Actual" en bandejas (según etapa real del expediente) */
export const ESTADO_ACTUAL_TEXTO = {
  REGISTRADO: 'En Registro',
  EVALUACION: 'En Evaluación de Requerimientos',
  DEC: 'En DEC',
  PROGRAMACION: 'En Programación',
  ACTOS_PREPARATORIOS: 'En Coordinación CM',
  INVITACIONES: 'En Invitaciones',
  RECEPCION_COTIZACIONES: 'En Recep. Cotiz.',
  VALIDACION_USUARIO: 'En Valid. Usuario',
  CUADRO_COMPARATIVO: 'En Cuadro Comp.',
  CCP: 'En CCP',
  EJECUCION: 'En Ejecución',
  REGISTRO_ORDEN: 'En Reg. Orden',
  ALMACEN: 'En Almacén',
  TESORERIA: 'En Tesorería',
  FINALIZADO: 'Finalizado',
  OBSERVADO: 'Observado',
};

/** Etiquetas en timeline (modal trazabilidad) */
export const ETAPA_TIMELINE_LABELS = {
  REGISTRADO: 'Registro de Requerimientos',
  EVALUACION: 'Evaluación de Requerimientos',
  DEC: 'DEC',
  PROGRAMACION: 'Programación',
  ACTOS_PREPARATORIOS: 'Coordinación CM',
  INVITACIONES: 'Invitaciones',
  RECEPCION_COTIZACIONES: 'Recepción de Cotizaciones',
  VALIDACION_USUARIO: 'Validación de Usuario',
  CUADRO_COMPARATIVO: 'Cuadro Comparativo',
  CCP: 'CCP',
  EJECUCION: 'Ejecución Contractual',
  REGISTRO_ORDEN: 'Registro de Orden',
  ALMACEN: 'Almacén',
  TESORERIA: 'Tesorería',
  FINALIZADO: 'Finalizado',
  OBSERVADO: 'Observado',
};

/**
 * Ubicación real del expediente según el estado de negocio.
 * No confundir con acciones puntuales (p. ej. "Observado", "Observado DEC").
 */
export function mapEstadoToUbicacion(estado) {
  const e = String(estado || '').trim();
  if (!e || e === 'Registrado') return 'REGISTRADO';
  if (/observado program/i.test(e)) return 'PROGRAMACION';
  if (/en programaci/i.test(e)) return 'PROGRAMACION';
  if (/aprobad.*program/i.test(e)) return 'ACTOS_PREPARATORIOS';
  if (e === 'Aprobado DEC') return 'PROGRAMACION';
  if (/observado dec/i.test(e)) return 'PROGRAMACION';
  if (e === 'Aprobado') return 'DEC';
  if (e === 'Observado') return 'EVALUACION';
  if (/tr[aá]mite/i.test(e)) return 'EVALUACION';
  if (e === 'Programado') return 'ACTOS_PREPARATORIOS';
  if (/actos prep|coordinaci[oó]n cm/i.test(e)) return 'ACTOS_PREPARATORIOS';
  if (/observado actos|observado coordin/i.test(e)) return 'ACTOS_PREPARATORIOS';
  if (/invitaci/i.test(e)) return 'INVITACIONES';
  if (/finaliz/i.test(e)) return 'FINALIZADO';
  return 'REGISTRADO';
}

/** @deprecated Alias — usar mapEstadoToUbicacion */
export function mapEstadoToEtapa(estado) {
  return mapEstadoToUbicacion(estado);
}

/** Corrige desfase entre `estado` (negocio) y `estado_actual` (trazabilidad). */
export function getEstadoNegocioFromEtapa(etapaCode) {
  const code = String(etapaCode || 'REGISTRADO').toUpperCase();
  switch (code) {
    case 'REGISTRADO': return 'Registrado';
    case 'EVALUACION': return 'En tramite de aprobación';
    case 'DEC': return 'Aprobado';
    case 'PROGRAMACION': return 'En Programación';
    case 'ACTOS_PREPARATORIOS': return 'Programado';
    case 'INVITACIONES': return 'En Invitaciones';
    case 'RECEPCION_COTIZACIONES': return 'En Cotizaciones';
    case 'CUADRO_COMPARATIVO': return 'En Cuadro Comparativo';
    case 'CCP': return 'En CCP';
    case 'EJECUCION': return 'En Ejecución';
    case 'FINALIZADO': return 'Finalizado';
    default: return '';
  }
}

export function resolveEstadoNegocioFromRow(row) {
  const etapaActual = String(row?.estado_actual || row?.estadoActual || '').toUpperCase();
  if (etapaActual) {
    const fromEtapa = getEstadoNegocioFromEtapa(etapaActual);
    if (fromEtapa) return fromEtapa;
  }
  const estado = String(row?.estado || '').trim();
  if (etapaActual && /^observ/i.test(estado)) {
    const fromEtapa = getEstadoNegocioFromEtapa(etapaActual);
    if (fromEtapa) return fromEtapa;
  }
  if (etapaActual === 'PROGRAMACION' && /tr[aá]mite/i.test(estado) && !/programaci|observ/i.test(estado)) {
    return 'En Programación';
  }
  if (etapaActual === 'EVALUACION' && /programaci/i.test(estado)) {
    return 'En tramite de aprobación';
  }
  if (etapaActual === 'DEC' && (/tr[aá]mite/i.test(estado) || /^observ/i.test(estado))) {
    return 'Aprobado';
  }
  if (etapaActual === 'DEC' && estado === 'Aprobado DEC') {
    return 'Aprobado DEC';
  }
  if (etapaActual === 'PROGRAMACION' && /^observ/i.test(estado)) {
    return 'En Programación';
  }
  return estado;
}

/** Ubicación efectiva del expediente — prioriza `estado_actual` en BD. */
export function resolveUbicacionExpediente(row) {
  const fromDb = String(row?.estado_actual || row?.estadoActual || '').toUpperCase();
  if (fromDb) return fromDb;
  const estadoNegocio = resolveEstadoNegocioFromRow(row);
  return mapEstadoToUbicacion(estadoNegocio);
}

export function isEstadoObservado(estadoOrRow) {
  if (estadoOrRow && typeof estadoOrRow === 'object' && ('payload' in estadoOrRow || 'obsMotor' in estadoOrRow)) {
    return buildEstadoVisual(estadoOrRow).badgeObservado;
  }
  return /observ/i.test(String(estadoOrRow || '').trim());
}

export function getEstadoActualTexto(ubicacionCode) {
  const code = String(ubicacionCode || 'REGISTRADO').toUpperCase();
  return ESTADO_ACTUAL_TEXTO[code] || ESTADO_ACTUAL_TEXTO.REGISTRADO;
}

export function getTimelineEtapaLabel(estado, estadoTexto, tipoEvento) {
  const code = String(estado || '').toUpperCase();
  const base = ETAPA_TIMELINE_LABELS[code] || estadoTexto || ETAPA_LABELS[code] || code;
  if (tipoEvento === 'observacion') return `${base} — Observación`;
  if (tipoEvento === 'subsanacion') return `${base} — Subsanación`;
  return base;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function calcDiasEnEstado(fechaEstadoActual) {
  if (!fechaEstadoActual) return 0;
  const t = new Date(fechaEstadoActual).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

export function diasSemaforoClass(dias) {
  const d = Number(dias) || 0;
  if (d <= 2) return 'text-success';
  if (d <= 5) return 'text-warning';
  if (d <= 10) return 'text-orange';
  return 'text-danger';
}

export const SUBMODULOS_FILTRO = [
  'Registro de Requerimiento',
  'Evaluación de Requerimiento',
  'DEC',
  'Programación',
  'Coordinación CM',
  'Invitaciones',
  'Cotizaciones',
  'Validación Usuario',
  'Cuadro Comparativo',
  'CCP',
  'Registro de Orden',
  'Almacén',
  'Tesorería',
  'Finalizado',
];

export function computeTraceSummary(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  let enProceso = 0;
  let observados = 0;
  let retrasados = 0;
  let finalizados = 0;
  list.forEach((r) => {
    const dias = Number(r.dias_en_estado ?? r.diasEnEstado ?? calcDiasEnEstado(r.fecha_estado_actual || r.fechaEstadoActual));
    if (/finaliz/i.test(String(r.estado || ''))) finalizados += 1;
    else enProceso += 1;
    if (buildEstadoVisual(r).badgeObservado) observados += 1;
    if (dias > 10) retrasados += 1;
  });
  return { total: list.length, enProceso, observados, retrasados, finalizados };
}

export {
  renderSummaryCardsHtml,
  updateSummaryCards,
  renderFilterBarHtml,
  readFilterParams,
  clearFilterInputs,
  applyBandejaFilters,
  bandejaTraceHeaders,
  renderCompactRowCells as renderTraceRowCells,
  renderActionMenuCell,
  bindActionMenus,
  wrapBandejaTable,
  bindBandejaToolbar,
  bandejaGlobalStyles as bandejaTableStyles,
  buildExportRowData,
  updateBandejaAdjCount,
  isExecutiveMode,
} from './bandejaUi.js';

export function retrasadoIndicator(row) {
  const dias = row.dias_en_estado ?? row.diasEnEstado ?? calcDiasEnEstado(row.fecha_estado_actual || row.fechaEstadoActual);
  if (Number(dias) > 10) {
    return '<span class="badge bg-danger ms-1" title="Más de 10 días en la etapa actual">⚠ Retrasado</span>';
  }
  return '';
}

export function diasLabel(dias) {
  const d = Number(dias) || 0;
  return d === 1 ? '1 día' : `${d} días`;
}

export function estadoActualBadge(estadoActual, estadoTexto, row = null) {
  if (row) return renderEstadoVisualHtml(row);
  const code = String(estadoActual || '').toUpperCase();
  let cls = ETAPA_BADGES[code] || 'secondary';
  const label = estadoTexto || ESTADO_ACTUAL_TEXTO[code] || ETAPA_LABELS[code] || code || '—';
  if (cls === 'orange') {
    return `<span class="badge" style="background:#fd7e14;color:#fff;">${esc(label)}</span>`;
  }
  if (cls === 'purple') {
    return `<span class="badge" style="background:#6f42c1;color:#fff;">${esc(label)}</span>`;
  }
  return `<span class="badge bg-${cls}">${esc(label)}</span>`;
}

/** Icono rojo de observaciones (mismo estilo en todos los submódulos). */
export function observacionIconHtml(id, title = 'Ver observaciones', extraClass = '') {
  const style = 'padding:2px 6px;font-size:11px;';
  return `<button type="button" class="btn btn-xs btn-danger text-white req-observacion-icon ${extraClass}" data-id="${id}" title="${esc(title)}" style="${style}"><i class="bi bi-chat-left-dots" style="font-size:11px;"></i></button>`;
}

/** Botón rojo en columna Acciones cuando el requerimiento está observado (Registro — subsanar). */
export function observadoAccionHtml(id, title = 'Observado — ver observación y subsanar') {
  return observacionIconHtml(id, title, 'req-observado');
}

/** Badge rojo de alerta (Evaluación, DEC, Programación — solo aviso). */
export function observadoAlertBadge(title = 'Requerimiento observado — pendiente subsanación') {
  return `<span class="badge bg-danger text-white fw-semibold ms-1" title="${esc(title)}" style="font-size:11px;">Observado</span>`;
}

export function diasEnEstadoBadge(row) {
  const dias = row.dias_en_estado ?? row.diasEnEstado ?? calcDiasEnEstado(row.fecha_estado_actual || row.fechaEstadoActual);
  let bg = '#198754';
  if (dias > 10) bg = '#dc3545';
  else if (dias > 5) bg = '#fd7e14';
  else if (dias > 2) bg = '#ffc107';
  const fg = dias > 2 && dias <= 5 ? '#212529' : '#fff';
  return `<span class="badge badge-dias-mod" style="background:${bg};color:${fg};">${esc(diasLabel(dias))}</span>`;
}

export function areaCell(text) {
  const full = String(text || '').trim();
  if (!full) return '—';
  return `<span class="req-col-area d-inline-block" title="${esc(full)}">${esc(full)}</span>`;
}

export function trazaBtnHtml(id, title = 'Ver trazabilidad / timeline') {
  return `<button type="button" class="btn btn-link btn-sm p-0 req-traza text-secondary" data-id="${id}" title="${esc(title)}" onclick="event.stopPropagation()"><i class="bi bi-clock-history"></i></button>`;
}

export function parsePayloadItems(r) {
  let codigosSigamef = '—';
  let descripcionesBien = '—';
  try {
    const p = JSON.parse(r.payload || '{}');
    const items = r.tipo === 'servicios' ? (p.servicioItems || [])
      : r.tipo === 'locacion' ? (p.locadorItems || []) : (p.items || []);
    if (Array.isArray(items) && items.length) {
      codigosSigamef = items.map((it) => esc(it.item_bien || '')).join(', ');
      descripcionesBien = items.map((it) => esc(it.nombre_item || '')).join(', ');
    }
  } catch (_) {}
  return { codigosSigamef, descripcionesBien };
}

export function calcMontoTotal(r) {
  let monto_total = 0;
  try {
    const payload = JSON.parse(r.payload || '{}');
    if (r.tipo === 'servicios' && Array.isArray(payload.servicioItems)) {
      monto_total = payload.servicioItems.reduce((s, it) => s + (Number(it.monto) || 0), 0);
    } else if (r.tipo === 'locacion' && Array.isArray(payload.locadorItems)) {
      monto_total = payload.locadorItems.reduce((s, it) => s + (Number(it.monto) || 0), 0);
    } else if (Array.isArray(payload.items)) {
      monto_total = payload.items.reduce((s, it) => s + ((Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0)), 0);
    }
  } catch (_) {}
  return Number(monto_total.toFixed(2));
}

function extractWorkflowSnapshot(r) {
  const direct = r?.workflowSnapshot || r?.workflow_snapshot;
  if (direct && typeof direct === 'object') return direct;
  try {
    const p = typeof r?.payload === 'string' ? JSON.parse(r.payload || '{}') : (r?.payload || {});
    return p.workflowSnapshot || p.workflow_snapshot || null;
  } catch (_) {
    return null;
  }
}

export function enrichReqRow(r) {
  const monto_total = calcMontoTotal(r);
  const dias = r.dias_en_estado ?? r.diasEnEstado ?? calcDiasEnEstado(r.fecha_estado_actual || r.fechaEstadoActual);
  const ubicacion = resolveUbicacionExpediente(r);
  const workflowSnapshot = extractWorkflowSnapshot(r);
  const snapEtapa = workflowSnapshot?.etapaActual
    ? String(workflowSnapshot.etapaActual).toUpperCase()
    : null;
  const etapaWorkflow = snapEtapa || ubicacion;
  const snapSub = workflowSnapshot?.subModuloActual || workflowSnapshot?.moduloActual || null;
  const subModulo = snapSub || r.sub_modulo_actual || r.subModuloActual || ETAPA_LABELS[etapaWorkflow] || getEstadoActualTexto(etapaWorkflow);
  const estadoNegocio = String(r?.estado || '').trim() || resolveEstadoNegocioFromRow(r);
  const estadoActualTexto = subModulo || r.estado_actual_texto || r.estadoActualTexto || getEstadoActualTexto(etapaWorkflow);
  const obsMotor = r.obsMotor || obtenerEstadoObservaciones(r);
  return {
    ...r,
    estado: estadoNegocio,
    monto_total,
    dias_en_estado: dias,
    estadoActual: etapaWorkflow,
    estado_actual: etapaWorkflow,
    estadoActualTexto,
    estado_actual_texto: estadoActualTexto,
    subModuloActual: subModulo || r.subModuloActual,
    responsableActual: r.responsable_actual || r.responsableActual || r.responsable || '—',
    workflowSnapshot,
    obsMotor,
  };
}

export function filterRowsClient(rows, filters = {}) {
  const f = filters || {};
  const codigo = String(f.codigo || '').toLowerCase();
  const sigamef = String(f.codigo_sigamef || '').toLowerCase();
  const estado = String(f.estado_actual || '').toUpperCase();
  const subMod = String(f.sub_modulo_actual || '').toLowerCase();
  const resp = String(f.responsable_actual || '').toLowerCase();
  const area = String(f.area || '').toLowerCase();
  return (rows || []).filter((r) => {
    const row = enrichReqRow(r);
    if (codigo && !String(row.codigo || '').toLowerCase().includes(codigo)) return false;
    if (sigamef) {
      const { codigosSigamef } = parsePayloadItems(row);
      if (!String(codigosSigamef || '').toLowerCase().includes(sigamef)) return false;
    }
    if (estado && String(row.estadoActual || row.estado_actual || '').toUpperCase() !== estado) return false;
    if (subMod && !String(row.subModuloActual || row.sub_modulo_actual || '').toLowerCase().includes(subMod)) return false;
    if (resp && !String(row.responsableActual || '').toLowerCase().includes(resp)) return false;
    if (area && !String(row.area || '').toLowerCase().includes(area)) return false;
    return true;
  });
}

export { esc };

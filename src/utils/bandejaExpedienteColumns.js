/**
 * RC8.17 Fase 1 — Columnas y render compacto estándar de bandeja expediente.
 * N° | Fecha | Tipo | Descripción | Centro | Etapa | Estado | Responsable | Días | Acciones
 */
import { esc, calcDiasEnEstado, diasLabel, fmtDateTime } from './trazabilidad.js';
import { renderEstadoBadgeHtml } from '../ui/workflow/EstadoBadge.js';
import { renderEtapaBadgeHtml } from '../ui/workflow/EtapaBadge.js';
import { renderResponsableBadgeHtml } from '../ui/workflow/ResponsableBadge.js';
import { adaptEstadoResponsable } from '../ui/workflow/adaptEstadoResponsable.js';
import {
  bandejaGlobalStyles,
  renderActionMenuCell,
  sortableTh,
  trazaIconHtml,
  truncateText,
  getRowDescripcionRaw,
} from './bandejaUi.js';

export const BANDEJA_EXPEDIENTE_COLUMN_IDS = Object.freeze([
  'timeline', 'numero', 'fecha', 'tipo', 'descripcion', 'centro',
  'etapa', 'estado', 'responsable', 'dias', 'acciones',
]);

export function bandejaExpedienteStandardStyles() {
  return `
    ${bandejaGlobalStyles()}
    .sgc-bandeja-standard .req-list-table { min-width: 1100px; }
    .sgc-bandeja-standard .req-list-table th,
    .sgc-bandeja-standard .req-list-table td {
      padding: 0.32rem 0.42rem;
      line-height: 1.25;
      height: auto;
    }
    .sgc-bandeja-standard .req-list-table tbody tr { height: 36px; max-height: 40px; }
    .sgc-bandeja-standard .req-col-fecha { width: 92px; white-space: nowrap; font-size: 0.75rem; color: #495057; }
    .sgc-bandeja-standard .req-col-etapa { width: 150px; max-width: 150px; }
    .sgc-bandeja-standard .req-col-estado-cell { width: 155px; max-width: 155px; }
    .sgc-bandeja-standard .req-col-resp { width: 175px; max-width: 175px; }
    .sgc-bandeja-standard .req-col-dias { width: 58px; max-width: 60px; }
    .sgc-bandeja-standard .req-col-acc { width: 42px; max-width: 45px; }
    .sgc-bandeja-standard .sgc-etapa-badge,
    .sgc-bandeja-standard .sgc-estado-badge,
    .sgc-bandeja-standard .sgc-responsable-badge {
      max-width: 100%;
      min-height: 24px;
      max-height: 26px;
    }
    .sgc-bandeja-standard .sgc-etapa-badge__text { max-width: 138px; }
    .sgc-bandeja-standard .sgc-estado-badge__text { max-width: 143px; }
    .sgc-bandeja-standard .sgc-responsable-badge__text { max-width: 163px; }
    .sgc-bandeja-standard .sgc-etapa-badge__text,
    .sgc-bandeja-standard .sgc-estado-badge__text,
    .sgc-bandeja-standard .sgc-responsable-badge__text {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      display: inline-block; vertical-align: bottom;
    }
  `;
}

export function bandejaExpedienteStandardHeaders(prefix = 'req', sortState = null, extraColsBeforeAcc = '') {
  return `
    <th class="req-col-timeline" title="Timeline">🕒</th>
    ${sortableTh('N°', 'codigo', sortState, 'req-col-req')}
    ${sortableTh('Fecha', 'fecha', sortState, 'req-col-fecha')}
    ${sortableTh('Tipo', 'tipo', sortState, 'req-col-tipo')}
    ${sortableTh('Descripción', 'denominacion', sortState, 'req-col-desc')}
    ${sortableTh('Centro', 'centro_nombre', sortState, 'req-col-centro')}
    ${sortableTh('Etapa', 'etapa', sortState, 'req-col-etapa')}
    ${sortableTh('Estado', 'estado', sortState, 'req-col-estado')}
    ${sortableTh('Responsable', 'responsable', sortState, 'req-col-resp')}
    ${sortableTh('Días', 'dias', sortState, 'req-col-dias')}
    ${extraColsBeforeAcc}
    <th class="req-col-acc"></th>`;
}

function resolveContratoVisual(row = {}) {
  const bc = row.bandeja_contrato;
  if (bc?.etapa?.codigo || bc?.estado?.codigo) {
    const adapted = adaptEstadoResponsable(row);
    return {
      etapaLabel: bc.etapa?.label || adapted.etapaLabel || '—',
      etapaCodigo: bc.etapa?.codigo || adapted.etapaCodigo || '',
      estadoLabel: bc.estado?.label || adapted.estadoLabel || '—',
      estadoCodigo: bc.estado?.codigo || adapted.estadoCodigo || '',
      responsableTipo: bc.responsable?.tipo || adapted.responsableTipo,
      responsableNombre: bc.responsable?.nombre || adapted.responsableDisplay,
      responsableUnidad: bc.responsable?.unidad || adapted.responsableUnidad,
      responsableUsuarioId: bc.responsable?.usuarioId ?? adapted.responsableUsuarioId,
      responsableUsername: adapted.responsableUsername,
      dias: bc.dias_en_estado ?? row.dias_en_estado ?? 0,
      categoria: adapted.categoria,
      icono: adapted.icono,
      tooltip: adapted.tooltip,
    };
  }
  const adapted = adaptEstadoResponsable(row);
  return {
    etapaLabel: adapted.etapaLabel || '—',
    etapaCodigo: adapted.etapaCodigo || '',
    estadoLabel: adapted.estadoLabel || '—',
    estadoCodigo: adapted.estadoCodigo || '',
    responsableTipo: adapted.responsableTipo,
    responsableNombre: adapted.responsableDisplay,
    responsableUnidad: adapted.responsableUnidad,
    responsableUsuarioId: adapted.responsableUsuarioId,
    responsableUsername: adapted.responsableUsername,
    dias: row.dias_en_estado
      ?? calcDiasEnEstado(row.fecha_estado_vigente || row.fecha_estado_actual),
    categoria: adapted.categoria,
    icono: adapted.icono,
    tooltip: adapted.tooltip,
  };
}

function diasBadgeCompact(dias) {
  const d = Number(dias) || 0;
  let bg = '#198754';
  if (d > 10) bg = '#dc3545';
  else if (d > 5) bg = '#fd7e14';
  else if (d > 2) bg = '#ffc107';
  const fg = d > 2 && d <= 5 ? '#212529' : '#fff';
  return `<span class="badge badge-dias-mod" style="background:${bg};color:${fg};" title="Días en estado vigente">${esc(diasLabel(d))}</span>`;
}

function tipoBadgeHtml(tipo, escFn) {
  const t = String(tipo || '').toLowerCase();
  const cls = t === 'servicios' ? 'bg-success' : (t === 'locacion' ? 'bg-info' : 'bg-primary');
  const label = t === 'servicios' ? 'Serv.' : (t === 'locacion' ? 'Loc.' : 'Bien');
  return `<span class="badge ${cls}" style="font-size:0.65rem;">${escFn(label)}</span>`;
}

export function renderBandejaExpedienteRowCells(row, opts = {}) {
  const escFn = opts.escFn || esc;
  const visual = resolveContratoVisual(row);
  const descFull = getRowDescripcionRaw(row);
  const descShort = truncateText(descFull, 55);
  const fechaRef = row.bandeja_contrato?.fecha_referencia || row.created_at;
  const fechaTxt = fechaRef ? fmtDateTime(fechaRef).slice(0, 10) : '—';
  const estadoHtml = renderEstadoBadgeHtml({
    estadoCodigo: visual.estadoCodigo,
    estadoLabel: visual.estadoLabel,
    categoria: visual.categoria,
    icono: visual.icono,
    tooltip: visual.tooltip,
  });
  const etapaHtml = renderEtapaBadgeHtml({
    etapaLabel: visual.etapaLabel,
    etapaCodigo: visual.etapaCodigo,
  });
  const respHtml = renderResponsableBadgeHtml({
    responsableTipo: visual.responsableTipo,
    responsableNombre: visual.responsableNombre,
    responsableUsername: visual.responsableUsername,
    responsableUsuarioId: visual.responsableUsuarioId,
    responsableUnidad: visual.responsableUnidad,
    responsableDisplay: visual.responsableNombre,
  });

  return `
    <td class="req-col-timeline">${trazaIconHtml(row.id)}</td>
    <td class="req-col-req"><div class="req-codigo fw-semibold">${escFn(row.codigo || ('#' + row.id))}</div></td>
    <td class="req-col-fecha" title="${escFn(fechaRef || '')}">${escFn(fechaTxt)}</td>
    <td class="req-col-tipo">${tipoBadgeHtml(row.tipo, escFn)}</td>
    <td class="req-col-desc"><span class="req-desc-text" title="${escFn(descFull)}">${escFn(descShort || '—')}</span></td>
    <td class="req-col-centro"><span class="req-centro-text" title="${escFn(row.centro_nombre || row.centro || '—')}">${escFn(row.centro_nombre || row.centro || '—')}</span></td>
    <td class="req-col-etapa">${etapaHtml}</td>
    <td class="req-col-estado-cell">${estadoHtml}</td>
    <td class="req-col-resp">${respHtml}</td>
    <td class="req-col-dias text-center">${diasBadgeCompact(visual.dias)}</td>`;
}

export function wrapBandejaExpedienteTable({
  containerId,
  prefix = 'req',
  bodyHtml = '',
  sortState = null,
  extraColsBeforeAcc = '',
  headExtraBefore = '',
}) {
  return `
    <style>${bandejaExpedienteStandardStyles()}</style>
    <div class="sgc-bandeja-wrap sgc-bandeja-standard" id="${containerId}-wrap" data-bandeja-prefix="${prefix}">
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle req-list-table mb-0">
          <thead class="table-light">
            <tr>${headExtraBefore}${bandejaExpedienteStandardHeaders(prefix, sortState, extraColsBeforeAcc)}</tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    </div>`;
}

export function renderBandejaExpedienteActionCell(id, menuItems, hiddenActionsHtml = '') {
  return renderActionMenuCell(id, menuItems, hiddenActionsHtml);
}

// Menús contextuales ⋮ por bandeja (sin lógica de negocio — solo UI)
import { getObservacionPendiente, observacionPendienteParaSubmodulo } from './observacionDestino.js';

export function registroMenuItems(r) {
  const e = String(r.estado || '');
  const aprobado = /aprobad/i.test(e);
  const observado = /observ/i.test(e);
  const enTramite = /tr[aá]mite/i.test(e);
  const puedeAprobar = !aprobado && !observado && !enTramite;
  return [
    { act: 'detail', label: 'Ver detalle', icon: 'bi-eye' },
    { act: 'edit', label: 'Editar', icon: 'bi-pencil', disabled: aprobado },
    { act: 'obs', label: observado ? 'Observaciones / subsanar' : 'Observaciones', icon: 'bi-chat-left-dots' },
    { act: 'timeline', label: 'Timeline', icon: 'bi-clock-history' },
    { act: 'attach', label: 'Adjuntos', icon: 'bi-paperclip' },
    { act: 'download', label: 'Descargar', icon: 'bi-printer' },
    { act: 'approve', label: 'Aprobar', icon: 'bi-check-circle', disabled: !puedeAprobar },
    { act: 'delete', label: 'Eliminar', icon: 'bi-trash', disabled: aprobado },
  ];
}

export function registroHiddenActions(r, esc) {
  const e = String(r.estado || '');
  const aprobado = /aprobad/i.test(e);
  const observado = /observ/i.test(e);
  const enTramite = /tr[aá]mite/i.test(e);
  const puedeAprobar = !aprobado && !observado && !enTramite;
  return `
    <button type="button" class="req-open" data-act-trigger="edit" data-id="${r.id}" ${aprobado ? 'disabled' : ''}></button>
    <button type="button" class="req-print" data-act-trigger="download" data-id="${r.id}"></button>
    <button type="button" class="req-attach" data-act-trigger="attach" data-id="${r.id}" data-estado="${esc(e)}"></button>
    <button type="button" class="req-obs-menu" data-act-trigger="obs" data-id="${r.id}"></button>
    ${observado ? `<button type="button" class="req-observado" data-act-trigger="obs" data-id="${r.id}"></button>` : ''}
    <button type="button" class="req-approve" data-act-trigger="approve" data-id="${r.id}" ${puedeAprobar ? '' : 'disabled'}></button>
    ${aprobado ? `<button type="button" class="req-ver-obs" data-act-trigger="obs" data-id="${r.id}"></button>` : ''}
    <button type="button" class="req-traza-hidden req-traza" data-act-trigger="timeline" data-id="${r.id}"></button>
    <button type="button" class="req-del" data-act-trigger="delete" data-id="${r.id}" ${aprobado ? 'disabled' : ''}></button>`;
}

export function evalMenuItems(r) {
  const enTramite = /tr[aá]mite/i.test(String(r.estado || ''));
  const observado = /observ/i.test(String(r.estado || ''));
  const aprobado = /aprobad/i.test(String(r.estado || ''));
  return [
    { act: 'detail', label: 'Ver detalle', icon: 'bi-eye' },
    { act: 'edit', label: 'Editar', icon: 'bi-pencil', disabled: aprobado },
    { act: 'obs', label: 'Observaciones', icon: 'bi-chat-left-dots', disabled: !(enTramite || observado || aprobado) },
    { act: 'approve', label: 'Aprobar', icon: 'bi-check-circle', disabled: aprobado || !enTramite },
    { act: 'timeline', label: 'Timeline', icon: 'bi-clock-history' },
    { act: 'attach', label: 'Adjuntos', icon: 'bi-paperclip' },
    { act: 'download', label: 'Descargar', icon: 'bi-printer' },
    { act: 'delete', label: 'Eliminar', icon: 'bi-trash', disabled: aprobado },
  ];
}

export function evalHiddenActions(r, esc) {
  const enTramite = /tr[aá]mite/i.test(String(r.estado || ''));
  const observado = /observ/i.test(String(r.estado || ''));
  const aprobado = /aprobad/i.test(String(r.estado || ''));
  return `
    <button type="button" class="eval-edit" data-act-trigger="edit" data-id="${r.id}" ${aprobado ? 'disabled' : ''}></button>
    <button type="button" class="eval-print" data-act-trigger="download" data-id="${r.id}"></button>
    <button type="button" class="eval-attach" data-act-trigger="attach" data-id="${r.id}" data-estado="${esc(r.estado || '')}"></button>
    <button type="button" class="eval-obs-menu" data-act-trigger="obs" data-id="${r.id}"></button>
    <button type="button" class="eval-observar" data-act-trigger="obs" data-id="${r.id}" ${(enTramite || observado || aprobado) ? '' : 'disabled'}></button>
    <button type="button" class="eval-approve" data-act-trigger="approve" data-id="${r.id}" ${aprobado || !enTramite ? 'disabled' : ''}></button>
    <button type="button" class="req-traza" data-act-trigger="timeline" data-id="${r.id}"></button>
    <button type="button" class="eval-del" data-act-trigger="delete" data-id="${r.id}" ${aprobado ? 'disabled' : ''}></button>`;
}

export function decMenuItems(r) {
  const esObservado = /observ/i.test(String(r.estado || ''));
  const esAprobado = r.estado === 'Aprobado';
  return [
    { act: 'detail', label: 'Ver detalle', icon: 'bi-eye' },
    { act: 'download', label: 'Descargar', icon: 'bi-printer' },
    { act: 'obs', label: 'Observaciones', icon: 'bi-chat-left-dots' },
    { act: 'approve', label: 'Aprobar DEC', icon: 'bi-check-circle', disabled: !esAprobado },
    { act: 'timeline', label: 'Timeline', icon: 'bi-clock-history' },
    { act: 'attach', label: 'Adjuntos', icon: 'bi-paperclip' },
  ];
}

export function decHiddenActions(r) {
  return `
    <button type="button" class="dec-ver" data-act-trigger="download" data-id="${r.id}" data-perm-act="VER"></button>
    <button type="button" class="dec-attach" data-act-trigger="attach" data-id="${r.id}" data-perm-act="VER"></button>
    <button type="button" class="dec-obs-menu" data-act-trigger="obs" data-id="${r.id}" data-perm-act="OBSERVAR"></button>
    <button type="button" class="dec-observar" data-act-trigger="obs" data-id="${r.id}" data-perm-act="OBSERVAR"></button>
    <button type="button" class="dec-aprobar" data-act-trigger="approve" data-id="${r.id}" data-perm-act="APROBAR"></button>
    <button type="button" class="req-traza" data-act-trigger="timeline" data-id="${r.id}"></button>`;
}

export function progMenuItems(r) {
  const esObservado = /observ/i.test(String(r.estado || ''));
  const esAprobadoDec = r.estado === 'Aprobado DEC';
  const enProgramacion = r.estado === 'En Programación';
  const puedeGestionar = esAprobadoDec || esObservado || enProgramacion;
  const puedeAprobar = esAprobadoDec || enProgramacion;
  const pending = getObservacionPendiente(r);
  const pendProg = observacionPendienteParaSubmodulo(pending, 'Programación');
  const obsLabel = pendProg ? 'Responder observación' : 'Observaciones';
  const obsEnabled = puedeGestionar || esObservado || pendProg;
  return [
    { act: 'detail', label: 'Ver detalle', icon: 'bi-eye' },
    { act: 'pedido', label: 'Agregar pedido', icon: 'bi-plus-circle', disabled: !puedeGestionar },
    { act: 'obs', label: obsLabel, icon: 'bi-chat-left-dots', disabled: !obsEnabled },
    { act: 'approve', label: 'Aprobar', icon: 'bi-check-circle', disabled: !puedeAprobar },
    { act: 'timeline', label: 'Timeline', icon: 'bi-clock-history' },
    { act: 'attach', label: 'Adjuntos', icon: 'bi-paperclip' },
    { act: 'download', label: 'Descargar', icon: 'bi-printer' },
  ];
}

export function progHiddenActions(r) {
  const esObservado = /observ/i.test(String(r.estado || ''));
  const esAprobadoDec = r.estado === 'Aprobado DEC';
  const enProgramacion = r.estado === 'En Programación';
  const puedeGestionar = esAprobadoDec || esObservado || enProgramacion;
  const puedeAprobar = esAprobadoDec || enProgramacion;
  const pending = getObservacionPendiente(r);
  const pendProg = observacionPendienteParaSubmodulo(pending, 'Programación');
  const obsEnabled = puedeGestionar || esObservado || pendProg;
  return `
    <button type="button" class="prog-add-pedido" data-act-trigger="pedido" data-id="${r.id}" ${puedeGestionar ? '' : 'disabled'}></button>
    <button type="button" class="prog-ver" data-act-trigger="download" data-id="${r.id}"></button>
    <button type="button" class="prog-attach" data-act-trigger="attach" data-id="${r.id}"></button>
    <button type="button" class="prog-observar" data-act-trigger="obs" data-id="${r.id}" ${obsEnabled ? '' : 'disabled'}></button>
    <button type="button" class="prog-aprobar" data-act-trigger="approve" data-id="${r.id}" ${puedeAprobar ? '' : 'disabled'}></button>
    <button type="button" class="req-traza" data-act-trigger="timeline" data-id="${r.id}"></button>`;
}

export function actosMenuItems(r, opts = {}) {
  const { esCoordinador = false, esAsignadoAMi = false, esPoolCoordinador = false } = opts;
  const esObservado = /observ/i.test(String(r.estado || ''));
  const pending = getObservacionPendiente(r);
  const pendActos = observacionPendienteParaSubmodulo(pending, 'Coordinación CM');
  const obsLabel = pendActos ? 'Responder observación' : (esObservado ? 'Observaciones' : 'Observar');
  const items = [
    { act: 'detail', label: 'Ver expediente', icon: 'bi-eye' },
    { act: 'download', label: 'Descargar', icon: 'bi-printer' },
    { act: 'timeline', label: 'Trazabilidad', icon: 'bi-clock-history' },
    { act: 'attach', label: 'Adjuntos', icon: 'bi-paperclip' },
  ];
  if (esCoordinador) {
    items.push(
      { act: 'approve', label: esPoolCoordinador ? 'Asignar analista' : 'Reasignar', icon: 'bi-person-check' },
      { act: 'deriveAnalyst', label: 'Derivar a analista', icon: 'bi-person-plus' },
      { act: 'obs', label: obsLabel, icon: 'bi-chat-left-dots' },
      { act: 'derive', label: 'Derivar (otro destino)', icon: 'bi-arrow-right-circle' },
    );
  } else if (esAsignadoAMi) {
    items.push(
      { act: 'obs', label: obsLabel, icon: 'bi-chat-left-dots' },
      { act: 'approve', label: 'Aprobar → Invitaciones', icon: 'bi-check-circle' },
    );
  }
  return items;
}

export function actosHiddenActions(r, opts = {}) {
  const { esCoordinador = false, esAsignadoAMi = false } = opts;
  let html = `
    <button type="button" class="actos-ver" data-act-trigger="download" data-id="${r.id}" data-perm-act="VER"></button>
    <button type="button" class="actos-attach" data-act-trigger="attach" data-id="${r.id}" data-perm-act="VER"></button>
    <button type="button" class="req-traza" data-act-trigger="timeline" data-id="${r.id}"></button>`;
  if (esCoordinador) {
    html += `
    <button type="button" class="actos-observar" data-act-trigger="obs" data-id="${r.id}" data-perm-act="OBSERVAR"></button>
    <button type="button" class="actos-derivar-analista" data-act-trigger="deriveAnalyst" data-id="${r.id}" data-perm-act="DERIVAR"></button>
    <button type="button" class="actos-derivar" data-act-trigger="derive" data-id="${r.id}" data-perm-act="DERIVAR"></button>
    <button type="button" class="actos-asignar" data-act-trigger="approve" data-id="${r.id}" data-perm-act="APROBAR"></button>`;
  } else if (esAsignadoAMi) {
    html += `
    <button type="button" class="actos-observar" data-act-trigger="obs" data-id="${r.id}" data-perm-act="OBSERVAR"></button>
    <button type="button" class="actos-aprobar-inv" data-act-trigger="approve" data-id="${r.id}" data-perm-act="APROBAR"></button>`;
  }
  return html;
}

export function invitacionesMenuItems(r) {
  return [
    { act: 'detail', label: 'Ver detalle', icon: 'bi-eye' },
    { act: 'obs', label: 'Observaciones', icon: 'bi-chat-left-dots' },
    { act: 'timeline', label: 'Timeline', icon: 'bi-clock-history' },
    { act: 'attach', label: 'Adjuntos', icon: 'bi-paperclip' },
    { act: 'download', label: 'Descargar', icon: 'bi-printer' },
    { act: 'crearSc', label: 'Crear Solicitud de Cotización', icon: 'bi-file-earmark-plus' },
  ];
}

export function invitacionesHiddenActions(r) {
  return `
    <button type="button" class="inv-ver" data-act-trigger="download" data-id="${r.id}"></button>
    <button type="button" class="inv-attach" data-act-trigger="attach" data-id="${r.id}"></button>
    <button type="button" class="inv-obs" data-act-trigger="obs" data-id="${r.id}"></button>
    <button type="button" class="req-traza" data-act-trigger="timeline" data-id="${r.id}"></button>
    <button type="button" class="inv-sc" data-act-trigger="crearSc" data-id="${r.id}"></button>`;
}

import { portalService } from '../../services/portalService.js';
import {
  esc, renderProveedorShell, requireProveedorSession, bindProveedorLogout,
  PROVEEDOR_ROUTES, cleanupModalBackdrop, makeModalDraggable, labelEstadoConsulta,
} from '../../utils/proveedorShared.js';
import { formatDateTimeLima } from '../../utils/dateTimeLima.js';
import {
  consultaPreviewRespuesta,
  consultaRespuestaAnalistaVisible,
  MSG_SOLICITUD_NO_DISPONIBLE_CONSULTA,
  parseConsultaAdjuntos,
  puedeVolverAConsultar,
  solicitudIdEnOpcionesFormulario,
} from '../../utils/misConsultasProveedor.js';

function fmtDt(v) {
  return formatDateTimeLima(v);
}

function renderAdjuntosListaHtml(items, titulo) {
  if (!items?.length) return '';
  return `
    <p class="mb-1 fw-semibold mt-2">${esc(titulo)}</p>
    <ul class="small mb-0 ps-3">${items.map((a) => `<li>${esc(a.label)}</li>`).join('')}</ul>`;
}

export function renderMisConsultasView() {
  if (!requireProveedorSession()) return '';
  return renderProveedorShell(PROVEEDOR_ROUTES.misConsultas, `
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-header bg-white d-flex justify-content-between align-items-center">
        <h5 class="mb-0"><i class="bi bi-chat-left-text"></i> Mis Consultas</h5>
        <button class="btn btn-sm btn-primary" id="provBtnNuevaConsulta"><i class="bi bi-plus"></i> Nueva consulta</button>
      </div>
      <div class="card-body" id="provConsContent"><div class="text-muted">Cargando…</div></div>
    </div>
    <div class="card border-0 shadow-sm d-none" id="provConsFormCard">
      <div class="card-body">
        <h6 id="provConsFormTitle">Registrar consulta</h6>
        <div class="row g-2">
          <div class="col-md-3"><select class="form-select form-select-sm" id="provConsSol"></select></div>
          <div class="col-md-3"><input class="form-control form-control-sm" id="provConsAsunto" placeholder="Asunto"></div>
          <div class="col-md-6"><textarea class="form-control form-control-sm" id="provConsTexto" rows="2" placeholder="Consulta"></textarea></div>
          <div class="col-12"><button class="btn btn-sm btn-success" id="provConsEnviar">Enviar consulta</button></div>
        </div>
      </div>
    </div>
    <div class="modal fade" id="provConsRespModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header py-2 prov-draggable-header">
            <h6 class="modal-title" id="provConsRespTitle">Respuesta del analista</h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body small" id="provConsRespBody"></div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`);
}

export function showRespuestaCompleta(c) {
  const modal = document.getElementById('provConsRespModal');
  const title = document.getElementById('provConsRespTitle');
  const body = document.getElementById('provConsRespBody');
  if (!modal || !title || !body) return;

  const desc = c.denominacion || c.objeto || '—';
  const adjConsulta = parseConsultaAdjuntos(c.adjuntos);
  const adjRespuesta = parseConsultaAdjuntos(c.respuesta_adjuntos);
  const convPublica = c.absolucion_publica
    ? '<p class="mb-0 mt-2 text-muted"><i class="bi bi-megaphone"></i> Esta respuesta también fue publicada como absolución general de la convocatoria.</p>'
    : '';

  title.textContent = `Respuesta del analista — ${c.asunto || 'Consulta'}`;
  body.innerHTML = `
    <p class="mb-2"><strong>N° Solicitud de Cotización:</strong> ${esc(c.solicitud_codigo || '—')}</p>
    <p class="mb-2"><strong>Descripción:</strong> ${esc(desc)}</p>
    <p class="mb-2"><strong>Asunto:</strong> ${esc(c.asunto || '—')}</p>
    <p class="mb-2"><strong>Fecha de consulta:</strong> ${fmtDt(c.created_at)}</p>
    <p class="mb-2"><strong>Estado:</strong> ${esc(labelEstadoConsulta(c.estado))}</p>
    <hr>
    <p class="mb-1 fw-semibold">Consulta realizada</p>
    <div class="border rounded p-2 bg-white mb-2" style="white-space:pre-wrap;">${esc(c.consulta || '—')}</div>
    ${renderAdjuntosListaHtml(adjConsulta, 'Adjuntos de la consulta')}
    <hr>
    <p class="mb-1 fw-semibold">Respuesta del analista</p>
    <p class="mb-1 text-muted"><strong>Fecha de respuesta:</strong> ${fmtDt(c.updated_at || c.created_at)}</p>
    <div class="border rounded p-2 bg-light" style="white-space:pre-wrap;">${esc(c.respuesta || '—')}</div>
    ${renderAdjuntosListaHtml(adjRespuesta, 'Adjuntos de la respuesta')}
    ${convPublica}`;

  makeModalDraggable(modal);
  bootstrap.Modal.getOrCreateInstance(modal).show();
}

function abrirFormularioNuevaConsulta({ solicitudId = null, invitacionId = null, titulo = 'Registrar consulta' } = {}) {
  const card = document.getElementById('provConsFormCard');
  const titleEl = document.getElementById('provConsFormTitle');
  const sel = document.getElementById('provConsSol');
  const asuntoEl = document.getElementById('provConsAsunto');
  const textoEl = document.getElementById('provConsTexto');

  if (sel && invitacionId != null) {
    const match = [...sel.options].find((o) => o.value === String(invitacionId));
    if (!match) {
      alert(MSG_SOLICITUD_NO_DISPONIBLE_CONSULTA);
      return;
    }
    sel.value = String(invitacionId);
  } else if (sel && solicitudId != null) {
    const match = [...sel.options].find((o) => o.dataset.solicitudId === String(solicitudId));
    if (!match) {
      alert(MSG_SOLICITUD_NO_DISPONIBLE_CONSULTA);
      return;
    }
    sel.value = match.value;
  }

  if (titleEl) titleEl.textContent = titulo;
  if (asuntoEl) asuntoEl.value = '';
  if (textoEl) textoEl.value = '';
  card?.classList.remove('d-none');
  asuntoEl?.focus();
}

async function loadConsultas() {
  const cont = document.getElementById('provConsContent');
  const resp = await portalService.listConsultas();
  const rows = resp.data || [];
  if (!rows.length) {
    cont.innerHTML = '<div class="alert alert-light border">No ha registrado consultas.</div>';
    return rows;
  }
  cont.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm table-bordered table-hover mb-0">
        <thead class="table-light"><tr>
          <th>N° Solicitud de Cotización</th>
          <th>N° Inv.</th>
          <th>Descripción</th>
          <th>Asunto</th>
          <th>Fecha</th>
          <th>Estado</th>
          <th>Respuesta del analista</th>
          <th style="min-width:200px;">Acciones</th>
        </tr></thead>
        <tbody>${rows.map((c, i) => {
          const desc = c.denominacion || c.objeto || '—';
          const invLabel = c.invitacion_id
            ? (c.invitacion_nro != null ? String(c.invitacion_nro) : '—')
            : 'Legacy';
          const visible = consultaRespuestaAnalistaVisible(c);
          const preview = visible ? esc(consultaPreviewRespuesta(c, 80) || '—') : '—';
          const acciones = [];
          if (visible) {
            acciones.push(`<button type="button" class="btn btn-outline-primary btn-sm py-0 prov-cons-ver" data-i="${i}">Ver respuesta</button>`);
          }
          if (puedeVolverAConsultar(c)) {
            acciones.push(`<button type="button" class="btn btn-outline-secondary btn-sm py-0 prov-cons-reconsultar" data-sol="${esc(c.solicitud_id)}" data-inv="${esc(c.invitacion_id || '')}" data-i="${i}">Volver a consultar</button>`);
          }
          return `
          <tr>
            <td class="small">${esc(c.solicitud_codigo || '—')}</td>
            <td class="small text-center">${esc(invLabel)}</td>
            <td class="small">${esc(desc)}</td>
            <td>${esc(c.asunto || '—')}</td>
            <td class="small text-nowrap">${fmtDt(c.created_at)}</td>
            <td><span class="badge bg-${c.estado === 'RESPONDIDA' ? 'success' : 'secondary'}">${esc(labelEstadoConsulta(c.estado))}</span></td>
            <td class="small">${preview}</td>
            <td class="text-nowrap d-flex flex-wrap gap-1">${acciones.join('') || '—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;

  cont.querySelectorAll('.prov-cons-ver').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = rows[parseInt(btn.dataset.i, 10)];
      if (c && consultaRespuestaAnalistaVisible(c)) showRespuestaCompleta(c);
    });
  });
  cont.querySelectorAll('.prov-cons-reconsultar').forEach((btn) => {
    btn.addEventListener('click', () => {
      abrirFormularioNuevaConsulta({
        solicitudId: parseInt(btn.dataset.sol, 10),
        invitacionId: btn.dataset.inv ? parseInt(btn.dataset.inv, 10) : null,
        titulo: 'Nueva consulta relacionada',
      });
    });
  });
  return rows;
}

export async function initMisConsultasView() {
  bindProveedorLogout();
  cleanupModalBackdrop();
  const modal = document.getElementById('provConsRespModal');
  modal?.addEventListener('hidden.bs.modal', cleanupModalBackdrop);
  try {
    await loadConsultas();
    const inv = await portalService.listMisInvitaciones();
    const sel = document.getElementById('provConsSol');
    if (sel) {
      sel.innerHTML = (inv.data || []).map((i) => {
        const nro = i.nro_invitacion_presentacion ?? i.nro_invitacion ?? '—';
        return `<option value="${i.id}" data-solicitud-id="${i.solicitud_id}">${esc(i.codigo)} — Inv.${esc(String(nro))}</option>`;
      }).join('')
        || '<option value="">Sin convocatorias</option>';
    }
  } catch (err) {
    document.getElementById('provConsContent').innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }

  document.getElementById('provBtnNuevaConsulta')?.addEventListener('click', () => {
    abrirFormularioNuevaConsulta({ titulo: 'Registrar consulta' });
  });
  document.getElementById('provConsEnviar')?.addEventListener('click', async () => {
    try {
      const sel = document.getElementById('provConsSol');
      const opt = sel?.selectedOptions?.[0];
      await portalService.crearConsulta({
        solicitud_id: parseInt(opt?.dataset?.solicitudId || '', 10),
        invitacion_id: parseInt(sel?.value, 10),
        asunto: document.getElementById('provConsAsunto')?.value,
        consulta: document.getElementById('provConsTexto')?.value,
      });
      document.getElementById('provConsFormCard')?.classList.add('d-none');
      const asuntoEl = document.getElementById('provConsAsunto');
      const textoEl = document.getElementById('provConsTexto');
      if (asuntoEl) asuntoEl.value = '';
      if (textoEl) textoEl.value = '';
      await loadConsultas();
    } catch (err) { alert(err.message); }
  });
}

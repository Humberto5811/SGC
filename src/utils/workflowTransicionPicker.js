/**
 * RC8.17.3 / D7 — Picker canónico de responsable PERSONA (candidatos-transicion).
 */
import { api } from '../services/apiService.js';

export function escTransicionPicker(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderCandidatoPickBtn(c, { destacado = false } = {}) {
  const esc = escTransicionPicker;
  const det = [c.rol_general_label, c.equipo_uad_label, c.username].filter(Boolean).join(' · ');
  const cls = destacado ? 'list-group-item-primary' : '';
  const badge = c.etiqueta ? `<span class="badge bg-secondary ms-1">${esc(c.etiqueta)}</span>` : '';
  return `<button type="button" class="list-group-item list-group-item-action py-1 px-2 usr-pick ${cls}"
    data-uid="${esc(String(c.id))}" data-nom="${esc(c.nombre || '')}">
    <strong>${destacado ? '★ ' : ''}${esc(c.nombre || '')}</strong>${badge}
    ${det ? `<br><span class="text-muted small">${esc(det)}</span>` : ''}
  </button>`;
}

/**
 * Markup de campos del picker (hidden + búsqueda + lista).
 * @param {string} id — prefijo de ids DOM
 * @param {{ label?: string, showEtapaSelect?: boolean }} [opts]
 */
export function renderTransicionPickerFieldsHtml(id, opts = {}) {
  const esc = escTransicionPicker;
  const label = opts.label || 'Responsable';
  const etapaBlock = opts.showEtapaSelect
    ? `<div class="border rounded p-2 bg-light mb-2">
        <label class="form-label small fw-semibold mb-1">Etapa destino</label>
        <select id="${id}_etapaDestino" class="form-select form-select-sm d-none"></select>
      </div>`
    : `<select id="${id}_etapaDestino" class="d-none" aria-hidden="true"></select>`;
  return `
    ${etapaBlock}
    <div class="border rounded p-2 bg-white">
      <label class="form-label small fw-semibold mb-1">${esc(label)}</label>
      <input type="hidden" id="${id}_destUid" value="">
      <input type="hidden" id="${id}_destRecomendadoId" value="">
      <input type="hidden" id="${id}_destPersonaNombre" value="">
      <div class="input-group input-group-sm mb-1">
        <input type="text" id="${id}_buscarUsr" class="form-control" placeholder="Buscar persona…" autocomplete="off" />
        <button type="button" id="${id}_btnBuscarUsr" class="btn btn-outline-primary" title="Buscar" aria-label="Buscar persona">
          <i class="bi bi-search"></i>
        </button>
      </div>
      <div id="${id}_usrSugerido" class="mb-0"></div>
    </div>`;
}

/**
 * @param {string} id
 * @param {object} opts
 * @param {number|string} opts.requerimientoId
 * @param {string} opts.eventoCodigo
 * @param {string|function} [opts.candidatosApiPath]
 * @param {boolean} [opts.alertOnMissingSelection=true]
 * @param {(state: { hasCandidatos: boolean, canSubmit: boolean }) => void} [opts.onAvailabilityChange]
 */
export function wireTransicionPicker(id, opts = {}) {
  const esc = escTransicionPicker;
  const buscarEl = document.getElementById(`${id}_buscarUsr`);
  const btnBuscar = document.getElementById(`${id}_btnBuscarUsr`);
  const sugeridoEl = document.getElementById(`${id}_usrSugerido`);
  const etapaEl = document.getElementById(`${id}_etapaDestino`);
  const uidEl = document.getElementById(`${id}_destUid`);
  const recomEl = document.getElementById(`${id}_destRecomendadoId`);
  const nombreEl = document.getElementById(`${id}_destPersonaNombre`);
  let seleccion = { id: null, nombre: '' };
  let dataCache = null;
  let hasCandidatos = false;

  const notifyAvailability = () => {
    opts.onAvailabilityChange?.({
      hasCandidatos,
      canSubmit: !!(seleccion.id && Number.isFinite(seleccion.id)),
    });
  };

  const seleccionarCandidato = (uid, nombre) => {
    if (!uid) return;
    seleccion = { id: Number(uid), nombre: String(nombre || '').trim() };
    uidEl.value = String(seleccion.id);
    nombreEl.value = seleccion.nombre;
    if (buscarEl) buscarEl.value = seleccion.nombre;
    sugeridoEl?.querySelectorAll('.usr-pick').forEach((b) => {
      b.classList.toggle('active', String(b.dataset.uid) === String(uid));
    });
    notifyAvailability();
  };

  const renderEtapa = (data) => {
    if (!etapaEl) return;
    const destinos = data?.destinos || [];
    const etapaWrap = etapaEl.closest('.border.rounded');
    if (destinos.length <= 1) {
      const d0 = destinos[0];
      const label = d0?.etapa_label || data?.etapa_destino_label || d0?.etapa_codigo || data?.etapa_destino || '—';
      const codigo = d0?.etapa_codigo || data?.etapa_destino || '';
      etapaEl.classList.add('d-none');
      etapaEl.innerHTML = codigo
        ? `<option value="${esc(codigo)}" selected>${esc(label)}</option>`
        : '';
      if (etapaWrap) {
        let vis = etapaWrap.querySelector('.wf-etapa-destino-readonly');
        if (!vis) {
          vis = document.createElement('div');
          vis.className = 'wf-etapa-destino-readonly small fw-semibold text-body';
          etapaWrap.appendChild(vis);
        }
        vis.textContent = label;
      }
      return;
    }
    etapaWrap?.querySelector('.wf-etapa-destino-readonly')?.remove();
    etapaEl.classList.remove('d-none');
    etapaEl.innerHTML = destinos.map((d) =>
      `<option value="${esc(d.etapa_codigo)}">${esc(d.etapa_label || d.etapa_codigo)}</option>`,
    ).join('');
  };

  const cargarCandidatos = async (q = '') => {
    if (!sugeridoEl) return;
    sugeridoEl.innerHTML = '<div class="text-muted small">Cargando candidatos…</div>';
    try {
      const params = new URLSearchParams({ evento: opts.eventoCodigo });
      if (q.trim().length >= 2) params.set('q', q.trim());
      const apiPath = typeof opts.candidatosApiPath === 'function'
        ? opts.candidatosApiPath(opts.requerimientoId)
        : (opts.candidatosApiPath || `/requerimientos/${opts.requerimientoId}/candidatos-transicion`);
      const resp = await api.get(`${apiPath}?${params}`);
      const data = resp?.data || resp;
      dataCache = data;
      renderEtapa(data);
      recomEl.value = data.recomendado?.id ? String(data.recomendado.id) : '';

      hasCandidatos = !!(data.recomendado || (data.candidatos && data.candidatos.length));
      let html = '';
      if (data.recomendado) {
        html += `<div class="small text-muted mb-1">Recomendado</div>`;
        html += `<div class="list-group list-group-flush border rounded mb-1">${renderCandidatoPickBtn(data.recomendado, { destacado: true })}</div>`;
        if (!seleccion.id) seleccionarCandidato(data.recomendado.id, data.recomendado.nombre);
      }
      if (data.candidatos?.length) {
        html += `<div class="small text-muted mb-1">Otros responsables elegibles</div>`;
        html += `<div class="list-group list-group-flush border rounded" style="max-height:140px;overflow-y:auto">${data.candidatos.map((c) => renderCandidatoPickBtn(c)).join('')}</div>`;
      }
      if (!data.recomendado && !data.candidatos?.length) {
        hasCandidatos = false;
        const msg = data.mensaje_sin_candidatos || 'Sin personas elegibles para esta transición.';
        html = `<div class="text-muted small border rounded p-2">${esc(msg)}</div>`;
        seleccion = { id: null, nombre: '' };
        uidEl.value = '';
        recomEl.value = '';
        nombreEl.value = '';
      }
      sugeridoEl.innerHTML = html;
      sugeridoEl.querySelectorAll('.usr-pick').forEach((b) => {
        b.onclick = () => seleccionarCandidato(b.dataset.uid, b.dataset.nom);
      });
      notifyAvailability();
    } catch (e) {
      hasCandidatos = false;
      sugeridoEl.innerHTML = `<div class="alert alert-danger py-1 px-2 small mb-0">${esc(e.message)}</div>`;
      notifyAvailability();
    }
  };

  if (btnBuscar) btnBuscar.onclick = () => cargarCandidatos(buscarEl?.value || '');
  if (buscarEl) {
    buscarEl.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); cargarCandidatos(buscarEl.value || ''); }
    };
  }
  cargarCandidatos();

  return () => {
    if (!seleccion.id || !Number.isFinite(seleccion.id)) {
      if (opts.alertOnMissingSelection !== false) {
        alert('Seleccione la persona responsable.');
      }
      return null;
    }
    const recomendadoId = recomEl.value ? Number(recomEl.value) : null;
    const etapaDestino = etapaEl?.value || dataCache?.etapa_destino || '';
    return {
      evento_codigo: opts.eventoCodigo,
      etapa_destino: etapaDestino,
      usuario_destino_id: seleccion.id,
      responsable_nombre: seleccion.nombre,
      responsable_recomendado_id: recomendadoId,
      reasignacion_manual: !!(recomendadoId && seleccion.id !== recomendadoId),
    };
  };
}

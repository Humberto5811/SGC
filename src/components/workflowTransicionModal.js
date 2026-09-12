/**
 * RC8.17.3 — Modal compartido: etapa destino + responsable PERSONA.
 * Usado por Aprobar / Derivar / Devolver / Subsanar / Reasignar (workflow).
 */
import { api } from '../services/apiService.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCandidatoPickBtn(c, { destacado = false } = {}) {
  const det = [c.username, c.cargo].filter(Boolean).join(' · ');
  const cls = destacado ? 'list-group-item-primary' : '';
  const badge = c.etiqueta ? `<span class="badge bg-secondary ms-1">${esc(c.etiqueta)}</span>` : '';
  return `<button type="button" class="list-group-item list-group-item-action py-1 px-2 usr-pick ${cls}"
    data-uid="${esc(String(c.id))}" data-nom="${esc(c.nombre || '')}">
    <strong>${destacado ? '★ ' : ''}${esc(c.nombre || '')}</strong>${badge}
    ${det ? `<br><span class="text-muted small">${esc(det)}</span>` : ''}
  </button>`;
}

function wireTransicionPicker(id, { requerimientoId, eventoCodigo }) {
  const buscarEl = document.getElementById(`${id}_buscarUsr`);
  const btnBuscar = document.getElementById(`${id}_btnBuscarUsr`);
  const sugeridoEl = document.getElementById(`${id}_usrSugerido`);
  const etapaEl = document.getElementById(`${id}_etapaDestino`);
  const uidEl = document.getElementById(`${id}_destUid`);
  const recomEl = document.getElementById(`${id}_destRecomendadoId`);
  const nombreEl = document.getElementById(`${id}_destPersonaNombre`);
  let seleccion = { id: null, nombre: '' };
  let dataCache = null;

  const seleccionarCandidato = (uid, nombre) => {
    if (!uid) return;
    seleccion = { id: Number(uid), nombre: String(nombre || '').trim() };
    uidEl.value = String(seleccion.id);
    nombreEl.value = seleccion.nombre;
    buscarEl.value = seleccion.nombre;
    sugeridoEl.querySelectorAll('.usr-pick').forEach((b) => {
      b.classList.toggle('active', String(b.dataset.uid) === String(uid));
    });
  };

  const renderEtapa = (data) => {
    const destinos = data?.destinos || [];
    if (destinos.length <= 1) {
      etapaEl.classList.add('d-none');
      etapaEl.innerHTML = destinos[0]
        ? `<option value="${esc(destinos[0].etapa_codigo)}" selected>${esc(destinos[0].etapa_label || destinos[0].etapa_codigo)}</option>`
        : '';
      return;
    }
    etapaEl.classList.remove('d-none');
    etapaEl.innerHTML = destinos.map((d) =>
      `<option value="${esc(d.etapa_codigo)}">${esc(d.etapa_label || d.etapa_codigo)}</option>`,
    ).join('');
  };

  const cargarCandidatos = async (q = '') => {
    sugeridoEl.innerHTML = '<div class="text-muted small">Cargando candidatos…</div>';
    try {
      const params = new URLSearchParams({ evento: eventoCodigo });
      if (q.trim().length >= 2) params.set('q', q.trim());
      const resp = await api.get(`/requerimientos/${requerimientoId}/candidatos-transicion?${params}`);
      const data = resp?.data || resp;
      dataCache = data;
      renderEtapa(data);
      recomEl.value = data.recomendado?.id ? String(data.recomendado.id) : '';

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
        html = '<div class="text-muted small border rounded p-2">Sin personas elegibles para esta transición.</div>';
      }
      sugeridoEl.innerHTML = html;
      sugeridoEl.querySelectorAll('.usr-pick').forEach((b) => {
        b.onclick = () => seleccionarCandidato(b.dataset.uid, b.dataset.nom);
      });
    } catch (e) {
      sugeridoEl.innerHTML = `<div class="alert alert-danger py-1 px-2 small mb-0">${esc(e.message)}</div>`;
    }
  };

  btnBuscar.onclick = () => cargarCandidatos(buscarEl.value || '');
  buscarEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); cargarCandidatos(buscarEl.value || ''); } };
  cargarCandidatos();

  return () => {
    if (!seleccion.id || !Number.isFinite(seleccion.id)) {
      alert('Seleccione la persona responsable.');
      return null;
    }
    const recomendadoId = recomEl.value ? Number(recomEl.value) : null;
    const etapaDestino = etapaEl.value || dataCache?.etapa_destino || '';
    return {
      evento_codigo: eventoCodigo,
      etapa_destino: etapaDestino,
      usuario_destino_id: seleccion.id,
      responsable_nombre: seleccion.nombre,
      responsable_recomendado_id: recomendadoId,
      reasignacion_manual: !!(recomendadoId && seleccion.id !== recomendadoId),
    };
  };
}

/**
 * @param {object} opts
 * @param {number|string} opts.requerimientoId
 * @param {string} opts.eventoCodigo — evento canónico (p.ej. EVALUACION_APROBADA)
 * @param {string} [opts.title]
 * @param {string} [opts.message]
 * @param {string} [opts.buttonText]
 */
export function showWorkflowTransicionModal(opts = {}) {
  const id = 'modWfTrans_' + Date.now();
  const html = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${esc(opts.title || 'Confirmar transición')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            ${opts.message ? `<p class="text-muted small mb-2">${esc(opts.message)}</p>` : ''}
            <div class="border rounded p-2 bg-light mb-2">
              <label class="form-label small fw-semibold mb-1">Etapa destino</label>
              <select id="${id}_etapaDestino" class="form-select form-select-sm d-none"></select>
              <div id="${id}_etapaUnica" class="small text-body-secondary d-none"></div>
            </div>
            <div class="border rounded p-2 bg-light">
              <label class="form-label small fw-semibold mb-1">Responsable</label>
              <input type="hidden" id="${id}_destUid" value="">
              <input type="hidden" id="${id}_destRecomendadoId" value="">
              <input type="hidden" id="${id}_destPersonaNombre" value="">
              <div class="input-group input-group-sm mb-1">
                <input type="text" id="${id}_buscarUsr" class="form-control" placeholder="Buscar persona…" autocomplete="off" />
                <button type="button" id="${id}_btnBuscarUsr" class="btn btn-outline-primary" title="Buscar"><i class="bi bi-search"></i></button>
              </div>
              <div id="${id}_usrSugerido" class="mb-0"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" id="${id}_ok" class="btn btn-primary">${esc(opts.buttonText || 'Confirmar')}</button>
          </div>
        </div>
      </div>
    </div>`;
  const wrap = document.createElement('div');
  document.body.appendChild(wrap);
  wrap.innerHTML = html;
  const el = document.getElementById(id);
  const modal = new bootstrap.Modal(el);
  const readSeleccion = wireTransicionPicker(id, {
    requerimientoId: opts.requerimientoId,
    eventoCodigo: opts.eventoCodigo,
  });

  return new Promise((resolve) => {
    let resolved = false;
    document.getElementById(`${id}_ok`).onclick = () => {
      const sel = readSeleccion();
      if (!sel) return;
      resolved = true;
      resolve(sel);
      modal.hide();
    };
    el.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      if (!resolved) resolve(null);
    }, { once: true });
    modal.show();
  });
}

export default { showWorkflowTransicionModal };

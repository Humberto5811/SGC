// Selector Inteligente de Proveedores — Invitaciones (Maestro de Proveedores)
import { proveedoresMaestroService } from '../services/proveedoresMaestroService.js';
import { contratacionesService } from '../services/contratacionesService.js';
import { openNuevoProveedorModal } from '../views/registroDatos/proveedoresMaestroView.js';
import { formatDateTimeLima } from './dateTimeLima.js';

const RUBROS = [
  'Medicamentos', 'Reactivos', 'Dispositivos Médicos', 'Equipos', 'Laboratorio',
  'Servicios', 'Consultoría', 'Locadores', 'Software', 'Mobiliario', 'Otros',
];

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** Único formateador de fechas de invitaciones (America/Lima). */
function fmtDt(v) {
  return esc(formatDateTimeLima(v));
}

function badgeAnterior(p) {
  if (!p.invitado_anteriormente) return '';
  const tip = [
    `Fecha: ${formatDateTimeLima(p.ultima_invitacion)}`,
    `Convocatoria: ${p.ultima_convocatoria || '—'}`,
    `Estado: ${p.ultimo_estado_invitacion || '—'}`,
    `Presentó cotización: ${p.presento_cotizacion ? 'Sí' : 'No'}`,
  ].join('\n');
  // Solo informativo: no deshabilita el checkbox ni impide reinvitar.
  return `<span class="badge bg-warning text-dark ms-1 sc-badge-ant" title="${esc(tip)}">INVITADO ANTERIORMENTE</span>`;
}

/**
 * @param {object} opts
 * @param {number} opts.solicitudId
 * @param {Function} [opts.onAdded] - callback after adding providers
 */
export function openSelectorProveedoresModal(opts = {}) {
  return new Promise((resolve) => {
    const state = {
      solicitudId: opts.solicitudId,
      rows: [],
      selected: new Set(),
      page: 1,
      totalPages: 1,
      total: 0,
      search: '',
      rubro: '',
      sort: 'razon_social',
      sortDir: 'asc',
      loading: false,
      debounce: null,
    };

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal fade" id="scProvSelectorModal" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header bg-primary text-white prov-draggable-header">
              <h5 class="modal-title"><i class="bi bi-search"></i> Selector Inteligente de Proveedores</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row g-2 mb-2 align-items-end">
                <div class="col-md-5">
                  <label class="form-label small fw-bold mb-0">Buscar proveedor</label>
                  <input type="text" class="form-control form-control-sm" id="spsSearch"
                    placeholder="RUC, razón social, contacto, correo, teléfono…" autocomplete="off">
                </div>
                <div class="col-md-3">
                  <label class="form-label small fw-bold mb-0">Rubro</label>
                  <select class="form-select form-select-sm" id="spsRubro">
                    <option value="">Todos los rubros</option>
                    ${RUBROS.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}
                  </select>
                </div>
                <div class="col-md-4 d-flex flex-wrap gap-1">
                  <button type="button" class="btn btn-sm btn-outline-primary" id="spsInvitarRubro">INVITAR POR RUBRO</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary" id="spsSelAll">Seleccionar todos</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary" id="spsDeselAll">Deseleccionar todos</button>
                </div>
              </div>
              <div class="d-flex flex-wrap gap-2 mb-2">
                <button type="button" class="btn btn-sm btn-success" id="spsAgregar"><i class="bi bi-plus-lg"></i> Agregar seleccionados</button>
                <button type="button" class="btn btn-sm btn-primary" id="spsNuevo"><i class="bi bi-person-plus"></i> Nuevo Proveedor</button>
                <span class="badge bg-info text-dark align-self-center" id="spsCount">0 resultados</span>
              </div>
              <div class="table-responsive border rounded" style="max-height:340px;overflow-y:auto;">
                <table class="table table-sm table-hover table-bordered mb-0">
                  <thead class="table-dark sticky-top">
                    <tr>
                      <th style="width:28px;"><input type="checkbox" id="spsCheckPage"></th>
                      <th class="sps-sort" data-sort="razon_social" style="cursor:pointer;">Proveedor</th>
                      <th class="sps-sort" data-sort="ruc" style="cursor:pointer;">RUC</th>
                      <th class="sps-sort" data-sort="correo" style="cursor:pointer;">Correo</th>
                      <th class="sps-sort" data-sort="telefono" style="cursor:pointer;">Teléfono</th>
                      <th>Persona Contacto</th>
                      <th class="sps-sort" data-sort="rubro" style="cursor:pointer;">Rubro</th>
                      <th class="sps-sort" data-sort="estado" style="cursor:pointer;">Estado</th>
                      <th class="sps-sort" data-sort="ultima_participacion" style="cursor:pointer;">Última Part.</th>
                    </tr>
                  </thead>
                  <tbody id="spsBody"><tr><td colspan="9" class="text-center text-muted py-3">Escriba para buscar proveedores…</td></tr></tbody>
                </table>
              </div>
              <div class="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2">
                <small class="text-muted" id="spsPagInfo"></small>
                <ul class="pagination pagination-sm mb-0" id="spsPag"></ul>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const modalEl = wrap.querySelector('#scProvSelectorModal');
    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static' });

    import('./proveedorShared.js').then(({ makeModalDraggable }) => makeModalDraggable(modalEl));

    async function fetchRows() {
      state.loading = true;
      try {
        const resp = await proveedoresMaestroService.buscar({
          search: state.search,
          rubro: state.rubro,
          page: state.page,
          pageSize: 50,
          sort: state.sort,
          sortDir: state.sortDir,
          estado: 'Activo',
        });
        state.rows = resp.data || [];
        state.total = resp.total || 0;
        state.totalPages = resp.totalPages || 1;
      } catch (e) {
        state.rows = [];
        state.total = 0;
        wrap.querySelector('#spsBody').innerHTML = `<tr><td colspan="9" class="text-danger small">${esc(e.message)}</td></tr>`;
      }
      state.loading = false;
      renderTable();
    }

    function renderTable() {
      const tb = wrap.querySelector('#spsBody');
      wrap.querySelector('#spsCount').textContent = `${state.total} resultado${state.total === 1 ? '' : 's'}`;
      if (!state.rows.length) {
        tb.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">Sin resultados</td></tr>';
      } else {
        tb.innerHTML = state.rows.map((p) => {
          const checked = state.selected.has(p.id) ? 'checked' : '';
          return `<tr data-pid="${p.id}">
            <td><input type="checkbox" class="sps-pick" data-id="${p.id}" ${checked}></td>
            <td>${esc(p.razon_social)}${badgeAnterior(p)}</td>
            <td>${esc(p.ruc)}</td>
            <td class="small">${esc(p.correo)}</td>
            <td>${esc(p.telefono)}</td>
            <td>${esc(p.persona_contacto)}</td>
            <td>${esc(p.rubro)}</td>
            <td><span class="badge bg-${p.estado === 'Activo' ? 'success' : 'secondary'}">${esc(p.estado)}</span></td>
            <td class="small">${fmtDt(p.ultima_participacion)}</td>
          </tr>`;
        }).join('');
      }
      const from = state.total ? (state.page - 1) * 50 + 1 : 0;
      const to = Math.min(state.page * 50, state.total);
      wrap.querySelector('#spsPagInfo').textContent = `Mostrando ${from}–${to} de ${state.total}`;
      let pag = '';
      for (let i = 1; i <= Math.min(state.totalPages, 7); i += 1) {
        pag += `<li class="page-item ${i === state.page ? 'active' : ''}"><a class="page-link sps-page" href="#" data-p="${i}">${i}</a></li>`;
      }
      wrap.querySelector('#spsPag').innerHTML = pag;
    }

    async function agregarSeleccionados(ids) {
      if (!ids.length) { alert('Seleccione al menos un proveedor'); return; }
      for (const proveedor_id of ids) {
        const p = state.rows.find((x) => x.id === proveedor_id)
          || { id: proveedor_id };
        await contratacionesService.agregarProveedorSolicitud(state.solicitudId, {
          proveedor_id,
          ruc: p.ruc,
          proveedor: p.razon_social,
          telefono: p.telefono,
          correo: p.correo,
          persona_contacto: p.persona_contacto,
          rubro: p.rubro,
        });
      }
      if (typeof opts.onAdded === 'function') opts.onAdded();
      resolve({ added: ids.length });
    }

    wrap.querySelector('#spsSearch').addEventListener('input', (e) => {
      clearTimeout(state.debounce);
      state.debounce = setTimeout(() => {
        state.search = e.target.value.trim();
        state.page = 1;
        fetchRows();
      }, 300);
    });

    wrap.querySelector('#spsRubro').addEventListener('change', (e) => {
      state.rubro = e.target.value;
      state.page = 1;
      fetchRows();
    });

    wrap.querySelectorAll('.sps-sort').forEach((th) => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (state.sort === col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sort = col; state.sortDir = 'asc'; }
        fetchRows();
      });
    });

    wrap.querySelector('#spsBody').addEventListener('change', (ev) => {
      const cb = ev.target.closest('.sps-pick');
      if (!cb) return;
      const id = parseInt(cb.dataset.id, 10);
      if (cb.checked) state.selected.add(id); else state.selected.delete(id);
    });

    wrap.querySelector('#spsCheckPage').addEventListener('change', (e) => {
      state.rows.forEach((p) => { if (e.target.checked) state.selected.add(p.id); else state.selected.delete(p.id); });
      wrap.querySelectorAll('.sps-pick').forEach((cb) => { cb.checked = e.target.checked; });
    });

    wrap.querySelector('#spsSelAll').onclick = () => {
      state.rows.forEach((p) => state.selected.add(p.id));
      wrap.querySelectorAll('.sps-pick').forEach((cb) => { cb.checked = true; });
    };
    wrap.querySelector('#spsDeselAll').onclick = () => {
      state.selected.clear();
      wrap.querySelectorAll('.sps-pick').forEach((cb) => { cb.checked = false; });
    };

    wrap.querySelector('#spsAgregar').onclick = async () => {
      try {
        await agregarSeleccionados([...state.selected]);
        modal.hide();
      } catch (err) { alert(err.message); }
    };

    wrap.querySelector('#spsInvitarRubro').onclick = async () => {
      const rubro = wrap.querySelector('#spsRubro').value;
      if (!rubro) { alert('Seleccione un rubro primero'); return; }
      state.rubro = rubro;
      state.search = '';
      state.page = 1;
      state.pageSize = 500;
      await fetchRows();
      state.rows.forEach((p) => state.selected.add(p.id));
      renderTable();
      wrap.querySelectorAll('.sps-pick').forEach((cb) => { cb.checked = true; });
      alert(`${state.rows.length} proveedor(es) del rubro "${rubro}" listados. Confirme con "Agregar seleccionados".`);
    };

    wrap.querySelector('#spsNuevo').onclick = () => {
      openNuevoProveedorModal({
        onSaved: async (proveedor) => {
          state.selected.add(proveedor.id);
          state.search = proveedor.ruc || proveedor.razon_social;
          wrap.querySelector('#spsSearch').value = state.search;
          state.page = 1;
          await fetchRows();
        },
      });
    };

    wrap.querySelector('#spsPag').addEventListener('click', (ev) => {
      const a = ev.target.closest('.sps-page');
      if (!a) return;
      ev.preventDefault();
      state.page = parseInt(a.dataset.p, 10);
      fetchRows();
    });

    modalEl.addEventListener('hidden.bs.modal', () => { wrap.remove(); resolve(null); }, { once: true });
    modal.show();
    fetchRows();
  });
}

export async function showHistorialProveedorModal(proveedorId, proveedorNombre = '') {
  const resp = await contratacionesService.getHistorialProveedor(proveedorId);
  const wrap = document.createElement('div');
  const invs = resp.invitaciones || [];
  const cots = resp.cotizaciones || [];
  const res = resp.resumen || {};
  wrap.innerHTML = `
    <div class="modal fade" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Historial — ${esc(proveedorNombre)}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body small">
        <div class="row g-2 mb-3">
          <div class="col-md-3"><strong>Invitaciones:</strong> ${res.cantidad_invitaciones ?? 0}</div>
          <div class="col-md-3"><strong>Cotizaciones:</strong> ${res.cantidad_cotizaciones ?? 0}</div>
          <div class="col-md-3"><strong>Última invitación:</strong> ${fmtDt(res.ultima_invitacion)}</div>
          <div class="col-md-3"><strong>Última cotización:</strong> ${fmtDt(res.ultima_cotizacion)}</div>
        </div>
        <h6 class="fw-bold">Invitaciones recientes</h6>
        <table class="table table-sm table-bordered mb-3"><thead><tr>
          <th>Convocatoria</th><th>Estado</th><th>Fecha envío</th></tr></thead><tbody>
          ${invs.slice(0, 10).map((i) => `<tr><td>${esc(i.convocatoria || '—')}</td><td>${esc(i.estado)}</td><td>${fmtDt(i.fecha_envio)}</td></tr>`).join('')
            || '<tr><td colspan="3" class="text-muted">Sin registros</td></tr>'}
        </tbody></table>
        <h6 class="fw-bold">Cotizaciones presentadas</h6>
        <table class="table table-sm table-bordered"><thead><tr>
          <th>Convocatoria</th><th>Fecha</th></tr></thead><tbody>
          ${cots.slice(0, 10).map((c) => `<tr><td>${esc(c.convocatoria || '—')}</td><td>${fmtDt(c.fecha_presentacion)}</td></tr>`).join('')
            || '<tr><td colspan="2" class="text-muted">Sin cotizaciones</td></tr>'}
        </tbody></table>
      </div>
    </div></div></div>`;
  document.body.appendChild(wrap);
  const m = window.bootstrap.Modal.getOrCreateInstance(wrap.firstElementChild);
  wrap.firstElementChild.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
  m.show();
}

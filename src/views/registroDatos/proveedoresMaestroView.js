// Maestro de Proveedores — bandeja CRUD con filtros, Excel e historial
import * as XLSX from 'xlsx';
import { proveedoresMaestroService } from '../../services/proveedoresMaestroService.js';

const PAGE_SIZE = 50;
const RUBROS = [
  'Medicamentos', 'Reactivos', 'Dispositivos Médicos', 'Equipos', 'Laboratorio',
  'Servicios', 'Consultoría', 'Locadores', 'Software', 'Mobiliario', 'Otros',
];
const ESTADOS = ['Activo', 'Inactivo', 'Bloqueado'];

const state = {
  rows: [],
  page: 1,
  total: 0,
  totalPages: 1,
  filters: {},
  rubros: RUBROS,
  editingId: null,
  deleteId: null,
  error: '',
};

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function fmtDate(v) {
  if (!v) return '—';
  return String(v).slice(0, 16).replace('T', ' ');
}

function renderRows() {
  if (state.error) {
    return `<tr><td colspan="12" class="text-center text-danger py-4">${esc(state.error)}</td></tr>`;
  }
  if (!state.rows.length) {
    return '<tr><td colspan="12" class="text-center text-muted py-4">No se encontraron proveedores</td></tr>';
  }
  return state.rows.map((p) => {
    const badge = p.estado === 'Activo' ? 'success' : (p.estado === 'Bloqueado' ? 'danger' : 'secondary');
    return `<tr>
      <td>${esc(p.ruc)}</td>
      <td>${esc(p.razon_social)}</td>
      <td class="small">${esc(p.correo)}</td>
      <td>${esc(p.telefono)}</td>
      <td>${esc(p.rubro)}</td>
      <td><span class="badge bg-${badge}">${esc(p.estado)}</span></td>
      <td class="small">${esc(p.origen_registro)}</td>
      <td class="small">${fmtDate(p.ultima_participacion)}</td>
      <td class="text-center">${p.cantidad_invitaciones ?? 0}</td>
      <td class="text-center">${p.cantidad_cotizaciones ?? 0}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-secondary pm-hist" data-id="${p.id}" title="Historial"><i class="bi bi-clock-history"></i></button>
      </td>
      <td class="text-center" style="white-space:nowrap;">
        <button class="btn btn-sm btn-outline-primary pm-edit" data-id="${p.id}"><i class="bi bi-pencil-square"></i></button>
        <button class="btn btn-sm btn-outline-danger pm-del" data-id="${p.id}"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function renderPagination() {
  const tp = Math.max(1, state.totalPages);
  if (tp <= 1) return '';
  let pages = '';
  for (let i = 1; i <= Math.min(tp, 7); i += 1) {
    pages += `<li class="page-item ${i === state.page ? 'active' : ''}">
      <a class="page-link pm-page" href="#" data-page="${i}">${i}</a></li>`;
  }
  return `<nav><ul class="pagination pagination-sm justify-content-center mb-0">
    <li class="page-item ${state.page <= 1 ? 'disabled' : ''}"><a class="page-link pm-page" data-page="${state.page - 1}" href="#">&laquo;</a></li>
    ${pages}
    <li class="page-item ${state.page >= tp ? 'disabled' : ''}"><a class="page-link pm-page" data-page="${state.page + 1}" href="#">&raquo;</a></li>
  </ul></nav>`;
}

function rubroOptions(selected = '') {
  return ['<option value="">— Seleccione —</option>']
    .concat(state.rubros.map((r) => `<option value="${esc(r)}" ${r === selected ? 'selected' : ''}>${esc(r)}</option>`))
    .join('');
}

function estadoOptions(selected = 'Activo') {
  return ESTADOS.map((e) => `<option value="${e}" ${e === selected ? 'selected' : ''}>${e}</option>`).join('');
}

export function renderProveedoresMaestroView() {
  return `
  <div class="dashboard-container">
    <div class="welcome-banner"><div class="welcome-banner-content">
      <h2><i class="bi bi-building"></i> Maestro de Proveedores</h2>
      <p>Base institucional de proveedores — alimentación automática desde el portal y procesos de cotización</p>
    </div></div>

    <div class="card mb-3"><div class="card-body">
      <div class="row g-2 mb-2">
        <div class="col-md-2"><input type="text" class="form-control form-control-sm pm-f" data-f="ruc" placeholder="RUC"></div>
        <div class="col-md-3"><input type="text" class="form-control form-control-sm pm-f" data-f="razon_social" placeholder="Razón Social"></div>
        <div class="col-md-2"><input type="text" class="form-control form-control-sm pm-f" data-f="correo" placeholder="Correo"></div>
        <div class="col-md-2"><input type="text" class="form-control form-control-sm pm-f" data-f="telefono" placeholder="Teléfono"></div>
        <div class="col-md-2"><select class="form-select form-select-sm pm-f" data-f="rubro"><option value="">Rubro</option>${rubroOptions()}</select></div>
        <div class="col-md-1"><select class="form-select form-select-sm pm-f" data-f="estado"><option value="">Estado</option>${estadoOptions('')}</select></div>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between">
        <div class="d-flex flex-wrap gap-2">
          <button class="btn btn-success btn-sm" id="pmNew"><i class="bi bi-plus-circle"></i> Nuevo</button>
          <label class="btn btn-outline-primary btn-sm mb-0" for="pmImport" style="cursor:pointer;"><i class="bi bi-file-earmark-arrow-up"></i> Importar Excel</label>
          <input type="file" id="pmImport" accept=".xlsx,.xls" style="display:none;">
          <button class="btn btn-outline-success btn-sm" id="pmExport"><i class="bi bi-file-earmark-arrow-down"></i> Exportar Excel</button>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm" id="pmSearch"><i class="bi bi-search"></i> Buscar</button>
          <button class="btn btn-outline-secondary btn-sm" id="pmClear"><i class="bi bi-x-lg"></i> Limpiar</button>
          <span class="badge bg-info text-dark align-self-center" id="pmTotal">0 registros</span>
        </div>
      </div>
    </div></div>

    <div class="card"><div class="card-body p-0"><div class="table-responsive">
      <table class="table table-hover table-bordered table-sm mb-0">
        <thead class="table-dark"><tr>
          <th>RUC</th><th>Razón Social</th><th>Correo</th><th>Teléfono</th><th>Rubro</th>
          <th>Estado</th><th>Origen</th><th>Última participación</th>
          <th class="text-center">Invit.</th><th class="text-center">Cotiz.</th><th></th><th style="width:90px;">Acciones</th>
        </tr></thead>
        <tbody id="pmBody"><tr><td colspan="12" class="text-center text-muted py-4">Cargando...</td></tr></tbody>
      </table>
    </div></div>
    <div class="card-footer d-flex justify-content-between align-items-center flex-wrap gap-2">
      <small class="text-muted" id="pmPagInfo"></small>
      <div id="pmPag"></div>
    </div></div>

    <div class="modal fade" id="pmModal" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
      <div class="modal-header bg-primary text-white">
        <h5 class="modal-title" id="pmModalTitle">Nuevo Proveedor</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body"><form id="pmForm"><div class="row g-3">
        <div class="col-md-4"><label class="form-label fw-bold">RUC *</label><input class="form-control" id="pmRuc" required maxlength="11"></div>
        <div class="col-md-8"><label class="form-label fw-bold">Razón Social *</label><input class="form-control" id="pmRazon" required></div>
        <div class="col-md-12"><label class="form-label fw-bold">Dirección</label><input class="form-control" id="pmDireccion"></div>
        <div class="col-md-4"><label class="form-label fw-bold">Correo *</label><input type="email" class="form-control" id="pmCorreo" required></div>
        <div class="col-md-4"><label class="form-label fw-bold">Teléfono</label><input class="form-control" id="pmTelefono"></div>
        <div class="col-md-4"><label class="form-label fw-bold">Persona de Contacto</label><input class="form-control" id="pmContacto"></div>
        <div class="col-md-6"><label class="form-label fw-bold">Rubro</label><select class="form-select" id="pmRubro">${rubroOptions()}</select></div>
        <div class="col-md-6"><label class="form-label fw-bold">Estado</label><select class="form-select" id="pmEstado">${estadoOptions()}</select></div>
      </div></form></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
        <button type="button" class="btn btn-primary" id="pmSave"><i class="bi bi-save"></i> Guardar</button>
      </div>
    </div></div></div>

    <div class="modal fade" id="pmDelModal" tabindex="-1"><div class="modal-dialog modal-sm"><div class="modal-content">
      <div class="modal-header bg-danger text-white"><h5 class="modal-title">Eliminar proveedor</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
      <div class="modal-body"><p>¿Eliminar lógicamente este proveedor?</p><p class="fw-bold" id="pmDelName"></p></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
        <button type="button" class="btn btn-danger" id="pmDelConfirm"><i class="bi bi-trash"></i> Eliminar</button>
      </div>
    </div></div></div>

    <div class="modal fade" id="pmHistModal" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Historial / Trazabilidad</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body" id="pmHistBody"></div>
    </div></div></div>
  </div>`;
}

async function fetchPage() {
  try {
    const resp = await proveedoresMaestroService.list({
      page: state.page,
      pageSize: PAGE_SIZE,
      ...state.filters,
    });
    state.rows = resp.data || [];
    state.total = resp.total || 0;
    state.totalPages = resp.totalPages || 1;
    state.error = '';
  } catch (e) {
    state.rows = [];
    state.total = 0;
    state.error = e.message || 'Error al cargar proveedores';
  }
}

function refreshTable() {
  document.getElementById('pmBody').innerHTML = renderRows();
  document.getElementById('pmPag').innerHTML = renderPagination();
  document.getElementById('pmTotal').textContent = `${state.total} registros`;
  const from = state.total ? (state.page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(state.page * PAGE_SIZE, state.total);
  document.getElementById('pmPagInfo').textContent = `Mostrando ${from}–${to} de ${state.total}`;
}

function collectFiltersFromDom() {
  const filters = {};
  document.querySelectorAll('.pm-f').forEach((el) => {
    const k = el.dataset.f;
    const v = el.value?.trim();
    if (v) filters[k] = v;
  });
  state.filters = filters;
}

function fillForm(p = {}) {
  document.getElementById('pmRuc').value = p.ruc || '';
  document.getElementById('pmRazon').value = p.razon_social || '';
  document.getElementById('pmDireccion').value = p.direccion || '';
  document.getElementById('pmCorreo').value = p.correo || '';
  document.getElementById('pmTelefono').value = p.telefono || '';
  document.getElementById('pmContacto').value = p.persona_contacto || '';
  document.getElementById('pmRubro').value = p.rubro || '';
  document.getElementById('pmEstado').value = p.estado || 'Activo';
}

function readForm() {
  return {
    ruc: document.getElementById('pmRuc').value.trim(),
    razon_social: document.getElementById('pmRazon').value.trim(),
    direccion: document.getElementById('pmDireccion').value.trim(),
    correo: document.getElementById('pmCorreo').value.trim(),
    telefono: document.getElementById('pmTelefono').value.trim(),
    persona_contacto: document.getElementById('pmContacto').value.trim(),
    rubro: document.getElementById('pmRubro').value,
    estado: document.getElementById('pmEstado').value,
  };
}

function openModal(id) {
  const modal = window.bootstrap.Modal.getOrCreateInstance(document.getElementById('pmModal'));
  modal.show();
  return modal;
}

export async function initProveedoresMaestroView() {
  try {
    const rubResp = await proveedoresMaestroService.getRubros();
    if (rubResp?.data?.length) state.rubros = rubResp.data;
  } catch (_) { /* defaults */ }

  await fetchPage();
  refreshTable();

  document.getElementById('pmSearch')?.addEventListener('click', async () => {
    collectFiltersFromDom();
    state.page = 1;
    await fetchPage();
    refreshTable();
  });

  document.getElementById('pmClear')?.addEventListener('click', async () => {
    document.querySelectorAll('.pm-f').forEach((el) => { el.value = ''; });
    state.filters = {};
    state.page = 1;
    await fetchPage();
    refreshTable();
  });

  document.getElementById('pmNew')?.addEventListener('click', () => {
    state.editingId = null;
    document.getElementById('pmModalTitle').textContent = 'Nuevo Proveedor';
    fillForm({});
    openModal();
  });

  document.getElementById('pmSave')?.addEventListener('click', async () => {
    try {
      const body = readForm();
      if (state.editingId) await proveedoresMaestroService.update(state.editingId, body);
      else await proveedoresMaestroService.create(body);
      window.bootstrap.Modal.getInstance(document.getElementById('pmModal'))?.hide();
      await fetchPage();
      refreshTable();
    } catch (e) { alert(e.message); }
  });

  document.getElementById('pmBody')?.addEventListener('click', async (ev) => {
    const editBtn = ev.target.closest('.pm-edit');
    const delBtn = ev.target.closest('.pm-del');
    const histBtn = ev.target.closest('.pm-hist');
    const pageLink = ev.target.closest('.pm-page');
    if (pageLink) {
      ev.preventDefault();
      const p = parseInt(pageLink.dataset.page, 10);
      if (p >= 1 && p <= state.totalPages) {
        state.page = p;
        await fetchPage();
        refreshTable();
      }
      return;
    }
    if (editBtn) {
      const row = state.rows.find((r) => String(r.id) === editBtn.dataset.id);
      if (!row) return;
      state.editingId = row.id;
      document.getElementById('pmModalTitle').textContent = 'Editar Proveedor';
      fillForm(row);
      openModal();
    }
    if (delBtn) {
      const row = state.rows.find((r) => String(r.id) === delBtn.dataset.id);
      if (!row) return;
      state.deleteId = row.id;
      document.getElementById('pmDelName').textContent = `${row.ruc} — ${row.razon_social}`;
      window.bootstrap.Modal.getOrCreateInstance(document.getElementById('pmDelModal')).show();
    }
    if (histBtn) {
      const row = state.rows.find((r) => String(r.id) === histBtn.dataset.id);
      if (!row) return;
      const hist = row.historial || [];
      document.getElementById('pmHistBody').innerHTML = hist.length
        ? `<table class="table table-sm table-bordered"><thead><tr><th>Fecha</th><th>Hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>${
          hist.map((h) => `<tr><td>${esc(h.fecha || '')}</td><td>${esc(h.hora || '')}</td><td>${esc(h.usuario || '')}</td><td>${esc(h.accion || '')}</td><td>${esc(h.detalle || '')}</td></tr>`).join('')
        }</tbody></table>`
        : '<p class="text-muted mb-0">Sin registros de trazabilidad.</p>';
      window.bootstrap.Modal.getOrCreateInstance(document.getElementById('pmHistModal')).show();
    }
  });

  document.getElementById('pmDelConfirm')?.addEventListener('click', async () => {
    try {
      await proveedoresMaestroService.remove(state.deleteId);
      window.bootstrap.Modal.getInstance(document.getElementById('pmDelModal'))?.hide();
      await fetchPage();
      refreshTable();
    } catch (e) { alert(e.message); }
  });

  document.getElementById('pmExport')?.addEventListener('click', async () => {
    try {
      const resp = await proveedoresMaestroService.list({ ...state.filters, page: 1, pageSize: 5000 });
      const rows = (resp.data || []).map((p) => ({
        RUC: p.ruc,
        'Razón Social': p.razon_social,
        Dirección: p.direccion,
        Correo: p.correo,
        Teléfono: p.telefono,
        'Persona Contacto': p.persona_contacto,
        Rubro: p.rubro,
        Estado: p.estado,
        Origen: p.origen_registro,
        'Última participación': p.ultima_participacion || '',
        Invitaciones: p.cantidad_invitaciones ?? 0,
        Cotizaciones: p.cantidad_cotizaciones ?? 0,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Proveedores');
      XLSX.writeFile(wb, `proveedores_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { alert(e.message); }
  });

  document.getElementById('pmImport')?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
      const resp = await proveedoresMaestroService.importRows(rows);
      alert(`Importación: ${resp.insertados} nuevos, ${resp.actualizados} actualizados${resp.errores?.length ? `, ${resp.errores.length} errores` : ''}.`);
      await fetchPage();
      refreshTable();
    } catch (e) { alert(e.message); }
  });
}

/** Modal reutilizable para registrar proveedor desde Invitaciones */
export async function openNuevoProveedorModal({ onSaved } = {}) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="pmQuickModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
      <div class="modal-header bg-primary text-white"><h5 class="modal-title">Nuevo Proveedor</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
      <div class="modal-body"><div class="row g-2">
        <div class="col-4"><label class="form-label small fw-bold">RUC *</label><input class="form-control form-control-sm" id="pmqRuc"></div>
        <div class="col-8"><label class="form-label small fw-bold">Razón Social *</label><input class="form-control form-control-sm" id="pmqRazon"></div>
        <div class="col-12"><label class="form-label small fw-bold">Dirección</label><input class="form-control form-control-sm" id="pmqDir"></div>
        <div class="col-6"><label class="form-label small fw-bold">Correo *</label><input class="form-control form-control-sm" id="pmqCorreo"></div>
        <div class="col-6"><label class="form-label small fw-bold">Teléfono</label><input class="form-control form-control-sm" id="pmqTel"></div>
        <div class="col-6"><label class="form-label small fw-bold">Persona Contacto</label><input class="form-control form-control-sm" id="pmqContacto"></div>
        <div class="col-6"><label class="form-label small fw-bold">Rubro</label><select class="form-select form-select-sm" id="pmqRubro">${rubroOptions()}</select></div>
      </div></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
        <button type="button" class="btn btn-primary btn-sm" id="pmqSave">Guardar</button>
      </div>
    </div></div></div>`;
  document.body.appendChild(wrap);
  const modalEl = wrap.querySelector('#pmQuickModal');
  const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
  modalEl.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
  wrap.querySelector('#pmqSave').onclick = async () => {
    try {
      const body = {
        ruc: wrap.querySelector('#pmqRuc').value.trim(),
        razon_social: wrap.querySelector('#pmqRazon').value.trim(),
        direccion: wrap.querySelector('#pmqDir').value.trim(),
        correo: wrap.querySelector('#pmqCorreo').value.trim(),
        telefono: wrap.querySelector('#pmqTel').value.trim(),
        persona_contacto: wrap.querySelector('#pmqContacto').value.trim(),
        rubro: wrap.querySelector('#pmqRubro').value,
      };
      const resp = await proveedoresMaestroService.create(body);
      modal.hide();
      if (typeof onSaved === 'function') onSaved(resp.proveedor);
    } catch (e) { alert(e.message); }
  };
  modal.show();
}

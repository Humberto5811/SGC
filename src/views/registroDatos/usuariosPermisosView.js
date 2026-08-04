// Mantenimiento → Usuarios y Permisos
import { authService } from '../../services/authService.js';
import { usuariosService } from '../../services/usuariosService.js';
import { readExcelFile, downloadUsuariosExcel } from '../../utils/usuariosExcel.js';
import { mountPermPanel, readPermisosFromPanel } from '../../components/PermisosPanel.js';
import { fmtDateTime, passwordStatusBadge } from '../../utils/authHelpers.js';
import {
  MODULOS, emptyPermisos, normalizePermisos, permisosFromRol,
} from '../../utils/permissionsCatalog.js';
import {
  resolveFunctionalProfiles,
  PERFILES_FUNCIONALES_LABELS,
} from '../../../server/utils/userRoleCatalog.js';
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtRol(rol) {
  const map = { admin: 'Administrador', usuario: 'Usuario', au: 'Área Usuaria', dec: 'DEC' };
  return map[rol] || rol || '—';
}

function fmtPerfilFuncional(usuario) {
  if (!usuario) return '—';
  const perfiles = resolveFunctionalProfiles({
    id: usuario.id,
    rol: usuario.rol || 'usuario',
    cargo: usuario.cargo || '',
    permisos: usuario.permisos || null,
    alcance_datos: usuario.alcance_datos || null,
  });
  return perfiles
    .map((p) => PERFILES_FUNCIONALES_LABELS[p] || p)
    .join(', ') || '—';
}

function areaCell(text) {
  const full = String(text || '').trim();
  if (!full) return '—';
  return `<span class="usu-col-area d-inline-block" title="${esc(full)}">${esc(full)}</span>`;
}

function fmtFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const PAGE_SIZE = 50;
const state = { rows: [], page: 1, total: 0, totalPages: 1, search: '', estadoFiltro: '', editing: null, formPermisos: emptyPermisos(), areaPick: null, permActiveMod: MODULOS[0]?.id || '' };

function renderPagination() {
  const tp = Math.max(1, state.totalPages);
  if (tp <= 1) {
    return `<div class="d-flex align-items-center gap-2 flex-wrap">
      <small class="text-muted">Página 1 de 1</small>
    </div>`;
  }
  const maxVisible = 7;
  let startP = Math.max(1, state.page - Math.floor(maxVisible / 2));
  let endP = Math.min(tp, startP + maxVisible - 1);
  if (endP - startP < maxVisible - 1) startP = Math.max(1, endP - maxVisible + 1);

  let pages = '';
  if (startP > 1) {
    pages += `<li class="page-item"><button type="button" class="page-link usu-page" data-page="1">1</button></li>`;
    if (startP > 2) pages += '<li class="page-item disabled"><span class="page-link">…</span></li>';
  }
  for (let i = startP; i <= endP; i++) {
    pages += `<li class="page-item ${i === state.page ? 'active' : ''}">
      <button type="button" class="page-link usu-page" data-page="${i}">${i}</button></li>`;
  }
  if (endP < tp) {
    if (endP < tp - 1) pages += '<li class="page-item disabled"><span class="page-link">…</span></li>';
    pages += `<li class="page-item"><button type="button" class="page-link usu-page" data-page="${tp}">${tp}</button></li>`;
  }

  return `
    <div class="d-flex align-items-center gap-3 flex-wrap justify-content-end">
      <small class="text-muted">Página ${state.page} de ${tp}</small>
      <nav aria-label="Paginación usuarios">
        <ul class="pagination pagination-sm mb-0">
          <li class="page-item ${state.page <= 1 ? 'disabled' : ''}">
            <button type="button" class="page-link usu-page" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>&laquo;</button>
          </li>
          ${pages}
          <li class="page-item ${state.page >= tp ? 'disabled' : ''}">
            <button type="button" class="page-link usu-page" data-page="${state.page + 1}" ${state.page >= tp ? 'disabled' : ''}>&raquo;</button>
          </li>
        </ul>
      </nav>
      <div class="d-flex align-items-center gap-1">
        <label class="small text-muted mb-0" for="usuGoPage">Ir a</label>
        <input type="number" class="form-control form-control-sm" id="usuGoPage" min="1" max="${tp}" value="${state.page}" style="width:4.5rem;">
        <button type="button" class="btn btn-sm btn-outline-secondary" id="usuGoPageBtn">Ir</button>
      </div>
    </div>`;
}

function bindPagination(wrap) {
  wrap.querySelectorAll('.usu-page').forEach((btn) => {
    btn.onclick = () => {
      const p = Number(btn.dataset.page);
      if (!p || p < 1 || p > state.totalPages || p === state.page) return;
      state.page = p;
      loadList();
    };
  });
  const goBtn = wrap.querySelector('#usuGoPageBtn');
  const goInput = wrap.querySelector('#usuGoPage');
  if (goBtn && goInput) {
    const go = () => {
      const p = parseInt(goInput.value, 10);
      if (!p || p < 1 || p > state.totalPages) {
        alert(`Ingrese un número de página entre 1 y ${state.totalPages}`);
        goInput.value = state.page;
        return;
      }
      if (p !== state.page) {
        state.page = p;
        loadList();
      }
    };
    goBtn.onclick = go;
    goInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
  }
}

function syncPermFromPanel(modal) {
  const wrap = modal?.querySelector?.('#permTreeWrap') || modal;
  if (wrap?.querySelector?.('.perm-panel')) {
    state.formPermisos = readPermisosFromPanel(wrap);
  }
}

function refreshPermPanel(wrap, permisos, onChange) {
  if (!wrap) return;
  state.permActiveMod = mountPermPanel(wrap, permisos, state.permActiveMod, onChange);
}

export function renderUsuariosPermisosView() {
  return `
    <style>
      #usuPermRoot .usu-list-table,
      #usuPermRoot .usu-list-table th,
      #usuPermRoot .usu-list-table td { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; font-weight: normal; }
      #usuPermRoot .usu-list-table .badge { font-size: 10pt !important; font-weight: normal !important; }
      #usuPermRoot .usu-list-table .btn { font-size: 10pt; }
      #usuPermRoot .usu-list-table .usu-col-area { max-width: 11rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; cursor: help; }
      #usuPermRoot .usu-list-table .usu-col-centro { max-width: 3.5rem; white-space: nowrap; text-align: center; }
      #usuPermRoot .usu-list-table .usu-col-rol { max-width: 4.5rem; white-space: nowrap; }
    </style>
    <div class="container-fluid" id="usuPermRoot">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-people-fill"></i> Usuarios y Permisos</h3>
          <p class="text-muted mb-0">Administración de usuarios, áreas y control de accesos por módulo.</p>
        </div>
        <div class="d-flex gap-2">
          <input type="file" id="usuImportFile" accept=".xlsx,.xls" class="d-none">
          <button class="btn btn-success btn-sm" id="usuImport"><i class="bi bi-file-earmark-arrow-up"></i> Importar Excel</button>
          <button class="btn btn-outline-success btn-sm" id="usuExport"><i class="bi bi-file-earmark-arrow-down"></i> Exportar Excel</button>
          <button class="btn btn-primary btn-sm" id="usuNuevo"><i class="bi bi-person-plus"></i> Nuevo Usuario</button>
        </div>
      </div>
      <div class="card mb-3"><div class="card-body py-2">
        <div class="row g-2 align-items-end">
          <div class="col-md-4"><label class="form-label small mb-0">Buscar</label>
            <input type="text" class="form-control form-control-sm" id="usuSearch" placeholder="DNI, nombres, correo, área, centro..."></div>
          <div class="col-md-2"><label class="form-label small mb-0">Estado</label>
            <select class="form-select form-select-sm" id="usuEstadoFiltro"><option value="">Todos</option><option>Activo</option><option>Inactivo</option></select></div>
          <div class="col-md-2"><button class="btn btn-sm btn-outline-secondary w-100" id="usuFiltrar"><i class="bi bi-search"></i> Filtrar</button></div>
        </div>
      </div></div>
      <div id="usuTableWrap"><div class="text-muted p-3">Cargando…</div></div>
    </div>`;
}

async function loadList() {
  const wrap = document.getElementById('usuTableWrap');
  if (!wrap) return;
  try {
    const resp = await usuariosService.list({ page: state.page, pageSize: PAGE_SIZE, search: state.search, estado: state.estadoFiltro });
    state.rows = resp.data || [];
    state.total = resp.total || 0;
    state.totalPages = resp.totalPages || 1;
    if (state.page > state.totalPages) {
      state.page = state.totalPages;
      return loadList();
    }
    const start = state.total > 0 ? (state.page - 1) * PAGE_SIZE + 1 : 0;
    const end = state.total > 0 ? Math.min(start + state.rows.length - 1, state.total) : 0;
    wrap.innerHTML = `
      <div class="card">
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-sm table-hover align-middle usu-list-table mb-0">
              <thead class="table-light"><tr>
                <th>Usuario</th><th>Apellidos</th><th>Nombres</th><th>Cargo</th>
                <th>Área Usuaria</th><th class="text-center">Centro</th><th>Correo</th><th>Rol</th>
                <th>Estado</th><th>Estado Contraseña</th>
                <th class="text-center">Accesos</th><th class="text-center">Acciones</th>
              </tr></thead>
              <tbody>
                ${state.rows.length ? state.rows.map((u) => `
                  <tr>
                    <td>${esc(u.username || u.dni)}</td>
                    <td>${esc(u.apellidos)}</td>
                    <td>${esc(u.nombres)}</td>
                    <td>${esc(u.cargo)}</td>
                    <td>${areaCell(u.descripcion_area)}</td>
                    <td class="usu-col-centro">${esc(u.centro || '—')}</td>
                    <td>${esc(u.email)}</td>
                    <td class="usu-col-rol">${esc(fmtRol(u.rol))}</td>
                    <td><span class="badge ${u.activo ? 'bg-success' : 'bg-secondary'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td>${passwordStatusBadge(u.estado_password)}</td>
                    <td class="text-center"><button type="button" class="btn btn-xs btn-outline-dark usu-ver-perm" data-id="${u.id}" title="Ver permisos">🔐</button></td>
                    <td class="text-center" style="white-space:nowrap;">
                      <button type="button" class="btn btn-xs btn-outline-primary usu-edit" data-id="${u.id}" title="Editar">✏</button>
                      <button type="button" class="btn btn-xs btn-outline-warning usu-reset-pwd" data-id="${u.id}" title="Restablecer contraseña">🔑</button>
                      <button type="button" class="btn btn-xs btn-outline-secondary usu-audit" data-id="${u.id}" title="Ver auditoría">📜</button>
                    </td>
                  </tr>
                `).join('') : '<tr><td colspan="12" class="text-center text-muted py-4">Sin registros</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card-footer d-flex justify-content-between align-items-center flex-wrap gap-2 py-2">
          <small class="text-muted" id="usuPagInfo">Mostrando ${start}-${end} de ${state.total} registros</small>
          <div id="usuPagControls">${renderPagination()}</div>
        </div>
      </div>`;
    bindPagination(wrap);
    wrap.querySelectorAll('.usu-edit').forEach((b) => b.onclick = () => openForm(Number(b.dataset.id)));
    wrap.querySelectorAll('.usu-reset-pwd').forEach((b) => b.onclick = () => openResetPasswordModal(Number(b.dataset.id)));
    wrap.querySelectorAll('.usu-audit').forEach((b) => b.onclick = () => openAuditModal(Number(b.dataset.id)));
    wrap.querySelectorAll('.usu-ver-perm').forEach((b) => b.onclick = () => openPermModal(Number(b.dataset.id)));
  } catch (e) {
    wrap.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

async function openAuditModal(id) {
  const u = state.rows.find((x) => x.id === id) || await usuariosService.get(id);
  const modal = document.createElement('div');
  modal.className = 'modal fade show d-block';
  modal.style.background = 'rgba(0,0,0,.4)';
  modal.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">📜 Auditoría — ${esc(u.username || u.dni)}</h5>
        <button type="button" class="btn-close" id="closeAudit"></button></div>
      <div class="modal-body small">
        <p><strong>Último acceso:</strong> ${esc(fmtDateTime(u.ultimo_acceso))}</p>
        <p><strong>Fecha cambio contraseña:</strong> ${esc(fmtDateTime(u.fecha_cambio_password))}</p>
        <hr/>
        ${(u.auditoria || []).length ? `<ul class="mb-0">${(u.auditoria || []).map((a) => `
          <li>${esc(fmtFecha(a.fecha))} ${esc(String(a.fecha || '').slice(11, 16))} — ${esc(a.usuario)}: ${esc(a.accion)}</li>`).join('')}</ul>`
          : '<p class="text-muted">Sin historial.</p>'}
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="cerrarAudit">Cerrar</button></div>
    </div></div>`;
  modal.querySelector('#closeAudit').onclick = () => modal.remove();
  modal.querySelector('#cerrarAudit').onclick = () => modal.remove();
  document.body.appendChild(modal);
}

function showCredentialsModal(mensaje, username) {
  const modal = document.createElement('div');
  modal.className = 'modal fade show d-block';
  modal.style.background = 'rgba(0,0,0,.45)';
  modal.innerHTML = `
    <div class="modal-dialog modal-lg"><div class="modal-content">
      <div class="modal-header bg-success text-white">
        <h5 class="modal-title"><i class="bi bi-envelope"></i> Credenciales de acceso</h5>
        <button type="button" class="btn-close btn-close-white" id="closeCred"></button>
      </div>
      <div class="modal-body">
        <p class="small text-muted">Copie el siguiente texto para enviar al usuario por correo (envío automático disponible en una fase posterior).</p>
        <textarea class="form-control font-monospace" id="credText" rows="12" readonly>${esc(mensaje)}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline-primary" id="copyCred"><i class="bi bi-clipboard"></i> Copiar</button>
        <button class="btn btn-secondary" id="cerrarCred">Cerrar</button>
      </div>
    </div></div>`;
  modal.querySelector('#closeCred').onclick = () => modal.remove();
  modal.querySelector('#cerrarCred').onclick = () => modal.remove();
  modal.querySelector('#copyCred').onclick = async () => {
    try {
      await navigator.clipboard.writeText(modal.querySelector('#credText').value);
      alert('Credenciales copiadas al portapapeles.');
    } catch (_) {
      modal.querySelector('#credText').select();
      document.execCommand('copy');
      alert('Credenciales copiadas.');
    }
  };
  document.body.appendChild(modal);
}

async function openResetPasswordModal(id) {
  const u = state.rows.find((x) => x.id === id) || await usuariosService.get(id);
  const modal = document.createElement('div');
  modal.className = 'modal fade show d-block';
  modal.style.background = 'rgba(0,0,0,.45)';
  modal.innerHTML = `
    <div class="modal-dialog"><div class="modal-content">
      <div class="modal-header bg-warning">
        <h5 class="modal-title">🔑 Restablecer contraseña — ${esc(u.username || u.dni)}</h5>
        <button type="button" class="btn-close" id="closeReset"></button>
      </div>
      <div class="modal-body">
        <p class="small text-muted">El usuario deberá cambiar esta contraseña temporal en su próximo ingreso.</p>
        <label class="form-label">Nueva contraseña temporal *</label>
        <input type="text" class="form-control" id="resetPwdTemp" value="${esc(u.username || u.dni)}" placeholder="Ej. hnizama">
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancelReset">Cancelar</button>
        <button class="btn btn-warning" id="saveReset">Restablecer</button>
      </div>
    </div></div>`;
  const close = () => modal.remove();
  modal.querySelector('#closeReset').onclick = close;
  modal.querySelector('#cancelReset').onclick = close;
  modal.querySelector('#saveReset').onclick = async () => {
    const temp = modal.querySelector('#resetPwdTemp').value.trim();
    if (!temp) return alert('Ingrese la contraseña temporal');
    try {
      const cu = authService.getCurrentUser() || {};
      const resp = await usuariosService.resetPassword(id, {
        password_temporal: temp,
        usuario_operacion: cu.nombre || cu.username || cu.dni || 'admin',
        system_url: window.location.origin + '/',
      });
      close();
      loadList();
      if (resp.credenciales?.mensaje) showCredentialsModal(resp.credenciales.mensaje, resp.credenciales.username);
      else alert('Contraseña restablecida. El usuario debe cambiarla en el próximo ingreso.');
    } catch (e) {
      alert(e.message);
    }
  };
  document.body.appendChild(modal);
}

async function openPermModal(id) {
  const u = state.rows.find((x) => x.id === id) || await usuariosService.get(id);
  const p = u.permisos || emptyPermisos();
  const modal = document.createElement('div');
  modal.className = 'modal fade show d-block';
  modal.style.background = 'rgba(0,0,0,.4)';
  modal.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">🔐 Permisos — ${esc(u.dni)} ${esc(u.nombres)}</h5><button type="button" class="btn-close" id="closePermView"></button></div>
      <div class="modal-body small">
        <p><strong>Módulos:</strong> ${(p.modulos || []).join(', ') || '—'}</p>
        <p><strong>Submódulos:</strong> ${(p.submodulos || []).join(', ') || '—'}</p>
        <p><strong>Actividades:</strong> ${(p.actividades || []).join(', ') || '—'}</p>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="cerrarPermView">Cerrar</button></div>
    </div></div>`;
  modal.querySelector('#closePermView').onclick = () => modal.remove();
  modal.querySelector('#cerrarPermView').onclick = () => modal.remove();
  document.body.appendChild(modal);
}

async function openForm(id) {
  let u = { dni: '', apellidos: '', nombres: '', email: '', telefono: '', cargo: '', rol: 'usuario', estado: 'Activo', permisos: emptyPermisos(), auditoria: [] };
  if (id) {
    u = await usuariosService.get(id);
  }
  state.editing = id;
  state.formPermisos = id && u.permisos
    ? normalizePermisos(u.permisos, u.rol, { explicit: true })
    : normalizePermisos(u.permisos, u.rol);
  state.areaPick = u.idArea ? {
    id_area: u.idArea,
    codigo_centro_costo: u.codigo_centro_costo,
    descripcion_area: u.descripcion_area,
    centro: u.centro || '',
  } : null;

  const modal = document.createElement('div');
  modal.className = 'modal fade show d-block';
  modal.style.background = 'rgba(0,0,0,.45)';
  modal.innerHTML = `
    <div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header bg-primary text-white">
        <h5 class="modal-title">${id ? 'Editar' : 'Nuevo'} Usuario</h5>
        <button type="button" class="btn-close btn-close-white" id="closeUsuForm"></button>
      </div>
      <div class="modal-body">
        <div id="usuSaveFeedback" class="alert alert-success d-none py-2 small mb-3" role="alert">
          <i class="bi bi-check-circle"></i> Permisos actualizados correctamente.
        </div>
        <style>
          #usuFormTabs .nav-link { cursor: pointer; border: none; background: transparent; color: #6c757d; }
          #usuFormTabs .nav-link.active { color: #0d6efd; font-weight: 600; border-bottom: 2px solid #0d6efd; border-radius: 0; }
          #usuFormTabs .nav-link:hover:not(.active) { color: #0d6efd; }
        </style>
        <ul class="nav nav-tabs mb-3" id="usuFormTabs" role="tablist">
          <li class="nav-item" role="presentation">
            <button type="button" class="nav-link active" data-tab="datos">Datos</button>
          </li>
          <li class="nav-item" role="presentation">
            <button type="button" class="nav-link" data-tab="accesos">Accesos</button>
          </li>
          ${id ? '<li class="nav-item" role="presentation"><button type="button" class="nav-link" data-tab="audit">Auditoría</button></li>' : ''}
        </ul>
        <div id="usuTabDatos">
          <div class="row g-2">
            <div class="col-md-3"><label class="form-label">DNI *</label><input class="form-control form-control-sm" id="fDni" value="${esc(u.dni)}"></div>
            <div class="col-md-3"><label class="form-label">Usuario (login) *</label><input class="form-control form-control-sm" id="fUsername" value="${esc(u.username || '')}" placeholder="Ej. hnizama" ${id ? '' : 'required'}></div>
            <div class="col-md-3"><label class="form-label">Apellidos *</label><input class="form-control form-control-sm" id="fApellidos" value="${esc(u.apellidos)}"></div>
            <div class="col-md-3"><label class="form-label">Nombres *</label><input class="form-control form-control-sm" id="fNombres" value="${esc(u.nombres)}"></div>
            <div class="col-md-3"><label class="form-label">Correo *</label><input type="email" class="form-control form-control-sm" id="fEmail" value="${esc(u.email)}"></div>
            <div class="col-md-3"><label class="form-label">Teléfono</label><input class="form-control form-control-sm" id="fTelefono" value="${esc(u.telefono)}"></div>
            <div class="col-md-3"><label class="form-label">Cargo *</label><input class="form-control form-control-sm" id="fCargo" value="${esc(u.cargo)}"></div>
            <div class="col-md-3"><label class="form-label">Rol sistema</label>
              <select class="form-select form-select-sm" id="fRol">
                <option value="usuario" ${u.rol === 'usuario' ? 'selected' : ''}>Usuario</option>
                <option value="au" ${u.rol === 'au' ? 'selected' : ''}>Área Usuaria</option>
                <option value="dec" ${u.rol === 'dec' ? 'selected' : ''}>DEC</option>
                <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Administrador</option>
              </select>
              <small class="text-muted d-block mt-1">Rol técnico de compatibilidad. La función operativa se configura mediante perfil, accesos y alcance.</small></div>
            <div class="col-md-3"><label class="form-label">Perfil funcional</label>
              <div class="form-control form-control-sm bg-light text-muted" style="cursor:default;" title="Perfil inferido automáticamente según el cargo y permisos del usuario. No editable en esta versión.">
                <i class="bi bi-person-badge"></i> ${esc(fmtPerfilFuncional(u))}
              </div>
              <small class="text-muted d-block mt-1">Perfil inferido automáticamente. No editable en esta versión.</small></div>
            <div class="col-md-3"><label class="form-label">Estado</label>
              <select class="form-select form-select-sm" id="fEstado"><option ${u.activo !== false ? 'selected' : ''}>Activo</option><option ${u.activo === false ? 'selected' : ''}>Inactivo</option></select></div>
            ${!id ? '<div class="col-md-3"><label class="form-label">Contraseña temporal *</label><input type="text" class="form-control form-control-sm" id="fPassword" placeholder="Ej. hnizama" required></div>' : ''}
            ${id ? `<div class="col-md-3"><label class="form-label">Estado contraseña</label><input class="form-control form-control-sm" readonly value="${esc(u.estado_password || '')}"></div>` : ''}
          </div>
          <hr/>
          <label class="form-label fw-bold">Área Usuaria / Centro de Costo</label>
          <div class="input-group mb-2">
            <input class="form-control form-control-sm" id="fAreaSearch" placeholder="Código centro o descripción área (mín. 2 caracteres)...">
            <button class="btn btn-outline-primary btn-sm" type="button" id="fAreaBtn"><i class="bi bi-search"></i></button>
          </div>
          <div id="fAreaResults"></div>
          <div class="row g-2 mt-2">
            <div class="col-md-4"><label class="form-label small">Área seleccionada</label><input class="form-control form-control-sm" id="fDescArea" readonly value="${esc(u.descripcion_area || '')}"></div>
            <div class="col-md-2"><label class="form-label small">Centro</label><input class="form-control form-control-sm" id="fCentro" readonly value="${esc(u.centro || '')}" placeholder="Ej. OA"></div>
            <div class="col-md-3"><label class="form-label small">Código centro de costo</label><input class="form-control form-control-sm" id="fCodCentro" readonly value="${esc(u.codigo_centro_costo || '')}" placeholder="Ej. 01.04.01.02.01"></div>
          </div>
        </div>
        <div id="usuTabAccesos" class="d-none">
          <div id="permTreeWrap"></div>
        </div>
        <div id="usuTabAudit" class="d-none">
          ${(u.auditoria || []).length ? `<ul class="small">${(u.auditoria || []).map((a) => `<li>${esc(fmtFecha(a.fecha))} — ${esc(a.usuario)}: ${esc(a.accion)}</li>`).join('')}</ul>` : '<p class="text-muted small">Sin historial.</p>'}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancelUsuForm">Cancelar</button>
        <button class="btn btn-primary" id="saveUsuForm"><i class="bi bi-save"></i> Guardar</button>
      </div>
    </div></div>`;

  const close = () => modal.remove();
  modal.querySelector('#closeUsuForm').onclick = close;
  modal.querySelector('#cancelUsuForm').onclick = close;

  const onPermChange = (p) => { state.formPermisos = p; };

  modal.querySelectorAll('#usuFormTabs .nav-link').forEach((tab) => {
    tab.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const prevTab = modal.querySelector('#usuFormTabs .nav-link.active')?.dataset?.tab;
      if (prevTab === 'accesos') syncPermFromPanel(modal);
      modal.querySelectorAll('#usuFormTabs .nav-link').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const t = tab.dataset.tab;
      modal.querySelector('#usuTabDatos').classList.toggle('d-none', t !== 'datos');
      modal.querySelector('#usuTabAccesos').classList.toggle('d-none', t !== 'accesos');
      if (t === 'accesos') {
        refreshPermPanel(modal.querySelector('#permTreeWrap'), state.formPermisos, onPermChange);
      }
      const audit = modal.querySelector('#usuTabAudit');
      if (audit) audit.classList.toggle('d-none', t !== 'audit');
    };
  });

  refreshPermPanel(modal.querySelector('#permTreeWrap'), state.formPermisos, onPermChange);

  const areaResults = modal.querySelector('#fAreaResults');
  async function buscarArea() {
    const q = modal.querySelector('#fAreaSearch').value.trim();
    if (q.length < 2) return;
    try {
      const resp = await usuariosService.buscarArea(q);
      const list = resp.data || [];
      areaResults.innerHTML = list.length ? `<div class="list-group">${list.map((a) => `
        <button type="button" class="list-group-item list-group-item-action area-pick"
          data-id="${a.id_area}"
          data-desc="${esc(a.descripcion_area)}"
          data-centro="${esc(a.centro || a.responsable || '')}"
          data-codigo="${esc(a.codigo_centro_costo || a.codigo_area || '')}">
          <strong>${esc(a.descripcion_area)}</strong>
          <span class="text-muted small"> — Centro: ${esc(a.centro || a.responsable || '—')} | Código: ${esc(a.codigo_centro_costo || a.codigo_area || '—')}</span>
        </button>`).join('')}</div>` : '<p class="text-muted small">Sin resultados</p>';
      areaResults.querySelectorAll('.area-pick').forEach((b) => {
        b.onclick = () => {
          state.areaPick = {
            id_area: Number(b.dataset.id),
            codigo_centro_costo: b.dataset.codigo,
            descripcion_area: b.dataset.desc,
            centro: b.dataset.centro,
          };
          modal.querySelector('#fDescArea').value = b.dataset.desc;
          modal.querySelector('#fCentro').value = b.dataset.centro;
          modal.querySelector('#fCodCentro').value = b.dataset.codigo;
          areaResults.innerHTML = '';
          modal.querySelector('#fAreaSearch').value = '';
        };
      });
    } catch (err) {
      areaResults.innerHTML = `<p class="text-danger small">${esc(err.message)}</p>`;
    }
  }
  modal.querySelector('#fAreaBtn').onclick = buscarArea;
  modal.querySelector('#fAreaSearch').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarArea(); } };
  let areaTimer;
  modal.querySelector('#fAreaSearch').oninput = () => {
    clearTimeout(areaTimer);
    areaTimer = setTimeout(buscarArea, 350);
  };

  let prevRol = modal.querySelector('#fRol').value;
  modal.querySelector('#fRol').onchange = () => {
    syncPermFromPanel(modal);
    const newRol = modal.querySelector('#fRol').value;
    if (!confirm('¿Aplicar permisos predeterminados del rol seleccionado? Esto reemplazará la configuración actual de accesos.')) {
      modal.querySelector('#fRol').value = prevRol;
      return;
    }
    prevRol = newRol;
    state.formPermisos = permisosFromRol(newRol);
    refreshPermPanel(modal.querySelector('#permTreeWrap'), state.formPermisos, onPermChange);
  };

  if (!id) {
    state.formPermisos = permisosFromRol(modal.querySelector('#fRol').value);
    refreshPermPanel(modal.querySelector('#permTreeWrap'), state.formPermisos, onPermChange);
  }

  modal.querySelector('#saveUsuForm').onclick = async () => {
    syncPermFromPanel(modal);
    const permisos = state.formPermisos;
    const cu = authService.getCurrentUser() || {};
    const body = {
      dni: modal.querySelector('#fDni').value.trim(),
      username: modal.querySelector('#fUsername').value.trim().toLowerCase(),
      apellidos: modal.querySelector('#fApellidos').value.trim(),
      nombres: modal.querySelector('#fNombres').value.trim(),
      email: modal.querySelector('#fEmail').value.trim(),
      telefono: modal.querySelector('#fTelefono').value.trim(),
      cargo: modal.querySelector('#fCargo').value.trim(),
      rol: modal.querySelector('#fRol').value,
      estado: modal.querySelector('#fEstado').value,
      permisos,
      idArea: state.areaPick?.id_area || u.idArea || null,
      codigo_centro_costo: modal.querySelector('#fCodCentro').value.trim(),
      descripcion_area: modal.querySelector('#fDescArea').value.trim(),
      centro: modal.querySelector('#fCentro').value.trim(),
      usuario_operacion: cu.nombre || cu.username || cu.dni || 'admin',
      system_url: window.location.origin + '/',
    };
    const pwd = modal.querySelector('#fPassword');
    if (pwd) {
      body.password = pwd.value.trim();
      if (!body.password) return alert('La contraseña temporal es obligatoria');
    }
    if (!body.username) return alert('El usuario (login) es obligatorio');
    if (!body.email || !body.nombres || !body.apellidos || !body.cargo) {
      return alert('Complete los campos obligatorios: correo, nombres, apellidos y cargo');
    }
    if (!body.descripcion_area && !body.idArea) return alert('Seleccione el área usuaria');
    const saveBtn = modal.querySelector('#saveUsuForm');
    const feedback = modal.querySelector('#usuSaveFeedback');
    try {
      saveBtn.disabled = true;
      if (id) {
        await usuariosService.update(id, body);
        const permResp = await usuariosService.getPermisos(id);
        const permisosGuardados = permResp?.permisos || permResp;
        state.formPermisos = normalizePermisos(permisosGuardados, body.rol, { explicit: true });
        const refreshed = await usuariosService.get(id);
        Object.assign(u, refreshed);
        refreshPermPanel(modal.querySelector('#permTreeWrap'), state.formPermisos, onPermChange);
        const session = authService.getCurrentUser();
        if (session && String(session.id) === String(id) && refreshed) {
          authService.setCurrentUser({ ...session, ...refreshed, permisos: state.formPermisos });
        }
        const activeTab = modal.querySelector('#usuFormTabs .nav-link.active')?.dataset?.tab;
        if (feedback) {
          const msg = activeTab === 'accesos'
            ? 'Permisos actualizados correctamente.'
            : 'Usuario actualizado correctamente.';
          feedback.classList.remove('d-none', 'alert-danger');
          feedback.classList.add('alert-success');
          feedback.innerHTML = `<i class="bi bi-check-circle"></i> ${msg}`;
        }
        if (activeTab === 'accesos') {
          modal.querySelectorAll('#usuFormTabs .nav-link').forEach((t) => t.classList.remove('active'));
          modal.querySelector('[data-tab="accesos"]')?.classList.add('active');
          modal.querySelector('#usuTabDatos').classList.add('d-none');
          modal.querySelector('#usuTabAccesos').classList.remove('d-none');
        }
        loadList();
      } else {
        const resp = await usuariosService.create(body);
        close();
        loadList();
        if (resp.credenciales?.mensaje) showCredentialsModal(resp.credenciales.mensaje, resp.credenciales.username);
      }
    } catch (e) {
      if (feedback) {
        feedback.classList.remove('d-none', 'alert-success');
        feedback.classList.add('alert-danger');
        feedback.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Error al guardar: ${esc(e.message)}`;
      } else {
        alert('Error: ' + e.message);
      }
    } finally {
      saveBtn.disabled = false;
    }
  };

  document.body.appendChild(modal);
}

async function toggleEstado(id, currentlyActive) {
  const nuevoEstado = currentlyActive ? 'Inactivo' : 'Activo';
  const msg = currentlyActive ? '¿Desactivar este usuario?' : '¿Activar este usuario?';
  if (!confirm(msg)) return;
  try {
    const cu = authService.getCurrentUser() || {};
    await usuariosService.setEstado(id, nuevoEstado, cu.nombre || cu.dni || 'admin');
    loadList();
  } catch (e) {
    alert(e.message);
  }
}

async function exportExcel() {
  try {
    const resp = await usuariosService.exportAll({ search: state.search, estado: state.estadoFiltro });
    const rows = resp.data || [];
    if (!rows.length) {
      alert('No hay registros para exportar.');
      return;
    }
    const fecha = new Date().toISOString().slice(0, 10);
    downloadUsuariosExcel(rows, `reporte_usuarios_${fecha}.xlsx`);
  } catch (e) {
    alert('Error al exportar: ' + e.message);
  }
}

async function importExcel(file) {
  if (!file) return;
  try {
    const parsed = await readExcelFile(file);
    if (!parsed.usuarios.length) {
      alert('No se encontraron registros válidos en el archivo.');
      return;
    }

    const preview = parsed.usuarios.slice(0, 5).map((u) => `${u.dni} — ${u.apellidos} ${u.nombres}`).join('\n');
    const msg = `Se importarán ${parsed.usuarios.length} registros.\n\nVista previa:\n${preview}${parsed.usuarios.length > 5 ? '\n...' : ''}\n\nSi el DNI ya existe, se actualizarán los datos.\nContraseña inicial para nuevos usuarios: su DNI.\n\n¿Continuar?`;
    if (!confirm(msg)) return;

    const cu = authService.getCurrentUser() || {};
    const result = await usuariosService.importBulk(parsed.usuarios, cu.nombre || cu.dni || 'admin');

    let resumen = `Importación completada.\n\nCreados: ${result.creados}\nActualizados: ${result.actualizados}`;
    if (parsed.errores?.length) resumen += `\nAdvertencias al leer Excel: ${parsed.errores.length}`;
    if (result.errores?.length) {
      resumen += `\nErrores al guardar: ${result.errores.length}\n`;
      resumen += result.errores.slice(0, 5).map((e) => `Fila ${e.fila}: ${e.error}`).join('\n');
    }
    alert(resumen);
    loadList();
  } catch (e) {
    alert('Error al importar: ' + e.message);
  }
}


export function initUsuariosPermisosView() {
  document.getElementById('usuNuevo')?.addEventListener('click', () => openForm(null));
  document.getElementById('usuExport')?.addEventListener('click', exportExcel);
  document.getElementById('usuImport')?.addEventListener('click', () => document.getElementById('usuImportFile')?.click());
  document.getElementById('usuImportFile')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importExcel(file);
    e.target.value = '';
  });
  document.getElementById('usuFiltrar')?.addEventListener('click', () => {
    state.search = document.getElementById('usuSearch')?.value.trim() || '';
    state.estadoFiltro = document.getElementById('usuEstadoFiltro')?.value || '';
    state.page = 1;
    loadList();
  });
  document.getElementById('usuSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('usuFiltrar')?.click();
    }
  });
  loadList();
}

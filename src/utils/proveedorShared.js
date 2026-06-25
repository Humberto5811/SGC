// Utilidades compartidas — Portal externo de Proveedores (separado del SGC)
import { portalService } from '../services/portalService.js';

export const PROVEEDOR_ROUTES = {
  login: 'proveedor/login',
  cambioPassword: 'proveedor/cambio-password',
  misInvitaciones: 'proveedor/mis-invitaciones',
  misConsultas: 'proveedor/mis-consultas',
  misCotizaciones: 'proveedor/mis-cotizaciones',
  estadoParticipacion: 'proveedor/estado-participacion',
};

export function isProveedorRoute(route) {
  return String(route || '').startsWith('proveedor/');
}

export function isProveedorPublicRoute(route) {
  return route === PROVEEDOR_ROUTES.login || route.startsWith('proveedor/invitacion/');
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtDt(v) {
  if (!v) return '—';
  return esc(String(v).slice(0, 16).replace('T', ' '));
}

/** Elimina backdrops huérfanos de Bootstrap que bloquean la interfaz. */
export function cleanupModalBackdrop() {
  document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
}

export function dismissProveedorModal(modalEl) {
  if (!modalEl) return;
  const inst = bootstrap.Modal.getInstance(modalEl);
  if (inst) inst.hide();
  setTimeout(cleanupModalBackdrop, 300);
}

/** Permite arrastrar un modal Bootstrap desde su cabecera. */
export function makeModalDraggable(modalEl) {
  const dialog = modalEl?.querySelector('.modal-dialog');
  const header = modalEl?.querySelector('.modal-header');
  if (!dialog || !header || header.dataset.draggableBound) return;
  header.dataset.draggableBound = '1';
  header.style.cursor = 'move';
  header.classList.add('user-select-none');

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const onMove = (e) => {
    if (!dragging) return;
    dialog.style.left = `${Math.max(0, e.clientX - offsetX)}px`;
    dialog.style.top = `${Math.max(0, e.clientY - offsetY)}px`;
  };
  const onUp = () => { dragging = false; };

  header.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('.btn-close')) return;
    dragging = true;
    const rect = dialog.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    dialog.style.margin = '0';
    dialog.style.position = 'fixed';
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    dialog.style.transform = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  modalEl.addEventListener('hidden.bs.modal', () => {
    dragging = false;
    dialog.style.position = '';
    dialog.style.left = '';
    dialog.style.top = '';
    dialog.style.margin = '';
    dialog.style.transform = '';
  });
}

export function getProveedorSession() {
  return portalService.getSession();
}

export function requireProveedorSession() {
  const s = getProveedorSession();
  if (!s?.id) {
    window.location.hash = '#/proveedor/login';
    return null;
  }
  if (s.debeCambiarPassword || s.primerIngreso) {
    const route = location.hash.replace(/^#\/?/, '');
    if (route !== PROVEEDOR_ROUTES.cambioPassword) {
      window.location.hash = '#/proveedor/cambio-password';
      return null;
    }
  }
  return s;
}

export function renderProveedorNav(active) {
  const items = [
    { route: PROVEEDOR_ROUTES.misInvitaciones, label: 'Mis Invitaciones', icon: 'bi-envelope-open' },
    { route: PROVEEDOR_ROUTES.misConsultas, label: 'Mis Consultas', icon: 'bi-chat-left-text' },
    { route: PROVEEDOR_ROUTES.misCotizaciones, label: 'Mis Cotizaciones', icon: 'bi-file-earmark-text' },
    { route: PROVEEDOR_ROUTES.estadoParticipacion, label: 'Estado de Participación', icon: 'bi-activity' },
  ];
  return `
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary mb-3 rounded shadow-sm">
      <div class="container-fluid">
        <span class="navbar-brand mb-0"><i class="bi bi-building"></i> Portal de Proveedores — SGC</span>
        <div class="navbar-nav ms-auto flex-row gap-1 flex-wrap">
          ${items.map((it) => `
            <a class="nav-link px-2 ${active === it.route ? 'active fw-bold' : ''}" href="#/${it.route}">
              <i class="bi ${it.icon}"></i> ${esc(it.label)}
            </a>`).join('')}
          <button type="button" class="btn btn-outline-light btn-sm ms-2" id="provBtnLogout">Salir</button>
        </div>
      </div>
    </nav>`;
}

export function bindProveedorLogout() {
  document.getElementById('provBtnLogout')?.addEventListener('click', () => {
    portalService.logout();
    window.location.hash = '#/proveedor/login';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

export function renderProveedorShell(activeRoute, bodyHtml, { showNav = true } = {}) {
  const session = getProveedorSession();
  return `
    <style>
      .proveedor-portal-page .navbar-dark .nav-link { color: rgba(255,255,255,.9) !important; }
      .proveedor-portal-page .navbar-dark .nav-link:hover { color: #fff !important; background: rgba(255,255,255,.12); border-radius: .375rem; }
      .proveedor-portal-page .navbar-dark .nav-link.active {
        background: #fff !important; color: #0d6efd !important;
        border-radius: .375rem; border-left: none !important; font-weight: 600;
      }
      .proveedor-portal-page .prov-doc-row:last-child { border-bottom: none !important; }
      .proveedor-portal-page .prov-wizard-step { opacity: .55; }
      .proveedor-portal-page .prov-wizard-step.active { opacity: 1; font-weight: 600; }
      .proveedor-portal-page .prov-wizard-step.done { opacity: 1; color: #198754; }
      .proveedor-portal-page .prov-cot-table { font-size: .78rem; }
      .proveedor-portal-page .prov-cot-table input,
      .proveedor-portal-page .prov-cot-table select { font-size: .75rem; min-width: 70px; }
      .proveedor-portal-page .prov-docs-col { min-width: 160px; max-width: 220px; vertical-align: top; }
      .proveedor-portal-page .prov-crono-wrap { min-width: min(100%, 420px); }
      .proveedor-portal-page .prov-crono-box { font-size: .78rem; line-height: 1.4; }
      .proveedor-portal-page .prov-crono-line { white-space: nowrap; }
      .proveedor-portal-page .prov-cot-top-compact .card-body { padding: .5rem .75rem; }
      .proveedor-portal-page .prov-upload-row { border: 1px dashed #ced4da; border-radius: .375rem; padding: .5rem; margin-bottom: .5rem; }
      .proveedor-portal-page .prov-step-panel { min-height: 200px; }
    </style>
    <div class="proveedor-portal-page min-vh-100" style="background:#eef2f7;padding:16px;">
      ${showNav && session ? renderProveedorNav(activeRoute) : ''}
      <div class="container-fluid px-0">${bodyHtml}</div>
    </div>`;
}

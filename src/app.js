import { initRouter, getCurrentRoute, isProveedorRoute } from './router.js';
import { storageService } from './services/storageService.js';
import { authService } from './services/authService.js';
import { permissionsService } from './services/permissionsService.js';
import { renderNavbar } from './components/Navbar.js';
import { renderSidebar, initSidebar } from './components/Sidebar.js';
import { renderFormBienesView, initFormBienesView } from './views/formBienesView.js';
import { renderFormatoBienesView, initFormatoBienesView } from './views/glosasRequerimientos/formatoBienesView.js';
import { renderFormatoServiciosView, initFormatoServiciosView } from './views/glosasRequerimientos/formatoServiciosView.js';
import { renderFormatoLocadoresView, initFormatoLocadoresView } from './views/glosasRequerimientos/formatoLocadoresView.js';
import { renderRegistroRequerimientoView, initRegistroRequerimientoView } from './views/requerimiento/registroRequerimientoView.js';
import { renderEvaluacionRequerimientoView, initEvaluacionRequerimientoView } from './views/requerimiento/evaluacionRequerimientoView.js';
import { cleanupCurrentView } from './utils/uiState/viewLifecycle.js';

const appEl = document.getElementById('app');

/** Evita renderApp duplicados (bootstrap + hashchange simultáneos). */
let renderAppSeq = 0;
let lastRenderedRoute = null;

async function renderProveedorApp(route) {
  cleanupCurrentView();
  let content = '';
  const tokenMatch = route.match(/^proveedor\/invitacion\/(.+)$/);
  try {
    if (tokenMatch) {
      const mod = await import('./views/proveedor/loginProveedorView.js');
      content = mod.renderInvitacionTokenView(tokenMatch[1]);
      appEl.innerHTML = content;
      setTimeout(() => mod.initInvitacionTokenView(tokenMatch[1]), 50);
      return;
    }
    if (route === 'proveedor/login') {
      const mod = await import('./views/proveedor/loginProveedorView.js');
      content = mod.renderLoginProveedorView();
      appEl.innerHTML = content;
      setTimeout(() => mod.initLoginProveedorView(), 50);
      return;
    }
    if (route === 'proveedor/cambio-password') {
      const mod = await import('./views/proveedor/cambioPasswordProveedorView.js');
      content = mod.renderCambioPasswordProveedorView();
      appEl.innerHTML = content;
      setTimeout(() => mod.initCambioPasswordProveedorView(), 50);
      return;
    }
    if (route === 'proveedor/mis-invitaciones') {
      const mod = await import('./views/proveedor/misInvitacionesView.js');
      content = mod.renderMisInvitacionesView();
      appEl.innerHTML = content;
      setTimeout(() => mod.initMisInvitacionesView(), 50);
      return;
    }
    if (route === 'proveedor/mis-consultas') {
      const mod = await import('./views/proveedor/misConsultasView.js');
      content = mod.renderMisConsultasView();
      appEl.innerHTML = content;
      setTimeout(() => mod.initMisConsultasView(), 50);
      return;
    }
    if (route === 'proveedor/mis-cotizaciones') {
      const mod = await import('./views/proveedor/misCotizacionesView.js');
      content = mod.renderMisCotizacionesView();
      appEl.innerHTML = content;
      setTimeout(() => mod.initMisCotizacionesView(), 50);
      return;
    }
    if (route === 'proveedor/estado-participacion') {
      const mod = await import('./views/proveedor/estadoParticipacionView.js');
      content = mod.renderEstadoParticipacionView();
      appEl.innerHTML = content;
      setTimeout(() => mod.initEstadoParticipacionView(), 50);
      return;
    }
    if (route === 'proveedor/ordenes-recibidas') {
      const mod = await import('./views/proveedor/ordenesProveedorView.js');
      content = mod.renderOrdenesProveedorView();
      appEl.innerHTML = content;
      setTimeout(() => mod.initOrdenesProveedorView(), 50);
      return;
    }
    window.location.hash = '#/proveedor/login';
  } catch (e) {
    appEl.innerHTML = `<div class="alert alert-danger m-4">${e.message}</div>`;
  }
}

async function renderApp() {
  const currentRoute = getCurrentRoute();
  const mySeq = ++renderAppSeq;

  if (isProveedorRoute(currentRoute)) {
    await renderProveedorApp(currentRoute);
    if (mySeq === renderAppSeq) {
      lastRenderedRoute = currentRoute;
      if (appEl) appEl.dataset.sgcRoute = currentRoute;
    }
    return;
  }

  const currentUser = authService.getCurrentUser();
  const isLoginRoute = currentRoute === 'login';
  const isCambioPasswordRoute = currentRoute === 'cambio-password';
  const isAuthScreen = isLoginRoute || isCambioPasswordRoute;
  window.__sgcPermissions = { permissionsService };

  if (currentUser?.debeCambiarPassword && !isCambioPasswordRoute) {
    window.location.hash = '#/cambio-password';
    return;
  }

  let accessDeniedBanner = '';
  const deniedMsg = sessionStorage.getItem('sgc_access_denied');
  if (deniedMsg) {
    accessDeniedBanner = `<div class="alert alert-warning alert-dismissible fade show" role="alert">
      <i class="bi bi-shield-exclamation"></i> ${deniedMsg}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
    </div>`;
    sessionStorage.removeItem('sgc_access_denied');
  }
  
  if (!currentUser && !isAuthScreen) {
    window.location.hash = '#/login';
    return;
  }

  // RC8.0 — cleanup de la vista anterior antes de destruir #app
  cleanupCurrentView();
  
  // Cargar vista según la ruta (incluyendo todas las subrutas)
  let content = '';
  try {
    if (currentRoute === 'login') {
      const loginModule = await import('./views/loginView.js');
      content = loginModule.renderLoginView();
      setTimeout(() => loginModule.initLoginView(), 50);
    }
    else if (currentRoute === 'cambio-password') {
      const cpModule = await import('./views/cambioPasswordView.js');
      content = cpModule.renderCambioPasswordView();
      setTimeout(() => cpModule.initCambioPasswordView(), 50);
    }
    // Dashboard
    else if (currentRoute === 'dashboard') {
      const dashboardModule = await import('./views/dashboardView.js');
      content = dashboardModule.renderDashboardView();
      setTimeout(() => dashboardModule.initDashboardView(), 50);
    }
    // ========== REGISTRO DE REQUERIMIENTOS (Formato Bienes v1) ==========
    else if (currentRoute === 'requerimientos' ||
             currentRoute === 'au/requerimientos/registro') {
      content = renderRegistroRequerimientoView();
      setTimeout(() => initRegistroRequerimientoView(), 50);
    }
    else if (currentRoute === 'au/requerimientos/evaluacion') {
      content = renderEvaluacionRequerimientoView();
      setTimeout(() => initEvaluacionRequerimientoView(), 50);
    }
    else if (currentRoute === 'requerimientos/nuevo/bienes') {
      content = renderFormBienesView();
      setTimeout(() => initFormBienesView(), 50);
    }
    // ========== CONTRATACIONES — DEC ==========
    else if (currentRoute === 'dec/dec') {
      const module = await import('./views/contratacion/decView.js');
      content = module.renderDecView();
      setTimeout(() => module.initDecView(), 50);
    }
    // ========== CONTRATACIONES — Programación ==========
    else if (currentRoute === 'dec/programacion' || currentRoute === 'au/programacion') {
      const module = await import('./views/programacion/programacionView2.js');
      content = module.renderProgramacionView();
      setTimeout(() => module.initProgramacionView(), 50);
    }
    // ========== CONTRATACIONES — Actos Preparatorios ==========
    else if (currentRoute === 'dec/actos' || currentRoute === 'contrataciones') {
      const module = await import('./views/contratacion/actosPreparativosView.js');
      content = module.renderActosPreparativosView();
      setTimeout(() => module.initActosPreparativosView(), 50);
    }
    // ========== CONTRATACIONES — submódulos ==========
    else if (currentRoute === 'dec/invitaciones') {
      const module = await import('./views/contratacion/invitacionesView.js');
      content = module.renderInvitacionesView();
      setTimeout(() => module.initInvitacionesView(), 50);
    }
    else if (currentRoute === 'contrataciones/consultas-observaciones' || currentRoute === 'dec/consultas') {
      const module = await import('./views/contratacion/consultasObservacionesView.js');
      content = module.renderConsultasObservacionesView();
      setTimeout(() => module.initConsultasObservacionesView(), 50);
    }
    else if (currentRoute === 'contrataciones/recepcion-cotizaciones' || currentRoute === 'dec/cotizaciones') {
      const module = await import('./views/contratacion/recepcionCotizacionesView.js');
      content = module.renderRecepcionCotizacionesView();
      setTimeout(() => module.initRecepcionCotizacionesView(), 50);
    }
    else if (currentRoute === 'contrataciones/validaciones') {
      const module = await import('./views/contratacion/validacionesView.js');
      content = module.renderValidacionesView();
      setTimeout(() => module.initValidacionesView(), 50);
    }
    else if (currentRoute === 'dec/ccp') {
      const module = await import('./views/contratacion/ccpView.js');
      content = module.renderCcpView();
      setTimeout(() => module.initCcpView(), 50);
    }
    else if (currentRoute === 'dec/registro-ordenes') {
      const module = await import('./views/contratacion/registroOrdenesView.js');
      content = module.renderRegistroOrdenesView();
      setTimeout(() => module.initRegistroOrdenesView(), 50);
    }
    else if (currentRoute === 'ejecucion/recepcion-bienes' || currentRoute === 'ejecucion/registro') {
      const module = await import('./views/ejecucion/recepcionBienesView.js');
      content = module.renderRecepcionBienesView();
      setTimeout(() => {
        if (mySeq !== renderAppSeq) return;
        module.initRecepcionBienesView();
      }, 50);
    }
    else if (currentRoute === 'dec/cuadro') {
      const module = await import('./views/contratacion/cuadroComparativoView.js');
      content = module.renderCuadroComparativoView();
      setTimeout(() => module.initCuadroComparativoView(), 50);
    }
    // ========== CONTRATACIONES (legacy placeholder) ==========
    else if (currentRoute === 'contrataciones/nuevo') {
      const module = await import('./views/contratacionesView.js');
      content = module.renderContratacionesView(currentRoute);
      setTimeout(() => module.initContratacionesView(currentRoute), 50);
    }
    // ========== EJECUCIÓN Y SUBRUTAS ==========
    else if (currentRoute === 'ejecucion' ||
             currentRoute === 'ejecucion/presentacion' ||
             currentRoute === 'ejecucion/ampliacion' ||
             currentRoute === 'ejecucion/pago') {
      const module = await import('./views/ejecucionView.js');
      content = module.renderEjecucionView(currentRoute);
      setTimeout(() => module.initEjecucionView(currentRoute), 50);
    }
    // ========== MANTENIMIENTO Y SUBRUTAS ==========
else if (currentRoute === 'mantenimiento/bienes') {
  content = renderFormatoBienesView();
  setTimeout(() => initFormatoBienesView(), 50);
}
else if (currentRoute === 'mantenimiento/servicios') {
  content = renderFormatoServiciosView();
  setTimeout(() => initFormatoServiciosView(), 50);
}
else if (currentRoute === 'mantenimiento/locacion') {
  content = renderFormatoLocadoresView();
  setTimeout(() => initFormatoLocadoresView(), 50);
}
else if (currentRoute === 'mantenimiento' || 
         currentRoute === 'mantenimiento/usuarios' ||
         currentRoute === 'mantenimiento/proveedores' ||
         currentRoute === 'mantenimiento/catalogo' ||
         currentRoute === 'mantenimiento/pedidos-sigamef' ||
         currentRoute === 'mantenimiento/configuracion' ||
         currentRoute === 'mantenimiento/metas' ||
         currentRoute === 'mantenimiento/ordenes' ||
         currentRoute === 'mantenimiento/siaf' ||
         currentRoute === 'mantenimiento/fichanet' ||
         currentRoute === 'mantenimiento/carreras' ||
         currentRoute === 'mantenimiento/servicios' ||
         currentRoute === 'mantenimiento/locacion' ||
         currentRoute === 'mantenimiento/licitaciones' ||
         currentRoute === 'mantenimiento/concurso' ||
         currentRoute === 'mantenimiento/logotipos' ||
         currentRoute === 'mantenimiento/entidad') {
  const module = await import('./views/mantenimientoView.js');
  content = module.renderMantenimientoView(currentRoute);
  setTimeout(() => module.initMantenimientoView(currentRoute), 50);
}
    // Vista genérica para rutas no implementadas
    else {
      content = `
        <div class="card">
          <div class="card-title">
            <i class="bi bi-tools"></i> Módulo en desarrollo
          </div>
          <p class="text-secondary">Vista: ${currentRoute}</p>
          <div class="alert alert-info">
            <i class="bi bi-info-circle"></i>
            Esta funcionalidad está siendo implementada.
          </div>
        </div>
      `;
    }
  } catch(e) {
    console.error('Error al cargar vista:', e);
    content = `
      <div class="card">
        <div class="card-title">
          <i class="bi bi-exclamation-triangle"></i> Error al cargar la página
        </div>
        <p class="text-secondary">Intente nuevamente más tarde.</p>
        <div class="alert alert-danger">
          <i class="bi bi-bug"></i>
          ${e.message}
        </div>
      </div>
    `;
  }
  
  if (mySeq !== renderAppSeq) return;

  const sidebarHtml = isAuthScreen ? '' : renderSidebar(currentRoute);
  const mainMargin = isAuthScreen ? '0' : '280px';
  
  appEl.innerHTML = `
    ${renderNavbar()}
    ${sidebarHtml}
    <main style="margin-left: ${mainMargin}; padding: 24px; transition: all 0.3s ease; min-height: 100vh; background: #f8f9fa;">
      <div class="container-fluid">
        ${accessDeniedBanner}
        ${content}
      </div>
    </main>
  `;
  lastRenderedRoute = currentRoute;
  appEl.dataset.sgcRoute = currentRoute;
  
  // Inicializar el sidebar (para que funcionen los clics en submenús)
  if (!isAuthScreen) {
    setTimeout(() => {
      if (mySeq !== renderAppSeq) return;
      if (typeof initSidebar === 'function') {
        initSidebar();
      }
      permissionsService.applyActivityButtons(document);
    }, 100);
  }
  
  // Configurar botón de logout global
  const logoutBtn = document.querySelector('[data-action="logout"]');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await authService.logout();
      lastRenderedRoute = null;
      window.location.hash = '#/login';
      renderApp();
    };
  }
  
  // Cerrar sidebar en móvil después de navegar
  if (window.innerWidth <= 768) {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }
  
  // Resaltar el item activo en el sidebar después de cargar
  highlightActiveMenuItem();
}

// Función para resaltar el item activo del menú
function highlightActiveMenuItem() {
  const currentRoute = getCurrentRoute();
  
  // Remover clase active de todos los items
  document.querySelectorAll('.nav-link, .nav-sublink').forEach(el => {
    el.classList.remove('active');
  });
  
  // Buscar y agregar clase active al elemento que coincide con la ruta
  document.querySelectorAll('.nav-link[data-route], .nav-sublink[data-route]').forEach(el => {
    if (el.dataset.route === currentRoute) {
      el.classList.add('active');
    }
  });
}

function bootstrap() {
  storageService.initialize();
  authService.restoreSession();
  // RC8.0 — una sola invocación inicial vía initRouter (evita doble renderApp).
  initRouter(() => renderApp());
  // RC8.6E — refrescar flags de asignación CCP; re-render solo si cambió el acceso menú
  const before = authService.getCurrentUser();
  authService.refreshSession().then((r) => {
    if (!r?.success) return;
    const after = r.user;
    const changed = (!!before?.acceso_ccp_por_asignacion) !== (!!after?.acceso_ccp_por_asignacion)
      || (!!before?.acceso_ccp) !== (!!after?.acceso_ccp)
      || before?.acceso_ccp_modo !== after?.acceso_ccp_modo;
    if (changed) renderApp();
  }).catch(() => {});
  // Drag & drop global: arrastre de modales Bootstrap desde el header
  import('./utils/modalDraggable.js').then((m) => m.initSgcModalDragging()).catch(() => {});
}

window.addEventListener('DOMContentLoaded', bootstrap);
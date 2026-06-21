import { initRouter, getCurrentRoute } from './router.js';
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

const appEl = document.getElementById('app');

async function renderApp() {
  const currentRoute = getCurrentRoute();
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
    // ========== CONTRATACIONES Y SUBRUTAS (legacy) ==========
    else if (currentRoute === 'contrataciones' || 
             currentRoute === 'dec/actos' ||
             currentRoute === 'dec/invitaciones' ||
             currentRoute === 'dec/consultas' ||
             currentRoute === 'dec/cotizaciones' ||
             currentRoute === 'dec/ccp' ||
             currentRoute === 'dec/cuadro') {
      const module = await import('./views/contratacionesView.js');
      content = module.renderContratacionesView(currentRoute);
      setTimeout(() => module.initContratacionesView(currentRoute), 50);
    }
    // ========== EJECUCIÓN Y SUBRUTAS ==========
    else if (currentRoute === 'ejecucion' || 
             currentRoute === 'ejecucion/registro' ||
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
  
  // Inicializar el sidebar (para que funcionen los clics en submenús)
  if (!isAuthScreen) {
    setTimeout(() => {
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
  initRouter(() => renderApp());
  renderApp();
}

window.addEventListener('DOMContentLoaded', bootstrap);
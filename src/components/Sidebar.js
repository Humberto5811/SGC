export function renderSidebar(currentRoute) {
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  const userRole = currentUser?.rol;

  function canShowRoute(path) {
    if (!path) return true;
    if (userRole === 'admin') return true;
    const { permissionsService } = window.__sgcPermissions || {};
    if (permissionsService?.canAccessRoute) return permissionsService.canAccessRoute(path);
    return true;
  }

  function filterMenuItems(items) {
    return items.map((item) => {
      if (item.submenu) {
        const submenu = filterMenuItems(item.submenu);
        if (!submenu.length) return null;
        return { ...item, submenu };
      }
      if (item.path && !canShowRoute(item.path)) return null;
      return item;
    }).filter(Boolean);
  }
  
  const menuStructure = [
    { path: 'dashboard', label: 'Dashboard', icon: 'bi-grid-3x3-gap-fill', roles: ['admin', 'au', 'dec', 'usuario'] },
    { 
      label: 'Requerimientos', icon: 'bi-file-text', roles: ['au', 'admin'],
      submenu: [
        { path: 'au/requerimientos/registro', label: 'Registro de Requerimientos', icon: 'bi-pencil-square' },
        { path: 'au/requerimientos/evaluacion', label: 'Evaluación de Requerimientos', icon: 'bi-check-circle' }
      ]
    },
    { 
      label: 'Contrataciones', icon: 'bi-cart-check', roles: ['dec', 'admin'],
      submenu: [
        { path: 'dec/dec', label: 'DEC', icon: 'bi-file-earmark-check' },
        { path: 'dec/programacion', label: 'Programación', icon: 'bi-calendar-check' },
        { path: 'dec/actos', label: 'Actos Preparativos', icon: 'bi-file-earmark-text' },
        { path: 'dec/invitaciones', label: 'Invitaciones', icon: 'bi-envelope' },
        { path: 'dec/consultas', label: 'Consultas', icon: 'bi-question-circle' },
        { path: 'dec/cotizaciones', label: 'Cotizaciones', icon: 'bi-calculator' },
        { path: 'dec/ccp', label: 'CCP', icon: 'bi-people' },
        { path: 'dec/cuadro', label: 'Cuadro Comparativo', icon: 'bi-table' }
      ]
    },
    { 
      label: 'Ejecución', icon: 'bi-graph-up', roles: ['dec', 'admin'],
      submenu: [
        { path: 'ejecucion/registro', label: 'Registro de Orden', icon: 'bi-clipboard-check' },
        { path: 'ejecucion/presentacion', label: 'Presentación Entregable', icon: 'bi-file-check' },
        { path: 'ejecucion/ampliacion', label: 'Ampliación Resolución', icon: 'bi-calendar-plus' },
        { path: 'ejecucion/pago', label: 'Derivación de Pago', icon: 'bi-credit-card' }
      ]
    },
    { 
      label: 'Mantenimiento', icon: 'bi-wrench', roles: ['admin'],
      submenu: [
        { 
          label: '📝 Registro de Datos',
          icon: 'bi-database',
          submenu: [
            { path: 'mantenimiento/usuarios', label: 'Usuarios y Permisos', icon: 'bi-people' },
            { path: 'mantenimiento/catalogo', label: 'Catálogo SIGAMEF', icon: 'bi-book' },
            { path: 'mantenimiento/pedidos-sigamef', label: 'Pedidos SIGAMEF', icon: 'bi-card-list' },
            { path: 'mantenimiento/configuracion', label: 'Configuración Documentaria', icon: 'bi-gear' },
            { path: 'mantenimiento/metas', label: 'Metas y Áreas', icon: 'bi-bullseye' },
            { path: 'mantenimiento/ordenes', label: 'Órdenes', icon: 'bi-receipt' },
            { path: 'mantenimiento/siaf', label: 'SIAF', icon: 'bi-bank' },
            { path: 'mantenimiento/fichanet', label: 'Ficha NET', icon: 'bi-file-earmark-medical' },
            { path: 'mantenimiento/carreras', label: 'Carreras Profesionales', icon: 'bi-mortarboard' }
          ]
        },
        { 
          label: '📑 Glosas de Requerimientos',
          icon: 'bi-file-text',
          submenu: [
            { path: 'mantenimiento/bienes', label: 'Formato Bienes', icon: 'bi-box' },
            { path: 'mantenimiento/servicios', label: 'Formato Servicios', icon: 'bi-tools' },
            { path: 'mantenimiento/locacion', label: 'Formato Locación', icon: 'bi-building' },
            { path: 'mantenimiento/licitaciones', label: 'Formato Licitaciones', icon: 'bi-hammer' },
            { path: 'mantenimiento/concurso', label: 'Formato Concurso', icon: 'bi-trophy' }
          ]
        },
        { 
          label: '🏛️ Institucional',
          icon: 'bi-building',
          submenu: [
            { path: 'mantenimiento/logotipos', label: 'Logotipos', icon: 'bi-image' },
            { path: 'mantenimiento/entidad', label: 'Datos de la Entidad', icon: 'bi-info-circle' }
          ]
        }
      ]
    }
  ];
  
  // Función para verificar si una ruta está activa o si algún subitem está activo
  function isRouteActive(itemPath, subitems) {
    if (currentRoute === itemPath) return true;
    if (subitems) {
      for (const sub of subitems) {
        if (sub.path && currentRoute === sub.path) return true;
        if (sub.submenu) {
          for (const sub2 of sub.submenu) {
            if (sub2.path && currentRoute === sub2.path) return true;
          }
        }
      }
    }
    return false;
  }
  
  // Función para verificar si un submenú debe estar abierto
  function shouldBeOpen(item) {
    if (item.path && currentRoute === item.path) return true;
    if (item.submenu) {
      for (const sub of item.submenu) {
        if (sub.path && currentRoute === sub.path) return true;
        if (sub.submenu) {
          for (const sub2 of sub.submenu) {
            if (sub2.path && currentRoute === sub2.path) return true;
          }
        }
      }
    }
    return false;
  }
  
  // Función para renderizar submenús anidados
  function renderNestedSubmenu(items, level = 0, parentId = '') {
    let html = `<ul class="nav-submenu level-${level}" data-parent="${parentId}" style="padding-left: ${level * 16}px;">`;
    for (const item of items) {
      if (item.submenu) {
        const isOpen = shouldBeOpen(item);
        const submenuId = `submenu_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        const hasActiveChild = shouldBeOpen(item);
        
        html += `<li class="nav-subitem">
          <div class="nav-sublink has-submenu" data-submenu="${submenuId}">
            <i class="bi ${item.icon || 'bi-folder'}"></i>
            <span>${item.label}</span>
            <i class="bi bi-chevron-down chevron-sub ${isOpen ? 'rotated' : ''}"></i>
          </div>
          <div id="${submenuId}" class="submenu-container" style="${isOpen ? 'display: block;' : 'display: none;'}">
            ${renderNestedSubmenu(item.submenu, level + 1, submenuId)}
          </div>
        </li>`;
      } else if (item.path) {
        const isActive = currentRoute === item.path;
        const activeClass = isActive ? 'active' : '';
        html += `<li class="nav-subitem">
          <div class="nav-sublink ${activeClass}" data-route="${item.path}">
            <i class="bi ${item.icon || 'bi-dot'}"></i>
            <span>${item.label}</span>
          </div>
        </li>`;
      }
    }
    html += '</ul>';
    return html;
  }
  
  // Construir el HTML completo del sidebar
  let html = `
    <div class="sidebar" style="width: 280px; position: fixed; top: 0; left: 0; height: 100vh; overflow-y: auto; background: linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%); box-shadow: 2px 0 8px rgba(0,0,0,0.05);">
      <div style="padding: 50px 16px 20px 16px; border-bottom: 1px solid #dadce0; margin-bottom: 8px;">
        <h4 style="margin: 0; font-weight: 600; background: linear-gradient(135deg, #1a73e8, #34a853); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
          <i class="bi bi-file-text" style="background: none; -webkit-text-fill-color: #1a73e8;"></i> SGC
        </h4>
        <small style="color: #5f6368; display: block; margin-top: 4px;">Sistema de Gestión de Contrataciones</small>
      </div>
      <nav style="padding: 0 12px 20px 12px;">
  `;
  
  for (const item of filterMenuItems(menuStructure)) {
    if (item.roles && !item.roles.includes(userRole)) continue;
    
    const hasSubmenu = item.submenu && item.submenu.length > 0;
    const isActive = isRouteActive(item.path, item.submenu);
    const isOpen = shouldBeOpen(item);
    const menuId = `menu_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    if (hasSubmenu) {
      html += `
        <div class="nav-item">
          <div class="nav-link ${isActive ? 'active' : ''}" data-menu="${menuId}">
            <i class="bi ${item.icon}"></i>
            <span>${item.label}</span>
            <i class="bi bi-chevron-down chevron ${isOpen ? 'rotated' : ''}"></i>
          </div>
          <div id="${menuId}" class="submenu-container" style="${isOpen ? 'display: block;' : 'display: none;'}">
            ${renderNestedSubmenu(item.submenu, 1, menuId)}
          </div>
        </div>
      `;
    } else {
      const activeClass = isActive ? 'active' : '';
      html += `
        <div class="nav-item">
          <div class="nav-link ${activeClass}" data-route="${item.path}">
            <i class="bi ${item.icon}"></i>
            <span>${item.label}</span>
          </div>
        </div>
      `;
    }
  }
  
  html += `
      </nav>
    </div>
  `;
  
  return html;
}

// Función para inicializar los eventos del sidebar (llamar después de renderizar)
export function initSidebar() {
  // Manejar clics en menús principales
  document.querySelectorAll('.nav-link[data-menu]').forEach(link => {
    link.removeEventListener('click', handleMainMenuClick);
    link.addEventListener('click', handleMainMenuClick);
  });
  
  // Manejar clics en submenús (primer nivel)
  document.querySelectorAll('.nav-sublink[data-submenu]').forEach(sublink => {
    sublink.removeEventListener('click', handleSubmenuClick);
    sublink.addEventListener('click', handleSubmenuClick);
  });
  
  // Manejar clics en items de navegación (sin submenú)
  document.querySelectorAll('.nav-link[data-route], .nav-sublink[data-route]').forEach(item => {
    item.removeEventListener('click', handleNavigationClick);
    item.addEventListener('click', handleNavigationClick);
  });
}

// Manejador para clic en menú principal - MODIFICADO: solo un submenú abierto a la vez
function handleMainMenuClick(e) {
  e.stopPropagation();
  const currentMenuId = this.dataset.menu;
  const currentSubmenu = document.getElementById(currentMenuId);
  const currentChevron = this.querySelector('.chevron');
  
  // Verificar si el submenú actual está visible
  const isCurrentlyVisible = currentSubmenu && currentSubmenu.style.display === 'block';
  
  // CERRAR TODOS LOS OTROS SUBMENÚS
  document.querySelectorAll('.nav-link[data-menu]').forEach(link => {
    const menuId = link.dataset.menu;
    const submenu = document.getElementById(menuId);
    const chevron = link.querySelector('.chevron');
    
    // Saltar el menú actual
    if (menuId === currentMenuId) return;
    
    // Cerrar otros submenús
    if (submenu && submenu.style.display === 'block') {
      submenu.style.display = 'none';
      if (chevron) chevron.classList.remove('rotated');
    }
  });
  
  // Abrir o cerrar el menú actual
  if (currentSubmenu) {
    if (isCurrentlyVisible) {
      // Cerrar el menú actual
      currentSubmenu.style.display = 'none';
      if (currentChevron) currentChevron.classList.remove('rotated');
    } else {
      // Abrir el menú actual
      currentSubmenu.style.display = 'block';
      if (currentChevron) currentChevron.classList.add('rotated');
    }
  }
}

// Manejador para clic en submenús (que tienen más submenús) - MODIFICADO: comportamiento similar
function handleSubmenuClick(e) {
  e.stopPropagation();
  const currentSubmenuId = this.dataset.submenu;
  const currentSubmenuContainer = document.getElementById(currentSubmenuId);
  const currentChevron = this.querySelector('.chevron-sub');
  
  // Verificar si el submenú actual está visible
  const isCurrentlyVisible = currentSubmenuContainer && currentSubmenuContainer.style.display === 'block';
  
  // Abrir o cerrar el submenú actual
  if (currentSubmenuContainer) {
    if (isCurrentlyVisible) {
      currentSubmenuContainer.style.display = 'none';
      if (currentChevron) currentChevron.classList.remove('rotated');
    } else {
      currentSubmenuContainer.style.display = 'block';
      if (currentChevron) currentChevron.classList.add('rotated');
    }
  }
}

// Manejador para clic en items de navegación
function handleNavigationClick(e) {
  e.stopPropagation();
  const route = this.dataset.route;
  if (route) {
    window.location.hash = `#/${route}`;
  }
}

// Exportar funciones globales para que funcionen los onclick
window.initSidebar = initSidebar;
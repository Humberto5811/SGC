export function renderSidebar(currentRoute) {
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  const userRole = currentUser?.rol;
  
  const menuStructure = [
    { path: 'dashboard', label: 'Dashboard', icon: '🏠', roles: ['admin', 'au', 'dec', 'usuario'] },
    { 
      label: 'Requerimientos', icon: '📋', roles: ['au', 'admin'],
      submenu: [
        { path: 'au/requerimientos/registro', label: 'Registro de Requerimientos' },
        { path: 'au/requerimientos/evaluacion', label: 'Evaluación de Requerimientos' }
      ]
    },
    { 
      label: 'Contrataciones', icon: '📄', roles: ['dec', 'admin'],
      submenu: [
        { path: 'dec/actos', label: 'Actos Preparativos' },
        { path: 'dec/invitaciones', label: 'Invitaciones' },
        { path: 'dec/consultas', label: 'Consultas' },
        { path: 'dec/cotizaciones', label: 'Cotizaciones' },
        { path: 'dec/ccp', label: 'CCP' },
        { path: 'dec/cuadro', label: 'Cuadro Comparativo' }
      ]
    },
    { 
      label: 'Ejecución', icon: '⚙️', roles: ['dec', 'admin'],
      submenu: [
        { path: 'ejecucion/registro', label: 'Registro de Orden' },
        { path: 'ejecucion/presentacion', label: 'Presentación Entregable' },
        { path: 'ejecucion/ampliacion', label: 'Ampliación Resolución' },
        { path: 'ejecucion/pago', label: 'Derivación de Pago' }
      ]
    },
    { 
      label: 'Mantenimiento', icon: '🔧', roles: ['admin'],
      submenu: [
        { 
          label: '📝 Registro de Datos',
          submenu: [
            { path: 'mantenimiento/usuarios', label: 'Usuarios y Permisos' },
            { path: 'mantenimiento/catalogo', label: 'Catálogo SIGAMEF' },
            { path: 'mantenimiento/fichas', label: 'Fichas Técnicas' },
            { path: 'mantenimiento/configuracion', label: 'Configuración Documentaria' },
            { path: 'mantenimiento/metas', label: 'Metas y Áreas' },
            { path: 'mantenimiento/ordenes', label: 'Órdenes' },
            { path: 'mantenimiento/siaf', label: 'SIAF' }
          ]
        },
        { 
          label: '📑 Glosas de Requerimientos',
          submenu: [
            { path: 'mantenimiento/bienes', label: 'Formato Bienes' },
            { path: 'mantenimiento/servicios', label: 'Formato Servicios' },
            { path: 'mantenimiento/locacion', label: 'Formato Locación' },
            { path: 'mantenimiento/licitaciones', label: 'Formato Licitaciones' },
            { path: 'mantenimiento/concurso', label: 'Formato Concurso' }
          ]
        },
        { 
          label: '🏛️ Institucional',
          submenu: [
            { path: 'mantenimiento/logotipos', label: 'Logotipos' },
            { path: 'mantenimiento/entidad', label: 'Datos de la Entidad' }
          ]
        }
      ]
    }
  ];
  
  function renderNestedSubmenu(items, level = 0) {
    let html = '<ul class="nav flex-column" style="padding-left: ' + (level * 15) + 'px;">';
    for (const item of items) {
      if (item.submenu) {
        const subId = 'sidemenu_' + Math.random().toString(36).substr(2, 8);
        html += `<li class="nav-item">
          <div class="nav-link text-white-50" style="cursor: pointer; font-size: 0.85em;" onclick="document.getElementById('${subId}').style.display = document.getElementById('${subId}').style.display === 'none' ? 'block' : 'none'">
            ${item.label} <span style="float: right;">▶</span>
          </div>
          <div id="${subId}" style="display: none;">
            ${renderNestedSubmenu(item.submenu, level + 1)}
          </div>
        </li>`;
      } else if (item.path) {
        const isActive = currentRoute === item.path;
        const activeClass = isActive ? 'active' : '';
        html += `<li class="nav-item">
          <a class="nav-link text-white-50 ${activeClass}" href="#/${item.path}" style="font-size: 0.85em; padding: 5px 10px;">
            • ${item.label}
          </a>
        </li>`;
      }
    }
    html += '</ul>';
    return html;
  }
  
  let html = '<div class="sidebar" style="position: fixed; top: 56px; left: 0; width: 280px; height: calc(100% - 56px); background-color: #343a40; overflow-y: auto;">';
  html += '<ul class="nav flex-column p-3">';
  
  for (const item of menuStructure) {
    if (item.roles && !item.roles.includes(userRole)) continue;
    
    if (item.submenu) {
      const menuId = 'mainmenu_' + Math.random().toString(36).substr(2, 8);
      html += `<li class="nav-item mb-2">
        <div class="nav-link text-white" style="cursor: pointer; font-weight: bold;" onclick="document.getElementById('${menuId}').style.display = document.getElementById('${menuId}').style.display === 'none' ? 'block' : 'none'">
          ${item.icon} ${item.label} <span style="float: right;">▶</span>
        </div>
        <div id="${menuId}" style="display: none;">
          ${renderNestedSubmenu(item.submenu, 1)}
        </div>
      </li>`;
    } else {
      const isActive = currentRoute === item.path;
      const activeClass = isActive ? 'active bg-primary' : '';
      html += `<li class="nav-item mb-2">
        <a class="nav-link text-white ${activeClass}" href="#/${item.path}">
          ${item.icon} ${item.label}
        </a>
      </li>`;
    }
  }
  
  html += '</ul></div>';
  html += '<style>.sidebar .nav-link.active { background-color: #0d6efd; border-radius: 5px; } .sidebar .nav-link:hover { background-color: #495057; border-radius: 5px; }</style>';
  
  return html;
}

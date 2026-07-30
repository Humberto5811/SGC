import { getMenuForUser } from '../services/menuService.js';

export function renderSidebar(currentRoute) {
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  const menuStructure = getMenuForUser(currentUser);

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

  function renderNestedSubmenu(items, level = 0, parentId = '') {
    let html = `<ul class="nav-submenu level-${level}" data-parent="${parentId}" style="padding-left: ${level * 16}px;">`;
    for (const item of items) {
      if (item.submenu) {
        const isOpen = shouldBeOpen(item);
        const submenuId = `submenu_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
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
        html += `<li class="nav-subitem">
          <div class="nav-sublink ${isActive ? 'active' : ''}" data-route="${item.path}">
            <i class="bi ${item.icon || 'bi-dot'}"></i>
            <span>${item.label}</span>
          </div>
        </li>`;
      }
    }
    html += '</ul>';
    return html;
  }

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

  for (const item of menuStructure) {
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
      html += `
        <div class="nav-item">
          <div class="nav-link ${isActive ? 'active' : ''}" data-route="${item.path}">
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

export function initSidebar() {
  document.querySelectorAll('.nav-link[data-menu]').forEach((link) => {
    link.removeEventListener('click', handleMainMenuClick);
    link.addEventListener('click', handleMainMenuClick);
  });

  document.querySelectorAll('.nav-sublink[data-submenu]').forEach((sublink) => {
    sublink.removeEventListener('click', handleSubmenuClick);
    sublink.addEventListener('click', handleSubmenuClick);
  });

  document.querySelectorAll('.nav-link[data-route], .nav-sublink[data-route]').forEach((item) => {
    item.removeEventListener('click', handleNavigationClick);
    item.addEventListener('click', handleNavigationClick);
  });
}

function handleMainMenuClick(e) {
  e.stopPropagation();
  const currentMenuId = this.dataset.menu;
  const currentSubmenu = document.getElementById(currentMenuId);
  const currentChevron = this.querySelector('.chevron');
  const isCurrentlyVisible = currentSubmenu && currentSubmenu.style.display === 'block';

  document.querySelectorAll('.nav-link[data-menu]').forEach((link) => {
    const menuId = link.dataset.menu;
    const submenu = document.getElementById(menuId);
    const chevron = link.querySelector('.chevron');
    if (menuId === currentMenuId) return;
    if (submenu && submenu.style.display === 'block') {
      submenu.style.display = 'none';
      if (chevron) chevron.classList.remove('rotated');
    }
  });

  if (currentSubmenu) {
    if (isCurrentlyVisible) {
      currentSubmenu.style.display = 'none';
      if (currentChevron) currentChevron.classList.remove('rotated');
    } else {
      currentSubmenu.style.display = 'block';
      if (currentChevron) currentChevron.classList.add('rotated');
    }
  }
}

function handleSubmenuClick(e) {
  e.stopPropagation();
  const currentSubmenuId = this.dataset.submenu;
  const currentSubmenuContainer = document.getElementById(currentSubmenuId);
  const currentChevron = this.querySelector('.chevron-sub');
  const isCurrentlyVisible = currentSubmenuContainer && currentSubmenuContainer.style.display === 'block';

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

function handleNavigationClick(e) {
  e.stopPropagation();
  const route = this.dataset.route;
  if (route) {
    window.location.hash = `#/${route}`;
  }
}

window.initSidebar = initSidebar;

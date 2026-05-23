// src/components/Sidebar.js
import { authService } from '../services/authService.js';

const menuItems = {
  ADMIN: [
    { href: '#/dashboard', icon: '📊', label: 'Dashboard' },
    { href: '#/admin/usuarios', icon: '👥', label: 'Usuarios' },
    { href: '#/au/requerimientos', icon: '📝', label: 'Requerimientos' },
    { href: '#/dec/contrataciones', icon: '📋', label: 'Contrataciones' },
    { href: '#/ejecucion', icon: '⚙️', label: 'Ejecución' },
    { href: '#/mantenimiento', icon: '🔧', label: 'Mantenimiento' }
  ],
  AU: [
    { href: '#/dashboard', icon: '📊', label: 'Dashboard' },
    { href: '#/au/requerimientos', icon: '📝', label: 'Mis Requerimientos' },
    { href: '#/au/requerimientos/nuevo', icon: '➕', label: 'Nuevo Requerimiento' },
    { href: '#/au/evaluacion', icon: '✅', label: 'Evaluación' }
  ],
  DEC: [
    { href: '#/dashboard', icon: '📊', label: 'Dashboard' },
    { href: '#/dec/contrataciones', icon: '📋', label: 'Contrataciones' },
    { href: '#/dec/invitaciones', icon: '✉️', label: 'Invitaciones' },
    { href: '#/dec/consultas', icon: '❓', label: 'Consultas' },
    { href: '#/dec/cotizaciones', icon: '💰', label: 'Cotizaciones' },
    { href: '#/dec/ccp', icon: '💵', label: 'CCP' }
  ],
  PROVEEDOR: [
    { href: '#/dashboard', icon: '📊', label: 'Dashboard' },
    { href: '#/proveedor/invitaciones', icon: '✉️', label: 'Invitaciones' },
    { href: '#/proveedor/consultas', icon: '❓', label: 'Consultas' },
    { href: '#/proveedor/cotizaciones', icon: '💰', label: 'Mis Cotizaciones' }
  ]
};

export function renderSidebar(currentRoute) {
  const user = authService.getCurrentUser();
  if (!user) return '';
  
  const role = user.rol;
  const items = menuItems[role] || [];
  
  const isActive = (href) => {
    const route = href.replace('#/', '');
    return currentRoute === route;
  };
  
  return `
    <div class="col-md-2 d-none d-md-block bg-dark vh-100" style="position: sticky; top: 0;">
      <div class="sidebar-sticky pt-3">
        <ul class="nav flex-column">
          ${items.map(item => `
            <li class="nav-item">
              <a class="nav-link ${isActive(item.href.replace('#/', '')) ? 'active bg-primary' : 'text-white'}" 
                 href="${item.href}">
                <span class="me-2">${item.icon}</span>
                 ${item.label}
              </a>
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
  `;
}

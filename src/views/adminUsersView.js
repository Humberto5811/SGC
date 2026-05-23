// src/views/adminUsuariosView.js
import * as userService from '../services/userService.js';

function renderAdminUsersView() {
  let users = [];
  if (typeof userService.list === 'function') {
    users = userService.list();
  } else if (typeof userService.findAll === 'function') {
    users = userService.findAll();
  } else if (typeof userService.getAll === 'function') {
    users = userService.getAll();
  } else {
    users = userService.default ? userService.default.list() : [];
  }

  const rows = users.map((user) => [user.dni, user.nombre, user.rol, user.email]);
  return `
    <div class="mb-4">
      <h1 class="h3">Administración de Usuarios</h1>
      <p class="text-muted">Gestione usuarios, roles y permisos.</p>
    </div>
    <div class="card shadow-sm mb-4">
      <div class="card-body">
        <button class="btn btn-success mb-3" id="addUserBtn">Agregar usuario</button>
        <div id="usersTable">${renderUsersTable(rows)}</div>
      </div>
    </div>
    <div id="userFormContainer"></div>
  `;
}

function renderUsersTable(rows) {
  const head = ['DNI', 'Nombre', 'Rol', 'Email', 'Acciones'];
  return `
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle">
        <thead class="table-light">
          <tr>${head.map((text) => `<th>${text}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map((columns) => `
            <tr>
              ${columns.map((col) => `<td>${col}</td>`).join('')}
              <td>
                <button class="btn btn-sm btn-warning editUserBtn" data-dni="${columns[0]}">Editar</button>
                <button class="btn btn-sm btn-danger deleteUserBtn" data-dni="${columns[0]}">Eliminar</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function bindAdminUsersActions() {
  const button = document.getElementById('addUserBtn');
  if (button) {
    button.addEventListener('click', () => showUserForm());
  }

  document.querySelectorAll('.editUserBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dni = btn.dataset.dni;
      const user = userService.list().find(u => u.dni === dni);
      if (user) showUserForm(user);
    });
  });

  document.querySelectorAll('.deleteUserBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dni = btn.dataset.dni;
      if (confirm(`¿Seguro que deseas eliminar al usuario con DNI ${dni}?`)) {
        if (typeof userService.remove === 'function') {
          userService.remove(dni);
        }
        location.reload();
      }
    });
  });
}

function showUserForm(user = null) {
  const container = document.getElementById('userFormContainer');
  const isEdit = !!user;

  // módulos y submódulos disponibles
  const modules = {
    dashboard: ['view'],
    'au/requerimientos': ['view','create','edit','delete'],
    'dec/contrataciones': ['view','create','edit','delete'],
    'admin/usuarios': ['view','create','edit','delete'],
    ejecucion: ['view','create','edit','delete'],
    mantenimiento: ['view','create','edit','delete']
  };

  // renderizar checkboxes de permisos
  const renderPermisos = () => {
    return Object.entries(modules).map(([mod, actions]) => `
      <div class="mb-2">
        <strong>${mod}</strong><br/>
        ${actions.map(action => `
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" 
              name="perm_${mod}_${action}" 
              ${user?.permisos?.[mod]?.includes(action) ? 'checked' : ''}/>
            <label class="form-check-label">${action}</label>
          </div>
        `).join('')}
      </div>
    `).join('');
  };

  container.innerHTML = `
    <div class="card shadow-sm">
      <div class="card-body">
        <h5>${isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h5>
        <form id="userForm">
          <div class="row">
            <div class="col-md-4 mb-3">
              <label class="form-label">DNI</label>
              <input class="form-control" name="dni" value="${user ? user.dni : ''}" ${isEdit ? 'readonly' : ''} required />
            </div>
            <div class="col-md-4 mb-3">
              <label class="form-label">Nombre</label>
              <input class="form-control" name="nombre" value="${user ? user.nombre : ''}" required />
            </div>
            <div class="col-md-4 mb-3">
              <label class="form-label">Email</label>
              <input type="email" class="form-control" name="email" value="${user ? user.email : ''}" required />
            </div>
          </div>
          <div class="row">
            <div class="col-md-4 mb-3">
              <label class="form-label">Rol</label>
              <select class="form-select" name="rol" required>
                <option value="ADMIN" ${user?.rol === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
                <option value="DEC" ${user?.rol === 'DEC' ? 'selected' : ''}>DEC</option>
                <option value="AU" ${user?.rol === 'AU' ? 'selected' : ''}>AU</option>
                <option value="PROVEEDOR" ${user?.rol === 'PROVEEDOR' ? 'selected' : ''}>PROVEEDOR</option>
              </select>
            </div>
            <div class="col-md-4 mb-3">
              <label class="form-label">Contraseña</label>
              <input type="password" class="form-control" name="password" ${isEdit ? '' : 'required'} />
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">Permisos</label>
            ${renderPermisos()}
          </div>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar cambios' : 'Guardar'}</button>
        </form>
      </div>
    </div>
  `;

  const form = document.getElementById('userForm');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      // construir objeto permisos desde checkboxes
      const permisos = {};
      Object.entries(modules).forEach(([mod, actions]) => {
        permisos[mod] = actions.filter(action => form[`perm_${mod}_${action}`]?.checked);
      });

      const userData = {
        dni: form.dni.value.trim(),
        nombre: form.nombre.value.trim(),
        email: form.email.value.trim(),
        rol: form.rol.value,
        password: form.password.value.trim(),
        permisos
      };

      if (isEdit && typeof userService.update === 'function') {
        userService.update(userData);
      } else if (!isEdit && typeof userService.create === 'function') {
        userService.create(userData);
      }
      location.reload();
    });
  }
}

function initAdminUsersView() {
  bindAdminUsersActions();
}

export { renderAdminUsersView, initAdminUsersView };

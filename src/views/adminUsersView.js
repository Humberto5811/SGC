function renderAdminUsersView() {
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  let tableRows = '';
  users.forEach(u => {
    tableRows += `<tr><td>${u.dni}</td><td>${u.nombre || ''}</td><td>${u.rol}</td><td>${u.email || ''}</td></tr>`;
  });
  return `<div class="container mt-4"><h2>Administraci?n de Usuarios</h2><table class="table table-striped"><thead><tr><th>DNI</th><th>Nombre</th><th>Rol</th><th>Email</th></tr></thead><tbody>${tableRows}</tbody></table></div>`;
}
function initAdminUsersView() { console.log("Admin Users inicializado"); }
export { renderAdminUsersView, initAdminUsersView };
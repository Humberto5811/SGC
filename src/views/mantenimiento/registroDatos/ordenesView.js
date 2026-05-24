function renderOrdenesView() {
  return `
    <h1 class="h3">Órdenes</h1>
    <p class="text-muted">Gestione las órdenes registradas en el sistema.</p>
    <button class="btn btn-success">Nueva Orden</button>
  `;
}

function initOrdenesView() {
  document.querySelector('.btn-success')?.addEventListener('click', () => {
    alert('Funcionalidad para crear nueva orden');
  });
}

export { renderOrdenesView, initOrdenesView };

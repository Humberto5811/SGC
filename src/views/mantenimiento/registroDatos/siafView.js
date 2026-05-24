function renderSiafView() {
  return `
    <h1 class="h3">SIAF</h1>
    <p class="text-muted">Integración y registros relacionados con el sistema SIAF.</p>
    <button class="btn btn-primary">Sincronizar con SIAF</button>
  `;
}

function initSiafView() {
  document.querySelector('.btn-primary')?.addEventListener('click', () => {
    alert('Sincronización con SIAF iniciada');
  });
}

export { renderSiafView, initSiafView };

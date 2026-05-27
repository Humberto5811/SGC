// Versión mínima para pruebas
export function renderCatalogosIGAMEF() {
  return `
    <div style="padding: 20px; background: white; border-radius: 8px;">
      <h1 style="color: #2c3e50;">📋 Catálogos IGAMEF</h1>
      <p>Módulo cargado exitosamente.</p>
      <button id="testBtn" class="btn btn-primary">Probar</button>
    </div>
  `;
}

export function initCatalogosIGAMEF() {
  console.log('✅ Catálogos IGAMEF inicializado correctamente');
  const btn = document.getElementById('testBtn');
  if (btn) {
    btn.onclick = () => alert('Funciona!');
  }
}

export default { renderCatalogosIGAMEF, initCatalogosIGAMEF };

// src/views/decContratacionesView.js
import { renderTable } from '../components/DataTable.js';
import { contratacionService } from '../services/contratacionService.js';

function renderDecContratacionesView() {
  const contrataciones = contratacionService.list();
  const rows = contrataciones.map((item) => [
    item.id,
    item.tipo || '-',
    item.estado || '-',
    new Date(item.createdAt).toLocaleDateString(),
  ]);

  return `
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3">Contrataciones - DEC</h1>
        <p class="text-muted">Cree, publique y gestione procesos de contratación.</p>
      </div>
      <button class="btn btn-primary" id="newContratacionBtn">Nueva contratación</button>
    </div>

    <div class="card shadow-sm mb-4">
      <div class="card-body">
        ${renderTable(['ID', 'Tipo', 'Estado', 'Creado'], rows)}
      </div>
    </div>

    <div id="contratacionFormContainer"></div>
  `;
}

function showContratacionForm() {
  const container = document.getElementById('contratacionFormContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="card shadow-sm mt-4">
      <div class="card-body">
        <h5 class="card-title">Nueva contratación</h5>
        <form id="contratacionForm">
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">Tipo de contratación</label>
              <select name="tipo" class="form-select" required>
                <option value="">Seleccione</option>
                <option value="CON_REQUERIMIENTO">Con requerimiento</option>
                <option value="SIN_REQUERIMIENTO">Sin requerimiento</option>
              </select>
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Descripción</label>
              <input name="descripcion" class="form-control" required />
            </div>
          </div>
          <button type="submit" class="btn btn-success">Guardar contratación</button>
        </form>
      </div>
    </div>
  `;

  const form = document.getElementById('contratacionForm');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const tipo = form.tipo.value;
      const descripcion = form.descripcion.value.trim();
      if (!tipo || !descripcion) return;

      contratacionService.create({
        tipo,
        descripcion,
        estado: 'BORRADOR',
        createdAt: Date.now()
      });

      // 🔹 Re-renderizamos la vista para actualizar la tabla
      const app = document.getElementById('app');
      if (app) {
        app.innerHTML = renderDecContratacionesView();
        initDecContratacionesView();
      }
    });
  }
}

function initDecContratacionesView() {
  const button = document.getElementById('newContratacionBtn');
  if (button) {
    button.addEventListener('click', () => showContratacionForm());
  }
}

export { renderDecContratacionesView, initDecContratacionesView };

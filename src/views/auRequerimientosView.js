// src/views/auRequerimientosView.js
import { renderTable } from '../components/DataTable.js';
import { requerimientoService } from '../services/requerimientoService.js';

// Subformularios
import { renderFormBienesView, initFormBienesView } from './formBienesView.js';
import { renderFormServiciosView, initFormServiciosView } from './formServiciosView.js';
import { renderFormLocacionView, initFormLocacionView } from './formLocacionView.js';

function renderAuRequerimientosView() {
  const requerimientos = requerimientoService.list();
  const rows = requerimientos.map((item) => [
    item.id,
    item.tipo || '-',
    item.denominacion || '-',
    item.estado,
    new Date(item.createdAt).toLocaleDateString(),
  ]);

  return `
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3">Requerimientos - Área Usuaria</h1>
        <p class="text-muted">Registre y gestione sus requerimientos de contratación.</p>
      </div>
      <button class="btn btn-primary" id="newRequerimientoBtn">Nuevo requerimiento</button>
    </div>

    <div class="card shadow-sm">
      <div class="card-body">
        ${renderTable(['ID', 'Tipo', 'Denominación', 'Estado', 'Creado'], rows)}
      </div>
    </div>

    <div class="card shadow-sm mt-4">
      <div class="card-body">
        <h5 class="card-title">Nuevo requerimiento</h5>
        <form id="requerimientoForm">
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label" for="tipo">Tipo de contratación</label>
              <select id="tipo" class="form-select" required>
                <option value="">Seleccione</option>
                <option value="BIENES">Bienes</option>
                <option value="SERVICIOS">Servicios</option>
                <option value="LOCACION">Locación</option>
              </select>
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label" for="denominacion">Denominación</label>
              <input id="denominacion" class="form-control" required />
            </div>
            <div class="col-md-12 mb-3">
              <label class="form-label" for="objetivo">Objetivo / Finalidad</label>
              <textarea id="objetivo" class="form-control" rows="3" required></textarea>
            </div>
          </div>
          <button type="submit" class="btn btn-success">Guardar requerimiento</button>
        </form>

        <!-- Contenedor donde se cargará el subformulario -->
        <div id="subformContainer" class="mt-4"></div>
      </div>
    </div>
  `;
}

function bindAuRequerimientosActions() {
  const newBtn = document.getElementById('newRequerimientoBtn');
  const form = document.getElementById('requerimientoForm');
  const tipoSelect = document.getElementById('tipo');

  if (newBtn) {
    newBtn.addEventListener('click', () => {
      tipoSelect.focus();
    });
  }

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const tipo = form.tipo.value;
      const denominacion = form.denominacion.value.trim();
      const objetivo = form.objetivo.value.trim();
      if (!tipo || !denominacion || !objetivo) return;

      requerimientoService.create({
        tipo,
        denominacion,
        objetivo,
        area: 'Área Usuaria',
        entregas: []
      });

      // 🔹 En lugar de recargar toda la página, re-renderizamos la vista
      const container = document.getElementById('app');
      if (container) {
        container.innerHTML = renderAuRequerimientosView();
        bindAuRequerimientosActions();
      }
    });
  }

  // Lógica para cargar subformularios según el tipo
  if (tipoSelect) {
    tipoSelect.addEventListener('change', () => {
      const container = document.getElementById('subformContainer');
      switch (tipoSelect.value) {
        case 'BIENES':
          container.innerHTML = renderFormBienesView();
          initFormBienesView();
          break;
        case 'SERVICIOS':
          container.innerHTML = renderFormServiciosView();
          initFormServiciosView();
          break;
        case 'LOCACION':
          container.innerHTML = renderFormLocacionView();
          initFormLocacionView();
          break;
        default:
          container.innerHTML = '';
      }
    });
  }
}

function initAuRequerimientosView() {
  bindAuRequerimientosActions();
}

export { renderAuRequerimientosView, initAuRequerimientosView };

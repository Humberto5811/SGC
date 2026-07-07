import { createCrudView } from './crudViewFactory.js';

// Este submódulo agrupa dos entidades: Metas y Áreas, en pestañas.
const metasView = createCrudView({
  resource: 'metas',
  title: 'Metas',
  icon: 'bi-bullseye',
  excel: true,
  importPath: '/metas/import',
  fields: [
    { name: 'codigo', label: 'Código', type: 'text', required: true, col: 4 },
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, col: 8 },
    { name: 'descripcion', label: 'Descripción', type: 'textarea', col: 12, rows: 2 },
    { name: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'], col: 4 },
  ],
  columns: [
    { name: 'codigo', label: 'Código', width: '140px' },
    { name: 'nombre', label: 'Nombre' },
    { name: 'estado', label: 'Estado', width: '100px' },
  ],
});

const areasView = createCrudView({
  resource: 'areas',
  title: 'Áreas',
  icon: 'bi-diagram-3',
  excel: true,
  importPath: '/areas/import',
  fields: [
    { name: 'codigo', label: 'Código', type: 'text', required: true, col: 4 },
    { name: 'nombre', label: 'Nombre del Área', type: 'text', required: true, col: 8 },
    { name: 'responsable', label: 'Responsable', type: 'text', col: 8 },
    { name: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'], col: 4 },
  ],
  columns: [
    { name: 'codigo', label: 'Código', width: '140px' },
    { name: 'nombre', label: 'Nombre' },
    { name: 'responsable', label: 'Responsable' },
    { name: 'estado', label: 'Estado', width: '100px' },
  ],
});

function renderMetasAreasView() {
  return `
    <div class="dashboard-container">
      <div class="welcome-banner"><div class="welcome-banner-content">
        <h2><i class="bi bi-bullseye"></i> Metas y Áreas</h2>
        <p>Gestión de metas presupuestales y áreas de la entidad</p>
      </div></div>
      <ul class="nav nav-tabs mb-3" id="metasAreasTabs" role="tablist">
        <li class="nav-item" role="presentation">
          <button class="nav-link active" id="tab-metas" data-bs-toggle="tab" data-bs-target="#pane-metas" type="button" role="tab">
            <i class="bi bi-bullseye"></i> Metas</button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="tab-areas" data-bs-toggle="tab" data-bs-target="#pane-areas" type="button" role="tab">
            <i class="bi bi-diagram-3"></i> Áreas</button>
        </li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="pane-metas" role="tabpanel">${metasView.render()}</div>
        <div class="tab-pane fade" id="pane-areas" role="tabpanel">${areasView.render()}</div>
      </div>
    </div>`;
}

function initMetasAreasView() {
  metasView.init();
  areasView.init();
}

export { renderMetasAreasView, initMetasAreasView };

import { createCrudView } from './crudViewFactory.js';

const view = createCrudView({
  resource: 'fichas',
  title: 'Fichas Técnicas',
  icon: 'bi-card-list',
  excel: true,
  fields: [
    { name: 'codigo', label: 'Código', type: 'text', required: true, col: 4 },
    { name: 'version', label: 'Versión', type: 'text', col: 4 },
    { name: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'], col: 4 },
    { name: 'descripcion', label: 'Descripción', type: 'textarea', col: 12, rows: 2 },
    { name: 'unidad_medida', label: 'Unidad de Medida', type: 'text', col: 6 },
    { name: 'observaciones', label: 'Observaciones', type: 'textarea', col: 12, rows: 2 },
  ],
  columns: [
    { name: 'codigo', label: 'Código', width: '140px' },
    { name: 'descripcion', label: 'Descripción' },
    { name: 'unidad_medida', label: 'Und. Medida', width: '120px' },
    { name: 'version', label: 'Versión', width: '90px' },
    { name: 'estado', label: 'Estado', width: '100px' },
  ],
});

const renderFichasTecnicasView = view.render;
const initFichasTecnicasView = view.init;
export { renderFichasTecnicasView, initFichasTecnicasView };

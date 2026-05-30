import { createCrudView } from './crudViewFactory.js';

const view = createCrudView({
  resource: 'configuracion',
  title: 'Configuración Documentaria',
  icon: 'bi-gear',
  excel: true,
  fields: [
    { name: 'objeto', label: 'Objeto', type: 'select', options: ['Bienes', 'Servicios', 'Obras', 'Consultoría'], col: 4 },
    { name: 'nombre', label: 'Nombre del Documento', type: 'text', required: true, col: 8 },
    { name: 'descripcion', label: 'Descripción', type: 'textarea', col: 12, rows: 2 },
    { name: 'obligatorio', label: 'Obligatorio', type: 'checkbox', col: 4 },
    { name: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'], col: 4 },
  ],
  columns: [
    { name: 'objeto', label: 'Objeto', width: '130px' },
    { name: 'nombre', label: 'Documento' },
    { name: 'obligatorio', label: 'Obligatorio', type: 'bool', width: '110px' },
    { name: 'estado', label: 'Estado', width: '100px' },
  ],
});

const renderConfiguracionDocView = view.render;
const initConfiguracionDocView = view.init;
export { renderConfiguracionDocView, initConfiguracionDocView };

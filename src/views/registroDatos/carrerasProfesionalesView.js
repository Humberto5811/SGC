import { createCrudView } from './crudViewFactory.js';

const view = createCrudView({
  resource: 'carreras',
  title: 'Carreras Profesionales',
  icon: 'bi-mortarboard',
  subtitle: 'Administración de Carreras Profesionales',
  excel: true,
  fields: [
    { name: 'nombre_carrera', label: 'Nombre de la Carrera', type: 'text', required: true, col: 8 },
    { name: 'tipo_carrera', label: 'Tipo de Carrera', type: 'select', options: ['Profesional', 'Técnico', 'Egresado', 'Secundaria'], required: true, col: 4 },
    { name: 'estado', label: 'Estado', type: 'checkbox', col: 4 },
  ],
  columns: [
    { name: 'nombre_carrera', label: 'Nombre de la Carrera' },
    { name: 'tipo_carrera', label: 'Tipo', width: '140px' },
    { name: 'estado', label: 'Estado', type: 'bool', width: '90px' },
  ],
});

const renderCarrerasProfesionalesView = view.render;
const initCarrerasProfesionalesView = view.init;
export { renderCarrerasProfesionalesView, initCarrerasProfesionalesView };
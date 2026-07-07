import { createCrudView } from './crudViewFactory.js';

const view = createCrudView({
  resource: 'ordenes',
  title: 'Órdenes',
  icon: 'bi-receipt',
  excel: true,
  importPath: '/ordenes/import',
  fields: [
    { name: 'numero', label: 'Número', type: 'text', required: true, col: 4 },
    { name: 'tipo', label: 'Tipo', type: 'select', options: ['Compra', 'Servicio'], col: 4 },
    { name: 'fecha', label: 'Fecha', type: 'date', col: 4 },
    { name: 'proveedor', label: 'Proveedor', type: 'text', col: 8 },
    { name: 'ruc', label: 'RUC', type: 'text', col: 4 },
    { name: 'monto', label: 'Monto', type: 'money', col: 4 },
    { name: 'estado', label: 'Estado', type: 'select', options: ['Registrado', 'Aprobado', 'Anulado'], col: 4 },
  ],
  columns: [
    { name: 'numero', label: 'Número', width: '120px' },
    { name: 'tipo', label: 'Tipo', width: '100px' },
    { name: 'proveedor', label: 'Proveedor' },
    { name: 'ruc', label: 'RUC', width: '120px' },
    { name: 'monto', label: 'Monto', type: 'money', width: '110px' },
    { name: 'fecha', label: 'Fecha', type: 'date', width: '110px' },
    { name: 'estado', label: 'Estado', width: '110px' },
  ],
});

const renderOrdenesView = view.render;
const initOrdenesView = view.init;
export { renderOrdenesView, initOrdenesView };

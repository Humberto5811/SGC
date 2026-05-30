import { createCrudView } from './crudViewFactory.js';

const view = createCrudView({
  resource: 'siaf',
  title: 'SIAF',
  icon: 'bi-bank',
  subtitle: 'Registros del Sistema Integrado de Administración Financiera',
  excel: true,
  fields: [
    { name: 'expediente', label: 'Expediente', type: 'text', required: true, col: 4 },
    { name: 'ciclo', label: 'Ciclo', type: 'select', options: ['Gasto', 'Ingreso'], col: 4 },
    { name: 'fase', label: 'Fase', type: 'select', options: ['Certificación', 'Compromiso', 'Devengado', 'Girado', 'Pagado'], col: 4 },
    { name: 'meta', label: 'Meta', type: 'text', col: 4 },
    { name: 'clasificador', label: 'Clasificador', type: 'text', col: 4 },
    { name: 'fuente_financ', label: 'Fuente de Financiamiento', type: 'text', col: 4 },
    { name: 'monto', label: 'Monto', type: 'money', col: 4 },
    { name: 'fecha', label: 'Fecha', type: 'date', col: 4 },
    { name: 'estado', label: 'Estado', type: 'select', options: ['Registrado', 'Aprobado', 'Anulado'], col: 4 },
  ],
  columns: [
    { name: 'expediente', label: 'Expediente', width: '130px' },
    { name: 'ciclo', label: 'Ciclo', width: '90px' },
    { name: 'fase', label: 'Fase', width: '120px' },
    { name: 'meta', label: 'Meta', width: '100px' },
    { name: 'clasificador', label: 'Clasificador' },
    { name: 'monto', label: 'Monto', type: 'money', width: '110px' },
    { name: 'estado', label: 'Estado', width: '110px' },
  ],
});

const renderSiafView = view.render;
const initSiafView = view.init;
export { renderSiafView, initSiafView };

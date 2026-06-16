// =====================================================
// Pedidos SIGAMEF — Vista CRUD con Import/Export Excel
// Reutiliza crudViewFactory. Auto-genera codigo_pedido (PED-000001).
// TOTAL_ITEM se calcula automáticamente en el backend.
// =====================================================
import { createCrudView } from './crudViewFactory.js';

const FIELDS = [
  // Datos Generales
  { name: 'ano_eje', label: 'Año Ejecución', col: 3, required: true },
  { name: 'tipo', label: 'Tipo', type: 'select', options: ['B', 'S'], col: 3, required: true },
  { name: 'nro_pedido', label: 'Número Pedido', col: 3, required: true },
  { name: 'centro', label: 'Centro', col: 3 },
  { name: 'centro_costo', label: 'Centro Costo', col: 4 },
  { name: 'fecha_pedido', label: 'Fecha Pedido', type: 'date', col: 4 },
  { name: 'fuente_fto', label: 'Fuente Financiamiento', col: 4 },
  { name: 'sec_func', label: 'Secuencia Funcional', col: 4 },
  // Datos del Item
  { name: 'grupo_bien', label: 'Grupo Bien', col: 4 },
  { name: 'clase_bien', label: 'Clase Bien', col: 4 },
  { name: 'familia_bien', label: 'Familia Bien', col: 4 },
  { name: 'item_bien', label: 'Item Bien', col: 4 },
  { name: 'codigo_sigamef', label: 'Código SIGAMEF', col: 4, required: true },
  { name: 'descripcion', label: 'Descripción', type: 'textarea', rows: 2, col: 12, required: true },
  { name: 'especifica', label: 'Específica', col: 4 },
  { name: 'unidad_medida', label: 'Unidad Medida', col: 4 },
  // Datos Económicos
  { name: 'cant_solicitada', label: 'Cantidad Solicitada', type: 'number', col: 4 },
  { name: 'precio_unitario', label: 'Precio Unitario', type: 'money', col: 4 },
  // Estado
  { name: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'], col: 4 },
];

const COLUMNS = [
  { name: 'codigo_pedido', label: 'Código Pedido', width: '120px' },
  { name: 'ano_eje', label: 'Año', width: '60px' },
  { name: 'tipo', label: 'Tipo', width: '55px' },
  { name: 'nro_pedido', label: 'Nro Pedido', width: '100px' },
  { name: 'centro', label: 'Centro', width: '90px' },
  { name: 'centro_costo', label: 'Centro Costo', width: '100px' },
  { name: 'fecha_pedido', label: 'Fecha Pedido', width: '100px', type: 'date' },
  { name: 'grupo_bien', label: 'Grupo Bien', width: '90px' },
  { name: 'descripcion', label: 'Descripción' },
  { name: 'cant_solicitada', label: 'Cantidad', width: '85px', type: 'money' },
  { name: 'precio_unitario', label: 'P. Unit.', width: '90px', type: 'money' },
  { name: 'total_item', label: 'Total Item', width: '100px', type: 'money' },
  { name: 'estado', label: 'Estado', width: '75px' },
];

const view = createCrudView({
  resource: 'pedidos-sigamef',
  title: 'Pedidos SIGAMEF',
  icon: 'bi-card-list',
  subtitle: 'Gestión de Pedidos SIGAMEF — importar/exportar Excel y CRUD',
  fields: FIELDS,
  columns: COLUMNS,
  excel: true,
  importPath: '/pedidos-sigamef/import',
});

export const renderPedidosSigamefView = view.render;
export const initPedidosSigamefView = view.init;

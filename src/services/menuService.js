// Menú principal SGC — fuente única de rutas visibles (Contrataciones reorganizado)
import { permissionsService } from './permissionsService.js';
import { LEGACY_ROUTE_REDIRECTS, resolveCanonicalRoute } from '../utils/permissionsCatalog.js';

/** Submódulos Contrataciones en orden funcional del flujo. */
export const CONTRATACIONES_SUBMENU = [
  { path: 'dec/dec', label: 'DEC', icon: 'bi-file-earmark-check', submoduloId: 'DEC' },
  { path: 'dec/programacion', label: 'Programación', icon: 'bi-calendar-check', submoduloId: 'PROGRAMACION' },
  { path: 'dec/actos', label: 'Coordinación CM', icon: 'bi-file-earmark-text', submoduloId: 'ACTOS_PREPARATORIOS' },
  { path: 'dec/invitaciones', label: 'Invitaciones', icon: 'bi-envelope', submoduloId: 'INVITACIONES' },
  { path: 'contrataciones/consultas-observaciones', label: 'Consultas y Observaciones', icon: 'bi-chat-square-text', submoduloId: 'CONSULTAS_OBSERVACIONES' },
  { path: 'contrataciones/recepcion-cotizaciones', label: 'Recepción de Cotizaciones', icon: 'bi-inbox', submoduloId: 'RECEPCION_COTIZACIONES' },
  { path: 'contrataciones/validaciones', label: 'Validaciones', icon: 'bi-shield-check', submoduloId: 'VALIDACIONES' },
  { path: 'dec/cuadro', label: 'Cuadro Comparativo', icon: 'bi-table', submoduloId: 'CUADRO_COMPARATIVO' },
  { path: 'dec/ccp', label: 'CCP', icon: 'bi-people', submoduloId: 'CCP' },
];

/** Rutas legacy → misma ruta canónica (compatibilidad). */
export { LEGACY_ROUTE_REDIRECTS, resolveCanonicalRoute } from '../utils/permissionsCatalog.js';

export const MENU_STRUCTURE = [
  { path: 'dashboard', label: 'Dashboard', icon: 'bi-grid-3x3-gap-fill', roles: ['admin', 'au', 'dec', 'usuario'] },
  {
    label: 'Requerimientos',
    icon: 'bi-file-text',
    roles: ['au', 'admin'],
    submenu: [
      { path: 'au/requerimientos/registro', label: 'Registro de Requerimientos', icon: 'bi-pencil-square', submoduloId: 'REGISTRO_REQUERIMIENTO' },
      { path: 'au/requerimientos/evaluacion', label: 'Evaluación de Requerimientos', icon: 'bi-check-circle', submoduloId: 'EVALUACION_REQUERIMIENTO' },
    ],
  },
  {
    label: 'Contrataciones',
    icon: 'bi-cart-check',
    roles: ['dec', 'admin'],
    submenu: CONTRATACIONES_SUBMENU,
  },
  {
    label: 'Ejecución',
    icon: 'bi-graph-up',
    roles: ['dec', 'admin'],
    submenu: [
      { path: 'ejecucion/registro', label: 'Registro de Orden', icon: 'bi-clipboard-check', submoduloId: 'REGISTRO_ORDEN' },
      { path: 'ejecucion/presentacion', label: 'Presentación Entregable', icon: 'bi-file-check', submoduloId: 'ALMACEN' },
      { path: 'ejecucion/ampliacion', label: 'Ampliación Resolución', icon: 'bi-calendar-plus', submoduloId: 'AMPLIACION' },
      { path: 'ejecucion/pago', label: 'Derivación de Pago', icon: 'bi-credit-card', submoduloId: 'TESORERIA' },
    ],
  },
  {
    label: 'Portal de Proveedores',
    icon: 'bi-building',
    roles: ['dec', 'admin', 'au', 'usuario'],
    path: 'portal-proveedores',
  },
  {
    label: 'Mantenimiento',
    icon: 'bi-wrench',
    roles: ['admin'],
    submenu: [
      {
        label: 'Administración',
        icon: 'bi-gear',
        submenu: [
          { path: 'mantenimiento/entidad', label: 'Entidad', icon: 'bi-info-circle', submoduloId: 'ENTIDAD' },
          { path: 'mantenimiento/logotipos', label: 'Logotipo', icon: 'bi-image', submoduloId: 'LOGOTIPOS' },
          { path: 'mantenimiento/configuracion', label: 'Configuración por Entidad', icon: 'bi-gear', submoduloId: 'CONFIGURACION' },
        ],
      },
      { path: 'mantenimiento/proveedores', label: 'Maestro de Proveedores', icon: 'bi-building-check', submoduloId: 'MAESTRO_PROVEEDORES' },
      { path: 'mantenimiento/usuarios', label: 'Usuarios', icon: 'bi-people', submoduloId: 'USUARIOS' },
      {
        label: '📝 Registro de Datos',
        icon: 'bi-database',
        submenu: [
          { path: 'mantenimiento/catalogo', label: 'Catálogo SIGAMEF', icon: 'bi-book', submoduloId: 'CATALOGO_SIGAMEF' },
          { path: 'mantenimiento/pedidos-sigamef', label: 'Pedidos SIGAMEF', icon: 'bi-card-list', submoduloId: 'PEDIDOS_SIGAMEF' },
          { path: 'mantenimiento/configuracion', label: 'Configuración Documentaria', icon: 'bi-gear', submoduloId: 'CONFIGURACION' },
          { path: 'mantenimiento/metas', label: 'Metas y Áreas', icon: 'bi-bullseye', submoduloId: 'METAS_AREAS' },
          { path: 'mantenimiento/ordenes', label: 'Órdenes', icon: 'bi-receipt', submoduloId: 'ORDENES' },
          { path: 'mantenimiento/siaf', label: 'SIAF', icon: 'bi-bank', submoduloId: 'SIAF' },
          { path: 'mantenimiento/fichanet', label: 'Ficha NET', icon: 'bi-file-earmark-medical', submoduloId: 'FICHANET' },
          { path: 'mantenimiento/carreras', label: 'Carreras Profesionales', icon: 'bi-mortarboard', submoduloId: 'CARRERAS' },
        ],
      },
      {
        label: '📑 Glosas de Requerimientos',
        icon: 'bi-file-text',
        submenu: [
          { path: 'mantenimiento/bienes', label: 'Formato Bienes', icon: 'bi-box', submoduloId: 'GLOSAS_BIENES' },
          { path: 'mantenimiento/servicios', label: 'Formato Servicios', icon: 'bi-tools', submoduloId: 'GLOSAS_SERVICIOS' },
          { path: 'mantenimiento/locacion', label: 'Formato Locación', icon: 'bi-building', submoduloId: 'GLOSAS_LOCACION' },
          { path: 'mantenimiento/licitaciones', label: 'Formato Licitaciones', icon: 'bi-hammer', submoduloId: 'GLOSAS_LICITACIONES' },
          { path: 'mantenimiento/concurso', label: 'Formato Concurso', icon: 'bi-trophy', submoduloId: 'GLOSAS_CONCURSO' },
        ],
      },
      {
        label: '🏛️ Institucional',
        icon: 'bi-building',
        submenu: [
          { path: 'mantenimiento/logotipos', label: 'Logotipos', icon: 'bi-image', submoduloId: 'LOGOTIPOS' },
          { path: 'mantenimiento/entidad', label: 'Datos de la Entidad', icon: 'bi-info-circle', submoduloId: 'ENTIDAD' },
        ],
      },
    ],
  },
];

function canShowRoute(path, userRole) {
  if (!path) return true;
  if (userRole === 'admin') return true;
  return permissionsService.canAccessRoute(path, 'VER');
}

export function filterMenuItems(items, userRole) {
  return (items || []).map((item) => {
    if (item.submenu) {
      const submenu = filterMenuItems(item.submenu, userRole);
      if (!submenu.length) return null;
      return { ...item, submenu };
    }
    if (item.path && !canShowRoute(item.path, userRole)) return null;
    return item;
  }).filter(Boolean);
}

export function getMenuForRole(userRole) {
  return MENU_STRUCTURE.filter((item) => !item.roles || item.roles.includes(userRole))
    .map((item) => {
      if (!item.submenu) return item;
      return { ...item, submenu: filterMenuItems(item.submenu, userRole) };
    });
}

export const menuService = {
  CONTRATACIONES_SUBMENU,
  MENU_STRUCTURE,
  LEGACY_ROUTE_REDIRECTS,
  resolveCanonicalRoute,
  filterMenuItems,
  getMenuForRole,
};

export default menuService;

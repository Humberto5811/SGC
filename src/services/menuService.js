// Menú principal SGC — fuente única de rutas visibles (filtrado por permisos RC119)
import { authService } from './authService.js';
import { permissionsService } from './permissionsService.js';
import { permisosFromRol } from '../utils/permissionsCatalog.js';

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
  { path: 'dec/registro-ordenes', label: 'Registro de Órdenes', icon: 'bi-clipboard-check', submoduloId: 'REGISTRO_ORDENES_CONTRATACION' },
];

/** Rutas legacy → misma ruta canónica (compatibilidad). */
export { LEGACY_ROUTE_REDIRECTS, resolveCanonicalRoute } from '../utils/permissionsCatalog.js';

/**
 * Estructura de menú. `roles` se conserva solo como documentación legacy;
 * el filtrado real usa `usuarios.permisos` vía permissionsService (RC119).
 */
export const MENU_STRUCTURE = [
  { path: 'dashboard', label: 'Dashboard', icon: 'bi-grid-3x3-gap-fill', roles: ['admin', 'au', 'dec', 'usuario'] },
  {
    label: 'Requerimientos',
    icon: 'bi-file-text',
    moduloId: 'REQUERIMIENTOS',
    roles: ['au', 'admin'],
    submenu: [
      { path: 'au/requerimientos/registro', label: 'Registro de Requerimientos', icon: 'bi-pencil-square', submoduloId: 'REGISTRO_REQUERIMIENTO' },
      { path: 'au/requerimientos/evaluacion', label: 'Evaluación de Requerimientos', icon: 'bi-check-circle', submoduloId: 'EVALUACION_REQUERIMIENTO' },
    ],
  },
  {
    label: 'Contrataciones',
    icon: 'bi-cart-check',
    moduloId: 'CONTRATACIONES',
    roles: ['dec', 'admin'],
    submenu: CONTRATACIONES_SUBMENU,
  },
  {
    label: 'Ejecución',
    icon: 'bi-graph-up',
    moduloId: 'EJECUCION',
    roles: ['dec', 'admin', 'au'],
    submenu: [
      { path: 'ejecucion/recepcion-bienes', label: 'Recepción de Bienes', icon: 'bi-box-seam', submoduloId: 'RECEPCION_BIENES' },
      { path: 'ejecucion/presentacion', label: 'Presentación Entregable', icon: 'bi-file-check', submoduloId: 'ALMACEN' },
      { path: 'ejecucion/ampliacion', label: 'Ampliación Resolución', icon: 'bi-calendar-plus', submoduloId: 'AMPLIACION' },
      { path: 'ejecucion/pago', label: 'Pagos', icon: 'bi-credit-card', submoduloId: 'TESORERIA' },
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
    moduloId: 'MANTENIMIENTO',
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
      { path: 'mantenimiento/workflow-sgc', label: 'Workflow SGC', icon: 'bi-diagram-3', submoduloId: 'WORKFLOW_SGC' },
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

function canShowRoute(path, user) {
  if (!path) return true;
  if (permissionsService.canAccessRoute(path, 'VER', user)) return true;
  // RC8.6E — CCP visible con asignación activa aunque el JSON de permisos no liste CCP
  if (path === 'dec/ccp' && (user?.acceso_ccp_por_asignacion || user?.acceso_ccp)) return true;
  return false;
}

export function filterMenuItems(items, user) {
  return (items || []).map((item) => {
    if (item.submenu) {
      const submenu = filterMenuItems(item.submenu, user);
      if (!submenu.length) return null;
      return { ...item, submenu };
    }
    if (item.path && !canShowRoute(item.path, user)) return null;
    return item;
  }).filter(Boolean);
}

/**
 * Construye el menú lateral según permisos efectivos del usuario (no solo rol).
 */
export function getMenuForUser(user) {
  const u = user || authService.getCurrentUser();
  if (!u) return [];

  // Admin: menú completo
  if (u.rol === 'admin') {
    return MENU_STRUCTURE.map((item) => (
      item.submenu ? { ...item, submenu: filterMenuItems(item.submenu, u) } : { ...item }
    ));
  }

  return MENU_STRUCTURE
    .map((item) => {
      if (item.submenu) {
        const submenu = filterMenuItems(item.submenu, u);
        if (!submenu.length) return null;
        return { ...item, submenu };
      }
      if (item.path && !canShowRoute(item.path, u)) return null;
      return item;
    })
    .filter(Boolean);
}

/**
 * Compat: acepta rol string o usa el usuario de sesión.
 * Si solo se pasa el rol, se sintetiza un usuario con permisosFromRol (legacy).
 */
export function getMenuForRole(userOrRole) {
  if (userOrRole && typeof userOrRole === 'object') {
    return getMenuForUser(userOrRole);
  }
  const session = authService.getCurrentUser();
  if (session) return getMenuForUser(session);
  const rol = userOrRole || 'usuario';
  return getMenuForUser({ rol, permisos: permisosFromRol(rol) });
}

export const menuService = {
  CONTRATACIONES_SUBMENU,
  MENU_STRUCTURE,
  filterMenuItems,
  getMenuForUser,
  getMenuForRole,
};

export default menuService;

// Catálogo de permisos — servidor (espejo de src/utils/permissionsCatalog.js)
import { isAdminSecurityRole, normalizeSecurityRole } from '../utils/userRoleCatalog.js';

export const ACTIVIDADES = ['VER', 'CREAR', 'EDITAR', 'ELIMINAR', 'APROBAR', 'OBSERVAR', 'DERIVAR', 'RECHAZAR', 'EXPORTAR', 'FIRMAR', 'DESCARGAR'];

export const MODULOS = [
  {
    id: 'REQUERIMIENTOS',
    label: 'Requerimientos',
    submodulos: [
      { id: 'REGISTRO_REQUERIMIENTO', label: 'Registro de Requerimientos', route: 'au/requerimientos/registro' },
      { id: 'EVALUACION_REQUERIMIENTO', label: 'Evaluación de Requerimientos', route: 'au/requerimientos/evaluacion' },
    ],
  },
  {
    id: 'CONTRATACIONES',
    label: 'Contrataciones',
    submodulos: [
      { id: 'DEC', label: 'DEC', route: 'dec/dec' },
      { id: 'PROGRAMACION', label: 'Programación', route: 'dec/programacion' },
      { id: 'ACTOS_PREPARATORIOS', label: 'Coordinación CM', route: 'dec/actos' },
      { id: 'INVITACIONES', label: 'Invitaciones', route: 'dec/invitaciones' },
      { id: 'CONSULTAS_OBSERVACIONES', label: 'Consultas y Observaciones', route: 'contrataciones/consultas-observaciones' },
      { id: 'RECEPCION_COTIZACIONES', label: 'Recepción de Cotizaciones', route: 'contrataciones/recepcion-cotizaciones' },
      { id: 'VALIDACIONES', label: 'Validaciones', route: 'contrataciones/validaciones' },
      { id: 'CUADRO_COMPARATIVO', label: 'Cuadro Comparativo', route: 'dec/cuadro' },
      { id: 'CCP', label: 'CCP', route: 'dec/ccp' },
      { id: 'REGISTRO_ORDENES_CONTRATACION', label: 'Registro de Órdenes', route: 'dec/registro-ordenes' },
    ],
  },
  {
    id: 'EJECUCION',
    label: 'Ejecución Contractual',
    submodulos: [
      { id: 'RECEPCION_BIENES', label: 'Recepción de Bienes', route: 'ejecucion/recepcion-bienes' },
      { id: 'ALMACEN', label: 'Almacén / Presentación Entregable', route: 'ejecucion/presentacion' },
      { id: 'TESORERIA', label: 'Pagos', route: 'ejecucion/pago' },
      { id: 'AMPLIACION', label: 'Ampliación Resolución', route: 'ejecucion/ampliacion' },
    ],
  },
  {
    id: 'MANTENIMIENTO',
    label: 'Mantenimiento',
    submodulos: [
      { id: 'USUARIOS', label: 'Usuarios y Permisos', route: 'mantenimiento/usuarios' },
      { id: 'WORKFLOW_SGC', label: 'Workflow SGC', route: 'mantenimiento/workflow-sgc' },
      { id: 'MAESTRO_PROVEEDORES', label: 'Maestro de Proveedores', route: 'mantenimiento/proveedores' },
      { id: 'CATALOGO_SIGAMEF', label: 'Catálogo SIGAMEF', route: 'mantenimiento/catalogo' },
      { id: 'PEDIDOS_SIGAMEF', label: 'Pedidos SIGAMEF', route: 'mantenimiento/pedidos-sigamef' },
      { id: 'METAS_AREAS', label: 'Metas y Áreas', route: 'mantenimiento/metas' },
      { id: 'CONFIGURACION', label: 'Configuración Documentaria', route: 'mantenimiento/configuracion' },
      { id: 'ORDENES', label: 'Órdenes', route: 'mantenimiento/ordenes' },
      { id: 'SIAF', label: 'SIAF', route: 'mantenimiento/siaf' },
      { id: 'FICHANET', label: 'Ficha NET', route: 'mantenimiento/fichanet' },
      { id: 'CARRERAS', label: 'Carreras Profesionales', route: 'mantenimiento/carreras' },
      { id: 'GLOSAS_BIENES', label: 'Formato Bienes', route: 'mantenimiento/bienes' },
      { id: 'GLOSAS_SERVICIOS', label: 'Formato Servicios', route: 'mantenimiento/servicios' },
      { id: 'GLOSAS_LOCACION', label: 'Formato Locación', route: 'mantenimiento/locacion' },
      { id: 'GLOSAS_LICITACIONES', label: 'Formato Licitaciones', route: 'mantenimiento/licitaciones' },
      { id: 'GLOSAS_CONCURSO', label: 'Formato Concurso', route: 'mantenimiento/concurso' },
      { id: 'LOGOTIPOS', label: 'Logotipos', route: 'mantenimiento/logotipos' },
      { id: 'ENTIDAD', label: 'Datos de la Entidad', route: 'mantenimiento/entidad' },
    ],
  },
];

export const ROUTE_TO_SUBMODULO = {};
MODULOS.forEach((m) => m.submodulos.forEach((s) => { if (s.route) ROUTE_TO_SUBMODULO[s.route] = s.id; }));
ROUTE_TO_SUBMODULO.dashboard = null;
ROUTE_TO_SUBMODULO['dec/consultas'] = 'CONSULTAS_OBSERVACIONES';
ROUTE_TO_SUBMODULO['dec/cotizaciones'] = 'RECEPCION_COTIZACIONES';
ROUTE_TO_SUBMODULO['admin/usuarios'] = 'USUARIOS';
ROUTE_TO_SUBMODULO['ejecucion/registro'] = 'RECEPCION_BIENES';
ROUTE_TO_SUBMODULO['mantenimiento/proveedores'] = 'MAESTRO_PROVEEDORES';

export const SUBMODULO_ID_ALIASES = {
  CONSULTAS: 'CONSULTAS_OBSERVACIONES',
  COTIZACIONES: 'RECEPCION_COTIZACIONES',
};

export function emptyPermisos() {
  return { modulos: [], submodulos: [], actividades: [], actividadesPorSubmodulo: {} };
}

export function getActividadesForSubmodulo(permisos, subId) {
  const p = permisos || emptyPermisos();
  const sid = String(SUBMODULO_ID_ALIASES[subId] || subId || '');
  const map = p.actividadesPorSubmodulo;
  if (map && typeof map === 'object' && Object.keys(map).length > 0) {
    const acts = Array.isArray(map[sid]) ? map[sid].map(String) : [];
    if (acts.length) return acts;
    if ((p.submodulos || []).includes(sid)) return ['VER'];
    return [];
  }
  if ((p.submodulos || []).includes(sid) && Array.isArray(p.actividades) && p.actividades.length) {
    return p.actividades.map(String);
  }
  if ((p.submodulos || []).includes(sid)) return ['VER'];
  return [];
}

/** RC119 — permisos efectivos unificados (espejo cliente). */
export function resolveUserPermissions(user) {
  if (!user) return emptyPermisos();
  if (isAdminSecurityRole(user)) {
    return normalizePermisos(user.permisos, 'admin', { explicit: user.permisos != null });
  }
  if (user.permisos != null && typeof user.permisos === 'object') {
    return normalizePermisos(user.permisos, user.rol, { explicit: true });
  }
  return permisosFromRol(user.rol);
}

function syncFlatActividades(base) {
  if (base.actividadesPorSubmodulo && Object.keys(base.actividadesPorSubmodulo).length) {
    base.actividades = [...new Set(Object.values(base.actividadesPorSubmodulo).flat().map(String))];
  }
}

export function allPermisos() {
  const submodulos = MODULOS.flatMap((m) => m.submodulos.map((s) => s.id));
  const actividadesPorSubmodulo = {};
  submodulos.forEach((sid) => { actividadesPorSubmodulo[sid] = [...ACTIVIDADES]; });
  return {
    modulos: MODULOS.map((m) => m.id),
    submodulos,
    actividades: [...ACTIVIDADES],
    actividadesPorSubmodulo,
  };
}

export function permisosFromRol(rol) {
  const normalized = normalizeSecurityRole(rol);
  if (normalized === 'admin') return allPermisos();
  const p = emptyPermisos();
  if (normalized === 'au') {
    p.modulos = ['REQUERIMIENTOS', 'EJECUCION'];
    p.submodulos = ['REGISTRO_REQUERIMIENTO', 'EVALUACION_REQUERIMIENTO', 'RECEPCION_BIENES'];
    p.actividades = ['VER', 'CREAR', 'EDITAR', 'APROBAR', 'OBSERVAR', 'DERIVAR', 'EXPORTAR', 'DESCARGAR'];
    p.actividadesPorSubmodulo = {};
    p.submodulos.forEach((sid) => { p.actividadesPorSubmodulo[sid] = [...p.actividades]; });
  } else if (normalized === 'dec') {
    p.modulos = ['CONTRATACIONES', 'EJECUCION'];
    p.submodulos = MODULOS.filter((m) => p.modulos.includes(m.id)).flatMap((m) => m.submodulos.map((s) => s.id));
    p.actividades = ['VER', 'CREAR', 'EDITAR', 'APROBAR', 'OBSERVAR', 'DERIVAR', 'EXPORTAR', 'DESCARGAR'];
    p.actividadesPorSubmodulo = {};
    p.submodulos.forEach((sid) => { p.actividadesPorSubmodulo[sid] = [...p.actividades]; });
  } else {
    p.modulos = [];
    p.submodulos = [];
    p.actividades = ['VER'];
  }
  return p;
}

export function normalizePermisos(raw, rol, options = {}) {
  if (!raw || typeof raw !== 'object') return permisosFromRol(rol);
  const base = emptyPermisos();
  ['modulos', 'submodulos', 'actividades'].forEach((k) => {
    if (Array.isArray(raw[k])) base[k] = raw[k].map(String);
  });
  if (raw.actividadesPorSubmodulo && typeof raw.actividadesPorSubmodulo === 'object') {
    base.actividadesPorSubmodulo = {};
    Object.entries(raw.actividadesPorSubmodulo).forEach(([subId, acts]) => {
      const canonical = SUBMODULO_ID_ALIASES[subId] || subId;
      const prev = base.actividadesPorSubmodulo[canonical] || [];
      const merged = [...new Set([...prev, ...(Array.isArray(acts) ? acts.map(String) : [])])];
      base.actividadesPorSubmodulo[String(canonical)] = merged;
    });
  }
  if (Array.isArray(base.submodulos)) {
    base.submodulos = [...new Set(base.submodulos.map((id) => SUBMODULO_ID_ALIASES[id] || id))];
  }
  syncFlatActividades(base);
  if (!options.explicit && !base.modulos.length && !base.submodulos.length && rol) return permisosFromRol(rol);
  return base;
}

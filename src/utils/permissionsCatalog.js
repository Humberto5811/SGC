// Catálogo de permisos — cliente (espejo de server/lib/permissionsCatalog.js)
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
      { id: 'ACTOS_PREPARATORIOS', label: 'Actos Preparatorios', route: 'dec/actos' },
      { id: 'INVITACIONES', label: 'Invitaciones', route: 'dec/invitaciones' },
      { id: 'CONSULTAS', label: 'Consultas', route: 'dec/consultas' },
      { id: 'COTIZACIONES', label: 'Cotizaciones', route: 'dec/cotizaciones' },
      { id: 'CUADRO_COMPARATIVO', label: 'Cuadro Comparativo', route: 'dec/cuadro' },
      { id: 'CCP', label: 'CCP', route: 'dec/ccp' },
    ],
  },
  {
    id: 'EJECUCION',
    label: 'Ejecución Contractual',
    submodulos: [
      { id: 'REGISTRO_ORDEN', label: 'Registro de Orden', route: 'ejecucion/registro' },
      { id: 'ALMACEN', label: 'Almacén', route: 'ejecucion/presentacion' },
      { id: 'TESORERIA', label: 'Tesorería', route: 'ejecucion/pago' },
      { id: 'AMPLIACION', label: 'Ampliación Resolución', route: 'ejecucion/ampliacion' },
    ],
  },
  {
    id: 'MANTENIMIENTO',
    label: 'Mantenimiento',
    submodulos: [
      { id: 'USUARIOS', label: 'Usuarios y Permisos', route: 'mantenimiento/usuarios' },
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
      { id: 'LOGOTIPOS', label: 'Logotipos', route: 'mantenimiento/logotipos' },
      { id: 'ENTIDAD', label: 'Datos de la Entidad', route: 'mantenimiento/entidad' },
    ],
  },
];

export const ROUTE_TO_SUBMODULO = {};
MODULOS.forEach((m) => m.submodulos.forEach((s) => { if (s.route) ROUTE_TO_SUBMODULO[s.route] = s.id; }));

export function emptyPermisos() {
  return { modulos: [], submodulos: [], actividades: [] };
}

export function allPermisos() {
  return {
    modulos: MODULOS.map((m) => m.id),
    submodulos: MODULOS.flatMap((m) => m.submodulos.map((s) => s.id)),
    actividades: [...ACTIVIDADES],
  };
}

export function permisosFromRol(rol) {
  if (rol === 'admin') return allPermisos();
  const p = emptyPermisos();
  if (rol === 'au') {
    p.modulos = ['REQUERIMIENTOS'];
    p.submodulos = ['REGISTRO_REQUERIMIENTO', 'EVALUACION_REQUERIMIENTO'];
    p.actividades = ['VER', 'CREAR', 'EDITAR', 'APROBAR', 'OBSERVAR', 'DERIVAR', 'EXPORTAR'];
  } else if (rol === 'dec') {
    p.modulos = ['CONTRATACIONES', 'EJECUCION'];
    p.submodulos = MODULOS.filter((m) => p.modulos.includes(m.id)).flatMap((m) => m.submodulos.map((s) => s.id));
    p.actividades = ['VER', 'CREAR', 'EDITAR', 'APROBAR', 'OBSERVAR', 'DERIVAR', 'EXPORTAR', 'DESCARGAR'];
  } else {
    p.actividades = ['VER'];
  }
  return p;
}

export function normalizePermisos(raw, rol) {
  if (!raw || typeof raw !== 'object') return permisosFromRol(rol);
  const base = emptyPermisos();
  ['modulos', 'submodulos', 'actividades'].forEach((k) => {
    if (Array.isArray(raw[k])) base[k] = raw[k].map(String);
  });
  if (!base.modulos.length && !base.submodulos.length && rol) return permisosFromRol(rol);
  return base;
}

export function getSubmodulosOfModulo(moduloId) {
  const m = MODULOS.find((x) => x.id === moduloId);
  return m ? m.submodulos.map((s) => s.id) : [];
}

export function getModuloOfSubmodulo(subId) {
  for (const m of MODULOS) {
    if (m.submodulos.some((s) => s.id === subId)) return m.id;
  }
  return null;
}

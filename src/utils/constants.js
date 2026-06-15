export const ROUTE_ROLES = {
  login: [],
  dashboard: ['admin', 'usuario', 'au', 'dec'],
  'admin/usuarios': ['admin'],
  'au/requerimientos/registro': ['au', 'admin'],
  'au/requerimientos/evaluacion': ['au', 'admin'],
  'requerimientos/nuevo/bienes': ['au', 'admin'],
  'dec/dec': ['dec', 'admin'],
  'dec/programacion': ['dec', 'admin'],
  'dec/actos': ['dec', 'admin'],
  'dec/invitaciones': ['dec', 'admin'],
  'dec/consultas': ['dec', 'admin'],
  'dec/cotizaciones': ['dec', 'admin'],
  'dec/ccp': ['dec', 'admin'],
  'dec/cuadro': ['dec', 'admin'],
  ejecucion: ['dec', 'admin', 'au'],
  'ejecucion/registro': ['dec', 'admin'],
  'ejecucion/presentacion': ['dec', 'admin'],
  'ejecucion/ampliacion': ['dec', 'admin'],
  'ejecucion/pago': ['dec', 'admin'],
  'mantenimiento/catalogo': ['admin'],
  'mantenimiento/fichas': ['admin'],
  'mantenimiento/configuracion': ['admin'],
  'mantenimiento/metas': ['admin'],
  'mantenimiento/usuarios': ['admin'],
  'mantenimiento/ordenes': ['admin'],
  'mantenimiento/siaf': ['admin'],
  'mantenimiento/fichanet': ['admin'],
  'mantenimiento/bienes': ['admin'],
  'mantenimiento/servicios': ['admin'],
  'mantenimiento/locacion': ['admin'],
  'mantenimiento/licitaciones': ['admin'],
  'mantenimiento/concurso': ['admin'],
  'mantenimiento/logotipos': ['admin'],
  'mantenimiento/entidad': ['admin'],
  'mantenimiento/carreras': ['admin']
};

export const DEFAULT_USERS = [
  { dni: 'admin', nombre: 'Administrador', rol: 'admin', email: 'admin@sgc.pe' },
  { dni: 'au', nombre: 'Usuario AU', rol: 'au', email: 'au@sgc.pe' },
  { dni: 'dec', nombre: 'Usuario DEC', rol: 'dec', email: 'dec@sgc.pe' },
  { dni: 'usuario', nombre: 'Usuario General', rol: 'usuario', email: 'usuario@sgc.pe' }
];

export const DEFAULT_AREAS = ['Administraci?n', 'Log?stica', 'Operaciones', 'Finanzas'];
export const DEFAULT_METAS = ['Meta 1', 'Meta 2', 'Meta 3'];

export const STORAGE_KEYS = {
  USERS: 'users',
  CURRENT_USER: 'currentUser',
  AREAS: 'areas',
  METAS: 'metas',
  REQUERIMIENTOS: 'requerimientos',
  CONTRATACIONES: 'contrataciones',
  EJECUCIONES: 'ejecuciones',
  CATALOGO: 'catalogo',
  FICHAS_TECNICAS: 'fichasTecnicas',
  CONFIGURACION_DOC: 'configuracionDoc',
  ORDENES: 'ordenes',
  SIAF: 'siaf',
  LOGOTIPOS: 'logotipos',
  ENTIDAD: 'entidad'
};

export const TIPOS_CONTRATACION = {
  BIENES: 'bienes',
  SERVICIOS: 'servicios',
  LOCACION: 'locacion',
  LICITACION: 'licitacion',
  CONCURSO: 'concurso'
};

export const ESTADOS = {
  PENDIENTE: 'pendiente',
  EN_PROCESO: 'en_proceso',
  APROBADO: 'aprobado',
  RECHAZADO: 'rechazado',
  COMPLETADO: 'completado'
};
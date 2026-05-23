const STORAGE_KEYS = {
  USERS: 'sgc_users',
  CURRENT_USER: 'sgc_current_user',
  REQUERIMIENTOS: 'sgc_requerimientos',
  CONTRATACIONES: 'sgc_contrataciones',
};

const APP_ROLES = {
  ADMIN: 'ADMIN',
  DEC: 'DEC',
  AU: 'AU',
  PROVEEDOR: 'PROVEEDOR',
};

const ROUTE_ROLES = {
  login: [],
  dashboard: [],
  'au/requerimientos': [APP_ROLES.AU],
  'dec/contrataciones': [APP_ROLES.DEC],
  'admin/usuarios': [APP_ROLES.ADMIN],
};

const DEFAULT_USERS = [
  { id: 'u1', dni: '12345678', nombre: 'Admin General', rol: APP_ROLES.ADMIN, email: 'admin@sgc.pe', password: 'admin123' },
  { id: 'u2', dni: '23456789', nombre: 'Operador DEC', rol: APP_ROLES.DEC, email: 'dec@sgc.pe', password: 'dec123' },
  { id: 'u3', dni: '34567890', nombre: 'Operador AU', rol: APP_ROLES.AU, email: 'au@sgc.pe', password: 'au123' },
  { id: 'u4', dni: '45678901', nombre: 'Proveedor Simulado', rol: APP_ROLES.PROVEEDOR, email: 'prov@sgc.pe', password: 'prov123' },
];

export { STORAGE_KEYS, APP_ROLES, ROUTE_ROLES, DEFAULT_USERS };

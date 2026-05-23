// src/services/userService.js
import { storageService } from './storageService.js';

const STORAGE_KEY = 'sgc_users';

// Datos iniciales con permisos por módulo/submódulo
const defaultUsers = [
  {
    id: '1',
    dni: '12345678',
    nombre: 'Administrador SGC',
    email: 'admin@sgc.pe',
    rol: 'ADMIN',
    password: 'admin123',
    estado: 'ACTIVO',
    permisos: {
      dashboard: ['view'],
      'au/requerimientos': ['view','create','edit','delete'],
      'dec/contrataciones': ['view','edit','delete'],
      'admin/usuarios': ['view','create','edit','delete']
    }
  },
  {
    id: '2',
    dni: '87654321',
    nombre: 'Operador AU',
    email: 'au@sgc.pe',
    rol: 'AU',
    password: 'au123',
    estado: 'ACTIVO',
    permisos: {
      dashboard: ['view'],
      'au/requerimientos': ['view','create','edit'],
    }
  },
  {
    id: '3',
    dni: '11111111',
    nombre: 'Operador DEC',
    email: 'dec@sgc.pe',
    rol: 'DEC',
    password: 'dec123',
    estado: 'ACTIVO',
    permisos: {
      dashboard: ['view'],
      'dec/contrataciones': ['view','edit'],
    }
  },
  {
    id: '4',
    dni: '99999999',
    nombre: 'Proveedor Test',
    email: 'proveedor@test.pe',
    rol: 'PROVEEDOR',
    password: 'prov123',
    estado: 'ACTIVO',
    permisos: {
      dashboard: ['view']
    }
  }
];

function init() {
  const existing = storageService.get(STORAGE_KEY);
  if (!existing || existing.length === 0) {
    storageService.set(STORAGE_KEY, defaultUsers);
  }
}

function list() {
  init();
  return storageService.get(STORAGE_KEY) || [];
}

function findById(id) {
  return list().find(u => u.id === id);
}

function findByDni(dni) {
  return list().find(u => u.dni === dni);
}

function create(userData) {
  const users = list();
  const newUser = {
    id: String(Date.now()), // id único
    ...userData,
    estado: 'ACTIVO',
    permisos: userData.permisos || {} // inicializar permisos
  };
  users.push(newUser);
  storageService.set(STORAGE_KEY, users);
  return newUser;
}

function update(userData) {
  const users = list();
  // Buscar por id o por dni
  const index = users.findIndex(u => u.id === userData.id || u.dni === userData.dni);
  if (index !== -1) {
    users[index] = { ...users[index], ...userData };
    storageService.set(STORAGE_KEY, users);
    return users[index];
  }
  return null;
}

function remove(identifier) {
  const users = list();
  // Permitir eliminar por id o por dni
  const filtered = users.filter(u => u.id !== identifier && u.dni !== identifier);
  storageService.set(STORAGE_KEY, filtered);
}

function validateLogin(dni, password) {
  return list().find(u => u.dni === dni && u.password === password && u.estado === 'ACTIVO');
}

// 🔹 Nueva función: verificar permisos
function hasPermission(user, module, action) {
  return user.permisos?.[module]?.includes(action);
}

export const userService = {
  init,
  list,
  findById,
  findByDni,
  create,
  update,
  remove,
  validateLogin,
  hasPermission
};

import { describe, it, expect } from 'vitest';
import {
  ROUTE_ROLES,
  DEFAULT_USERS,
  STORAGE_KEYS,
  TIPOS_CONTRATACION,
  ESTADOS,
} from '../../src/utils/constants.js';

describe('constants', () => {
  describe('ROUTE_ROLES', () => {
    it('login has empty roles (accessible to all)', () => {
      expect(ROUTE_ROLES.login).toEqual([]);
    });

    it('dashboard is accessible to main roles', () => {
      expect(ROUTE_ROLES.dashboard).toContain('admin');
      expect(ROUTE_ROLES.dashboard).toContain('usuario');
      expect(ROUTE_ROLES.dashboard).toContain('au');
      expect(ROUTE_ROLES.dashboard).toContain('dec');
    });

    it('admin routes require admin role', () => {
      expect(ROUTE_ROLES['admin/usuarios']).toEqual(['admin']);
      expect(ROUTE_ROLES['mantenimiento/catalogo']).toEqual(['admin']);
    });

    it('AU routes allow au and admin', () => {
      expect(ROUTE_ROLES['au/requerimientos/registro']).toContain('au');
      expect(ROUTE_ROLES['au/requerimientos/registro']).toContain('admin');
    });

    it('DEC routes allow dec and admin', () => {
      expect(ROUTE_ROLES['dec/actos']).toContain('dec');
      expect(ROUTE_ROLES['dec/actos']).toContain('admin');
    });
  });

  describe('DEFAULT_USERS', () => {
    it('has 4 default users', () => {
      expect(DEFAULT_USERS).toHaveLength(4);
    });

    it('contains admin, au, dec, and usuario', () => {
      const dnis = DEFAULT_USERS.map((u) => u.dni);
      expect(dnis).toEqual(['admin', 'au', 'dec', 'usuario']);
    });

    it('each user has required fields', () => {
      for (const u of DEFAULT_USERS) {
        expect(u).toHaveProperty('dni');
        expect(u).toHaveProperty('nombre');
        expect(u).toHaveProperty('rol');
        expect(u).toHaveProperty('email');
      }
    });
  });

  describe('STORAGE_KEYS', () => {
    it('defines expected storage keys', () => {
      expect(STORAGE_KEYS.USERS).toBe('users');
      expect(STORAGE_KEYS.CURRENT_USER).toBe('currentUser');
      expect(STORAGE_KEYS.REQUERIMIENTOS).toBe('requerimientos');
      expect(STORAGE_KEYS.CATALOGO).toBe('catalogo');
    });
  });

  describe('TIPOS_CONTRATACION', () => {
    it('defines all procurement types', () => {
      expect(Object.keys(TIPOS_CONTRATACION)).toEqual([
        'BIENES', 'SERVICIOS', 'LOCACION', 'LICITACION', 'CONCURSO',
      ]);
    });
  });

  describe('ESTADOS', () => {
    it('defines all workflow states', () => {
      expect(ESTADOS.PENDIENTE).toBe('pendiente');
      expect(ESTADOS.APROBADO).toBe('aprobado');
      expect(ESTADOS.COMPLETADO).toBe('completado');
    });
  });
});

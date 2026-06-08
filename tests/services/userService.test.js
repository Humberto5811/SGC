import { describe, it, expect, vi, beforeEach } from 'vitest';

const storage = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key) => storage[key] ?? null),
  setItem: vi.fn((key, val) => { storage[key] = val; }),
  removeItem: vi.fn((key) => { delete storage[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(storage)) delete storage[k]; }),
});

const { userService } = await import('../../src/services/userService.js');

describe('userService', () => {
  beforeEach(() => {
    for (const k of Object.keys(storage)) delete storage[k];
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns empty array when no users stored', () => {
      expect(userService.findAll()).toEqual([]);
    });

    it('returns all stored users', () => {
      storage.users = JSON.stringify([
        { dni: 'admin', nombre: 'Admin' },
        { dni: 'au', nombre: 'AU' },
      ]);
      const result = userService.findAll();
      expect(result).toHaveLength(2);
      expect(result[0].dni).toBe('admin');
    });
  });

  describe('findByDni', () => {
    it('returns undefined when user not found', () => {
      storage.users = JSON.stringify([]);
      expect(userService.findByDni('missing')).toBeUndefined();
    });

    it('finds user by DNI', () => {
      storage.users = JSON.stringify([{ dni: '12345', nombre: 'Test' }]);
      const user = userService.findByDni('12345');
      expect(user).toBeDefined();
      expect(user.nombre).toBe('Test');
    });

    it('uses loose equality for DNI comparison', () => {
      storage.users = JSON.stringify([{ dni: '123', nombre: 'Test' }]);
      expect(userService.findByDni(123)).toBeDefined();
    });
  });

  describe('hasPermission', () => {
    it('always returns true (current implementation)', () => {
      expect(userService.hasPermission({}, 'any/route', 'view')).toBe(true);
      expect(userService.hasPermission(null, 'admin/usuarios', 'edit')).toBe(true);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const storage = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key) => storage[key] ?? null),
  setItem: vi.fn((key, val) => { storage[key] = val; }),
  removeItem: vi.fn((key) => { delete storage[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(storage)) delete storage[k]; }),
});

const { storageService } = await import('../../src/services/storageService.js');

describe('storageService', () => {
  beforeEach(() => {
    for (const k of Object.keys(storage)) delete storage[k];
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('seeds default users when none exist', () => {
      storageService.initialize();
      expect(localStorage.setItem).toHaveBeenCalledWith('users', expect.any(String));
      const users = JSON.parse(storage.users);
      expect(users).toHaveLength(3);
      expect(users[0].dni).toBe('admin');
    });

    it('seeds default areas and metas', () => {
      storageService.initialize();
      const areas = JSON.parse(storage.areas);
      expect(areas).toContain('Administración');
      const metas = JSON.parse(storage.metas);
      expect(metas).toContain('Meta 1');
    });

    it('does not overwrite existing users', () => {
      storage.users = JSON.stringify([{ dni: 'custom' }]);
      storageService.initialize();
      const users = JSON.parse(storage.users);
      expect(users).toHaveLength(1);
      expect(users[0].dni).toBe('custom');
    });

    it('does not overwrite existing areas', () => {
      storage.areas = JSON.stringify(['Custom Area']);
      storageService.initialize();
      const areas = JSON.parse(storage.areas);
      expect(areas).toEqual(['Custom Area']);
    });
  });

  describe('getters', () => {
    it('getUsers returns stored users', () => {
      storage.users = JSON.stringify([{ dni: 'x' }]);
      expect(storageService.getUsers()).toEqual([{ dni: 'x' }]);
    });

    it('getUsers returns empty array when nothing stored', () => {
      expect(storageService.getUsers()).toEqual([]);
    });

    it('getAreas returns stored areas', () => {
      storage.areas = JSON.stringify(['A', 'B']);
      expect(storageService.getAreas()).toEqual(['A', 'B']);
    });

    it('getMetas returns stored metas', () => {
      storage.metas = JSON.stringify(['M1']);
      expect(storageService.getMetas()).toEqual(['M1']);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal localStorage mock
const storage = {};
const localStorageMock = {
  getItem: vi.fn((key) => storage[key] ?? null),
  setItem: vi.fn((key, val) => { storage[key] = val; }),
  removeItem: vi.fn((key) => { delete storage[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(storage)) delete storage[k]; }),
};
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('window', { location: { hash: '' }, localStorage: localStorageMock });

const { authService } = await import('../../src/services/authService.js');

describe('authService', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    window.location = { hash: '' };
  });

  describe('getCurrentUser / setCurrentUser', () => {
    it('returns null when no user stored', () => {
      expect(authService.getCurrentUser()).toBeNull();
    });

    it('stores and retrieves a user', () => {
      const user = { dni: 'admin', rol: 'admin' };
      authService.setCurrentUser(user);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('currentUser', JSON.stringify(user));
      expect(authService.getCurrentUser()).toEqual(user);
    });
  });

  describe('login', () => {
    it('returns success when user found in localStorage', () => {
      storage.users = JSON.stringify([{ dni: 'admin', rol: 'admin' }]);
      const result = authService.login('admin');
      expect(result.success).toBe(true);
      expect(result.user.dni).toBe('admin');
    });

    it('returns failure when user not found', () => {
      storage.users = JSON.stringify([]);
      const result = authService.login('unknown');
      expect(result.success).toBe(false);
    });
  });

  describe('logout', () => {
    it('removes currentUser and redirects to login', () => {
      authService.setCurrentUser({ dni: 'admin' });
      authService.logout();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('currentUser');
      expect(window.location.hash).toBe('#/login');
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when no user', () => {
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('returns true when user exists', () => {
      authService.setCurrentUser({ dni: 'x' });
      expect(authService.isAuthenticated()).toBe(true);
    });
  });

  describe('restoreSession', () => {
    it('returns success when user stored', () => {
      authService.setCurrentUser({ dni: 'admin' });
      const result = authService.restoreSession();
      expect(result.success).toBe(true);
    });

    it('returns failure when no user', () => {
      const result = authService.restoreSession();
      expect(result.success).toBe(false);
    });
  });

  describe('hasRole / hasAnyRole', () => {
    it('hasRole checks exact role match', () => {
      authService.setCurrentUser({ dni: 'admin', rol: 'admin' });
      expect(authService.hasRole('admin')).toBe(true);
      expect(authService.hasRole('au')).toBe(false);
    });

    it('hasAnyRole checks array of roles', () => {
      authService.setCurrentUser({ dni: 'admin', rol: 'au' });
      expect(authService.hasAnyRole(['au', 'dec'])).toBe(true);
      expect(authService.hasAnyRole(['admin'])).toBe(false);
    });

    it('returns falsy when no user', () => {
      expect(authService.hasRole('admin')).toBeFalsy();
      expect(authService.hasAnyRole(['admin'])).toBeFalsy();
    });
  });
});

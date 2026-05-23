import { STORAGE_KEYS } from '../utils/constants.js';
import { storageService } from './storageService.js';
import { state } from '../state.js';

class AuthService {
  login(dni, password) {
    const users = storageService.get(STORAGE_KEYS.USERS) || [];
    const user = users.find((item) => item.dni === dni && item.password === password);
    if (user) {
      storageService.set(STORAGE_KEYS.CURRENT_USER, user);
      state.set('currentUser', user);
      return user;
    }
    return null;
  }

  logout() {
    storageService.remove(STORAGE_KEYS.CURRENT_USER);
    state.set('currentUser', null);
  }

  getCurrentUser() {
    if (state.get('currentUser')) {
      return state.get('currentUser');
    }
    return storageService.get(STORAGE_KEYS.CURRENT_USER);
  }

  restoreSession() {
    const user = storageService.get(STORAGE_KEYS.CURRENT_USER);
    if (user) {
      state.set('currentUser', user);
    }
  }
}

const authService = new AuthService();
export { authService };
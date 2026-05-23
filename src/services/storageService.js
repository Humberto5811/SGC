import { STORAGE_KEYS, DEFAULT_USERS } from '../utils/constants.js';

const defaultData = {
  [STORAGE_KEYS.USERS]: DEFAULT_USERS,
  [STORAGE_KEYS.REQUERIMIENTOS]: [],
  [STORAGE_KEYS.CONTRATACIONES]: [],
};

class StorageService {
  initialize() {
    Object.keys(defaultData).forEach((key) => {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify(defaultData[key]));
      }
    });
  }

  get(key) {
    const raw = localStorage.getItem(key);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('Storage parse error', key, error);
      return null;
    }
  }

  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  remove(key) {
    localStorage.removeItem(key);
  }
}

const storageService = new StorageService();
export { storageService };
import { STORAGE_KEYS } from '../utils/constants.js';
import { storageService } from './storageService.js';

class RequerimientoService {
  list() {
    return storageService.get(STORAGE_KEYS.REQUERIMIENTOS) || [];
  }

  create(record) {
    const requerimientos = this.list();
    const next = {
      ...record,
      id: `r_${Date.now()}`,
      estado: 'BORRADOR',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    requerimientos.push(next);
    storageService.set(STORAGE_KEYS.REQUERIMIENTOS, requerimientos);
    return next;
  }

  update(record) {
    const requerimientos = this.list().map((item) => (item.id === record.id ? { ...item, ...record, updatedAt: new Date().toISOString() } : item));
    storageService.set(STORAGE_KEYS.REQUERIMIENTOS, requerimientos);
    return record;
  }

  findById(id) {
    return this.list().find((item) => item.id === id);
  }
}

const requerimientoService = new RequerimientoService();
export { requerimientoService };
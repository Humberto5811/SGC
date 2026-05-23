import { STORAGE_KEYS } from '../utils/constants.js';
import { storageService } from './storageService.js';

class ContratacionService {
  list() {
    return storageService.get(STORAGE_KEYS.CONTRATACIONES) || [];
  }

  create(record) {
    const items = this.list();
    const next = { ...record, id: `c_${Date.now()}`, estado: 'CREADO', createdAt: new Date().toISOString() };
    items.push(next);
    storageService.set(STORAGE_KEYS.CONTRATACIONES, items);
    return next;
  }

  update(record) {
    const items = this.list().map((item) => (item.id === record.id ? { ...item, ...record, updatedAt: new Date().toISOString() } : item));
    storageService.set(STORAGE_KEYS.CONTRATACIONES, items);
    return record;
  }
}

const contratacionService = new ContratacionService();
export { contratacionService };
// Construye una vista de Glosa para un tipo dado (bienes, servicios, etc.).
// Usa el endpoint anidado /api/glosas/:tipo mediante un adaptador de API.
import { createCrudView } from '../registroDatos/crudViewFactory.js';
import { api } from '../../services/apiService.js';

export function createGlosaView(tipo, title, icon) {
  return createCrudView({
    resource: `glosas_${tipo}`,
    title,
    icon,
    subtitle: `Plantillas y glosas de requerimientos — ${title}`,
    api: {
      list: (opts) => {
        const q = new URLSearchParams({ page: opts.page, pageSize: opts.pageSize, search: opts.search });
        return api.get(`/glosas/${tipo}?${q.toString()}`);
      },
      create: (body) => api.post(`/glosas/${tipo}`, body),
      update: (id, body) => api.put(`/glosas/${tipo}/${id}`, body),
      remove: (id) => api.del(`/glosas/${tipo}/${id}`),
    },
    fields: [
      { name: 'codigo', label: 'Código', type: 'text', col: 4 },
      { name: 'titulo', label: 'Título', type: 'text', required: true, col: 8 },
      { name: 'contenido', label: 'Contenido / Glosa', type: 'textarea', col: 12, rows: 5 },
      { name: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'], col: 4 },
    ],
    columns: [
      { name: 'codigo', label: 'Código', width: '140px' },
      { name: 'titulo', label: 'Título' },
      { name: 'estado', label: 'Estado', width: '100px' },
    ],
  });
}

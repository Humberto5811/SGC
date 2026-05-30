// Cliente HTTP central para hablar con el backend.
// Todas las llamadas pasan por /api (proxy de Vite hacia el backend Express).

const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch (_) { /* ignore */ }
    throw new Error(detail || `Error ${res.status} en ${path}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),

  // Helpers de recursos CRUD estándar con paginación/búsqueda.
  list: (resource, { page = 1, pageSize = 50, search = '' } = {}) => {
    const q = new URLSearchParams({ page, pageSize, search });
    return request(`/${resource}?${q.toString()}`);
  },
  create: (resource, body) => request(`/${resource}`, { method: 'POST', body: JSON.stringify(body) }),
  update: (resource, id, body) => request(`/${resource}/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (resource, id) => request(`/${resource}/${id}`, { method: 'DELETE' }),
};

export default api;

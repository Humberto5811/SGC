// Cliente HTTP central - VERSIÓN DEFINITIVA
const BASE = 'http://localhost:3000/api';

function authHeaders() {
  try {
    const raw = localStorage.getItem('currentUser');
    if (raw) {
      const user = JSON.parse(raw);
      const h = {};
      if (user && user.id) h['x-user-id'] = String(user.id);
      const fullName = [user.apellidos, user.nombres].filter(Boolean).join(' ').trim();
      if (fullName) h['x-user-name'] = fullName;
      else if (user && (user.nombre || user.username || user.dni)) {
        h['x-user-name'] = String(user.nombre || user.username || user.dni);
      }
      return h;
    }
  } catch (_) { }
  return {};
}

async function request(path, options = {}) {
  const url = BASE + path;
  console.log('📡 Llamando a:', url);
  
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      ...options,
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || error.error || `Error ${res.status}`);
    }
    return res.status === 204 ? null : res.json();
  } catch (error) {
    console.error('❌ Error en request:', error);
    throw error;
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),
  list: (resource, { page = 1, pageSize = 50, search = '', ...extra } = {}) => {
    const q = new URLSearchParams({ page, pageSize, search });
    Object.entries(extra).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v); });
    return request(`/${resource}?${q.toString()}`);
  },
  create: (resource, body) => request(`/${resource}`, { method: 'POST', body: JSON.stringify(body) }),
  update: (resource, id, body) => request(`/${resource}/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (resource, id) => request(`/${resource}/${id}`, { method: 'DELETE' }),
};

export default api;
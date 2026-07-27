// Cliente HTTP central - VERSIÓN DEFINITIVA
const BASE = '/api';

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
      // RC8.5-B1 — cargo/rol reales del usuario autenticado (sin inventar valores).
      h['x-user-cargo'] = String(user.cargo ?? '');
      h['x-user-rol'] = String(user.rol || user.role || '');
      if (user?.permisos) {
        try { h['x-user-permisos'] = JSON.stringify(user.permisos); } catch (_) { /* noop */ }
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

async function requestBlob(path, options = {}) {
  const url = BASE + path;
  // No sobrescribir headers con ...options: se perderían x-user-id / auth.
  const { headers: optHeaders, ...rest } = options || {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...authHeaders(), ...(optHeaders || {}) },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || error.error || `Error ${res.status}`);
  }
  const blob = await res.blob();
  if (!(blob instanceof Blob) || !blob.size) {
    throw new Error('Documento vacío o no disponible');
  }
  return {
    blob,
    contentType: res.headers.get('content-type') || blob.type || 'application/octet-stream',
    contentDisposition: res.headers.get('content-disposition') || '',
  };
}

export const api = {
  get: (path) => request(path),
  getBlob: (path) => requestBlob(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path, body) => request(path, {
    method: 'DELETE',
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  }),
  postBlob: (path, body = {}) => requestBlob(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }),
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
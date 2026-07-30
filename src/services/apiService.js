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
  const { headers: optHeaders, ...rest } = options || {};

  try {
    const res = await fetch(url, {
      ...rest,
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(optHeaders || {}) },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      const err = new Error(error.detail?.message || error.message || error.error || error.detail || `Error ${res.status}`);
      // Si detail es objeto (faltantes), conservar mensaje principal
      if (typeof error.detail === 'object' && error.detail != null) {
        err.message = error.message || error.error || err.message;
        err.detail = error.detail;
      }
      if (error.code) err.code = error.code;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  } catch (error) {
    console.error('❌ Error en request:', error);
    const msg = String(error?.message || error || '');
    if (/failed to fetch|networkerror|load failed|fetch.*abort/i.test(msg)) {
      throw new Error(
        'No se pudo conectar con el servidor. Verifique que la API esté en ejecución (puerto 3000) e intente nuevamente.',
      );
    }
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
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const error = await res.json().catch(() => ({}));
      const err = new Error(error.message || error.error || error.detail || `Error ${res.status}`);
      if (error.code) err.code = error.code;
      if (error.detail != null) err.detail = error.detail;
      throw err;
    }
    throw new Error(`Error ${res.status}`);
  }
  if (contentType.includes('application/json')) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'El servidor devolvió JSON en lugar del archivo');
  }
  const blob = await res.blob();
  if (!(blob instanceof Blob) || !blob.size) {
    throw new Error('Documento vacío o no disponible');
  }
  return {
    blob,
    contentType: contentType || blob.type || 'application/octet-stream',
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
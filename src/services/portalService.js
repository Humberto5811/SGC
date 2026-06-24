// Cliente API — Portal de Proveedores (auth separada del SGC interno)
const BASE = 'http://localhost:3000/api/portal';

function portalHeaders() {
  try {
    const raw = localStorage.getItem('portalProveedor');
    if (raw) {
      const p = JSON.parse(raw);
      if (p?.id) return { 'x-portal-proveedor-id': String(p.id) };
    }
  } catch (_) {}
  return {};
}

async function portalRequest(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...portalHeaders(), ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export const portalService = {
  getSession() {
    try { return JSON.parse(localStorage.getItem('portalProveedor') || 'null'); } catch (_) { return null; }
  },
  setSession(proveedor) {
    if (proveedor) localStorage.setItem('portalProveedor', JSON.stringify(proveedor));
    else localStorage.removeItem('portalProveedor');
  },
  async login(ruc, password) {
    const resp = await portalRequest('/login', { method: 'POST', body: JSON.stringify({ ruc, password }) });
    if (resp?.proveedor) this.setSession(resp.proveedor);
    return resp;
  },
  logout() { this.setSession(null); },
  async changePassword(actual, nueva) {
    return portalRequest('/cambiar-password', { method: 'POST', body: JSON.stringify({ actual, nueva }) });
  },
  async listMisInvitaciones() {
    return portalRequest('/mis-invitaciones');
  },
  async getDocumentos(solicitudId) {
    return portalRequest(`/solicitud/${solicitudId}/documentos`);
  },
  async listAbsoluciones(solicitudId) {
    return portalRequest(`/solicitud/${solicitudId}/absoluciones`);
  },
  async listConsultas(solicitudId) {
    const q = solicitudId ? `?solicitud_id=${solicitudId}` : '';
    return portalRequest(`/consultas${q}`);
  },
  async crearConsulta(body) {
    return portalRequest('/consultas', { method: 'POST', body: JSON.stringify(body) });
  },
  async crearObservacion(body) {
    return portalRequest('/observaciones', { method: 'POST', body: JSON.stringify(body) });
  },
  async presentarCotizacion(body) {
    return portalRequest('/cotizaciones', { method: 'POST', body: JSON.stringify(body) });
  },
};

export default portalService;

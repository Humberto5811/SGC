// Cliente API — Portal de Proveedores (auth separada del SGC interno)
const BASE = '/api/portal';

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
  async getInvitacionByToken(token) {
    return portalRequest(`/invitacion/${encodeURIComponent(token)}`);
  },
  async listMisInvitaciones() {
    return portalRequest('/mis-invitaciones');
  },
  async getDocumentos(solicitudId) {
    return portalRequest(`/solicitud/${solicitudId}/documentos`);
  },
  async getSolicitudDetalle(solicitudId) {
    return portalRequest(`/solicitud/${solicitudId}/detalle`);
  },
  async getCotizacionWorkspace(solicitudId) {
    return portalRequest(`/solicitud/${solicitudId}/cotizacion-workspace`);
  },
  async fetchDocumentoBlob(solicitudId, docRef, accion = 'ver') {
    const res = await fetch(
      `${BASE}/solicitud/${solicitudId}/documento/${encodeURIComponent(docRef)}/${accion}`,
      { headers: { ...portalHeaders() } },
    );
    if (!res.ok) {
      const text = await res.text();
      try {
        const err = JSON.parse(text);
        throw new Error(err.error || `Error ${res.status}`);
      } catch (e) {
        if (e.message && !e.message.startsWith('Unexpected')) throw e;
        throw new Error(text || `Error ${res.status}`);
      }
    }
    return res.blob();
  },
  async downloadDocumento(solicitudId, docRef, filename) {
    const blob = await this.fetchDocumentoBlob(solicitudId, docRef, 'descargar');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'documento.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  async listAbsoluciones(solicitudId) {
    return portalRequest(`/solicitud/${solicitudId}/absoluciones`);
  },
  async listConsultas(solicitudId) {
    const q = solicitudId ? `?solicitud_id=${solicitudId}` : '';
    return portalRequest(`/consultas${q}`);
  },
  async listMisCotizaciones() {
    return portalRequest('/cotizaciones');
  },
  async getEstadoParticipacion() {
    return portalRequest('/estado-participacion');
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
  async guardarBorradorCotizacion(body) {
    return portalRequest('/cotizaciones/borrador', { method: 'POST', body: JSON.stringify(body) });
  },
};

export default portalService;

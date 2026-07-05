// Recepción de Cotizaciones — bandeja analista CM
import { contratacionesService } from '../../services/contratacionesService.js';
import { renderContratacionBandejaStub } from '../../utils/contratacionBandejaStub.js';
import { bindBandejaToolbar } from '../../utils/bandejaUi.js';

const API_BASE = 'http://localhost:3000/api';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  return String(iso || '').slice(0, 16).replace('T', ' ');
}

function fmtMonto(n, moneda = 'PEN') {
  const val = Number(n || 0);
  const sym = moneda === 'PEN' ? 'S/' : moneda;
  return `${sym} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function authHeaders() {
  try {
    const raw = localStorage.getItem('currentUser');
    if (raw) {
      const user = JSON.parse(raw);
      const h = {};
      if (user?.id) h['x-user-id'] = String(user.id);
      if (user?.username || user?.nombre || user?.dni) {
        h['x-user-name'] = String(user.username || user.nombre || user.dni);
      }
      return h;
    }
  } catch (_) { /* noop */ }
  return {};
}

async function openCotizacionDoc(cotId, ref, inline = false) {
  const url = `${API_BASE}/contrataciones/portal-analista/cotizaciones/${cotId}/documento/${encodeURIComponent(ref)}/${inline ? 'ver' : 'descargar'}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'No se pudo abrir el documento');
  }
  const blob = await res.blob();
  const disp = res.headers.get('Content-Disposition') || '';
  let nombre = 'documento';
  const m = disp.match(/filename="([^"]+)"/);
  if (m) nombre = decodeURIComponent(m[1]);
  const objUrl = URL.createObjectURL(blob);
  if (inline) {
    window.open(objUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    return;
  }
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
}

const VIEW_CONFIG = {
  prefix: 'recepCot',
  title: 'Recepción de Cotizaciones',
  icon: 'bi-inbox',
  description: 'Bandeja de expedientes en recepción y registro de cotizaciones.',
  listId: 'recepCotList',
};

let cotizacionesCache = [];

export function renderRecepcionCotizacionesView() {
  return renderContratacionBandejaStub(VIEW_CONFIG);
}

function badgeValidacion(estado) {
  const e = String(estado || '').toUpperCase();
  if (e === 'APTO') return 'success';
  if (e === 'NO_APTO') return 'danger';
  if (e === 'OBSERVADO') return 'warning';
  return 'secondary';
}

function renderItemsTecnicos(items) {
  if (!items?.length) {
    return '<div class="text-muted small">Sin información técnica registrada.</div>';
  }
  return `
    <div class="table-responsive">
      <table class="table table-sm table-bordered mb-0">
        <thead class="table-light text-center">
          <tr>
            <th>Ítem</th><th>Presentación</th><th>Cant.</th><th>Marca</th><th>Modelo</th>
            <th>País</th><th>Garantía</th><th>Plazo entrega</th>
          </tr>
        </thead>
        <tbody>${items.map((it) => `
          <tr>
            <td class="small">${esc(it.item_key || '—')}</td>
            <td class="small">${esc(it.presentacion || '—')}</td>
            <td class="text-center small">${esc(it.cantidad_ofertada ?? '—')}</td>
            <td class="small">${esc(it.marca || '—')}</td>
            <td class="small">${esc(it.modelo || '—')}</td>
            <td class="small">${esc(it.pais || '—')}</td>
            <td class="small">${esc(it.garantia || '—')}</td>
            <td class="small">${esc(it.plazo_entrega || '—')}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function renderPrecios(precios) {
  const rows = Object.entries(precios || {}).filter(([k]) => k !== 'datos_proveedor');
  if (!rows.length) {
    return '<div class="text-muted small">Sin precios registrados.</div>';
  }
  return `
    <div class="table-responsive">
      <table class="table table-sm table-bordered mb-0">
        <thead class="table-light"><tr><th>Ítem</th><th class="text-end">Unitario</th><th class="text-end">Total</th></tr></thead>
        <tbody>${rows.map(([key, p]) => `
          <tr>
            <td class="small">${esc(key)}</td>
            <td class="text-end small">${fmtMonto(p?.unitario)}</td>
            <td class="text-end small">${fmtMonto(p?.total)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function renderDocumentosList(cotId, documentos) {
  if (!documentos?.length) {
    return '<div class="text-muted small">No hay documentos adjuntos en esta cotización.</div>';
  }
  const grupos = {};
  documentos.forEach((d) => {
    const g = d.grupo || 'Documentos';
    if (!grupos[g]) grupos[g] = [];
    grupos[g].push(d);
  });
  return Object.entries(grupos).map(([grupo, docs]) => `
    <div class="mb-3">
      <div class="fw-semibold small text-muted mb-1">${esc(grupo)}</div>
      <ul class="list-group list-group-flush border rounded">
        ${docs.map((d) => `
          <li class="list-group-item d-flex justify-content-between align-items-center py-2">
            <span class="small"><i class="bi bi-file-earmark-text text-primary"></i> ${esc(d.nombre)}</span>
            <span class="btn-group btn-group-sm">
              <button type="button" class="btn btn-outline-secondary rc-doc-ver" data-cot-id="${cotId}" data-ref="${esc(d.ref)}">Ver</button>
              <button type="button" class="btn btn-outline-primary rc-doc-dl" data-cot-id="${cotId}" data-ref="${esc(d.ref)}">Descargar</button>
            </span>
          </li>`).join('')}
      </ul>
    </div>`).join('');
}

function bindDocumentoButtons(container) {
  container.querySelectorAll('.rc-doc-ver').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await openCotizacionDoc(btn.dataset.cotId, btn.dataset.ref, true);
      } catch (err) { alert(err.message); }
    };
  });
  container.querySelectorAll('.rc-doc-dl').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await openCotizacionDoc(btn.dataset.cotId, btn.dataset.ref, false);
      } catch (err) { alert(err.message); }
    };
  });
}

async function showCotizacionDetalleModal(cotId) {
  const id = `rcDetModal_${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title"><i class="bi bi-inbox"></i> Cotización recibida</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${id}_body">
            <div class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm"></span> Cargando…</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const el = document.getElementById(id);
  const modal = window.bootstrap.Modal.getOrCreateInstance(el);
  el.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
  modal.show();

  try {
    const resp = await contratacionesService.getRecepcionCotizacionDetalle(cotId);
    const c = resp.data || {};
    const datos = c.datos_proveedor || {};
    const body = document.getElementById(`${id}_body`);
    body.innerHTML = `
      <div class="card border-0 bg-light mb-3">
        <div class="card-body py-3">
          <div class="row g-2 small">
            <div class="col-md-4">
              <span class="text-muted d-block">Solicitud</span>
              <strong>${esc(c.solicitud_codigo)}</strong>
              <div class="text-muted">${esc(c.denominacion || c.objeto || '')}</div>
            </div>
            <div class="col-md-4">
              <span class="text-muted d-block">Proveedor</span>
              <strong>${esc(c.razon_social)}</strong>
              <div class="text-muted">RUC ${esc(c.ruc)}</div>
            </div>
            <div class="col-md-4">
              <span class="text-muted d-block">Fecha de envío</span>
              <strong>${esc(fmtFecha(c.fecha_presentacion))}</strong>
              <div class="mt-1">
                <span class="badge bg-${badgeValidacion(c.validacion_estado)}">${esc(c.validacion_estado || 'Pendiente validación')}</span>
              </div>
            </div>
            <div class="col-md-4">
              <span class="text-muted d-block">Monto total ofertado</span>
              <strong>${fmtMonto(c.monto, c.moneda)}</strong>
            </div>
            <div class="col-md-8">
              <span class="text-muted d-block">Contacto proveedor</span>
              ${esc(datos.persona_contacto || '—')} · ${esc(datos.correo || '—')} · ${esc(datos.celular || '—')}
            </div>
          </div>
        </div>
      </div>
      <ul class="nav nav-tabs mb-3" role="tablist">
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#${id}_tabDocs" type="button">Documentos</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#${id}_tabTec" type="button">Propuesta técnica</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#${id}_tabEco" type="button">Propuesta económica</button></li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="${id}_tabDocs">
          ${renderDocumentosList(c.id, c.documentos)}
        </div>
        <div class="tab-pane fade" id="${id}_tabTec">
          ${renderItemsTecnicos(c.propuesta_tecnica?.items)}
        </div>
        <div class="tab-pane fade" id="${id}_tabEco">
          ${renderPrecios(c.propuesta_economica?.precios)}
          <div class="mt-2 small text-muted">Validez de la oferta: ${esc(datos.validez_oferta || '—')}</div>
        </div>
      </div>`;
    bindDocumentoButtons(body);
  } catch (err) {
    document.getElementById(`${id}_body`).innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

async function loadCotizaciones() {
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;
  try {
    const resp = await contratacionesService.listRecepcionCotizaciones();
    const rows = resp.data || [];
    cotizacionesCache = rows;
    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay cotizaciones recibidas de proveedores.</div>';
      return;
    }
    cont.innerHTML = `
      <table class="table table-sm table-hover table-bordered">
        <thead class="table-light"><tr>
          <th>Solicitud</th><th>Proveedor</th><th>Monto ofertado</th><th>Fecha recepción</th><th>Validación</th><th>Acciones</th>
        </tr></thead>
        <tbody>${rows.map((c) => `
          <tr>
            <td>
              <strong>${esc(c.solicitud_codigo)}</strong>
              <div class="small text-muted">${esc((c.denominacion || c.objeto || '').slice(0, 60))}</div>
            </td>
            <td><small>${esc(c.ruc)}</small><br>${esc(c.razon_social)}</td>
            <td class="text-end">${fmtMonto(c.monto, c.moneda)}</td>
            <td class="small">${esc(fmtFecha(c.fecha_presentacion || c.created_at))}</td>
            <td><span class="badge bg-${badgeValidacion(c.validacion_estado)}">${esc(c.validacion_estado || 'Pendiente')}</span></td>
            <td class="text-nowrap">
              <button type="button" class="btn btn-sm btn-primary rc-ver" data-id="${c.id}">Ver propuesta</button>
            </td>
          </tr>`).join('')}</tbody>
      </table>`;

    cont.querySelectorAll('.rc-ver').forEach((btn) => {
      btn.onclick = () => showCotizacionDetalleModal(btn.dataset.id);
    });
  } catch (err) {
    cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

export function initRecepcionCotizacionesView() {
  bindBandejaToolbar({
    prefix: VIEW_CONFIG.prefix,
    onFilter: () => loadCotizaciones(),
    onClear: () => loadCotizaciones(),
    onExecutiveToggle: () => loadCotizaciones(),
  });
  const reload = document.getElementById(`${VIEW_CONFIG.prefix}Reload`);
  if (reload) reload.onclick = () => loadCotizaciones();
  loadCotizaciones();
}

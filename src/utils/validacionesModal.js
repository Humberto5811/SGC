/**
 * Modal Validar — RC7.7A + RC7.7B (formatos institucionales Bienes/Servicios).
 */
import { contratacionesService } from '../services/contratacionesService.js';
import { authService } from '../services/authService.js';
import { api } from '../services/apiService.js';
import { getUserDisplayName } from './userDisplay.js';
import { downloadAnexo07A, triggerPdfUpload } from './validacionAnexo07aPdf.js';
import { openBase64Document, previewAdjuntoById } from './documentViewer.js';
import {
  canDerivarValidacion,
  buildExpedienteLineaCompacta,
  formatFaltantesHtml,
  resolverDestinoCliente,
} from './validacionesDerivarLogic.js';
import {
  renderMatrizValidacion,
  collectMatrizFromDom,
  bindMatrizUi,
} from './validacionMatrizUi.js';
import { buildValidationReportData } from './validacionReportData.js';

export { canDerivarValidacion, buildExpedienteLineaCompacta, formatFaltantesHtml, resolverDestinoCliente };

const API_BASE = 'http://localhost:3000/api';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function authHeaders() {
  try {
    const raw = localStorage.getItem('currentUser');
    if (raw) {
      const user = JSON.parse(raw);
      const h = {};
      if (user?.id) h['x-user-id'] = String(user.id);
      const full = [user.apellidos, user.nombres].filter(Boolean).join(' ').trim();
      h['x-user-name'] = full || user.nombre || user.username || user.dni || '';
      return h;
    }
  } catch (_) { /* noop */ }
  return {};
}

function fmtFecha(iso) {
  if (!iso) return '—';
  return String(iso).slice(0, 16).replace('T', ' ');
}

function fmtBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

function showErr(prefix, msg) {
  const errBox = document.getElementById(`${prefix}_err`);
  if (!errBox) return;
  errBox.textContent = msg;
  errBox.classList.remove('d-none');
}

function hideErr(prefix) {
  document.getElementById(`${prefix}_err`)?.classList.add('d-none');
}

function showOk(prefix, msg) {
  const okBox = document.getElementById(`${prefix}_ok`);
  if (!okBox) return;
  okBox.textContent = msg;
  okBox.classList.remove('d-none');
}

const SI_NO_OPTS = ['', 'Sí', 'No'];
const CUMPLE_OPTS = ['', 'SI CUMPLE', 'NO CUMPLE'];
const RESULTADO_OPTS = ['', 'Especificaciones Técnicas válidas', 'Especificaciones Técnicas NO válidas'];
const CUMPLE_GLOBAL_OPTS = ['', 'Cumple', 'No cumple'];

async function openCotizacionDoc(cotId, ref, inline = true) {
  const url = `${API_BASE}/contrataciones/portal-analista/cotizaciones/${cotId}/documento/${encodeURIComponent(ref)}/${inline ? 'ver' : 'descargar'}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'No se pudo abrir el documento');
  }
  const blob = await res.blob();
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  const mime = res.headers.get('Content-Type') || blob.type || 'application/octet-stream';
  const disp = res.headers.get('Content-Disposition') || '';
  const m = disp.match(/filename="([^"]+)"/);
  const nombre = m ? decodeURIComponent(m[1]) : 'documento';
  if (inline) {
    openBase64Document({ nombre, mime_type: mime, contenido_base64: b64 });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function openReqAdjunto(adjuntoId, nombre, inline = true) {
  if (inline) {
    await previewAdjuntoById(adjuntoId, nombre);
    return;
  }
  const res = await api.get(`/adjuntos/descargar/${adjuntoId}`);
  if (!res?.contenido_base64) throw new Error('No se pudo abrir el adjunto');
  const a = document.createElement('a');
  a.href = `data:${res.mime_type || 'application/octet-stream'};base64,${res.contenido_base64}`;
  a.download = nombre || res.nombre_archivo || 'adjunto';
  a.click();
}

function openPdfBase64(pdf, inline = true) {
  if (!pdf?.base64) throw new Error('PDF no disponible');
  if (inline) {
    openBase64Document({
      nombre: pdf.nombre || 'validacion.pdf',
      mime_type: pdf.mime_type || 'application/pdf',
      contenido_base64: pdf.base64,
    });
    return;
  }
  const a = document.createElement('a');
  a.href = `data:${pdf.mime_type || 'application/pdf'};base64,${pdf.base64}`;
  a.download = pdf.nombre || 'validacion.pdf';
  a.click();
}

function renderExpedienteLinea(d) {
  const full = buildExpedienteLineaCompacta(d);
  return `
    <div class="val-exp-line border rounded px-2 py-1 mb-3 small bg-light text-truncate"
      style="line-height:1.45;max-width:100%" title="${esc(full)}">
      ${esc(full)}
    </div>`;
}

function renderProveedoresTable(filas, viewingKey) {
  if (!filas?.length) {
    return '<div class="alert alert-light border small mb-0">No hay empresas en validación para esta solicitud.</div>';
  }
  return `
    <style>
      .val-prov-table tr.val-prov-viewing > td,
      .val-prov-table tr.val-prov-viewing > th {
        background-color: #cff4fc !important;
        --bs-table-bg: #cff4fc;
        --bs-table-bg-state: #cff4fc;
        --bs-table-accent-bg: #cff4fc;
      }
      .val-prov-table tr.val-prov-viewing:hover > td {
        background-color: #b6effb !important;
      }
      .val-prov-table .val-prov-desc {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        max-width: 100%;
      }
      .val-prov-table .val-prov-badge {
        display: inline-block;
        margin-top: .2rem;
      }
    </style>
    <div class="table-responsive val-prov-scroll" style="max-height:280px">
      <table class="table table-sm table-hover table-bordered align-middle mb-0 val-prov-table">
        <thead class="table-light sticky-top">
          <tr>
            <th style="width:20%">Proveedor</th>
            <th style="width:12%">RUC</th>
            <th style="width:12%">Requerimiento</th>
            <th style="width:32%">Descripción</th>
            <th style="width:10%">Centro</th>
            <th style="width:14%">Documentos</th>
          </tr>
        </thead>
        <tbody>
          ${filas.map((p) => {
            const key = `${p.cotizacion_id}:${p.requerimiento_id || ''}`;
            const viewing = key === viewingKey;
            const desc = p.descripcion || '—';
            return `
              <tr class="${viewing ? 'val-prov-viewing table-info' : ''}" data-row-key="${esc(key)}"
                data-cot-id="${p.cotizacion_id}" data-req-id="${p.requerimiento_id || ''}"
                data-req-codigo="${esc(p.requerimiento_codigo || '')}"
                data-viewing="${viewing ? '1' : '0'}">
                <td class="small fw-semibold">${esc(p.razon_social || '—')}
                  ${viewing ? '<span class="badge bg-info-subtle text-info border val-prov-badge">Documentos en vista</span>' : ''}
                </td>
                <td class="small">${esc(p.ruc || '—')}</td>
                <td class="small">${esc(p.requerimiento_codigo || '—')}</td>
                <td class="small" title="${esc(desc)}">
                  <div class="val-prov-desc">${esc(desc)}</div>
                </td>
                <td class="small">${esc(p.centro || '—')}</td>
                <td>
                  <button type="button" class="btn btn-sm btn-outline-primary val-ver-docs"
                    data-cot-id="${p.cotizacion_id}"
                    data-req-id="${p.requerimiento_id || ''}"
                    data-req-codigo="${esc(p.requerimiento_codigo || '')}"
                    data-razon="${esc(p.razon_social || '')}"
                    data-ruc="${esc(p.ruc || '')}"
                    title="Solo visualiza documentos; no selecciona ganador">
                    <i class="bi bi-eye"></i> Ver documentos
                  </button>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderDocsPanel(meta, docsCot, docsReq) {
  const rows = [
    ...(docsCot || []).map((d) => ({ ...d, _kind: 'cot', _cat: 'Técnico proveedor' })),
    ...(docsReq || []).map((d) => ({ ...d, _kind: 'req', _cat: 'Requerimiento' })),
  ];
  return `
    <div class="border rounded p-2 mt-2" id="valDocsPanel">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-1">
        <div class="small">
          <span class="badge bg-info-subtle text-info border me-1">En visualización</span>
          <strong>${esc(meta.razon_social)}</strong>
          <span class="text-muted"> · RUC ${esc(meta.ruc)}</span>
          <span class="text-muted"> · ${esc(meta.requerimiento_codigo || '—')}</span>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-val-ui="cerrar-docs">Cerrar documentos</button>
      </div>
      ${!rows.length
        ? '<div class="alert alert-warning small py-2 mb-0">No hay documentos para este proveedor y requerimiento.</div>'
        : `<div class="table-responsive val-docs-scroll" style="max-height:min(52vh,420px);overflow:auto">
            <table class="table table-sm table-bordered align-middle mb-0">
              <thead class="table-light sticky-top">
                <tr>
                  <th>Documento</th><th>Categoría</th><th>Tipo</th><th>Fecha</th><th>Estado</th><th style="width:150px">Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((d) => {
                  const isReq = d._kind === 'req' || d.fuente === 'Requerimiento' || String(d.ref || '').startsWith('req_adj_');
                  const actions = isReq
                    ? `<button type="button" class="btn btn-sm btn-outline-secondary val-req-ver" data-adj-id="${d.id}" data-nombre="${esc(d.nombre)}" data-mime="${esc(d.mime_type || '')}">Ver</button>
                       <button type="button" class="btn btn-sm btn-outline-primary val-req-dl" data-adj-id="${d.id}" data-nombre="${esc(d.nombre)}">Descargar</button>`
                    : `<button type="button" class="btn btn-sm btn-outline-secondary val-cot-ver" data-cot-id="${meta.cotizacion_id}" data-ref="${esc(d.ref)}">Ver</button>
                       <button type="button" class="btn btn-sm btn-outline-primary val-cot-dl" data-cot-id="${meta.cotizacion_id}" data-ref="${esc(d.ref)}">Descargar</button>`;
                  return `<tr>
                    <td class="small">${esc(d.nombre)}</td>
                    <td class="small">${esc(d._cat)}</td>
                    <td class="small">${esc(d.tipo || d.grupo || d.mime_type || d.fuente || '—')}</td>
                    <td class="small">${esc(fmtFecha(d.fecha || d.created_at))}</td>
                    <td class="small"><span class="badge bg-secondary">${esc(d.estado || 'Presentado')}</span></td>
                    <td><div class="btn-group btn-group-sm">${actions}</div></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}
    </div>`;
}

function renderFormRow(it, idx, readonly) {
  const dis = readonly ? ' disabled' : '';
  const ro = readonly ? ' readonly' : '';
  const sel = (opts, val, field) =>
    `<select class="form-select form-select-sm val-f-${field}" data-idx="${idx}"${dis}>
      ${opts.map((o) => `<option value="${esc(o)}"${o === val ? ' selected' : ''}>${esc(o || '—')}</option>`).join('')}
    </select>`;
  return `
    <tr data-idx="${idx}">
      <td class="small text-center">${esc(it.item)}</td>
      <td class="small">${esc(it.nro_req)}</td>
      <td class="small">${esc(it.descripcion)}</td>
      <td class="small text-center">${esc(it.cantidad)}</td>
      <td class="small">${esc(it.marca)}</td>
      <td class="small">${esc(it.procedencia)}</td>
      <td>${sel(SI_NO_OPTS, it.inserto, 'inserto')}</td>
      <td>${sel(SI_NO_OPTS, it.certificado, 'certificado')}</td>
      <td><input class="form-control form-control-sm val-f-obs_specs" data-idx="${idx}" value="${esc(it.obs_specs)}"${ro}></td>
      <td>${sel(CUMPLE_OPTS, it.acredita_doc, 'acredita_doc')}</td>
      <td>${sel(CUMPLE_OPTS, it.vigencia_minima_val, 'vigencia_minima_val')}</td>
      <td>${sel(CUMPLE_OPTS, it.plazos_entrega_val, 'plazos_entrega_val')}</td>
      <td>${sel(RESULTADO_OPTS, it.resultado, 'resultado')}</td>
      <td><input class="form-control form-control-sm val-f-obs_validacion" data-idx="${idx}" value="${esc(it.obs_validacion)}"${ro}></td>
    </tr>`;
}

function collectFormulario(prefix, baseForm) {
  const items = (baseForm.items || []).map((it, idx) => {
    const row = document.querySelector(`#${prefix}_form tr[data-idx="${idx}"]`);
    if (!row) return { ...it };
    const get = (cls) => row.querySelector(`.val-f-${cls}`)?.value ?? it[cls] ?? '';
    return {
      ...it,
      inserto: get('inserto'),
      certificado: get('certificado'),
      obs_specs: get('obs_specs'),
      acredita_doc: get('acredita_doc'),
      vigencia_minima_val: get('vigencia_minima_val'),
      plazos_entrega_val: get('plazos_entrega_val'),
      resultado: get('resultado'),
      obs_validacion: get('obs_validacion'),
    };
  });
  return {
    items,
    lugar: baseForm.lugar || 'Chorrillos',
    fecha: baseForm.fecha || new Date().toLocaleDateString('es-PE'),
    profesional: baseForm.profesional || '',
    producto_adquisicion: baseForm.producto_adquisicion,
    resultado_global: document.getElementById(`${prefix}_resGlobal`)?.value || '',
    observacion_global: document.getElementById(`${prefix}_obsGlobal`)?.value
      || (baseForm.items || []).map((it) => it.obs_validacion).filter(Boolean).join(' | ')
      || '',
    sustento: '',
    cumple: document.getElementById(`${prefix}_cumple`)?.value || '',
  };
}

function renderPdfInfo(prefix, pdfAdjunto, readonly, onQuitar) {
  const info = document.getElementById(`${prefix}_pdfInfo`);
  if (!info) return;
  if (pdfAdjunto?.base64) {
    info.className = 'small mt-2';
    info.innerHTML = `
      <div class="d-flex flex-wrap align-items-center gap-2">
        <span class="text-success"><i class="bi bi-check-circle"></i> PDF adjunto: <strong>${esc(pdfAdjunto.nombre)}</strong></span>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-val-ui="pdf-ver"><i class="bi bi-eye"></i> Ver</button>
        <button type="button" class="btn btn-sm btn-outline-primary" data-val-ui="pdf-dl"><i class="bi bi-download"></i> Descargar</button>
        ${readonly ? '' : `
          <button type="button" class="btn btn-sm btn-primary px-2 py-1" data-val-ui="pdf-quitar"
            style="color:#fff;min-width:72px;line-height:1.2">Eliminar</button>`}
      </div>`;
    info.querySelector('[data-val-ui="pdf-ver"]')?.addEventListener('click', () => {
      try { openPdfBase64(pdfAdjunto, true); } catch (err) { showErr(prefix, err.message); }
    });
    info.querySelector('[data-val-ui="pdf-dl"]')?.addEventListener('click', () => {
      try { openPdfBase64(pdfAdjunto, false); } catch (err) { showErr(prefix, err.message); }
    });
    if (!readonly) {
      info.querySelector('[data-val-ui="pdf-quitar"]')?.addEventListener('click', onQuitar);
    }
  } else {
    info.className = 'small mt-2 text-muted';
    info.textContent = 'Sin PDF firmado adjunto aún.';
  }
}

function bindDocButtons(container, onErr) {
  container.querySelectorAll('.val-cot-ver').forEach((btn) => {
    btn.onclick = async () => {
      try { await openCotizacionDoc(btn.dataset.cotId, btn.dataset.ref, true); }
      catch (err) { onErr(err.message); }
    };
  });
  container.querySelectorAll('.val-cot-dl').forEach((btn) => {
    btn.onclick = async () => {
      try { await openCotizacionDoc(btn.dataset.cotId, btn.dataset.ref, false); }
      catch (err) { onErr(err.message); }
    };
  });
  container.querySelectorAll('.val-req-ver').forEach((btn) => {
    btn.onclick = async () => {
      try { await openReqAdjunto(btn.dataset.adjId, btn.dataset.nombre, true); }
      catch (err) { onErr(err.message || 'No se pudo previsualizar'); }
    };
  });
  container.querySelectorAll('.val-req-dl').forEach((btn) => {
    btn.onclick = async () => {
      try { await openReqAdjunto(btn.dataset.adjId, btn.dataset.nombre, false); }
      catch (err) { onErr(err.message); }
    };
  });
}

/**
 * Panel de destino en overlay fixed (z-index alto).
 * RC7.7A.2: no depende del stacking del modal-fullscreen ni de HTML disabled en Derivar.
 */
function showDestinoDerivacionPanel(_parentEl, { resultado, cumple, onConfirm, onCancel }) {
  return new Promise((resolve) => {
    const id = `valDestPanel_${Date.now()}`;
    document.querySelectorAll('.val-dest-overlay').forEach((n) => n.remove());
    const overlay = document.createElement('div');
    overlay.className = 'val-dest-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2000',
      'background:rgba(15,23,42,.55)', 'display:flex',
      'align-items:center', 'justify-content:center', 'padding:1rem',
    ].join(';');
    overlay.innerHTML = `
      <div class="card shadow border-0" style="width:min(520px,100%);max-height:90vh;overflow:auto" id="${id}">
        <div class="card-header bg-light d-flex justify-content-between align-items-center py-2">
          <strong><i class="bi bi-send"></i> Derivar expediente</strong>
          <button type="button" class="btn-close" data-val-dest="cancel" aria-label="Cerrar"></button>
        </div>
        <div class="card-body" id="${id}_body">
          <div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span> Cargando destino…</div>
        </div>
        <div class="card-footer d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-secondary" data-val-dest="cancel">Cancelar</button>
          <button type="button" class="btn btn-success" data-val-dest="ok" disabled>Confirmar derivación</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const body = overlay.querySelector(`#${id}_body`);
    const btnOk = overlay.querySelector('[data-val-dest="ok"]');
    let closed = false;
    const close = (result) => {
      if (closed) return;
      closed = true;
      overlay.remove();
      resolve(result);
    };
    overlay.querySelectorAll('[data-val-dest="cancel"]').forEach((b) => {
      b.onclick = (ev) => { ev.preventDefault(); if (onCancel) onCancel(); close(null); };
    });

    (async () => {
      try {
        let dest = null;
        try {
          const destResp = await contratacionesService.getDestinosSalidaValidacion(resultado, cumple);
          dest = destResp.data?.destino || null;
        } catch (_) { /* fallback cliente */ }
        if (!dest?.code) dest = resolverDestinoCliente(resultado, cumple);
        if (!dest?.code) throw new Error('No se pudo resolver el destino oficial');

        const usersResp = await contratacionesService.listValidacionUsuarios(dest.code, '');
        const usuarios = usersResp.data || [];
        body.innerHTML = `
          <div class="mb-2 small"><span class="text-muted">Resultado de la validación</span>
            <div class="fw-semibold">${esc(resultado)}</div></div>
          <div class="mb-2">
            <label class="form-label fw-semibold">Submódulo destino</label>
            <select class="form-select form-select-sm" id="${id}_sub" disabled>
              <option value="${esc(dest.code)}" selected>${esc(dest.label)}</option>
            </select>
            ${dest.nota ? `<div class="form-text small">${esc(dest.nota)}</div>` : ''}
          </div>
          <div class="mb-2">
            <label class="form-label fw-semibold">Usuario responsable</label>
            <select class="form-select form-select-sm" id="${id}_resp">
              <option value="">Seleccione…</option>
              ${usuarios.map((u) => `<option value="${u.id}" data-nombre="${esc(u.nombre)}">${esc(u.nombre)}${u.cargo ? ` — ${esc(u.cargo)}` : ''}</option>`).join('')}
            </select>
            ${!usuarios.length ? '<div class="text-danger small mt-1">No existen usuarios habilitados para el destino seleccionado.</div>' : ''}
          </div>
          <div class="mb-0">
            <label class="form-label fw-semibold">Observación de derivación</label>
            <textarea class="form-control form-control-sm" id="${id}_obs" rows="2" placeholder="Opcional"></textarea>
          </div>
          <div id="${id}_err" class="alert alert-danger d-none py-2 mt-2 mb-0 small"></div>
          <div id="${id}_busy" class="alert alert-info d-none py-2 mt-2 mb-0 small">Derivando expediente…</div>`;

        const sync = () => {
          btnOk.disabled = !usuarios.length || !overlay.querySelector(`#${id}_resp`)?.value;
        };
        overlay.querySelector(`#${id}_resp`)?.addEventListener('change', sync);
        sync();

        btnOk.onclick = async (ev) => {
          ev.preventDefault();
          const sel = overlay.querySelector(`#${id}_resp`);
          const opt = sel?.selectedOptions?.[0];
          const errBox = overlay.querySelector(`#${id}_err`);
          const busy = overlay.querySelector(`#${id}_busy`);
          if (!sel?.value || !opt) {
            if (errBox) {
              errBox.textContent = 'Seleccione el usuario responsable.';
              errBox.classList.remove('d-none');
            }
            return;
          }
          btnOk.disabled = true;
          if (busy) busy.classList.remove('d-none');
          if (errBox) errBox.classList.add('d-none');
          try {
            const destPayload = {
              destino_submodulo: dest.code,
              destino: dest.code,
              responsable_destino_id: parseInt(sel.value, 10),
              responsable_id: parseInt(sel.value, 10),
              responsable_destino_nombre: opt.dataset.nombre || opt.textContent,
              responsable_nombre: opt.dataset.nombre || opt.textContent,
              observacion_derivacion: overlay.querySelector(`#${id}_obs`)?.value || '',
            };
            await onConfirm(destPayload);
            close(destPayload);
          } catch (err) {
            console.error('[Validaciones] Error al derivar:', err);
            if (busy) busy.classList.add('d-none');
            if (errBox) {
              errBox.textContent = err.message || 'Error al derivar';
              errBox.classList.remove('d-none');
            }
            btnOk.disabled = false;
          }
        };
      } catch (err) {
        console.error('[Validaciones] Error abriendo destino:', err);
        body.innerHTML = `<div class="alert alert-danger mb-0">${esc(err.message)}</div>`;
      }
    })();
  });
}

export async function showValidarModal(cotIdInicial, onDone, opts = {}) {
  const esAdmin = !!opts.esAdmin;
  const id = `valModal_${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-fullscreen">
        <div class="modal-content">
          <div class="modal-header bg-light py-2">
            <h5 class="modal-title"><i class="bi bi-shield-check"></i> Validar expediente</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${id}_body"><div class="text-center py-4"><span class="spinner-border"></span></div></div>
          <div class="modal-footer flex-wrap gap-2" id="${id}_footer">
            <div id="${id}_footerMsg" class="w-100 d-none alert alert-danger py-2 mb-0 small"></div>
            <button type="button" class="btn btn-outline-dark" data-val-act="pdf"><i class="bi bi-download"></i> Descargar formato</button>
            <button type="button" class="btn btn-outline-primary" data-val-act="adj"><i class="bi bi-paperclip"></i> Adjuntar firmado</button>
            <button type="button" class="btn btn-outline-secondary" data-val-act="guardar"><i class="bi bi-save"></i> Guardar avance</button>
            <button type="button" class="btn btn-success"
              id="${id}_btnDerivar"
              data-action="derivar-expediente"
              data-val-act="derivar"
              data-cotizacion-id="${esc(cotIdInicial)}"
              aria-disabled="true"
              title="Complete la validación">
              <i class="bi bi-send"></i> Derivar expediente
            </button>
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

  const state = {
    detalle: null,
    pdfAdjunto: null,
    documentoFirmado: null,
    formulario: null,
    cotId: cotIdInicial,
    cotizacionId: cotIdInicial,
    solicitudId: null,
    requerimientoId: null,
    resultado: '',
    observaciones: '',
    cumple: '',
    sustento: '',
    documentoFirmadoId: null,
    usuarioActual: getUserDisplayName(authService.getCurrentUser()),
    responsableActual: '',
    estadoValidacion: '',
    derivado: false,
    destinoOficial: null,
    matriz_v2: null,
    tipoFormato: null,
    checkMatriz: null,
    esAdmin,
    selectedKey: '',
    cacheDetalle: new Map(),
    derivando: false,
  };
  const body = document.getElementById(`${id}_body`);
  const footer = document.getElementById(`${id}_footer`);
  const footerMsg = () => document.getElementById(`${id}_footerMsg`);

  const syncStateFromForm = () => {
    if (state.matriz_v2?.filas) {
      const collected = collectMatrizFromDom(id, state.matriz_v2);
      state.matriz_v2 = collected.matriz_v2;
      state.formulario = {
        ...collected.formulario_07a,
        producto_adquisicion: state.detalle?.descripcion || state.detalle?.denominacion || '',
        profesional: collected.formulario_07a.profesional
          || state.detalle?.formulario_07a?.profesional
          || state.usuarioActual,
      };
      state.checkMatriz = collected.checkCompleta;
    } else {
      const f = state.detalle?.formulario_07a;
      state.formulario = f ? collectFormulario(id, f) : state.formulario;
    }
    if (state.formulario) {
      state.resultado = state.formulario.resultado_global || '';
      state.observaciones = state.formulario.observacion_global || '';
      state.cumple = state.formulario.cumple || '';
      state.sustento = state.formulario.sustento || '';
      state.destinoOficial = state.resultado
        ? resolverDestinoCliente(state.resultado, state.cumple)
        : null;
    }
    state.documentoFirmado = state.pdfAdjunto;
    state.cotizacionId = state.cotId;
    return state.formulario;
  };

  const showFooterMsg = (htmlOrText, isError = true) => {
    const box = footerMsg();
    if (!box) return;
    box.classList.remove('d-none', 'alert-danger', 'alert-success', 'alert-info');
    box.classList.add(isError ? 'alert-danger' : 'alert-success');
    box.innerHTML = htmlOrText;
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const hideFooterMsg = () => {
    const box = footerMsg();
    if (box) { box.classList.add('d-none'); box.innerHTML = ''; }
  };

  const syncDerivarBtn = () => {
    const btn = footer.querySelector('[data-action="derivar-expediente"]')
      || footer.querySelector('[data-val-act="derivar"]');
    if (!btn) return;
    syncStateFromForm();
    const check = canDerivarValidacion(state);
    if (state.derivado || state.detalle?.ya_derivado) {
      btn.classList.add('d-none');
      btn.setAttribute('aria-disabled', 'true');
      btn.title = 'El expediente ya fue derivado anteriormente.';
      return;
    }
    btn.classList.remove('d-none');
    // RC7.7A.2: NO usar HTML disabled (traga el clic). Solo aria-disabled + estilo.
    btn.removeAttribute('disabled');
    btn.setAttribute('aria-disabled', check.ok ? 'false' : 'true');
    btn.title = check.tooltip || '';
    btn.classList.toggle('opacity-75', !check.ok);
    btn.dataset.cotizacionId = String(state.cotizacionId || '');
  };

  const setFooterEnabled = (enabled) => {
    footer.querySelectorAll('[data-val-act]').forEach((b) => {
      if (b.dataset.valAct === 'derivar' || b.dataset.action === 'derivar-expediente') return;
      b.disabled = !enabled;
    });
  };

  const paintPdf = () => {
    renderPdfInfo(id, state.pdfAdjunto, !state.detalle?.puede_editar, async () => {
      if (!state.detalle?.puede_editar) return;
      state.pdfAdjunto = null;
      state.documentoFirmado = null;
      state.documentoFirmadoId = null;
      try {
        await contratacionesService.guardarValidacionParcial(state.cotId, {
          quitar_pdf: true,
          formulario_07a: syncStateFromForm(),
        }, esAdmin);
      } catch (err) { showErr(id, err.message); showFooterMsg(esc(err.message)); return; }
      paintPdf();
      syncDerivarBtn();
    });
  };

  const clearDocsPanel = () => {
    document.getElementById('valDocsPanel')?.remove();
  };

  const paintProveedores = () => {
    const host = document.getElementById(`${id}_docsHost`);
    if (!host || !state.detalle) return;
    const filas = state.detalle.proveedores_solicitud || [];
    const hayVista = !!state.selectedKey;
    host.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <h6 class="fw-semibold mb-0">Empresas que presentaron cotización</h6>
        <span class="small text-muted">Pulse <strong>Ver documentos</strong> para revisar la documentación de cada proveedor</span>
      </div>
      ${renderProveedoresTable(filas, state.selectedKey)}
      <div id="${id}_docsPanelHost" class="mt-2">
        ${hayVista ? '' : '<p class="small text-muted mb-0 mt-2">No hay documentación abierta. Seleccione un proveedor con el botón Ver documentos.</p>'}
      </div>`;
  };

  async function loadProveedorDocs(btn) {
    hideErr(id);
    const cotId = btn.dataset.cotId;
    const reqId = btn.dataset.reqId || '';
    const reqCodigo = btn.dataset.reqCodigo || '';
    const key = `${cotId}:${reqId}`;
    state.selectedKey = key;
    paintProveedores();
    const panelHost = document.getElementById(`${id}_docsPanelHost`);
    if (panelHost) {
      panelHost.innerHTML = '<div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span> Cargando documentación…</div>';
    }
    try {
      let detalle = state.cacheDetalle.get(String(cotId));
      if (!detalle) {
        const resp = await contratacionesService.getValidacionTrabajo(cotId, esAdmin);
        detalle = resp.data;
        state.cacheDetalle.set(String(cotId), detalle);
      }
      const docsCot = detalle.documentos_cotizacion || detalle.documentos_tecnicos || [];
      let docsReq = detalle.documentos_requerimiento || [];
      if (reqId) {
        docsReq = docsReq.filter((d) => String(d.requerimiento_id) === String(reqId));
      } else if (reqCodigo) {
        docsReq = docsReq.filter((d) => String(d.requerimiento_codigo) === String(reqCodigo));
      }
      if (!panelHost) return;
      panelHost.innerHTML = renderDocsPanel({
        cotizacion_id: cotId,
        razon_social: btn.dataset.razon || detalle.razon_social,
        ruc: btn.dataset.ruc || detalle.ruc,
        requerimiento_codigo: reqCodigo || detalle.requerimientos,
        viewing_only: true,
      }, docsCot, docsReq);
      bindDocButtons(panelHost, (msg) => showErr(id, msg));
      panelHost.querySelector('[data-val-ui="cerrar-docs"]')?.addEventListener('click', () => {
        state.selectedKey = '';
        clearDocsPanel();
        paintProveedores();
      });
    } catch (err) {
      if (panelHost) {
        panelHost.innerHTML = `<div class="alert alert-danger small mb-0">No se pudo cargar proveedor: ${esc(err.message)}</div>`;
      } else {
        showErr(id, err.message);
      }
    }
  }

  async function renderBody() {
    const d = state.detalle;
    const f = d.formulario_07a || {};
    const readonly = !d.puede_editar || !!d.ya_derivado;
    state.matriz_v2 = d.matriz_v2 || state.matriz_v2;
    state.tipoFormato = d.tipo_formato || state.tipoFormato;

    const matrizHtml = renderMatrizValidacion({
      prefix: id,
      matriz_v2: state.matriz_v2,
      tipoFormato: state.tipoFormato || d.tipo_contratacion,
      readonly,
      meta: {
        fecha: f.fecha || new Date().toLocaleDateString('es-PE'),
        profesional: f.profesional || state.usuarioActual,
        sustento: f.sustento || '',
        observacion_global: f.observacion_global || '',
      },
    });

    const obsRet = d.observacion_retorno;
    const obsBanner = obsRet?.texto
      ? `<div class="alert alert-warning small py-2 mb-2">
          <i class="bi bi-exclamation-triangle"></i>
          <strong>Observación del analista</strong>
          (${esc(obsRet.usuario || '—')} · ${esc(fmtFecha(obsRet.fecha))}):
          ${esc(obsRet.texto)}
          ${obsRet.estado_anterior ? `<span class="text-muted"> · Estado previo: ${esc(obsRet.estado_anterior)}</span>` : ''}
        </div>`
      : '';

    body.innerHTML = `
      <div class="alert alert-info small py-2 mb-2">
        <i class="bi bi-info-circle"></i> Solo evaluación técnica. La propuesta económica no está disponible para el área usuaria.
      </div>
      ${obsBanner}
      <ul class="nav nav-tabs mb-2" role="tablist">
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#${id}_tabDocs" type="button">Revisión de documentos</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#${id}_tabReg" type="button">Registro validación</button></li>
      </ul>
      ${renderExpedienteLinea(d)}
      <div class="tab-content">
        <div class="tab-pane fade show active" id="${id}_tabDocs">
          <div id="${id}_docsHost"></div>
        </div>
        <div class="tab-pane fade" id="${id}_tabReg">
          <div id="${id}_form">${matrizHtml}</div>
          <div id="${id}_pdfInfo" class="small mt-2 text-muted">Sin PDF firmado adjunto aún.</div>
          ${d.ya_derivado && d.destino_salida
            ? `<p class="small text-success mt-2 mb-0"><i class="bi bi-check2-circle"></i> ${esc(d.destino_salida.estado_bandeja || d.estado_bandeja)}</p>`
            : ''}
        </div>
      </div>
      <div id="${id}_ok" class="alert alert-success d-none py-2 mt-2 mb-0"></div>
      <div id="${id}_err" class="alert alert-danger d-none py-2 mt-2 mb-0"></div>`;

    setFooterEnabled(!readonly);
    paintPdf();
    // Solo lista de proveedores; documentos se cargan al pulsar "Ver documentos"
    state.selectedKey = '';
    paintProveedores();

    document.getElementById(`${id}_docsHost`)?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.val-ver-docs');
      if (btn) loadProveedorDocs(btn);
    });

    bindMatrizUi(id, {
      readonly,
      onChange: () => { hideFooterMsg(); syncDerivarBtn(); },
      onDocsClick: (btn) => {
        const tabBtn = body.querySelector(`[data-bs-target="#${id}_tabDocs"]`);
        if (tabBtn && window.bootstrap?.Tab) {
          window.bootstrap.Tab.getOrCreateInstance(tabBtn).show();
        }
        loadProveedorDocs(btn);
      },
    });

    syncStateFromForm();
    syncDerivarBtn();
  }

  async function handleDerivarClick(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    hideErr(id);
    hideFooterMsg();
    if (state.derivando) return;

    syncStateFromForm();
    if (state.checkMatriz && !state.checkMatriz.ok) {
      const msg = `No se puede derivar el expediente.<ul class="mb-0 mt-1">${(state.checkMatriz.errores || []).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
      showFooterMsg(msg, true);
      showErr(id, (state.checkMatriz.errores || []).join(' '));
      return;
    }
    const check = canDerivarValidacion(state);
    if (!check.ok) {
      showFooterMsg(formatFaltantesHtml(check), true);
      showErr(id, check.faltantes?.join(' ') || 'Validación incompleta');
      return;
    }

    const form = state.formulario;
    const cotizacionId = state.cotizacionId || state.cotId;
    try {
      await showDestinoDerivacionPanel(el, {
        resultado: form.resultado_global || state.resultado,
        cumple: form.cumple || state.cumple,
        onConfirm: async (dest) => {
          state.derivando = true;
          showFooterMsg('<span class="spinner-border spinner-border-sm me-1"></span> Derivando expediente…', false);
          const footerInfo = footerMsg();
          if (footerInfo) {
            footerInfo.classList.remove('alert-danger', 'alert-success');
            footerInfo.classList.add('alert-info');
          }
          try {
            const resp = await contratacionesService.enviarValidacion(cotizacionId, {
              formulario_07a: form,
              matriz_v2: state.matriz_v2,
              pdf_firmado: state.pdfAdjunto || state.documentoFirmado,
              resultado: form.resultado_global || state.resultado,
              observacion: form.observacion_global || state.observaciones,
              usuario: state.usuarioActual,
              destino_submodulo: dest.destino_submodulo || dest.destino,
              responsable_destino_id: dest.responsable_destino_id || dest.responsable_id,
              responsable_destino_nombre: dest.responsable_destino_nombre || dest.responsable_nombre,
              observacion_derivacion: dest.observacion_derivacion,
            }, esAdmin);

            const cot = resp.cotizacion || resp;
            if (cot?.idempotente || cot?.ya_derivado) {
              showFooterMsg('El expediente ya fue derivado anteriormente.', true);
              showOk(id, 'El expediente ya fue derivado anteriormente.');
            } else {
              const label = cot?.destino_salida?.estado_bandeja
                || resp.destino?.label
                || check.destino?.label
                || 'Expediente derivado';
              showFooterMsg(`Validación registrada. ${esc(label)}.`, false);
              showOk(id, `Validación registrada. ${label}.`);
            }

            state.derivado = true;
            state.estadoValidacion = cot?.validacion_estado || check.destino?.estado || 'APTO';
            state.responsableActual = dest.responsable_destino_nombre || dest.responsable_nombre || '';
            state.detalle = {
              ...state.detalle,
              puede_editar: false,
              puede_derivar: false,
              ya_derivado: true,
              validacion_estado: state.estadoValidacion,
              destino_salida: cot?.destino_salida || check.destino,
              estado_bandeja: cot?.destino_salida?.estado_bandeja || check.destino?.label,
            };
            setFooterEnabled(false);
            syncDerivarBtn();
            paintPdf();
            if (onDone) onDone();
          } catch (err) {
            console.error('[Validaciones] Error backend al derivar:', err);
            showFooterMsg(esc(err.message || 'Error al derivar'), true);
            showErr(id, err.message || 'Error al derivar');
            throw err;
          } finally {
            state.derivando = false;
          }
        },
      });
    } catch (err) {
      console.error('[Validaciones] Error al abrir selector de destino:', err);
      showFooterMsg(esc(err.message || 'Error al abrir selector de destino'), true);
      showErr(id, err.message || 'Error al abrir selector de destino');
    }
  }

  // Delegación estable sobre el modal root (no se pierde al rerender del body).
  // Un único listener. Derivar NO usa HTML disabled para no tragar el clic.
  el.addEventListener('click', async (ev) => {
    const derivarBtn = ev.target.closest('[data-action="derivar-expediente"], [data-val-act="derivar"]');
    if (derivarBtn && el.contains(derivarBtn)) {
      await handleDerivarClick(ev);
      return;
    }

    const btn = ev.target.closest('[data-val-act]');
    if (!btn || !el.contains(btn) || btn.disabled) return;
    const act = btn.dataset.valAct;
    if (act === 'derivar') return; // ya manejado
    const f = state.detalle?.formulario_07a;
    if (!f && act !== 'pdf') return;

    if (act === 'pdf') {
      hideErr(id);
      try {
        const form = syncStateFromForm();
        const report = buildValidationReportData(state.detalle || {}, {
          matriz_v2: state.matriz_v2,
          formulario_07a: form,
        });
        downloadAnexo07A({
          solicitud: {
            ...state.detalle,
            tipo_formato: report.tipoKey,
            tipo_contratacion: state.detalle?.tipo_contratacion || report.cabecera.tipo_label,
            area_usuaria: report.cabecera.area_usuaria,
            requerimientos: report.cabecera.requerimientos,
            descripcion: report.cabecera.descripcion,
            razon_social: report.cabecera.proveedor,
            ruc: report.cabecera.ruc,
          },
          formulario: {
            ...report.formulario_07a,
            lugar: 'Chorrillos',
          },
          matriz_v2: { ...report.matriz_v2, tipo: report.tipoKey },
        });
      } catch (err) { showErr(id, err.message); showFooterMsg(esc(err.message)); }
      return;
    }

    if (act === 'adj') {
      hideErr(id);
      hideFooterMsg();
      if (!state.detalle?.puede_editar) return;
      triggerPdfUpload((meta) => {
        state.pdfAdjunto = meta;
        state.documentoFirmado = meta;
        state.documentoFirmadoId = meta.nombre || null;
        paintPdf();
        syncDerivarBtn();
      }, { onError: (msg) => { showErr(id, msg); showFooterMsg(esc(msg)); } });
      return;
    }

    if (act === 'guardar') {
      hideErr(id);
      hideFooterMsg();
      btn.disabled = true;
      try {
        const form = syncStateFromForm();
        await contratacionesService.guardarValidacionParcial(state.cotId, {
          formulario_07a: form,
          matriz_v2: state.matriz_v2,
          pdf_firmado: state.pdfAdjunto?.base64 ? state.pdfAdjunto : undefined,
        }, esAdmin);
        showOk(id, 'Avance guardado correctamente.');
        showFooterMsg('Avance guardado correctamente.', false);
        if (onDone) onDone();
      } catch (err) { showErr(id, err.message); showFooterMsg(esc(err.message)); }
      finally { btn.disabled = false; syncDerivarBtn(); }
    }
  });

  try {
    const resp = await contratacionesService.getValidacionTrabajo(cotIdInicial, esAdmin);
    state.detalle = resp.data;
    state.pdfAdjunto = resp.data.pdf_firmado || null;
    state.documentoFirmado = state.pdfAdjunto;
    state.matriz_v2 = resp.data.matriz_v2 || null;
    state.tipoFormato = resp.data.tipo_formato || null;
    state.cotizacionId = resp.data.id || cotIdInicial;
    state.cotId = state.cotizacionId;
    state.solicitudId = resp.data.solicitud_id || null;
    state.requerimientoId = resp.data.requerimiento_id || null;
    state.estadoValidacion = resp.data.validacion_estado || '';
    state.derivado = !!resp.data.ya_derivado;
    state.responsableActual = resp.data.validacion_responsable || resp.data.responsable_nombre || '';
    state.resultado = resp.data.formulario_07a?.resultado_global || '';
    state.observaciones = resp.data.formulario_07a?.observacion_global || '';
    state.cumple = resp.data.formulario_07a?.cumple || '';
    state.sustento = resp.data.formulario_07a?.sustento || '';
    state.cacheDetalle.set(String(state.cotizacionId), resp.data);
    const derBtn = document.getElementById(`${id}_btnDerivar`);
    if (derBtn) derBtn.dataset.cotizacionId = String(state.cotizacionId);
    await renderBody();
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger mb-0">${esc(err.message)}</div>`;
    setFooterEnabled(false);
    showFooterMsg(esc(err.message));
    const derBtn = footer.querySelector('[data-action="derivar-expediente"]');
    if (derBtn) {
      derBtn.setAttribute('aria-disabled', 'true');
      derBtn.title = err.message;
    }
  }
}

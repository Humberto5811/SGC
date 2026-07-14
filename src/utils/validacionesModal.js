/**
 * Modal Validar — RC7.7.1 (2 pestañas + footer con delegación de eventos).
 */
import { contratacionesService } from '../services/contratacionesService.js';
import { adjuntosService } from '../services/adjuntosService.js';
import { authService } from '../services/authService.js';
import { getUserDisplayName } from './userDisplay.js';
import { downloadAnexo07A, triggerPdfUpload } from './validacionAnexo07aPdf.js';

const API_BASE = 'http://localhost:3000/api';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

function showErr(prefix, msg) {
  const errBox = document.getElementById(`${prefix}_err`);
  if (!errBox) return;
  errBox.textContent = msg;
  errBox.classList.remove('d-none');
}

function hideErr(prefix) {
  const errBox = document.getElementById(`${prefix}_err`);
  if (errBox) errBox.classList.add('d-none');
}

function showOk(prefix, msg) {
  const okBox = document.getElementById(`${prefix}_ok`);
  if (!okBox) return;
  okBox.textContent = msg;
  okBox.classList.remove('d-none');
  setTimeout(() => okBox.classList.add('d-none'), 3500);
}

async function openCotizacionDoc(cotId, ref, inline = false) {
  const url = `${API_BASE}/contrataciones/portal-analista/cotizaciones/${cotId}/documento/${encodeURIComponent(ref)}/${inline ? 'ver' : 'descargar'}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'No se pudo abrir el documento');
  }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  if (inline) {
    window.open(objUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    return;
  }
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = 'documento';
  a.click();
  setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
}

async function openReqAdjunto(adjuntoId, nombre, inline = true) {
  const res = await adjuntosService.descargarAdjunto(adjuntoId, nombre);
  if (!res?.contenido_base64) throw new Error('No se pudo abrir el adjunto');
  const mime = res.mime_type || 'application/octet-stream';
  const blob = await fetch(`data:${mime};base64,${res.contenido_base64}`).then((r) => r.blob());
  const objUrl = URL.createObjectURL(blob);
  if (inline) {
    window.open(objUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
  } else {
    await adjuntosService.descargarAdjunto(adjuntoId, nombre);
  }
}

const SI_NO_OPTS = ['', 'Sí', 'No'];
const CUMPLE_OPTS = ['', 'SI CUMPLE', 'NO CUMPLE'];
const RESULTADO_OPTS = ['', 'Especificaciones Técnicas válidas', 'Especificaciones Técnicas NO válidas'];
const CUMPLE_GLOBAL_OPTS = ['', 'Cumple', 'No cumple'];

function renderDocsCotizacion(cotId, docs) {
  if (!docs?.length) return '<div class="text-muted small">Sin documentos de cotización.</div>';
  return `<ul class="list-group list-group-flush border rounded mb-0">
    ${docs.map((d) => `
      <li class="list-group-item d-flex justify-content-between align-items-center py-2">
        <span class="small"><i class="bi bi-file-earmark-pdf text-danger"></i> ${esc(d.nombre)} <span class="text-muted">(${esc(d.grupo || d.fuente)})</span></span>
        <span class="btn-group btn-group-sm">
          <button type="button" class="btn btn-outline-secondary val-cot-ver" data-cot-id="${cotId}" data-ref="${esc(d.ref)}">Ver</button>
          <button type="button" class="btn btn-outline-primary val-cot-dl" data-cot-id="${cotId}" data-ref="${esc(d.ref)}">Descargar</button>
        </span>
      </li>`).join('')}
  </ul>`;
}

function renderDocsRequerimiento(docs) {
  if (!docs?.length) return '<div class="text-muted small">Sin documentos del requerimiento.</div>';
  return `<ul class="list-group list-group-flush border rounded mb-0">
    ${docs.map((d) => `
      <li class="list-group-item d-flex justify-content-between align-items-center py-2">
        <span class="small"><i class="bi bi-paperclip text-secondary"></i> ${esc(d.nombre)} <span class="text-muted">(${esc(d.grupo)})</span></span>
        <span class="btn-group btn-group-sm">
          <button type="button" class="btn btn-outline-secondary val-req-ver" data-adj-id="${d.id}" data-nombre="${esc(d.nombre)}">Ver</button>
          <button type="button" class="btn btn-outline-primary val-req-dl" data-adj-id="${d.id}" data-nombre="${esc(d.nombre)}">Descargar</button>
        </span>
      </li>`).join('')}
  </ul>`;
}

function bindDocButtons(container, onErr) {
  container.querySelectorAll('.val-cot-ver').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try { await openCotizacionDoc(btn.dataset.cotId, btn.dataset.ref, true); }
      catch (err) { onErr(err.message); }
    });
  });
  container.querySelectorAll('.val-cot-dl').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try { await openCotizacionDoc(btn.dataset.cotId, btn.dataset.ref, false); }
      catch (err) { onErr(err.message); }
    });
  });
  container.querySelectorAll('.val-req-ver').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try { await openReqAdjunto(btn.dataset.adjId, btn.dataset.nombre, true); }
      catch (err) { onErr(err.message); }
    });
  });
  container.querySelectorAll('.val-req-dl').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try { await openReqAdjunto(btn.dataset.adjId, btn.dataset.nombre, false); }
      catch (err) { onErr(err.message); }
    });
  });
}

function renderExpedienteHeader(d) {
  return `
    <div class="card border-0 bg-light mb-3">
      <div class="card-body py-3">
        <div class="row g-2 small">
          <div class="col-md-4"><span class="text-muted">N° Requerimiento</span><div class="fw-semibold">${esc(d.requerimientos || '—')}</div></div>
          <div class="col-md-4"><span class="text-muted">Solicitud de Cotización</span><div class="fw-semibold">${esc(d.solicitud_codigo)}</div></div>
          <div class="col-md-4"><span class="text-muted">Proveedor</span><div>${esc(d.razon_social)} <span class="text-muted">(RUC ${esc(d.ruc)})</span></div></div>
          <div class="col-md-3"><span class="text-muted">Tipo</span><div>${esc(d.tipo_contratacion || '—')}</div></div>
          <div class="col-md-5"><span class="text-muted">Descripción</span><div>${esc(d.descripcion || d.denominacion || '—')}</div></div>
          <div class="col-md-4"><span class="text-muted">Área Usuaria</span><div>${esc(d.area_usuaria || '—')}</div></div>
        </div>
      </div>
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
    lugar: document.getElementById(`${prefix}_lugar`)?.value || baseForm.lugar,
    fecha: document.getElementById(`${prefix}_fecha`)?.value || baseForm.fecha,
    profesional: document.getElementById(`${prefix}_prof`)?.value || baseForm.profesional,
    producto_adquisicion: baseForm.producto_adquisicion,
    resultado_global: document.getElementById(`${prefix}_resGlobal`)?.value || '',
    observacion_global: document.getElementById(`${prefix}_obsGlobal`)?.value || '',
    sustento: document.getElementById(`${prefix}_sustento`)?.value || '',
    cumple: document.getElementById(`${prefix}_cumple`)?.value || '',
  };
}

function renderPdfInfo(prefix, pdfAdjunto, onQuitar) {
  const info = document.getElementById(`${prefix}_pdfInfo`);
  if (!info) return;
  if (pdfAdjunto?.base64) {
    info.className = 'small mt-2 text-success';
    info.innerHTML = `<i class="bi bi-check-circle"></i> PDF adjunto: ${esc(pdfAdjunto.nombre)}
      <button type="button" class="btn btn-link btn-sm text-danger p-0 ms-2" id="${prefix}_pdfQuitar">Eliminar</button>`;
    document.getElementById(`${prefix}_pdfQuitar`)?.addEventListener('click', onQuitar);
  } else {
    info.className = 'small mt-2 text-muted';
    info.textContent = 'Sin PDF firmado adjunto aún.';
  }
}

export async function showValidarModal(cotId, onDone, opts = {}) {
  const esAdmin = !!opts.esAdmin;
  const id = `valModal_${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-fullscreen">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title"><i class="bi bi-shield-check"></i> Validar expediente</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${id}_body"><div class="text-center py-4"><span class="spinner-border"></span></div></div>
          <div class="modal-footer flex-wrap gap-2" id="${id}_footer">
            <button type="button" class="btn btn-outline-dark" data-val-act="pdf"><i class="bi bi-download"></i> Descargar formato</button>
            <button type="button" class="btn btn-outline-primary" data-val-act="adj"><i class="bi bi-paperclip"></i> Adjuntar firmado</button>
            <button type="button" class="btn btn-outline-secondary" data-val-act="guardar"><i class="bi bi-save"></i> Guardar avance</button>
            <button type="button" class="btn btn-success" data-val-act="derivar" disabled><i class="bi bi-send"></i> Derivar expediente</button>
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

  const state = { detalle: null, pdfAdjunto: null, cotId, esAdmin };
  const body = document.getElementById(`${id}_body`);
  const footer = document.getElementById(`${id}_footer`);

  const syncDerivarBtn = () => {
    const btn = footer.querySelector('[data-val-act="derivar"]');
    if (!btn || !state.detalle?.puede_editar) {
      if (btn) btn.disabled = true;
      return;
    }
    const f = state.detalle.formulario_07a;
    const form = f ? collectFormulario(id, f) : null;
    const ok = form?.resultado_global && form?.observacion_global?.trim() && state.pdfAdjunto?.base64;
    btn.disabled = !ok;
  };

  const setFooterEnabled = (enabled) => {
    footer.querySelectorAll('[data-val-act]').forEach((b) => {
      if (b.dataset.valAct === 'derivar') return;
      b.disabled = !enabled;
    });
  };

  footer.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-val-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.valAct;
    const f = state.detalle?.formulario_07a;
    if (!f && act !== 'derivar') return;

    if (act === 'pdf') {
      hideErr(id);
      try {
        if (!state.detalle) throw new Error('Expediente no cargado');
        downloadAnexo07A({ solicitud: state.detalle, formulario: collectFormulario(id, f) });
      } catch (err) { showErr(id, err.message); }
      return;
    }

    if (act === 'adj') {
      hideErr(id);
      triggerPdfUpload((meta) => {
        state.pdfAdjunto = meta;
        renderPdfInfo(id, meta, async () => {
          state.pdfAdjunto = null;
          try {
            await contratacionesService.guardarValidacionParcial(cotId, {
              quitar_pdf: true,
              formulario_07a: collectFormulario(id, f),
            }, esAdmin);
          } catch (err) { showErr(id, err.message); return; }
          renderPdfInfo(id, null, () => {});
          syncDerivarBtn();
        });
        syncDerivarBtn();
      });
      return;
    }

    if (act === 'guardar') {
      hideErr(id);
      btn.disabled = true;
      try {
        const form = collectFormulario(id, f);
        await contratacionesService.guardarValidacionParcial(cotId, {
          formulario_07a: form,
          pdf_firmado: state.pdfAdjunto?.base64 ? state.pdfAdjunto : undefined,
        }, esAdmin);
        showOk(id, 'Avance guardado correctamente.');
        if (onDone) onDone();
      } catch (err) { showErr(id, err.message); }
      finally { btn.disabled = false; }
      return;
    }

    if (act === 'derivar') {
      hideErr(id);
      const form = collectFormulario(id, f);
      if (!form.resultado_global) { showErr(id, 'Seleccione el resultado de la validación.'); return; }
      if (!form.observacion_global?.trim()) { showErr(id, 'Las observaciones técnicas son obligatorias.'); return; }
      if (!state.pdfAdjunto?.base64) { showErr(id, 'Adjunte el formato firmado antes de derivar.'); return; }
      btn.disabled = true;
      try {
        await contratacionesService.enviarValidacion(cotId, {
          formulario_07a: form,
          pdf_firmado: state.pdfAdjunto,
          resultado: form.resultado_global,
          observacion: form.observacion_global,
          usuario: getUserDisplayName(authService.getCurrentUser()),
        }, esAdmin);
        modal.hide();
        if (onDone) onDone();
        showOk(id, 'Validación registrada y expediente derivado.');
      } catch (err) {
        showErr(id, err.message);
        btn.disabled = false;
      }
    }
  });

  try {
    const resp = await contratacionesService.getValidacionTrabajo(cotId, esAdmin);
    state.detalle = resp.data;
    const f = state.detalle.formulario_07a;
    state.pdfAdjunto = state.detalle.pdf_firmado || null;
    const readonly = !state.detalle.puede_editar;

    body.innerHTML = `
      <div class="alert alert-info small py-2 mb-3">
        <i class="bi bi-info-circle"></i> Solo evaluación técnica. La propuesta económica no está disponible para el área usuaria.
      </div>
      <ul class="nav nav-tabs mb-3" role="tablist">
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#${id}_tabDocs" type="button">Revisión de Documentos</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#${id}_tabReg" type="button">Registro Validación</button></li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="${id}_tabDocs">
          ${renderExpedienteHeader(state.detalle)}
          <h6 class="fw-semibold">Documentos adjuntos recibidos (cotización)</h6>
          <p class="small text-muted">Solo lectura — no se pueden modificar los documentos originales.</p>
          <div class="mb-3" id="${id}_docsCot">${renderDocsCotizacion(cotId, state.detalle.documentos_cotizacion)}</div>
          <h6 class="fw-semibold">Documentos del requerimiento</h6>
          <div class="mb-0" id="${id}_docsReq">${renderDocsRequerimiento(state.detalle.documentos_requerimiento)}</div>
        </div>
        <div class="tab-pane fade" id="${id}_tabReg">
          <h6 class="fw-semibold text-muted mb-2">Información del expediente (solo lectura)</h6>
          ${renderExpedienteHeader(state.detalle)}
          <h6 class="fw-semibold mt-3">Información registrada por el área usuaria</h6>
          <div class="row g-2 mb-2">
            <div class="col-md-3"><label class="form-label small">Lugar</label><input class="form-control form-control-sm" id="${id}_lugar" value="${esc(f.lugar)}" ${readonly ? 'readonly' : ''}></div>
            <div class="col-md-3"><label class="form-label small">Fecha</label><input class="form-control form-control-sm" id="${id}_fecha" value="${esc(f.fecha)}" ${readonly ? 'readonly' : ''}></div>
            <div class="col-md-6"><label class="form-label small">Responsable</label><input class="form-control form-control-sm" id="${id}_prof" value="${esc(f.profesional)}" ${readonly ? 'readonly' : ''}></div>
          </div>
          <div class="table-responsive mb-2" id="${id}_form">
            <table class="table table-bordered table-sm mb-0" style="font-size:0.75rem">
              <thead class="table-primary text-center align-middle">
                <tr>
                  <th>Ítem</th><th>Nº REQ</th><th>Descripción</th><th>Cant.</th>
                  <th>Marca</th><th>Proced.</th><th>Inserto</th><th>Cert.</th><th>Obs.rec.</th>
                  <th>Doc.oblig.</th><th>Vigencia</th><th>Plazo</th><th>Resultado</th><th>Obs.valid.</th>
                </tr>
              </thead>
              <tbody>${f.items.map((it, idx) => renderFormRow(it, idx, readonly)).join('')}</tbody>
            </table>
          </div>
          <div class="row g-2">
            <div class="col-md-4">
              <label class="form-label small fw-semibold">Resultado de validación</label>
              <select class="form-select form-select-sm" id="${id}_resGlobal" ${readonly ? 'disabled' : ''}>
                ${RESULTADO_OPTS.map((o) => `<option value="${esc(o)}"${o === f.resultado_global ? ' selected' : ''}>${esc(o || 'Seleccione…')}</option>`).join('')}
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold">Cumple / No cumple</label>
              <select class="form-select form-select-sm" id="${id}_cumple" ${readonly ? 'disabled' : ''}>
                ${CUMPLE_GLOBAL_OPTS.map((o) => `<option value="${esc(o)}"${o === f.cumple ? ' selected' : ''}>${esc(o || 'Seleccione…')}</option>`).join('')}
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold">Sustento</label>
              <input class="form-control form-control-sm" id="${id}_sustento" value="${esc(f.sustento)}" ${readonly ? 'readonly' : ''}>
            </div>
            <div class="col-12">
              <label class="form-label small fw-semibold">Observaciones técnicas</label>
              <textarea class="form-control form-control-sm" id="${id}_obsGlobal" rows="2" ${readonly ? 'readonly' : ''}>${esc(f.observacion_global)}</textarea>
            </div>
          </div>
          <div id="${id}_pdfInfo" class="small mt-2 text-muted">Sin PDF firmado adjunto aún.</div>
          ${state.detalle.puede_editar ? '<p class="small text-muted mt-2 mb-0">Destino al derivar: <strong>Cuadro Comparativo (si cumple)</strong> o <strong>Recepción de Cotizaciones (si no cumple)</strong>.</p>' : ''}
        </div>
      </div>
      <div id="${id}_ok" class="alert alert-success d-none py-2 mt-2 mb-0"></div>
      <div id="${id}_err" class="alert alert-danger d-none py-2 mt-2 mb-0"></div>`;

    setFooterEnabled(!readonly);
    bindDocButtons(body, (msg) => showErr(id, msg));
    renderPdfInfo(id, state.pdfAdjunto, async () => {
      state.pdfAdjunto = null;
      try {
        await contratacionesService.guardarValidacionParcial(cotId, {
          quitar_pdf: true,
          formulario_07a: collectFormulario(id, f),
        }, esAdmin);
      } catch (err) { showErr(id, err.message); return; }
      renderPdfInfo(id, null, () => {});
      syncDerivarBtn();
    });

    body.querySelectorAll('select,input,textarea').forEach((el2) => {
      el2.addEventListener('change', syncDerivarBtn);
      el2.addEventListener('input', syncDerivarBtn);
    });
    syncDerivarBtn();
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger mb-0">${esc(err.message)}</div>`;
    setFooterEnabled(false);
    footer.querySelector('[data-val-act="derivar"]').disabled = true;
  }
}

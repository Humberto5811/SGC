// Validaciones — derivación CM y validación técnica del área usuaria (Anexo 07-A)
import { contratacionesService } from '../../services/contratacionesService.js';
import { authService } from '../../services/authService.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import { renderContratacionBandejaStub } from '../../utils/contratacionBandejaStub.js';
import { bindBandejaToolbar } from '../../utils/bandejaUi.js';
import { downloadAnexo07A, triggerPdfUpload } from '../../utils/validacionAnexo07aPdf.js';

const API_BASE = 'http://localhost:3000/api';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  return String(iso || '').slice(0, 16).replace('T', ' ');
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

function isUsuarioCm() {
  const u = authService.getCurrentUser();
  return u?.rol === 'admin' || u?.rol === 'dec';
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

async function openPdfValidacion(cotId, inline = true) {
  const url = `${API_BASE}/contrataciones/portal-analista/validaciones/${cotId}/pdf-validacion?inline=${inline ? '1' : '0'}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('PDF de validación no disponible');
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  if (inline) {
    window.open(objUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
  } else {
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = 'Validacion_Anexo_07A.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
  }
}

const VIEW_CONFIG = {
  prefix: 'validaciones',
  title: 'Validaciones',
  icon: 'bi-shield-check',
  description: 'Validación técnica de cotizaciones — la propuesta económica no se envía al área usuaria.',
  listId: 'validacionesList',
};

const SI_NO_OPTS = ['', 'Sí', 'No'];
const CUMPLE_OPTS = ['', 'SI CUMPLE', 'NO CUMPLE'];
const RESULTADO_OPTS = ['', 'Especificaciones Técnicas válidas', 'Especificaciones Técnicas NO válidas'];

function renderDocsList(cotId, docs, opts = {}) {
  if (!docs?.length) return '<div class="text-muted small">Sin documentos técnicos.</div>';
  return `<ul class="list-group list-group-flush border rounded mb-0">
    ${docs.map((d) => `
      <li class="list-group-item d-flex justify-content-between align-items-center py-2">
        <span class="small"><i class="bi bi-file-earmark-text text-primary"></i> ${esc(d.nombre)} <span class="text-muted">(${esc(d.grupo)})</span></span>
        ${opts.soloLista ? '' : `<span class="btn-group btn-group-sm">
          <button type="button" class="btn btn-outline-secondary val-doc-ver" data-cot-id="${cotId}" data-ref="${esc(d.ref)}">Ver</button>
          <button type="button" class="btn btn-outline-primary val-doc-dl" data-cot-id="${cotId}" data-ref="${esc(d.ref)}">Descargar</button>
        </span>`}
      </li>`).join('')}
  </ul>`;
}

function bindDocButtons(container) {
  container.querySelectorAll('.val-doc-ver').forEach((btn) => {
    btn.onclick = async () => {
      try { await openCotizacionDoc(btn.dataset.cotId, btn.dataset.ref, true); }
      catch (err) { alert(err.message); }
    };
  });
  container.querySelectorAll('.val-doc-dl').forEach((btn) => {
    btn.onclick = async () => {
      try { await openCotizacionDoc(btn.dataset.cotId, btn.dataset.ref, false); }
      catch (err) { alert(err.message); }
    };
  });
}

async function showDerivarModal(cotId) {
  const id = `valDer_${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title"><i class="bi bi-send"></i> Derivar validación técnica</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${id}_body"><div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></div></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="${id}_enviar" disabled>Derivar validación</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const el = document.getElementById(id);
  const modal = window.bootstrap.Modal.getOrCreateInstance(el);
  el.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
  modal.show();

  const body = document.getElementById(`${id}_body`);
  const btnEnviar = document.getElementById(`${id}_enviar`);
  let preview = null;
  let submodulos = [];
  let usuarios = [];

  try {
    const [prevResp, subResp] = await Promise.all([
      contratacionesService.getPreviewDerivacionValidacion(cotId),
      contratacionesService.getValidacionSubmodulos(),
    ]);
    preview = prevResp.data;
    submodulos = subResp.data || [];
    body.innerHTML = `
      <div class="alert alert-info small py-2"><i class="bi bi-info-circle"></i> ${esc(preview.nota)}</div>
      <div class="card border-0 bg-light mb-3">
        <div class="card-body py-2 small">
          <strong>${esc(preview.solicitud_codigo)}</strong> — ${esc(preview.razon_social)} (RUC ${esc(preview.ruc)})
        </div>
      </div>
      <h6 class="fw-semibold">Documentos técnicos que se enviarán al responsable</h6>
      <div id="${id}_docs">${renderDocsList(cotId, preview.documentos_tecnicos, { soloLista: false })}</div>
      <hr/>
      <div class="row g-2">
        <div class="col-md-6">
          <label class="form-label fw-semibold">Submódulo destino</label>
          <select class="form-select form-select-sm" id="${id}_sub">
            <option value="">Seleccione…</option>
            ${submodulos.map((s) => `<option value="${esc(s.code)}">${esc(s.label)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Responsable de validación</label>
          <select class="form-select form-select-sm" id="${id}_resp" disabled>
            <option value="">Seleccione submódulo primero…</option>
          </select>
        </div>
      </div>
      <div id="${id}_err" class="alert alert-danger d-none py-2 mt-2 mb-0"></div>`;
    bindDocButtons(body);

    const selSub = document.getElementById(`${id}_sub`);
    const selResp = document.getElementById(`${id}_resp`);
    const errBox = document.getElementById(`${id}_err`);

    selSub.onchange = async () => {
      selResp.innerHTML = '<option value="">Cargando…</option>';
      selResp.disabled = true;
      btnEnviar.disabled = true;
      if (!selSub.value) {
        selResp.innerHTML = '<option value="">Seleccione submódulo primero…</option>';
        return;
      }
      try {
        const uResp = await contratacionesService.listValidacionUsuarios(selSub.value);
        usuarios = uResp.data || [];
        selResp.innerHTML = usuarios.length
          ? '<option value="">Seleccione responsable…</option>' + usuarios.map((u) =>
            `<option value="${u.id}">${esc(u.nombre)}${u.cargo ? ` — ${esc(u.cargo)}` : ''}</option>`).join('')
          : '<option value="">Sin usuarios con permiso en este submódulo</option>';
        selResp.disabled = !usuarios.length;
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('d-none');
      }
    };

    selResp.onchange = () => { btnEnviar.disabled = !selResp.value; };

    btnEnviar.onclick = async () => {
      const sub = submodulos.find((s) => s.code === selSub.value);
      const u = usuarios.find((x) => String(x.id) === String(selResp.value));
      if (!sub || !u) return;
      btnEnviar.disabled = true;
      errBox.classList.add('d-none');
      try {
        await contratacionesService.derivarValidacion(cotId, {
          submodulo: sub.code,
          submodulo_label: sub.label,
          responsable_id: u.id,
          responsable_nombre: u.nombre,
          usuario: getUserDisplayName(authService.getCurrentUser()),
        });
        modal.hide();
        loadValidaciones();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('d-none');
        btnEnviar.disabled = false;
      }
    };
    btnEnviar.disabled = false;
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

function renderFormRow(it, idx, prefix) {
  const sel = (opts, val, field) =>
    `<select class="form-select form-select-sm val-f-${field}" data-idx="${idx}">
      ${opts.map((o) => `<option value="${esc(o)}"${o === val ? ' selected' : ''}>${esc(o || '—')}</option>`).join('')}
    </select>`;
  return `
    <tr data-idx="${idx}">
      <td class="small text-center">${esc(it.item)}</td>
      <td class="small">${esc(it.nro_req)}</td>
      <td class="small">${esc(it.codigo_sigamef)}</td>
      <td class="small">${esc(it.descripcion)}</td>
      <td class="small text-center">${esc(it.cantidad)}</td>
      <td class="small text-center">${esc(it.um)}</td>
      <td class="small">${esc(it.marca)}</td>
      <td class="small">${esc(it.procedencia)}</td>
      <td>${sel(SI_NO_OPTS, it.inserto, 'inserto')}</td>
      <td>${sel(SI_NO_OPTS, it.certificado, 'certificado')}</td>
      <td><input class="form-control form-control-sm val-f-obs_specs" data-idx="${idx}" value="${esc(it.obs_specs)}"></td>
      <td>${sel(CUMPLE_OPTS, it.acredita_doc, 'acredita_doc')}</td>
      <td>${sel(CUMPLE_OPTS, it.vigencia_minima_val, 'vigencia_minima_val')}</td>
      <td>${sel(CUMPLE_OPTS, it.plazos_entrega_val, 'plazos_entrega_val')}</td>
      <td>${sel(RESULTADO_OPTS, it.resultado, 'resultado')}</td>
      <td><input class="form-control form-control-sm val-f-obs_validacion" data-idx="${idx}" value="${esc(it.obs_validacion)}"></td>
    </tr>`;
}

function collectFormularioFromDom(prefix, baseForm) {
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
  };
}

async function showTrabajoValidacionModal(cotId) {
  const id = `valTrab_${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-fullscreen">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title"><i class="bi bi-clipboard-check"></i> Validación técnica — Anexo 07-A</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${id}_body"><div class="text-center py-4"><span class="spinner-border"></span></div></div>
          <div class="modal-footer flex-wrap gap-2">
            <button type="button" class="btn btn-outline-secondary" id="${id}_dlDocs"><i class="bi bi-download"></i> Descargar adjuntos técnicos</button>
            <button type="button" class="btn btn-outline-dark" id="${id}_pdf"><i class="bi bi-printer"></i> Imprimir formato PDF</button>
            <button type="button" class="btn btn-outline-primary" id="${id}_adj"><i class="bi bi-paperclip"></i> Adjuntar validación firmada</button>
            <button type="button" class="btn btn-success" id="${id}_enviar"><i class="bi bi-send"></i> Enviar validación</button>
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

  let detalle = null;
  let pdfAdjunto = null;

  try {
    const resp = await contratacionesService.getValidacionTrabajo(cotId);
    detalle = resp.data;
    const f = detalle.formulario_07a;
    pdfAdjunto = detalle.pdf_firmado || null;

    document.getElementById(`${id}_body`).innerHTML = `
      <div class="alert alert-warning small py-2">Solo evaluación técnica. La propuesta económica no está disponible en esta vista.</div>
      <div class="row g-2 mb-3 small">
        <div class="col-md-4"><strong>Solicitud:</strong> ${esc(detalle.solicitud_codigo)}</div>
        <div class="col-md-4"><strong>Proveedor:</strong> ${esc(detalle.razon_social)}</div>
        <div class="col-md-4"><strong>Derivado a:</strong> ${esc(detalle.derivacion?.submodulo_label || '—')}</div>
      </div>
      <h6 class="fw-semibold">Documentos técnicos adjuntos</h6>
      <div class="mb-3" id="${id}_docs">${renderDocsList(cotId, detalle.documentos_tecnicos)}</div>
      <h6 class="fw-semibold">ANEXO 07-A — Validación de propuestas técnicas recibidas</h6>
      <div class="row g-2 mb-2">
        <div class="col-md-3"><label class="form-label small">Lugar</label><input class="form-control form-control-sm" id="${id}_lugar" value="${esc(f.lugar)}"></div>
        <div class="col-md-3"><label class="form-label small">Fecha</label><input class="form-control form-control-sm" id="${id}_fecha" value="${esc(f.fecha)}"></div>
        <div class="col-md-6"><label class="form-label small">Profesional</label><input class="form-control form-control-sm" id="${id}_prof" value="${esc(f.profesional)}"></div>
      </div>
      <div class="table-responsive mb-2" id="${id}_form">
        <table class="table table-bordered table-sm mb-0" style="font-size:0.72rem">
          <thead class="table-primary text-center align-middle">
            <tr>
              <th rowspan="2">Ítem</th><th rowspan="2">Nº REQ</th><th rowspan="2">Cód.SIGA</th><th rowspan="2">Descripción</th>
              <th rowspan="2">Cant.</th><th rowspan="2">U.M.</th>
              <th colspan="4">Especificaciones recibidas</th>
              <th colspan="5">Validación área usuaria</th>
            </tr>
            <tr>
              <th>Marca</th><th>Procedencia</th><th>Inserto</th><th>Certificado</th><th>Obs.</th>
              <th>Doc.oblig.</th><th>Vigencia</th><th>Plazo ent.</th><th>Resultado</th><th>Obs.valid.</th>
            </tr>
          </thead>
          <tbody>${f.items.map((it, idx) => renderFormRow(it, idx, id)).join('')}</tbody>
        </table>
      </div>
      <div class="row g-2">
        <div class="col-md-6">
          <label class="form-label small fw-semibold">Resultado global</label>
          <select class="form-select form-select-sm" id="${id}_resGlobal">
            ${RESULTADO_OPTS.map((o) => `<option value="${esc(o)}">${esc(o || 'Seleccione…')}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label small fw-semibold">Observaciones generales</label>
          <textarea class="form-control form-control-sm" id="${id}_obsGlobal" rows="2"></textarea>
        </div>
      </div>
      <div id="${id}_pdfInfo" class="small mt-2 ${pdfAdjunto ? 'text-success' : 'text-muted'}">
        ${pdfAdjunto ? `<i class="bi bi-check-circle"></i> PDF adjunto: ${esc(pdfAdjunto.nombre)}` : 'Sin PDF firmado adjunto aún.'}
      </div>
      <div id="${id}_err" class="alert alert-danger d-none py-2 mt-2 mb-0"></div>`;

    bindDocButtons(document.getElementById(`${id}_body`));

    document.getElementById(`${id}_dlDocs`).onclick = () => {
      (detalle.documentos_tecnicos || []).forEach((d, i) => {
        setTimeout(() => openCotizacionDoc(cotId, d.ref, false).catch(() => {}), i * 400);
      });
    };

    document.getElementById(`${id}_pdf`).onclick = () => {
      const form = collectFormularioFromDom(id, f);
      try {
        downloadAnexo07A({ solicitud: detalle, formulario: form });
      } catch (err) { alert(err.message); }
    };

    document.getElementById(`${id}_adj`).onclick = () => {
      triggerPdfUpload((meta) => {
        pdfAdjunto = meta;
        const info = document.getElementById(`${id}_pdfInfo`);
        info.className = 'small mt-2 text-success';
        info.innerHTML = `<i class="bi bi-check-circle"></i> PDF adjunto: ${esc(meta.nombre)}`;
      });
    };

    document.getElementById(`${id}_enviar`).onclick = async () => {
      const errBox = document.getElementById(`${id}_err`);
      const form = collectFormularioFromDom(id, f);
      if (!form.resultado_global) {
        errBox.textContent = 'Seleccione el resultado global de la validación.';
        errBox.classList.remove('d-none');
        return;
      }
      if (!form.observacion_global?.trim()) {
        errBox.textContent = 'Las observaciones generales son obligatorias.';
        errBox.classList.remove('d-none');
        return;
      }
      if (!pdfAdjunto?.base64) {
        errBox.textContent = 'Adjunte el PDF firmado antes de enviar.';
        errBox.classList.remove('d-none');
        return;
      }
      const btn = document.getElementById(`${id}_enviar`);
      btn.disabled = true;
      errBox.classList.add('d-none');
      try {
        await contratacionesService.enviarValidacion(cotId, {
          formulario_07a: form,
          pdf_firmado: pdfAdjunto,
          resultado: form.resultado_global,
          observacion: form.observacion_global,
          usuario: getUserDisplayName(authService.getCurrentUser()),
        });
        modal.hide();
        loadValidaciones();
        alert('Validación enviada correctamente.');
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('d-none');
        btn.disabled = false;
      }
    };
  } catch (err) {
    document.getElementById(`${id}_body`).innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    document.getElementById(`${id}_enviar`).disabled = true;
  }
}

function badgeEstado(estadoDisplay, validacionEstado) {
  const v = String(validacionEstado || '').toUpperCase();
  if (v === 'DERIVADA' || v === 'EN_PROCESO') return 'warning';
  return 'info';
}

function renderTabla(rows, tipo) {
  if (!rows.length) return '';
  const btnLabel = tipo === 'derivar' ? 'Validar' : 'Realizar validación';
  const btnClass = tipo === 'derivar' ? 'val-derivar' : 'val-trabajo';
  const enValidacionAu = (c) => ['DERIVADA', 'EN_PROCESO'].includes(String(c.validacion_estado || '').toUpperCase());
  return `
    <table class="table table-sm table-hover table-bordered mb-0">
      <thead class="table-light"><tr>
        <th>Solicitud</th><th>Requerimiento</th><th>Proveedor</th><th>Fecha recepción</th><th>Estado</th>${tipo === 'asignadas' ? '<th>Derivado desde</th>' : ''}<th>Acciones</th>
      </tr></thead>
      <tbody>${rows.map((c) => `
        <tr>
          <td><strong>${esc(c.solicitud_codigo)}</strong></td>
          <td class="small">${esc(c.requerimientos || '—')}</td>
          <td><small>${esc(c.ruc)}</small><br>${esc(c.razon_social)}</td>
          <td class="small">${esc(fmtFecha(c.fecha_presentacion))}</td>
          <td><span class="badge bg-${badgeEstado(c.estado_display, c.validacion_estado)}">${esc(c.estado_display || c.validacion_estado || c.estado)}</span></td>
          ${tipo === 'asignadas' ? `<td class="small">${esc(c.derivacion?.submodulo_label || '—')}<br><span class="text-muted">${esc(c.validacion_responsable)}</span></td>` : ''}
          <td>${tipo === 'derivar' && enValidacionAu(c)
    ? `<span class="small text-muted"><i class="bi bi-person-check"></i> ${esc(c.validacion_responsable || 'Área usuaria')}</span>`
    : `<button type="button" class="btn btn-sm btn-primary ${btnClass}" data-id="${c.id}">${btnLabel}</button>`}
          </td>
        </tr>`).join('')}</tbody>
    </table>`;
}

async function loadValidaciones() {
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;
  try {
    const [pendResp, asigResp] = await Promise.all([
      isUsuarioCm() ? contratacionesService.listValidacionesPendientes() : Promise.resolve({ data: [] }),
      contratacionesService.listValidacionesAsignadas(),
    ]);
    const pendientes = pendResp.data || [];
    const asignadas = asigResp.data || [];

    if (!pendientes.length && !asignadas.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay validaciones pendientes ni asignadas.</div>';
      return;
    }

    let html = '';
    if (isUsuarioCm() && pendientes.length) {
      html += `
        <div class="mb-4">
          <h6 class="fw-bold text-primary mb-2"><i class="bi bi-inbox"></i> Cotizaciones en validación técnica</h6>
          <p class="small text-muted mb-2">Incluye cotizaciones pendientes de derivar y las enviadas al área usuaria (<strong>En validación AU</strong>). La propuesta económica no se envía al AU.</p>
          ${renderTabla(pendientes, 'derivar')}
        </div>`;
    }
    if (asignadas.length) {
      html += `
        <div>
          <h6 class="fw-bold text-success mb-2"><i class="bi bi-person-check"></i> Mis validaciones asignadas</h6>
          ${renderTabla(asignadas, 'asignadas')}
        </div>`;
    } else if (!isUsuarioCm() || !pendientes.length) {
      html += '<div class="alert alert-light border">No tiene validaciones asignadas.</div>';
    }

    cont.innerHTML = html;
    cont.querySelectorAll('.val-derivar').forEach((btn) => {
      btn.onclick = () => showDerivarModal(btn.dataset.id);
    });
    cont.querySelectorAll('.val-trabajo').forEach((btn) => {
      btn.onclick = () => showTrabajoValidacionModal(btn.dataset.id);
    });
  } catch (err) {
    cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

export function renderValidacionesView() {
  return renderContratacionBandejaStub(VIEW_CONFIG);
}

export function initValidacionesView() {
  bindBandejaToolbar({
    prefix: VIEW_CONFIG.prefix,
    onFilter: () => loadValidaciones(),
    onClear: () => loadValidaciones(),
    onExecutiveToggle: () => loadValidaciones(),
  });
  const reload = document.getElementById(`${VIEW_CONFIG.prefix}Reload`);
  if (reload) reload.onclick = () => loadValidaciones();
  loadValidaciones();
}

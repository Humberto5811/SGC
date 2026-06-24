// Modales — Solicitud de Cotización (wizard) e invitaciones a proveedores
import { contratacionesService } from '../services/contratacionesService.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mapTipoFromRow(r) {
  const t = String(r?.tipo || '').toLowerCase();
  if (t === 'servicios') return 'Servicios';
  if (t === 'locacion') return 'Locadores';
  return 'Bienes';
}

const MSG_CONSULTA_FUERA_PLAZO = 'Consulta fuera de plazo';

function validarCronogramaCliente(body) {
  const ci = body.consultas_inicio ? new Date(body.consultas_inicio).getTime() : null;
  const cf = body.consultas_fin ? new Date(body.consultas_fin).getTime() : null;
  const ti = body.cotizaciones_inicio ? new Date(body.cotizaciones_inicio).getTime() : null;
  const tf = body.cotizaciones_fin ? new Date(body.cotizaciones_fin).getTime() : null;
  if ([ci, cf, ti, tf].some((t) => t != null && Number.isNaN(t))) throw new Error(MSG_CONSULTA_FUERA_PLAZO);
  if (ci && cf && cf < ci) throw new Error(MSG_CONSULTA_FUERA_PLAZO);
  if (ti && tf && tf < ti) throw new Error(MSG_CONSULTA_FUERA_PLAZO);
  if (ci && ti && ci < ti) throw new Error(MSG_CONSULTA_FUERA_PLAZO);
  if (cf && tf && cf > tf) throw new Error(MSG_CONSULTA_FUERA_PLAZO);
}

function openModal(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const el = wrap.firstElementChild;
  document.body.appendChild(el);
  const modal = window.bootstrap?.Modal ? new window.bootstrap.Modal(el, { backdrop: 'static' }) : null;
  modal?.show();
  return { el, modal, close: () => { modal?.hide(); setTimeout(() => el.remove(), 250); } };
}

function toDatetimeLocalValue(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function fmtRegistro(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function readFileAsMeta(file) {
  return { nombre: file.name, tipo: file.type, tamano: file.size, fecha_registro: new Date().toISOString() };
}

const STEP_ORDER = ['general', 'docs', 'items', 'invitaciones'];
const STEP_LABELS = {
  general: 'Datos generales',
  docs: 'Documentos',
  items: 'Detalle de ítems',
  invitaciones: 'Invitaciones',
};

export async function showSolicitudCotizacionModal(requerimientoIds, rows = [], opts = {}) {
  const editId = opts.solicitudId || null;
  const detallePre = editId ? await contratacionesService.getSolicitudDetalle(editId).catch(() => null) : null;
  const effectiveReqIds = requerimientoIds?.length
    ? requerimientoIds
    : (detallePre?.requerimientos || []).map((r) => r.id);

  const [preview, catalogos, itemsResp, detalleExistente] = await Promise.all([
    contratacionesService.previewCodigoSolicitud().catch(() => ({ codigo: 'SC-00001-2026-INS' })),
    contratacionesService.getCatalogosInvitaciones().catch(() => ({})),
    effectiveReqIds.length
      ? contratacionesService.getItemsRequerimientos(effectiveReqIds).catch(() => ({ data: [] }))
      : Promise.resolve({ data: [] }),
    editId ? Promise.resolve(detallePre) : Promise.resolve(null),
  ]);

  const first = rows[0] || detalleExistente?.requerimientos?.[0] || {};
  const tipoAuto = mapTipoFromRow(first);
  const sol = detalleExistente?.solicitud || null;
  const docsCatalog = catalogos.docs_solicitados || [];
  const reqCatalog = catalogos.requisitos_tecnicos || [];

  const state = {
    solicitudId: sol?.id || null,
    requerimientoIds: effectiveReqIds,
    currentStep: opts.initialTab || 'general',
    unlocked: { general: true, docs: !!sol, items: !!sol, invitaciones: false },
    completed: { general: !!sol, docs: !!sol, items: false },
    docsResumen: Array.isArray(sol?.docs_solicitados) ? [...sol.docs_solicitados] : [],
    reqResumen: Array.isArray(sol?.requisitos_tecnicos) ? [...sol.requisitos_tecnicos] : [],
    items: Array.isArray(sol?.detalle_items) && sol.detalle_items.length
      ? sol.detalle_items
      : (itemsResp.data || []),
    lugares: Array.isArray(sol?.lugares_entrega_item) && sol.lugares_entrega_item.length
      ? sol.lugares_entrega_item
      : (itemsResp.data || []).map((it) => ({ ...it, region: '', provincia: '', distrito: '', lugar_rapido: '' })),
    proveedores: [],
  };

  if (editId) {
    state.unlocked = { general: true, docs: true, items: true, invitaciones: true };
    state.completed = { general: true, docs: true, items: opts.initialTab === 'invitaciones' };
  }

  const stepsHtml = STEP_ORDER.map((step, i) => {
    const locked = !state.unlocked[step];
    const done = state.completed[step];
    return `<li class="nav-item">
      <button type="button" class="nav-link sc-step-tab ${state.currentStep === step ? 'active' : ''} ${locked ? 'sc-step-locked disabled' : ''} ${done ? 'sc-step-done' : ''}"
        data-sc-tab="${step}" ${locked ? 'disabled' : ''}>
        <span class="sc-step-num">${done ? '<i class="bi bi-check-lg"></i>' : (i + 1)}</span>
        ${STEP_LABELS[step]}
      </button>
    </li>`;
  }).join('');

  const body = `
    <style>
      .sc-step-tabs { border-bottom: 2px solid #dee2e6; gap: 4px; }
      .sc-step-tab { display: flex; align-items: center; gap: 8px; border: none !important; border-radius: 0 !important;
        color: #6c757d !important; background: transparent !important; padding: .6rem 1rem !important; }
      .sc-step-tab.active { color: #0d6efd !important; border-bottom: 3px solid #0d6efd !important; font-weight: 600; margin-bottom: -2px; }
      .sc-step-tab.sc-step-done:not(.active) { color: #198754 !important; }
      .sc-step-tab.disabled, .sc-step-tab.sc-step-locked { pointer-events: none; opacity: .45; }
      .sc-step-num { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px;
        border-radius: 50%; background: #e9ecef; font-size: .75rem; font-weight: 700; }
      .sc-step-tab.active .sc-step-num { background: #0d6efd; color: #fff; }
      .sc-step-tab.sc-step-done .sc-step-num { background: #198754; color: #fff; }
      .sc-docs-panel { border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; height: 100%; }
      .sc-docs-panel h6 { font-size: .8125rem; font-weight: 700; color: #495057; }
      .sc-sel-table { font-size: .78rem; }
      .sc-sel-table th { background: #f8f9fa; font-weight: 600; }
      .sc-items-table, .sc-lugares-table { font-size: .8125rem; }
      .sc-mail-icon-pend { color: #dc3545; }
      .sc-mail-icon-env { color: #0d6efd; }
    </style>
    <ul class="nav sc-step-tabs mb-3">${stepsHtml}</ul>

    <div data-sc-pane="general">
      <div class="row g-2">
        <div class="col-md-3"><label class="form-label small">N° Solicitud</label>
          <input class="form-control form-control-sm" id="scCodigo" readonly value="${esc(sol?.codigo || preview.codigo)}"></div>
        <div class="col-md-5"><label class="form-label small">Denominación</label>
          <input class="form-control form-control-sm" id="scDenominacion" value="${esc(sol?.denominacion || first.denominacion || '')}"></div>
        <div class="col-md-2"><label class="form-label small">Tipo <span class="text-danger">*</span></label>
          <select class="form-select form-select-sm" id="scTipo">
            ${(catalogos.tipos || ['Bienes', 'Servicios', 'Locadores']).map((t) =>
              `<option ${t === (sol?.tipo || tipoAuto) ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select></div>
        <div class="col-md-2"><label class="form-label small">CMN</label>
          <input class="form-control form-control-sm" id="scCmn" value="${esc(sol?.cmn || first.cmn || '')}"></div>
        <div class="col-md-4"><label class="form-label small">Área usuaria</label>
          <input class="form-control form-control-sm" id="scArea" value="${esc(sol?.area_usuaria || first.area || '')}"></div>
        <div class="col-md-4"><label class="form-label small">Tipo de evaluación <span class="text-danger">*</span></label>
          <select class="form-select form-select-sm" id="scTipoEval" required>
            <option value="">— Seleccione —</option>
            ${(catalogos.tipos_evaluacion || ['Por paquete de ítems', 'Por relación de ítems']).map((t) =>
              `<option value="${esc(t)}" ${sol?.tipo_evaluacion === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select></div>
      </div>
      <hr/>
      <h6 class="small fw-bold">Cronograma de consultas</h6>
      <div class="row g-2 mb-3">
        <div class="col-md-3"><label class="form-label small">Fecha/Hora Inicio Consultas</label>
          <input type="datetime-local" class="form-control form-control-sm" id="scConsultasInicio" value="${esc(toDatetimeLocalValue(sol?.consultas_inicio))}"></div>
        <div class="col-md-3"><label class="form-label small">Fecha/Hora Fin Consultas</label>
          <input type="datetime-local" class="form-control form-control-sm" id="scConsultasFin" value="${esc(toDatetimeLocalValue(sol?.consultas_fin))}"></div>
      </div>
      <h6 class="small fw-bold">Cronograma de cotización</h6>
      <div class="row g-2">
        <div class="col-md-3"><label class="form-label small">Fecha/Hora Inicio Cotización</label>
          <input type="datetime-local" class="form-control form-control-sm" id="scCotInicio" value="${esc(toDatetimeLocalValue(sol?.cotizaciones_inicio))}"></div>
        <div class="col-md-3"><label class="form-label small">Fecha/Hora Fin Cotización</label>
          <input type="datetime-local" class="form-control form-control-sm" id="scCotFin" value="${esc(toDatetimeLocalValue(sol?.cotizaciones_fin))}"></div>
      </div>
    </div>

    <div data-sc-pane="docs" class="d-none">
      <div class="row g-3">
        <div class="col-md-6">
          <div class="sc-docs-panel">
            <h6 class="border-bottom pb-2 mb-2">Documentos solicitados al proveedor</h6>
            <table class="table table-sm sc-sel-table mb-2">
              <thead><tr><th style="width:28px;"></th><th>Documento</th><th>Adjunto</th><th style="width:80px;">Acciones</th></tr></thead>
              <tbody id="scDocsPick">${docsCatalog.map((d, i) => `
                <tr data-doc-name="${esc(d)}">
                  <td><input type="checkbox" class="form-check-input sc-doc-check" id="scDoc${i}" value="${esc(d)}"></td>
                  <td><label class="small mb-0" for="scDoc${i}">${esc(d)}</label></td>
                  <td class="sc-doc-adj-cell small text-muted">—</td>
                  <td><button type="button" class="btn btn-link btn-sm p-0 text-primary sc-doc-adj" data-doc="${esc(d)}">+ Adjuntar</button></td>
                </tr>`).join('')}</tbody>
            </table>
            <button type="button" class="btn btn-sm btn-outline-primary" id="scAddOtroDoc"><i class="bi bi-plus"></i> Agregar otro documento</button>
            <h6 class="border-bottom pb-1 mt-3 mb-2">Documentos Seleccionados (<span id="scDocsCount">0</span>)</h6>
            <table class="table table-sm table-bordered sc-sel-table mb-0">
              <thead class="table-light"><tr><th>Documento</th><th>Archivo adjunto</th><th>Fecha registro</th><th>Acciones</th></tr></thead>
              <tbody id="scDocsResumen"></tbody>
            </table>
          </div>
        </div>
        <div class="col-md-6">
          <div class="sc-docs-panel">
            <h6 class="border-bottom pb-2 mb-2">Requerimientos técnicos mínimos</h6>
            <div class="row g-1 mb-2">${reqCatalog.map((d, i) => `
              <div class="col-md-6"><div class="form-check">
                <input class="form-check-input sc-req-check" type="checkbox" id="scReq${i}" value="${esc(d)}">
                <label class="form-check-label small" for="scReq${i}">${esc(d)}</label>
              </div></div>`).join('')}</div>
            <button type="button" class="btn btn-sm btn-outline-primary mb-2" id="scAddOtroReq"><i class="bi bi-plus"></i> Agregar otro requisito</button>
            <h6 class="border-bottom pb-1 mb-2">Requisitos Seleccionados (<span id="scReqCount">0</span>)</h6>
            <table class="table table-sm table-bordered sc-sel-table mb-0">
              <thead class="table-light"><tr><th>Requisito técnico</th><th>Obligatorio</th><th>Archivo adjunto</th><th>Acciones</th></tr></thead>
              <tbody id="scReqResumen"></tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="alert alert-info small mt-3 mb-0">
        <strong>Importante:</strong> Los documentos y requisitos seleccionados serán solicitados al proveedor como parte de su propuesta técnica y económica.
      </div>
    </div>

    <div data-sc-pane="items" class="d-none">
      <div class="table-responsive mb-3">
        <table class="table table-sm table-bordered sc-items-table mb-0">
          <thead class="table-light"><tr>
            <th>Requerimiento</th><th>Paquete</th><th>Pedido SIGAMEF</th><th>Código SIGAMEF</th>
            <th>Descripción</th><th>Cantidad</th><th>Acciones</th>
          </tr></thead>
          <tbody id="scItemsBody"></tbody>
        </table>
      </div>
      <h6 class="small fw-bold">Lugar de entrega por ítem</h6>
      <div class="table-responsive">
        <table class="table table-sm table-bordered sc-lugares-table mb-0">
          <thead class="table-light"><tr>
            <th>Requerimiento</th><th>Paquete</th><th>Pedido</th><th>Código</th><th>Descripción</th><th>Cant.</th>
            <th>Región</th><th>Provincia</th><th>Distrito</th>
          </tr></thead>
          <tbody id="scLugaresBody"></tbody>
        </table>
      </div>
      <div class="mt-2 row g-2 align-items-end">
        <div class="col-md-4"><label class="form-label small">Opción rápida</label>
          <select class="form-select form-select-sm" id="scLugarRapido">
            <option value="">— Aplicar a todos —</option>
            ${(catalogos.lugares_rapidos || []).map((l) => `<option value="${esc(l.id)}">${esc(l.label)}</option>`).join('')}
          </select></div>
        <div class="col-md-2"><button type="button" class="btn btn-sm btn-outline-primary" id="scAplicarLugar">Aplicar</button></div>
      </div>
    </div>

    <div data-sc-pane="invitaciones" class="d-none">
      <h6 class="fw-bold">Invitaciones a proveedores</h6>
      <div class="row g-2 mb-2">
        <div class="col-md-3"><input class="form-control form-control-sm" id="scProvNombre" placeholder="Proveedor"></div>
        <div class="col-md-2"><input class="form-control form-control-sm" id="scProvRuc" placeholder="RUC"></div>
        <div class="col-md-2"><input class="form-control form-control-sm" id="scProvTel" placeholder="Teléfono"></div>
        <div class="col-md-3"><input class="form-control form-control-sm" id="scProvCorreo" placeholder="Correos (;)"></div>
        <div class="col-md-2"><button type="button" class="btn btn-sm btn-primary w-100" id="scProvGuardar">Guardar</button></div>
      </div>
      <div class="d-flex justify-content-between mb-2">
        <button type="button" class="btn btn-sm btn-success" id="scEnviarCorreo" disabled><i class="bi bi-envelope"></i> ENVIAR CORREO</button>
      </div>
      <table class="table table-sm table-bordered">
        <thead class="table-light"><tr>
          <th style="width:30px;"><input type="checkbox" id="scProvSelectAll"></th>
          <th>Proveedor</th><th>RUC</th><th>Teléfono</th><th>Correo</th>
          <th>Estado envío</th><th>Fecha envío</th><th></th><th></th>
        </tr></thead>
        <tbody id="scProvBody"></tbody>
      </table>
    </div>`;

  const footer = `
    <button type="button" class="btn btn-secondary" data-dismiss-cancel>Cancelar</button>
    <button type="button" class="btn btn-outline-secondary d-none" id="scBtnAtras">Atrás</button>
    <button type="button" class="btn btn-primary" id="scBtnContinuar">Guardar y continuar</button>`;

  const { el, close } = openModal(`
    <div class="modal fade" id="scWizardModal" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header"><h5 class="modal-title">Solicitud de Cotización</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">${body}</div>
          <div class="modal-footer" id="scModalFooter">${footer}</div>
        </div>
      </div>
    </div>`);

  const lugaresRapidos = catalogos.lugares_rapidos || [];

  function refreshStepTabs() {
    STEP_ORDER.forEach((step) => {
      const btn = el.querySelector(`[data-sc-tab="${step}"]`);
      if (!btn) return;
      btn.classList.toggle('active', state.currentStep === step);
      btn.classList.toggle('sc-step-done', state.completed[step]);
      btn.classList.toggle('sc-step-locked', !state.unlocked[step]);
      btn.classList.toggle('disabled', !state.unlocked[step]);
      btn.disabled = !state.unlocked[step];
      const idx = STEP_ORDER.indexOf(step);
      const num = btn.querySelector('.sc-step-num');
      if (num) num.innerHTML = state.completed[step] ? '<i class="bi bi-check-lg"></i>' : String(idx + 1);
    });
    el.querySelector('#scBtnAtras')?.classList.toggle('d-none', state.currentStep === 'general');
    el.querySelector('#scBtnContinuar')?.classList.toggle('d-none', state.currentStep === 'invitaciones');
  }

  function activateStep(step) {
    if (!state.unlocked[step]) return;
    state.currentStep = step;
    el.querySelectorAll('[data-sc-pane]').forEach((pane) => {
      pane.classList.toggle('d-none', pane.dataset.scPane !== step);
    });
    refreshStepTabs();
    if (step === 'invitaciones') renderProveedores();
  }

  function unlockStep(step) {
    state.unlocked[step] = true;
    refreshStepTabs();
  }

  function completeStep(step) {
    state.completed[step] = true;
    refreshStepTabs();
  }

  function syncDocPickRow(docName) {
    const row = el.querySelector(`#scDocsPick tr[data-doc-name="${CSS.escape(docName)}"]`);
    const entry = state.docsResumen.find((d) => d.documento === docName);
    if (row) {
      const cb = row.querySelector('.sc-doc-check');
      if (cb) cb.checked = !!entry;
      const cell = row.querySelector('.sc-doc-adj-cell');
      if (cell) cell.innerHTML = entry?.archivo ? esc(entry.archivo) : '<span class="text-muted">—</span>';
    }
  }

  function renderDocsResumen() {
    const tb = el.querySelector('#scDocsResumen');
    const count = el.querySelector('#scDocsCount');
    if (count) count.textContent = state.docsResumen.length;
    if (!tb) return;
    tb.innerHTML = state.docsResumen.map((d, i) => `
      <tr><td>${esc(d.documento)}</td><td>${esc(d.archivo || '—')}</td>
      <td class="small">${esc(fmtRegistro(d.fecha_registro))}</td>
      <td><button type="button" class="btn btn-link btn-sm text-danger p-0 sc-doc-del" data-i="${i}" title="Eliminar"><i class="bi bi-trash"></i></button></td></tr>`).join('')
      || '<tr><td colspan="4" class="text-muted small">Sin documentos seleccionados</td></tr>';
    tb.querySelectorAll('.sc-doc-del').forEach((btn) => {
      btn.onclick = () => {
        const removed = state.docsResumen.splice(parseInt(btn.dataset.i, 10), 1)[0];
        if (removed) syncDocPickRow(removed.documento);
        renderDocsResumen();
      };
    });
    docsCatalog.forEach((d) => syncDocPickRow(d));
    state.docsResumen.forEach((d) => syncDocPickRow(d.documento));
  }

  function renderReqResumen() {
    const tb = el.querySelector('#scReqResumen');
    const count = el.querySelector('#scReqCount');
    if (count) count.textContent = state.reqResumen.length;
    if (!tb) return;
    tb.innerHTML = state.reqResumen.map((d, i) => `
      <tr><td>${esc(d.requisito)}</td>
      <td class="text-center">${d.obligatorio !== false ? '<i class="bi bi-check-circle-fill text-success"></i>' : '—'}</td>
      <td class="small">${d.archivo ? `<i class="bi bi-paperclip"></i> ${esc(d.archivo)}` : '—'}</td>
      <td><button type="button" class="btn btn-link btn-sm text-danger p-0 sc-req-del" data-i="${i}"><i class="bi bi-trash"></i></button></td></tr>`).join('')
      || '<tr><td colspan="4" class="text-muted small">Sin requisitos seleccionados</td></tr>';
    tb.querySelectorAll('.sc-req-del').forEach((btn) => {
      btn.onclick = () => {
        const removed = state.reqResumen.splice(parseInt(btn.dataset.i, 10), 1)[0];
        if (removed) {
          const cb = [...el.querySelectorAll('.sc-req-check')].find((c) => c.value === removed.requisito);
          if (cb) cb.checked = false;
        }
        renderReqResumen();
      };
    });
  }

  function addDocToResumen(docName, archivo = '', fecha = new Date().toISOString()) {
    if (state.docsResumen.some((d) => d.documento === docName)) {
      const row = state.docsResumen.find((d) => d.documento === docName);
      if (archivo) row.archivo = archivo;
      if (fecha) row.fecha_registro = fecha;
    } else {
      state.docsResumen.push({ documento: docName, archivo, fecha_registro: fecha });
    }
    renderDocsResumen();
  }

  function attachDocFile(docName) {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const meta = readFileAsMeta(file);
      addDocToResumen(docName, meta.nombre, meta.fecha_registro);
    };
    input.click();
  }

  function renderItems() {
    const tb = el.querySelector('#scItemsBody');
    const lb = el.querySelector('#scLugaresBody');
    if (!tb || !lb) return;
    tb.innerHTML = state.items.map((it, i) => `
      <tr>
        <td>${esc(it.requerimiento_codigo || it.requerimiento_id)}</td>
        <td>${esc(it.paquete || '—')}</td><td class="small">${esc(it.pedido_sigamef || '—')}</td>
        <td>${esc(it.codigo_sigamef || '—')}</td><td>${esc(it.descripcion || '—')}</td>
        <td class="text-center">${esc(it.cantidad ?? 1)}</td>
        <td class="small text-nowrap">
          <button type="button" class="btn btn-link btn-sm p-0 sc-item-ped" data-i="${i}">Ver pedidos</button>
          <button type="button" class="btn btn-link btn-sm p-0 sc-item-docs" data-i="${i}">Ver documentos</button>
          <button type="button" class="btn btn-link btn-sm p-0 sc-item-add" data-i="${i}">Agregar documento</button>
          <button type="button" class="btn btn-link btn-sm p-0 text-danger sc-item-del" data-i="${i}">Eliminar documento</button>
        </td>
      </tr>`).join('');
    lb.innerHTML = state.lugares.map((it, i) => `
      <tr data-li="${i}">
        <td>${esc(it.requerimiento_codigo || it.requerimiento_id)}</td>
        <td>${esc(it.paquete || '—')}</td><td class="small">${esc(it.pedido_sigamef || '—')}</td>
        <td>${esc(it.codigo_sigamef || '—')}</td><td>${esc(it.descripcion || '—')}</td>
        <td class="text-center">${esc(it.cantidad ?? 1)}</td>
        <td><input class="form-control form-control-sm sc-loc-region" value="${esc(it.region || '')}"></td>
        <td><input class="form-control form-control-sm sc-loc-prov" value="${esc(it.provincia || '')}"></td>
        <td><input class="form-control form-control-sm sc-loc-dist" value="${esc(it.distrito || '')}"></td>
      </tr>`).join('');
    lb.querySelectorAll('tr').forEach((tr) => {
      const i = parseInt(tr.dataset.li, 10);
      tr.querySelector('.sc-loc-region').oninput = (e) => { state.lugares[i].region = e.target.value; };
      tr.querySelector('.sc-loc-prov').oninput = (e) => { state.lugares[i].provincia = e.target.value; };
      tr.querySelector('.sc-loc-dist').oninput = (e) => { state.lugares[i].distrito = e.target.value; };
    });
  }

  async function renderProveedores() {
    if (!state.solicitudId) return;
    const resp = await contratacionesService.listProveedoresSolicitud(state.solicitudId);
    state.proveedores = resp.data || [];
    const tb = el.querySelector('#scProvBody');
    if (!tb) return;
    tb.innerHTML = state.proveedores.map((p) => {
      const enviado = p.estado_envio === 'Enviado';
      const icon = enviado
        ? '<i class="bi bi-envelope-check sc-mail-icon-env"></i>'
        : '<i class="bi bi-envelope sc-mail-icon-pend"></i>';
      return `<tr>
        <td><input type="checkbox" class="sc-prov-sel" data-id="${p.id}" ${enviado ? 'disabled' : ''}></td>
        <td>${esc(p.razon_social)}</td><td>${esc(p.ruc)}</td><td>${esc(p.telefono || '')}</td>
        <td class="small">${esc(p.correo_display || '')}</td>
        <td><span class="badge bg-${enviado ? 'primary' : 'secondary'}">${esc(p.estado_envio)}</span></td>
        <td class="small">${p.fecha_envio ? esc(String(p.fecha_envio).slice(0, 16).replace('T', ' ')) : '—'}</td>
        <td class="text-center">${icon}</td>
        <td>${enviado ? '' : `<button type="button" class="btn btn-link btn-sm text-danger sc-prov-del" data-id="${p.id}">Eliminar</button>`}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="9" class="text-muted small">Sin proveedores registrados</td></tr>';
    tb.querySelectorAll('.sc-prov-del').forEach((btn) => {
      btn.onclick = async () => {
        await contratacionesService.eliminarProveedorSolicitud(state.solicitudId, btn.dataset.id);
        await renderProveedores();
      };
    });
    el.querySelector('#scEnviarCorreo').disabled = !tb.querySelector('.sc-prov-sel:not(:disabled)');
  }

  function collectGeneralPayload() {
    const payload = {
      requerimiento_ids: effectiveReqIds,
      tipo: el.querySelector('#scTipo')?.value,
      denominacion: el.querySelector('#scDenominacion')?.value,
      cmn: el.querySelector('#scCmn')?.value,
      area_usuaria: el.querySelector('#scArea')?.value,
      tipo_evaluacion: el.querySelector('#scTipoEval')?.value,
      consultas_inicio: el.querySelector('#scConsultasInicio')?.value || null,
      consultas_fin: el.querySelector('#scConsultasFin')?.value || null,
      cotizaciones_inicio: el.querySelector('#scCotInicio')?.value || null,
      cotizaciones_fin: el.querySelector('#scCotFin')?.value || null,
    };
    if (!payload.tipo_evaluacion) throw new Error('El tipo de evaluación es obligatorio');
    validarCronogramaCliente(payload);
    return payload;
  }

  el.querySelectorAll('[data-sc-tab]').forEach((btn) => {
    btn.onclick = () => {
      if (btn.classList.contains('disabled') || btn.disabled) return;
      activateStep(btn.dataset.scTab);
    };
  });

  el.querySelectorAll('.sc-doc-check').forEach((cb) => {
    cb.onchange = () => {
      const doc = cb.value;
      if (cb.checked) addDocToResumen(doc);
      else {
        const idx = state.docsResumen.findIndex((d) => d.documento === doc);
        if (idx >= 0) state.docsResumen.splice(idx, 1);
        renderDocsResumen();
      }
    };
  });

  el.querySelectorAll('.sc-doc-adj').forEach((btn) => {
    btn.onclick = () => {
      const doc = btn.dataset.doc;
      const cb = el.querySelector(`.sc-doc-check[value="${CSS.escape(doc)}"]`);
      if (cb) cb.checked = true;
      attachDocFile(doc);
    };
  });

  el.querySelector('#scAddOtroDoc')?.addEventListener('click', () => {
    const nombre = prompt('Nombre del documento:');
    if (!nombre?.trim()) return;
    addDocToResumen(nombre.trim());
    const cb = el.querySelector(`.sc-doc-check[value="${CSS.escape('Otros documentos')}"]`);
    if (cb) cb.checked = true;
  });

  el.querySelectorAll('.sc-req-check').forEach((cb) => {
    cb.onchange = () => {
      const req = cb.value;
      if (cb.checked) {
        if (!state.reqResumen.some((d) => d.requisito === req)) {
          state.reqResumen.push({ requisito: req, obligatorio: true, archivo: '' });
          renderReqResumen();
        }
      } else {
        const idx = state.reqResumen.findIndex((d) => d.requisito === req);
        if (idx >= 0) { state.reqResumen.splice(idx, 1); renderReqResumen(); }
      }
    };
  });

  el.querySelector('#scAddOtroReq')?.addEventListener('click', () => {
    const nombre = prompt('Nombre del requisito técnico:');
    if (!nombre?.trim()) return;
    state.reqResumen.push({ requisito: nombre.trim(), obligatorio: true, archivo: '' });
    renderReqResumen();
  });

  el.querySelector('#scAplicarLugar')?.addEventListener('click', () => {
    const id = el.querySelector('#scLugarRapido')?.value;
    const preset = lugaresRapidos.find((l) => l.id === id);
    if (!preset) return;
    if (preset.otro) {
      el.querySelector('#scLugaresBody .sc-loc-region')?.focus();
      return;
    }
    state.lugares.forEach((l) => {
      l.region = preset.region;
      l.provincia = preset.provincia;
      l.distrito = preset.distrito;
      l.lugar_rapido = preset.label;
    });
    renderItems();
  });

  return new Promise((resolve) => {
    let resolvedOnce = false;
    const finish = (data) => {
      if (!resolvedOnce) { resolvedOnce = true; resolve(data); }
    };

    el.querySelector('[data-dismiss-cancel]')?.addEventListener('click', () => {
      close();
      finish({ saved: !!state.solicitudId, solicitudId: state.solicitudId });
    });

    el.querySelector('#scBtnAtras')?.addEventListener('click', () => {
      const idx = STEP_ORDER.indexOf(state.currentStep);
      if (idx > 0) activateStep(STEP_ORDER[idx - 1]);
    });

    el.querySelector('#scBtnContinuar')?.addEventListener('click', async () => {
      try {
        if (state.currentStep === 'general') {
          const payload = collectGeneralPayload();
          if (state.solicitudId) {
            await contratacionesService.actualizarSolicitudCotizacion(state.solicitudId, payload);
          } else {
            const resp = await contratacionesService.crearSolicitudCotizacion(payload);
            state.solicitudId = resp.solicitud?.id;
            el.querySelector('#scCodigo').value = resp.solicitud?.codigo || '';
          }
          completeStep('general');
          unlockStep('docs');
          renderItems();
          activateStep('docs');
          finish({ saved: true, solicitudId: state.solicitudId, phase: 'docs' });
        } else if (state.currentStep === 'docs') {
          await contratacionesService.actualizarSolicitudCotizacion(state.solicitudId, {
            docs_solicitados: state.docsResumen,
            requisitos_tecnicos: state.reqResumen,
          });
          completeStep('docs');
          unlockStep('items');
          renderItems();
          activateStep('items');
        } else if (state.currentStep === 'items') {
          await contratacionesService.actualizarSolicitudCotizacion(state.solicitudId, {
            detalle_items: state.items,
            lugares_entrega_item: state.lugares,
          });
          completeStep('items');
          unlockStep('invitaciones');
          activateStep('invitaciones');
          await renderProveedores();
          finish({ saved: true, solicitudId: state.solicitudId, phase: 'invitaciones' });
        }
      } catch (err) { alert(err.message); }
    });

    el.querySelector('#scProvGuardar')?.addEventListener('click', async () => {
      try {
        await contratacionesService.agregarProveedorSolicitud(state.solicitudId, {
          proveedor: el.querySelector('#scProvNombre').value,
          ruc: el.querySelector('#scProvRuc').value,
          telefono: el.querySelector('#scProvTel').value,
          correo: el.querySelector('#scProvCorreo').value,
        });
        el.querySelector('#scProvNombre').value = '';
        el.querySelector('#scProvRuc').value = '';
        el.querySelector('#scProvTel').value = '';
        el.querySelector('#scProvCorreo').value = '';
        await renderProveedores();
      } catch (err) { alert(err.message); }
    });

    el.querySelector('#scEnviarCorreo')?.addEventListener('click', async () => {
      const ids = [...el.querySelectorAll('.sc-prov-sel:checked')].map((c) => parseInt(c.dataset.id, 10));
      if (!ids.length) { alert('Seleccione proveedores pendientes'); return; }
      try {
        await contratacionesService.enviarCorreosSolicitud(state.solicitudId, ids);
        alert('Correos enviados.');
        await renderProveedores();
      } catch (err) { alert(err.message); }
    });

    el.querySelector('#scProvSelectAll')?.addEventListener('change', (e) => {
      el.querySelectorAll('.sc-prov-sel:not(:disabled)').forEach((cb) => { cb.checked = e.target.checked; });
    });

    renderDocsResumen();
    renderReqResumen();
    state.docsResumen.forEach((d) => syncDocPickRow(d.documento));
    state.reqResumen.forEach((r) => {
      const cb = [...el.querySelectorAll('.sc-req-check')].find((c) => c.value === r.requisito);
      if (cb) cb.checked = true;
    });
    if (state.solicitudId) renderItems();
    if (editId) {
      activateStep(opts.initialTab || 'invitaciones');
      if (opts.initialTab === 'invitaciones') renderProveedores();
    } else {
      activateStep('general');
    }
  });
}

export async function showInvitarProveedoresModal(solicitudId) {
  return showSolicitudCotizacionModal([], [], { solicitudId, initialTab: 'invitaciones' });
}

export { toDatetimeLocalValue };

// Modales — Solicitud de Cotización (wizard) e invitaciones a proveedores
import { contratacionesService } from '../services/contratacionesService.js';
import { requerimientosService } from '../services/requerimientosService.js';
import { makeModalDraggable } from './proveedorShared.js';
import { openSelectorProveedoresModal, showHistorialProveedorModal } from './invitacionesProveedorSelector.js';
import { adjuntosService } from '../services/adjuntosService.js';
import {
  renderAdjuntosTable, bindAdjuntosTable, renderDocumentosTable, bindDocumentosTable,
  openBase64Document,
} from './documentViewer.js';
import {
  getCatalogoTipo, mergeDateTime, displayCmnValue,
  itemCantidadForTipo, mapTipoFromRow,
} from './solicitudCatalogos.js';
import { splitDatetimeParts, toDatetimeLocalValue } from './cronogramaDatetime.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  makeModalDraggable(el);
  return { el, modal, close: () => { modal?.hide(); setTimeout(() => el.remove(), 250); } };
}

const SC_FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp';
const SC_FILE_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
]);

function isAllowedScFile(file) {
  if (!file) return false;
  const mime = String(file.type || '').toLowerCase();
  if (SC_FILE_MIMES.has(mime)) return true;
  return /\.(pdf|docx?|xlsx?|jpe?g|png|gif|webp)$/i.test(file.name || '');
}

function openScSubModal({ title, bodyHtml, submitLabel = 'Guardar', onSubmit }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal fade show d-block';
    overlay.style.background = 'rgba(0,0,0,.45)';
    overlay.style.zIndex = '1090';
    overlay.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header py-2 bg-light">
            <h6 class="modal-title mb-0">${esc(title)}</h6>
            <button type="button" class="btn-close" id="scSubClose"></button>
          </div>
          <div class="modal-body">
            ${bodyHtml}
            <div id="scSubError" class="alert alert-danger small py-2 mb-0 mt-2 d-none"></div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="scSubCancel">Cancelar</button>
            <button type="button" class="btn btn-sm btn-primary" id="scSubSubmit">${esc(submitLabel)}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = (result) => { overlay.remove(); resolve(result); };
    const showError = (msg) => {
      const err = overlay.querySelector('#scSubError');
      if (err) { err.textContent = msg; err.classList.remove('d-none'); }
    };
    overlay.querySelector('#scSubClose').onclick = () => close(null);
    overlay.querySelector('#scSubCancel').onclick = () => close(null);
    overlay.onclick = (e) => { if (e.target === overlay) close(null); };
    overlay.querySelector('#scSubSubmit').onclick = async () => {
      overlay.querySelector('#scSubError')?.classList.add('d-none');
      try {
        const ok = await onSubmit(overlay, showError);
        if (ok !== false) close(ok);
      } catch (err) {
        showError(err.message || 'No se pudo completar la operación');
      }
    };
  });
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

function readFileWithContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      resolve({
        nombre: file.name,
        mime_type: file.type || '',
        tamano: file.size,
        fecha_registro: new Date().toISOString(),
        contenido_base64: dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl,
      });
    };
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
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
  const catalogosPorTipo = catalogos.catalogos_por_tipo || {};
  const cmnInicial = displayCmnValue(sol?.cmn || first.cmn);
  const ciParts = splitDatetimeParts(sol?.consultas_inicio, toDatetimeLocalValue);
  const cfParts = splitDatetimeParts(sol?.consultas_fin, toDatetimeLocalValue);
  const tiParts = splitDatetimeParts(sol?.cotizaciones_inicio, toDatetimeLocalValue);
  const tfParts = splitDatetimeParts(sol?.cotizaciones_fin, toDatetimeLocalValue);

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
    proveedoresBusqueda: [],
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
      .sc-btn-inst { background: #0d6efd !important; color: #fff !important; border-color: #0d6efd !important; }
      .sc-btn-inst i, .sc-btn-inst .bi { color: #fff !important; }
      .sc-btn-inst:hover { background: #0b5ed7 !important; color: #fff !important; }
      #scWizardModal .modal-header { cursor: move; }
      .sc-doc-adj { padding: .15rem .4rem !important; font-size: .68rem !important; line-height: 1.2; }
      .sc-req-grid { font-size: .72rem; }
      .sc-req-grid .form-check-label { font-size: .72rem; }
      .sc-cronograma-time { max-width: 110px; }
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
          <input class="form-control form-control-sm" id="scCmn" readonly
            value="${esc(cmnInicial)}" placeholder="" title="Valor registrado en Programación"></div>
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
        <div class="col-md-3"><label class="form-label small">Fecha Inicio Consultas</label>
          <input type="date" class="form-control form-control-sm" id="scConsultasInicioF" value="${esc(ciParts.date)}"></div>
        <div class="col-md-2"><label class="form-label small">Hora</label>
          <input type="time" class="form-control form-control-sm sc-cronograma-time" id="scConsultasInicioH" step="60" value="${esc(ciParts.time)}"></div>
        <div class="col-md-3"><label class="form-label small">Fecha Fin Consultas</label>
          <input type="date" class="form-control form-control-sm" id="scConsultasFinF" value="${esc(cfParts.date)}"></div>
        <div class="col-md-2"><label class="form-label small">Hora</label>
          <input type="time" class="form-control form-control-sm sc-cronograma-time" id="scConsultasFinH" step="60" value="${esc(cfParts.time)}"></div>
      </div>
      <h6 class="small fw-bold">Cronograma de cotización</h6>
      <div class="row g-2">
        <div class="col-md-3"><label class="form-label small">Fecha Inicio Cotización</label>
          <input type="date" class="form-control form-control-sm" id="scCotInicioF" value="${esc(tiParts.date)}"></div>
        <div class="col-md-2"><label class="form-label small">Hora</label>
          <input type="time" class="form-control form-control-sm sc-cronograma-time" id="scCotInicioH" step="60" value="${esc(tiParts.time)}"></div>
        <div class="col-md-3"><label class="form-label small">Fecha Fin Cotización</label>
          <input type="date" class="form-control form-control-sm" id="scCotFinF" value="${esc(tfParts.date)}"></div>
        <div class="col-md-2"><label class="form-label small">Hora</label>
          <input type="time" class="form-control form-control-sm sc-cronograma-time" id="scCotFinH" step="60" value="${esc(tfParts.time)}"></div>
      </div>
    </div>

    <div data-sc-pane="docs" class="d-none">
      <div class="row g-3">
        <div class="col-md-6">
          <div class="sc-docs-panel">
            <h6 class="border-bottom pb-2 mb-2">Documentos solicitados al proveedor</h6>
            <table class="table table-sm sc-sel-table mb-2">
              <thead><tr><th style="width:28px;"></th><th>Documento</th><th>Adjunto</th><th style="width:80px;">Acciones</th></tr></thead>
              <tbody id="scDocsPick"></tbody>
            </table>
            <button type="button" class="btn btn-sm sc-btn-inst" id="scAddOtroDoc"><i class="bi bi-plus"></i> Agregar otro documento</button>
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
            <div class="row g-1 mb-2 sc-req-grid" id="scReqGrid"></div>
            <button type="button" class="btn btn-sm btn-outline-primary mb-2" id="scAddOtroReq"><i class="bi bi-plus"></i> Agregar otro requisito</button>
            <h6 class="border-bottom pb-1 mb-2">Requisitos Seleccionados (<span id="scReqCount">0</span>)</h6>
            <table class="table table-sm table-bordered sc-sel-table mb-0">
              <thead class="table-light"><tr><th>Requisito técnico</th><th>Obligatorio</th><th>Acciones</th></tr></thead>
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
      <div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <div>
          <h6 class="fw-bold mb-1">Invitar proveedores</h6>
          <p class="small text-muted mb-0">Utilice el Maestro de Proveedores — selector inteligente con búsqueda en tiempo real.</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="scProvBuscarBtn"><i class="bi bi-search"></i> Buscar Proveedor</button>
      </div>
      <div class="d-flex justify-content-between mb-2 flex-wrap gap-2">
        <h6 class="fw-bold mb-0">Proveedores invitados</h6>
        <button type="button" class="btn btn-sm btn-success" id="scEnviarCorreo" disabled><i class="bi bi-envelope"></i> ENVIAR CORREO</button>
      </div>
      <div class="table-responsive" style="max-height:360px;overflow-y:auto;">
        <table class="table table-sm table-bordered mb-0">
          <thead class="table-light sticky-top"><tr>
            <th style="width:30px;"><input type="checkbox" id="scProvSelectAll"></th>
            <th>Proveedor</th><th>RUC</th><th>Correo</th><th>Teléfono</th><th>Contacto</th><th>Rubro</th>
            <th>Estado</th><th>Fecha Invitación</th><th class="text-center">N° Inv.</th><th>Acciones</th>
          </tr></thead>
          <tbody id="scProvBody"></tbody>
        </table>
      </div>
    </div>`;

  const footer = `
    <button type="button" class="btn btn-secondary" data-dismiss-cancel>Cancelar</button>
    <button type="button" class="btn btn-outline-secondary d-none" id="scBtnAtras">Atrás</button>
    <button type="button" class="btn btn-primary" id="scBtnContinuar">Guardar y continuar</button>`;

  const { el, close } = openModal(`
    <div class="modal fade" id="scWizardModal" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header prov-draggable-header bg-light"><h5 class="modal-title">Solicitud de Cotización</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">${body}</div>
          <div class="modal-footer" id="scModalFooter">${footer}</div>
        </div>
      </div>
    </div>`);

  const lugaresRapidos = catalogos.lugares_rapidos || [];

  function getCurrentTipo() {
    return el.querySelector('#scTipo')?.value || sol?.tipo || tipoAuto || 'Bienes';
  }

  function getDocsCatalog() {
    return getCatalogoTipo(catalogosPorTipo, getCurrentTipo()).docs_solicitados || [];
  }

  function getReqCatalog() {
    return getCatalogoTipo(catalogosPorTipo, getCurrentTipo()).requisitos_tecnicos || [];
  }

  function pruneSelectionsForTipo() {
    const docs = new Set(getDocsCatalog());
    const reqs = new Set(getReqCatalog());
    state.docsResumen = state.docsResumen.filter((d) => docs.has(d.documento));
    state.reqResumen = state.reqResumen.filter((r) => reqs.has(r.requisito));
  }

  function bindDocPickEvents() {
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
  }

  function bindReqPickEvents() {
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
  }

  function rebuildDocsTab() {
    const docsCatalog = getDocsCatalog();
    const reqCatalog = getReqCatalog();
    const pick = el.querySelector('#scDocsPick');
    const grid = el.querySelector('#scReqGrid');
    if (pick) {
      pick.innerHTML = docsCatalog.map((d, i) => `
        <tr data-doc-name="${esc(d)}">
          <td><input type="checkbox" class="form-check-input sc-doc-check" id="scDoc${i}" value="${esc(d)}"></td>
          <td><label class="small mb-0" for="scDoc${i}">${esc(d)}</label></td>
          <td class="sc-doc-adj-cell small text-muted">—</td>
          <td><button type="button" class="btn btn-sm sc-btn-inst sc-doc-adj" data-doc="${esc(d)}"><i class="bi bi-paperclip"></i> Adjuntar</button></td>
        </tr>`).join('');
      bindDocPickEvents();
    }
    if (grid) {
      grid.innerHTML = reqCatalog.map((d, i) => `
        <div class="col-md-6"><div class="form-check">
          <input class="form-check-input sc-req-check" type="checkbox" id="scReq${i}" value="${esc(d)}">
          <label class="form-check-label" for="scReq${i}">${esc(d)}</label>
        </div></div>`).join('');
      bindReqPickEvents();
    }
    state.docsResumen.forEach((d) => syncDocPickRow(d.documento));
    state.reqResumen.forEach((r) => {
      const cb = [...el.querySelectorAll('.sc-req-check')].find((c) => c.value === r.requisito);
      if (cb) cb.checked = true;
    });
    renderDocsResumen();
    renderReqResumen();
  }

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
      <td class="text-nowrap">
        ${d.contenido_base64 ? `
          <button type="button" class="btn btn-sm btn-outline-primary sc-doc-res-ver" data-i="${i}">Ver</button>
          <button type="button" class="btn btn-sm btn-outline-secondary sc-doc-res-dl" data-i="${i}">Descargar</button>` : ''}
        <button type="button" class="btn btn-sm sc-btn-inst sc-doc-del" data-i="${i}"><i class="bi bi-trash"></i> Eliminar</button>
      </td></tr>`).join('')
      || '<tr><td colspan="4" class="text-muted small">Sin documentos seleccionados</td></tr>';
    tb.querySelectorAll('.sc-doc-res-ver').forEach((btn) => {
      btn.onclick = () => {
        const d = state.docsResumen[parseInt(btn.dataset.i, 10)];
        if (d?.contenido_base64) {
          openBase64Document({
            nombre: d.archivo || d.documento,
            mime_type: d.mime_type,
            contenido_base64: d.contenido_base64,
          });
        }
      };
    });
    tb.querySelectorAll('.sc-doc-res-dl').forEach((btn) => {
      btn.onclick = () => {
        const d = state.docsResumen[parseInt(btn.dataset.i, 10)];
        if (!d?.contenido_base64) return;
        const a = document.createElement('a');
        a.href = `data:${d.mime_type || 'application/octet-stream'};base64,${d.contenido_base64}`;
        a.download = d.archivo || d.documento || 'documento';
        a.click();
      };
    });
    tb.querySelectorAll('.sc-doc-del').forEach((btn) => {
      btn.onclick = () => {
        const removed = state.docsResumen.splice(parseInt(btn.dataset.i, 10), 1)[0];
        if (removed) syncDocPickRow(removed.documento);
        renderDocsResumen();
      };
    });
    getDocsCatalog().forEach((d) => syncDocPickRow(d));
    state.docsResumen.forEach((d) => syncDocPickRow(d.documento));
  }

  function renderReqResumen() {
    const tb = el.querySelector('#scReqResumen');
    const count = el.querySelector('#scReqCount');
    if (count) count.textContent = state.reqResumen.length;
    if (!tb) return;
    tb.innerHTML = state.reqResumen.map((d, i) => `
      <tr><td>${esc(d.requisito)}</td>
      <td class="text-center">${d.obligatorio !== false ? 'SI' : 'NO'}</td>
      <td><button type="button" class="btn btn-sm sc-btn-inst sc-req-del" data-i="${i}"><i class="bi bi-trash"></i> Eliminar</button></td></tr>`).join('')
      || '<tr><td colspan="3" class="text-muted small">Sin requisitos seleccionados</td></tr>';
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

  function addDocToResumen(docName, archivo = '', fecha = new Date().toISOString(), extra = {}) {
    if (state.docsResumen.some((d) => d.documento === docName)) {
      const row = state.docsResumen.find((d) => d.documento === docName);
      if (archivo) row.archivo = archivo;
      if (fecha) row.fecha_registro = fecha;
      if (extra.contenido_base64) row.contenido_base64 = extra.contenido_base64;
      if (extra.mime_type) row.mime_type = extra.mime_type;
      if (extra.tamano != null) row.tamano = extra.tamano;
      if (extra.comentario != null) row.comentario = extra.comentario;
    } else {
      state.docsResumen.push({
        documento: docName, archivo, fecha_registro: fecha,
        contenido_base64: extra.contenido_base64 || null,
        mime_type: extra.mime_type || null,
        tamano: extra.tamano || null,
        comentario: extra.comentario || '',
      });
    }
    renderDocsResumen();
  }

  function attachDocFile(docName) {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const meta = await readFileWithContent(file);
        addDocToResumen(docName, meta.nombre, meta.fecha_registro, meta);
      } catch (err) {
        alert(err.message || 'No se pudo adjuntar el archivo');
      }
    };
    input.click();
  }

  function renderItems() {
    const tb = el.querySelector('#scItemsBody');
    const lb = el.querySelector('#scLugaresBody');
    if (!tb || !lb) return;
    const tipoActual = getCurrentTipo();
    tb.innerHTML = state.items.map((it, i) => {
      const cant = itemCantidadForTipo(tipoActual, it.cantidad);
      return `
      <tr>
        <td>${esc(it.requerimiento_codigo || it.requerimiento_id)}</td>
        <td>${esc(it.paquete || '—')}</td><td class="small">${esc(it.pedido_sigamef || '—')}</td>
        <td>${esc(it.codigo_sigamef || '—')}</td><td>${esc(it.descripcion || '—')}</td>
        <td class="text-center">${esc(cant)}</td>
        <td class="small text-nowrap">
          <button type="button" class="btn btn-sm sc-btn-inst me-1 sc-item-req" data-i="${i}"><i class="bi bi-eye"></i> VER REQUERIMIENTO</button>
          <button type="button" class="btn btn-sm sc-btn-inst sc-item-docs" data-i="${i}"><i class="bi bi-folder2-open"></i> DOCUMENTOS</button>
        </td>
      </tr>`;
    }).join('');
    lb.innerHTML = state.lugares.map((it, i) => {
      const cant = itemCantidadForTipo(tipoActual, it.cantidad);
      return `
      <tr data-li="${i}">
        <td>${esc(it.requerimiento_codigo || it.requerimiento_id)}</td>
        <td>${esc(it.paquete || '—')}</td><td class="small">${esc(it.pedido_sigamef || '—')}</td>
        <td>${esc(it.codigo_sigamef || '—')}</td><td>${esc(it.descripcion || '—')}</td>
        <td class="text-center">${esc(cant)}</td>
        <td><input class="form-control form-control-sm sc-loc-region" value="${esc(it.region || '')}"></td>
        <td><input class="form-control form-control-sm sc-loc-prov" value="${esc(it.provincia || '')}"></td>
        <td><input class="form-control form-control-sm sc-loc-dist" value="${esc(it.distrito || '')}"></td>
      </tr>`;
    }).join('');
    lb.querySelectorAll('tr').forEach((tr) => {
      const i = parseInt(tr.dataset.li, 10);
      tr.querySelector('.sc-loc-region').oninput = (e) => { state.lugares[i].region = e.target.value; };
      tr.querySelector('.sc-loc-prov').oninput = (e) => { state.lugares[i].provincia = e.target.value; };
      tr.querySelector('.sc-loc-dist').oninput = (e) => { state.lugares[i].distrito = e.target.value; };
    });
    bindItemActions();
  }

  function bindItemActions() {
    const tipoActual = getCurrentTipo();
    el.querySelector('#scItemsBody')?.querySelectorAll('.sc-item-req').forEach((btn) => {
      btn.onclick = () => showItemRequerimientoModal(state.items[parseInt(btn.dataset.i, 10)], {
        tipo: tipoActual,
        catalogosPorTipo,
      });
    });
    el.querySelector('#scItemsBody')?.querySelectorAll('.sc-item-docs').forEach((btn) => {
      btn.onclick = () => showItemDocumentosModal(state.items[parseInt(btn.dataset.i, 10)], state);
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
      return `<tr>
        <td><input type="checkbox" class="sc-prov-sel" data-invitacion-id="${p.invitacion_id ?? p.id}" ${enviado ? 'disabled' : ''}></td>
        <td>${esc(p.razon_social)}</td><td>${esc(p.ruc)}</td>
        <td class="small">${esc(p.correo_display || '')}</td><td>${esc(p.telefono || '')}</td>
        <td class="small">${esc(p.persona_contacto || '')}</td><td>${esc(p.rubro || '')}</td>
        <td><span class="badge bg-${enviado ? 'primary' : 'secondary'}">${esc(p.estado_envio)}</span></td>
        <td class="small">${p.fecha_invitacion || p.fecha_envio ? esc(String(p.fecha_invitacion || p.fecha_envio).slice(0, 16).replace('T', ' ')) : '—'}</td>
        <td class="text-center">${p.cantidad_invitaciones_proveedor ?? 0}</td>
        <td class="text-nowrap">
          ${enviado ? '' : `<button type="button" class="btn btn-sm btn-outline-danger sc-prov-del" data-invitacion-id="${p.invitacion_id ?? p.id}">Eliminar</button>`}
          ${enviado ? `<button type="button" class="btn btn-sm btn-outline-primary sc-prov-mail" data-invitacion-id="${p.invitacion_id ?? p.id}"><i class="bi bi-envelope"></i></button>` : ''}
          <button type="button" class="btn btn-sm btn-outline-secondary sc-prov-hist" data-pid="${p.proveedor_id}" data-name="${esc(p.razon_social)}"><i class="bi bi-clock-history"></i></button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="11" class="text-muted small text-center">Sin proveedores — use Buscar Proveedor</td></tr>';
    tb.querySelectorAll('.sc-prov-del').forEach((btn) => {
      btn.onclick = async () => {
        await contratacionesService.eliminarProveedorSolicitud(state.solicitudId, btn.dataset.invitacionId);
        await renderProveedores();
      };
    });
    tb.querySelectorAll('.sc-prov-hist').forEach((btn) => {
      btn.onclick = () => showHistorialProveedorModal(btn.dataset.pid, btn.dataset.name);
    });
    tb.querySelectorAll('.sc-prov-mail').forEach((btn) => {
      btn.onclick = async () => {
        try {
          const resp = await contratacionesService.enviarCorreosSolicitud(state.solicitudId, [parseInt(btn.dataset.invitacionId, 10)]);
          alert(resp?.mensaje || 'Solicitud de Cotización enviada correctamente.');
          await renderProveedores();
          window.dispatchEvent(new CustomEvent('sgc:invitaciones-updated', { detail: { solicitudId: state.solicitudId } }));
        } catch (err) { alert(err.message); }
      };
    });
    el.querySelector('#scEnviarCorreo').disabled = !tb.querySelector('.sc-prov-sel:not(:disabled)');
  }

  function collectGeneralPayload() {
    const payload = {
      requerimiento_ids: effectiveReqIds,
      tipo: el.querySelector('#scTipo')?.value,
      denominacion: el.querySelector('#scDenominacion')?.value,
      cmn: displayCmnValue(el.querySelector('#scCmn')?.value || cmnInicial),
      area_usuaria: el.querySelector('#scArea')?.value,
      tipo_evaluacion: el.querySelector('#scTipoEval')?.value,
      consultas_inicio: mergeDateTime(
        el.querySelector('#scConsultasInicioF')?.value,
        el.querySelector('#scConsultasInicioH')?.value,
      ),
      consultas_fin: mergeDateTime(
        el.querySelector('#scConsultasFinF')?.value,
        el.querySelector('#scConsultasFinH')?.value,
      ),
      cotizaciones_inicio: mergeDateTime(
        el.querySelector('#scCotInicioF')?.value,
        el.querySelector('#scCotInicioH')?.value,
      ),
      cotizaciones_fin: mergeDateTime(
        el.querySelector('#scCotFinF')?.value,
        el.querySelector('#scCotFinH')?.value,
      ),
    };
    if (!payload.tipo_evaluacion) throw new Error('El tipo de evaluación es obligatorio');
    validarCronogramaCliente(payload);
    return payload;
  }

  el.querySelector('#scTipo')?.addEventListener('change', () => {
    pruneSelectionsForTipo();
    rebuildDocsTab();
    renderItems();
  });

  el.querySelectorAll('[data-sc-tab]').forEach((btn) => {
    btn.onclick = () => {
      if (btn.classList.contains('disabled') || btn.disabled) return;
      activateStep(btn.dataset.scTab);
    };
  });

  async function showAgregarDocumentoModal() {
    const result = await openScSubModal({
      title: 'Agregar documento solicitado al proveedor',
      submitLabel: 'Agregar documento',
      bodyHtml: `
        <div class="mb-2">
          <label class="form-label small mb-1">Nombre del documento <span class="text-danger">*</span></label>
          <input type="text" class="form-control form-control-sm" id="scAddDocNombre" maxlength="200">
        </div>
        <div class="mb-2">
          <label class="form-label small mb-1">Archivo adjunto <span class="text-danger">*</span></label>
          <input type="file" class="form-control form-control-sm" id="scAddDocFile" accept="${SC_FILE_ACCEPT}">
          <div class="form-text">PDF, Word, Excel o imagen.</div>
        </div>
        <div class="mb-0">
          <label class="form-label small mb-1">Descripción / comentario</label>
          <textarea class="form-control form-control-sm" id="scAddDocComentario" rows="2" maxlength="500"></textarea>
        </div>`,
      onSubmit: async (overlay, showError) => {
        const nombre = overlay.querySelector('#scAddDocNombre')?.value?.trim();
        const file = overlay.querySelector('#scAddDocFile')?.files?.[0];
        const comentario = overlay.querySelector('#scAddDocComentario')?.value?.trim() || '';
        if (!nombre) { showError('El nombre del documento es obligatorio.'); return false; }
        if (!file) { showError('Debe adjuntar un archivo.'); return false; }
        if (!isAllowedScFile(file)) { showError('Formato no permitido. Use PDF, Word, Excel o imagen.'); return false; }
        const meta = await readFileWithContent(file);
        addDocToResumen(nombre, meta.nombre, meta.fecha_registro, { ...meta, comentario });
        return true;
      },
    });
    return result;
  }

  async function showAgregarRequisitoModal() {
    const result = await openScSubModal({
      title: 'Agregar requisito técnico mínimo',
      submitLabel: 'Agregar requisito',
      bodyHtml: `
        <div class="mb-2">
          <label class="form-label small mb-1">Nombre del requisito técnico <span class="text-danger">*</span></label>
          <input type="text" class="form-control form-control-sm" id="scAddReqNombre" maxlength="200">
        </div>
        <div class="mb-2">
          <label class="form-label small mb-1">Obligatorio</label>
          <select class="form-select form-select-sm" id="scAddReqObl">
            <option value="SI" selected>SI</option>
            <option value="NO">NO</option>
          </select>
        </div>
        <div class="mb-0">
          <label class="form-label small mb-1">Observación</label>
          <textarea class="form-control form-control-sm" id="scAddReqObs" rows="2" maxlength="500"></textarea>
        </div>`,
      onSubmit: async (overlay, showError) => {
        const nombre = overlay.querySelector('#scAddReqNombre')?.value?.trim();
        const obligatorio = overlay.querySelector('#scAddReqObl')?.value === 'SI';
        const observacion = overlay.querySelector('#scAddReqObs')?.value?.trim() || '';
        if (!nombre) { showError('El nombre del requisito es obligatorio.'); return false; }
        if (state.reqResumen.some((r) => r.requisito === nombre)) {
          showError('Ya existe un requisito con ese nombre.');
          return false;
        }
        state.reqResumen.push({ requisito: nombre, obligatorio, observacion, archivo: '' });
        renderReqResumen();
        return true;
      },
    });
    return result;
  }

  el.querySelector('#scAddOtroDoc')?.addEventListener('click', () => showAgregarDocumentoModal());

  el.querySelector('#scAddOtroReq')?.addEventListener('click', () => showAgregarRequisitoModal());

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
          const tipoActual = getCurrentTipo();
          const itemsNorm = state.items.map((it) => ({
            ...it,
            cantidad: itemCantidadForTipo(tipoActual, it.cantidad),
          }));
          const lugaresNorm = state.lugares.map((l) => ({
            ...l,
            cantidad: itemCantidadForTipo(tipoActual, l.cantidad),
          }));
          await contratacionesService.actualizarSolicitudCotizacion(state.solicitudId, {
            detalle_items: itemsNorm,
            lugares_entrega_item: lugaresNorm,
          });
          completeStep('items');
          unlockStep('invitaciones');
          activateStep('invitaciones');
          await renderProveedores();
          finish({ saved: true, solicitudId: state.solicitudId, phase: 'invitaciones' });
        }
      } catch (err) { alert(err.message); }
    });

    el.querySelector('#scProvBuscarBtn')?.addEventListener('click', () => {
      openSelectorProveedoresModal({
        solicitudId: state.solicitudId,
        onAdded: () => renderProveedores(),
      });
    });

    el.querySelector('#scEnviarCorreo')?.addEventListener('click', async () => {
      const ids = [...el.querySelectorAll('.sc-prov-sel:checked')]
        .map((c) => parseInt(c.dataset.invitacionId, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (!ids.length) { alert('Seleccione proveedores pendientes'); return; }
      try {
        const resp = await contratacionesService.enviarCorreosSolicitud(state.solicitudId, ids);
        alert(resp?.mensaje || 'Solicitud de Cotización enviada correctamente.');
        await renderProveedores();
        window.dispatchEvent(new CustomEvent('sgc:invitaciones-updated', { detail: { solicitudId: state.solicitudId } }));
      } catch (err) { alert(err.message); }
    });

    el.querySelector('#scProvSelectAll')?.addEventListener('change', (e) => {
      el.querySelectorAll('.sc-prov-sel:not(:disabled)').forEach((cb) => { cb.checked = e.target.checked; });
    });

    rebuildDocsTab();
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

async function showItemRequerimientoModal(item, opts = {}) {
  if (!item?.requerimiento_id) return;
  let req = null;
  let adjuntos = [];
  try {
    req = await requerimientosService.getById(item.requerimiento_id);
    const adjResp = await adjuntosService.getAdjuntos(item.requerimiento_id);
    adjuntos = adjResp?.adjuntos || adjResp?.data || [];
  } catch (_) {}
  const tipoContratacion = opts.tipo || mapTipoFromRow(req || item);
  const payload = (() => { try { return JSON.parse(req?.payload || '{}'); } catch (_) { return {}; } })();
  const items = payload.items || payload.servicioItems || payload.locadorItems || [];
  const cantDisplay = itemCantidadForTipo(tipoContratacion, item.cantidad);
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" tabindex="-1"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header prov-draggable-header"><h5 class="modal-title">Requerimiento ${esc(item.requerimiento_codigo || item.requerimiento_id)} — ${esc(tipoContratacion)}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <ul class="nav nav-tabs mb-3">
          <li class="nav-item"><a class="nav-link active" href="#" data-it="ped">Pedidos</a></li>
          <li class="nav-item"><a class="nav-link" href="#" data-it="adj">Documentos</a></li>
        </ul>
        <div id="itPanePed">
          <table class="table table-sm table-bordered"><thead><tr>
          <th>Pedido</th><th>Código</th><th>Descripción</th><th>Cant.</th></tr></thead><tbody>
          ${items.map((p) => `<tr><td>${esc(p.pedido_sigamef || item.pedido_sigamef || '—')}</td>
            <td>${esc(p.item_bien || p.codigo_sigamef || item.codigo_sigamef || '—')}</td>
            <td>${esc(p.nombre_item || p.descripcion || item.descripcion || '—')}</td>
            <td>${esc(itemCantidadForTipo(tipoContratacion, p.cantidad ?? item.cantidad))}</td></tr>`).join('')
            || `<tr><td>${esc(item.pedido_sigamef || '—')}</td><td>${esc(item.codigo_sigamef || '—')}</td><td>${esc(item.descripcion || '—')}</td><td>${esc(cantDisplay)}</td></tr>`}
        </tbody></table></div>
        <div id="itPaneAdj" class="d-none">
          <div id="itAdjTable">${renderAdjuntosTable(adjuntos)}</div>
        </div>
      </div>
    </div></div></div>`;
  document.body.appendChild(wrap);
  const mEl = wrap.firstElementChild;
  makeModalDraggable(mEl);
  bindAdjuntosTable(wrap);
  const panes = { ped: 'itPanePed', adj: 'itPaneAdj' };
  wrap.querySelectorAll('[data-it]').forEach((tab) => {
    tab.onclick = (e) => {
      e.preventDefault();
      wrap.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
      tab.classList.add('active');
      Object.entries(panes).forEach(([k, id]) => wrap.querySelector(`#${id}`)?.classList.toggle('d-none', tab.dataset.it !== k));
    };
  });
  const m = window.bootstrap.Modal.getOrCreateInstance(mEl);
  mEl.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
  m.show();
}

function showItemDocumentosModal(item, wizardState) {
  if (!item) return;
  if (!item.documentos_anexos) item.documentos_anexos = {};
  const docsSolicitados = (wizardState?.docsResumen || []).map((d) => ({
    documento: d.documento,
    archivo: d.archivo || '',
    mime_type: d.mime_type || 'application/pdf',
    fecha_registro: d.fecha_registro,
    version: d.version || '1.0',
    tamano: d.tamano,
    contenido_base64: d.contenido_base64 || '',
    tipo_doc: 'Solicitado',
  }));
  Object.entries(item.documentos_anexos || {}).forEach(([tipo, doc]) => {
    if (!doc) return;
    docsSolicitados.push({
      documento: tipo,
      archivo: doc.nombre || doc.archivo || tipo,
      mime_type: doc.mime_type || 'application/pdf',
      fecha_registro: doc.fecha_registro,
      version: '1.0',
      tamano: doc.tamano,
      contenido_base64: doc.contenido_base64 || '',
      tipo_doc: 'Anexo ítem',
    });
  });
  const reqTecnicos = (wizardState?.reqResumen || []).map((r) => ({
    requisito: r.requisito,
    obligatorio: r.obligatorio !== false,
    archivo: r.archivo || (r.contenido_base64 ? 'Adjunto' : ''),
    estado: r.archivo || r.contenido_base64 ? 'Cargado' : 'Requerido',
    contenido_base64: r.contenido_base64 || '',
    mime_type: r.mime_type || '',
  }));
  const wrap = document.createElement('div');
  const renderSolTab = () => {
    const host = wrap.querySelector('#idDocSolicitados');
    if (host) {
      host.innerHTML = renderDocumentosTable(docsSolicitados, { editableOtros: true });
      bindDocumentosTable(host, docsSolicitados, { onChange: renderSolTab });
    }
  };
  const renderTecTab = () => {
    const host = wrap.querySelector('#idDocTecnicos');
    if (!host) return;
    if (!reqTecnicos.length) {
      host.innerHTML = '<p class="text-muted small mb-0">No se registraron requisitos técnicos en la Solicitud de Cotización.</p>';
      return;
    }
    host.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-bordered mb-0">
          <thead class="table-light"><tr>
            <th>Requisito técnico</th><th class="text-center">Requerido</th><th>Documento adjunto</th><th>Estado</th><th>Acciones</th>
          </tr></thead>
          <tbody>${reqTecnicos.map((r, i) => `
            <tr>
              <td>${esc(r.requisito)}</td>
              <td class="text-center">${r.obligatorio ? 'Sí' : 'No'}</td>
              <td class="small">${esc(r.archivo || '—')}</td>
              <td><span class="badge bg-${r.estado === 'Cargado' ? 'success' : 'secondary'}">${esc(r.estado)}</span></td>
              <td>${r.contenido_base64 ? `<button type="button" class="btn btn-sm btn-outline-primary sgc-tec-ver" data-i="${i}">Ver</button>` : '—'}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
    host.querySelectorAll('.sgc-tec-ver').forEach((btn) => {
      btn.onclick = () => {
        const r = reqTecnicos[parseInt(btn.dataset.i, 10)];
        if (r?.contenido_base64) openBase64Document({ nombre: r.archivo || r.requisito, mime_type: r.mime_type, contenido_base64: r.contenido_base64 });
      };
    });
  };
  wrap.innerHTML = `
    <div class="modal fade" tabindex="-1"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header prov-draggable-header"><h5 class="modal-title">Documentos — ${esc(item.requerimiento_codigo || 'Ítem')}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <ul class="nav nav-tabs mb-3">
          <li class="nav-item"><a class="nav-link active" href="#" data-idt="sol">Documentos solicitados</a></li>
          <li class="nav-item"><a class="nav-link" href="#" data-idt="tec">Documentos técnicos</a></li>
        </ul>
        <div id="idPaneSol"><div id="idDocSolicitados"></div>
          <p class="text-muted small mt-2 mb-0">Los documentos del catálogo se cargan automáticamente. Solo <strong>Otros documentos</strong> permite agregar, modificar o eliminar.</p>
        </div>
        <div id="idPaneTec" class="d-none"><div id="idDocTecnicos"></div></div>
      </div>
    </div></div></div>`;
  document.body.appendChild(wrap);
  const mEl = wrap.firstElementChild;
  makeModalDraggable(mEl);
  renderSolTab();
  renderTecTab();
  const panes = { sol: 'idPaneSol', tec: 'idPaneTec' };
  wrap.querySelectorAll('[data-idt]').forEach((tab) => {
    tab.onclick = (e) => {
      e.preventDefault();
      wrap.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
      tab.classList.add('active');
      Object.entries(panes).forEach(([k, id]) => wrap.querySelector(`#${id}`)?.classList.toggle('d-none', tab.dataset.idt !== k));
    };
  });
  const m = window.bootstrap.Modal.getOrCreateInstance(mEl);
  mEl.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
  m.show();
}

export { toDatetimeLocalValue } from './cronogramaDatetime.js';

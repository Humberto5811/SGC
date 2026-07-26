/**
 * Modal Elaborar / Ver Cuadro Comparativo — Bienes 08-A / Servicios 08-B (RC8.2–RC8.5).
 */
import { contratacionesService } from '../services/contratacionesService.js';
import { api } from '../services/apiService.js';
import {
  renderMatrizBienesHtml,
  renderResumenProveedores,
  renderInconsistencias,
  renderAdvertenciasAdjudicacion,
  renderResumenAdjudicacion,
  renderHistorialAdjudicacion,
  renderPanelSegundaFuente,
  collectObservacionesFromDom,
  collectSeleccionesFromDom,
  bindAdjProveedorLiveUpdate,
  TIPOS_SEGUNDA_FUENTE,
  isCuadroServicios,
} from './cuadroComparativoMatriz.js';
import { labelCuadroEstado, badgeClassCuadro } from './cuadroComparativoUtils.js';
import {
  generateAnexo8APdf,
  previewAnexo8APdf,
  downloadAnexo8APdf,
  validateCuadroParaAnexo8A,
} from './cuadroComparativoPdf.js';
import { triggerPdfUpload } from './validacionAnexo07aPdf.js';
import { normalizeSegundaFuente, calcPrecioActualizado } from './cuadroComparativoFuentes.js';
import {
  isModoCoordinador8Uit,
  renderPanelCoordinador,
} from './cuadroComparativoCoordinador.js';
import {
  isModoDec,
  renderPanelDec,
  showDevolverDecModal,
} from './cuadroComparativoDec.js';
import { observarCuadroConModalInstitucional } from './cuadroComparativoObservaciones.js';
import { ROLES_REVISION } from './cuadroComparativoRevisionUi.js';
import {
  renderPanelVersionado,
  collectRespuestaObservaciones,
  isCuadroObservadoEditable,
} from './cuadroComparativoVersionado.js';
import {
  isModoGeneracionCcp,
  renderPanelGeneracionCcp,
  evaluarGatesCcpCliente,
} from './cuadroComparativoCcp.js';
import { puedeMostrarBotonesCcp } from './cuadroComparativoRevisionUi.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Etiquetas UI según Bienes (8A) o Servicios (8B). */
function anexoUiLabels(matriz, cuadro) {
  const serv = isCuadroServicios(matriz)
    || String(cuadro?.tipo || '').toUpperCase().includes('SERV');
  return {
    short: serv ? '8B' : '8A',
    titulo: serv ? 'Anexo N.° 08-B' : 'Anexo N.° 08-A',
    firmado: serv ? 'Anexo 8B firmado' : 'Anexo 8A firmado',
    adjuntar: serv ? 'Adjuntar Anexo 8B firmado' : 'Adjuntar Anexo 8A firmado',
  };
}

function showBootstrapModal(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  const el = wrap.querySelector('.modal');
  const modal = window.bootstrap?.Modal ? new window.bootstrap.Modal(el) : null;
  el.addEventListener('hidden.bs.modal', () => wrap.remove());
  if (modal) modal.show();
  else {
    el.style.display = 'block';
    el.classList.add('show');
  }
  return { wrap, el, modal };
}

const CRITERIOS = [
  { v: 'VALOR_POR_DINERO', l: 'Valor por dinero' },
  { v: 'MENOR_PRECIO_VALIDO', l: 'Menor precio válido' },
  { v: 'CUMPLIMIENTO_INTEGRAL', l: 'Cumplimiento integral' },
  { v: 'EMPATE', l: 'Empate' },
  { v: 'MENOS_DE_TRES_COTIZACIONES', l: 'Menos de tres cotizaciones' },
  { v: 'OTRO', l: 'Otro' },
];

function currentUser() {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}'); } catch (_) { return {}; }
}

function isReadonlyEstado(cuadro) {
  const e = String(cuadro?.estado || cuadro?.estado_cuadro || '').toUpperCase();
  if (e === 'FIRMADO' || e === 'DERIVADO_CCP' || e === 'ANULADO' || !!cuadro?.solo_lectura) return true;
  // RC8.5: Coordinador — sin edición económica mientras está pendiente
  if (['PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR'].includes(e)) return true;
  return false;
}

function isDerivado(cuadro) {
  return String(cuadro?.estado || '').toUpperCase() === 'DERIVADO_CCP';
}

function renderPanelSustento(matriz, readonly) {
  const adj = matriz?.adjudicacion || {};
  const opts = CRITERIOS.map((c) => `
    <option value="${c.v}" ${(adj.metodologia || adj.criterio_seleccion) === c.v ? 'selected' : ''}>${esc(c.l)}</option>`).join('');
  const dis = readonly ? 'disabled' : '';
  return `
    <div class="border rounded p-3 mb-3" id="ccPanelAdjudicacion">
      <h6 class="fw-bold mb-2">Procedimiento / metodología</h6>
      <div class="row g-2">
        <div class="col-md-4">
          <label class="form-label small mb-0">Procedimiento / metodología</label>
          <select class="form-select form-select-sm" id="ccCriterio" ${dis}>${opts}</select>
        </div>
        <div class="col-md-8">
          <label class="form-label small mb-0">Sustento de la metodología</label>
          <textarea class="form-control form-control-sm" id="ccSustento" rows="2" ${dis}>${esc(adj.sustento_decision || '')}</textarea>
        </div>
      </div>
    </div>`;
}

function renderPanelFirma(cuadro, matriz = null) {
  const derivado = isDerivado(cuadro);
  const tiene = !!cuadro?.tiene_pdf_firmado || !!cuadro?.firmado_nombre;
  const nombre = cuadro?.firmado_nombre || '';
  const meta = tiene
    ? `<div class="small text-success mb-1"><i class="bi bi-check-circle"></i> Firmado: <strong>${esc(nombre)}</strong>
        ${cuadro.firmado_por ? ` · ${esc(cuadro.firmado_por)}` : ''}
        ${cuadro.firmado_at ? ` · ${esc(String(cuadro.firmado_at).slice(0, 16).replace('T', ' '))}` : ''}</div>`
    : '<div class="small text-muted mb-1">Sin PDF firmado adjunto aún.</div>';
  const infoDeriv = derivado
    ? `<div class="alert alert-secondary py-2 small mb-2">
        Derivado a CCP
        ${cuadro.derivado_at ? ` el ${esc(String(cuadro.derivado_at).slice(0, 16).replace('T', ' '))}` : ''}
        ${cuadro.responsable_ccp_nombre ? ` · Responsable: <strong>${esc(cuadro.responsable_ccp_nombre)}</strong>` : ''}
        ${cuadro.derivado_por ? ` · Por: ${esc(cuadro.derivado_por)}` : ''}
      </div>`
    : '';
  const anexoLbl = anexoUiLabels(matriz, cuadro);
  return `
    <div class="card border mb-3" id="ccPanelFirma">
      <div class="card-body py-3">
        <h6 class="fw-bold mb-2">${esc(anexoLbl.firmado)}</h6>
        ${infoDeriv}
        ${meta}
        <div class="d-flex flex-wrap gap-2" id="ccFirmaActions">
          ${!derivado ? `
            <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnAdjuntarFirmado">
              <i class="bi bi-paperclip"></i> ${esc(anexoLbl.adjuntar)}
            </button>` : ''}
          ${tiene ? `
            <button type="button" class="btn btn-sm btn-outline-secondary" id="ccBtnVerFirmado"><i class="bi bi-eye"></i> Ver</button>
            <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnDlFirmado"><i class="bi bi-download"></i> Descargar</button>` : ''}
          ${tiene && !derivado ? `
            <button type="button" class="btn btn-sm btn-outline-danger" id="ccBtnEliminarFirmado"><i class="bi bi-trash"></i> Eliminar</button>` : ''}
        </div>
      </div>
    </div>`;
}

function refreshMatrizHost(el, matriz, editable) {
  const host = el.querySelector('#ccMatrizHost');
  if (host) {
    host.innerHTML = renderMatrizBienesHtml(matriz, { editable });
    if (editable) bindAdjProveedorLiveUpdate(host);
  }
  const sf = el.querySelector('#ccSegundaFuenteHost');
  if (sf) sf.innerHTML = renderPanelSegundaFuente(matriz, { editable });
  const adv = el.querySelector('#ccAdvHost');
  if (adv) adv.innerHTML = renderAdvertenciasAdjudicacion(matriz);
  const res = el.querySelector('#ccResumenAdjHost');
  if (res) res.innerHTML = renderResumenAdjudicacion(matriz) + renderHistorialAdjudicacion(matriz.historial_adjudicacion);
}

function showConfirmSgc({ title, message, confirmLabel = 'Confirmar' }) {
  return new Promise((resolve) => {
    const { el, modal } = showBootstrapModal(`
      <div class="modal fade" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header"><h5 class="modal-title">${esc(title)}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
            <div class="modal-body"><p class="mb-0">${esc(message)}</p></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" data-cc="no">Cancelar</button>
              <button type="button" class="btn btn-danger" data-cc="yes">${esc(confirmLabel)}</button>
            </div>
          </div>
        </div>
      </div>`);
    el.querySelector('[data-cc="yes"]').onclick = () => { modal?.hide(); resolve(true); };
    el.querySelector('[data-cc="no"]').onclick = () => { modal?.hide(); resolve(false); };
    el.addEventListener('hidden.bs.modal', () => resolve(false), { once: true });
  });
}

function buildRequerimientosOpciones(items = []) {
  const map = new Map();
  items.forEach((it) => {
    const id = it.requerimiento_id != null && it.requerimiento_id !== ''
      ? String(it.requerimiento_id)
      : `cod:${it.requerimiento_codigo || it.item_key}`;
    if (!map.has(id)) {
      map.set(id, {
        key: id,
        requerimiento_id: it.requerimiento_id ?? null,
        codigo: it.requerimiento_codigo || String(it.requerimiento_id || 'REQ'),
      });
    }
  });
  return [...map.values()];
}

function showSegundaFuenteFormModal({ items = [], fuente = null }) {
  return new Promise((resolve) => {
    const tipoOpts = TIPOS_SEGUNDA_FUENTE.map((t) => `
      <option value="${t.code}" ${fuente?.tipo_fuente === t.code ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
    const reqOpts = buildRequerimientosOpciones(items);
    const selectedReqKey = (() => {
      if (fuente?.requerimiento_id != null && fuente.requerimiento_id !== '') {
        return String(fuente.requerimiento_id);
      }
      if (fuente?.requerimiento_codigo) {
        const hit = reqOpts.find((r) => r.codigo === fuente.requerimiento_codigo);
        return hit?.key || '';
      }
      return reqOpts.length === 1 ? reqOpts[0].key : '';
    })();
    const reqSelectHtml = reqOpts.map((r) => `
      <option value="${esc(r.key)}" data-req-id="${esc(r.requerimiento_id ?? '')}"
        data-req-codigo="${esc(r.codigo)}" ${r.key === selectedReqKey ? 'selected' : ''}>
        ${esc(r.codigo)}
      </option>`).join('');

    const { el, modal } = showBootstrapModal(`
      <div class="modal fade" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${fuente ? 'Editar' : 'Agregar'} segunda fuente</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row g-2 mb-2">
                <div class="col-md-6"><label class="form-label small">Tipo</label>
                  <select class="form-select form-select-sm" id="sfTipo">${tipoOpts}</select></div>
                <div class="col-md-6"><label class="form-label small">Denominación</label>
                  <input class="form-control form-control-sm" id="sfDenom" value="${esc(fuente?.denominacion || '')}"></div>
                <div class="col-md-6"><label class="form-label small">Requerimiento asociado</label>
                  <select class="form-select form-select-sm" id="sfReq">
                    <option value="">— Seleccione requerimiento —</option>
                    ${reqSelectHtml}
                  </select>
                </div>
                <div class="col-md-6"><label class="form-label small">Ítems asociados</label>
                  <div class="border rounded p-2 small" id="sfItemsHost" style="max-height:140px;overflow:auto"></div>
                </div>
                <div class="col-md-6"><label class="form-label small">Entidad / proveedor</label>
                  <input class="form-control form-control-sm" id="sfEntidad" value="${esc(fuente?.entidad || '')}"></div>
                <div class="col-md-3"><label class="form-label small">RUC</label>
                  <input class="form-control form-control-sm" id="sfRuc" value="${esc(fuente?.ruc || '')}"></div>
                <div class="col-md-3"><label class="form-label small">Año</label>
                  <input class="form-control form-control-sm" id="sfAnio" value="${esc(fuente?.anio || '')}"></div>
                <div class="col-md-6"><label class="form-label small">Referencia (N.° orden/contrato)</label>
                  <input class="form-control form-control-sm" id="sfRef" value="${esc(fuente?.referencia || '')}"
                    placeholder="Ej. OC-262-2024"></div>
                <div class="col-md-6"><label class="form-label small">URL</label>
                  <input class="form-control form-control-sm" id="sfUrl" value="${esc(fuente?.url || '')}"></div>
                <div class="col-md-4"><label class="form-label small">Fecha consulta</label>
                  <input type="date" class="form-control form-control-sm" id="sfFecha" value="${esc(String(fuente?.fecha_consulta || '').slice(0, 10))}"></div>
                <div class="col-md-4"><label class="form-label small">Moneda</label>
                  <input class="form-control form-control-sm" id="sfMoneda" value="${esc(fuente?.moneda || 'PEN')}"></div>
                <div class="col-md-4"><label class="form-label small">Factor ajuste global</label>
                  <input type="number" step="0.01" class="form-control form-control-sm" id="sfFactor" value="${esc(fuente?.factor_ajuste ?? 1)}"></div>
                <div class="col-12"><label class="form-label small">Observación</label>
                  <textarea class="form-control form-control-sm" id="sfObs" rows="2">${esc(fuente?.observacion || '')}</textarea></div>
              </div>
              <h6 class="small fw-bold">Precios por ítem asociado</h6>
              <table class="table table-sm table-bordered"><thead class="table-light"><tr>
                <th>Ítem</th><th>P. unit. original</th><th>Factor</th><th>P. actualizado</th>
              </tr></thead><tbody id="sfPreciosBody"></tbody></table>
              <div id="sfErr" class="alert alert-danger d-none py-2 small"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-primary" id="sfOk">Guardar fuente</button>
            </div>
          </div>
        </div>
      </div>`);

    const itemsDelReq = () => {
      const opt = el.querySelector('#sfReq')?.selectedOptions?.[0];
      if (!opt?.value) return [];
      const reqId = opt.dataset.reqId;
      const codigo = opt.dataset.reqCodigo;
      return items.filter((it) => {
        if (reqId) return String(it.requerimiento_id) === String(reqId);
        return String(it.requerimiento_codigo || '') === String(codigo);
      });
    };

    let itemsHostPrimed = false;
    const renderItemsCheckboxes = () => {
      const host = el.querySelector('#sfItemsHost');
      const list = itemsDelReq();
      let prevKeys;
      if (!itemsHostPrimed && Array.isArray(fuente?.item_keys) && fuente.item_keys.length) {
        prevKeys = new Set(fuente.item_keys.map(String));
      } else {
        prevKeys = new Set(list.map((it) => String(it.item_key)));
      }
      itemsHostPrimed = true;
      if (!list.length) {
        host.innerHTML = '<span class="text-muted">Seleccione un requerimiento.</span>';
        return;
      }
      host.innerHTML = list.map((it) => `
        <label class="d-block mb-1">
          <input type="checkbox" class="form-check-input me-1 cc-sf-item" value="${esc(it.item_key)}"
            ${prevKeys.has(String(it.item_key)) ? 'checked' : ''}>
          ${esc(it.descripcion || it.item_key)}
          <span class="text-muted">(${esc(it.item_key)})</span>
        </label>`).join('');
      host.querySelectorAll('.cc-sf-item').forEach((cb) => {
        cb.addEventListener('change', renderPreciosRows);
      });
    };

    const selectedItemKeys = () => [...el.querySelectorAll('.cc-sf-item:checked')].map((c) => c.value);

    const renderPreciosRows = () => {
      const body = el.querySelector('#sfPreciosBody');
      const keys = new Set(selectedItemKeys());
      const rows = items.filter((it) => keys.has(String(it.item_key)));
      if (!rows.length) {
        body.innerHTML = '<tr><td colspan="4" class="text-muted">Seleccione al menos un ítem asociado.</td></tr>';
        return;
      }
      body.innerHTML = rows.map((it) => {
        const pr = (fuente?.precios_por_item || {})[it.item_key] || {};
        return `
          <tr>
            <td class="small">${esc(it.descripcion || it.item_key)}</td>
            <td><input type="number" step="0.01" class="form-control form-control-sm cc-sf-pu" data-item-key="${esc(it.item_key)}"
              value="${pr.precio_unitario != null ? esc(pr.precio_unitario) : ''}"></td>
            <td><input type="number" step="0.01" class="form-control form-control-sm cc-sf-factor" data-item-key="${esc(it.item_key)}"
              value="${pr.factor_ajuste != null ? esc(pr.factor_ajuste) : (fuente?.factor_ajuste ?? 1)}"></td>
            <td class="small text-end cc-sf-act" data-item-key="${esc(it.item_key)}">—</td>
          </tr>`;
      }).join('');
      el.querySelectorAll('.cc-sf-pu, .cc-sf-factor').forEach((n) => {
        n.addEventListener('input', recalc);
      });
      recalc();
    };

    const recalc = () => {
      el.querySelectorAll('.cc-sf-pu').forEach((inp) => {
        const key = inp.dataset.itemKey;
        const factorEl = el.querySelector(`.cc-sf-factor[data-item-key="${key}"]`);
        const out = el.querySelector(`.cc-sf-act[data-item-key="${key}"]`);
        const act = calcPrecioActualizado(inp.value, factorEl?.value);
        if (out) out.textContent = act != null ? act.toFixed(2) : '—';
      });
    };

    el.querySelector('#sfFactor')?.addEventListener('input', () => {
      const g = el.querySelector('#sfFactor')?.value;
      el.querySelectorAll('.cc-sf-factor').forEach((f) => { f.value = g; });
      recalc();
    });
    el.querySelector('#sfReq')?.addEventListener('change', () => {
      renderItemsCheckboxes();
      renderPreciosRows();
    });

    renderItemsCheckboxes();
    renderPreciosRows();

    el.querySelector('#sfOk').onclick = () => {
      const denom = el.querySelector('#sfDenom')?.value?.trim();
      const err = el.querySelector('#sfErr');
      const reqOpt = el.querySelector('#sfReq')?.selectedOptions?.[0];
      const item_keys = selectedItemKeys();
      if (!denom) {
        err.textContent = 'La denominación es obligatoria.';
        err.classList.remove('d-none');
        return;
      }
      if (!reqOpt?.value) {
        err.textContent = 'Seleccione el requerimiento asociado.';
        err.classList.remove('d-none');
        return;
      }
      if (!item_keys.length) {
        err.textContent = 'Seleccione al menos un ítem asociado.';
        err.classList.remove('d-none');
        return;
      }
      const precios_por_item = {};
      el.querySelectorAll('.cc-sf-pu').forEach((inp) => {
        const key = inp.dataset.itemKey;
        const factor = Number(el.querySelector(`.cc-sf-factor[data-item-key="${key}"]`)?.value || 1);
        precios_por_item[key] = {
          precio_unitario: inp.value === '' ? null : Number(inp.value),
          factor_ajuste: factor,
        };
      });
      const raw = {
        ...(fuente || {}),
        tipo_fuente: el.querySelector('#sfTipo')?.value,
        denominacion: denom,
        entidad: el.querySelector('#sfEntidad')?.value || '',
        ruc: el.querySelector('#sfRuc')?.value || '',
        anio: el.querySelector('#sfAnio')?.value || '',
        referencia: el.querySelector('#sfRef')?.value || '',
        url: el.querySelector('#sfUrl')?.value || '',
        fecha_consulta: el.querySelector('#sfFecha')?.value || null,
        moneda: el.querySelector('#sfMoneda')?.value || 'PEN',
        factor_ajuste: Number(el.querySelector('#sfFactor')?.value || 1),
        observacion: el.querySelector('#sfObs')?.value || '',
        requerimiento_id: reqOpt.dataset.reqId || null,
        requerimiento_codigo: reqOpt.dataset.reqCodigo || '',
        item_keys,
        precios_por_item,
      };
      modal?.hide();
      resolve(normalizeSegundaFuente(raw, 0, items));
    };
    el.addEventListener('hidden.bs.modal', () => resolve(null), { once: true });
  });
}

function showDerivarCcpPanel({ onConfirm }) {
  return new Promise((resolve) => {
    const id = `ccDestCcp_${Date.now()}`;
    document.querySelectorAll('.cc-dest-overlay').forEach((n) => n.remove());
    const overlay = document.createElement('div');
    overlay.className = 'cc-dest-overlay';
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
          <strong><i class="bi bi-send"></i> Derivar a CCP</strong>
          <button type="button" class="btn-close" data-cc-dest="cancel" aria-label="Cerrar"></button>
        </div>
        <div class="card-body" id="${id}_body">
          <div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span> Cargando destino…</div>
        </div>
        <div class="card-footer d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-secondary" data-cc-dest="cancel">Cancelar</button>
          <button type="button" class="btn btn-success" data-cc-dest="ok" disabled>Confirmar derivación</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const body = overlay.querySelector(`#${id}_body`);
    const btnOk = overlay.querySelector('[data-cc-dest="ok"]');
    let closed = false;
    const close = (result) => {
      if (closed) return;
      closed = true;
      overlay.remove();
      resolve(result);
    };
    overlay.querySelectorAll('[data-cc-dest="cancel"]').forEach((b) => {
      b.onclick = (ev) => { ev.preventDefault(); close(null); };
    });

    (async () => {
      try {
        const dest = { code: 'CCP', label: 'CCP' };
        const usersResp = await contratacionesService.listValidacionUsuarios(dest.code, '');
        const usuarios = usersResp.data || [];
        body.innerHTML = `
          <div class="mb-2">
            <label class="form-label fw-semibold">Destino</label>
            <select class="form-select form-select-sm" disabled>
              <option value="CCP" selected>CCP</option>
            </select>
            <div class="form-text small">Transición oficial Workflow: Cuadro Comparativo → CCP</div>
          </div>
          <div class="mb-2">
            <label class="form-label fw-semibold">Usuario responsable</label>
            <select class="form-select form-select-sm" id="${id}_resp">
              <option value="">Seleccione…</option>
              ${usuarios.map((u) => `<option value="${u.id}" data-nombre="${esc(u.nombre)}">${esc(u.nombre)}${u.cargo ? ` — ${esc(u.cargo)}` : ''}</option>`).join('')}
            </select>
            ${!usuarios.length ? '<div class="text-danger small mt-1">No existen usuarios habilitados para CCP.</div>' : ''}
          </div>
          <div class="mb-0">
            <label class="form-label fw-semibold">Observación</label>
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
              destino_submodulo: 'CCP',
              destino: 'CCP',
              responsable_destino_id: parseInt(sel.value, 10),
              responsable_id: parseInt(sel.value, 10),
              responsable_destino_nombre: opt.dataset.nombre || opt.textContent,
              responsable_nombre: opt.dataset.nombre || opt.textContent,
              observacion_derivacion: overlay.querySelector(`#${id}_obs`)?.value || '',
            };
            await onConfirm(destPayload);
            close(destPayload);
          } catch (err) {
            if (busy) busy.classList.add('d-none');
            if (errBox) {
              errBox.textContent = err.message || 'Error al derivar';
              errBox.classList.remove('d-none');
            }
            btnOk.disabled = false;
          }
        };
      } catch (err) {
        body.innerHTML = `<div class="alert alert-danger mb-0">${esc(err.message)}</div>`;
      }
    })();
  });
}

/**
 * Abre elaboración / consulta del cuadro.
 */
export async function showElaborarCuadroModal(solicitudId, onSaved) {
  let state;
  try {
    const resp = await contratacionesService.crearCuadroBorrador(solicitudId);
    state = resp.data || resp;
  } catch (err) {
    alert(err.message || 'No se pudo abrir el cuadro');
    return;
  }

  let matriz = state.matriz;
  let cuadro = state.cuadro;
  let versiones = [];
  try {
    const vResp = await contratacionesService.listCuadroVersiones(solicitudId);
    versiones = (vResp.data || vResp || []);
    if (!Array.isArray(versiones)) versiones = [];
  } catch (_) { versiones = []; }
  const validacion = state.validacion || matriz?.meta || {};
  const sol = matriz?.solicitud || {};
  let readonly = isReadonlyEstado(cuadro)
    || ['GENERADO', 'GENERADO_PRELIMINAR'].includes(String(cuadro?.estado || '').toUpperCase());

  const titleVerb = isDerivado(cuadro) || String(cuadro?.estado || '').toUpperCase() === 'FIRMADO'
    ? 'Ver cuadro'
    : 'Elaborar cuadro';
  const anexoLbl = anexoUiLabels(matriz, cuadro);

  const { el, modal } = showBootstrapModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-fullscreen-lg-down modal-xl modal-dialog-scrollable" style="max-width:96vw">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <div>
              <h5 class="modal-title mb-0"><i class="bi bi-table"></i> ${esc(titleVerb)} — ${esc(sol.codigo || solicitudId)}</h5>
              <div class="small text-muted">${esc(sol.denominacion || '')}</div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="ccElaborarBody">
            <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
              <span class="badge bg-${esc(badgeClassCuadro(cuadro?.estado_cuadro || cuadro?.estado))}" id="ccEstadoBadge">
                ${esc(cuadro?.estado_cuadro_label || labelCuadroEstado(cuadro?.estado))}
              </span>
              ${cuadro?.version != null ? `<span class="small text-muted" id="ccVersionLabel">Versión ${esc(cuadro.version)}</span>` : '<span class="small text-muted d-none" id="ccVersionLabel"></span>'}
              ${(cuadro?.tiene_pdf_firmado || cuadro?.firmado_nombre)
    ? '<span class="badge bg-success">Firmado</span>' : ''}
              ${validacion.puede_generar === false && (matriz?.meta?.items_incompletos > 0)
    ? '<span class="badge bg-warning text-dark">Ofertas incompletas</span>'
    : (validacion.puede_generar === true
      ? '<span class="badge bg-success">Matriz lista para adjudicación</span>'
      : '')}
            </div>
            <div id="ccVersionHost">${renderPanelVersionado(cuadro, versiones)}</div>
            <h6 class="fw-bold">Proveedores</h6>
            ${renderResumenProveedores(matriz?.resumen_proveedores || [])}
            ${renderInconsistencias(matriz?.inconsistencias || [])}
            <div id="ccAdvHost">${renderAdvertenciasAdjudicacion(matriz)}</div>
            <div id="ccResumenAdjHost">${renderResumenAdjudicacion(matriz)}${renderHistorialAdjudicacion(matriz?.historial_adjudicacion)}</div>
            <div id="ccCoordHost">${isModoCoordinador8Uit(currentUser(), cuadro) ? renderPanelCoordinador(cuadro, matriz) : ''}</div>
            <div id="ccDecHost">${isModoDec(currentUser(), cuadro) ? renderPanelDec(cuadro) : ''}</div>
            <div id="ccCcpHost">${(!isModoCoordinador8Uit(currentUser(), cuadro) && !isModoDec(currentUser(), cuadro) && isModoGeneracionCcp(cuadro)) ? renderPanelGeneracionCcp(cuadro) : ''}</div>
            <div id="ccSegundaFuenteHost">${renderPanelSegundaFuente(matriz, { editable: !readonly })}</div>
            <h6 class="fw-bold">Matriz comparativa — ${esc(anexoLbl.titulo)}</h6>
            <div id="ccMatrizHost">${renderMatrizBienesHtml(matriz, { editable: !readonly })}</div>
            ${renderPanelSustento(matriz, readonly)}
            <div id="ccFirmaHost">${(isModoCoordinador8Uit(currentUser(), cuadro) || isModoDec(currentUser(), cuadro)) ? '' : renderPanelFirma(cuadro, matriz)}</div>
          </div>
          <div class="modal-footer flex-wrap gap-2">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
            <button type="button" class="btn btn-outline-primary" id="ccBtnRecargar">
              <i class="bi bi-arrow-clockwise"></i> Recargar
            </button>
            <button type="button" class="btn btn-outline-primary" id="ccBtnGuardar">
              <i class="bi bi-save"></i> Guardar
            </button>
            <button type="button" class="btn btn-success" id="ccBtnAdjudicar">
              <i class="bi bi-award"></i> Guardar adjudicación
            </button>
            <button type="button" class="btn btn-outline-dark" id="ccBtnPreview8a" title="Previsualizar ${esc(anexoLbl.titulo)}">
              <i class="bi bi-eye"></i> Previsualizar Anexo ${esc(anexoLbl.short)}
            </button>
            <button type="button" class="btn btn-dark" id="ccBtnGenerar8a" title="Genera y persiste PDF ${esc(anexoLbl.titulo)}">
              <i class="bi bi-file-earmark-pdf"></i> Generar Anexo ${esc(anexoLbl.short)}
            </button>
            <button type="button" class="btn btn-outline-dark" id="ccBtnDescargar8a">
              <i class="bi bi-download"></i> Descargar Cuadro Final
            </button>
            <button type="button" class="btn btn-outline-warning" id="ccBtnDerivarCoord">
              <i class="bi bi-person-check"></i> Derivar a Coordinador CM
            </button>
            <button type="button" class="btn btn-outline-success d-none" id="ccBtnAprobarCoord" tabindex="-1" aria-hidden="true"></button>
            <button type="button" class="btn btn-outline-danger d-none" id="ccBtnObservarCoord" tabindex="-1" aria-hidden="true"></button>
            <button type="button" class="btn btn-outline-success d-none" id="ccBtnAprobarDec" tabindex="-1" aria-hidden="true"></button>
            <button type="button" class="btn btn-outline-danger d-none" id="ccBtnObservarDec" tabindex="-1" aria-hidden="true"></button>
            <button type="button" class="btn btn-success d-none" id="ccBtnGenerarCcp" tabindex="-1" aria-hidden="true"></button>
            <button type="button" class="btn btn-primary d-none" id="ccBtnDerivarCcp" tabindex="-1" aria-hidden="true"></button>
          </div>
        </div>
      </div>
    </div>`);

  const body = el.querySelector('#ccElaborarBody');

  function syncUiLocks() {
    const user = currentUser();
    const modoCoord = isModoCoordinador8Uit(user, cuadro);
    const modoDec = isModoDec(user, cuadro);
    readonly = isReadonlyEstado(cuadro)
      || ['GENERADO', 'GENERADO_PRELIMINAR', 'PENDIENTE_COORDINADOR', 'PENDIENTE_DEC', 'FIRMADO_COORDINADOR']
        .includes(String(cuadro?.estado || '').toUpperCase())
      || modoCoord
      || modoDec;
    const derivado = isDerivado(cuadro);
    const e = String(cuadro?.estado || '').toUpperCase();
    const setDis = (sel, dis) => {
      const b = el.querySelector(sel);
      if (b) b.disabled = !!dis;
    };
    const setHide = (sel, hide) => {
      const b = el.querySelector(sel);
      if (b) b.classList.toggle('d-none', !!hide);
    };

    // RC8.5/8.6: Coordinador/DEC — solo lectura económica; acciones en su panel
    const hideAnalista = modoCoord || modoDec;
    // RC8.5-B1 — CCP solo tras APROBADO_DEC / listo CCP (por estado, no solo por rol)
    const hideCcpPorEstado = !puedeMostrarBotonesCcp(e);
    setHide('#ccBtnGuardar', hideAnalista);
    setHide('#ccBtnAdjudicar', hideAnalista);
    setHide('#ccBtnGenerar8a', hideAnalista);
    setHide('#ccBtnDerivarCoord', hideAnalista);
    setHide('#ccBtnAprobarCoord', true);
    setHide('#ccBtnObservarCoord', true);
    setHide('#ccBtnAprobarDec', true);
    setHide('#ccBtnObservarDec', true);
    setHide('#ccBtnGenerarCcp', hideAnalista || hideCcpPorEstado);
    setHide('#ccBtnDerivarCcp', hideAnalista || hideCcpPorEstado);

    setDis('#ccBtnGuardar', readonly || derivado);
    setDis('#ccBtnAdjudicar', readonly || derivado || e === 'GENERADO' || e === 'GENERADO_PRELIMINAR');
    setDis('#ccBtnGenerar8a', derivado || e === 'FIRMADO' || !cuadro?.id);
    const puedeDerivarCoord = !!cuadro?.id && !derivado && [
      'CUADRO_BORRADOR', 'EN_ELABORACION', 'GENERADO', 'GENERADO_PRELIMINAR', 'ADJUDICADO', 'FIRMADO',
      'OBSERVADO_COORDINADOR', 'OBSERVADO_DEC',
    ].includes(e) && !!(cuadro?.tiene_pdf || cuadro?.pdf_nombre);
    setDis('#ccBtnDerivarCoord', !puedeDerivarCoord);
    const gatesCcp = evaluarGatesCcpCliente(cuadro);
    const puedeGenerar = !derivado && e === 'APROBADO_DEC'
      && (cuadro?.puede_generar_ccp === true || gatesCcp.ok);
    const puedeDerivar = !derivado
      && ['APROBADO_DEC', 'PENDIENTE_CCP'].includes(e)
      && (cuadro?.puede_derivar_ccp === true || gatesCcp.ok);
    setDis('#ccBtnGenerarCcp', !puedeGenerar);
    setDis('#ccBtnDerivarCcp', !puedeDerivar);

    const coordHost = el.querySelector('#ccCoordHost');
    if (coordHost) {
      coordHost.innerHTML = modoCoord ? renderPanelCoordinador(cuadro, matriz) : '';
      if (modoCoord) bindCoordinadorActions();
    }

    const decHost = el.querySelector('#ccDecHost');
    if (decHost) {
      decHost.innerHTML = modoDec ? renderPanelDec(cuadro) : '';
      if (modoDec) bindDecActions();
    }

    const ccpHost = el.querySelector('#ccCcpHost');
    if (ccpHost) {
      const showCcp = !modoCoord && !modoDec && !hideCcpPorEstado
        && (isModoGeneracionCcp(cuadro) || e === 'DERIVADO_CCP');
      ccpHost.innerHTML = showCcp ? renderPanelGeneracionCcp(cuadro) : '';
      if (showCcp) bindCcpActions();
    }

    const firmaHost = el.querySelector('#ccFirmaHost');
    if (firmaHost) {
      firmaHost.innerHTML = (modoCoord || modoDec) ? '' : renderPanelFirma(cuadro, matriz);
      if (!modoCoord && !modoDec) bindFirmaActions();
    }
    bindSegundaFuente();
    refreshMatrizHost(el, matriz, !readonly && !derivado && !modoCoord && !modoDec);
    const sustentoHost = el.querySelector('#ccPanelAdjudicacion');
    if (sustentoHost && (readonly || modoCoord || modoDec)) {
      sustentoHost.querySelectorAll('select, textarea, input').forEach((n) => { n.disabled = true; });
    }

    const verHost = el.querySelector('#ccVersionHost');
    if (verHost) verHost.innerHTML = renderPanelVersionado(cuadro, versiones);
    const verLbl = el.querySelector('#ccVersionLabel');
    if (verLbl) {
      if (cuadro?.version != null) {
        verLbl.textContent = `Versión ${cuadro.version}`;
        verLbl.classList.remove('d-none');
      } else {
        verLbl.textContent = '';
        verLbl.classList.add('d-none');
      }
    }
  }

  async function refreshVersiones() {
    try {
      const vResp = await contratacionesService.listCuadroVersiones(solicitudId);
      versiones = (vResp.data || vResp || []);
      if (!Array.isArray(versiones)) versiones = [];
    } catch (_) { /* keep previous */ }
    const verHost = el.querySelector('#ccVersionHost');
    if (verHost) verHost.innerHTML = renderPanelVersionado(cuadro, versiones);
  }

  function bindCoordinadorActions() {
    el.querySelector('#ccBtnCoordDescargar')?.addEventListener('click', async () => {
      try {
        const persistido = await buildPersistidoParaPdf();
        persistido.borrador_no_oficial = false;
        downloadAnexo8APdf(persistido);
      } catch (err) {
        alert(err.message || 'No se pudo descargar el Anexo');
      }
    });

    el.querySelector('#ccBtnCoordAdjuntar')?.addEventListener('click', () => {
      triggerPdfUpload(async (meta) => {
        try {
          const resp = await contratacionesService.adjuntarCuadroPdfFirmado(cuadro.id, {
            pdf_firmado: {
              nombre: meta.nombre,
              mime_type: meta.mime_type || 'application/pdf',
              base64: meta.base64,
              tamaño_bytes: meta.tamaño_bytes,
            },
          });
          const data = resp.data || resp;
          cuadro = data.cuadro || {
            ...cuadro,
            tiene_pdf_firmado: true,
            firmado_nombre: meta.nombre,
          };
          syncUiLocks();
          alert('PDF firmado adjuntado. Puede registrar conformidad y derivar al DEC.');
          if (typeof onSaved === 'function') onSaved();
        } catch (err) {
          alert(err.message || 'No se pudo adjuntar el PDF firmado');
        }
      }, { onError: (msg) => alert(msg) });
    });

    el.querySelector('#ccBtnCoordVerFirmado')?.addEventListener('click', () => openFirmadoUrl(true));
    el.querySelector('#ccBtnCoordEliminarFirmado')?.addEventListener('click', async () => {
      if (!confirm('¿Eliminar el PDF firmado? Deberá adjuntarlo nuevamente antes de derivar al DEC.')) return;
      try {
        const resp = await contratacionesService.eliminarCuadroPdfFirmado(cuadro.id);
        const data = resp.data || resp;
        cuadro = data.cuadro || { ...cuadro, tiene_pdf_firmado: false, firmado_nombre: '', conformidad_coordinador: false };
        syncUiLocks();
        if (typeof onSaved === 'function') onSaved();
      } catch (err) {
        alert(err.message || 'No se pudo eliminar');
      }
    });

    el.querySelector('#ccBtnCoordConformidad')?.addEventListener('click', async () => {
      if (!cuadro?.tiene_pdf_firmado && !cuadro?.firmado_nombre) {
        return alert('Debe adjuntar el Cuadro Comparativo firmado antes de dar conformidad.');
      }
      if (!confirm('¿Registrar conformidad del Coordinador CM? Luego podrá Derivar a DEC.')) return;
      try {
        const resp = await contratacionesService.transitarRevisionCuadro(cuadro.id, {
          accion: 'CONFORMIDAD_COORDINADOR',
        });
        const data = resp.data || resp;
        cuadro = data.cuadro || {
          ...cuadro,
          conformidad_coordinador: true,
          estado: 'FIRMADO_COORDINADOR',
          estado_cuadro: 'FIRMADO_COORDINADOR',
        };
        const badge = el.querySelector('#ccEstadoBadge');
        if (badge && cuadro) {
          badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
          badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
        }
        syncUiLocks();
        alert('Conformidad registrada. Ahora puede Derivar a DEC.');
        if (typeof onSaved === 'function') onSaved();
      } catch (err) {
        alert(err.message || 'No se pudo registrar la conformidad');
      }
    });

    el.querySelector('#ccBtnCoordObservar')?.addEventListener('click', async () => {
      let reqId = matriz?.requerimientos?.[0]?.id
        || matriz?.meta?.requerimiento_id
        || matriz?.items?.[0]?.requerimiento_id
        || null;
      if (!reqId) {
        try {
          const expResp = await contratacionesService.getCuadroComparativoExpediente(solicitudId);
          reqId = (expResp.data || expResp)?.requerimientos?.[0]?.id || null;
        } catch (_) { /* keep */ }
      }
      await observarCuadroConModalInstitucional({
        requerimientoId: reqId,
        cuadroId: cuadro.id,
        rolRevision: ROLES_REVISION.COORDINADOR_CM,
        onDone: async () => {
          try {
            const det = await contratacionesService.getCuadroComparativoDetalle(solicitudId);
            const data = det.data || det;
            cuadro = data.cuadro || cuadro;
            matriz = data.matriz || matriz;
          } catch (_) { /* keep */ }
          const badge = el.querySelector('#ccEstadoBadge');
          if (badge && cuadro) {
            badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
            badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
          }
          await refreshVersiones();
          if (typeof onSaved === 'function') onSaved();
          syncUiLocks();
        },
      });
    });

    el.querySelector('#ccBtnCoordDerivarDec')?.addEventListener('click', async () => {
      if (!cuadro?.conformidad_coordinador && !cuadro?.revision_coordinador?.conformidad) {
        return alert('Debe registrar la conformidad antes de derivar al DEC.');
      }
      if (!cuadro?.tiene_pdf_firmado && !cuadro?.firmado_nombre) {
        return alert('Debe adjuntar el PDF firmado antes de derivar al DEC.');
      }
      if (!confirm('¿Derivar el cuadro al DEC?')) return;
      try {
        const resp = await contratacionesService.transitarRevisionCuadro(cuadro.id, {
          accion: 'DERIVAR_DEC',
        });
        const data = resp.data || resp;
        cuadro = data.cuadro || cuadro;
        const badge = el.querySelector('#ccEstadoBadge');
        if (badge && cuadro) {
          badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
          badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
        }
        alert('Cuadro derivado al DEC.');
        if (typeof onSaved === 'function') onSaved();
        syncUiLocks();
      } catch (err) {
        alert(err.message || 'No se pudo derivar al DEC');
      }
    });
  }

  function bindDecActions() {
    el.querySelector('#ccBtnDecDescargarFirmado')?.addEventListener('click', () => openFirmadoUrl(false));

    el.querySelector('#ccBtnDecAdjuntar')?.addEventListener('click', () => {
      triggerPdfUpload(async (meta) => {
        try {
          const resp = await contratacionesService.adjuntarCuadroPdfFirmadoDec(cuadro.id, {
            pdf_firmado: {
              nombre: meta.nombre,
              mime_type: meta.mime_type || 'application/pdf',
              base64: meta.base64,
              tamaño_bytes: meta.tamaño_bytes,
            },
          });
          const data = resp.data || resp;
          cuadro = data.cuadro || {
            ...cuadro,
            tiene_pdf_firmado_dec: true,
            firmado_dec_nombre: meta.nombre,
          };
          syncUiLocks();
          alert('Firma DEC adjuntada. Registre conformidad para derivar al Analista.');
          if (typeof onSaved === 'function') onSaved();
        } catch (err) {
          alert(err.message || 'No se pudo adjuntar la firma DEC');
        }
      }, { onError: (msg) => alert(msg) });
    });

    el.querySelector('#ccBtnDecVerFirmado')?.addEventListener('click', () => openFirmadoDecUrl(true));
    el.querySelector('#ccBtnDecEliminarFirmado')?.addEventListener('click', async () => {
      if (!confirm('¿Eliminar la firma DEC? Deberá adjuntarla nuevamente antes de derivar al Analista.')) return;
      try {
        const resp = await contratacionesService.eliminarCuadroPdfFirmadoDec(cuadro.id);
        const data = resp.data || resp;
        cuadro = data.cuadro || {
          ...cuadro,
          tiene_pdf_firmado_dec: false,
          firmado_dec_nombre: '',
          conformidad_dec: false,
        };
        syncUiLocks();
        if (typeof onSaved === 'function') onSaved();
      } catch (err) {
        alert(err.message || 'No se pudo eliminar la firma DEC');
      }
    });

    el.querySelector('#ccBtnDecConformidad')?.addEventListener('click', async () => {
      if (!cuadro?.tiene_pdf_firmado && !cuadro?.firmado_nombre) {
        return alert('Debe existir el PDF firmado por el Coordinador.');
      }
      if (!cuadro?.tiene_pdf_firmado_dec && !cuadro?.firmado_dec_nombre) {
        return alert('Debe adjuntar el PDF firmado por el DEC.');
      }
      try {
        const resp = await contratacionesService.transitarRevisionCuadro(cuadro.id, {
          accion: 'CONFORMIDAD_DEC',
        });
        const data = resp.data || resp;
        cuadro = data.cuadro || { ...cuadro, conformidad_dec: true };
        syncUiLocks();
        alert('Conformidad del DEC registrada.');
        if (typeof onSaved === 'function') onSaved();
      } catch (err) {
        alert(err.message || 'No se pudo registrar la conformidad');
      }
    });

    el.querySelector('#ccBtnDecObservar')?.addEventListener('click', async () => {
      const devolver = await showDevolverDecModal();
      if (!devolver?.motivo) return;
      const accion = devolver.destino === 'COORDINADOR_CM'
        ? 'OBSERVAR_DEC_A_COORD'
        : 'OBSERVAR_DEC';
      try {
        const resp = await contratacionesService.transitarRevisionCuadro(cuadro.id, {
          accion,
          motivo: devolver.motivo,
          observacion: devolver.motivo,
          destino_persona: devolver.destino === 'COORDINADOR_CM' ? 'Coordinador CM' : 'Analista',
        });
        const data = resp.data || resp;
        cuadro = data.cuadro || cuadro;
        const badge = el.querySelector('#ccEstadoBadge');
        if (badge && cuadro) {
          badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
          badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
        }
        alert(devolver.destino === 'COORDINADOR_CM'
          ? 'Cuadro observado y devuelto al Coordinador CM.'
          : 'Cuadro observado y devuelto al Analista.');
        await refreshVersiones();
        if (typeof onSaved === 'function') onSaved();
        syncUiLocks();
      } catch (err) {
        alert(err.message || 'No se pudo observar el cuadro');
      }
    });

    el.querySelector('#ccBtnDecAprobarCcp')?.addEventListener('click', async () => {
      if (!cuadro?.tiene_pdf_firmado && !cuadro?.firmado_nombre) {
        return alert('Debe existir el PDF firmado por el Coordinador.');
      }
      if (!cuadro?.tiene_pdf_firmado_dec && !cuadro?.firmado_dec_nombre) {
        return alert('Debe adjuntar el PDF firmado por el DEC.');
      }
      if (!confirm('¿Aprobar el cuadro y derivarlo a CCP?')) return;
      const btn = el.querySelector('#ccBtnDecAprobarCcp');
      if (btn) btn.disabled = true;
      try {
        const resp = await contratacionesService.transitarRevisionCuadro(cuadro.id, {
          accion: 'APROBAR_DERIVAR_CCP',
        });
        const data = resp.data || resp;
        cuadro = data.cuadro || cuadro;
        const badge = el.querySelector('#ccEstadoBadge');
        if (badge && cuadro) {
          badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
          badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
        }
        alert('Cuadro aprobado y derivado a CCP.');
        if (typeof onSaved === 'function') onSaved();
        syncUiLocks();
      } catch (err) {
        alert(err.message || 'No se pudo aprobar y derivar a CCP');
        if (btn) btn.disabled = false;
      }
    });
  }

  async function openFirmadoDecUrl(inline) {
    if (!cuadro?.id) return;
    try {
      const blob = await contratacionesService.fetchCuadroPdfFirmadoDec(cuadro.id, !!inline);
      const url = URL.createObjectURL(blob);
      if (inline) window.open(url, '_blank');
      else {
        const a = document.createElement('a');
        a.href = url;
        a.download = cuadro.firmado_dec_nombre || 'Anexo_08A_firmado_DEC.pdf';
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      alert(err.message || 'No se pudo abrir el PDF firmado DEC');
    }
  }

  async function runRevision(accion, pedirObs = false) {
    if (!cuadro?.id) return;
    let observacion = '';
    if (pedirObs) {
      observacion = window.prompt('Indique la observación (obligatoria):', '') || '';
      if (!String(observacion).trim()) {
        alert('La observación es obligatoria');
        return;
      }
    }
    try {
      const resp = await contratacionesService.transitarRevisionCuadro(cuadro.id, { accion, observacion });
      const data = resp.data || resp;
      cuadro = data.cuadro || cuadro;
      const badge = el.querySelector('#ccEstadoBadge');
      if (badge && cuadro) {
        badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
        badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
      }
      alert(`Revisión: ${accion} → ${cuadro.estado_cuadro_label || cuadro.estado}`);
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      alert(err.message || 'No se pudo completar la revisión');
    } finally {
      syncUiLocks();
    }
  }

  function bindSegundaFuente() {
    const editable = !readonly && !isDerivado(cuadro);
    el.querySelector('#ccBtnAddSegundaFuente')?.addEventListener('click', async () => {
      if (!editable) return;
      const created = await showSegundaFuenteFormModal({ items: matriz.items || [] });
      if (!created) return;
      matriz.segunda_fuente = [...(matriz.segunda_fuente || []), created];
      refreshMatrizHost(el, matriz, editable);
      bindSegundaFuente();
    });
    el.querySelectorAll('.cc-sf-edit').forEach((btn) => {
      btn.onclick = async () => {
        if (!editable) return;
        const id = btn.dataset.id;
        const cur = (matriz.segunda_fuente || []).find((f) => String(f.id_fuente || f.id) === String(id));
        const updated = await showSegundaFuenteFormModal({ items: matriz.items || [], fuente: cur });
        if (!updated) return;
        matriz.segunda_fuente = (matriz.segunda_fuente || []).map((f) => (
          String(f.id_fuente || f.id) === String(id) ? updated : f
        ));
        refreshMatrizHost(el, matriz, editable);
        bindSegundaFuente();
      };
    });
    el.querySelectorAll('.cc-sf-del').forEach((btn) => {
      btn.onclick = async () => {
        if (!editable) return;
        const ok = await showConfirmSgc({
          title: 'Eliminar segunda fuente',
          message: '¿Eliminar esta referencia de segunda fuente?',
          confirmLabel: 'Eliminar',
        });
        if (!ok) return;
        const id = btn.dataset.id;
        matriz.segunda_fuente = (matriz.segunda_fuente || []).filter((f) => String(f.id_fuente || f.id) !== String(id));
        refreshMatrizHost(el, matriz, editable);
        bindSegundaFuente();
      };
    });
  }

  async function openFirmadoUrl(inline) {
    if (!cuadro?.id) return;
    try {
      const { blob } = await contratacionesService.fetchCuadroPdfFirmado(cuadro.id, inline);
      const pdfBlob = blob.type === 'application/pdf'
        ? blob
        : new Blob([blob], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      if (inline) {
        window.open(url, '_blank', 'noopener');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = cuadro.firmado_nombre || 'Anexo_08A_firmado.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (err) {
      alert(err.message || 'No se pudo abrir el PDF firmado');
    }
  }

  function bindFirmaActions() {
    el.querySelector('#ccBtnAdjuntarFirmado')?.addEventListener('click', () => {
      triggerPdfUpload(async (meta) => {
        try {
          const resp = await contratacionesService.adjuntarCuadroPdfFirmado(cuadro.id, {
            pdf_firmado: {
              nombre: meta.nombre,
              mime_type: meta.mime_type || 'application/pdf',
              base64: meta.base64,
              tamaño_bytes: meta.tamaño_bytes,
            },
          });
          const data = resp.data || resp;
          cuadro = data.cuadro || { ...cuadro, estado: 'FIRMADO', tiene_pdf_firmado: true, firmado_nombre: meta.nombre };
          const badge = el.querySelector('#ccEstadoBadge');
          if (badge && cuadro) {
            badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
            badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
          }
          syncUiLocks();
          alert(`${anexoUiLabels(matriz, cuadro).firmado} adjuntado. Estado: FIRMADO.`);
          if (typeof onSaved === 'function') onSaved();
        } catch (err) {
          alert(err.message || 'No se pudo adjuntar el PDF firmado');
        }
      }, {
        onError: (msg) => alert(msg),
      });
    });

    el.querySelector('#ccBtnVerFirmado')?.addEventListener('click', () => openFirmadoUrl(true));
    el.querySelector('#ccBtnDlFirmado')?.addEventListener('click', () => openFirmadoUrl(false));

    el.querySelector('#ccBtnEliminarFirmado')?.addEventListener('click', async () => {
      if (!confirm('¿Eliminar el PDF firmado? El cuadro volverá a GENERADO.')) return;
      try {
        const resp = await contratacionesService.eliminarCuadroPdfFirmado(cuadro.id);
        const data = resp.data || resp;
        cuadro = data.cuadro || { ...cuadro, estado: 'GENERADO', tiene_pdf_firmado: false, firmado_nombre: '' };
        const badge = el.querySelector('#ccEstadoBadge');
        if (badge && cuadro) {
          badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
          badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
        }
        syncUiLocks();
        if (typeof onSaved === 'function') onSaved();
      } catch (err) {
        alert(err.message || 'No se pudo eliminar');
      }
    });
  }

  async function reloadFresh() {
    try {
      const resp = await contratacionesService.getCuadroComparativoDetalle(solicitudId);
      const data = resp.data || resp;
      matriz = data.matriz;
      cuadro = data.cuadro || cuadro;
      readonly = isReadonlyEstado(cuadro)
        || ['GENERADO', 'GENERADO_PRELIMINAR'].includes(String(cuadro?.estado || '').toUpperCase());
      refreshMatrizHost(el, matriz, !readonly);
      const panel = el.querySelector('#ccPanelAdjudicacion');
      if (panel) panel.outerHTML = renderPanelSustento(matriz, readonly);
      const badge = el.querySelector('#ccEstadoBadge');
      if (badge && cuadro) {
        badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
        badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
      }
      syncUiLocks();
    } catch (err) {
      alert(err.message || 'No se pudo recargar');
    }
  }

  el.querySelector('#ccBtnRecargar').onclick = () => reloadFresh();

  el.querySelector('#ccBtnGuardar').onclick = async () => {
    if (!cuadro?.id) {
      alert('No hay borrador persistido');
      return;
    }
    if (isReadonlyEstado(cuadro)) return alert('Cuadro en solo lectura');
    const datos = collectObservacionesFromDom(body, matriz);
    const respuestaObs = collectRespuestaObservaciones(el);
    if (respuestaObs) datos.respuesta_observaciones = respuestaObs;
    const btn = el.querySelector('#ccBtnGuardar');
    btn.disabled = true;
    try {
      const resp = await contratacionesService.guardarCuadroBorrador(cuadro.id, {
        datos_json: datos,
        actualizado_at: cuadro.actualizado_at,
        notas_internas: datos.notas_internas,
        respuesta_observaciones: respuestaObs,
      });
      const data = resp.data || resp;
      cuadro = data.cuadro || cuadro;
      matriz = data.matriz || datos;
      refreshMatrizHost(el, matriz, !isReadonlyEstado(cuadro));
      alert('Borrador guardado.');
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      alert(err.message || 'No se pudo guardar');
    } finally {
      btn.disabled = false;
      syncUiLocks();
    }
  };

  el.querySelector('#ccBtnAdjudicar').onclick = async () => {
    if (!cuadro?.id) {
      alert('No hay borrador persistido');
      return;
    }
    if (isReadonlyEstado(cuadro)) return alert('Cuadro en solo lectura');
    const datos = collectObservacionesFromDom(body, matriz);
    const selecciones = collectSeleccionesFromDom(body, matriz);
    const criterio = el.querySelector('#ccCriterio')?.value || '';
    const sustento = el.querySelector('#ccSustento')?.value || '';
    if (criterio === 'OTRO' && !String(sustento).trim()) {
      alert('Criterio «Otro» requiere explicación en el sustento.');
      return;
    }
    const distinto = (matriz.items || []).some((it) => {
      const sel = selecciones.find((s) => s.item_key === it.item_key);
      return it.recomendado_proveedor_id != null
        && sel?.proveedor_adjudicado_id != null
        && Number(sel.proveedor_adjudicado_id) !== Number(it.recomendado_proveedor_id);
    });
    if (distinto && !String(sustento).trim()) {
      alert('Selección distinta al recomendado: sustento obligatorio.');
      return;
    }
    if (!confirm('¿Confirmar adjudicación por ítem? No se derivará a CCP ni se generará PDF aún.')) return;

    const btn = el.querySelector('#ccBtnAdjudicar');
    btn.disabled = true;
    try {
      const resp = await contratacionesService.guardarCuadroAdjudicacion(cuadro.id, {
        datos_json: datos,
        selecciones,
        criterio_seleccion: criterio,
        sustento_decision: sustento,
        observacion_analista: '',
        observacion_area_usuaria: '',
        actualizado_at: cuadro.actualizado_at,
      });
      const data = resp.data || resp;
      cuadro = data.cuadro || cuadro;
      matriz = data.matriz || matriz;
      refreshMatrizHost(el, matriz, !isReadonlyEstado(cuadro));
      const badge = el.querySelector('#ccEstadoBadge');
      if (badge && cuadro) {
        badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
        badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
      }
      alert('Adjudicación guardada (estado ADJUDICADO). No se derivó a CCP.');
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      alert(err.message || 'No se pudo adjudicar');
    } finally {
      btn.disabled = false;
      syncUiLocks();
    }
  };

  async function loadInstitucional() {
    let entidad = {};
    let logo_data_url = '';
    try { entidad = await api.get('/entidad') || {}; } catch (_) { /* opcional */ }
    try {
      const resp = await api.list('logotipos', { page: 1, pageSize: 100, search: '' });
      const logos = resp?.data || [];
      const pick = logos.find((l) => /principal/i.test(l.tipo || '') && l.data_url)
        || logos.find((l) => (l.estado || 'Activo') !== 'Inactivo' && l.data_url)
        || logos.find((l) => l.data_url);
      if (pick) logo_data_url = pick.data_url || '';
    } catch (_) { /* opcional */ }
    return { entidad, logo_data_url };
  }

  async function buildPersistidoParaPdf() {
    if (!cuadro?.id) throw new Error('No hay cuadro persistido');
    const resp = await contratacionesService.getCuadroPdfData(cuadro.id);
    const data = resp.data || resp;
    const servidor = data.datos_json || data.matriz || {};
    // AA frescas del servidor (invitaciones/recepción); overlay de lo editado en pantalla
    const live = matriz || {};
    const primera = (Array.isArray(servidor.primera_fuente) ? servidor.primera_fuente : [])
      .map((f) => {
        const liveF = (live.primera_fuente || []).find((x) => Number(x.proveedor_id) === Number(f.proveedor_id)
          || String(x.id || x.id_fuente) === String(f.id || f.id_fuente));
        if (liveF?.acciones_administrativas?.dedicado_objeto == null) return f;
        return {
          ...f,
          acciones_administrativas: {
            ...(f.acciones_administrativas || {}),
            dedicado_objeto: liveF.acciones_administrativas.dedicado_objeto,
          },
        };
      });
    const datos_json = {
      ...servidor,
      items: live.items || servidor.items,
      adjudicacion: live.adjudicacion || servidor.adjudicacion,
      segunda_fuente: live.segunda_fuente || servidor.segunda_fuente,
      primera_fuente: primera.length ? primera : (live.primera_fuente || servidor.primera_fuente),
      historial_adjudicacion: live.historial_adjudicacion || servidor.historial_adjudicacion,
    };
    const inst = await loadInstitucional();
    let elaborado = '';
    try {
      const u = JSON.parse(localStorage.getItem('currentUser') || 'null');
      elaborado = [u?.apellidos, u?.nombres].filter(Boolean).join(' ').trim()
        || u?.nombre || u?.username || '';
    } catch (_) { /* noop */ }
    return {
      ...data,
      datos_json,
      matriz: datos_json,
      adjudicacion: datos_json.adjudicacion || null,
      entidad: inst.entidad,
      logo_data_url: inst.logo_data_url,
      elaborado_por: elaborado,
    };
  }

  el.querySelector('#ccBtnPreview8a').onclick = async () => {
    try {
      const persistido = await buildPersistidoParaPdf();
      persistido.borrador_no_oficial = false;
      persistido.meta = { ...(persistido.meta || {}), pdf_modo: 'OFICIAL', puede_pdf_oficial: true };
      if (persistido.datos_json?.meta) {
        persistido.datos_json.meta = {
          ...persistido.datos_json.meta,
          pdf_modo: 'OFICIAL',
          puede_pdf_oficial: true,
        };
      }
      const val = validateCuadroParaAnexo8A(persistido);
      if (!val.ok) {
        alert(`No se puede previsualizar:\n- ${val.faltantes.join('\n- ')}`);
        return;
      }
      previewAnexo8APdf(persistido);
    } catch (err) {
      alert(err.message || 'No se pudo previsualizar');
    }
  };

  el.querySelector('#ccBtnGenerar8a').onclick = async () => {
    if (!cuadro?.id) return alert('No hay cuadro persistido');
    if (String(cuadro.estado || '').toUpperCase() === 'FIRMADO') {
      return alert('Cuadro firmado: no se puede regenerar sin anular la versión.');
    }
    const btn = el.querySelector('#ccBtnGenerar8a');
    btn.disabled = true;
    try {
      const persistido = await buildPersistidoParaPdf();
      persistido.borrador_no_oficial = false;
      persistido.meta = { ...(persistido.meta || {}), pdf_modo: 'OFICIAL', puede_pdf_oficial: true };
      if (persistido.datos_json?.meta) {
        persistido.datos_json.meta = {
          ...persistido.datos_json.meta,
          pdf_modo: 'OFICIAL',
          puede_pdf_oficial: true,
        };
      }
      const val = validateCuadroParaAnexo8A(persistido);
      if (!val.ok) {
        alert(`No se puede generar el ${anexoLbl.titulo}:\n- ${val.faltantes.join('\n- ')}`);
        return;
      }
      const { base64, filename, report } = generateAnexo8APdf(persistido);
      const resp = await contratacionesService.guardarCuadroPdf(cuadro.id, {
        pdf_contenido: base64,
        pdf_nombre: filename,
        version_report: report.meta.version,
      });
      const data = resp.data || resp;
      cuadro = data.cuadro || { ...cuadro, estado: 'GENERADO', version: data.version };
      const badge = el.querySelector('#ccEstadoBadge');
      if (badge) {
        badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
        badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
      }
      alert(`${anexoLbl.titulo} generado y guardado (v${data.version || cuadro.version}). Estado: GENERADO.`);
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      alert(err.message || 'No se pudo generar el Anexo');
    } finally {
      btn.disabled = false;
      syncUiLocks();
    }
  };

  el.querySelector('#ccBtnDescargar8a').onclick = async () => {
    try {
      const persistido = await buildPersistidoParaPdf();
      persistido.borrador_no_oficial = false;
      persistido.meta = { ...(persistido.meta || {}), pdf_modo: 'OFICIAL', puede_pdf_oficial: true };
      if (persistido.datos_json?.meta) {
        persistido.datos_json.meta = {
          ...persistido.datos_json.meta,
          pdf_modo: 'OFICIAL',
          puede_pdf_oficial: true,
        };
      }
      downloadAnexo8APdf(persistido);
    } catch (err) {
      alert(err.message || 'No se pudo descargar');
    }
  };

  el.querySelector('#ccBtnDerivarCoord').onclick = async () => {
    if (!cuadro?.id) return;
    const respuestaObs = collectRespuestaObservaciones(el)
      || String(cuadro?.respuesta_observaciones || '').trim();
    if (isCuadroObservadoEditable(cuadro) && !respuestaObs) {
      return alert('Debe registrar la respuesta a las observaciones antes de derivar al Coordinador.');
    }
    if (!confirm('¿Derivar al Coordinador CM? (Tras observación no se deriva al DEC)')) return;
    try {
      // Persistir respuesta si hay observación pendiente
      if (respuestaObs && isCuadroObservadoEditable(cuadro)) {
        const datos = collectObservacionesFromDom(body, matriz);
        datos.respuesta_observaciones = respuestaObs;
        await contratacionesService.guardarCuadroBorrador(cuadro.id, {
          datos_json: datos,
          actualizado_at: cuadro.actualizado_at,
          respuesta_observaciones: respuestaObs,
        });
      }
      const resp = await contratacionesService.transitarRevisionCuadro(cuadro.id, {
        accion: 'DERIVAR_COORDINADOR',
        respuesta_observaciones: respuestaObs,
      });
      const data = resp.data || resp;
      cuadro = data.cuadro || cuadro;
      const badge = el.querySelector('#ccEstadoBadge');
      if (badge && cuadro) {
        badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
        badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
      }
      await refreshVersiones();
      alert('Cuadro derivado al Coordinador CM.');
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      alert(err.message || 'No se pudo derivar al Coordinador');
    } finally {
      syncUiLocks();
    }
  };
  el.querySelector('#ccBtnAprobarCoord')?.classList.add('d-none');
  el.querySelector('#ccBtnObservarCoord')?.classList.add('d-none');
  el.querySelector('#ccBtnAprobarDec')?.classList.add('d-none');
  el.querySelector('#ccBtnObservarDec')?.classList.add('d-none');

  function bindCcpActions() {
    el.querySelector('#ccBtnCcpDescargarFinal')?.addEventListener('click', async () => {
      try {
        if (cuadro?.tiene_pdf_firmado_dec || cuadro?.firmado_dec_nombre) {
          await openFirmadoDecUrl(false);
        } else if (cuadro?.tiene_pdf_firmado || cuadro?.firmado_nombre) {
          await openFirmadoUrl(false);
        } else {
          const persistido = await buildPersistidoParaPdf();
          persistido.borrador_no_oficial = false;
          downloadAnexo8APdf(persistido);
        }
      } catch (err) {
        alert(err.message || 'No se pudo descargar el Cuadro Final');
      }
    });

    el.querySelector('#ccBtnCcpVerFirmas')?.addEventListener('click', async () => {
      try {
        if (cuadro?.tiene_pdf_firmado || cuadro?.firmado_nombre) {
          await openFirmadoUrl(true);
        }
        if (cuadro?.tiene_pdf_firmado_dec || cuadro?.firmado_dec_nombre) {
          await openFirmadoDecUrl(true);
        }
        if (!cuadro?.tiene_pdf_firmado && !cuadro?.tiene_pdf_firmado_dec) {
          alert('No hay PDFs firmados adjuntos.');
        }
      } catch (err) {
        alert(err.message || 'No se pudieron abrir las firmas');
      }
    });

    el.querySelector('#ccBtnCcpGenerar')?.addEventListener('click', () => generarCcpAction());
    el.querySelector('#ccBtnCcpDerivar')?.addEventListener('click', () => derivarCcpAction());
  }

  async function generarCcpAction() {
    if (!cuadro?.id) return;
    const gates = evaluarGatesCcpCliente(cuadro);
    if (!gates.ok) {
      return alert(`No se puede Generar CCP: falta ${gates.faltantes.join(', ')}.`);
    }
    if (!confirm('¿Generar CCP? El cuadro debe estar completamente aprobado.')) return;
    try {
      const resp = await contratacionesService.transitarRevisionCuadro(cuadro.id, {
        accion: 'GENERAR_CCP',
      });
      const data = resp.data || resp;
      cuadro = data.cuadro || { ...cuadro, estado: 'PENDIENTE_CCP' };
      const badge = el.querySelector('#ccEstadoBadge');
      if (badge && cuadro) {
        badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
        badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
      }
      syncUiLocks();
      alert('CCP generado. Puede derivarlo al responsable CCP.');
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      alert(err.message || 'No se pudo generar el CCP');
    }
  }

  async function derivarCcpAction() {
    if (!cuadro?.id) return;
    const gates = evaluarGatesCcpCliente(cuadro);
    if (!gates.ok) {
      return alert(`No se puede Derivar CCP: falta ${gates.faltantes.join(', ')}.`);
    }
    const est = String(cuadro.estado || '').toUpperCase();
    if (!['APROBADO_DEC', 'PENDIENTE_CCP'].includes(est)) {
      return alert('El cuadro debe estar APROBADO_DEC o PENDIENTE_CCP.');
    }
    // Si aún no se generó, generar primero
    if (est === 'APROBADO_DEC') {
      try {
        const resp = await contratacionesService.transitarRevisionCuadro(cuadro.id, {
          accion: 'GENERAR_CCP',
        });
        const data = resp.data || resp;
        cuadro = data.cuadro || { ...cuadro, estado: 'PENDIENTE_CCP' };
      } catch (err) {
        return alert(err.message || 'No se pudo generar el CCP antes de derivar');
      }
    }
    await showDerivarCcpPanel({
      onConfirm: async (dest) => {
        const resp = await contratacionesService.derivarCuadroACcp(cuadro.id, dest);
        const data = resp.data || resp;
        cuadro = data.cuadro || { ...cuadro, estado: 'DERIVADO_CCP' };
        const badge = el.querySelector('#ccEstadoBadge');
        if (badge && cuadro) {
          badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
          badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
        }
        refreshMatrizHost(el, matriz, false);
        syncUiLocks();
        alert(`CCP derivado. Responsable: ${data.responsable?.nombre || dest.responsable_nombre || '—'}`);
        if (typeof onSaved === 'function') onSaved();
      },
    });
  }

  el.querySelector('#ccBtnGenerarCcp').onclick = () => generarCcpAction();
  el.querySelector('#ccBtnDerivarCcp').onclick = () => derivarCcpAction();

  syncUiLocks();
  return { el, modal, getState: () => ({ matriz, cuadro }) };
}

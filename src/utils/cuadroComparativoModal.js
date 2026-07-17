/**
 * Modal Elaborar / Ver Cuadro Comparativo — Bienes (RC8.2–RC8.5).
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
  collectObservacionesFromDom,
  collectSeleccionesFromDom,
} from './cuadroComparativoMatriz.js';
import { labelCuadroEstado, badgeClassCuadro } from './cuadroComparativoUtils.js';
import {
  previewAnexo8APdf,
  downloadAnexo8APdf,
  generateAnexo8APdf,
  validateCuadroParaAnexo8A,
} from './cuadroComparativoPdf.js';
import { triggerPdfUpload } from './validacionAnexo07aPdf.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  { v: 'MENOR_PRECIO_VALIDO', l: 'Menor precio válido' },
  { v: 'CUMPLIMIENTO_INTEGRAL', l: 'Cumplimiento integral' },
  { v: 'EMPATE', l: 'Empate' },
  { v: 'MENOS_DE_TRES_COTIZACIONES', l: 'Menos de tres cotizaciones' },
  { v: 'DISTINTO_MENOR_PRECIO', l: 'Selección distinta al menor precio' },
  { v: 'OTRO', l: 'Otro' },
];

function isReadonlyEstado(cuadro) {
  const e = String(cuadro?.estado || cuadro?.estado_cuadro || '').toUpperCase();
  return e === 'FIRMADO' || e === 'DERIVADO_CCP' || e === 'ANULADO' || !!cuadro?.solo_lectura;
}

function isDerivado(cuadro) {
  return String(cuadro?.estado || '').toUpperCase() === 'DERIVADO_CCP';
}

function renderPanelSustento(matriz, readonly) {
  const adj = matriz?.adjudicacion || {};
  const opts = CRITERIOS.map((c) => `
    <option value="${c.v}" ${adj.criterio_seleccion === c.v ? 'selected' : ''}>${esc(c.l)}</option>`).join('');
  const dis = readonly ? 'disabled' : '';
  return `
    <div class="card border mb-3" id="ccPanelAdjudicacion">
      <div class="card-body py-3">
        <h6 class="fw-bold mb-2">Adjudicación y sustento</h6>
        <div class="row g-2">
          <div class="col-md-4">
            <label class="form-label small mb-0">Criterio de selección</label>
            <select class="form-select form-select-sm" id="ccCriterio" ${dis}>${opts}</select>
          </div>
          <div class="col-md-8">
            <label class="form-label small mb-0">Sustento de selección</label>
            <textarea class="form-control form-control-sm" id="ccSustento" rows="2" ${dis}>${esc(adj.sustento_decision || '')}</textarea>
          </div>
          <div class="col-md-6">
            <label class="form-label small mb-0">Observación del analista</label>
            <textarea class="form-control form-control-sm" id="ccObsAnalista" rows="2" ${dis}>${esc(adj.observacion_analista || '')}</textarea>
          </div>
          <div class="col-md-6">
            <label class="form-label small mb-0">Observación del Área Usuaria</label>
            <textarea class="form-control form-control-sm" id="ccObsAU" rows="2" ${dis}>${esc(adj.observacion_area_usuaria || '')}</textarea>
          </div>
        </div>
        <p class="small text-muted mb-0 mt-2">Modalidad: adjudicación por ítem. «Otro» y casos de empate / menos de 3 / distinto al recomendado exigen sustento.</p>
      </div>
    </div>`;
}

function renderPanelFirma(cuadro) {
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
  return `
    <div class="card border mb-3" id="ccPanelFirma">
      <div class="card-body py-3">
        <h6 class="fw-bold mb-2">Anexo 8A firmado</h6>
        ${infoDeriv}
        ${meta}
        <div class="d-flex flex-wrap gap-2" id="ccFirmaActions">
          ${!derivado ? `
            <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnAdjuntarFirmado">
              <i class="bi bi-paperclip"></i> Adjuntar Anexo 8A firmado
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
  if (host) host.innerHTML = renderMatrizBienesHtml(matriz, { editable });
  const adv = el.querySelector('#ccAdvHost');
  if (adv) adv.innerHTML = renderAdvertenciasAdjudicacion(matriz);
  const res = el.querySelector('#ccResumenAdjHost');
  if (res) res.innerHTML = renderResumenAdjudicacion(matriz) + renderHistorialAdjudicacion(matriz.historial_adjudicacion);
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
  const validacion = state.validacion || matriz?.meta || {};
  const sol = matriz?.solicitud || {};
  let readonly = isReadonlyEstado(cuadro)
    || ['GENERADO', 'GENERADO_PRELIMINAR'].includes(String(cuadro?.estado || '').toUpperCase());

  const titleVerb = isDerivado(cuadro) || String(cuadro?.estado || '').toUpperCase() === 'FIRMADO'
    ? 'Ver cuadro'
    : 'Elaborar cuadro';

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
              <span class="small text-muted">v${esc(cuadro?.version || 1)} · id ${esc(cuadro?.id || '—')}</span>
              ${validacion.puede_generar === false && (matriz?.meta?.items_incompletos > 0)
    ? '<span class="badge bg-warning text-dark">Ofertas incompletas</span>'
    : '<span class="badge bg-success">Matriz lista para adjudicación</span>'}
            </div>
            <h6 class="fw-bold">Proveedores</h6>
            ${renderResumenProveedores(matriz?.resumen_proveedores || [])}
            ${renderInconsistencias(matriz?.inconsistencias || [])}
            <div id="ccAdvHost">${renderAdvertenciasAdjudicacion(matriz)}</div>
            <div id="ccResumenAdjHost">${renderResumenAdjudicacion(matriz)}${renderHistorialAdjudicacion(matriz?.historial_adjudicacion)}</div>
            <h6 class="fw-bold">Matriz comparativa (Bienes)</h6>
            <div id="ccMatrizHost">${renderMatrizBienesHtml(matriz, { editable: !readonly })}</div>
            <div class="mt-3">
              <label class="form-label small mb-1">Notas internas del cuadro</label>
              <textarea class="form-control form-control-sm" id="ccNotasInternas" rows="2"
                ${readonly ? 'disabled' : ''}>${esc(matriz?.notas_internas || '')}</textarea>
            </div>
            ${renderPanelSustento(matriz, readonly)}
            <div id="ccFirmaHost">${renderPanelFirma(cuadro)}</div>
          </div>
          <div class="modal-footer flex-wrap gap-2">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
            <button type="button" class="btn btn-outline-primary" id="ccBtnRecargar">
              <i class="bi bi-arrow-clockwise"></i> Recargar
            </button>
            <button type="button" class="btn btn-outline-primary" id="ccBtnGuardar">
              <i class="bi bi-save"></i> Guardar borrador
            </button>
            <button type="button" class="btn btn-success" id="ccBtnAdjudicar">
              <i class="bi bi-award"></i> Guardar adjudicación
            </button>
            <button type="button" class="btn btn-outline-dark" id="ccBtnPreview8a" title="Requiere adjudicación">
              <i class="bi bi-eye"></i> Previsualizar Anexo 8A
            </button>
            <button type="button" class="btn btn-dark" id="ccBtnGenerar8a" title="Genera y persiste PDF">
              <i class="bi bi-file-earmark-pdf"></i> Generar Anexo 8A
            </button>
            <button type="button" class="btn btn-outline-dark" id="ccBtnDescargar8a">
              <i class="bi bi-download"></i> Descargar
            </button>
            <button type="button" class="btn btn-primary" id="ccBtnDerivarCcp">
              <i class="bi bi-send"></i> Derivar a CCP
            </button>
          </div>
        </div>
      </div>
    </div>`);

  const body = el.querySelector('#ccElaborarBody');

  function syncUiLocks() {
    readonly = isReadonlyEstado(cuadro)
      || ['GENERADO', 'GENERADO_PRELIMINAR'].includes(String(cuadro?.estado || '').toUpperCase());
    const derivado = isDerivado(cuadro);
    const e = String(cuadro?.estado || '').toUpperCase();
    const setDis = (sel, dis) => {
      const b = el.querySelector(sel);
      if (b) b.disabled = !!dis;
    };
    setDis('#ccBtnGuardar', readonly || derivado);
    setDis('#ccBtnAdjudicar', readonly || derivado || e === 'GENERADO' || e === 'GENERADO_PRELIMINAR');
    setDis('#ccBtnGenerar8a', derivado || e === 'FIRMADO' || e === 'ANULADO');
    setDis('#ccBtnDerivarCcp', !(e === 'FIRMADO' && (cuadro?.tiene_pdf_firmado || cuadro?.firmado_nombre)) || derivado);

    const firmaHost = el.querySelector('#ccFirmaHost');
    if (firmaHost) firmaHost.innerHTML = renderPanelFirma(cuadro);
    bindFirmaActions();
  }

  function openFirmadoUrl(inline) {
    if (!cuadro?.id) return;
    const url = contratacionesService.getCuadroPdfFirmadoUrl(cuadro.id, inline);
    window.open(url, '_blank', 'noopener');
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
          alert('Anexo 8A firmado adjuntado. Estado: FIRMADO.');
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
      const notas = el.querySelector('#ccNotasInternas');
      if (notas) {
        notas.value = matriz?.notas_internas || '';
        notas.disabled = readonly;
      }
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
    const btn = el.querySelector('#ccBtnGuardar');
    btn.disabled = true;
    try {
      const resp = await contratacionesService.guardarCuadroBorrador(cuadro.id, {
        datos_json: datos,
        actualizado_at: cuadro.actualizado_at,
        notas_internas: datos.notas_internas,
      });
      const data = resp.data || resp;
      cuadro = data.cuadro || cuadro;
      matriz = data.matriz || datos;
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
        observacion_analista: el.querySelector('#ccObsAnalista')?.value || '',
        observacion_area_usuaria: el.querySelector('#ccObsAU')?.value || '',
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
    const inst = await loadInstitucional();
    let elaborado = '';
    try {
      const u = JSON.parse(localStorage.getItem('currentUser') || 'null');
      elaborado = [u?.apellidos, u?.nombres].filter(Boolean).join(' ').trim()
        || u?.nombre || u?.username || '';
    } catch (_) { /* noop */ }
    return {
      ...data,
      entidad: inst.entidad,
      logo_data_url: inst.logo_data_url,
      elaborado_por: elaborado,
    };
  }

  el.querySelector('#ccBtnPreview8a').onclick = async () => {
    try {
      const persistido = await buildPersistidoParaPdf();
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
    if (String(cuadro.estado || '').toUpperCase() === 'FIRMADO' || isDerivado(cuadro)) {
      return alert('Cuadro firmado o derivado: no se puede regenerar sin anular la versión.');
    }
    const btn = el.querySelector('#ccBtnGenerar8a');
    btn.disabled = true;
    try {
      const persistido = await buildPersistidoParaPdf();
      const val = validateCuadroParaAnexo8A(persistido);
      if (!val.ok) {
        alert(`No se puede generar el Anexo 8A:\n- ${val.faltantes.join('\n- ')}`);
        return;
      }
      const { base64, filename, report } = generateAnexo8APdf(persistido);
      const resp = await contratacionesService.guardarCuadroPdf(cuadro.id, {
        pdf_contenido: base64,
        pdf_nombre: filename,
        version_report: report.meta.version,
      });
      const data = resp.data || resp;
      cuadro = data.cuadro || { ...cuadro, estado: 'GENERADO', version: data.version, tiene_pdf: true };
      const badge = el.querySelector('#ccEstadoBadge');
      if (badge) {
        badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
        badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
      }
      alert(`Anexo 8A generado y guardado (v${data.version || cuadro.version}). Estado: GENERADO.`);
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      alert(err.message || 'No se pudo generar el Anexo');
    } finally {
      syncUiLocks();
    }
  };

  el.querySelector('#ccBtnDescargar8a').onclick = async () => {
    try {
      const persistido = await buildPersistidoParaPdf();
      downloadAnexo8APdf(persistido);
    } catch (err) {
      alert(err.message || 'No se pudo descargar');
    }
  };

  el.querySelector('#ccBtnDerivarCcp').onclick = async () => {
    if (!cuadro?.id) return;
    if (String(cuadro.estado || '').toUpperCase() !== 'FIRMADO' || !cuadro.tiene_pdf_firmado) {
      alert('Para derivar a CCP se requiere: adjudicación, PDF generado y PDF firmado.');
      return;
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
        alert(`Expediente derivado a CCP. Responsable: ${data.responsable?.nombre || dest.responsable_nombre || '—'}`);
        if (typeof onSaved === 'function') onSaved();
      },
    });
  };

  syncUiLocks();
  return { el, modal, getState: () => ({ matriz, cuadro }) };
}

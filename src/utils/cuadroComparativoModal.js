/**
 * Modal Elaborar Cuadro Comparativo — Bienes (RC8.2).
 */
import { contratacionesService } from '../services/contratacionesService.js';
import {
  renderMatrizBienesHtml,
  renderResumenProveedores,
  renderInconsistencias,
  collectObservacionesFromDom,
} from './cuadroComparativoMatriz.js';
import { labelCuadroEstado, badgeClassCuadro } from './cuadroComparativoUtils.js';

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

/**
 * Abre elaboración: crea/busca borrador y muestra matriz.
 * @param {number|string} solicitudId
 * @param {function} [onSaved]
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

  const { el, modal } = showBootstrapModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-fullscreen-lg-down modal-xl modal-dialog-scrollable" style="max-width:96vw">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <div>
              <h5 class="modal-title mb-0"><i class="bi bi-table"></i> Elaborar cuadro — ${esc(sol.codigo || solicitudId)}</h5>
              <div class="small text-muted">${esc(sol.denominacion || '')}</div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="ccElaborarBody">
            <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
              <span class="badge bg-${esc(badgeClassCuadro(cuadro?.estado_cuadro || cuadro?.estado))}">
                ${esc(cuadro?.estado_cuadro_label || labelCuadroEstado(cuadro?.estado))}
              </span>
              <span class="small text-muted">v${esc(cuadro?.version || 1)} · id ${esc(cuadro?.id || '—')}</span>
              ${validacion.puede_generar
    ? '<span class="badge bg-success">Matriz completa</span>'
    : '<span class="badge bg-warning text-dark">Borrador — generación/PDF/ganador bloqueados</span>'}
            </div>
            <h6 class="fw-bold">Proveedores</h6>
            ${renderResumenProveedores(matriz?.resumen_proveedores || [])}
            ${renderInconsistencias(matriz?.inconsistencias || [])}
            <h6 class="fw-bold">Matriz comparativa (Bienes)</h6>
            <div id="ccMatrizHost">${renderMatrizBienesHtml(matriz, { editable: true })}</div>
            <div class="mt-3">
              <label class="form-label small mb-1">Notas internas del cuadro</label>
              <textarea class="form-control form-control-sm" id="ccNotasInternas" rows="2">${esc(matriz?.notas_internas || '')}</textarea>
            </div>
          </div>
          <div class="modal-footer flex-wrap gap-2">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
            <button type="button" class="btn btn-outline-primary" id="ccBtnRecargar">
              <i class="bi bi-arrow-clockwise"></i> Recargar desde cotizaciones
            </button>
            <button type="button" class="btn btn-primary" id="ccBtnGuardar">
              <i class="bi bi-save"></i> Guardar borrador
            </button>
          </div>
        </div>
      </div>
    </div>`);

  const body = el.querySelector('#ccElaborarBody');

  async function reloadFresh() {
    try {
      const resp = await contratacionesService.getCuadroComparativoDetalle(solicitudId);
      const data = resp.data || resp;
      matriz = data.matriz;
      cuadro = data.cuadro || cuadro;
      const host = el.querySelector('#ccMatrizHost');
      if (host) host.innerHTML = renderMatrizBienesHtml(matriz, { editable: true });
      const notas = el.querySelector('#ccNotasInternas');
      if (notas) notas.value = matriz?.notas_internas || '';
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
      alert('Borrador guardado (EN_ELABORACION).');
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      if (err?.status === 409 || /versión más reciente/i.test(err.message || '')) {
        alert(err.message || 'Conflicto de versión. Recargue el cuadro.');
      } else {
        alert(err.message || 'No se pudo guardar');
      }
    } finally {
      btn.disabled = false;
    }
  };

  return { el, modal, getState: () => ({ matriz, cuadro }) };
}

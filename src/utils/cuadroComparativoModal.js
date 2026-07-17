/**
 * Modal Elaborar Cuadro Comparativo — Bienes (RC8.2/RC8.3).
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

function renderPanelSustento(matriz) {
  const adj = matriz?.adjudicacion || {};
  const opts = CRITERIOS.map((c) => `
    <option value="${c.v}" ${adj.criterio_seleccion === c.v ? 'selected' : ''}>${esc(c.l)}</option>`).join('');
  return `
    <div class="card border mb-3" id="ccPanelAdjudicacion">
      <div class="card-body py-3">
        <h6 class="fw-bold mb-2">Adjudicación y sustento</h6>
        <div class="row g-2">
          <div class="col-md-4">
            <label class="form-label small mb-0">Criterio de selección</label>
            <select class="form-select form-select-sm" id="ccCriterio">${opts}</select>
          </div>
          <div class="col-md-8">
            <label class="form-label small mb-0">Sustento de selección</label>
            <textarea class="form-control form-control-sm" id="ccSustento" rows="2">${esc(adj.sustento_decision || '')}</textarea>
          </div>
          <div class="col-md-6">
            <label class="form-label small mb-0">Observación del analista</label>
            <textarea class="form-control form-control-sm" id="ccObsAnalista" rows="2">${esc(adj.observacion_analista || '')}</textarea>
          </div>
          <div class="col-md-6">
            <label class="form-label small mb-0">Observación del Área Usuaria</label>
            <textarea class="form-control form-control-sm" id="ccObsAU" rows="2">${esc(adj.observacion_area_usuaria || '')}</textarea>
          </div>
        </div>
        <p class="small text-muted mb-0 mt-2">Modalidad: adjudicación por ítem. «Otro» y casos de empate / menos de 3 / distinto al recomendado exigen sustento.</p>
      </div>
    </div>`;
}

function refreshMatrizHost(el, matriz) {
  const host = el.querySelector('#ccMatrizHost');
  if (host) host.innerHTML = renderMatrizBienesHtml(matriz, { editable: true });
  const adv = el.querySelector('#ccAdvHost');
  if (adv) adv.innerHTML = renderAdvertenciasAdjudicacion(matriz);
  const res = el.querySelector('#ccResumenAdjHost');
  if (res) res.innerHTML = renderResumenAdjudicacion(matriz) + renderHistorialAdjudicacion(matriz.historial_adjudicacion);
}

/**
 * Abre elaboración: crea/busca borrador y muestra matriz + adjudicación.
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
            <div id="ccMatrizHost">${renderMatrizBienesHtml(matriz, { editable: true })}</div>
            <div class="mt-3">
              <label class="form-label small mb-1">Notas internas del cuadro</label>
              <textarea class="form-control form-control-sm" id="ccNotasInternas" rows="2">${esc(matriz?.notas_internas || '')}</textarea>
            </div>
            ${renderPanelSustento(matriz)}
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
      refreshMatrizHost(el, matriz);
      const notas = el.querySelector('#ccNotasInternas');
      if (notas) notas.value = matriz?.notas_internas || '';
      const badge = el.querySelector('#ccEstadoBadge');
      if (badge && cuadro) {
        badge.className = `badge bg-${badgeClassCuadro(cuadro.estado_cuadro || cuadro.estado)}`;
        badge.textContent = cuadro.estado_cuadro_label || labelCuadroEstado(cuadro.estado);
      }
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
      alert('Borrador guardado.');
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      alert(err.message || 'No se pudo guardar');
    } finally {
      btn.disabled = false;
    }
  };

  el.querySelector('#ccBtnAdjudicar').onclick = async () => {
    if (!cuadro?.id) {
      alert('No hay borrador persistido');
      return;
    }
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
      refreshMatrizHost(el, matriz);
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
    if (String(cuadro.estado || '').toUpperCase() === 'FIRMADO') {
      return alert('Cuadro firmado: no se puede regenerar sin anular la versión.');
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
      cuadro = data.cuadro || { ...cuadro, estado: 'GENERADO', version: data.version };
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
      btn.disabled = false;
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

  return { el, modal, getState: () => ({ matriz, cuadro }) };
}

/**
 * RC8.5-C — Modal expediente documental integral (Coordinador CM / DEC).
 * 10 pestañas en solo lectura + barra de acciones propia (sin menú de bandeja).
 */
import { contratacionesService } from '../services/contratacionesService.js';
import { adjuntosService } from '../services/adjuntosService.js';
import { programacionService } from '../services/programacionService.js';
import { requerimientosService } from '../services/requerimientosService.js';
import { trazabilidadService } from '../services/trazabilidadService.js';
import { downloadAnexo8APdf } from './cuadroComparativoPdf.js';
import { triggerPdfUpload } from './validacionAnexo07aPdf.js';
import {
  enRevisionCoordinador,
  renderPanelCoordinador,
} from './cuadroComparativoCoordinador.js';
import {
  isModoDec,
  renderPanelDec,
} from './cuadroComparativoDec.js';
import { observarCuadroConModalInstitucional } from './cuadroComparativoObservaciones.js';
import {
  ROLES_REVISION,
  labelRolRevision,
  normalizeActuarComo,
} from './cuadroComparativoRevisionUi.js';
import {
  setActuarComoAdmin,
  resolveActuarComoDesdeUi,
  renderBannerAdminPrueba,
  enEstadoRevisionDec,
} from './cuadroComparativoAdminPrueba.js';
import { showTrazabilidadModal } from '../views/requerimiento/reqShared.js';
import { closeBandejaDropdowns } from '../components/bandejaDetailPanel.js';
import { bindAdjuntosTable } from './documentViewer.js';
import {
  renderTabNav,
  renderResumenTab,
  renderRequerimientosTab,
  renderPedidosTab,
  renderSolicitudTab,
  renderProveedoresTab,
  renderValidacionesTab,
  renderCuadroTab,
  renderObservacionesTab,
  renderTrazabilidadTab,
} from './cuadroComparativoExpedienteTabs.js';
import {
  listDocsSolicitadosConfig,
  bindExpedienteDocsTable,
} from './cuadroComparativoExpedienteDocs.js';

const API_BASE = '/api';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function currentUser() {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null') || {}; }
  catch (_) { return {}; }
}

function authHeaders() {
  try {
    const user = currentUser();
    const h = {};
    if (user?.id) h['x-user-id'] = String(user.id);
    if (user?.username || user?.nombre || user?.dni) {
      h['x-user-name'] = String(user.username || user.nombre || user.dni);
    }
    h['x-user-cargo'] = String(user.cargo ?? '');
    h['x-user-rol'] = String(user.rol || user.role || '');
    if (user?.permisos) {
      try { h['x-user-permisos'] = JSON.stringify(user.permisos); } catch (_) { /* noop */ }
    }
    return h;
  } catch (_) { return {}; }
}

async function openPdfValidacion(cotId) {
  const url = `${API_BASE}/contrataciones/portal-analista/validaciones/${cotId}/pdf-validacion?inline=1`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('PDF de validación no disponible');
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  window.open(objUrl, '_blank');
  setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
}

async function openCotizacionDoc(cotId, ref, { download = false, downloadName = 'documento.pdf' } = {}) {
  // Misma ruta que Recepción: /ver (inline) · /descargar
  const mode = download ? 'descargar' : 'ver';
  const url = `${API_BASE}/contrataciones/portal-analista/cotizaciones/${cotId}/documento/${encodeURIComponent(ref)}/${mode}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Documento no disponible');
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  if (download) {
    let nombre = downloadName || 'documento.pdf';
    const disp = res.headers.get('content-disposition') || '';
    const m = disp.match(/filename="([^"]+)"/);
    if (m) nombre = decodeURIComponent(m[1]);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    window.open(objUrl, '_blank');
  }
  setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
}

async function openUrlAuth(path, inline = true, downloadName = 'documento.pdf') {
  const url = path.startsWith('http') ? path : `${API_BASE.replace(/\/api$/, '')}${path}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Documento no disponible');
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  if (inline) window.open(objUrl, '_blank');
  else {
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
}

function showBootstrapModal(html) {
  closeBandejaDropdowns();
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

function extractDocsFromCotDetalle(det) {
  // RC8.5-C4 — misma normalización que cotizacionDocumentosPresentados
  const d = det?.data || det || {};
  const list = d.documentos || d.archivos || d.docs || d.documentos_presentados || [];
  if (!Array.isArray(list)) return [];
  return list.map((x) => ({
    nombre: x.nombre || x.nombre_archivo || x.documento || x.tipo,
    ref: x.ref || x.clave || x.key || x.id || null,
    fecha: x.fecha || x.created_at,
    grupo: x.grupo || x.tipo || '',
    mime_type: x.mime_type || x.mime || '',
    key: x.key || null,
    disponible: x.disponible !== false && !!(x.ref || x.clave),
  }));
}

/**
 * @param {number|string} solicitudId
 * @param {() => void} [onSaved]
 * @param {{ modo?: string, adminPrueba?: boolean, adminSupervision?: boolean, actuarComo?: string }} [opts]
 */
export async function showExpedienteRevisionModal(solicitudId, onSaved, opts = {}) {
  closeBandejaDropdowns();

  const adminPrueba = !!(opts.adminPrueba || opts.adminSupervision);
  let actuarComo = adminPrueba
    ? (resolveActuarComoDesdeUi(opts.actuarComo || opts.modo) || ROLES_REVISION.COORDINADOR_CM)
    : '';
  if (adminPrueba) setActuarComoAdmin(actuarComo);
  let modo = adminPrueba ? actuarComo : (opts.modo || ROLES_REVISION.COORDINADOR_CM);
  const sid = Number(solicitudId);
  if (!Number.isFinite(sid)) {
    alert('Solicitud inválida');
    return;
  }

  function headerMetaForModo(m) {
    if (m === ROLES_REVISION.DEC) {
      return { cls: 'bg-primary bg-opacity-25', icon: 'bi-shield-check', label: 'DEC' };
    }
    if (m === ROLES_REVISION.ANALISTA) {
      return { cls: 'bg-secondary bg-opacity-25', icon: 'bi-person-workspace', label: 'Analista' };
    }
    return { cls: 'bg-warning bg-opacity-25', icon: 'bi-person-badge', label: 'Coordinación CM' };
  }
  let { cls: headerCls, icon: headerIcon, label: headerLabel } = headerMetaForModo(modo);

  const { el } = showBootstrapModal(`
    <div class="modal fade" tabindex="-1" id="ccExpModalRoot">
      <div class="modal-dialog modal-fullscreen">
        <div class="modal-content cc-exp-shell">
          <style>
            #ccExpModalRoot .cc-exp-shell {
              height: 100vh; max-height: 100vh;
              display: flex; flex-direction: column;
              overflow: hidden;
            }
            #ccExpModalRoot .cc-exp-header { flex-shrink: 0; z-index: 5; }
            #ccExpModalRoot #ccExpActionBar {
              flex-shrink: 0; z-index: 4;
              background: #fff !important;
              border-bottom: 1px solid rgba(0,0,0,.08);
            }
            #ccExpModalRoot #ccExpTabBar {
              flex-shrink: 0; z-index: 3;
              background: #fff !important;
              border-bottom: 1px solid rgba(0,0,0,.08);
              padding: 0 .75rem;
            }
            #ccExpModalRoot #ccExpTabBar .cc-exp-tabs {
              margin-bottom: 0 !important;
              flex-wrap: nowrap;
              overflow-x: auto;
              overflow-y: hidden;
              -webkit-overflow-scrolling: touch;
              scrollbar-width: thin;
            }
            #ccExpModalRoot #ccExpTabBar .nav-link {
              white-space: nowrap;
            }
            #ccExpModalRoot #ccCoordExpBody {
              flex: 1 1 auto;
              min-height: 0;
              overflow-y: auto;
              overflow-x: hidden;
              -webkit-overflow-scrolling: touch;
            }
            #ccExpModalRoot .cc-exp-footer { flex-shrink: 0; z-index: 5; }
            #ccExpModalRoot .cc-exp-table-sticky {
              overflow-x: auto;
              overflow-y: visible;
            }
            #ccExpModalRoot .cc-exp-table-sticky thead th {
              position: sticky;
              top: 0;
              z-index: 1;
              background: #f8f9fa !important;
              box-shadow: inset 0 -1px 0 rgba(0,0,0,.12);
            }
          </style>
          <div class="modal-header ${headerCls} py-2 cc-exp-header">
            <h5 class="modal-title"><i class="bi ${headerIcon}"></i> ${esc(headerLabel)} — Expediente</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div id="ccExpActionBar" class="px-3 py-2"></div>
          <div id="ccExpTabBar"></div>
          <div class="modal-body" id="ccCoordExpBody">
            <div class="text-center py-5"><span class="spinner-border"></span>
              <div class="small text-muted mt-2">Cargando expediente integral…</div></div>
          </div>
          <div class="modal-footer flex-wrap gap-2 py-2 cc-exp-footer">
            <button type="button" class="btn btn-outline-dark btn-sm" id="ccCoordBtnTrazabilidad">
              <i class="bi bi-clock-history"></i> Trazabilidad completa
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`);
  // RC8.5-E — sin menú contextual de bandeja dentro del expediente
  el.querySelectorAll('.dropdown-menu, .dropdown').forEach((n) => n.remove());
  closeBandejaDropdowns();

  const body = el.querySelector('#ccCoordExpBody');
  const actionBar = el.querySelector('#ccExpActionBar');
  const tabBar = el.querySelector('#ccExpTabBar');

  let exp = null;
  let cuadro = null;
  let matriz = {};
  let versiones = [];
  let proveedores = [];
  let solicitud = null;
  let invitados = [];
  let reqsDetalle = [];
  let adjuntosPorReq = {};
  let pedidosPorReq = {};
  let adjuntosSolicitud = [];
  let docsPorCot = {};
  let detallePorCot = {};
  let docsSolicitadosConfig = [];
  let trazaData = null;
  let reqIdTraz = null;

  try {
    const [expResp, detResp] = await Promise.all([
      contratacionesService.getCuadroComparativoExpediente(sid),
      contratacionesService.getCuadroComparativoDetalle(sid),
    ]);
    exp = expResp.data || expResp;
    const det = detResp.data || detResp;
    cuadro = det.cuadro || null;
    matriz = det.matriz || {};
    proveedores = exp.proveedores || det.proveedores || [];
    reqIdTraz = exp?.requerimientos?.[0]?.id || null;

    const reqIds = (exp?.requerimientos || []).map((r) => r.id).filter(Boolean);

    const parallel = await Promise.allSettled([
      contratacionesService.listCuadroVersiones(sid),
      adjuntosService.getAdjuntosSolicitud(sid),
      contratacionesService.getSolicitudDetalle(sid),
      contratacionesService.listProveedoresSolicitud(sid),
      ...reqIds.map((id) => requerimientosService.getById(id)),
      ...reqIds.map((id) => adjuntosService.getAdjuntos(id)),
      ...reqIds.map((id) => programacionService.getPedidos(id)),
      ...proveedores.filter((p) => p.cotizacion_id).map((p) => contratacionesService.getRecepcionCotizacionDetalle(p.cotizacion_id)),
      // RC8.5-F — trazabilidad de todos los requerimientos del expediente
      ...reqIds.map((id) => trazabilidadService.get(id)),
    ]);

    let idx = 0;
    const take = () => parallel[idx++];

    const vRes = take();
    if (vRes.status === 'fulfilled') {
      versiones = vRes.value?.data || vRes.value || [];
      if (!Array.isArray(versiones)) versiones = [];
    }

    const aSol = take();
    if (aSol.status === 'fulfilled') {
      const raw = aSol.value;
      adjuntosSolicitud = raw?.adjuntos || raw?.data || raw || [];
      if (!Array.isArray(adjuntosSolicitud)) adjuntosSolicitud = [];
    }

    const solRes = take();
    if (solRes.status === 'fulfilled') {
      // API: { solicitud, requerimientos, invitados } — usar fila SC real (docs_solicitados / requisitos_tecnicos)
      const rawSol = solRes.value?.data || solRes.value || null;
      solicitud = rawSol?.solicitud || rawSol;
      if (!invitados.length && Array.isArray(rawSol?.invitados)) {
        invitados = rawSol.invitados;
      }
    }

    const invRes = take();
    if (invRes.status === 'fulfilled') {
      const invRaw = invRes.value?.data || invRes.value || [];
      if (Array.isArray(invRaw) && invRaw.length) invitados = invRaw;
      else if (!Array.isArray(invitados)) invitados = [];
    }

    for (const id of reqIds) {
      const r = take();
      if (r.status === 'fulfilled') {
        const row = r.value?.data || r.value;
        if (row) reqsDetalle.push(row);
      }
    }
    for (const id of reqIds) {
      const r = take();
      if (r.status === 'fulfilled') {
        const list = r.value?.data || r.value?.adjuntos || r.value || [];
        adjuntosPorReq[id] = Array.isArray(list) ? list : [];
      }
    }
    for (const id of reqIds) {
      const r = take();
      if (r.status === 'fulfilled') {
        const list = r.value?.data || r.value || [];
        const codigo = (exp.requerimientos || []).find((x) => Number(x.id) === Number(id))?.codigo || String(id);
        pedidosPorReq[codigo] = Array.isArray(list) ? list : [];
      }
    }
    for (const p of proveedores.filter((x) => x.cotizacion_id)) {
      const r = take();
      if (r.status === 'fulfilled') {
        const det = r.value?.data || r.value || {};
        detallePorCot[p.cotizacion_id] = det;
        docsPorCot[p.cotizacion_id] = extractDocsFromCotDetalle(r.value);
      }
    }

    // Fusionar trazabilidad de todos los requerimientos (sin duplicar)
    const trazaParts = [];
    for (const _id of reqIds) {
      const tr = take();
      if (tr?.status === 'fulfilled') {
        const raw = tr.value?.data || tr.value;
        if (raw) trazaParts.push(raw);
      }
    }
    if (trazaParts.length) {
      const movKey = (m) => [
        String(m.fecha || '').slice(0, 16),
        String(m.accion || '').toUpperCase(),
        String(m.etapa || m.subModulo || ''),
        String(m.observacion || '').slice(0, 80),
      ].join('|');
      const seen = new Set();
      const movs = [];
      trazaParts.forEach((part) => {
        (part.historialMovimientos || part.historial_movimientos || []).forEach((m) => {
          const k = movKey(m);
          if (seen.has(k)) return;
          seen.add(k);
          movs.push(m);
        });
      });
      movs.sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0));
      const primary = trazaParts[0];
      trazaData = {
        ...primary,
        historialMovimientos: movs,
        historial_movimientos: movs,
        historialEstados: primary.historialEstados || primary.historial_estados || [],
      };
    }

    // RC8.5-C3 — docs en pestañas funcionales (SC config + cotizaciones); sin pestaña Documentos
    docsSolicitadosConfig = listDocsSolicitadosConfig(solicitud);
    void adjuntosSolicitud; // cargado para diagnóstico; no se mezcla sin dedupe
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger">${esc(err.message || 'No se pudo cargar el expediente')}</div>`;
    return;
  }

  function payloadRevision(extra = {}) {
    const p = { ...extra };
    if (adminPrueba && actuarComo) p.actuar_como = actuarComo;
    return p;
  }

  function bindAdminPruebaSelector() {
    if (!adminPrueba || !actionBar) return;
    actionBar.querySelector('#ccAdminActuarComo')?.addEventListener('change', (ev) => {
      const next = normalizeActuarComo(ev.target.value) || ROLES_REVISION.COORDINADOR_CM;
      actuarComo = next;
      modo = next;
      setActuarComoAdmin(next);
      const meta = headerMetaForModo(modo);
      headerCls = meta.cls;
      headerIcon = meta.icon;
      headerLabel = meta.label;
      const hdr = el.querySelector('.modal-header');
      if (hdr) hdr.className = `modal-header ${headerCls} py-2 flex-shrink-0`;
      const titulo = el.querySelector('.modal-title');
      if (titulo) {
        titulo.innerHTML = `<i class="bi ${headerIcon}"></i> ${esc(headerLabel)} — ${esc(exp?.solicitud_codigo || '')}`
          + ` <span class="badge text-bg-warning ms-1">Admin → ${esc(labelRolRevision(actuarComo))}</span>`;
      }
      paintActionBar();
      bindCoordActions();
      bindDecActions();
    });
  }

  function paintActionBar() {
    if (!actionBar) return;
    const user = currentUser();
    const chrome = adminPrueba ? renderBannerAdminPrueba(actuarComo) : '';
    let html = '';
    if (adminPrueba && modo === ROLES_REVISION.ANALISTA) {
      html = `<div class="alert alert-secondary py-2 small mb-0">
        Contexto <strong>Analista</strong>: para elaborar o responder observaciones abra el expediente en etapa de elaboración.
        Cambie a <strong>Coordinador CM</strong> o <strong>DEC</strong> para probar revisión sin cerrar sesión.
      </div>`;
    } else if (modo === ROLES_REVISION.COORDINADOR_CM && cuadro && enRevisionCoordinador(cuadro)) {
      html = renderPanelCoordinador(cuadro, matriz);
    } else if (modo === ROLES_REVISION.DEC && cuadro
      && (adminPrueba ? enEstadoRevisionDec(cuadro) : isModoDec(user, cuadro))) {
      html = renderPanelDec(cuadro);
    } else if (modo === ROLES_REVISION.COORDINADOR_CM || modo === ROLES_REVISION.DEC) {
      html = `<div class="small text-muted py-1">Expediente en solo lectura. Estado actual no admite acciones de este perfil${
        adminPrueba ? ` (actuando como ${labelRolRevision(modo)})` : ''
      }.</div>`;
    }
    actionBar.innerHTML = chrome
      + (html || '<div class="small text-muted py-1">Revise las pestañas del expediente. Las acciones de revisión aparecen aquí según el estado.</div>');
    // RC8.5-E — una sola barra plana (sin card duplicada / sin menús contextuales)
    const card = actionBar.querySelector('.card');
    if (card) {
      card.classList.remove('mb-3', 'border', 'border-warning', 'border-primary');
      card.classList.add('mb-0', 'border-0', 'shadow-none', 'bg-transparent');
      card.querySelector('.card-body')?.classList.add('p-0');
    }
    actionBar.querySelectorAll('.dropdown, .dropdown-menu').forEach((n) => n.remove());
    closeBandejaDropdowns();
    bindAdminPruebaSelector();
  }

  function paint() {
    const titulo = el.querySelector('.modal-title');
    if (titulo) {
      const adminSuffix = adminPrueba
        ? ` <span class="badge text-bg-warning ms-1">Admin → ${esc(labelRolRevision(actuarComo))}</span>`
        : '';
      titulo.innerHTML = `<i class="bi ${headerIcon}"></i> ${esc(headerLabel)} — ${esc(exp?.solicitud_codigo || '')}${adminSuffix}`;
    }
    paintActionBar();

    const reqCodigo = exp?.requerimientos?.[0]?.codigo || '';
    // RC8.5-C4 — pestañas fuera del scroll (sticky stack: header → acciones → tabs → contenido)
    if (tabBar) tabBar.innerHTML = renderTabNav('resumen');
    body.innerHTML = `
      <div class="tab-content">
        <div class="tab-pane fade show active" id="ccExpPane_resumen" role="tabpanel">
          ${renderResumenTab({ exp, cuadro, solicitud })}
        </div>
        <div class="tab-pane fade" id="ccExpPane_requerimientos" role="tabpanel">
          ${renderRequerimientosTab({ reqsDetalle, adjuntosPorReq })}
        </div>
        <div class="tab-pane fade" id="ccExpPane_pedidos" role="tabpanel">
          ${renderPedidosTab({ pedidosPorReq })}
        </div>
        <div class="tab-pane fade" id="ccExpPane_solicitud" role="tabpanel">
          ${renderSolicitudTab({ solicitud, invitados })}
        </div>
        <div class="tab-pane fade" id="ccExpPane_proveedores" role="tabpanel">
          ${renderProveedoresTab({
    proveedores,
    detallePorCot,
    docsPorCot,
    solicitud,
  })}
        </div>
        <div class="tab-pane fade" id="ccExpPane_validaciones" role="tabpanel">
          ${renderValidacionesTab({ proveedores })}
        </div>
        <div class="tab-pane fade" id="ccExpPane_cuadro" role="tabpanel">
          ${cuadro
    ? renderCuadroTab({ cuadro, matriz, versiones })
    : '<div class="alert alert-warning">Sin cuadro comparativo persistido.</div>'}
        </div>
        <div class="tab-pane fade" id="ccExpPane_observaciones" role="tabpanel">
          ${renderObservacionesTab({ reqsDetalle, cuadro })}
        </div>
        <div class="tab-pane fade" id="ccExpPane_trazabilidad" role="tabpanel">
          ${renderTrazabilidadTab({ trazaData, reqCodigo })}
        </div>
      </div>`;
    bindUi();
  }

  async function refreshDetalle() {
    try {
      const detResp = await contratacionesService.getCuadroComparativoDetalle(sid);
      const det = detResp.data || detResp;
      cuadro = det.cuadro || cuadro;
      matriz = det.matriz || matriz;
      const vResp = await contratacionesService.listCuadroVersiones(sid);
      versiones = vResp.data || vResp || [];
      if (!Array.isArray(versiones)) versiones = [];
      // RC8.5-D1 — refrescar payload.observaciones para historial institucional
      for (let i = 0; i < reqsDetalle.length; i += 1) {
        const id = reqsDetalle[i]?.id;
        if (!id) continue;
        try {
          const fresh = await requerimientosService.getById(id);
          if (fresh) reqsDetalle[i] = { ...reqsDetalle[i], ...fresh };
        } catch (_) { /* keep */ }
      }
    } catch (_) { /* keep */ }
    paint();
  }

  async function buildPersistidoParaPdf() {
    if (!cuadro?.id) throw new Error('No hay cuadro persistido');
    const resp = await contratacionesService.getCuadroPdfData(cuadro.id);
    const data = resp.data || resp;
    const servidor = data.datos_json || data.matriz || {};
    return {
      ...data,
      datos_json: { ...servidor, ...matriz, adjudicacion: matriz.adjudicacion || servidor.adjudicacion },
      matriz: { ...servidor, ...matriz },
      adjudicacion: matriz.adjudicacion || servidor.adjudicacion || null,
      borrador_no_oficial: false,
    };
  }

  function bindCoordActions() {
    const host = actionBar;
    if (!host) return;
    if (modo !== ROLES_REVISION.COORDINADOR_CM || !enRevisionCoordinador(cuadro)) return;

    host.querySelector('#ccBtnCoordDescargar')?.addEventListener('click', async () => {
      try {
        downloadAnexo8APdf(await buildPersistidoParaPdf());
      } catch (err) {
        alert(err.message || 'No se pudo descargar el cuadro');
      }
    });

    host.querySelector('#ccBtnCoordAdjuntar')?.addEventListener('click', () => {
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
          cuadro = data.cuadro || { ...cuadro, tiene_pdf_firmado: true, firmado_nombre: meta.nombre };
          alert('Cuadro firmado adjuntado. Puede ver el firmado y dar conformidad.');
          if (typeof onSaved === 'function') onSaved();
          await refreshDetalle();
        } catch (err) {
          alert(err.message || 'No se pudo adjuntar el PDF firmado');
        }
      }, { onError: (msg) => alert(msg) });
    });

    host.querySelector('#ccBtnCoordVerFirmado')?.addEventListener('click', async () => {
      try {
        await openUrlAuth(await contratacionesService.getCuadroPdfFirmadoUrl(cuadro.id, true), true);
      } catch (err) { alert(err.message || 'PDF firmado no disponible'); }
    });

    host.querySelector('#ccBtnCoordEliminarFirmado')?.addEventListener('click', async () => {
      if (!confirm('¿Eliminar el PDF firmado?')) return;
      try {
        const resp = await contratacionesService.eliminarCuadroPdfFirmado(cuadro.id);
        const data = resp.data || resp;
        cuadro = data.cuadro || { ...cuadro, tiene_pdf_firmado: false, firmado_nombre: '', conformidad_coordinador: false };
        if (typeof onSaved === 'function') onSaved();
        await refreshDetalle();
      } catch (err) {
        alert(err.message || 'No se pudo eliminar');
      }
    });

    host.querySelector('#ccBtnCoordConformidad')?.addEventListener('click', async () => {
      if (!cuadro?.tiene_pdf_firmado && !cuadro?.firmado_nombre) {
        return alert('Debe adjuntar el Cuadro Comparativo firmado antes de dar conformidad.');
      }
      if (!confirm('¿Registrar conformidad del Coordinador CM? Luego podrá Derivar a DEC.')) return;
      try {
        const resp = await contratacionesService.transitarRevisionCuadro(
          cuadro.id,
          payloadRevision({ accion: 'CONFORMIDAD_COORDINADOR' }),
        );
        const data = resp.data || resp;
        cuadro = data.cuadro || {
          ...cuadro,
          conformidad_coordinador: true,
          estado: 'FIRMADO_COORDINADOR',
          estado_cuadro: 'FIRMADO_COORDINADOR',
        };
        alert('Conformidad registrada. Ahora puede Derivar a DEC.');
        if (typeof onSaved === 'function') onSaved();
        await refreshDetalle();
      } catch (err) {
        alert(err.message || 'No se pudo registrar la conformidad');
      }
    });

    host.querySelector('#ccBtnCoordObservar')?.addEventListener('click', async () => {
      const req = reqsDetalle[0] || null;
      const reqId = req?.id || exp?.requerimientos?.[0]?.id;
      await observarCuadroConModalInstitucional({
        req,
        requerimientoId: reqId,
        cuadroId: cuadro.id,
        rolRevision: ROLES_REVISION.COORDINADOR_CM,
        payloadRevision,
        onDone: async () => {
          if (typeof onSaved === 'function') onSaved();
          await refreshDetalle();
        },
      });
    });

    host.querySelector('#ccBtnCoordDerivarDec')?.addEventListener('click', async () => {
      if (!cuadro?.tiene_pdf_firmado && !cuadro?.firmado_nombre) {
        return alert('Debe existir el PDF firmado antes de derivar al DEC.');
      }
      if (!cuadro?.conformidad_coordinador && !cuadro?.revision_coordinador?.conformidad) {
        return alert('Debe registrar Dar Conformidad antes de derivar al DEC.');
      }
      if (cuadro?.vigente === false) {
        return alert('La versión del cuadro no está vigente.');
      }
      const obs = cuadro?.observacion_pendiente;
      if (obs && !(obs.respuesta || obs.respondido_at || obs.respondido_por)) {
        return alert('Hay observaciones pendientes. No se puede derivar al DEC.');
      }
      if (!confirm('¿Derivar el cuadro al DEC?')) return;
      try {
        const resp = await contratacionesService.transitarRevisionCuadro(
          cuadro.id,
          payloadRevision({ accion: 'DERIVAR_DEC' }),
        );
        const data = resp.data || resp;
        cuadro = data.cuadro || cuadro;
        alert('Cuadro derivado al DEC. Responsable actualizado.');
        if (typeof onSaved === 'function') onSaved();
        await refreshDetalle();
      } catch (err) {
        alert(err.message || 'No se pudo derivar al DEC');
      }
    });
  }

  function bindDecActions() {
    const host = actionBar;
    if (!host) return;
    if (adminPrueba) {
      if (modo !== ROLES_REVISION.DEC || !enEstadoRevisionDec(cuadro)) return;
    } else if (!isModoDec(currentUser(), cuadro)) {
      return;
    }

    host.querySelector('#ccBtnDecDescargarFirmado')?.addEventListener('click', async () => {
      try {
        await openUrlAuth(
          await contratacionesService.getCuadroPdfFirmadoUrl(cuadro.id, false),
          false,
          cuadro.firmado_nombre || 'Cuadro_firmado_Coord.pdf',
        );
      } catch (err) {
        try { downloadAnexo8APdf(await buildPersistidoParaPdf()); }
        catch (e2) { alert(err.message || e2.message || 'No se pudo descargar'); }
      }
    });

    host.querySelector('#ccBtnDecAdjuntar')?.addEventListener('click', () => {
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
          cuadro = data.cuadro || { ...cuadro, tiene_pdf_firmado_dec: true, firmado_dec_nombre: meta.nombre };
          alert('Firma DEC adjuntada.');
          if (typeof onSaved === 'function') onSaved();
          await refreshDetalle();
        } catch (err) {
          alert(err.message || 'No se pudo adjuntar la firma DEC');
        }
      }, { onError: (msg) => alert(msg) });
    });

    host.querySelector('#ccBtnDecVerFirmado')?.addEventListener('click', async () => {
      try {
        await openUrlAuth(await contratacionesService.getCuadroPdfFirmadoDecUrl(cuadro.id, true), true);
      } catch (err) { alert(err.message || 'Firma DEC no disponible'); }
    });

    host.querySelector('#ccBtnDecEliminarFirmado')?.addEventListener('click', async () => {
      if (!confirm('¿Eliminar la firma DEC?')) return;
      try {
        const resp = await contratacionesService.eliminarCuadroPdfFirmadoDec(cuadro.id);
        const data = resp.data || resp;
        cuadro = data.cuadro || {
          ...cuadro, tiene_pdf_firmado_dec: false, firmado_dec_nombre: '', conformidad_dec: false,
        };
        if (typeof onSaved === 'function') onSaved();
        await refreshDetalle();
      } catch (err) {
        alert(err.message || 'No se pudo eliminar');
      }
    });

    host.querySelector('#ccBtnDecConformidad')?.addEventListener('click', async () => {
      if (!cuadro?.tiene_pdf_firmado_dec && !cuadro?.firmado_dec_nombre) {
        return alert('Debe adjuntar la Firma DEC antes de dar conformidad.');
      }
      try {
        const resp = await contratacionesService.transitarRevisionCuadro(
          cuadro.id,
          payloadRevision({ accion: 'CONFORMIDAD_DEC' }),
        );
        const data = resp.data || resp;
        cuadro = data.cuadro || { ...cuadro, conformidad_dec: true };
        alert('Conformidad del DEC registrada.');
        if (typeof onSaved === 'function') onSaved();
        await refreshDetalle();
      } catch (err) {
        alert(err.message || 'No se pudo registrar la conformidad');
      }
    });

    host.querySelector('#ccBtnDecObservar')?.addEventListener('click', async () => {
      const req = reqsDetalle[0] || null;
      const reqId = req?.id || exp?.requerimientos?.[0]?.id;
      await observarCuadroConModalInstitucional({
        req,
        requerimientoId: reqId,
        cuadroId: cuadro.id,
        rolRevision: ROLES_REVISION.DEC,
        payloadRevision,
        onDone: async () => {
          if (typeof onSaved === 'function') onSaved();
          await refreshDetalle();
        },
      });
    });

    host.querySelector('#ccBtnDecDerivarAnalista')?.addEventListener('click', async () => {
      if (!cuadro?.conformidad_dec && !cuadro?.revision_dec?.conformidad) {
        return alert('Debe registrar la conformidad antes de derivar al Analista.');
      }
      if (!confirm('¿Derivar el cuadro al Analista para Generación CCP?')) return;
      try {
        const resp = await contratacionesService.transitarRevisionCuadro(
          cuadro.id,
          payloadRevision({ accion: 'DERIVAR_ANALISTA' }),
        );
        const data = resp.data || resp;
        cuadro = data.cuadro || cuadro;
        alert('Cuadro aprobado y derivado al Analista (Generación CCP).');
        if (typeof onSaved === 'function') onSaved();
        await refreshDetalle();
      } catch (err) {
        alert(err.message || 'No se pudo derivar al Analista');
      }
    });
  }

  function bindUi() {
    bindAdjuntosTable(body);
    // RC8.5-C3 — Ver/Descargar de archivos embebidos en configuración SC
    const solHost = body.querySelector('[data-cc-exp-docs="solicitados"]');
    bindExpedienteDocsTable(solHost, docsSolicitadosConfig.map((d) => ({
      ...d,
      nombre_archivo: d.archivo || d.nombre_archivo || d.documento,
      contenido_base64: d.contenido_base64,
      mime_type: d.mime_type,
    })));

    body.querySelectorAll('.cc-exp-pdf-val').forEach((btn) => {
      btn.onclick = async () => {
        try { await openPdfValidacion(btn.dataset.cot); }
        catch (err) { alert(err.message); }
      };
    });

    body.querySelectorAll('.cc-exp-cot-doc').forEach((btn) => {
      btn.onclick = async () => {
        try {
          await openCotizacionDoc(btn.dataset.cot, btn.dataset.ref, {
            download: btn.dataset.mode === 'dl',
            downloadName: btn.dataset.name || 'documento.pdf',
          });
        } catch (err) { alert(err.message); }
      };
    });

    // RC8.5-E — PDF/firmados solo desde #ccExpActionBar (sin duplicados en pestaña Cuadro)
    body.querySelectorAll('.dropdown, .dropdown-menu').forEach((n) => n.remove());
    closeBandejaDropdowns();

    bindCoordActions();
    bindDecActions();
  }

  el.querySelector('#ccCoordBtnTrazabilidad')?.addEventListener('click', async () => {
    if (!reqIdTraz) {
      return alert('No hay requerimiento asociado para mostrar trazabilidad.');
    }
    await showTrazabilidadModal(reqIdTraz);
  });

  paint();
}

export async function showExpedienteCoordinadorModal(solicitudId, onSaved) {
  return showExpedienteRevisionModal(solicitudId, onSaved, { modo: ROLES_REVISION.COORDINADOR_CM });
}

export async function showExpedienteDecModal(solicitudId, onSaved) {
  return showExpedienteRevisionModal(solicitudId, onSaved, { modo: ROLES_REVISION.DEC });
}

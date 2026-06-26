import { portalService } from '../../services/portalService.js';
import {
  esc, fmtDt, renderProveedorShell, requireProveedorSession, bindProveedorLogout,
  PROVEEDOR_ROUTES, cleanupModalBackdrop, getProveedorSession,
} from '../../utils/proveedorShared.js';
import { renderDocumentoLista, bindDocumentoActions, attachSolicitudId } from '../../utils/proveedorDocumentos.js';
import { downloadAnexo05A, downloadAnexo05B, triggerFileInput, money as moneyPdf, TEXTO_AUTORIZACION_CORREO, TEXTO_LEY_27444 } from '../../utils/proveedorPdfCotizacion.js';

const CANJE_OPTS = ['Sí', 'No', 'Parcial'];
const RUBRO_OPTS = [
  'Medicamentos', 'Reactivos', 'Dispositivos Médicos', 'Equipos', 'Laboratorio',
  'Servicios', 'Consultoría', 'Locadores', 'Software', 'Mobiliario', 'Otros',
];
const STEP_LABELS = ['Información técnica', 'Documentos técnicos', 'Resumen y envío'];

let workspace = null;
let wizardStep = 1;
let wizardBusy = false;
let formState = {
  items: [], precios: {}, datos: {},
  adjuntos: { docs: {}, requisitos: {}, anexo05a: null, anexo05b: null },
};

function docKey(d, i) { return `doc-${i}-${d.documento || d.archivo || i}`; }
function reqKey(r, i) { return `req-${i}-${r.requisito || i}`; }

export function renderMisCotizacionesView() {
  if (!requireProveedorSession()) return '';
  return renderProveedorShell(PROVEEDOR_ROUTES.misCotizaciones, `
    <div class="card border-0 shadow-sm mb-2 prov-cot-top-compact" id="provCotTopCard">
      <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h6 class="mb-0"><i class="bi bi-file-earmark-text"></i> Mis Cotizaciones</h6>
        <div class="d-flex gap-2 align-items-center flex-wrap" id="provCotTopActions">
          <select class="form-select form-select-sm" id="provCotSelSol" style="min-width:200px;max-width:320px;"></select>
          <button type="button" class="btn btn-sm btn-primary" id="provCotAbrirWizard">Presentar cotización</button>
        </div>
      </div>
      <div class="card-body py-2" id="provCotList"><div class="text-muted small">Cargando…</div></div>
    </div>
    <div class="card border-0 shadow-sm d-none" id="provCotWizardCard">
      <div class="card-header bg-white py-2">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
          <h5 class="mb-0 fs-6" id="provCotWizardTitle">Presentar cotización</h5>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="provCotCerrarWizard">Cerrar</button>
        </div>
        <div class="d-flex gap-2 flex-wrap small" id="provCotStepper">
          <span class="prov-wizard-step active" data-step="1"><i class="bi bi-1-circle"></i> ${STEP_LABELS[0]}</span>
          <span class="prov-wizard-step" data-step="2"><i class="bi bi-2-circle"></i> ${STEP_LABELS[1]}</span>
          <span class="prov-wizard-step" data-step="3"><i class="bi bi-3-circle"></i> ${STEP_LABELS[2]}</span>
        </div>
      </div>
      <div class="card-body prov-step-panel py-3" id="provCotWizardBody"></div>
      <div class="card-footer bg-white py-2 d-flex justify-content-between align-items-center">
        <button type="button" class="btn btn-outline-secondary btn-sm d-none" id="provCotBtnAtras">Atrás</button>
        <button type="button" class="btn btn-primary btn-sm ms-auto" id="provCotBtnSiguiente">Guardar y continuar</button>
      </div>
    </div>`);
}

function money(n) {
  return moneyPdf(n);
}

function parseNum(v) {
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(/,/g, '');
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatPriceDisplay(n) {
  if (!n || Number(n) === 0) return '';
  return money(n);
}

function showWizardMsg(msg, type = 'success') {
  document.getElementById('provWizardMsg')?.remove();
  const body = document.getElementById('provCotWizardBody');
  if (!body) return;
  body.insertAdjacentHTML('afterbegin', `<div id="provWizardMsg" class="alert alert-${type} py-2 small mb-2">${esc(msg)}</div>`);
  setTimeout(() => document.getElementById('provWizardMsg')?.remove(), 4500);
}

function setWizardMode(active) {
  document.getElementById('provCotTopCard')?.classList.toggle('d-none', active);
  document.getElementById('provCotWizardCard')?.classList.toggle('d-none', !active);
}

function initFormFromWorkspace(ws) {
  const prev = ws.cotizacion_existente?.propuesta_tecnica?.items || [];
  const prevEco = ws.cotizacion_existente?.propuesta_economica?.precios || {};
  const prevAnexos = ws.cotizacion_existente?.anexos || {};

  formState.items = ws.items.map((it, idx) => {
    const saved = prev.find((p) => p.item_key === it.item_key) || prev[idx] || {};
    return {
      item_key: it.item_key,
      presentacion: saved.presentacion || '',
      cantidad_ofertada: saved.cantidad_ofertada ?? it.cantidad ?? 1,
      marca: saved.marca || '',
      modelo: saved.modelo || '',
      pais: saved.pais || '',
      anio_fabricacion: saved.anio_fabricacion || '',
      garantia: saved.garantia || '',
      vigencia_minima: saved.vigencia_minima || '',
      compromiso_canje: saved.compromiso_canje || 'No',
      plazo_entrega: saved.plazo_entrega || '',
      doc_tecnica: saved.doc_tecnica || '',
    };
  });
  formState.precios = {};
  ws.items.forEach((it) => {
    const saved = prevEco[it.item_key] || {};
    formState.precios[it.item_key] = {
      unitario: saved.unitario || 0,
      total: saved.total || 0,
    };
  });

  const prevDatos = prevEco.datos_proveedor || prevAnexos.datos_proveedor || {};
  const prov = getProveedorSession();
  const master = workspace?.proveedor || {};
  formState.datos = {
    razon_social: prevDatos.razon_social || prov?.razon_social || master.razon_social || '',
    ruc: prevDatos.ruc || prov?.ruc || master.ruc || '',
    domicilio_fiscal: prevDatos.domicilio_fiscal || master.direccion || '',
    representante_legal: prevDatos.representante_legal || '',
    persona_contacto: prevDatos.persona_contacto || master.persona_contacto || '',
    celular: prevDatos.celular || prov?.telefono || master.telefono || '',
    correo: prevDatos.correo || prov?.correo || master.correo || (prov?.emails?.[0] || ''),
    rubro: prevDatos.rubro || master.rubro || '',
    validez_oferta: prevDatos.validez_oferta || '',
    firma_representante: prevDatos.firma_representante || '',
  };

  formState.adjuntos = {
    docs: {},
    requisitos: {},
    anexo05a: prevAnexos.anexo05a_firmado || null,
    anexo05b: prevAnexos.anexo05b_firmado || null,
  };
  (prevAnexos.docs_solicitados || []).forEach((a) => {
    if (a.key) formState.adjuntos.docs[a.key] = a;
  });
  (prevAnexos.requisitos || []).forEach((a) => {
    if (a.key) formState.adjuntos.requisitos[a.key] = a;
  });
}

function updateStepperUI() {
  document.querySelectorAll('#provCotStepper .prov-wizard-step').forEach((el) => {
    const s = parseInt(el.dataset.step, 10);
    el.classList.toggle('active', s === wizardStep);
    el.classList.toggle('done', s < wizardStep);
  });
  document.getElementById('provCotBtnAtras')?.classList.toggle('d-none', wizardStep <= 1);
  const btn = document.getElementById('provCotBtnSiguiente');
  if (btn) btn.textContent = wizardStep >= 3 ? 'Enviar cotización' : 'Guardar y continuar';
}

function renderUploadSlot(label, fileMeta, inputId) {
  return `
    <div class="prov-upload-row">
      <div class="small fw-semibold">${esc(label)}</div>
      ${fileMeta ? `<div class="small text-success"><i class="bi bi-paperclip"></i> ${esc(fileMeta.nombre)}</div>` : '<div class="small text-muted">Sin archivo adjunto</div>'}
      <button type="button" class="btn btn-outline-primary btn-sm mt-1 prov-upload-btn" data-target="${esc(inputId)}">
        ${fileMeta ? 'Reemplazar' : 'Adjuntar'}
      </button>
    </div>`;
}

function renderDocsColumn(it, solicitudId) {
  const docs = attachSolicitudId(it.documentos_tecnicos || [], solicitudId);
  return `<td class="prov-docs-col">${renderDocumentoLista(docs, { compact: true })}</td>`;
}

function renderStep1() {
  const sol = workspace.solicitud;
  const sid = sol.id;
  const total = Object.values(formState.precios).reduce((a, p) => a + parseNum(p.total), 0);

  return `
    <div class="alert alert-light border small mb-2 py-2">
      <strong>${esc(sol.codigo)}</strong> — ${esc(sol.denominacion || sol.objeto || '')}
    </div>
    <h6 class="fw-bold mb-2">1. Anexo 05-A — Información técnica solicitada (cumplimiento del ítem)</h6>
    <div class="table-responsive mb-2">
      <table class="table table-bordered table-sm prov-cot-table mb-0">
        <thead class="table-primary text-center align-middle">
          <tr>
            <th rowspan="2">Req.</th><th rowspan="2">Centro</th><th rowspan="2">Código SIGA</th>
            <th rowspan="2">Descripción</th><th rowspan="2">Cant.</th><th rowspan="2">U.M.</th>
            <th rowspan="2">Requerimiento/Pedidos</th>
            <th colspan="11">Cumplimiento del Ítem</th>
          </tr>
          <tr>
            <th>Presentación</th><th>Cant. ofertada</th><th>Marca</th><th>Modelo</th><th>País</th>
            <th>Año fab.</th><th>Garantía</th><th>Vigencia mín.</th><th>Canje</th><th>Plazo entrega</th><th>Doc. técnica</th>
          </tr>
        </thead>
        <tbody>
          ${workspace.items.map((it, idx) => {
            const f = formState.items[idx] || {};
            return `<tr data-idx="${idx}">
              <td>${esc(it.requerimiento_codigo || it.requerimiento_id)}</td>
              <td>${esc(it.paquete || '—')}</td>
              <td>${esc(it.codigo_sigamef || '—')}</td>
              <td>${esc(it.descripcion || '—')}</td>
              <td class="text-center">${esc(it.cantidad ?? 1)}</td>
              <td class="text-center">${esc(it.unidad_medida || 'UND')}</td>
              ${renderDocsColumn(it, sid)}
              <td><input class="form-control form-control-sm prov-f-presentacion" value="${esc(f.presentacion)}"></td>
              <td><input class="form-control form-control-sm prov-f-cant" type="number" min="0" value="${esc(f.cantidad_ofertada)}"></td>
              <td><input class="form-control form-control-sm prov-f-marca" value="${esc(f.marca)}"></td>
              <td><input class="form-control form-control-sm prov-f-modelo" value="${esc(f.modelo)}"></td>
              <td><input class="form-control form-control-sm prov-f-pais" value="${esc(f.pais)}"></td>
              <td><input class="form-control form-control-sm prov-f-anio" value="${esc(f.anio_fabricacion)}"></td>
              <td><input class="form-control form-control-sm prov-f-garantia" value="${esc(f.garantia)}"></td>
              <td><input class="form-control form-control-sm prov-f-vigencia" value="${esc(f.vigencia_minima)}"></td>
              <td><select class="form-select form-select-sm prov-f-canje">${CANJE_OPTS.map((o) =>
                `<option ${f.compromiso_canje === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
              <td><input class="form-control form-control-sm prov-f-plazo" type="number" min="0" value="${esc(f.plazo_entrega)}"></td>
              <td><input class="form-control form-control-sm prov-f-doctec" value="${esc(f.doc_tecnica)}"></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="mb-3">
      <button type="button" class="btn btn-outline-success btn-sm" id="provBtnDl05A">
        <i class="bi bi-download"></i> Descargar propuesta técnica (Anexo 05-A)
      </button>
      <span class="small text-muted ms-2">Imprima, firme y adjunte en el paso 2.</span>
    </div>
    <h6 class="fw-bold mb-2">2. Anexo 05-B — Oferta económica</h6>
    <div class="table-responsive mb-2">
      <table class="table table-bordered table-sm prov-cot-table mb-0">
        <thead class="table-light text-center">
          <tr><th>Ítem</th><th>Descripción</th><th>Cant.</th><th>Precio Unitario S/.</th><th>Precio Total S/.</th></tr>
        </thead>
        <tbody>
          ${workspace.items.map((it, idx) => {
            const p = formState.precios[it.item_key] || { unitario: 0, total: 0 };
            return `<tr data-pidx="${idx}">
              <td>${idx + 1}</td>
              <td>${esc(it.descripcion || '—')}</td>
              <td class="text-center">${esc(it.cantidad ?? 1)}</td>
              <td><input class="form-control form-control-sm prov-p-unit text-end" type="text" inputmode="decimal"
                placeholder="0.00" value="${esc(formatPriceDisplay(p.unitario))}"></td>
              <td><input class="form-control form-control-sm prov-p-total text-end" type="text" readonly
                value="${esc(formatPriceDisplay(p.total))}"></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
      <button type="button" class="btn btn-outline-success btn-sm" id="provBtnDl05B">
        <i class="bi bi-download"></i> Descargar propuesta económica (Anexo 05-B)
      </button>
      <span class="small text-muted">Imprima, firme y adjunte en el paso 2.</span>
    </div>
    <div class="fw-semibold mb-3">Monto total (IGV incl.): S/ <span id="provCotMontoTotal">${money(total)}</span></div>
    <div class="card border mb-3">
      <div class="card-header py-2 small fw-bold bg-light">Datos del proveedor — Anexo 05-B</div>
      <div class="card-body py-2">
        <div class="row g-2 small">
          <div class="col-md-6"><label class="form-label mb-0">Razón Social</label>
            <input class="form-control form-control-sm prov-dato" data-k="razon_social" value="${esc(formState.datos.razon_social)}"></div>
          <div class="col-md-6"><label class="form-label mb-0">RUC</label>
            <input class="form-control form-control-sm prov-dato" data-k="ruc" value="${esc(formState.datos.ruc)}"></div>
          <div class="col-md-12"><label class="form-label mb-0">Domicilio fiscal</label>
            <input class="form-control form-control-sm prov-dato" data-k="domicilio_fiscal" value="${esc(formState.datos.domicilio_fiscal)}"></div>
          <div class="col-md-6"><label class="form-label mb-0">Datos Representante Legal</label>
            <input class="form-control form-control-sm prov-dato" data-k="representante_legal" value="${esc(formState.datos.representante_legal)}"></div>
          <div class="col-md-6"><label class="form-label mb-0">Persona de Contacto</label>
            <input class="form-control form-control-sm prov-dato" data-k="persona_contacto" value="${esc(formState.datos.persona_contacto)}"></div>
          <div class="col-md-4"><label class="form-label mb-0">Celular</label>
            <input class="form-control form-control-sm prov-dato" data-k="celular" value="${esc(formState.datos.celular)}"></div>
          <div class="col-md-4"><label class="form-label mb-0">Correo electrónico</label>
            <input class="form-control form-control-sm prov-dato" data-k="correo" value="${esc(formState.datos.correo)}"></div>
          <div class="col-md-4"><label class="form-label mb-0">Rubro</label>
            <select class="form-select form-select-sm prov-dato" data-k="rubro">
              <option value="">— Seleccione —</option>
              ${RUBRO_OPTS.map((r) => `<option value="${esc(r)}" ${formState.datos.rubro === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
            </select></div>
          <div class="col-md-4"><label class="form-label mb-0">Validez de la oferta</label>
            <input class="form-control form-control-sm prov-dato" data-k="validez_oferta" value="${esc(formState.datos.validez_oferta)}"></div>
          <div class="col-md-12"><label class="form-label mb-0">Firma del Representante legal</label>
            <input class="form-control form-control-sm prov-dato" data-k="firma_representante" value="${esc(formState.datos.firma_representante)}"
              placeholder="Se completará al firmar el documento impreso"></div>
        </div>
        <div class="mt-3 p-2 bg-light border rounded small text-muted" style="user-select:none;">
          <p class="mb-2">${esc(TEXTO_AUTORIZACION_CORREO)}</p>
          <p class="mb-0">${esc(TEXTO_LEY_27444)}</p>
        </div>
      </div>
    </div>`;
}

function renderStep2() {
  const docsSol = workspace.solicitud.docs_solicitados || [];
  const requisitos = workspace.solicitud.requisitos_tecnicos || [];

  const docsHtml = docsSol.length ? docsSol.map((d, i) => {
    const key = docKey(d, i);
    return renderUploadSlot(`${d.documento || 'Documento'}${d.archivo ? ` (${d.archivo})` : ''}`, formState.adjuntos.docs[key], key);
  }).join('') : '<p class="small text-muted">No hay documentos solicitados en la convocatoria.</p>';

  const reqHtml = requisitos.length ? requisitos.map((r, i) => {
    const key = reqKey(r, i);
    const label = `${r.requisito || 'Requisito'}${r.obligatorio !== false ? ' *' : ''}`;
    return renderUploadSlot(label, formState.adjuntos.requisitos[key], key);
  }).join('') : '<p class="small text-muted">No hay requisitos técnicos mínimos.</p>';

  return `
    <div class="alert alert-info small py-2">
      Descargue los documentos de la convocatoria, complételos, fírmelos y adjúntelos. También adjunte los Anexo 05-A y 05-B firmados del paso anterior.
    </div>
    <div class="row g-3">
      <div class="col-lg-6">
        <div class="card h-100 border">
          <div class="card-header py-2 small fw-bold bg-light">Documentos solicitados al proveedor</div>
          <div class="card-body py-2">${docsHtml}</div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card h-100 border">
          <div class="card-header py-2 small fw-bold bg-light">Requisitos técnicos mínimos — adjuntar documentación</div>
          <div class="card-body py-2">${reqHtml}</div>
        </div>
      </div>
    </div>
    <div class="card border mt-3">
      <div class="card-header py-2 small fw-bold bg-light">Propuestas firmadas (paso Anexo 05-A y 05-B)</div>
      <div class="card-body py-2">
        <div class="row g-2">
          <div class="col-md-6">${renderUploadSlot('Anexo 05-A firmado (propuesta técnica)', formState.adjuntos.anexo05a, 'anexo05a')}</div>
          <div class="col-md-6">${renderUploadSlot('Anexo 05-B firmado (propuesta económica)', formState.adjuntos.anexo05b, 'anexo05b')}</div>
        </div>
      </div>
    </div>`;
}

function listAllAdjuntos() {
  const list = [];
  Object.entries(formState.adjuntos.docs).forEach(([key, f]) => {
    if (f) list.push({ ...f, key, tipo: 'Documento solicitado', group: 'docs' });
  });
  Object.entries(formState.adjuntos.requisitos).forEach(([key, f]) => {
    if (f) list.push({ ...f, key, tipo: 'Requisito técnico', group: 'requisitos' });
  });
  if (formState.adjuntos.anexo05a) list.push({ ...formState.adjuntos.anexo05a, key: 'anexo05a', tipo: 'Anexo 05-A firmado', group: 'anexo05a' });
  if (formState.adjuntos.anexo05b) list.push({ ...formState.adjuntos.anexo05b, key: 'anexo05b', tipo: 'Anexo 05-B firmado', group: 'anexo05b' });
  return list;
}

function renderStep3() {
  const sol = workspace.solicitud;
  const total = Object.values(formState.precios).reduce((a, p) => a + parseNum(p.total), 0);
  const adjuntos = listAllAdjuntos();

  return `
    <div class="row g-3">
      <div class="col-lg-7">
        <div class="card border h-100">
          <div class="card-header py-2 fw-bold">Resumen de la cotización</div>
          <div class="card-body small">
            <p><strong>${esc(sol.codigo)}</strong><br>${esc(sol.denominacion || sol.objeto || '')}</p>
            <p class="mb-1">Ítems: <strong>${workspace.items.length}</strong></p>
            <p class="mb-3 fs-6">Monto total (IGV incl.): <strong>S/ ${money(total)}</strong></p>
            <div class="card bg-light border-0 mb-0">
              <div class="card-body py-2 prov-crono-box">
                <div class="fw-semibold mb-1">Cronograma</div>
                <div class="prov-crono-line"><span class="text-muted me-1">Consultas:</span>${fmtDt(sol.consultas_inicio)} — ${fmtDt(sol.consultas_fin)}</div>
                <div class="prov-crono-line mt-1"><span class="text-muted me-1">Cotización:</span>${fmtDt(sol.cotizaciones_inicio)} — ${fmtDt(sol.cotizaciones_fin)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-lg-5">
        <div class="card border-primary h-100">
          <div class="card-header bg-primary text-white py-2 fw-bold">Documentación adjunta</div>
          <div class="card-body p-0">
            ${adjuntos.length ? `
              <ul class="list-group list-group-flush small" id="provResAdjList">
                ${adjuntos.map((a) => `
                  <li class="list-group-item d-flex justify-content-between align-items-start gap-2">
                    <div><span class="badge bg-secondary me-1">${esc(a.tipo)}</span>${esc(a.nombre)}</div>
                    <button type="button" class="btn btn-link btn-sm text-danger p-0 prov-adj-del"
                      data-group="${esc(a.group)}" data-key="${esc(a.key)}">Eliminar</button>
                  </li>`).join('')}
              </ul>` : '<div class="p-3 text-muted small">Sin archivos adjuntos.</div>'}
          </div>
        </div>
      </div>
    </div>
    <div class="alert alert-warning small mt-3 mb-2">
      Revise la documentación. Si está conforme, presione <strong>Enviar cotización</strong>. El estado se reflejará en <em>Estado de Participación</em>.
    </div>
    <button type="button" class="btn btn-outline-secondary btn-sm" id="provCotEditDocs">Editar documentación adjunta</button>`;
}

function renderWizardStep() {
  const body = document.getElementById('provCotWizardBody');
  if (!body || !workspace) return;
  updateStepperUI();
  if (wizardStep === 1) body.innerHTML = renderStep1();
  else if (wizardStep === 2) body.innerHTML = renderStep2();
  else body.innerHTML = renderStep3();
  bindWizardInteractions();
}

function collectStep1FromDom() {
  document.querySelectorAll('#provCotWizardBody tr[data-idx]').forEach((tr) => {
    const idx = parseInt(tr.dataset.idx, 10);
    if (!formState.items[idx]) return;
    formState.items[idx] = {
      ...formState.items[idx],
      presentacion: tr.querySelector('.prov-f-presentacion')?.value || '',
      cantidad_ofertada: parseNum(tr.querySelector('.prov-f-cant')?.value),
      marca: tr.querySelector('.prov-f-marca')?.value || '',
      modelo: tr.querySelector('.prov-f-modelo')?.value || '',
      pais: tr.querySelector('.prov-f-pais')?.value || '',
      anio_fabricacion: tr.querySelector('.prov-f-anio')?.value || '',
      garantia: tr.querySelector('.prov-f-garantia')?.value || '',
      vigencia_minima: tr.querySelector('.prov-f-vigencia')?.value || '',
      compromiso_canje: tr.querySelector('.prov-f-canje')?.value || 'No',
      plazo_entrega: tr.querySelector('.prov-f-plazo')?.value || '',
      doc_tecnica: tr.querySelector('.prov-f-doctec')?.value || '',
    };
  });
  document.querySelectorAll('#provCotWizardBody .prov-dato').forEach((inp) => {
    const k = inp.dataset.k;
    if (k) formState.datos[k] = inp.value || '';
  });
}

function recalcPrecios() {
  workspace.items.forEach((it, idx) => {
    const tr = document.querySelector(`#provCotWizardBody tr[data-pidx="${idx}"]`);
    if (!tr) return;
    const unit = parseNum(tr.querySelector('.prov-p-unit')?.value);
    const cant = parseNum(it.cantidad ?? 1);
    const total = unit * cant;
    formState.precios[it.item_key] = { unitario: unit, total };
    const totalEl = tr.querySelector('.prov-p-total');
    if (totalEl) totalEl.value = formatPriceDisplay(total);
  });
  const sum = Object.values(formState.precios).reduce((a, p) => a + parseNum(p.total), 0);
  const el = document.getElementById('provCotMontoTotal');
  if (el) el.textContent = money(sum);
}

function formatPriceInputsOnBlur() {
  document.querySelectorAll('#provCotWizardBody .prov-p-unit').forEach((inp) => {
    const v = parseNum(inp.value);
    inp.value = v > 0 ? formatPriceDisplay(v) : '';
  });
}

function validateStep1() {
  collectStep1FromDom();
  recalcPrecios();
  const errors = [];
  const labels = {
    presentacion: 'Presentación', marca: 'Marca', modelo: 'Modelo', pais: 'País',
    anio_fabricacion: 'Año de fabricación', garantia: 'Garantía', vigencia_minima: 'Vigencia mínima',
    plazo_entrega: 'Plazo de entrega', doc_tecnica: 'Documentación técnica',
  };
  formState.items.forEach((f, idx) => {
    Object.entries(labels).forEach(([k, lbl]) => {
      if (!String(f[k] ?? '').trim()) errors.push(`Ítem ${idx + 1}: falta ${lbl}`);
    });
    if (!f.cantidad_ofertada || f.cantidad_ofertada <= 0) errors.push(`Ítem ${idx + 1}: cantidad ofertada inválida`);
  });
  workspace.items.forEach((it, idx) => {
    const p = formState.precios[it.item_key];
    if (!p?.unitario || p.unitario <= 0) errors.push(`Ítem ${idx + 1}: ingrese precio unitario en Anexo 05-B`);
  });
  const datosReq = {
    razon_social: 'Razón Social', ruc: 'RUC', domicilio_fiscal: 'Dirección Fiscal',
    persona_contacto: 'Persona de contacto', celular: 'Celular', correo: 'Correo electrónico', rubro: 'Rubro',
    representante_legal: 'Representante Legal', validez_oferta: 'Validez de la oferta',
  };
  Object.entries(datosReq).forEach(([k, lbl]) => {
    if (!String(formState.datos[k] ?? '').trim()) errors.push(`Anexo 05-B: falta ${lbl}`);
  });
  return errors;
}

function validateStep2() {
  const errors = [];
  (workspace.solicitud.docs_solicitados || []).forEach((d, i) => {
    const key = docKey(d, i);
    if (!formState.adjuntos.docs[key]) errors.push(`Falta adjuntar: ${d.documento || d.archivo || 'documento solicitado'}`);
  });
  (workspace.solicitud.requisitos_tecnicos || []).forEach((r, i) => {
    if (r.obligatorio === false) return;
    const key = reqKey(r, i);
    if (!formState.adjuntos.requisitos[key]) errors.push(`Falta adjuntar requisito: ${r.requisito}`);
  });
  if (!formState.adjuntos.anexo05a) errors.push('Falta adjuntar Anexo 05-A firmado');
  if (!formState.adjuntos.anexo05b) errors.push('Falta adjuntar Anexo 05-B firmado');
  return errors;
}

function bindWizardInteractions() {
  const body = document.getElementById('provCotWizardBody');
  if (!body || !workspace) return;
  bindDocumentoActions(body, workspace.solicitud.id);

  document.getElementById('provBtnDl05A')?.addEventListener('click', () => {
    collectStep1FromDom();
    try {
      downloadAnexo05A({
        solicitud: workspace.solicitud,
        items: workspace.items,
        formItems: formState.items,
        proveedor: getProveedorSession(),
        datos: formState.datos,
      });
    } catch (e) { alert(e.message); }
  });

  document.getElementById('provBtnDl05B')?.addEventListener('click', () => {
    collectStep1FromDom();
    recalcPrecios();
    try {
      downloadAnexo05B({
        solicitud: workspace.solicitud,
        items: workspace.items,
        precios: formState.precios,
        proveedor: getProveedorSession(),
        datos: formState.datos,
      });
    } catch (e) { alert(e.message); }
  });

  body.querySelectorAll('.prov-p-unit').forEach((inp) => {
    inp.addEventListener('input', recalcPrecios);
    inp.addEventListener('blur', () => { recalcPrecios(); formatPriceInputsOnBlur(); });
  });

  body.querySelectorAll('.prov-upload-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      triggerFileInput('.pdf,.doc,.docx,image/*', (file) => {
        if (target === 'anexo05a') formState.adjuntos.anexo05a = file;
        else if (target === 'anexo05b') formState.adjuntos.anexo05b = file;
        else if (target.startsWith('doc-')) formState.adjuntos.docs[target] = { ...file, key: target };
        else if (target.startsWith('req-')) formState.adjuntos.requisitos[target] = { ...file, key: target };
        renderWizardStep();
      });
    });
  });

  body.querySelectorAll('.prov-adj-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { group, key } = btn.dataset;
      if (group === 'docs') delete formState.adjuntos.docs[key];
      else if (group === 'requisitos') delete formState.adjuntos.requisitos[key];
      else if (group === 'anexo05a') formState.adjuntos.anexo05a = null;
      else if (group === 'anexo05b') formState.adjuntos.anexo05b = null;
      renderWizardStep();
    });
  });

  document.getElementById('provCotEditDocs')?.addEventListener('click', () => {
    wizardStep = 2;
    renderWizardStep();
  });

  if (wizardStep === 1) recalcPrecios();
}

function buildAnexosPayload() {
  return {
    docs_solicitados: Object.entries(formState.adjuntos.docs).map(([key, f]) => ({ key, ...f })),
    requisitos: Object.entries(formState.adjuntos.requisitos).map(([key, f]) => ({ key, ...f })),
    anexo05a_firmado: formState.adjuntos.anexo05a,
    anexo05b_firmado: formState.adjuntos.anexo05b,
    datos_proveedor: formState.datos,
  };
}

function buildPayload() {
  collectStep1FromDom();
  recalcPrecios();
  const monto = Object.values(formState.precios).reduce((a, p) => a + parseNum(p.total), 0);
  return {
    solicitud_id: workspace.solicitud.id,
    propuesta_tecnica: { items: formState.items },
    propuesta_economica: { precios: formState.precios, monto, moneda: 'PEN', datos_proveedor: formState.datos },
    anexos: buildAnexosPayload(),
  };
}

async function guardarBorradorSilencioso() {
  await portalService.guardarBorradorCotizacion(buildPayload());
}

async function loadCotizacionesList() {
  const cont = document.getElementById('provCotList');
  if (!cont) return;
  const resp = await portalService.listMisCotizaciones();
  const rows = resp.data || [];
  if (!rows.length) {
    cont.innerHTML = '<div class="small text-muted mb-0">No ha enviado cotizaciones.</div>';
    return;
  }
  cont.innerHTML = `
    <table class="table table-sm table-bordered mb-0">
      <thead class="table-light"><tr>
        <th>Solicitud</th><th>Estado</th><th>Validación</th><th>Fecha envío</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rows.map((c) => `
        <tr>
          <td><strong>${esc(c.solicitud_codigo)}</strong> — ${esc(c.denominacion || c.objeto || '')}</td>
          <td>${esc(c.estado)}</td>
          <td>${esc(c.validacion_estado || 'Pendiente')}</td>
          <td class="small">${fmtDt(c.fecha_presentacion || c.created_at)}</td>
          <td class="text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-primary prov-cot-ver" data-id="${c.solicitud_id}">Ver / Editar</button>
          </td>
        </tr>`).join('')}</tbody>
    </table>`;
  cont.querySelectorAll('.prov-cot-ver').forEach((btn) => {
    btn.addEventListener('click', () => openWizardFor(parseInt(btn.dataset.id, 10)));
  });
}

async function openWizardFor(solicitudId) {
  const sel = document.getElementById('provCotSelSol');
  if (sel) sel.value = String(solicitudId);
  await openWizard();
}

async function loadConvocatoriasSelect() {
  const inv = await portalService.listMisInvitaciones();
  const sel = document.getElementById('provCotSelSol');
  const abiertas = (inv.data || []).filter((i) => !i.convocatoria_cerrada);
  if (sel) {
    sel.innerHTML = abiertas.map((i) =>
      `<option value="${i.solicitud_id}">${esc(i.codigo)} — ${esc(i.denominacion || i.objeto || '')}</option>`)
      .join('') || '<option value="">Sin convocatorias abiertas</option>';
    const saved = sessionStorage.getItem('provCotSolId');
    if (saved && abiertas.some((i) => String(i.solicitud_id) === saved)) sel.value = saved;
  }
}

async function openWizard() {
  const sid = parseInt(document.getElementById('provCotSelSol')?.value, 10);
  if (!sid) { alert('Seleccione una convocatoria abierta'); return; }
  try {
    const resp = await portalService.getCotizacionWorkspace(sid);
    if (resp.convocatoria_cerrada) { alert('La convocatoria está cerrada'); return; }
    workspace = resp;
    wizardStep = 1;
    initFormFromWorkspace(resp);
    setWizardMode(true);
    document.getElementById('provCotWizardTitle').textContent = `Presentar cotización — ${resp.solicitud.codigo}`;
    renderWizardStep();
  } catch (err) { alert(err.message); }
}

function closeWizard() {
  setWizardMode(false);
  workspace = null;
  wizardStep = 1;
}

async function enviarCotizacion() {
  const step2Err = validateStep2();
  if (step2Err.length) {
    alert('Complete la documentación antes de enviar:\n\n• ' + step2Err.join('\n• '));
    wizardStep = 2;
    renderWizardStep();
    return;
  }
  if (!confirm('¿Confirma el envío de su cotización?')) return;
  if (wizardBusy) return;
  wizardBusy = true;
  try {
    await portalService.presentarCotizacion(buildPayload());
    closeWizard();
    await loadCotizacionesList();
    alert('Cotización enviada correctamente. Consulte su estado en la pestaña Estado de Participación.');
  } catch (err) { alert(err.message); }
  finally { wizardBusy = false; }
}

async function onWizardSiguiente() {
  if (wizardBusy) return;
  if (wizardStep === 1) {
    const err = validateStep1();
    if (err.length) {
      alert('Complete los campos obligatorios:\n\n• ' + err.join('\n• '));
      return;
    }
    wizardBusy = true;
    try {
      await guardarBorradorSilencioso();
      wizardStep = 2;
      renderWizardStep();
      showWizardMsg('Información grabada correctamente.');
    } catch (e) { alert(e.message); }
    finally { wizardBusy = false; }
    return;
  }
  if (wizardStep === 2) {
    const err = validateStep2();
    if (err.length) {
      alert('Adjunte toda la documentación requerida:\n\n• ' + err.join('\n• '));
      return;
    }
    wizardBusy = true;
    try {
      await guardarBorradorSilencioso();
      wizardStep = 3;
      renderWizardStep();
      showWizardMsg('Documentación guardada correctamente.');
    } catch (e) { alert(e.message); }
    finally { wizardBusy = false; }
    return;
  }
  await enviarCotizacion();
}

function bindWizardControlsOnce() {
  document.getElementById('provCotAbrirWizard')?.addEventListener('click', openWizard);
  document.getElementById('provCotCerrarWizard')?.addEventListener('click', closeWizard);
  document.getElementById('provCotBtnAtras')?.addEventListener('click', () => {
    if (wizardStep > 1) { wizardStep -= 1; renderWizardStep(); }
  });
  document.getElementById('provCotBtnSiguiente')?.addEventListener('click', onWizardSiguiente);
}

export async function initMisCotizacionesView() {
  bindProveedorLogout();
  cleanupModalBackdrop();
  bindWizardControlsOnce();
  try {
    await loadCotizacionesList();
    await loadConvocatoriasSelect();
    if (sessionStorage.getItem('provCotAutoOpen')) {
      sessionStorage.removeItem('provCotAutoOpen');
      sessionStorage.removeItem('provCotSolId');
      setTimeout(() => openWizard(), 100);
    }
  } catch (err) {
    document.getElementById('provCotList').innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

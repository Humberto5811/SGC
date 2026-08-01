import { portalService } from '../../services/portalService.js';
import {
  esc, fmtDt, renderProveedorShell, requireProveedorSession, bindProveedorLogout,
  PROVEEDOR_ROUTES, cleanupModalBackdrop, getProveedorSession, renderCronogramaCard,
} from '../../utils/proveedorShared.js';
import { formatDateTimeLima } from '../../utils/dateTimeLima.js';
import { formatCronogramaDisplay } from '../../utils/cronogramaDatetime.js';
import { renderDocumentoLista, bindDocumentoActions, attachSolicitudId, documentoFuncionalLabel, FORMATOS_PERMITIDOS_AYUDA } from '../../utils/proveedorDocumentos.js';
import {
  buildPortalCotizacionPayload,
  assertPortalPayloadSafe,
  sanitizePortalAdjuntoMeta,
} from '../../utils/portalCotizacionPayload.js';
import {
  downloadAnexo05A, downloadAnexo05B, downloadAnexo06A, downloadAnexo06B, downloadAnexo11,
  triggerFileInput, money as moneyPdf,
} from '../../utils/proveedorPdfCotizacion.js';
import {
  getCotizacionConfig, normalizeTipoCotizacion,
} from '../../utils/proveedorCotizacionConfig.js';
import { renderStep1ByTipo, initEntregablesEco, resolveEntregablesFromWorkspace } from '../../utils/proveedorCotizacionSteps.js';
import { sumPrecioEntregables } from '../../utils/entregablesCotizacion.js';

const STEP_LABELS = ['Información técnica', 'Documentos técnicos', 'Resumen y envío'];

let workspace = null;
let wizardStep = 1;
let wizardBusy = false;
let isReadonly = false;
let formState = {
  items: [], precios: {}, entregablesEco: {}, extra: {},
  datos: {},
  adjuntos: { docs: {}, requisitos: {}, anexoTecnico: null, anexoEconomico: null },
};

function docKey(d, i) { return `doc-${i}-${d.documento || d.archivo || i}`; }
function reqKey(r, i) { return `req-${i}-${r.requisito || i}`; }

function getCotConfig() {
  return getCotizacionConfig(workspace?.solicitud?.tipo);
}

function cotizacionPresentada(ws) {
  return String(ws?.cotizacion_existente?.estado || '').toUpperCase() === 'COTIZACION_PRESENTADA';
}

function usesEntregablesEco(tipo) {
  const t = normalizeTipoCotizacion(tipo);
  return t === 'Locadores' || t === 'Servicios';
}

function getMontoTotal() {
  const tipo = normalizeTipoCotizacion(workspace?.solicitud?.tipo);
  if (usesEntregablesEco(tipo)) {
    return sumPrecioEntregables(Object.values(formState.entregablesEco || {}).flat());
  }
  return Object.values(formState.precios).reduce((a, p) => a + parseNum(p.total), 0);
}

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
  const prev = ws.cotizacion_existente?.propuesta_tecnica || {};
  const prevItems = prev.items || [];
  const prevEco = ws.cotizacion_existente?.propuesta_economica || {};
  const prevPrecios = prevEco.precios || {};
  const prevAnexos = ws.cotizacion_existente?.anexos || {};
  const tipo = normalizeTipoCotizacion(ws.solicitud?.tipo);

  formState.items = ws.items.map((it, idx) => {
    const saved = prevItems.find((p) => p.item_key === it.item_key) || prevItems[idx] || {};
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
    const saved = prevPrecios[it.item_key] || {};
    formState.precios[it.item_key] = {
      unitario: saved.unitario || 0,
      total: saved.total || 0,
    };
  });

  const prevEntregables = prevEco.entregables
    || prevEco.entregables_cotizados
    || prevPrecios;
  formState.entregablesEco = initEntregablesEco(
    ws.items,
    prevEntregables,
    tipo,
    ws,
  );
  // Fallback: cotizaciones Servicios antiguas guardaban precio por ítem (Anexo 06-B)
  if (usesEntregablesEco(tipo)) {
    const flat = Object.values(formState.entregablesEco || {}).flat();
    const hasPrice = flat.some((e) => Number(e.precio ?? e.precio_unitario ?? e.total ?? 0) > 0);
    if (!hasPrice) {
      ws.items.forEach((it) => {
        const p = prevPrecios[it.item_key];
        const v = Number(p?.total || p?.unitario || 0);
        if (!(v > 0)) return;
        const list = formState.entregablesEco[it.item_key] || [];
        if (list[0]) {
          list[0].precio = v;
          list[0].precio_unitario = v;
          list[0].total = v;
        }
      });
    }
  }
  const programados = resolveEntregablesFromWorkspace(ws);
  const ents0 = Object.values(formState.entregablesEco || {})[0] || programados;
  const savedPlazos = prevEco.plazos_entregables || prev.plazos_entregables || [];
  formState.extra = {
    plazo_ejecucion: prev.plazo_ejecucion || prevEco.plazo_ejecucion || '',
    forma_pago: prev.forma_pago || prevEco.forma_pago || '',
    plazos_entregables: (ents0.length ? ents0 : savedPlazos).map((e, i) => {
      if (typeof e === 'string') return savedPlazos[i] || e || '';
      return savedPlazos[i] || e.plazo_texto || '';
    }),
    firma_nombre: prevEco.firma_nombre || '',
    firma_dni: prevEco.firma_dni || '',
  };

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
    // Conservar base64 antiguo en memoria para migrar al primer guardado; el payload lo sanea.
    anexoTecnico: prevAnexos.anexo_tecnico_firmado || prevAnexos.anexo05a_firmado || null,
    anexoEconomico: prevAnexos.anexo_economico_firmado || prevAnexos.anexo05b_firmado || null,
  };
  (prevAnexos.docs_solicitados || []).forEach((a) => {
    if (a?.key) formState.adjuntos.docs[a.key] = a;
  });
  (prevAnexos.requisitos || []).forEach((a) => {
    if (a?.key) formState.adjuntos.requisitos[a.key] = a;
  });
  isReadonly = cotizacionPresentada(ws);
}

function updateStepperUI() {
  document.querySelectorAll('#provCotStepper .prov-wizard-step').forEach((el) => {
    const s = parseInt(el.dataset.step, 10);
    el.classList.toggle('active', s === wizardStep);
    el.classList.toggle('done', s < wizardStep);
  });
  document.getElementById('provCotBtnAtras')?.classList.toggle('d-none', wizardStep <= 1);
  const btn = document.getElementById('provCotBtnSiguiente');
  if (btn) {
    if (isReadonly) {
      btn.textContent = wizardStep >= 3 ? 'Cerrar' : 'Siguiente';
      btn.classList.toggle('btn-primary', wizardStep < 3);
      btn.classList.toggle('btn-secondary', wizardStep >= 3);
    } else {
      btn.textContent = wizardStep >= 3 ? 'Enviar cotización' : 'Guardar y continuar';
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-secondary');
    }
  }
}

function renderUploadSlot(label, fileMeta, inputId) {
  if (isReadonly) {
    return `
      <div class="prov-upload-row">
        <div class="small fw-semibold">${esc(label)}</div>
        ${fileMeta
    ? `<div class="small text-success"><i class="bi bi-paperclip"></i> Archivo cargado: ${esc(fileMeta.nombre || fileMeta.nombre_archivo || 'documento')}</div>`
    : '<div class="small text-muted">Sin archivo adjunto</div>'}
      </div>`;
  }
  return `
    <div class="prov-upload-row">
      <div class="small fw-semibold">${esc(label)}</div>
      ${fileMeta
    ? `<div class="small text-success"><i class="bi bi-paperclip"></i> Archivo cargado: ${esc(fileMeta.nombre || fileMeta.nombre_archivo || 'documento')}</div>`
    : '<div class="small text-muted">Sin archivo adjunto</div>'}
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
  const config = getCotConfig();
  const readonlyBanner = isReadonly
    ? '<div class="alert alert-secondary small py-2 mb-2"><i class="bi bi-lock"></i> Cotización enviada — modo solo lectura.</div>'
    : '';
  return readonlyBanner + renderStep1ByTipo({
    workspace,
    formState,
    config,
    readonly: isReadonly,
    renderDocsColumn,
    money,
    formatPriceDisplay,
  });
}

function renderStep2() {
  const config = getCotConfig();
  const docsSol = workspace.solicitud.docs_solicitados || [];
  const requisitos = workspace.solicitud.requisitos_tecnicos || [];

  const docsHtml = docsSol.length ? docsSol.map((d, i) => {
    const key = docKey(d, i);
    return renderUploadSlot(documentoFuncionalLabel(d), formState.adjuntos.docs[key], key);
  }).join('') : '<p class="small text-muted">No hay documentos solicitados en la convocatoria.</p>';

  const reqHtml = requisitos.length ? requisitos.map((r, i) => {
    const key = reqKey(r, i);
    const label = `${documentoFuncionalLabel({ documento: r.requisito, requisito: r.requisito })}${r.obligatorio !== false ? ' *' : ''}`;
    return renderUploadSlot(label, formState.adjuntos.requisitos[key], key);
  }).join('') : '<p class="small text-muted">No hay requisitos técnicos mínimos.</p>';

  const readonlyNote = isReadonly
    ? '<div class="alert alert-secondary small py-2 mb-2">Documentación enviada — no se puede modificar.</div>'
    : '';

  return `
    ${readonlyNote}
    <div class="alert alert-info small py-2 text-start">
      Descargue los documentos de la convocatoria, complételos, fírmelos y adjúntelos. También adjunte los ${esc(config.labelTecnica)} y ${esc(config.labelEconomica)} firmados del paso anterior.
      <div class="mt-1">${esc(FORMATOS_PERMITIDOS_AYUDA)}</div>
    </div>
    <div class="row g-3">
      <div class="col-lg-6">
        <div class="card h-100 border">
          <div class="card-header py-2 small fw-bold bg-light">Documentos solicitados al proveedor</div>
          <div class="card-body py-2">
            <p class="small text-muted mb-2">${esc(FORMATOS_PERMITIDOS_AYUDA)}</p>
            ${docsHtml}
          </div>
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
      <div class="card-header py-2 small fw-bold bg-light">Propuestas firmadas (${esc(config.labelTecnica)} y ${esc(config.labelEconomica)})</div>
      <div class="card-body py-2">
        <div class="row g-2">
          <div class="col-md-6">${renderUploadSlot(`${config.labelTecnica} firmado (propuesta técnica)`, formState.adjuntos.anexoTecnico, 'anexoTecnico')}</div>
          <div class="col-md-6">${renderUploadSlot(`${config.labelEconomica} firmado (propuesta económica)`, formState.adjuntos.anexoEconomico, 'anexoEconomico')}</div>
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
  if (formState.adjuntos.anexoTecnico) {
    list.push({ ...formState.adjuntos.anexoTecnico, key: 'anexoTecnico', tipo: `${getCotConfig().labelTecnica} firmado`, group: 'anexoTecnico' });
  }
  if (formState.adjuntos.anexoEconomico) {
    list.push({ ...formState.adjuntos.anexoEconomico, key: 'anexoEconomico', tipo: `${getCotConfig().labelEconomica} firmado`, group: 'anexoEconomico' });
  }
  return list;
}

function renderStep3() {
  const sol = workspace.solicitud;
  const total = getMontoTotal();
  const adjuntos = listAllAdjuntos();
  const config = getCotConfig();

  return `
    ${isReadonly ? '<div class="alert alert-secondary small py-2 mb-2"><i class="bi bi-lock"></i> Cotización enviada — modo solo lectura.</div>' : ''}
    <div class="row g-3">
      <div class="col-lg-7">
        <div class="card border h-100">
          <div class="card-header py-2 fw-bold">Resumen de la cotización</div>
          <div class="card-body small">
            <p><strong>${esc(sol.codigo)}</strong><br>${esc(sol.denominacion || sol.objeto || '')}</p>
            <p class="mb-1">Tipo: <strong>${esc(normalizeTipoCotizacion(sol.tipo))}</strong> · Formatos: ${esc(config.labelTecnica)} / ${esc(config.labelEconomica)}</p>
            <p class="mb-1">Ítems: <strong>${workspace.items.length}</strong></p>
            <p class="mb-3 fs-6">Monto total (IGV incl.): <strong>S/ ${money(total)}</strong></p>
            ${renderCronogramaCard(sol)}
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
                    ${!isReadonly ? `<button type="button" class="btn btn-sm prov-adj-del"
                      data-group="${esc(a.group)}" data-key="${esc(a.key)}">Eliminar</button>` : ''}
                  </li>`).join('')}
              </ul>` : '<div class="p-3 text-muted small">Sin archivos adjuntos.</div>'}
          </div>
        </div>
      </div>
    </div>
    ${isReadonly ? '' : `
    <div class="alert alert-warning small mt-3 mb-2">
      Revise la documentación. Si está conforme, presione <strong>Enviar cotización</strong>. El estado se reflejará en <em>Estado de Participación</em>.
    </div>
    <button type="button" class="btn btn-outline-secondary btn-sm" id="provCotEditDocs">Editar documentación adjunta</button>`}`;
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
  document.querySelectorAll('#provCotWizardBody .prov-extra').forEach((inp) => {
    const k = inp.dataset.k;
    if (k) formState.extra[k] = inp.value || '';
  });
  const plazos = [];
  document.querySelectorAll('#provCotWizardBody .prov-plazo-ent').forEach((inp) => {
    plazos[parseInt(inp.dataset.i, 10)] = inp.value || '';
  });
  if (plazos.length) formState.extra.plazos_entregables = plazos;
}

function recalcPrecios() {
  const tipo = normalizeTipoCotizacion(workspace?.solicitud?.tipo);
  if (usesEntregablesEco(tipo)) {
    document.querySelectorAll('#provCotWizardBody tr[data-eidx]').forEach((tr) => {
      const iidx = parseInt(tr.dataset.eidx, 10);
      const enidx = parseInt(tr.dataset.enidx, 10);
      const it = workspace.items[iidx];
      if (!it) return;
      const unit = parseNum(tr.querySelector('.prov-e-unit')?.value);
      const total = unit;
      if (!formState.entregablesEco[it.item_key]) formState.entregablesEco[it.item_key] = [];
      if (!formState.entregablesEco[it.item_key][enidx]) {
        formState.entregablesEco[it.item_key][enidx] = {
          nro: enidx + 1, numero: enidx + 1, um: 'Servicio',
        };
      }
      const prev = formState.entregablesEco[it.item_key][enidx];
      formState.entregablesEco[it.item_key][enidx] = {
        ...prev,
        precio: unit,
        precio_unitario: unit,
        total,
      };
      const totalEl = tr.querySelector('.prov-e-total');
      if (totalEl) totalEl.value = formatPriceDisplay(total);
    });
  } else {
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
  }
  const sum = getMontoTotal();
  const el = document.getElementById('provCotMontoTotal');
  if (el) el.textContent = money(sum);
}

function formatPriceInputsOnBlur() {
  document.querySelectorAll('#provCotWizardBody .prov-p-unit, #provCotWizardBody .prov-e-unit').forEach((inp) => {
    const v = parseNum(inp.value);
    inp.value = v > 0 ? formatPriceDisplay(v) : '';
  });
}

function validateStep1() {
  if (isReadonly) return [];
  collectStep1FromDom();
  recalcPrecios();
  const errors = [];
  const tipo = normalizeTipoCotizacion(workspace.solicitud?.tipo);
  const config = getCotConfig();

  if (tipo === 'Bienes') {
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
      if (!p?.unitario || p.unitario <= 0) errors.push(`Ítem ${idx + 1}: ingrese precio unitario en ${config.labelEconomica}`);
    });
    const datosReq = {
      razon_social: 'Razón Social', ruc: 'RUC', domicilio_fiscal: 'Dirección Fiscal',
      persona_contacto: 'Persona de contacto', celular: 'Celular', correo: 'Correo electrónico', rubro: 'Rubro',
      representante_legal: 'Representante Legal', validez_oferta: 'Validez de la oferta',
    };
    Object.entries(datosReq).forEach(([k, lbl]) => {
      if (!String(formState.datos[k] ?? '').trim()) errors.push(`${config.labelEconomica}: falta ${lbl}`);
    });
  } else if (tipo === 'Servicios' || tipo === 'Locadores') {
    if (!String(formState.extra.plazo_ejecucion || '').trim()) errors.push(`${config.labelTecnica}: falta plazo de ejecución`);
    if (!String(formState.extra.forma_pago || '').trim()) errors.push(`${config.labelTecnica}: falta forma de pago`);
    const datos06A = {
      razon_social: 'Razón Social', ruc: 'Nº R.U.C.', domicilio_fiscal: 'Domicilio fiscal',
      representante_legal: 'Datos del Representante Legal', persona_contacto: 'Persona de Contacto',
      celular: 'Teléfono y/o Celular', correo: 'Correo Electrónico',
    };
    Object.entries(datos06A).forEach(([k, lbl]) => {
      if (!String(formState.datos[k] ?? '').trim()) errors.push(`${config.labelTecnica}: falta ${lbl}`);
    });
    const ents = Object.values(formState.entregablesEco || {}).flat();
    if (!ents.length) {
      errors.push(`${config.labelEconomica}: no hay entregables programados en el TDR`);
    } else {
      ents.forEach((e, i) => {
        const precio = Number(e.precio ?? e.precio_unitario ?? e.total ?? 0);
        if (!(precio > 0)) errors.push(`${config.labelEconomica}: falta precio del entregable ${e.numero || i + 1}`);
      });
    }
  }
  return errors;
}

function validateStep2() {
  if (isReadonly) return [];
  const config = getCotConfig();
  const errors = [];
  (workspace.solicitud.docs_solicitados || []).forEach((d, i) => {
    const key = docKey(d, i);
    if (!formState.adjuntos.docs[key]) errors.push(`Falta adjuntar: ${documentoFuncionalLabel(d)}`);
  });
  (workspace.solicitud.requisitos_tecnicos || []).forEach((r, i) => {
    if (r.obligatorio === false) return;
    const key = reqKey(r, i);
    if (!formState.adjuntos.requisitos[key]) errors.push(`Falta adjuntar requisito: ${r.requisito}`);
  });
  if (!formState.adjuntos.anexoTecnico) errors.push(`Falta adjuntar ${config.labelTecnica} firmado`);
  if (!formState.adjuntos.anexoEconomico) errors.push(`Falta adjuntar ${config.labelEconomica} firmado`);
  return errors;
}

function bindWizardInteractions() {
  const body = document.getElementById('provCotWizardBody');
  if (!body || !workspace) return;
  bindDocumentoActions(body, workspace.solicitud.id);

  const dlPayload = () => {
    collectStep1FromDom();
    recalcPrecios();
    return {
      solicitud: workspace.solicitud,
      items: workspace.items,
      formItems: formState.items,
      precios: formState.precios,
      entregablesEco: formState.entregablesEco,
      extra: formState.extra,
      proveedor: getProveedorSession(),
      datos: formState.datos,
    };
  };

  document.getElementById('provBtnDlTecnica')?.addEventListener('click', () => {
    try {
      const p = dlPayload();
      const tipo = normalizeTipoCotizacion(workspace.solicitud?.tipo);
      if (tipo === 'Bienes') downloadAnexo05A(p);
      else downloadAnexo06A({ ...p, locador: tipo === 'Locadores' });
    } catch (e) { alert(e.message); }
  });

  document.getElementById('provBtnDlEconomica')?.addEventListener('click', () => {
    try {
      const p = dlPayload();
      const tipo = normalizeTipoCotizacion(workspace.solicitud?.tipo);
      if (tipo === 'Bienes') downloadAnexo05B(p);
      else downloadAnexo11(p);
    } catch (e) { alert(e.message); }
  });

  if (!isReadonly) {
    body.querySelectorAll('.prov-p-unit, .prov-e-unit').forEach((inp) => {
      inp.addEventListener('input', recalcPrecios);
      inp.addEventListener('blur', () => { recalcPrecios(); formatPriceInputsOnBlur(); });
    });

    body.querySelectorAll('.prov-upload-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        triggerFileInput('.pdf,.doc,.docx,image/*', async (fileMeta) => {
          try {
            showWizardMsg('Subiendo archivo…', 'info');
            // triggerFileInput ya entrega metadatos con base64 vía readUploadFile
            const uploaded = await uploadAdjuntoToPortal(target, fileMeta);
            if (target === 'anexoTecnico') formState.adjuntos.anexoTecnico = uploaded;
            else if (target === 'anexoEconomico') formState.adjuntos.anexoEconomico = uploaded;
            else if (target.startsWith('doc-')) formState.adjuntos.docs[target] = { ...uploaded, key: target };
            else if (target.startsWith('req-')) formState.adjuntos.requisitos[target] = { ...uploaded, key: target };
            renderWizardStep();
            showWizardMsg('Archivo cargado correctamente.', 'success');
          } catch (err) {
            alert(err.message || 'No se pudo subir el archivo');
          }
        });
      });
    });

    body.querySelectorAll('.prov-adj-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const { group, key } = btn.dataset;
        if (group === 'docs') delete formState.adjuntos.docs[key];
        else if (group === 'requisitos') delete formState.adjuntos.requisitos[key];
        else if (group === 'anexoTecnico') formState.adjuntos.anexoTecnico = null;
        else if (group === 'anexoEconomico') formState.adjuntos.anexoEconomico = null;
        renderWizardStep();
      });
    });
  }

  document.getElementById('provCotEditDocs')?.addEventListener('click', () => {
    if (isReadonly) return;
    wizardStep = 2;
    renderWizardStep();
  });

  if (wizardStep === 1) recalcPrecios();
}

function slotTipo(target) {
  if (target === 'anexoTecnico') return 'anexo_tecnico';
  if (target === 'anexoEconomico') return 'anexo_economico';
  if (String(target).startsWith('req-')) return 'requisitos';
  return 'docs_solicitados';
}

function hasEmbeddedBinary(meta) {
  if (!meta || typeof meta !== 'object') return false;
  return !!(meta.base64 || meta.contenido_base64 || (typeof meta.contenido === 'string' && meta.contenido.length > 100));
}

/** Sube un archivo al endpoint de adjuntos y deja solo metadatos en estado. */
async function uploadAdjuntoToPortal(target, fileMeta) {
  const solicitudId = workspace?.solicitud?.id;
  if (!solicitudId) throw new Error('Solicitud no disponible');
  const resp = await portalService.uploadCotizacionAdjunto(solicitudId, {
    key: target,
    slot_key: target,
    tipo: slotTipo(target),
    nombre_archivo: fileMeta.nombre || fileMeta.nombre_archivo || 'documento',
    mime_type: fileMeta.mime_type || 'application/octet-stream',
    contenido_base64: fileMeta.base64 || fileMeta.contenido_base64,
    tamaño_bytes: fileMeta.size || fileMeta.tamaño_bytes || 0,
  });
  const adj = resp?.adjunto || resp;
  return sanitizePortalAdjuntoMeta({
    id: adj.id || adj.adjunto_id,
    adjunto_id: adj.adjunto_id || adj.id,
    key: target,
    nombre: adj.nombre || adj.nombre_archivo || fileMeta.nombre,
    nombre_archivo: adj.nombre_archivo || fileMeta.nombre,
    mime_type: adj.mime_type || fileMeta.mime_type,
    size: adj.size || adj.tamaño_bytes || fileMeta.size,
    tamano: adj.tamaño_bytes || fileMeta.size,
    uploaded_at: adj.created_at || new Date().toISOString(),
  });
}

async function migrateEmbeddedAdjuntosIfNeeded() {
  const jobs = [];
  const enqueue = (target, getter, setter) => {
    const meta = getter();
    if (!meta || meta.adjunto_id || !hasEmbeddedBinary(meta)) return;
    jobs.push(async () => {
      const uploaded = await uploadAdjuntoToPortal(target, {
        nombre: meta.nombre || meta.nombre_archivo,
        mime_type: meta.mime_type,
        base64: meta.base64 || meta.contenido_base64,
        size: meta.size || meta.tamaño_bytes,
      });
      setter(uploaded);
    });
  };
  Object.entries(formState.adjuntos.docs || {}).forEach(([key, meta]) => {
    enqueue(key, () => meta, (u) => { formState.adjuntos.docs[key] = u; });
  });
  Object.entries(formState.adjuntos.requisitos || {}).forEach(([key, meta]) => {
    enqueue(key, () => meta, (u) => { formState.adjuntos.requisitos[key] = u; });
  });
  enqueue('anexoTecnico', () => formState.adjuntos.anexoTecnico, (u) => { formState.adjuntos.anexoTecnico = u; });
  enqueue('anexoEconomico', () => formState.adjuntos.anexoEconomico, (u) => { formState.adjuntos.anexoEconomico = u; });
  for (const job of jobs) await job();
}

function buildAnexosPayload() {
  const config = getCotConfig();
  return {
    docs_solicitados: Object.entries(formState.adjuntos.docs).map(([key, f]) => ({
      ...sanitizePortalAdjuntoMeta(f),
      key,
    })).filter(Boolean),
    requisitos: Object.entries(formState.adjuntos.requisitos).map(([key, f]) => ({
      ...sanitizePortalAdjuntoMeta(f),
      key,
    })).filter(Boolean),
    anexo_tecnico_firmado: sanitizePortalAdjuntoMeta(formState.adjuntos.anexoTecnico),
    anexo_economico_firmado: sanitizePortalAdjuntoMeta(formState.adjuntos.anexoEconomico),
    anexo05a_firmado: sanitizePortalAdjuntoMeta(formState.adjuntos.anexoTecnico),
    anexo05b_firmado: sanitizePortalAdjuntoMeta(formState.adjuntos.anexoEconomico),
    tipo_anexo_tecnico: config.propuestaTecnica,
    tipo_anexo_economico: config.propuestaEconomica,
    datos_proveedor: formState.datos,
  };
}

function buildPayload() {
  collectStep1FromDom();
  recalcPrecios();
  const monto = getMontoTotal();
  const tipo = normalizeTipoCotizacion(workspace.solicitud?.tipo);
  const propuestaTecnica = tipo === 'Bienes'
    ? { items: formState.items }
    : {
      plazo_ejecucion: formState.extra.plazo_ejecucion,
      forma_pago: formState.extra.forma_pago,
      items: workspace.items.map((it) => ({
        item_key: it.item_key,
        requerimiento_codigo: it.requerimiento_codigo,
        descripcion: it.descripcion,
        cantidad: it.cantidad ?? 1,
        unidad_medida: it.unidad_medida || 'UND',
      })),
    };

  let propuestaEconomica;
  if (tipo === 'Bienes') {
    propuestaEconomica = {
      precios: formState.precios,
      monto,
      precio_total: monto,
      moneda: 'PEN',
      datos_proveedor: formState.datos,
    };
  } else {
    const flat = Object.values(formState.entregablesEco || {}).flat();
    const entregables_cotizados = flat.map((e, i) => ({
      id_fuente: e.id_fuente ?? e.nro ?? e.numero ?? i + 1,
      numero: e.numero ?? e.nro ?? i + 1,
      tipo_origen: e.tipo_origen || (tipo === 'Servicios' ? 'SERVICIO' : 'LOCACION'),
      nombre: e.nombre || `Entregable ${i + 1}`,
      descripcion: e.descripcion || '',
      plazo_texto: (formState.extra.plazos_entregables || [])[i] || e.plazo_texto || '',
      cantidad: e.cantidad ?? 1,
      unidad_medida: e.unidad_medida || e.um || 'Servicio',
      precio: Number(e.precio ?? e.precio_unitario ?? e.total ?? 0) || 0,
    }));
    propuestaEconomica = {
      // Compatibilidad con borradores previos
      entregables: formState.entregablesEco,
      entregables_cotizados,
      precios: formState.precios,
      plazo_ejecucion: formState.extra.plazo_ejecucion,
      forma_pago: formState.extra.forma_pago,
      plazos_entregables: formState.extra.plazos_entregables,
      firma_nombre: formState.datos.representante_legal || formState.extra.firma_nombre || '',
      firma_dni: formState.extra.firma_dni || '',
      monto,
      precio_total: monto,
      moneda: 'PEN',
      datos_proveedor: formState.datos,
    };
  }
  return buildPortalCotizacionPayload({
    solicitud_id: workspace.solicitud.id,
    propuesta_tecnica: propuestaTecnica,
    propuesta_economica: propuestaEconomica,
    anexos: buildAnexosPayload(),
  });
}

async function guardarBorradorSilencioso() {
  await migrateEmbeddedAdjuntosIfNeeded();
  const payload = buildPayload();
  assertPortalPayloadSafe(payload);
  await portalService.guardarBorradorCotizacion(payload);
}

async function loadCotizacionesList() {
  const cont = document.getElementById('provCotList');
  if (!cont) return;
  const resp = await portalService.listMisCotizaciones();
  const rows = resp.data || [];
  if (!rows.length) {
    cont.innerHTML = '<div class="small text-muted mb-0">No tiene convocatorias disponibles para cotizar.</div>';
    return;
  }
  cont.innerHTML = `
    <table class="table table-sm table-bordered mb-0">
      <thead class="table-light"><tr>
        <th>Solicitud</th><th>N° Inv.</th><th>Estado</th><th>Plazo</th><th>Fecha invitación</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rows.map((c) => {
        const presentada = String(c.cotizacion_estado || c.estado || '').toUpperCase() === 'COTIZACION_PRESENTADA';
        const puede = c.convocatoria_cerrada === false || presentada;
        return `<tr>
          <td><strong>${esc(c.solicitud_codigo)}</strong> — ${esc(c.denominacion || c.objeto || '')}</td>
          <td class="text-center">${esc(c.nro_invitacion ?? '—')}</td>
          <td>${esc(c.estado_participacion || c.estado || '—')}</td>
          <td class="small">${esc(formatCronogramaDisplay(c.cotizaciones_fin))}</td>
          <td class="small">${esc(formatDateTimeLima(c.fecha_envio || c.fecha_presentacion))}</td>
          <td class="text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-primary prov-cot-ver" data-id="${c.solicitud_id}"
              ${puede ? '' : 'disabled title="Convocatoria cerrada"'}>
              ${presentada ? 'Ver' : (c.cotizacion_estado === 'BORRADOR' ? 'Ver / Editar' : 'Presentar cotización')}
            </button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  cont.querySelectorAll('.prov-cot-ver').forEach((btn) => {
    btn.addEventListener('click', () => openWizardFor(parseInt(btn.dataset.id, 10)));
  });
}

function readSolicitudIdFromHash() {
  try {
    const hash = String(window.location.hash || '');
    const qIdx = hash.indexOf('?');
    if (qIdx < 0) return null;
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    const sid = params.get('solicitud_id') || params.get('solicitudId');
    return sid ? String(sid) : null;
  } catch (_) {
    return null;
  }
}

function resolveTargetSolicitudId(rows = []) {
  const fromHash = readSolicitudIdFromHash();
  const fromSession = sessionStorage.getItem('provCotSolId');
  const target = fromHash || fromSession;
  if (!target) return null;
  if (rows.some((r) => String(r.solicitud_id) === String(target))) return String(target);
  return null;
}

async function loadConvocatoriasSelect() {
  const resp = await portalService.listMisCotizaciones();
  const rows = resp.data || [];
  const sel = document.getElementById('provCotSelSol');
  if (sel) {
    sel.innerHTML = rows.map((i) => {
      const label = i.estado_participacion ? ` [${i.estado_participacion}]` : '';
      return `<option value="${i.solicitud_id}">${esc(i.solicitud_codigo)} — ${esc(i.denominacion || i.objeto || '')}${esc(label)}</option>`;
    }).join('') || '<option value="">Sin convocatorias disponibles</option>';
    const saved = resolveTargetSolicitudId(rows);
    if (saved) sel.value = saved;
  }
  return rows;
}

async function openWizardFor(solicitudId) {
  const sel = document.getElementById('provCotSelSol');
  if (sel) sel.value = String(solicitudId);
  sessionStorage.setItem('provCotSolId', String(solicitudId));
  await openWizard();
}

async function openWizard() {
  const sid = parseInt(document.getElementById('provCotSelSol')?.value, 10);
  if (!sid) { alert('Seleccione una convocatoria abierta'); return; }
  try {
    const resp = await portalService.getCotizacionWorkspace(sid);
    if (resp.convocatoria_cerrada && !cotizacionPresentada(resp)) {
      alert('La convocatoria está cerrada');
      return;
    }
    workspace = resp;
    wizardStep = 1;
    initFormFromWorkspace(resp);
    setWizardMode(true);
    const modo = isReadonly ? ' (solo lectura)' : '';
    const invMeta = resp.invitacion_vigente;
    const nro = invMeta?.nro_invitacion ? ` · N° Inv. ${invMeta.nro_invitacion}` : '';
    const plazo = resp.solicitud?.cotizaciones_fin
      ? ` · Plazo hasta ${formatCronogramaDisplay(resp.solicitud.cotizaciones_fin)}`
      : '';
    document.getElementById('provCotWizardTitle').textContent =
      `Presentar cotización — ${resp.solicitud.codigo}${nro}${plazo}${modo}`;
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
    await migrateEmbeddedAdjuntosIfNeeded();
    const payload = buildPayload();
    assertPortalPayloadSafe(payload);
    await portalService.presentarCotizacion(payload);
    closeWizard();
    await loadCotizacionesList();
    alert('Cotización enviada correctamente. Consulte su estado en la pestaña Estado de Participación.');
  } catch (err) { alert(err.message); }
  finally { wizardBusy = false; }
}

async function onWizardSiguiente() {
  if (wizardBusy) return;
  if (isReadonly) {
    if (wizardStep < 3) {
      wizardStep += 1;
      renderWizardStep();
    } else {
      closeWizard();
    }
    return;
  }
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
    const rows = await loadConvocatoriasSelect();
    const auto = sessionStorage.getItem('provCotAutoOpen');
    const target = resolveTargetSolicitudId(rows);
    if (auto || target) {
      sessionStorage.removeItem('provCotAutoOpen');
      if (target) {
        sessionStorage.setItem('provCotSolId', target);
        setTimeout(() => openWizardFor(parseInt(target, 10)), 100);
      } else {
        sessionStorage.removeItem('provCotSolId');
      }
    }
  } catch (err) {
    document.getElementById('provCotList').innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

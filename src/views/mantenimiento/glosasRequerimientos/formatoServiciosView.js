// Glosa de Servicios — Formulario completo de configuración para el Formato de Servicios.
// Sigue la misma mecánica que el Formato Bienes pero con campos específicos de servicios.
import { authService } from '../../../services/authService.js';
import { glosasServiciosService } from '../../../services/glosasServiciosService.js';

let state = {
  id: null,
  caracteristicas_tecnicas: '',
  requisitos_proveedor: '',
  experiencia_monto: 0,
  experiencia_moneda: 'PEN',
  experiencia_anios: 15,
  req_rnp: true,
  req_ruc_activo: true,
  req_dj: true,
  req_cci: true,
  garantia: '',
  garantia_no_corresponde: false,
  seguro: 'Particular',
  seguridad_informacion: false,
  seguridad_documentos: '',
  clausula_anticorrupcion: true,
  clausula_confidencialidad: true,
  plazo_dias: 30,
  plazo_tipo: 'calendario',
  modalidad: 'Presencial',
  entregables: [
    { numero_entrega: 1, plazo: '30 días calendario', porcentaje: 100, condicion: 'Único entregable' }
  ],
  pago_tipo: 'Unico',
  pago_condiciones: '',
  penalidad_maxima: 10.00,
  estado: 'Activo',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

function totalPorcentajeEntregables() {
  return (state.entregables || []).reduce((s, e) => s + (Number(e.porcentaje) || 0), 0);
}

function renderFormatoServiciosView() {
  return `
    <div class="dashboard-container">
      <div class="welcome-banner">
        <div class="welcome-banner-content">
          <h2><i class="bi bi-tools"></i> Glosa de Servicios</h2>
          <p>Configuración de la plantilla de especificaciones técnicas para servicios.</p>
        </div>
      </div>
      <div id="servGlosaMsg"></div>
      <div class="card mb-3">
        <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
          <span><i class="bi bi-file-text"></i> Formulario — Glosa de Servicios</span>
          <div>
            <button id="servGlosaSave" class="btn btn-sm btn-light me-1"><i class="bi bi-save"></i> Guardar</button>
            <button id="servGlosaReload" class="btn btn-sm btn-outline-light"><i class="bi bi-arrow-clockwise"></i> Recargar</button>
          </div>
        </div>
        <div class="card-body">
          <form id="servGlosaForm" onsubmit="return false;">
            ${renderSeccionCaracteristicas()}
            <hr/>
            ${renderSeccionRequisitosProveedor()}
            <hr/>
            ${renderSeccionExperiencia()}
            <hr/>
            ${renderSeccionRequisitosAdicionales()}
            <hr/>
            ${renderSeccionGarantia()}
            <hr/>
            ${renderSeccionSeguro()}
            <hr/>
            ${renderSeccionSeguridad()}
            <hr/>
            ${renderSeccionClausulas()}
            <hr/>
            ${renderSeccionPlazoModalidad()}
            <hr/>
            ${renderSeccionEntregables()}
            <hr/>
            ${renderSeccionPago()}
            <hr/>
            ${renderSeccionPenalidad()}
          </form>
        </div>
      </div>
    </div>
  `;
}

function renderSeccionCaracteristicas() {
  return `
    <h5 class="fw-bold text-primary"><i class="bi bi-chat-dots"></i> CARACTERÍSTICAS TÉCNICAS DEL SERVICIO</h5>
    <p class="text-muted small">Indicar el detalle de las actividades a desarrollar.</p>
    <textarea id="fld_caracteristicas_tecnicas" class="form-control" rows="4"
      placeholder="Describa las características técnicas del servicio…">${esc(state.caracteristicas_tecnicas)}</textarea>
  `;
}

function renderSeccionRequisitosProveedor() {
  return `
    <h5 class="fw-bold text-primary"><i class="bi bi-person-check"></i> REQUISITOS DEL PROVEEDOR</h5>
    <p class="text-muted small">Precisar las características o condiciones mínimas que debe cumplir el proveedor.</p>
    <textarea id="fld_requisitos_proveedor" class="form-control" rows="3"
      placeholder="Describa los requisitos del proveedor…">${esc(state.requisitos_proveedor)}</textarea>
  `;
}

function renderSeccionExperiencia() {
  return `
    <h5 class="fw-bold text-primary"><i class="bi bi-clock-history"></i> EXPERIENCIA DEL PROVEEDOR</h5>
    <div class="row g-3">
      <div class="col-md-4">
        <label class="form-label fw-bold">Monto facturado acumulado</label>
        <div class="input-group">
          <input type="number" id="fld_experiencia_monto" class="form-control" min="0" step="0.01" value="${state.experiencia_monto}" />
          <select id="fld_experiencia_moneda" class="form-select" style="max-width: 100px;">
            <option value="PEN" ${state.experiencia_moneda === 'PEN' ? 'selected' : ''}>S/.</option>
            <option value="USD" ${state.experiencia_moneda === 'USD' ? 'selected' : ''}>USD</option>
          </select>
        </div>
      </div>
      <div class="col-md-4">
        <label class="form-label fw-bold">Años de experiencia</label>
        <input type="number" id="fld_experiencia_anios" class="form-control" min="0" max="15" value="${state.experiencia_anios}" />
        <small class="text-muted">Máximo 15 años.</small>
      </div>
    </div>
  `;
}

function renderSeccionRequisitosAdicionales() {
  const reqs = [
    { key: 'req_rnp', label: 'Registro Nacional de Proveedores (RNP), vigente' },
    { key: 'req_ruc_activo', label: 'Consulta RUC, activo' },
    { key: 'req_dj', label: 'Declaración Jurada de no estar inhabilitado' },
    { key: 'req_cci', label: 'Formato CCI enlazado al RUC' },
  ];
  const checks = reqs.map((r) => `
    <div class="form-check form-switch">
      <input class="form-check-input" type="checkbox" id="fld_${r.key}" ${state[r.key] ? 'checked' : ''} />
      <label class="form-check-label" for="fld_${r.key}">${r.label}</label>
    </div>
  `).join('');
  return `
    <h5 class="fw-bold text-primary"><i class="bi bi-list-check"></i> REQUISITOS ADICIONALES PARA LA CONTRATACIÓN</h5>
    ${checks}
  `;
}

function renderSeccionGarantia() {
  return `
    <h5 class="fw-bold text-primary"><i class="bi bi-shield-check"></i> GARANTÍA</h5>
    <div class="form-check mb-2">
      <input class="form-check-input" type="checkbox" id="fld_garantia_no_corresponde" ${state.garantia_no_corresponde ? 'checked' : ''} />
      <label class="form-check-label" for="fld_garantia_no_corresponde">No corresponde</label>
    </div>
    <textarea id="fld_garantia" class="form-control" rows="2"
      placeholder="Detalle la garantía del servicio…" ${state.garantia_no_corresponde ? 'disabled' : ''}>${esc(state.garantia)}</textarea>
  `;
}

function renderSeccionSeguro() {
  const opciones = ['Particular', 'SCTR', 'ESSALUD', 'SIS'];
  const opts = opciones.map((o) => `<option value="${o}" ${state.seguro === o ? 'selected' : ''}>${o}</option>`).join('');
  return `
    <h5 class="fw-bold text-primary"><i class="bi bi-shield-plus"></i> SEGURO</h5>
    <div class="row">
      <div class="col-md-4">
        <select id="fld_seguro" class="form-select">
          ${opts}
        </select>
        <small class="text-muted">Seguro contra accidentes personales o SCTR (pensión, salud) o ESSALUD ó SIS.</small>
      </div>
    </div>
  `;
}

function renderSeccionSeguridad() {
  return `
    <h5 class="fw-bold text-primary"><i class="bi bi-lock"></i> SEGURIDAD DE LA INFORMACIÓN</h5>
    <div class="form-check form-switch mb-2">
      <input class="form-check-input" type="checkbox" id="fld_seguridad_informacion" ${state.seguridad_informacion ? 'checked' : ''} />
      <label class="form-check-label" for="fld_seguridad_informacion">Aplica lineamientos de Seguridad de la Información</label>
    </div>
    <div id="seguridadDocsSection" style="${state.seguridad_informacion ? '' : 'display:none;'}">
      <textarea id="fld_seguridad_documentos" class="form-control" rows="2"
        placeholder="Documentación requerida (Compromiso de confidencialidad, Constancia de recepción…)">${esc(state.seguridad_documentos)}</textarea>
      <small class="text-muted">Compromiso de confidencialidad y no divulgación. Constancia de recepción de lineamiento de seguridad.</small>
    </div>
  `;
}

function renderSeccionClausulas() {
  return `
    <h5 class="fw-bold text-primary"><i class="bi bi-file-earmark-check"></i> CLÁUSULAS</h5>
    <div class="card mb-2 bg-light">
      <div class="card-body py-2">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="fld_clausula_anticorrupcion" ${state.clausula_anticorrupcion ? 'checked' : ''} />
          <label class="form-check-label" for="fld_clausula_anticorrupcion">
            <strong>Cláusula Anticorrupción y Antisoborno</strong> — El contratista declara no haber ofrecido ningún beneficio ilegal.
          </label>
        </div>
      </div>
    </div>
    <div class="card mb-2 bg-light">
      <div class="card-body py-2">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="fld_clausula_confidencialidad" ${state.clausula_confidencialidad ? 'checked' : ''} />
          <label class="form-check-label" for="fld_clausula_confidencialidad">
            <strong>Cláusula de Confidencialidad y Propiedad Intelectual</strong> — El contratista se compromete a mantener en reserva la información.
          </label>
        </div>
      </div>
    </div>
    <p class="text-muted small mb-0"><i class="bi bi-info-circle"></i> Estas cláusulas son de aceptación obligatoria para el proveedor.</p>
  `;
}

function renderSeccionPlazoModalidad() {
  const modOpts = ['Presencial', 'Híbrido', 'Remoto'].map((m) =>
    `<option value="${m}" ${state.modalidad === m ? 'selected' : ''}>${m}</option>`).join('');
  return `
    <h5 class="fw-bold text-primary"><i class="bi bi-calendar-event"></i> PLAZO Y MODALIDAD DEL SERVICIO</h5>
    <div class="row g-3">
      <div class="col-md-3">
        <label class="form-label fw-bold">Plazo (días)</label>
        <input type="number" id="fld_plazo_dias" class="form-control" min="0" value="${state.plazo_dias}" />
      </div>
      <div class="col-md-3">
        <label class="form-label fw-bold">Tipo de plazo</label>
        <select id="fld_plazo_tipo" class="form-select">
          <option value="calendario" ${state.plazo_tipo === 'calendario' ? 'selected' : ''}>Calendario</option>
          <option value="habiles" ${state.plazo_tipo === 'habiles' ? 'selected' : ''}>Hábiles</option>
        </select>
      </div>
      <div class="col-md-4">
        <label class="form-label fw-bold">Modalidad de ejecución</label>
        <select id="fld_modalidad" class="form-select">
          ${modOpts}
        </select>
      </div>
    </div>
  `;
}

function renderSeccionEntregables() {
  const rows = (state.entregables || []).map((e, i) => `
    <tr>
      <td class="text-center align-middle">${i + 1}</td>
      <td><input class="form-control form-control-sm ent-plazo" data-i="${i}" type="text" value="${esc(e.plazo || '')}" placeholder="Ej: 30 días calendario" /></td>
      <td><input class="form-control form-control-sm ent-porcentaje" data-i="${i}" type="number" min="0" max="100" step="0.01" value="${e.porcentaje ?? 0}" /></td>
      <td><input class="form-control form-control-sm ent-condicion" data-i="${i}" type="text" value="${esc(e.condicion || '')}" placeholder="Condición…" /></td>
      <td class="text-center align-middle">
        <button type="button" class="btn btn-sm btn-outline-danger ent-del" data-i="${i}" ${(state.entregables || []).length <= 1 ? 'disabled' : ''} title="Eliminar">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
  const total = totalPorcentajeEntregables();
  const totalOk = Math.abs(total - 100) < 0.01;
  return `
    <h5 class="fw-bold text-primary"><i class="bi bi-list-columns"></i> ENTREGABLES</h5>
    <p class="text-muted small">Detalle los entregables del servicio con su plazo y porcentaje. La suma de porcentajes debe ser 100%.</p>
    <div class="table-responsive">
      <table class="table table-bordered align-middle mb-2">
        <thead class="table-light">
          <tr>
            <th style="width: 60px;" class="text-center">N°</th>
            <th>Plazo de Entrega</th>
            <th style="width: 130px;">Porcentaje (%)</th>
            <th>Condición de entrega</th>
            <th style="width: 60px;" class="text-center">Acción</th>
          </tr>
        </thead>
        <tbody id="entBody">
          ${rows || '<tr><td colspan="5" class="text-center text-muted">No hay entregables registrados.</td></tr>'}
        </tbody>
        <tfoot>
          <tr class="table-secondary fw-bold">
            <td colspan="2" class="text-end">TOTAL</td>
            <td id="entTotalPorcentaje" class="${totalOk ? '' : 'text-danger'}">${total.toFixed(2)}%</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <button type="button" id="entAddBtn" class="btn btn-sm btn-outline-primary"><i class="bi bi-plus-lg"></i> Agregar entregable</button>
    ${totalOk ? '' : '<div class="text-danger small mt-1"><i class="bi bi-exclamation-circle"></i> La suma de porcentajes debe ser 100%.</div>'}
  `;
}

function renderSeccionPago() {
  const tipos = ['Unico', 'Periódico'].map((t) =>
    `<option value="${t}" ${state.pago_tipo === t ? 'selected' : ''}>${t}</option>`).join('');
  return `
    <h5 class="fw-bold text-primary"><i class="bi bi-cash-coin"></i> MODALIDAD Y CONDICIONES DE PAGO</h5>
    <div class="row g-3 mb-2">
      <div class="col-md-3">
        <label class="form-label fw-bold">Tipo de pago</label>
        <select id="fld_pago_tipo" class="form-select">
          ${tipos}
        </select>
      </div>
    </div>
    <label class="form-label fw-bold">Condiciones de pago</label>
    <textarea id="fld_pago_condiciones" class="form-control" rows="3"
      placeholder="Detalle las condiciones de pago…">${esc(state.pago_condiciones)}</textarea>
    <div class="mt-2">
      <small class="text-muted d-block"><strong>Documentación obligatoria para el pago:</strong></small>
      <small class="text-muted d-block">• Carta de presentación del entregable.</small>
      <small class="text-muted d-block">• Informe de actividades.</small>
      <small class="text-muted d-block">• Comprobante de pago.</small>
      <small class="text-muted d-block">• Formato CCI enlazado al RUC.</small>
      <small class="text-muted d-block">• Seguro particular, SCTR, ESSALUD o SIS (de corresponder).</small>
    </div>
  `;
}

function renderSeccionPenalidad() {
  return `
    <h5 class="fw-bold text-primary"><i class="bi bi-exclamation-triangle"></i> PENALIDAD</h5>
    <div class="row g-3">
      <div class="col-md-3">
        <label class="form-label fw-bold">Penalidad máxima (%)</label>
        <input type="number" id="fld_penalidad_maxima" class="form-control" min="0" max="10" step="0.01" value="${state.penalidad_maxima}" />
        <small class="text-muted">Máximo 10% del monto de la contratación.</small>
      </div>
    </div>
    <div class="mt-2 p-2 bg-light rounded small">
      <p class="mb-1"><strong>Fórmula:</strong> Penalidad diaria = 0.10 × Monto / (0.40 × Plazo en días del entregable)</p>
      <p class="mb-0 text-muted">Una vez que se llega al monto máximo de penalidad por mora, se puede resolver el contrato.</p>
    </div>
  `;
}

// =========================================================================
// COLECTAR DATOS DEL FORMULARIO
// =========================================================================
function collectData() {
  const g = (id) => (document.getElementById(id) || {}).value;
  const c = (id) => !!(document.getElementById(id) || {}).checked;

  state.caracteristicas_tecnicas = g('fld_caracteristicas_tecnicas') || '';
  state.requisitos_proveedor = g('fld_requisitos_proveedor') || '';
  state.experiencia_monto = parseFloat(g('fld_experiencia_monto')) || 0;
  state.experiencia_moneda = g('fld_experiencia_moneda') || 'PEN';
  state.experiencia_anios = parseInt(g('fld_experiencia_anios'), 10) || 0;
  state.req_rnp = c('fld_req_rnp');
  state.req_ruc_activo = c('fld_req_ruc_activo');
  state.req_dj = c('fld_req_dj');
  state.req_cci = c('fld_req_cci');
  state.garantia = g('fld_garantia') || '';
  state.garantia_no_corresponde = c('fld_garantia_no_corresponde');
  state.seguro = g('fld_seguro') || 'Particular';
  state.seguridad_informacion = c('fld_seguridad_informacion');
  state.seguridad_documentos = g('fld_seguridad_documentos') || '';
  state.clausula_anticorrupcion = c('fld_clausula_anticorrupcion');
  state.clausula_confidencialidad = c('fld_clausula_confidencialidad');
  state.plazo_dias = parseInt(g('fld_plazo_dias'), 10) || 0;
  state.plazo_tipo = g('fld_plazo_tipo') || 'calendario';
  state.modalidad = g('fld_modalidad') || 'Presencial';
  state.pago_tipo = g('fld_pago_tipo') || 'Unico';
  state.pago_condiciones = g('fld_pago_condiciones') || '';
  state.penalidad_maxima = parseFloat(g('fld_penalidad_maxima')) || 0;

  // Colectar entregables desde el DOM
  document.querySelectorAll('.ent-plazo').forEach((el) => {
    const i = Number(el.dataset.i);
    if (!state.entregables[i]) state.entregables[i] = {};
    state.entregables[i].plazo = el.value;
    state.entregables[i].numero_entrega = i + 1;
  });
  document.querySelectorAll('.ent-porcentaje').forEach((el) => {
    const i = Number(el.dataset.i);
    if (!state.entregables[i]) state.entregables[i] = {};
    state.entregables[i].porcentaje = parseFloat(el.value) || 0;
  });
  document.querySelectorAll('.ent-condicion').forEach((el) => {
    const i = Number(el.dataset.i);
    if (!state.entregables[i]) state.entregables[i] = {};
    state.entregables[i].condicion = el.value;
  });
}

// =========================================================================
// GUARDAR
// =========================================================================
function setMsg(type, text) {
  const el = document.getElementById('servGlosaMsg');
  if (!el) return;
  if (!type || !text) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${esc(text)}
    <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button></div>`;
}

async function guardarGlosa() {
  collectData();

  // Validar entregables
  const total = totalPorcentajeEntregables();
  if (Math.abs(total - 100) > 0.01) {
    setMsg('danger', 'La suma de porcentajes de los entregables debe ser exactamente 100%. Actual: ' + total.toFixed(2) + '%');
    return;
  }

  if (!state.caracteristicas_tecnicas.trim()) {
    setMsg('danger', 'El campo "Características técnicas del servicio" es obligatorio.');
    return;
  }

  setMsg('info', 'Guardando…');
  try {
    const user = authService.getCurrentUser();
    const body = {
      ...state,
      usuario_modificacion: (user && (user.dni || user.nombre)) || 'sistema',
    };
    delete body.id; // No enviar ID en actualización

    if (state.id) {
      await glosasServiciosService.update(state.id, body);
    } else {
      const created = await glosasServiciosService.create(body);
      if (created && created.id) state.id = created.id;
    }
    setMsg('success', 'Glosa de servicios guardada correctamente.');
  } catch (e) {
    setMsg('danger', 'Error al guardar: ' + e.message);
  }
}

// =========================================================================
// CARGA INICIAL
// =========================================================================
async function cargarGlosa() {
  try {
    const resp = await glosasServiciosService.getAll();
    const rows = (resp && resp.data) || [];
    if (rows.length) {
      const item = rows[0];
      state.id = item.id;
      // Mapear campos desde la DB
      Object.keys(state).forEach((k) => {
        if (k === 'id') return;
        if (item[k] !== undefined && item[k] !== null) {
          if (k === 'entregables' && typeof item[k] === 'string') {
            try { state.entregables = JSON.parse(item[k]); } catch (_) { state.entregables = []; }
          } else if (k === 'entregables' && Array.isArray(item[k])) {
            state.entregables = item[k];
          } else {
            state[k] = item[k];
          }
        }
      });
    }
    // Re-render
    const host = document.getElementById('servGlosaForm');
    if (host) {
      // En lugar de re-renderizar todo, actualizamos los valores en los campos existentes
      // (llamado desde init)
    }
  } catch (e) {
    setMsg('danger', 'Error al cargar la glosa: ' + e.message);
  }
}

function attachEvents() {
  // Guardar
  const saveBtn = document.getElementById('servGlosaSave');
  if (saveBtn) saveBtn.onclick = guardarGlosa;

  // Recargar
  const reloadBtn = document.getElementById('servGlosaReload');
  if (reloadBtn) reloadBtn.onclick = () => {
    cargarGlosa().then(() => {
      // Re-renderizar
      const cont = document.querySelector('.card-body');
      if (cont) {
        cont.innerHTML = document.getElementById('servGlosaForm').innerHTML;
        // Volver a asignar eventos
        attachEvents();
        fillForm();
      }
    });
  };

  // Garantía "No corresponde"
  const noCorresponde = document.getElementById('fld_garantia_no_corresponde');
  const garantiaField = document.getElementById('fld_garantia');
  if (noCorresponde && garantiaField) {
    noCorresponde.onchange = () => {
      garantiaField.disabled = noCorresponde.checked;
      if (noCorresponde.checked) garantiaField.value = '';
    };
  }

  // Seguridad información toggle
  const segInfo = document.getElementById('fld_seguridad_informacion');
  const segDocs = document.getElementById('seguridadDocsSection');
  if (segInfo && segDocs) {
    segInfo.onchange = () => {
      segDocs.style.display = segInfo.checked ? '' : 'none';
    };
  }

  // Entregables: agregar
  const addBtn = document.getElementById('entAddBtn');
  if (addBtn) {
    addBtn.onclick = () => {
      collectData();
      if ((state.entregables || []).length >= 12) {
        setMsg('warning', 'Máximo 12 entregables.');
        return;
      }
      state.entregables.push({
        numero_entrega: state.entregables.length + 1,
        plazo: '',
        porcentaje: 0,
        condicion: '',
      });
      reRenderEntregables();
    };
  }

  // Entregables: eliminar
  document.querySelectorAll('.ent-del').forEach((b) => {
    b.onclick = () => {
      if ((state.entregables || []).length <= 1) return;
      collectData();
      state.entregables.splice(Number(b.dataset.i), 1);
      // Renumerar
      state.entregables.forEach((e, i) => { e.numero_entrega = i + 1; });
      reRenderEntregables();
    };
  });

  // Entregables: cambios en inputs
  document.querySelectorAll('.ent-plazo, .ent-porcentaje, .ent-condicion').forEach((el) => {
    el.oninput = () => {
      collectData();
      actualizarTotalEntregables();
    };
  });
}

function reRenderEntregables() {
  // Reemplazar solo la sección de entregables
  const section = renderSeccionEntregables();
  // Encontrar el contenedor de entregables (el hr + h5 anterior)
  const entregablesHr = document.querySelector('#servGlosaForm hr:nth-of-type(8)');
  if (entregablesHr) {
    // Reemplazar desde el hr hasta el siguiente hr (seccion pago)
    let current = entregablesHr.nextElementSibling;
    const nodesToRemove = [];
    while (current && current.tagName !== 'HR') {
      nodesToRemove.push(current);
      current = current.nextElementSibling;
    }
    nodesToRemove.forEach((n) => n.remove());
    // Insertar nueva sección
    const temp = document.createElement('div');
    temp.innerHTML = section;
    entregablesHr.parentNode.insertBefore(temp.firstElementChild, current || null);
  }
  // Re-asignar eventos de entregables
  attachEntregablesEvents();
  actualizarTotalEntregables();
}

function attachEntregablesEvents() {
  document.querySelectorAll('.ent-del').forEach((b) => {
    b.onclick = () => {
      if ((state.entregables || []).length <= 1) return;
      collectData();
      state.entregables.splice(Number(b.dataset.i), 1);
      state.entregables.forEach((e, i) => { e.numero_entrega = i + 1; });
      reRenderEntregables();
    };
  });
  document.querySelectorAll('.ent-plazo, .ent-porcentaje, .ent-condicion').forEach((el) => {
    el.oninput = () => {
      collectData();
      actualizarTotalEntregables();
    };
  });

  const addBtn = document.getElementById('entAddBtn');
  if (addBtn) {
    addBtn.onclick = () => {
      collectData();
      if ((state.entregables || []).length >= 12) return;
      state.entregables.push({
        numero_entrega: state.entregables.length + 1,
        plazo: '',
        porcentaje: 0,
        condicion: '',
      });
      reRenderEntregables();
    };
  }
}

function actualizarTotalEntregables() {
  const total = totalPorcentajeEntregables();
  const el = document.getElementById('entTotalPorcentaje');
  if (el) {
    el.textContent = total.toFixed(2) + '%';
    const ok = Math.abs(total - 100) < 0.01;
    el.className = ok ? '' : 'text-danger';
  }
}

function fillForm() {
  // Llenar campos con los valores del state
  for (const key of Object.keys(state)) {
    if (key === 'id' || key === 'entregables') continue;
    const el = document.getElementById(`fld_${key}`);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!state[key];
    else el.value = state[key] == null ? '' : state[key];
  }

  // Garantía toggle
  const noCorresponde = document.getElementById('fld_garantia_no_corresponde');
  const garantiaField = document.getElementById('fld_garantia');
  if (noCorresponde && garantiaField) {
    garantiaField.disabled = noCorresponde.checked;
  }

  // Seguridad toggle
  const segInfo = document.getElementById('fld_seguridad_informacion');
  const segDocs = document.getElementById('seguridadDocsSection');
  if (segInfo && segDocs) {
    segDocs.style.display = segInfo.checked ? '' : 'none';
  }
}

function initFormatoServiciosView() {
  // Reset state
  state = {
    id: null,
    caracteristicas_tecnicas: '',
    requisitos_proveedor: '',
    experiencia_monto: 0,
    experiencia_moneda: 'PEN',
    experiencia_anios: 15,
    req_rnp: true,
    req_ruc_activo: true,
    req_dj: true,
    req_cci: true,
    garantia: '',
    garantia_no_corresponde: false,
    seguro: 'Particular',
    seguridad_informacion: false,
    seguridad_documentos: '',
    clausula_anticorrupcion: true,
    clausula_confidencialidad: true,
    plazo_dias: 30,
    plazo_tipo: 'calendario',
    modalidad: 'Presencial',
    entregables: [
      { numero_entrega: 1, plazo: '30 días calendario', porcentaje: 100, condicion: 'Único entregable' }
    ],
    pago_tipo: 'Unico',
    pago_condiciones: '',
    penalidad_maxima: 10.00,
    estado: 'Activo',
  };

  cargarGlosa().then(() => {
    attachEvents();
    fillForm();
  });
}

export { renderFormatoServiciosView, initFormatoServiciosView };
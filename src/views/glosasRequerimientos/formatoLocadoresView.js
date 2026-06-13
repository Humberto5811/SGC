// Formato Locadores — documento estructurado según GLOSA TDR LOCADOR V2.docx
// Incluye: desplegables (formación académica, carrera, modalidad), radio buttons
// (habilitación, SERUM), tabla dinámica de entregables, y campos editables.
import { authService } from '../../services/authService.js';
import { glosasLocadoresService } from '../../services/glosasLocadoresService.js';
import { MODELO_LOCADORES } from './formatoLocadoresModelo.js';
import { escapeHtml as esc } from '../../utils/escapeHtml.js';
import { api } from '../../services/apiService.js';

const DOC_TITULO = '__FORMATO_LOCADORES_DOC__';

let state = {
  docId: null,
  overrides: {},
  entregas: [],
  plazos: [],
  perfil: {
    formacion_academica: 'Profesional',
    titulo_profesional: '',
    habilitacion: '',
    serum: '',
    otros: '',
  },
  modalidad: 'Presencial',
  editing: false,
  carrerasLista: [],
};

function tituloDe(item) {
  const o = state.overrides[item.key];
  return o && o.titulo != null && o.titulo !== '' ? o.titulo : (item.titulo || '');
}

function contenidoDe(item) {
  const o = state.overrides[item.key];
  if (o && o.contenido != null && o.contenido !== '') return o.contenido;
  return item.default || '';
}

function prefijo(item) {
  if (item.label) return `${item.label}. `;
  return '';
}

// ---------- Render ----------
function buildView() {
  return `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-person-badge"></i> Formato Locadores</h3>
          <p class="text-muted mb-0">Glosas de Requerimientos — Términos de Referencia para Locación de Servicios</p>
        </div>
        <div class="btn-group">
          <button id="flEdit" class="btn btn-primary"><i class="bi bi-pencil-square"></i> Editar</button>
          <button id="flSave" class="btn btn-success" disabled><i class="bi bi-save"></i> Grabar</button>
        </div>
      </div>
      <div id="flMsg"></div>
      <div id="flBody"></div>
    </div>
  `;
}

function tituloHtml(item) {
  const pre = prefijo(item);
  const borde = item.kind === 'heading' ? ' border-bottom pb-1' : '';
  if (state.editing) {
    return `
      <div class="d-flex align-items-center gap-2 mb-1${borde}">
        ${pre ? `<span class="fw-bold text-nowrap">${esc(pre.trim())}</span>` : ''}
        <input class="form-control form-control-sm fw-bold fl-title" data-titlekey="${item.key}" type="text" value="${esc(tituloDe(item))}" />
      </div>`;
  }
  return `<div class="fw-bold mb-1${borde}">${esc(pre)}${esc(tituloDe(item))}</div>`;
}

function renderSection(item) {
  if (item.kind === 'firmas') return renderFirmas();
  if (item.kind === 'tabla_entregas') return renderTablaEntregas(item);
  if (item.kind === 'tabla_plazos') return renderTablaPlazos(item);
  if (item.kind === 'perfil_academico') return renderPerfilAcademico(item);
  if (item.kind === 'select_modalidad') return renderModalidad(item);

  const titulo = tituloHtml(item);
  if (item.kind === 'heading') {
    return `<div class="mt-4 mb-2">${titulo}</div>`;
  }

  const ro = state.editing ? '' : 'disabled';
  const val = contenidoDe(item);
  const helper = item.helper ? `<div class="form-text fst-italic text-secondary mb-1">${esc(item.helper)}</div>` : '';
  const field = item.type === 'text'
    ? `<input ${ro} class="form-control" data-key="${item.key}" type="text" value="${esc(val)}" />`
    : `<textarea ${ro} class="form-control" data-key="${item.key}" rows="3">${esc(val)}</textarea>`;
  return `
    <div class="mb-3 mt-3">
      ${titulo}
      ${helper}
      ${field}
    </div>
  `;
}

// ========== 5.1 PERFIL ACADÉMICO ==========
function renderPerfilAcademico(item) {
  const ro = state.editing ? '' : 'disabled';
  const p = state.perfil;
  const formacionOpts = ['Profesional', 'Técnico', 'Egresado', 'Secundaria'];
  const carrerasOpts = state.carrerasLista;

  return `
    <div class="mb-3 mt-3">
      ${tituloHtml(item)}
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-0">
          <tbody>
            <tr>
              <td class="fw-bold" style="width:200px;">Formación académica</td>
              <td colspan="3">
                <select ${ro} class="form-select form-select-sm fl-perfil" data-field="formacion_academica">
                  ${formacionOpts.map(o => `<option value="${esc(o)}" ${p.formacion_academica === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
                </select>
              </td>
            </tr>
            <tr>
              <td class="fw-bold">Título profesional</td>
              <td colspan="3">
                <select ${ro} class="form-select form-select-sm fl-perfil" data-field="titulo_profesional">
                  <option value="">— Seleccionar carrera —</option>
                  ${carrerasOpts.map(c => `<option value="${esc(c)}" ${p.titulo_profesional === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                </select>
              </td>
            </tr>
            <tr>
              <td class="fw-bold">Habilitación profesional</td>
              <td>
                <div class="form-check form-check-inline">
                  <input ${ro} class="form-check-input fl-perfil-radio" type="radio" name="habilitacion" value="Sí" id="habSi" ${p.habilitacion === 'Sí' ? 'checked' : ''}>
                  <label class="form-check-label" for="habSi">Sí</label>
                </div>
                <div class="form-check form-check-inline">
                  <input ${ro} class="form-check-input fl-perfil-radio" type="radio" name="habilitacion" value="No" id="habNo" ${p.habilitacion === 'No' ? 'checked' : ''}>
                  <label class="form-check-label" for="habNo">No</label>
                </div>
              </td>
              <td class="fw-bold">Resolución SERUM</td>
              <td>
                <div class="form-check form-check-inline">
                  <input ${ro} class="form-check-input fl-perfil-radio" type="radio" name="serum" value="Sí" id="serumSi" ${p.serum === 'Sí' ? 'checked' : ''}>
                  <label class="form-check-label" for="serumSi">Sí</label>
                </div>
                <div class="form-check form-check-inline">
                  <input ${ro} class="form-check-input fl-perfil-radio" type="radio" name="serum" value="No" id="serumNo" ${p.serum === 'No' ? 'checked' : ''}>
                  <label class="form-check-label" for="serumNo">No</label>
                </div>
              </td>
            </tr>
            <tr>
              <td class="fw-bold">Otros (indicar)</td>
              <td colspan="3">
                <input ${ro} class="form-control form-control-sm fl-perfil" data-field="otros" type="text" value="${esc(p.otros || '')}" placeholder="Indicar otra formación o requisito" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ========== 8.1 MODALIDAD ==========
function renderModalidad(item) {
  const ro = state.editing ? '' : 'disabled';
  const opts = ['Presencial', 'Híbrido', 'Remoto'];
  return `
    <div class="mb-3">
      <label class="form-label fw-bold">Modalidad del servicio:</label>
      <select ${ro} class="form-select form-select-sm fl-modalidad" style="max-width:250px;">
        ${opts.map(o => `<option value="${esc(o)}" ${state.modalidad === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      </select>
    </div>
  `;
}

// ========== TABLA 8.2.1: ENTREGABLES ==========
function renderTablaEntregas(item) {
  const ro = state.editing ? '' : 'disabled';
  const entregas = state.entregas && state.entregas.length ? state.entregas
    : [{ plazo: '', condicion: '' }];

  const rows = entregas.map((e, i) => `
    <tr>
      <td class="text-center align-middle">
        <input type="checkbox" class="form-check-input fl-chk-ent" data-i="${i}" ${ro ? 'disabled' : ''} />
      </td>
      <td class="text-center align-middle fw-bold">${i + 1}</td>
      <td><input ${ro} class="form-control form-control-sm fl-ent" data-i="${i}" data-f="plazo" type="text" value="${esc(e.plazo || '')}" placeholder="Plazo de entrega" /></td>
      <td><input ${ro} class="form-control form-control-sm fl-ent" data-i="${i}" data-f="condicion" type="text" value="${esc(e.condicion || '')}" placeholder="Condición de entrega" /></td>
    </tr>
  `).join('');

  return `
    <div class="mt-3">
      ${tituloHtml(item)}
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-2" id="flEntregasTable">
          <thead class="table-light">
            <tr>
              <th style="width:45px" class="text-center">
                <input type="checkbox" class="form-check-input fl-chk-ent-all" id="flChkEntAll" ${ro ? 'disabled' : ''} />
              </th>
              <th style="width:90px" class="text-center">N° Entrega</th>
              <th>Plazo de Entrega</th>
              <th>Condición de entrega</th>
            </tr>
          </thead>
          <tbody id="flEntregasBody">${rows}</tbody>
        </table>
      </div>
      <div class="d-flex gap-2">
        <button type="button" id="flAddEnt" class="btn btn-sm btn-outline-primary" ${ro}><i class="bi bi-plus-lg"></i> Agregar fila</button>
        <button type="button" id="flDelEnt" class="btn btn-sm btn-outline-danger" ${ro}><i class="bi bi-trash"></i> Eliminar filas</button>
      </div>
    </div>
  `;
}

// ========== TABLA 8.2.2: PLAZO PARA PRESENTAR ENTREGABLES ==========
function renderTablaPlazos(item) {
  const ro = state.editing ? '' : 'disabled';
  const plazos = state.plazos && state.plazos.length ? state.plazos
    : [{ entregable: '', plazo: '' }];

  const rows = plazos.map((e, i) => `
    <tr>
      <td class="text-center align-middle">
        <input type="checkbox" class="form-check-input fl-chk-plz" data-i="${i}" ${ro ? 'disabled' : ''} />
      </td>
      <td class="text-center align-middle fw-bold">${i + 1}</td>
      <td><input ${ro} class="form-control form-control-sm fl-plz" data-i="${i}" data-f="entregable" type="text" value="${esc(e.entregable || '')}" placeholder="Entregable" /></td>
      <td><input ${ro} class="form-control form-control-sm fl-plz" data-i="${i}" data-f="plazo" type="text" value="${esc(e.plazo || '')}" placeholder="Plazo de presentación" /></td>
    </tr>
  `).join('');

  return `
    <div class="mt-3">
      ${tituloHtml(item)}
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-2" id="flPlazosTable">
          <thead class="table-light">
            <tr>
              <th style="width:45px" class="text-center">
                <input type="checkbox" class="form-check-input fl-chk-plz-all" id="flChkPlzAll" ${ro ? 'disabled' : ''} />
              </th>
              <th style="width:60px" class="text-center">N°</th>
              <th>Entregable</th>
              <th>Plazo de presentación del entregable</th>
            </tr>
          </thead>
          <tbody id="flPlazosBody">${rows}</tbody>
        </table>
      </div>
      <div class="d-flex gap-2">
        <button type="button" id="flAddPlz" class="btn btn-sm btn-outline-primary" ${ro}><i class="bi bi-plus-lg"></i> Agregar fila</button>
        <button type="button" id="flDelPlz" class="btn btn-sm btn-outline-danger" ${ro}><i class="bi bi-trash"></i> Eliminar filas</button>
      </div>
    </div>
  `;
}

function renderFirmas() {
  return `
    <div style="height: 9rem;" aria-hidden="true"></div>
    <div class="row mb-4 text-center">
      <div class="col-6">
        <div style="border-top:1px solid #333; width:80%; margin:0 auto;"></div>
        <div class="small mt-1">FIRMA DEL SUB DIRECTOR Y/O<br>JEFE DE UNIDAD</div>
      </div>
      <div class="col-6">
        <div style="border-top:1px solid #333; width:80%; margin:0 auto;"></div>
        <div class="small mt-1">FIRMA DEL JEFE Y/O<br>DIRECTOR GENERAL</div>
      </div>
    </div>
  `;
}

function renderBody() {
  const body = document.getElementById('flBody');
  if (!body) return;
  body.innerHTML = `<div class="card"><div class="card-body">${MODELO_LOCADORES.map(renderSection).join('')}</div></div>`;
  attachDynamic();
}

function setMsg(type, text) {
  const el = document.getElementById('flMsg');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${esc(text)}<button type="button" class="btn-close" onclick="this.parentElement.remove()"></button></div>`;
}

// ---------- Helpers ----------
function ensureEntregas() {
  if (!Array.isArray(state.entregas) || !state.entregas.length) {
    state.entregas = [{ plazo: '', condicion: '' }];
  }
  return state.entregas;
}

function ensurePlazos() {
  if (!Array.isArray(state.plazos) || !state.plazos.length) {
    state.plazos = [{ entregable: '', plazo: '' }];
  }
  return state.plazos;
}

function getSelectedIndices(checkboxClass) {
  const indices = [];
  document.querySelectorAll(checkboxClass).forEach((chk) => {
    if (chk.checked) indices.push(Number(chk.dataset.i));
  });
  return indices.sort((a, b) => b - a);
}

// ---------- Eventos dinámicos ----------
function attachDynamic() {
  // Tabla entregables: agregar
  const addEntBtn = document.getElementById('flAddEnt');
  if (addEntBtn) addEntBtn.onclick = () => {
    collectInputs();
    ensureEntregas().push({ plazo: '', condicion: '' });
    renderBody();
  };

  // Tabla entregables: eliminar
  const delEntBtn = document.getElementById('flDelEnt');
  if (delEntBtn) delEntBtn.onclick = () => {
    const entregas = ensureEntregas();
    if (entregas.length <= 1) { setMsg('warning', 'Debe haber al menos una fila.'); return; }
    const indices = getSelectedIndices('.fl-chk-ent');
    if (!indices.length) { setMsg('warning', 'Seleccione al menos una fila para eliminar.'); return; }
    collectInputs();
    indices.forEach((i) => entregas.splice(i, 1));
    renderBody();
  };

  // Check-all entregables
  const chkAll = document.getElementById('flChkEntAll');
  if (chkAll) chkAll.onchange = () => {
    document.querySelectorAll('.fl-chk-ent').forEach((chk) => { chk.checked = chkAll.checked; });
  };

  // Inputs en vivo entregables
  document.querySelectorAll('.fl-ent').forEach((inp) => {
    inp.oninput = () => {
      const entregas = ensureEntregas();
      const i = Number(inp.dataset.i);
      const f = inp.dataset.f;
      if (!entregas[i]) entregas[i] = { plazo: '', condicion: '' };
      entregas[i][f] = inp.value;
    };
  });

  // Perfil: selects y text inputs
  document.querySelectorAll('.fl-perfil').forEach((el) => {
    el.onchange = () => { state.perfil[el.dataset.field] = el.value; };
    el.oninput = () => { state.perfil[el.dataset.field] = el.value; };
  });

  // Perfil: radios
  document.querySelectorAll('.fl-perfil-radio').forEach((el) => {
    el.onchange = () => { state.perfil[el.name] = el.value; };
  });

  // Modalidad select
  const modSel = document.querySelector('.fl-modalidad');
  if (modSel) modSel.onchange = () => { state.modalidad = modSel.value; };

  // ---- Tabla 8.2.2: Agregar fila ----
  const addPlzBtn = document.getElementById('flAddPlz');
  if (addPlzBtn) addPlzBtn.onclick = () => {
    collectInputs();
    ensurePlazos().push({ entregable: '', plazo: '' });
    renderBody();
  };

  // ---- Tabla 8.2.2: Eliminar filas seleccionadas ----
  const delPlzBtn = document.getElementById('flDelPlz');
  if (delPlzBtn) delPlzBtn.onclick = () => {
    const plazos = ensurePlazos();
    if (plazos.length <= 1) { setMsg('warning', 'Debe haber al menos una fila.'); return; }
    const indices = getSelectedIndices('.fl-chk-plz');
    if (!indices.length) { setMsg('warning', 'Seleccione al menos una fila para eliminar.'); return; }
    collectInputs();
    indices.forEach((i) => plazos.splice(i, 1));
    renderBody();
  };

  // ---- Tabla 8.2.2: Check-all ----
  const chkPlzAll = document.getElementById('flChkPlzAll');
  if (chkPlzAll) chkPlzAll.onchange = () => {
    document.querySelectorAll('.fl-chk-plz').forEach((chk) => { chk.checked = chkPlzAll.checked; });
  };

  // ---- Tabla 8.2.2: Inputs en vivo ----
  document.querySelectorAll('.fl-plz').forEach((inp) => {
    inp.oninput = () => {
      const plazos = ensurePlazos();
      const i = Number(inp.dataset.i);
      const f = inp.dataset.f;
      if (!plazos[i]) plazos[i] = { entregable: '', plazo: '' };
      plazos[i][f] = inp.value;
    };
  });
}

// ---------- Carga / Guardado ----------
async function loadCarreras() {
  try {
    const resp = await api.get('/carreras?pageSize=2000');
    state.carrerasLista = (resp.data || []).map(c => c.nombre_carrera).sort();
  } catch (_) {
    state.carrerasLista = [];
  }
}

async function load() {
  try {
    await loadCarreras();
    const resp = await glosasLocadoresService.getAll();
    const rows = (resp && resp.data) || [];
    const docRow = rows.find((r) => r.titulo === DOC_TITULO);
    state.overrides = {};
    state.entregas = [];
    state.perfil = { formacion_academica: 'Profesional', titulo_profesional: '', habilitacion: '', serum: '', otros: '' };
    state.modalidad = 'Presencial';
    state.docId = null;
    if (docRow) {
      state.docId = docRow.id;
      try {
        const parsed = JSON.parse(docRow.contenido || '{}');
        state.overrides = parsed.overrides || {};
        state.entregas = Array.isArray(parsed.entregas) ? parsed.entregas : [];
        state.plazos = Array.isArray(parsed.plazos) ? parsed.plazos : [];
        state.perfil = parsed.perfil || state.perfil;
        state.modalidad = parsed.modalidad || 'Presencial';
      } catch (_) { /* no-JSON */ }
    }
    ensureEntregas();
    ensurePlazos();
    renderBody();
  } catch (e) {
    setMsg('danger', `Error al cargar el formato: ${e.message}`);
  }
}

function collectInputs() {
  // Titles
  document.querySelectorAll('.fl-title').forEach((el) => {
    const k = el.dataset.titlekey;
    if (!state.overrides[k]) state.overrides[k] = {};
    state.overrides[k].titulo = el.value;
  });
  // Content fields
  document.querySelectorAll('[data-key]').forEach((el) => {
    const k = el.dataset.key;
    if (!state.overrides[k]) state.overrides[k] = {};
    state.overrides[k].contenido = el.value;
  });
  // Perfil selects
  document.querySelectorAll('.fl-perfil').forEach((el) => {
    if (el.dataset.field) state.perfil[el.dataset.field] = el.value;
  });
  // Perfil radios
  document.querySelectorAll('.fl-perfil-radio:checked').forEach((el) => {
    state.perfil[el.name] = el.value;
  });
  // Modalidad
  const modSel = document.querySelector('.fl-modalidad');
  if (modSel) state.modalidad = modSel.value;
}

function toggleEdit(on) {
  state.editing = on;
  const save = document.getElementById('flSave');
  const edit = document.getElementById('flEdit');
  if (save) save.disabled = !on;
  if (edit) edit.disabled = on;
  renderBody();
}

async function save() {
  if (!state.editing) return;
  collectInputs();
  setMsg('info', 'Guardando cambios…');
  const user = authService.getCurrentUser();
  const usuario = (user && (user.dni || user.nombre)) || 'sistema';

  const entregas = (state.entregas || []).map((e) => ({ plazo: e.plazo || '', condicion: e.condicion || '' }));
  const plazos = (state.plazos || []).map((e) => ({ entregable: e.entregable || '', plazo: e.plazo || '' }));
  const contenido = JSON.stringify({ overrides: state.overrides, entregas, plazos, perfil: state.perfil, modalidad: state.modalidad });

  try {
    if (state.docId) {
      await glosasLocadoresService.update(state.docId, { titulo: DOC_TITULO, contenido, usuario_modificacion: usuario });
    } else {
      const created = await glosasLocadoresService.create({ titulo: DOC_TITULO, contenido, usuario_modificacion: usuario });
      if (created && created.id) state.docId = created.id;
    }
    setMsg('success', 'Formato guardado correctamente.');
    state.editing = false;
    const edit = document.getElementById('flEdit');
    const saveBtn = document.getElementById('flSave');
    if (edit) edit.disabled = false;
    if (saveBtn) saveBtn.disabled = true;
    await load();
  } catch (e) {
    setMsg('danger', `Error al guardar: ${e.message}`);
  }
}

export function renderFormatoLocadoresView() {
  return buildView();
}

export function initFormatoLocadoresView() {
  const btnEdit = document.getElementById('flEdit');
  const btnSave = document.getElementById('flSave');
  if (btnEdit) btnEdit.onclick = () => toggleEdit(true);
  if (btnSave) btnSave.onclick = () => save();
  load();
}

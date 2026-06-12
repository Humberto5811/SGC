// Formato Servicios — documento estructurado según el modelo (Glosas de Requerimientos).
// Estructura desde el numeral 4.2 hasta el 16, con títulos, contenido editables,
// las tablas dinámicas (9.2.1 y 9.2.2) y los botones Editar / Grabar.
// El documento completo se persiste como un único registro
// JSON en /api/glosas-servicios, guardando las modificaciones del usuario
// (overrides de títulos y contenido) y las tablas de entregables.
import { authService } from '../../services/authService.js';
import { glosasServiciosService } from '../../services/glosasServiciosService.js';
import { MODELO_SERVICIOS } from './formatoServiciosModelo.js';
import { escapeHtml as esc } from '../../utils/escapeHtml.js';

const DOC_TITULO = '__FORMATO_SERVICIOS_DOC__';

let state = {
  docId: null,        // id del registro JSON en el backend
  overrides: {},      // key -> { titulo?, contenido? } modificados por el usuario
  entregas: [],       // filas del numeral 9.2.1 (N° Entrega | Plazo de Entrega | Condición de entrega)
  informacion: [],    // filas del numeral 9.2.2 (Entregable | Plazo del entregable | PORCENTAJE)
  editing: false,
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
          <h3 class="mb-1"><i class="bi bi-tools"></i> Formato Servicios</h3>
          <p class="text-muted mb-0">Glosas de Requerimientos — Especificaciones Técnicas del Servicio</p>
        </div>
        <div class="btn-group">
          <button id="fsEdit" class="btn btn-primary"><i class="bi bi-pencil-square"></i> Editar</button>
          <button id="fsSave" class="btn btn-success" disabled><i class="bi bi-save"></i> Grabar</button>
        </div>
      </div>
      <div id="fsMsg"></div>
      <div id="fsBody"></div>
    </div>
  `;
}

// Título de sección uniforme (mismo tamaño para todos). En edición es un input.
function tituloHtml(item) {
  const pre = prefijo(item);
  const borde = item.kind === 'heading' ? ' border-bottom pb-1' : '';
  if (state.editing) {
    return `
      <div class="d-flex align-items-center gap-2 mb-1${borde}">
        ${pre ? `<span class="fw-bold text-nowrap">${esc(pre.trim())}</span>` : ''}
        <input class="form-control form-control-sm fw-bold fs-title" data-titlekey="${item.key}" type="text" value="${esc(tituloDe(item))}" />
      </div>`;
  }
  return `<div class="fw-bold mb-1${borde}">${esc(pre)}${esc(tituloDe(item))}</div>`;
}

function renderSection(item) {
  if (item.kind === 'firmas') return renderFirmas();
  if (item.kind === 'tabla_entregas') return renderTablaEntregas(item);
  if (item.kind === 'tabla_informacion') return renderTablaInformacion(item);

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

// ========== TABLA 9.2.1: N° DE ENTREGABLES ==========
function renderTablaEntregas(item) {
  const ro = state.editing ? '' : 'disabled';
  const entregas = state.entregas && state.entregas.length ? state.entregas
    : [{ plazo: '', condicion: '' }];

  const rows = entregas.map((e, i) => `
    <tr>
      <td class="text-center align-middle">
        <input type="checkbox" class="form-check-input fs-chk-ent" data-i="${i}" ${ro ? 'disabled' : ''} />
      </td>
      <td class="text-center align-middle fw-bold">${i + 1}</td>
      <td><input ${ro} class="form-control form-control-sm fs-ent" data-i="${i}" data-f="plazo" type="text" value="${esc(e.plazo || '')}" /></td>
      <td><input ${ro} class="form-control form-control-sm fs-ent" data-i="${i}" data-f="condicion" type="text" value="${esc(e.condicion || '')}" /></td>
    </tr>
  `).join('');

  return `
    <div class="mt-3">
      ${tituloHtml(item)}
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-2" id="fsEntregasTable">
          <thead class="table-light">
            <tr>
              <th style="width:45px" class="text-center">
                <input type="checkbox" class="form-check-input fs-chk-ent-all" id="fsChkEntAll" ${ro ? 'disabled' : ''} />
              </th>
              <th style="width:90px" class="text-center">N° Entrega</th>
              <th>Plazo de Entrega</th>
              <th>Condición de entrega</th>
            </tr>
          </thead>
          <tbody id="fsEntregasBody">${rows}</tbody>
        </table>
      </div>
      <div class="d-flex gap-2">
        <button type="button" id="fsAddEnt" class="btn btn-sm btn-outline-primary" ${ro}><i class="bi bi-plus-lg"></i> Agregar entrega</button>
        <button type="button" id="fsDelEnt" class="btn btn-sm btn-outline-danger" ${ro}><i class="bi bi-trash"></i> Eliminar filas</button>
      </div>
    </div>
  `;
}

// ========== TABLA 9.2.2: PLAZO PARA PRESENTAR ENTREGABLES ==========
function renderTablaInformacion(item) {
  const ro = state.editing ? '' : 'disabled';
  const informacion = state.informacion && state.informacion.length ? state.informacion
    : [{ entregable: '', plazo: '', porcentaje: '' }];

  const rows = informacion.map((e, i) => `
    <tr>
      <td class="text-center align-middle">
        <input type="checkbox" class="form-check-input fs-chk-info" data-i="${i}" ${ro ? 'disabled' : ''} />
      </td>
      <td class="text-center align-middle fw-bold">${i + 1}</td>
      <td><input ${ro} class="form-control form-control-sm fs-info" data-i="${i}" data-f="entregable" type="text" value="${esc(e.entregable || '')}" /></td>
      <td><input ${ro} class="form-control form-control-sm fs-info" data-i="${i}" data-f="plazo" type="text" value="${esc(e.plazo || '')}" /></td>
      <td><input ${ro} class="form-control form-control-sm fs-info" data-i="${i}" data-f="porcentaje" type="text" value="${esc(e.porcentaje || '')}" /></td>
    </tr>
  `).join('');

  return `
    <div class="mt-3">
      ${tituloHtml(item)}
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-2" id="fsInfoTable">
          <thead class="table-light">
            <tr>
              <th style="width:45px" class="text-center">
                <input type="checkbox" class="form-check-input fs-chk-info-all" id="fsChkInfoAll" ${ro ? 'disabled' : ''} />
              </th>
              <th style="width:60px" class="text-center">N°</th>
              <th>Entregable</th>
              <th>Plazo del entregable</th>
              <th>PORCENTAJE</th>
            </tr>
          </thead>
          <tbody id="fsInfoBody">${rows}</tbody>
        </table>
      </div>
      <div class="d-flex gap-2">
        <button type="button" id="fsAddInfo" class="btn btn-sm btn-outline-primary" ${ro}><i class="bi bi-plus-lg"></i> Agregar fila</button>
        <button type="button" id="fsDelInfo" class="btn btn-sm btn-outline-danger" ${ro}><i class="bi bi-trash"></i> Eliminar filas</button>
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
  const body = document.getElementById('fsBody');
  if (!body) return;
  body.innerHTML = `<div class="card"><div class="card-body">${MODELO_SERVICIOS.map(renderSection).join('')}</div></div>`;
  attachDynamic();
}

function setMsg(type, text) {
  const el = document.getElementById('fsMsg');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${esc(text)}<button type="button" class="btn-close" onclick="this.parentElement.remove()"></button></div>`;
}

// ---------- Helpers de estado ----------
function ensureEntregas() {
  if (!Array.isArray(state.entregas) || !state.entregas.length) {
    state.entregas = [{ plazo: '', condicion: '' }];
  }
  return state.entregas;
}

function ensureInformacion() {
  if (!Array.isArray(state.informacion) || !state.informacion.length) {
    state.informacion = [{ entregable: '', plazo: '', porcentaje: '' }];
  }
  return state.informacion;
}

function getSelectedIndices(checkboxClass) {
  const indices = [];
  document.querySelectorAll(checkboxClass).forEach((chk) => {
    if (chk.checked) {
      indices.push(Number(chk.dataset.i));
    }
  });
  return indices.sort((a, b) => b - a); // descending so splice works
}

// ---------- Eventos dinámicos ----------
function attachDynamic() {
  // ---- Tabla 9.2.1: Agregar entrega ----
  const addEntBtn = document.getElementById('fsAddEnt');
  if (addEntBtn) addEntBtn.onclick = () => {
    const entregas = ensureEntregas();
    collectInputs();
    entregas.push({ plazo: '', condicion: '' });
    renderBody();
  };

  // ---- Tabla 9.2.1: Eliminar filas seleccionadas ----
  const delEntBtn = document.getElementById('fsDelEnt');
  if (delEntBtn) delEntBtn.onclick = () => {
    const entregas = ensureEntregas();
    if (entregas.length <= 1) {
      setMsg('warning', 'Debe haber al menos una fila.');
      return;
    }
    const indices = getSelectedIndices('.fs-chk-ent');
    if (!indices.length) {
      setMsg('warning', 'Seleccione al menos una fila para eliminar.');
      return;
    }
    collectInputs();
    indices.forEach((i) => entregas.splice(i, 1));
    renderBody();
  };

  // ---- Tabla 9.2.1: Check-all ----
  const chkAll = document.getElementById('fsChkEntAll');
  if (chkAll) chkAll.onchange = () => {
    document.querySelectorAll('.fs-chk-ent').forEach((chk) => {
      chk.checked = chkAll.checked;
    });
  };

  // ---- Tabla 9.2.1: Inputs en vivo ----
  document.querySelectorAll('.fs-ent').forEach((inp) => {
    inp.oninput = () => {
      const entregas = ensureEntregas();
      const i = Number(inp.dataset.i);
      const f = inp.dataset.f;
      if (!entregas[i]) entregas[i] = { plazo: '', condicion: '' };
      entregas[i][f] = inp.value;
    };
  });

  // ---- Tabla 9.2.2: Agregar fila ----
  const addInfoBtn = document.getElementById('fsAddInfo');
  if (addInfoBtn) addInfoBtn.onclick = () => {
    const info = ensureInformacion();
    collectInputs();
    info.push({ entregable: '', plazo: '', porcentaje: '' });
    renderBody();
  };

  // ---- Tabla 9.2.2: Eliminar filas seleccionadas ----
  const delInfoBtn = document.getElementById('fsDelInfo');
  if (delInfoBtn) delInfoBtn.onclick = () => {
    const info = ensureInformacion();
    if (info.length <= 1) {
      setMsg('warning', 'Debe haber al menos una fila.');
      return;
    }
    const indices = getSelectedIndices('.fs-chk-info');
    if (!indices.length) {
      setMsg('warning', 'Seleccione al menos una fila para eliminar.');
      return;
    }
    collectInputs();
    indices.forEach((i) => info.splice(i, 1));
    renderBody();
  };

  // ---- Tabla 9.2.2: Check-all ----
  const chkInfoAll = document.getElementById('fsChkInfoAll');
  if (chkInfoAll) chkInfoAll.onchange = () => {
    document.querySelectorAll('.fs-chk-info').forEach((chk) => {
      chk.checked = chkInfoAll.checked;
    });
  };

  // ---- Tabla 9.2.2: Inputs en vivo ----
  document.querySelectorAll('.fs-info').forEach((inp) => {
    inp.oninput = () => {
      const info = ensureInformacion();
      const i = Number(inp.dataset.i);
      const f = inp.dataset.f;
      if (!info[i]) info[i] = { entregable: '', plazo: '', porcentaje: '' };
      info[i][f] = inp.value;
    };
  });
}

// ---------- Carga / Guardado ----------
async function load() {
  try {
    const resp = await glosasServiciosService.getAll();
    const rows = (resp && resp.data) || [];
    const docRow = rows.find((r) => r.titulo === DOC_TITULO);
    state.overrides = {};
    state.entregas = [];
    state.informacion = [];
    state.docId = null;
    if (docRow) {
      state.docId = docRow.id;
      try {
        const parsed = JSON.parse(docRow.contenido || '{}');
        state.overrides = parsed.overrides || {};
        state.entregas = Array.isArray(parsed.entregas) ? parsed.entregas : [];
        state.informacion = Array.isArray(parsed.informacion) ? parsed.informacion : [];
      } catch (_) { /* contenido no-JSON: se ignora */ }
    }
    ensureEntregas();
    ensureInformacion();
    renderBody();
  } catch (e) {
    setMsg('danger', `Error al cargar el formato: ${e.message}`);
  }
}

function collectInputs() {
  document.querySelectorAll('.fs-title').forEach((el) => {
    const k = el.dataset.titlekey;
    if (!state.overrides[k]) state.overrides[k] = {};
    state.overrides[k].titulo = el.value;
  });
  document.querySelectorAll('[data-key]').forEach((el) => {
    const k = el.dataset.key;
    if (!state.overrides[k]) state.overrides[k] = {};
    state.overrides[k].contenido = el.value;
  });
}

function toggleEdit(on) {
  state.editing = on;
  const save = document.getElementById('fsSave');
  const edit = document.getElementById('fsEdit');
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

  const entregas = (state.entregas || []).map((e) => ({
    plazo: e.plazo || '',
    condicion: e.condicion || '',
  }));
  const informacion = (state.informacion || []).map((e) => ({
    entregable: e.entregable || '',
    plazo: e.plazo || '',
    porcentaje: e.porcentaje || '',
  }));
  const contenido = JSON.stringify({ overrides: state.overrides, entregas, informacion });

  try {
    if (state.docId) {
      await glosasServiciosService.update(state.docId, { titulo: DOC_TITULO, contenido, usuario_modificacion: usuario });
    } else {
      const created = await glosasServiciosService.create({
        titulo: DOC_TITULO, contenido, usuario_modificacion: usuario,
      });
      if (created && created.id) state.docId = created.id;
    }
    setMsg('success', 'Formato guardado correctamente.');
    state.editing = false;
    const edit = document.getElementById('fsEdit');
    const saveBtn = document.getElementById('fsSave');
    if (edit) edit.disabled = false;
    if (saveBtn) saveBtn.disabled = true;
    await load();
  } catch (e) {
    setMsg('danger', `Error al guardar: ${e.message}`);
  }
}

export function renderFormatoServiciosView() {
  return buildView();
}

export function initFormatoServiciosView() {
  const btnEdit = document.getElementById('fsEdit');
  const btnSave = document.getElementById('fsSave');
  if (btnEdit) btnEdit.onclick = () => toggleEdit(true);
  if (btnSave) btnSave.onclick = () => save();
  load();
}
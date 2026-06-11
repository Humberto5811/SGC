// Formato Servicios — documento estructurado según el modelo (Glosas de Requerimientos).
// Estructura desde el numeral 4.2 hasta el 13, con títulos, contenido editables,
// la tabla dinámica de entregables (numeral 9.2.1) con totalizador de cantidad
// y los botones Editar / Grabar. El documento completo se persiste como un único registro
// JSON en /api/glosas-servicios, guardando las modificaciones del usuario
// (overrides de títulos y contenido) y las entregas del 9.2.1.
import { authService } from '../../services/authService.js';
import { glosasServiciosService } from '../../services/glosasServiciosService.js';
import { MODELO_SERVICIOS } from './formatoServiciosModelo.js';
import { escapeHtml as esc } from '../../utils/escapeHtml.js';

const DOC_TITULO = '__FORMATO_SERVICIOS_DOC__';

let state = {
  docId: null,        // id del registro JSON en el backend
  overrides: {},      // key -> { titulo?, contenido? } modificados por el usuario
  entregas: [],       // filas del numeral 9.1 (plazo - cantidad/plazo/condicion)
  entregables: [],    // filas del numeral 9.2 (entregables - plazo/condicion)
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

function totalCantidad(entregas) {
  return (entregas || []).reduce((s, e) => s + (Number(e.cantidad) || 0), 0);
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
  if (item.kind === 'plazo') return renderPlazo(item);
  if (item.kind === 'plazo_entregables') return renderPlazoEntregables(item);

  const titulo = tituloHtml(item);
  if (item.kind === 'heading') {
    return `<div class="mt-4 mb-2">${titulo}</div>`;
  }

  const ro = state.editing ? '' : 'disabled';
  const bgStyle = state.editing ? '' : ' style="background-color:#f0f0f0;"';
  const val = contenidoDe(item);
  const helper = item.helper ? `<div class="form-text fst-italic text-secondary mb-1">${esc(item.helper)}</div>` : '';
  const field = item.type === 'text'
    ? `<input ${ro} class="form-control" data-key="${item.key}" type="text" value="${esc(val)}"${bgStyle} />`
    : `<textarea ${ro} class="form-control" data-key="${item.key}" rows="3"${bgStyle}>${esc(val)}</textarea>`;
  return `
    <div class="mb-3 mt-3">
      ${titulo}
      ${helper}
      ${field}
    </div>
  `;
}

function renderPlazo(item) {
  const ro = state.editing ? '' : 'disabled';
  const bgStyle = state.editing ? '' : ' style="background-color:#f0f0f0;"';
  const entregas = state.entregas && state.entregas.length ? state.entregas
    : [{ numero_entrega: 1, cantidad: 0, plazo: '', condicion: '' }];
  const introVal = contenidoDe(item) || item.intro || '';

  const rows = entregas.map((e, i) => `
    <tr>
      <td class="text-center align-middle">${i + 1}</td>
      <td><input ${ro} class="form-control form-control-sm fs-ent" data-i="${i}" data-f="cantidad" type="number" min="0" step="any" value="${esc(e.cantidad ?? 0)}"${bgStyle} /></td>
      <td><input ${ro} class="form-control form-control-sm fs-ent" data-i="${i}" data-f="plazo" type="text" value="${esc(e.plazo || '')}"${bgStyle} /></td>
      <td><input ${ro} class="form-control form-control-sm fs-ent" data-i="${i}" data-f="condicion" type="text" value="${esc(e.condicion || '')}"${bgStyle} /></td>
      <td class="text-center align-middle">
        <button type="button" class="btn btn-sm btn-outline-danger fs-del" data-i="${i}" ${ro || entregas.length <= 1 ? 'disabled' : ''} title="Eliminar entregable"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join('');

  return `
    <div class="mt-3">
      ${tituloHtml(item)}
      <textarea ${ro} class="form-control mb-2" data-key="${item.key}" rows="3"${bgStyle}>${esc(introVal)}</textarea>
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-2" id="fsPlazoTable">
          <thead class="table-light">
            <tr>
              <th style="width:90px" class="text-center">N° Entrega</th>
              <th>Cantidad a entregar</th>
              <th>Plazo de Entrega</th>
              <th>Condición de entrega</th>
              <th style="width:60px" class="text-center">Acción</th>
            </tr>
          </thead>
          <tbody id="fsPlazoBody">${rows}</tbody>
          <tfoot>
            <tr class="table-secondary fw-bold">
              <td class="text-end">TOTAL</td>
              <td id="fsTotal">${totalCantidad(entregas)}</td>
              <td colspan="3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button type="button" id="fsAddRow" class="btn btn-sm btn-outline-primary" ${ro}><i class="bi bi-plus-lg"></i> Agregar fila</button>
    </div>
  `;
}

function renderPlazoEntregables(item) {
  const ro = state.editing ? '' : 'disabled';
  const bgStyle = state.editing ? '' : ' style="background-color:#f0f0f0;"';
  const entregables = state.entregables && state.entregables.length ? state.entregables
    : [{ numero_entrega: 1, plazo: '', condicion: '' }];
  const introVal = contenidoDe(item) || item.intro || '';

  const rows = entregables.map((e, i) => `
    <tr>
      <td class="text-center align-middle">${i + 1}</td>
      <td><input ${ro} class="form-control form-control-sm fs-plazo-ent" data-i="${i}" data-f="plazo" type="text" value="${esc(e.plazo || '')}"${bgStyle} /></td>
      <td><input ${ro} class="form-control form-control-sm fs-plazo-ent" data-i="${i}" data-f="condicion" type="text" value="${esc(e.condicion || '')}"${bgStyle} /></td>
      <td class="text-center align-middle">
        <button type="button" class="btn btn-sm btn-outline-danger fs-del-ent" data-i="${i}" ${ro || entregables.length <= 1 ? 'disabled' : ''} title="Eliminar entregable"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join('');

  return `
    <div class="mt-3">
      ${tituloHtml(item)}
      <textarea ${ro} class="form-control mb-2" data-key="${item.key}" rows="3"${bgStyle}>${esc(introVal)}</textarea>
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-2" id="fsEntregablesTable">
          <thead class="table-light">
            <tr>
              <th style="width:90px" class="text-center">N° Entrega</th>
              <th>Plazo de Entrega</th>
              <th>Condición de entrega</th>
              <th style="width:60px" class="text-center">Acción</th>
            </tr>
          </thead>
          <tbody id="fsEntregablesBody">${rows}</tbody>
        </table>
      </div>
      <button type="button" id="fsAddEntregable" class="btn btn-sm btn-outline-primary" ${ro}><i class="bi bi-plus-lg"></i> Agregar entregable</button>
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

// ---------- Entregables (9.2.1) dinámico ----------
function ensureEntregas() {
  if (!Array.isArray(state.entregas) || !state.entregas.length) {
    state.entregas = [{ numero_entrega: 1, cantidad: 0, plazo: '', condicion: '' }];
  }
  return state.entregas;
}

function refreshTotal() {
  const el = document.getElementById('fsTotal');
  if (el) el.textContent = totalCantidad(state.entregas);
}

function ensureEntregables() {
  if (!Array.isArray(state.entregables) || !state.entregables.length) {
    state.entregables = [{ numero_entrega: 1, plazo: '', condicion: '' }];
  }
  return state.entregables;
}

function attachDynamic() {
  // Botón agregar fila para tabla 9.1 (Plazo)
  const addBtn = document.getElementById('fsAddRow');
  if (addBtn) addBtn.onclick = () => {
    const entregas = ensureEntregas();
    if (entregas.length >= 24) {
      setMsg('warning', 'Máximo 24 entregables.');
      return;
    }
    collectInputs();
    entregas.push({ numero_entrega: entregas.length + 1, cantidad: 0, plazo: '', condicion: '' });
    renderBody();
  };
  // Botón agregar fila para tabla 9.2 (Entregables)
  const addEntBtn = document.getElementById('fsAddEntregable');
  if (addEntBtn) addEntBtn.onclick = () => {
    const ents = ensureEntregables();
    if (ents.length >= 24) {
      setMsg('warning', 'Máximo 24 entregables.');
      return;
    }
    collectInputs();
    ents.push({ numero_entrega: ents.length + 1, plazo: '', condicion: '' });
    renderBody();
  };
  // Eliminar filas de tabla 9.1
  document.querySelectorAll('.fs-del').forEach((btn) => {
    btn.onclick = () => {
      const entregas = ensureEntregas();
      const i = Number(btn.dataset.i);
      if (entregas.length <= 1) return;
      collectInputs();
      entregas.splice(i, 1);
      renderBody();
    };
  });
  // Eliminar filas de tabla 9.2
  document.querySelectorAll('.fs-del-ent').forEach((btn) => {
    btn.onclick = () => {
      const ents = ensureEntregables();
      const i = Number(btn.dataset.i);
      if (ents.length <= 1) return;
      collectInputs();
      ents.splice(i, 1);
      renderBody();
    };
  });
  // Inputs de tabla 9.1
  document.querySelectorAll('.fs-ent').forEach((inp) => {
    inp.oninput = () => {
      const entregas = ensureEntregas();
      const i = Number(inp.dataset.i);
      const f = inp.dataset.f;
      if (!entregas[i]) entregas[i] = { numero_entrega: i + 1, cantidad: 0, plazo: '', condicion: '' };
      entregas[i][f] = f === 'cantidad' ? (Number(inp.value) || 0) : inp.value;
      if (f === 'cantidad') refreshTotal();
    };
  });
  // Inputs de tabla 9.2
  document.querySelectorAll('.fs-plazo-ent').forEach((inp) => {
    inp.oninput = () => {
      const ents = ensureEntregables();
      const i = Number(inp.dataset.i);
      const f = inp.dataset.f;
      if (!ents[i]) ents[i] = { numero_entrega: i + 1, plazo: '', condicion: '' };
      ents[i][f] = inp.value;
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
    state.entregables = [];
    state.docId = null;
    if (docRow) {
      state.docId = docRow.id;
      try {
        const parsed = JSON.parse(docRow.contenido || '{}');
        state.overrides = parsed.overrides || {};
        state.entregas = Array.isArray(parsed.entregas) ? parsed.entregas : [];
        state.entregables = Array.isArray(parsed.entregables) ? parsed.entregables : [];
      } catch (_) { /* contenido no-JSON: se ignora */ }
    }
    ensureEntregas();
    ensureEntregables();
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

  const entregas = (state.entregas || []).map((e, idx) => ({
    numero_entrega: idx + 1,
    entregable: e.entregable || '',
    cantidad: Number(e.cantidad) || 0,
    plazo: e.plazo || '',
    condicion: e.condicion || '',
  }));
  const entregables = (state.entregables || []).map((e, idx) => ({
    numero_entrega: idx + 1,
    plazo: e.plazo || '',
    condicion: e.condicion || '',
  }));
  const contenido = JSON.stringify({ overrides: state.overrides, entregas, entregables });

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
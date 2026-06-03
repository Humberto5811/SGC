// Formato Bienes — documento estructurado según el modelo (Glosas de Requerimientos).
// Estructura desde el literal c) y demás correlativos (5 a 18), con títulos, subtítulos
// y contenido editables, la tabla dinámica de entregables (numeral 14.1) con totalizador
// y los botones Editar / Grabar. El documento completo se persiste como un único registro
// JSON en /api/glosas-bienes (titulo = DOC_TITULO), guardando las modificaciones del usuario
// (overrides de títulos y contenido) y las entregas del 14.1.
import { authService } from '../../services/authService.js';
import { glosasBienesService } from '../../services/glosasBienesService.js';
import { MODELO } from './formatoBienesModelo.js';

const DOC_TITULO = '__FORMATO_BIENES_DOC__';

// (MODELO se define en formatoBienesModelo.js y se comparte con Registro de Requerimientos)

let state = {
  docId: null,        // id del registro JSON en el backend
  overrides: {},      // key -> { titulo?, contenido? } modificados por el usuario
  entregas: [],       // filas del numeral 14.1
  editing: false,
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  if (item.kind === 'literal') return `${item.label}) `;
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
          <h3 class="mb-1"><i class="bi bi-box"></i> Formato Bienes</h3>
          <p class="text-muted mb-0">Glosas de Requerimientos — Especificaciones Técnicas del Bien</p>
        </div>
        <div class="btn-group">
          <button id="fbEdit" class="btn btn-primary"><i class="bi bi-pencil-square"></i> Editar</button>
          <button id="fbSave" class="btn btn-success" disabled><i class="bi bi-save"></i> Grabar</button>
        </div>
      </div>
      <div id="fbMsg"></div>
      <div id="fbBody"></div>
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
        <input class="form-control form-control-sm fw-bold fb-title" data-titlekey="${item.key}" type="text" value="${esc(tituloDe(item))}" />
      </div>`;
  }
  return `<div class="fw-bold mb-1${borde}">${esc(pre)}${esc(tituloDe(item))}</div>`;
}

function renderSection(item) {
  if (item.kind === 'firmas') return renderFirmas();
  if (item.kind === 'plazo') return renderPlazo(item);

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

function renderPlazo(item) {
  const ro = state.editing ? '' : 'disabled';
  const entregas = state.entregas && state.entregas.length ? state.entregas
    : [{ numero_entrega: 1, cantidad: 0, plazo: '', condicion: '' }];
  const introVal = contenidoDe(item) || item.intro || '';

  const rows = entregas.map((e, i) => `
    <tr>
      <td class="text-center align-middle">${i + 1}</td>
      <td><input ${ro} class="form-control form-control-sm fb-ent" data-i="${i}" data-f="cantidad" type="number" min="0" step="any" value="${esc(e.cantidad ?? 0)}" /></td>
      <td><input ${ro} class="form-control form-control-sm fb-ent" data-i="${i}" data-f="plazo" type="text" value="${esc(e.plazo || '')}" /></td>
      <td><input ${ro} class="form-control form-control-sm fb-ent" data-i="${i}" data-f="condicion" type="text" value="${esc(e.condicion || '')}" /></td>
      <td class="text-center align-middle">
        <button type="button" class="btn btn-sm btn-outline-danger fb-del" data-i="${i}" ${ro || entregas.length <= 1 ? 'disabled' : ''} title="Eliminar entregable"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join('');

  return `
    <div class="mt-3">
      ${tituloHtml(item)}
      <textarea ${ro} class="form-control mb-2" data-key="${item.key}" rows="3">${esc(introVal)}</textarea>
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-2" id="fbPlazoTable">
          <thead class="table-light">
            <tr>
              <th style="width:90px" class="text-center">N° Entrega</th>
              <th>Cantidad a entregar</th>
              <th>Plazo de Entrega</th>
              <th>Condición de entrega</th>
              <th style="width:60px" class="text-center">Acción</th>
            </tr>
          </thead>
          <tbody id="fbPlazoBody">${rows}</tbody>
          <tfoot>
            <tr class="table-secondary fw-bold">
              <td class="text-end">TOTAL</td>
              <td id="fbTotal">${totalCantidad(entregas)}</td>
              <td colspan="3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button type="button" id="fbAddRow" class="btn btn-sm btn-outline-primary" ${ro}><i class="bi bi-plus-lg"></i> Agregar entregable</button>
    </div>
  `;
}

function renderFirmas() {
  // Espacio de ~6 líneas entre el numeral 18 y las firmas para firmas digitales.
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
  const body = document.getElementById('fbBody');
  if (!body) return;
  body.innerHTML = `<div class="card"><div class="card-body">${MODELO.map(renderSection).join('')}</div></div>`;
  attachDynamic();
}

function setMsg(type, text) {
  const el = document.getElementById('fbMsg');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${esc(text)}<button type="button" class="btn-close" onclick="this.parentElement.remove()"></button></div>`;
}

// ---------- Entregables (14.1) dinámico ----------
function ensureEntregas() {
  if (!Array.isArray(state.entregas) || !state.entregas.length) {
    state.entregas = [{ numero_entrega: 1, cantidad: 0, plazo: '', condicion: '' }];
  }
  return state.entregas;
}

function refreshTotal() {
  const el = document.getElementById('fbTotal');
  if (el) el.textContent = totalCantidad(state.entregas);
}

function attachDynamic() {
  const addBtn = document.getElementById('fbAddRow');
  if (addBtn) addBtn.onclick = () => {
    const entregas = ensureEntregas();
    collectInputs(); // conserva lo escrito antes de re-renderizar
    entregas.push({ numero_entrega: entregas.length + 1, cantidad: 0, plazo: '', condicion: '' });
    renderBody();
  };
  document.querySelectorAll('.fb-del').forEach((btn) => {
    btn.onclick = () => {
      const entregas = ensureEntregas();
      const i = Number(btn.dataset.i);
      if (entregas.length <= 1) return;
      collectInputs();
      entregas.splice(i, 1);
      renderBody();
    };
  });
  document.querySelectorAll('.fb-ent').forEach((inp) => {
    inp.oninput = () => {
      const entregas = ensureEntregas();
      const i = Number(inp.dataset.i);
      const f = inp.dataset.f;
      if (!entregas[i]) entregas[i] = { numero_entrega: i + 1, cantidad: 0, plazo: '', condicion: '' };
      entregas[i][f] = f === 'cantidad' ? (Number(inp.value) || 0) : inp.value;
      if (f === 'cantidad') refreshTotal();
    };
  });
}

// ---------- Carga / Guardado ----------
async function load() {
  try {
    const resp = await glosasBienesService.getAll();
    const rows = (resp && resp.data) || [];
    const docRow = rows.find((r) => r.titulo === DOC_TITULO);
    state.overrides = {};
    state.entregas = [];
    state.docId = null;
    if (docRow) {
      state.docId = docRow.id;
      try {
        const parsed = JSON.parse(docRow.contenido || '{}');
        state.overrides = parsed.overrides || {};
        state.entregas = Array.isArray(parsed.entregas) ? parsed.entregas : [];
      } catch (_) { /* contenido no-JSON: se ignora y se usan los valores por defecto */ }
    }
    ensureEntregas();
    renderBody();
  } catch (e) {
    setMsg('danger', `Error al cargar el formato: ${e.message}`);
  }
}

function collectInputs() {
  document.querySelectorAll('.fb-title').forEach((el) => {
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
  const save = document.getElementById('fbSave');
  const edit = document.getElementById('fbEdit');
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
  const contenido = JSON.stringify({ overrides: state.overrides, entregas });

  try {
    if (state.docId) {
      await glosasBienesService.update(state.docId, { contenido, usuario_modificacion: usuario });
    } else {
      const created = await glosasBienesService.create({
        titulo: DOC_TITULO, contenido, usuario_modificacion: usuario,
      });
      if (created && created.id) state.docId = created.id;
    }
    setMsg('success', 'Formato guardado correctamente.');
    state.editing = false;
    const edit = document.getElementById('fbEdit');
    const saveBtn = document.getElementById('fbSave');
    if (edit) edit.disabled = false;
    if (saveBtn) saveBtn.disabled = true;
    await load();
  } catch (e) {
    setMsg('danger', `Error al guardar: ${e.message}`);
  }
}

export function renderFormatoBienesView() {
  return buildView();
}

export function initFormatoBienesView() {
  const btnEdit = document.getElementById('fbEdit');
  const btnSave = document.getElementById('fbSave');
  if (btnEdit) btnEdit.onclick = () => toggleEdit(true);
  if (btnSave) btnSave.onclick = () => save();
  load();
}

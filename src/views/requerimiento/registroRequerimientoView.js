// Registro de Requerimientos.
// Pantalla de selección de formato (Bienes, Servicios, Locadores, Licitaciones,
// Concursos) y el formulario completo del Formato Bienes (modelo v1):
//   - Cabecera con logo + nombre de entidad (Institucional → Logotipos / Datos de Entidad)
//   - 1) Área usuaria: búsqueda contra Metas y Áreas (código o nombre) + responsable
//   - 2) Denominación de la contratación (manual)
//   - 3) Objetivo (3.1) y Finalidad (3.2) (manual)
//   - 4) a) Ítems del Catálogo SIGAMEF (código/descripción) + cantidad; b) características técnicas
//   - c)…18 + firmas + 14.1 (entregables): se cargan automáticamente del Formato Bienes de Glosas
//   - Si un ítem SIGAMEF tiene Ficha Técnica (F.T.), se adjunta su Ficha NET al final del documento
import { api } from '../../services/apiService.js';
import { authService } from '../../services/authService.js';
import { glosasBienesService } from '../../services/glosasBienesService.js';
import { requerimientosService } from '../../services/requerimientosService.js';
import { MODELO } from '../glosasRequerimientos/formatoBienesModelo.js';

const DOC_TITULO = '__FORMATO_BIENES_DOC__';

const FORMATOS = [
  { tipo: 'bienes', label: 'Formato de Bienes', icon: 'bi-box-seam', color: 'primary', enabled: true },
  { tipo: 'servicios', label: 'Formato de Servicios', icon: 'bi-tools', color: 'success', enabled: false },
  { tipo: 'locacion', label: 'Formato de Locadores', icon: 'bi-person-badge', color: 'info', enabled: false },
  { tipo: 'licitaciones', label: 'Formato de Licitaciones', icon: 'bi-hammer', color: 'warning', enabled: false },
  { tipo: 'concurso', label: 'Formato de Concursos', icon: 'bi-trophy', color: 'danger', enabled: false },
];

let state = {
  view: 'select',          // 'select' | 'bienes'
  reqId: null,
  header: { logo: '', entidadNombre: '' },
  area: { codigo: '', nombre: '', responsable: '' },
  denominacion: '',
  objetivo: '',
  finalidad: '',
  caracteristicas: '',     // 4b
  items: [],               // { item_bien, nombre_item, unidad_medida, cantidad, ficha_tecnica }
  glosaOverrides: {},      // overrides de c)…18 (cargados del Formato Bienes de Glosas)
  entregas: [],            // 14.1
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- Helpers de glosas (c…18) ----------
function tituloDe(item) {
  const o = state.glosaOverrides[item.key];
  return o && o.titulo != null && o.titulo !== '' ? o.titulo : (item.titulo || '');
}
function contenidoDe(item) {
  const o = state.glosaOverrides[item.key];
  if (o && o.contenido != null && o.contenido !== '') return o.contenido;
  return item.default || '';
}
function prefijo(item) {
  if (item.kind === 'literal') return `${item.label}) `;
  if (item.label) return `${item.label}. `;
  return '';
}
function totalCantidadItems() {
  return state.items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0);
}
function totalEntregas() {
  return (state.entregas || []).reduce((s, e) => s + (Number(e.cantidad) || 0), 0);
}

// =========================================================================
// PANTALLA DE SELECCIÓN
// =========================================================================
function renderSelect() {
  const cards = FORMATOS.map((f) => `
    <div class="col-md-4 col-lg-3 mb-3">
      <div class="card h-100 shadow-sm fmt-card ${f.enabled ? '' : 'opacity-75'}" data-tipo="${f.tipo}" data-enabled="${f.enabled}"
           style="cursor:${f.enabled ? 'pointer' : 'not-allowed'};">
        <div class="card-body text-center">
          <div class="display-5 text-${f.color} mb-2"><i class="bi ${f.icon}"></i></div>
          <h6 class="card-title mb-1">${f.label}</h6>
          ${f.enabled
            ? '<span class="badge bg-success">Disponible</span>'
            : '<span class="badge bg-secondary">En preparación</span>'}
        </div>
      </div>
    </div>
  `).join('');

  return `
    <div class="container-fluid">
      <div class="mb-3">
        <h3 class="mb-1"><i class="bi bi-pencil-square"></i> Registro de Requerimientos</h3>
        <p class="text-muted mb-0">Seleccione el tipo de formato para iniciar el registro del requerimiento.</p>
      </div>
      <div class="row" id="fmtCards">${cards}</div>
      <hr/>
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h5 class="mb-0"><i class="bi bi-list-check"></i> Requerimientos registrados</h5>
        <button id="reqReload" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
      </div>
      <div id="reqList"><div class="text-muted">Cargando…</div></div>
    </div>
  `;
}

async function loadList() {
  const cont = document.getElementById('reqList');
  if (!cont) return;
  try {
    const resp = await requerimientosService.list({ pageSize: 200 });
    const rows = (resp && resp.data) || [];
    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">Aún no hay requerimientos registrados.</div>';
      return;
    }
    cont.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle">
          <thead class="table-light">
            <tr><th>Código</th><th>Tipo</th><th>Denominación</th><th>Área usuaria</th><th>Estado</th><th class="text-end">Acciones</th></tr>
          </thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td>${esc(r.codigo || ('#' + r.id))}</td>
                <td><span class="badge bg-secondary text-uppercase">${esc(r.tipo)}</span></td>
                <td>${esc(r.denominacion || '')}</td>
                <td>${esc(r.area || '')}</td>
                <td>${esc(r.estado || '')}</td>
                <td class="text-end text-nowrap">
                  <button class="btn btn-sm btn-outline-primary req-open" data-id="${r.id}" title="Abrir"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-dark req-print" data-id="${r.id}" title="Generar documento"><i class="bi bi-printer"></i></button>
                  <button class="btn btn-sm btn-outline-danger req-del" data-id="${r.id}" title="Eliminar"><i class="bi bi-trash"></i></button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    cont.querySelectorAll('.req-open').forEach((b) => b.onclick = () => openRequerimiento(b.dataset.id));
    cont.querySelectorAll('.req-print').forEach((b) => b.onclick = () => printRequerimiento(b.dataset.id));
    cont.querySelectorAll('.req-del').forEach((b) => b.onclick = () => deleteRequerimiento(b.dataset.id));
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error al cargar: ${esc(e.message)}</div>`;
  }
}

function attachSelect() {
  document.querySelectorAll('.fmt-card').forEach((card) => {
    card.onclick = () => {
      if (card.dataset.enabled !== 'true') {
        alert('Este formato estará disponible próximamente. Por ahora puede registrar el Formato de Bienes.');
        return;
      }
      newRequerimiento(card.dataset.tipo);
    };
  });
  const rl = document.getElementById('reqReload');
  if (rl) rl.onclick = loadList;
  loadList();
}

// =========================================================================
// CARGA DE DATOS BASE (cabecera + glosas)
// =========================================================================
async function loadHeader() {
  let entidadNombre = '';
  let logo = '';
  try {
    const ent = await api.get('/entidad');
    if (ent && ent.nombre) entidadNombre = ent.nombre;
  } catch (_) { /* opcional */ }
  try {
    const resp = await api.list('logotipos', { page: 1, pageSize: 100 });
    const logos = (resp && resp.data) || [];
    const pick = logos.find((l) => /principal/i.test(l.tipo || '') && l.data_url)
      || logos.find((l) => (l.estado || 'Activo') !== 'Inactivo' && l.data_url)
      || logos.find((l) => l.data_url);
    if (pick) logo = pick.data_url || '';
  } catch (_) { /* opcional */ }
  state.header = { logo, entidadNombre };
}

async function loadGlosaDefaults() {
  // Carga los overrides + entregas guardados en el Formato Bienes de Glosas.
  try {
    const resp = await glosasBienesService.getAll();
    const rows = (resp && resp.data) || [];
    const docRow = rows.find((r) => r.titulo === DOC_TITULO);
    if (docRow) {
      try {
        const parsed = JSON.parse(docRow.contenido || '{}');
        if (!Object.keys(state.glosaOverrides).length) state.glosaOverrides = parsed.overrides || {};
        if (!state.entregas.length && Array.isArray(parsed.entregas)) state.entregas = parsed.entregas;
      } catch (_) { /* contenido no-JSON */ }
    }
  } catch (_) { /* si falla, se usan los valores por defecto del MODELO */ }
}

function ensureEntregas() {
  if (!Array.isArray(state.entregas) || !state.entregas.length) {
    state.entregas = [{ numero_entrega: 1, cantidad: 0, plazo: '', condicion: '' }];
  }
  return state.entregas;
}

// =========================================================================
// FORMULARIO FORMATO BIENES
// =========================================================================
function renderBienes() {
  const { logo, entidadNombre } = state.header;
  const logoImg = logo
    ? `<img src="${logo}" alt="logo" style="max-height:64px;max-width:130px;object-fit:contain;">`
    : '<span class="text-muted small">Sin logo (configúrelo en Institucional)</span>';

  return `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-box-seam"></i> Registro de Requerimiento — Formato de Bienes</h3>
          <p class="text-muted mb-0">Anexo N.º 01 — Especificaciones Técnicas para Adquisición de Bienes</p>
        </div>
        <div class="btn-group">
          <button id="reqBack" class="btn btn-outline-secondary"><i class="bi bi-arrow-left"></i> Volver</button>
          <button id="reqSave" class="btn btn-success"><i class="bi bi-save"></i> Grabar</button>
          <button id="reqPrint" class="btn btn-dark"><i class="bi bi-printer"></i> Generar documento</button>
        </div>
      </div>
      <div id="reqMsg"></div>

      <!-- Cabecera: logo + entidad -->
      <div class="card mb-3">
        <div class="card-body d-flex align-items-center gap-3">
          <div style="width:150px; text-align:center;">${logoImg}</div>
          <div class="flex-fill text-center">
            <div class="fw-bold">${esc(entidadNombre || 'INSTITUTO NACIONAL DE SALUD')}</div>
            <div class="small text-muted">ANEXO N.º 01 — ESPECIFICACIONES TÉCNICAS PARA ADQUISICIÓN DE BIENES</div>
          </div>
        </div>
      </div>

      <div class="card mb-3"><div class="card-body">

        <!-- 1) ÁREA USUARIA -->
        <div class="mb-3">
          <div class="fw-bold mb-1">1. ÁREA USUARIA / DEPENDENCIA QUE REQUIERE EL BIEN</div>
          <div class="input-group mb-2">
            <input id="areaSearch" class="form-control" placeholder="Ingrese código o nombre del área usuaria…" />
            <button id="areaBtn" class="btn btn-outline-primary" type="button"><i class="bi bi-search"></i> Buscar</button>
          </div>
          <div id="areaResults"></div>
          <div class="row g-2">
            <div class="col-md-6">
              <label class="form-label small mb-0">Área usuaria</label>
              <input id="areaNombre" class="form-control" value="${esc(state.area.nombre)}" readonly />
            </div>
            <div class="col-md-6">
              <label class="form-label small mb-0">Responsable</label>
              <input id="areaResponsable" class="form-control" value="${esc(state.area.responsable)}" readonly />
            </div>
          </div>
        </div>

        <!-- 2) DENOMINACIÓN -->
        <div class="mb-3">
          <div class="fw-bold mb-1">2. DENOMINACIÓN DE LA CONTRATACIÓN</div>
          <input id="denominacion" class="form-control" value="${esc(state.denominacion)}" placeholder="Ingrese la denominación de la contratación" />
        </div>

        <!-- 3) OBJETIVO Y/O FINALIDAD PÚBLICA -->
        <div class="mb-2 fw-bold">3. OBJETIVO Y/O FINALIDAD PÚBLICA</div>
        <div class="mb-3">
          <div class="fw-bold mb-1">3.1. OBJETIVO</div>
          <textarea id="objetivo" class="form-control" rows="2" placeholder="Describa el objetivo">${esc(state.objetivo)}</textarea>
        </div>
        <div class="mb-3">
          <div class="fw-bold mb-1">3.2. FINALIDAD</div>
          <textarea id="finalidad" class="form-control" rows="2" placeholder="Describa la finalidad pública">${esc(state.finalidad)}</textarea>
        </div>

        <!-- 4) REQUERIMIENTO / CARACTERÍSTICAS TÉCNICAS -->
        <div class="mb-2 fw-bold">4. REQUERIMIENTO O CARACTERÍSTICAS TÉCNICAS</div>
        <div class="mb-3">
          <div class="fw-bold mb-1">a) Descripción del bien</div>
          <div class="input-group mb-2">
            <input id="itemSearch" class="form-control" placeholder="Ingrese código o descripción del ítem (Catálogo SIGAMEF)…" />
            <button id="itemBtn" class="btn btn-outline-primary" type="button"><i class="bi bi-search"></i> Buscar</button>
          </div>
          <div id="itemResults"></div>
          ${renderItemsTable()}
        </div>
        <div class="mb-3">
          <div class="fw-bold mb-1">b) Características técnicas</div>
          <textarea id="caracteristicas" class="form-control" rows="3" placeholder="Detalle las características técnicas. Se adjunta ficha net, donde se detallan las características técnicas del bien, en caso de corresponder.">${esc(state.caracteristicas)}</textarea>
        </div>

      </div></div>

      <!-- c)…18 + firmas (cargado automáticamente del Formato Bienes de Glosas) -->
      <div class="card">
        <div class="card-header bg-light fw-bold"><i class="bi bi-file-text"></i> Cláusulas del Formato de Bienes (c hasta 18)</div>
        <div class="card-body" id="reqGlosa">${MODELO.map(renderGlosaSection).join('')}</div>
      </div>
    </div>
  `;
}

function renderItemsTable() {
  const rows = state.items.map((it, i) => `
    <tr>
      <td>${esc(it.item_bien)}${it.ficha_tecnica ? ' <span class="badge bg-info" title="Tiene Ficha Técnica asociada">F.T.</span>' : ''}</td>
      <td>${esc(it.nombre_item)}</td>
      <td class="text-center">${esc(it.unidad_medida)}</td>
      <td style="width:120px"><input class="form-control form-control-sm req-it" data-i="${i}" type="number" min="0" step="any" value="${esc(it.cantidad ?? 1)}" /></td>
      <td class="text-center"><button class="btn btn-sm btn-outline-danger req-it-del" data-i="${i}" title="Quitar"><i class="bi bi-trash"></i></button></td>
    </tr>`).join('');
  return `
    <div class="table-responsive">
      <table class="table table-bordered align-middle mb-0">
        <thead class="table-light">
          <tr><th>Código SIGAMEF</th><th>Descripción del bien</th><th class="text-center" style="width:120px">Unidad de Medida</th><th style="width:120px">Cantidad</th><th style="width:60px" class="text-center">Acción</th></tr>
        </thead>
        <tbody id="itemsBody">${rows || '<tr><td colspan="5" class="text-center text-muted">Busque y agregue ítems del Catálogo SIGAMEF.</td></tr>'}</tbody>
        <tfoot><tr class="table-secondary fw-bold"><td colspan="3" class="text-end">TOTAL CANTIDAD</td><td id="itemsTotal">${totalCantidadItems()}</td><td></td></tr></tfoot>
      </table>
    </div>`;
}

// Render de una sección de glosa (c…18, headings, 14.1 plazo, firmas). Editable.
function renderGlosaSection(item) {
  if (item.kind === 'firmas') return renderFirmas();
  if (item.kind === 'plazo') return renderPlazo(item);

  const pre = prefijo(item);
  const titulo = `<div class="fw-bold mb-1 d-flex align-items-center gap-2">
      ${pre ? `<span class="text-nowrap">${esc(pre.trim())}</span>` : ''}
      <input class="form-control form-control-sm fw-bold req-gtitle" data-key="${item.key}" type="text" value="${esc(tituloDe(item))}" />
    </div>`;
  if (item.kind === 'heading') return `<div class="mt-4 mb-2 border-bottom pb-1">${titulo}</div>`;

  const helper = item.helper ? `<div class="form-text fst-italic text-secondary mb-1">${esc(item.helper)}</div>` : '';
  const val = contenidoDe(item);
  const field = item.type === 'text'
    ? `<input class="form-control req-gcont" data-key="${item.key}" type="text" value="${esc(val)}" />`
    : `<textarea class="form-control req-gcont" data-key="${item.key}" rows="3">${esc(val)}</textarea>`;
  return `<div class="mb-3 mt-3">${titulo}${helper}${field}</div>`;
}

function renderPlazo(item) {
  const entregas = ensureEntregas();
  const intro = contenidoDe(item) || item.intro || '';
  const rows = entregas.map((e, i) => `
    <tr>
      <td class="text-center align-middle">${i + 1}</td>
      <td><input class="form-control form-control-sm req-ent" data-i="${i}" data-f="cantidad" type="number" min="0" step="any" value="${esc(e.cantidad ?? 0)}" /></td>
      <td><input class="form-control form-control-sm req-ent" data-i="${i}" data-f="plazo" type="text" value="${esc(e.plazo || '')}" /></td>
      <td><input class="form-control form-control-sm req-ent" data-i="${i}" data-f="condicion" type="text" value="${esc(e.condicion || '')}" /></td>
      <td class="text-center align-middle"><button type="button" class="btn btn-sm btn-outline-danger req-ent-del" data-i="${i}" ${entregas.length <= 1 ? 'disabled' : ''}><i class="bi bi-trash"></i></button></td>
    </tr>`).join('');
  return `
    <div class="mt-3">
      <div class="fw-bold mb-1 d-flex align-items-center gap-2">
        <span class="text-nowrap">${esc(item.label)}.</span>
        <input class="form-control form-control-sm fw-bold req-gtitle" data-key="${item.key}" type="text" value="${esc(tituloDe(item))}" />
      </div>
      <textarea class="form-control mb-2 req-gcont" data-key="${item.key}" rows="3">${esc(intro)}</textarea>
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-2">
          <thead class="table-light"><tr>
            <th style="width:90px" class="text-center">N° Entrega</th><th>Cantidad a entregar</th><th>Plazo de Entrega</th><th>Condición de entrega</th><th style="width:60px" class="text-center">Acción</th>
          </tr></thead>
          <tbody id="entBody">${rows}</tbody>
          <tfoot><tr class="table-secondary fw-bold"><td class="text-end">TOTAL</td><td id="entTotal">${totalEntregas()}</td><td colspan="3"></td></tr></tfoot>
        </table>
      </div>
      <button type="button" id="entAdd" class="btn btn-sm btn-outline-primary"><i class="bi bi-plus-lg"></i> Agregar entregable</button>
    </div>`;
}

function renderFirmas() {
  return `
    <div style="height: 9rem;" aria-hidden="true"></div>
    <div class="row mb-4 text-center">
      <div class="col-6"><div style="border-top:1px solid #333; width:80%; margin:0 auto;"></div><div class="small mt-1">FIRMA DEL SUB DIRECTOR Y/O<br>JEFE DE UNIDAD</div></div>
      <div class="col-6"><div style="border-top:1px solid #333; width:80%; margin:0 auto;"></div><div class="small mt-1">FIRMA DEL JEFE Y/O<br>DIRECTOR GENERAL</div></div>
    </div>`;
}

// =========================================================================
// EVENTOS DEL FORMULARIO
// =========================================================================
function setMsg(type, text) {
  const el = document.getElementById('reqMsg');
  if (!el) return;
  if (!type || !text) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${esc(text)}<button type="button" class="btn-close" onclick="this.parentElement.remove()"></button></div>`;
}

function refreshItemsTotal() {
  const el = document.getElementById('itemsTotal');
  if (el) el.textContent = totalCantidadItems();
}
function refreshEntTotal() {
  const el = document.getElementById('entTotal');
  if (el) el.textContent = totalEntregas();
}

async function buscarAreas() {
  const q = (document.getElementById('areaSearch') || {}).value || '';
  const box = document.getElementById('areaResults');
  if (!box) return;
  box.innerHTML = '<div class="text-muted small">Buscando…</div>';
  try {
    const resp = await api.list('areas', { page: 1, pageSize: 10, search: q.trim() });
    const rows = (resp && resp.data) || [];
    if (!rows.length) { box.innerHTML = '<div class="text-muted small">Sin resultados en Metas y Áreas.</div>'; return; }
    box.innerHTML = `<div class="list-group mb-2">${rows.map((r) => `
      <button type="button" class="list-group-item list-group-item-action area-pick"
        data-codigo="${esc(r.codigo)}" data-nombre="${esc(r.nombre)}" data-resp="${esc(r.responsable || '')}">
        <strong>${esc(r.codigo || '')}</strong> — ${esc(r.nombre || '')} <span class="text-muted small">(${esc(r.responsable || 'sin responsable')})</span>
      </button>`).join('')}</div>`;
    box.querySelectorAll('.area-pick').forEach((b) => b.onclick = () => {
      state.area = { codigo: b.dataset.codigo, nombre: b.dataset.nombre, responsable: b.dataset.resp };
      document.getElementById('areaNombre').value = state.area.nombre;
      document.getElementById('areaResponsable').value = state.area.responsable;
      box.innerHTML = '';
    });
  } catch (e) {
    box.innerHTML = `<div class="text-danger small">Error: ${esc(e.message)}</div>`;
  }
}

async function buscarItems() {
  const q = (document.getElementById('itemSearch') || {}).value || '';
  const box = document.getElementById('itemResults');
  if (!box) return;
  box.innerHTML = '<div class="text-muted small">Buscando…</div>';
  try {
    const resp = await api.list('catalogo', { page: 1, pageSize: 10, search: q.trim() });
    const rows = (resp && resp.data) || [];
    if (!rows.length) { box.innerHTML = '<div class="text-muted small">Sin resultados en Catálogo SIGAMEF.</div>'; return; }
    box.innerHTML = `<div class="list-group mb-2">${rows.map((r) => `
      <button type="button" class="list-group-item list-group-item-action item-pick"
        data-cod="${esc(r.item_bien)}" data-nom="${esc(r.nombre_item)}" data-um="${esc(r.unidad_medida || '')}" data-ft="${r.ficha_tecnica ? '1' : '0'}">
        <strong>${esc(r.item_bien || '')}</strong> — ${esc(r.nombre_item || '')} <span class="text-muted small">(${esc(r.unidad_medida || '')})</span>
        ${r.ficha_tecnica ? '<span class="badge bg-info ms-1">F.T.</span>' : ''}
      </button>`).join('')}</div>`;
    box.querySelectorAll('.item-pick').forEach((b) => b.onclick = () => {
      collectInputs();
      state.items.push({
        item_bien: b.dataset.cod, nombre_item: b.dataset.nom,
        unidad_medida: b.dataset.um, cantidad: 1, ficha_tecnica: b.dataset.ft === '1',
      });
      box.innerHTML = '';
      document.getElementById('itemSearch').value = '';
      rerenderBienesBody();
    });
  } catch (e) {
    box.innerHTML = `<div class="text-danger small">Error: ${esc(e.message)}</div>`;
  }
}

// Re-renderiza el formulario completo conservando lo escrito.
function rerenderBienesBody() {
  collectInputs();
  const host = document.getElementById('reqRoot');
  if (!host) return;
  host.innerHTML = renderBienes();
  attachBienes();
}

function collectInputs() {
  const g = (id) => (document.getElementById(id) || {}).value;
  if (document.getElementById('denominacion') != null) state.denominacion = g('denominacion') || '';
  if (document.getElementById('objetivo') != null) state.objetivo = g('objetivo') || '';
  if (document.getElementById('finalidad') != null) state.finalidad = g('finalidad') || '';
  if (document.getElementById('caracteristicas') != null) state.caracteristicas = g('caracteristicas') || '';
  document.querySelectorAll('.req-it').forEach((el) => {
    const i = Number(el.dataset.i);
    if (state.items[i]) state.items[i].cantidad = Number(el.value) || 0;
  });
  document.querySelectorAll('.req-gtitle').forEach((el) => {
    const k = el.dataset.key;
    if (!state.glosaOverrides[k]) state.glosaOverrides[k] = {};
    state.glosaOverrides[k].titulo = el.value;
  });
  document.querySelectorAll('.req-gcont').forEach((el) => {
    const k = el.dataset.key;
    if (!state.glosaOverrides[k]) state.glosaOverrides[k] = {};
    state.glosaOverrides[k].contenido = el.value;
  });
  document.querySelectorAll('.req-ent').forEach((el) => {
    const i = Number(el.dataset.i); const f = el.dataset.f;
    if (!state.entregas[i]) state.entregas[i] = { numero_entrega: i + 1, cantidad: 0, plazo: '', condicion: '' };
    state.entregas[i][f] = f === 'cantidad' ? (Number(el.value) || 0) : el.value;
  });
}

function attachBienes() {
  const back = document.getElementById('reqBack');
  if (back) back.onclick = () => showSelect();
  const save = document.getElementById('reqSave');
  if (save) save.onclick = () => saveRequerimiento();
  const print = document.getElementById('reqPrint');
  if (print) print.onclick = async () => {
    collectInputs();
    setMsg('info', 'Generando documento…');
    state.fichas = await fetchFichasParaItems(state.items);
    setMsg('', '');
    openPrintWindow(buildState());
  };

  const areaBtn = document.getElementById('areaBtn');
  if (areaBtn) areaBtn.onclick = buscarAreas;
  const areaSearch = document.getElementById('areaSearch');
  if (areaSearch) areaSearch.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarAreas(); } };

  const itemBtn = document.getElementById('itemBtn');
  if (itemBtn) itemBtn.onclick = buscarItems;
  const itemSearch = document.getElementById('itemSearch');
  if (itemSearch) itemSearch.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarItems(); } };

  document.querySelectorAll('.req-it').forEach((el) => el.oninput = () => {
    const i = Number(el.dataset.i);
    if (state.items[i]) state.items[i].cantidad = Number(el.value) || 0;
    refreshItemsTotal();
  });
  document.querySelectorAll('.req-it-del').forEach((b) => b.onclick = () => {
    collectInputs();
    state.items.splice(Number(b.dataset.i), 1);
    rerenderBienesBody();
  });

  const entAdd = document.getElementById('entAdd');
  if (entAdd) entAdd.onclick = () => {
    collectInputs();
    ensureEntregas().push({ numero_entrega: state.entregas.length + 1, cantidad: 0, plazo: '', condicion: '' });
    rerenderBienesBody();
  };
  document.querySelectorAll('.req-ent-del').forEach((b) => b.onclick = () => {
    if (state.entregas.length <= 1) return;
    collectInputs();
    state.entregas.splice(Number(b.dataset.i), 1);
    rerenderBienesBody();
  });
  document.querySelectorAll('.req-ent').forEach((el) => el.oninput = () => {
    const i = Number(el.dataset.i); const f = el.dataset.f;
    if (!state.entregas[i]) state.entregas[i] = { numero_entrega: i + 1, cantidad: 0, plazo: '', condicion: '' };
    state.entregas[i][f] = f === 'cantidad' ? (Number(el.value) || 0) : el.value;
    if (f === 'cantidad') refreshEntTotal();
  });
}

function buildState() {
  return JSON.parse(JSON.stringify(state));
}

// =========================================================================
// GUARDAR / ABRIR / ELIMINAR
// =========================================================================
async function fetchFichasParaItems(items) {
  // Para cada ítem con F.T., busca su Ficha NET por código (idcartcodigosiga).
  const fichas = [];
  for (const it of items) {
    if (!it.ficha_tecnica) continue;
    try {
      const resp = await api.list('fichanet', { page: 1, pageSize: 5, search: it.item_bien });
      const rows = (resp && resp.data) || [];
      const match = rows.find((r) => String(r.idcartcodigosiga || '').trim() === String(it.item_bien).trim()) || rows[0];
      if (match) fichas.push(match);
    } catch (_) { /* opcional */ }
  }
  return fichas;
}

async function saveRequerimiento() {
  collectInputs();
  setMsg('info', 'Guardando requerimiento…');
  const user = authService.getCurrentUser();
  const usuario = (user && (user.dni || user.nombre)) || 'sistema';
  const fichas = await fetchFichasParaItems(state.items);
  state.fichas = fichas;

  const payloadObj = {
    area: state.area,
    objetivo: state.objetivo,
    finalidad: state.finalidad,
    caracteristicas: state.caracteristicas,
    items: state.items,
    glosaOverrides: state.glosaOverrides,
    entregas: state.entregas,
    fichas,
    header: state.header,
  };
  const body = {
    tipo: 'bienes',
    denominacion: state.denominacion,
    area: state.area.nombre,
    responsable: state.area.responsable,
    estado: 'Registrado',
    payload: JSON.stringify(payloadObj),
    usuario_modificacion: usuario,
  };

  try {
    if (state.reqId) {
      await requerimientosService.update(state.reqId, body);
    } else {
      const created = await requerimientosService.create(body);
      if (created && created.id) {
        state.reqId = created.id;
        if (!created.codigo) {
          // Asigna un código legible basado en el id.
          const codigo = `REQ-B-${String(created.id).padStart(4, '0')}`;
          await requerimientosService.update(created.id, { codigo });
        }
      }
    }
    setMsg('success', 'Requerimiento guardado correctamente.');
  } catch (e) {
    setMsg('danger', `Error al guardar: ${e.message}`);
  }
}

function applyPayload(row) {
  let p = {};
  try { p = JSON.parse(row.payload || '{}'); } catch (_) { p = {}; }
  state.reqId = row.id;
  state.area = p.area || { codigo: '', nombre: row.area || '', responsable: row.responsable || '' };
  state.denominacion = row.denominacion || '';
  state.objetivo = p.objetivo || '';
  state.finalidad = p.finalidad || '';
  state.caracteristicas = p.caracteristicas || '';
  state.items = Array.isArray(p.items) ? p.items : [];
  state.glosaOverrides = p.glosaOverrides || {};
  state.entregas = Array.isArray(p.entregas) && p.entregas.length ? p.entregas : [];
  state.fichas = Array.isArray(p.fichas) ? p.fichas : [];
  if (p.header) state.header = p.header;
}

async function openRequerimiento(id) {
  try {
    const row = await requerimientosService.getById(id);
    resetState();
    await loadHeader();
    await loadGlosaDefaults();
    applyPayload(row);
    ensureEntregas();
    showBienes();
  } catch (e) {
    alert('Error al abrir: ' + e.message);
  }
}

async function deleteRequerimiento(id) {
  if (!confirm('¿Eliminar este requerimiento?')) return;
  try {
    await requerimientosService.remove(id);
    loadList();
  } catch (e) {
    alert('Error al eliminar: ' + e.message);
  }
}

async function printRequerimiento(id) {
  try {
    const row = await requerimientosService.getById(id);
    resetState();
    await loadHeader();
    await loadGlosaDefaults();
    applyPayload(row);
    openPrintWindow(buildState());
  } catch (e) {
    alert('Error al generar: ' + e.message);
  }
}

// =========================================================================
// NAVEGACIÓN
// =========================================================================
function resetState() {
  state = {
    view: 'select', reqId: null,
    header: { logo: '', entidadNombre: '' },
    area: { codigo: '', nombre: '', responsable: '' },
    denominacion: '', objetivo: '', finalidad: '', caracteristicas: '',
    items: [], glosaOverrides: {}, entregas: [], fichas: [],
  };
}

async function newRequerimiento(tipo) {
  if (tipo !== 'bienes') return;
  resetState();
  setRootLoading();
  await loadHeader();
  await loadGlosaDefaults();
  ensureEntregas();
  showBienes();
}

function setRootLoading() {
  const root = document.getElementById('reqRoot');
  if (root) root.innerHTML = '<div class="container-fluid py-5 text-center text-muted"><div class="spinner-border"></div><div class="mt-2">Cargando formato…</div></div>';
}

function showSelect() {
  state.view = 'select';
  const root = document.getElementById('reqRoot');
  if (root) { root.innerHTML = renderSelect(); attachSelect(); }
}

function showBienes() {
  state.view = 'bienes';
  const root = document.getElementById('reqRoot');
  if (root) { root.innerHTML = renderBienes(); attachBienes(); }
}

// =========================================================================
// DOCUMENTO IMPRIMIBLE (incluye Ficha NET adjunta)
// =========================================================================
function buildPrintHTML(s) {
  const { logo, entidadNombre } = s.header || {};
  const logoImg = logo ? `<img src="${logo}" style="max-height:70px;max-width:140px;object-fit:contain;">` : '';
  const ent = entidadNombre || 'INSTITUTO NACIONAL DE SALUD';

  const itemsRows = (s.items || []).map((it, i) => `
    <tr><td>${i + 1}</td><td>${esc(it.item_bien)}</td><td>${esc(it.nombre_item)}</td><td style="text-align:center">${esc(it.unidad_medida)}</td><td style="text-align:right">${esc(it.cantidad)}</td></tr>`).join('');
  const totalItems = (s.items || []).reduce((a, b) => a + (Number(b.cantidad) || 0), 0);

  const glosa = MODELO.map((item) => glosaPrint(item, s)).join('');

  const fichasHTML = (s.fichas && s.fichas.length)
    ? `<div class="pagebreak"></div><h3 style="text-align:center">FICHAS TÉCNICAS (FICHA NET) ADJUNTAS</h3>${s.fichas.map((f) => fichaNetPrint(f, ent, logo)).join('<div class="pagebreak"></div>')}`
    : '';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Requerimiento — ${esc(s.denominacion || 'Bienes')}</title>
  <style>
    * { box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color:#000; margin:0; padding:18px 26px; font-size:12px; line-height:1.4; }
    .hdr { display:flex; align-items:center; border:1px solid #000; margin-bottom:14px; }
    .hdr .logo { width:170px; border-right:1px solid #000; padding:8px; text-align:center; }
    .hdr .title { flex:1; text-align:center; padding:8px; }
    .hdr .title h1 { font-size:14px; margin:0 0 4px; }
    .hdr .title h2 { font-size:12px; margin:0; font-weight:normal; }
    h3.sec { font-size:12px; margin:14px 0 4px; }
    .fld { margin-bottom:8px; }
    .lbl { font-weight:bold; }
    .box { border:1px solid #000; padding:4px 7px; min-height:22px; white-space:pre-wrap; word-break:break-word; }
    table { width:100%; border-collapse:collapse; margin:6px 0; }
    th, td { border:1px solid #000; padding:4px 6px; font-size:11px; vertical-align:top; }
    th { background:#eee; }
    .firma { display:flex; justify-content:space-around; text-align:center; margin-top:120px; }
    .firma .l { border-top:1px solid #000; width:40%; padding-top:4px; }
    .pagebreak { page-break-before: always; }
    @media print { body { padding:10px 18px; } button { display:none; } }
    .bar { text-align:center; margin-bottom:14px; }
    .bar button { padding:8px 18px; font-size:13px; cursor:pointer; }
  </style></head><body>
  <div class="bar"><button onclick="window.print()">🖨 Imprimir / Guardar como PDF</button></div>
  <div class="hdr"><div class="logo">${logoImg}</div>
    <div class="title"><h1>${esc(ent)}</h1><h2>ANEXO N.º 01 — ESPECIFICACIONES TÉCNICAS PARA ADQUISICIÓN DE BIENES</h2></div></div>

  <h3 class="sec">1. ÁREA USUARIA / DEPENDENCIA QUE REQUIERE EL BIEN</h3>
  <div class="fld"><div class="box">${esc((s.area && s.area.nombre) || '')}${s.area && s.area.responsable ? ' — Responsable: ' + esc(s.area.responsable) : ''}</div></div>

  <h3 class="sec">2. DENOMINACIÓN DE LA CONTRATACIÓN</h3>
  <div class="fld"><div class="box">${esc(s.denominacion || '')}</div></div>

  <h3 class="sec">3. OBJETIVO Y/O FINALIDAD PÚBLICA</h3>
  <div class="fld"><div class="lbl">3.1. Objetivo</div><div class="box">${esc(s.objetivo || '')}</div></div>
  <div class="fld"><div class="lbl">3.2. Finalidad</div><div class="box">${esc(s.finalidad || '')}</div></div>

  <h3 class="sec">4. REQUERIMIENTO O CARACTERÍSTICAS TÉCNICAS</h3>
  <div class="fld"><div class="lbl">a) Descripción del bien</div>
    <table><thead><tr><th>N°</th><th>Código SIGAMEF</th><th>Descripción del bien</th><th>Unidad</th><th>Cantidad</th></tr></thead>
    <tbody>${itemsRows || '<tr><td colspan="5" style="text-align:center">—</td></tr>'}</tbody>
    <tfoot><tr><th colspan="4" style="text-align:right">TOTAL</th><th style="text-align:right">${totalItems}</th></tr></tfoot></table>
  </div>
  <div class="fld"><div class="lbl">b) Características técnicas</div><div class="box">${esc(s.caracteristicas || '')}</div></div>

  ${glosa}

  <div class="firma">
    <div class="l">FIRMA DEL SUB DIRECTOR Y/O<br>JEFE DE UNIDAD</div>
    <div class="l">FIRMA DEL JEFE Y/O<br>DIRECTOR GENERAL</div>
  </div>

  ${fichasHTML}
  </body></html>`;
}

function glosaTituloPrint(item, s) {
  const o = (s.glosaOverrides || {})[item.key];
  return o && o.titulo != null && o.titulo !== '' ? o.titulo : (item.titulo || '');
}
function glosaContPrint(item, s) {
  const o = (s.glosaOverrides || {})[item.key];
  if (o && o.contenido != null && o.contenido !== '') return o.contenido;
  return item.default || '';
}

function glosaPrint(item, s) {
  if (item.kind === 'firmas') return '';
  const pre = item.kind === 'literal' ? `${item.label}) ` : (item.label ? `${item.label}. ` : '');
  if (item.kind === 'heading') return `<h3 class="sec">${esc(pre)}${esc(glosaTituloPrint(item, s))}</h3>`;
  if (item.kind === 'plazo') {
    const ents = (s.entregas || []);
    const rows = ents.map((e, i) => `<tr><td style="text-align:center">${i + 1}</td><td style="text-align:right">${esc(e.cantidad)}</td><td>${esc(e.plazo)}</td><td>${esc(e.condicion)}</td></tr>`).join('');
    const tot = ents.reduce((a, b) => a + (Number(b.cantidad) || 0), 0);
    return `<h3 class="sec">${esc(pre)}${esc(glosaTituloPrint(item, s))}</h3>
      <div class="box">${esc(glosaContPrint(item, s) || item.intro || '')}</div>
      <table><thead><tr><th>N° Entrega</th><th>Cantidad</th><th>Plazo de Entrega</th><th>Condición de entrega</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="text-align:center">—</td></tr>'}</tbody>
      <tfoot><tr><th style="text-align:right">TOTAL</th><th style="text-align:right">${tot}</th><th colspan="2"></th></tr></tfoot></table>`;
  }
  return `<h3 class="sec">${esc(pre)}${esc(glosaTituloPrint(item, s))}</h3><div class="box">${esc(glosaContPrint(item, s))}</div>`;
}

function fichaNetPrint(f, ent, logo) {
  const logoImg = logo ? `<img src="${logo}" style="max-height:60px;max-width:120px;object-fit:contain;">` : '';
  const box = (l, v) => `<div class="fld"><div class="lbl">${esc(l)}</div><div class="box">${esc(v)}</div></div>`;
  return `
    <div class="hdr"><div class="logo">${logoImg}</div>
      <div class="title"><h1>REGISTRO FICHA NET</h1><h2>${esc(ent)}</h2></div></div>
    ${box('Clase de Artículo', f.dsclase)}
    ${box('Sub Clase de Artículo', f.dssubclase)}
    ${box('Código MEF', f.idcartcodigosiga)}
    ${box('Nombre', f.dscartnombre)}
    ${box('Otra(s) Denominación(es)', f.dscclasdescripcion)}
    ${box('Característica', f.dscartcaracteristica)}
    ${box('Documentos', f.dscartdocumentos)}
    ${box('Forma de Presentación', f.dscartpresentacion)}
    ${box('Vigencia', f.dscartfechavencimiento)}
    ${box('Observación', f.dscartobservaciones)}`;
}

function openPrintWindow(s) {
  const win = window.open('', '_blank');
  if (!win) { alert('Permita las ventanas emergentes para generar el documento.'); return; }
  win.document.open();
  win.document.write(buildPrintHTML(s));
  win.document.close();
}

// =========================================================================
// API DEL MÓDULO
// =========================================================================
export function renderRegistroRequerimientoView() {
  return '<div id="reqRoot"></div>';
}

export function initRegistroRequerimientoView() {
  resetState();
  showSelect();
}

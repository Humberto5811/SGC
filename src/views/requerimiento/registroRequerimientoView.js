// Registro de Requerimientos.
// Pantalla de selección de formato (Bienes, Servicios, Locadores, Licitaciones,
// Concursos) y el formulario completo del Formato Bienes (modelo v1):
//   - Cabecera con logo + nombre de entidad (Institucional → Logotipos / Datos de Entidad)
//   - 1) Área usuaria: búsqueda contra Metas y Áreas (código o nombre) + responsable
//   - 2) Denominación de la contratación (manual)
//   - 3) Objetivo (3.1) y Finalidad (3.2) (manual)
//   - 4) a) Ítems del Catálogo SIGAMEF (código/descripción) + cantidad; b) características técnicas por ítem
//   - Vinculación automática con Ficha NET (snapshot inmutable) integrada en formulario y PDF del numeral 4
import { api } from '../../services/apiService.js';
import { authService } from '../../services/authService.js';
import { getByCodigoSigamef } from '../../services/fichaNetService.js';
import {
  applyFichaNetToItem,
  renderFichaNetAlert,
  renderFichaNetContentBlock,
  showFichaNetPreviewModal,
  renderRequerimientoItemsPrintSection,
  FICHA_NET_PRINT_CSS,
} from '../../utils/fichaNetIntegration.js';
import { glosasBienesService } from '../../services/glosasBienesService.js';
import { glosasServiciosService } from '../../services/glosasServiciosService.js';
import { glosasLocadoresService } from '../../services/glosasLocadoresService.js';
import { requerimientosService } from '../../services/requerimientosService.js';
import { openAdjuntosModal, syncAdjuntosCount } from '../../utils/adjuntosModal.js';
import { MODELO } from '../glosasRequerimientos/formatoBienesModelo.js';
import { MODELO_SERVICIOS } from '../glosasRequerimientos/formatoServiciosModelo.js';
import { MODELO_LOCADORES } from '../glosasRequerimientos/formatoLocadoresModelo.js';
import { reqShared, estadoBadge, ultimaObservacion, todasObservaciones, historialHtml, addSubsanacion, showSubsanacionDirigidaModal, bindTrazabilidadButtons } from './reqShared.js';
import {
  renderFilterBarHtml, readFilterParams, enrichReqRow,
  renderSummaryCardsHtml, updateSummaryCards, wrapBandejaTable,
  renderTraceRowCells, renderActionMenuCell, bindActionMenus, bindBandejaToolbar,
  buildExportRowData, updateBandejaAdjCount,
  sortBandejaRows, bindSortHandlers, mergeSortParams,
} from '../../utils/trazabilidad.js';
import { registroMenuItems, registroHiddenActions } from '../../utils/bandejaActions.js';
import { loadRegistroBandeja } from '../../utils/bandejaRequerimientos.js';
import { usePagination } from '../../utils/paginacion.js';
import { openDetailPanel, bindRowDetailPanel, closeDetailPanel } from '../../components/bandejaDetailPanel.js';
import { handleBandejaObservaciones } from '../../components/modalObservaciones.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';

const registroPagination = usePagination('registro', loadRegistroBandeja, { defaultPageSize: 25 });

const DOC_TITULO = '__FORMATO_BIENES_DOC__';

const FORMATOS = [
  { tipo: 'bienes', label: 'Formato de Bienes', icon: 'bi-box-seam', color: 'primary', enabled: true },
  { tipo: 'servicios', label: 'Formato de Servicios', icon: 'bi-tools', color: 'success', enabled: true },
  { tipo: 'locacion', label: 'Formato de Locadores', icon: 'bi-person-badge', color: 'info', enabled: true },
  { tipo: 'licitaciones', label: 'Formato de Licitaciones', icon: 'bi-hammer', color: 'warning', enabled: false },
  { tipo: 'concurso', label: 'Formato de Concursos', icon: 'bi-trophy', color: 'danger', enabled: false },
];

let state = {
  view: 'select',          // 'select' | 'bienes' | 'servicios'
  reqId: null,
  codigo: '',              // Código del requerimiento
  cmn: '',                 // CMN N° (5 dígitos con ceros a la izquierda)
  header: { logo: '', entidadNombre: '' },
  area: { codigo: '', nombre: '', responsable: '' },
  denominacion: '',
  objetivo: '',
  finalidad: '',
  caracteristicas: '',     // 4b
  items: [],               // { item_bien, nombre_item, unidad_medida, cantidad, ficha_tecnica, codigoSigamef, fichaNetId, fichaNetVersion, fichaNetSnapshot, caracteristicas_tecnicas }
  glosaOverrides: {},      // overrides de c)…18 (cargados del Formato Bienes de Glosas)
  entregas: [],            // 14.1
  // --- Servicios ---
  servicioItems: [],       // { item_bien, nombre_item, unidad_medida, monto }
  servicioGlosaOverrides: {},
  servicioEntregas: [],    // tabla 9.2.1
  servicioInformacion: [], // tabla 9.2.2
  // --- Locadores ---
  locadorItems: [],        // { item_bien, nombre_item, unidad_medida, monto }
  locadorGlosaOverrides: {},
  locadorEntregas: [],     // tabla 8.2.1
  locadorInformacion: [],       // tabla 8.2.2
  locadorPerfil: { formacion: '', titulo: '', colegiado_habilitado: '', serum: '', otros: '' },
  locadorModalidad: '',
};

// Últimas filas cargadas en el listado (para exportar a Excel)
let lastListRows = [];
let registroListFilters = {};
let registroListSort = { sort: 'created_at', dir: 'desc' };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- Debounce para typeahead ----------
function debounce(fn, ms) {
  let timer;
  return function (...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), ms); };
}

// ---------- Autocomplete compartido Catálogo SIGAMEF ----------
// Busca en /catalogo/search, prioriza resultados que comienzan con el texto,
// muestra scroll vertical con todos los resultados, y ejecuta onSelect al elegir.
// PRIORIDAD 1: descripción/código comienza con el texto buscado
// PRIORIDAD 2: descripción/código contiene el texto en cualquier posición
function autocompleteCatalogo({ inputId, resultsId, tipoBien, onSelect, renderItem }) {
  const input = document.getElementById(inputId);
  const box = document.getElementById(resultsId);
  if (!input || !box) return;

  const handler = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="text-muted small">Buscando…</div>';
    try {
      const resp = await api.get(`/catalogo/search?search=${encodeURIComponent(q)}&tipo_bien=${tipoBien}&limit=200`);
      let rows = (resp && resp.data) || [];
      if (!rows.length) { box.innerHTML = '<div class="text-muted small">Sin resultados en Catálogo SIGAMEF.</div>'; return; }

      // Priorización client-side como respaldo a la del backend
      const lowerQ = q.toLowerCase();
      rows.sort((a, b) => {
        const aName = (a.nombre_item || '').toLowerCase();
        const bName = (b.nombre_item || '').toLowerCase();
        const aCode = (a.item_bien || '').toLowerCase();
        const bCode = (b.item_bien || '').toLowerCase();

        // Prioridad 1: comienza con el texto buscado (en nombre o código)
        const aStarts = aName.startsWith(lowerQ) || aCode.startsWith(lowerQ);
        const bStarts = bName.startsWith(lowerQ) || bCode.startsWith(lowerQ);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        // Dentro del mismo grupo, orden alfabético por nombre
        return aName.localeCompare(bName);
      });

      const itemsHtml = rows.map((r) => renderItem(r)).join('');
      box.innerHTML = `<div class="list-group mb-2" style="max-height: 300px; overflow-y: auto;">${itemsHtml}</div>`;

      box.querySelectorAll('.autocomplete-item').forEach((el) => {
        el.onclick = () => {
          onSelect(el.dataset);
          box.innerHTML = '';
          input.value = '';
        };
      });
    } catch (e) {
      box.innerHTML = `<div class="text-danger small">Error: ${esc(e.message)}</div>`;
    }
  }, 300);

  input.oninput = handler;
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); handler(); } };
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
    <div class="col-auto mb-2">
      <div class="card shadow-sm fmt-card ${f.enabled ? '' : 'opacity-75'}" data-tipo="${f.tipo}" data-enabled="${f.enabled}"
           style="cursor:${f.enabled ? 'pointer' : 'not-allowed'}; width: 130px;">
        <div class="card-body text-center p-2">
          <div class="h4 text-${f.color} mb-1"><i class="bi ${f.icon}"></i></div>
          <span class="badge ${f.enabled ? 'bg-success' : 'bg-secondary'}" style="font-size: 0.65rem;">${f.enabled ? 'Disponible' : 'En preparación'}</span>
          <div class="small fw-bold mt-1">${f.label.replace('Formato de ', '')}</div>
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
      <div class="d-flex flex-wrap gap-2 align-items-center mb-4" style="overflow-x: auto; white-space: nowrap;">
        ${cards}
      </div>
      <hr/>
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h5 class="mb-0"><i class="bi bi-list-check"></i> Requerimientos registrados</h5>
        <button id="reqExport" class="btn btn-sm btn-outline-success"><i class="bi bi-file-earmark-excel"></i> Exportar reporte</button>
      </div>
      ${renderSummaryCardsHtml('reqTrazaSummary')}
      ${renderFilterBarHtml('req', { hideExecutive: true })}
      <div id="reqList"><div class="text-muted">Cargando…</div></div>
    </div>
  `;
}
// Diálogo legacy — redirige al modal unificado de observaciones.
async function verObservacionesReadOnly(id) {
  const req = (lastListRows || []).find((x) => String(x.id) === String(id));
  if (!req) return;
  const allObs = todasObservaciones(req);
  await showTextModal({
    title: 'Historial de observaciones',
    historyHtml: historialHtml(allObs),
    readOnlyMode: true,
  });
}

async function loadList(sortOverride = {}, resetPage = false) {
  const cont = document.getElementById('reqList');
  if (!cont) return;
  try {
    registroListSort = mergeSortParams(registroListSort, sortOverride);
    if (resetPage) registroPagination.resetPage();
    const result = await registroPagination.loadData({
      ...registroListFilters,
      sort: registroListSort.sort,
      dir: registroListSort.dir,
    }, resetPage);
    let rows = (result.data || []).map(enrichReqRow);
    rows = sortBandejaRows(rows, registroListSort.sort, registroListSort.dir);
    lastListRows = rows;
    updateSummaryCards(rows, 'reqTrazaSummary');
    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">Aún no hay requerimientos registrados.</div>';
      return;
    }
    cont.innerHTML = wrapBandejaTable({
      containerId: 'reqList',
      prefix: 'req',
      sortState: registroListSort,
      bodyHtml: rows.map((r) => `
        <tr data-req-id="${r.id}">
          ${renderTraceRowCells(r, { prefix: 'req', escFn: esc })}
          ${renderActionMenuCell(r.id, registroMenuItems(r), registroHiddenActions(r, esc))}
        </tr>`).join(''),
    });
    bindTrazabilidadButtons(cont);
    bindActionMenus(cont, {
      detail: (id) => {
        const req = rows.find((x) => String(x.id) === String(id));
        if (req) openDetailPanel(req, { onAdjuntos: (rid) => manageAdjuntos(rid, /aprobad/i.test(String(req.estado || ''))) });
      },
      obs: (id) => handleBandejaObservaciones(id, rows, {
        submoduloLabel: 'Registro de Requerimiento',
        puedeObservar: (r) => !/aprobad/i.test(String(r.estado || '')) && !/tr[aá]mite/i.test(String(r.estado || '')),
        onSubsanar: async (reqId, data) => {
          const req = rows.find((x) => String(x.id) === String(reqId));
          if (!req) return;
          await addSubsanacion(req, data.texto, data.usuario, {
            observacion_id: data.observacion_id,
            destino_submodulo: data.destino_submodulo,
            destino_etapa: data.destino_etapa,
            destino_persona: data.destino_persona,
            origen_submodulo: data.origen_submodulo,
          });
        },
        onAdjuntos: (rid) => {
          const req = rows.find((x) => String(x.id) === String(rid));
          openAdjuntosModal(rid, req && /aprobad/i.test(String(req.estado || '')));
        },
        onReload: () => loadList(),
        bandejaPrefix: 'req',
      }),
      approve: (id) => solicitarAprobacion(id),
    });
    bindRowDetailPanel(cont, rows, {
      onAdjuntos: (id) => {
        const req = rows.find((x) => String(x.id) === String(id));
        manageAdjuntos(id, req && /aprobad/i.test(String(req.estado || '')));
      },
    });
    cont.querySelectorAll('.req-open').forEach((b) => b.onclick = () => openRequerimiento(b.dataset.id));
    cont.querySelectorAll('.req-print').forEach((b) => b.onclick = () => printRequerimiento(b.dataset.id));
    cont.querySelectorAll('.req-attach').forEach((b) => b.onclick = () => {
      manageAdjuntos(b.dataset.id, /aprobad/i.test(String(b.dataset.estado || '')));
    });
    cont.querySelectorAll('.req-approve').forEach((b) => b.onclick = () => solicitarAprobacion(b.dataset.id));
    cont.querySelectorAll('.req-ver-obs').forEach((b) => b.onclick = () => verObservacionesReadOnly(b.dataset.id));
    cont.querySelectorAll('.req-del').forEach((b) => b.onclick = () => deleteRequerimiento(b.dataset.id));
    rows.forEach((r) => cargarContadorAdjuntos(r.id));
    bindSortHandlers(document.getElementById('reqList-wrap'), (p) => loadList(p, true), {
      getSort: () => registroListSort,
    });
    registroPagination.renderControls('reqList-wrap', () => loadList({}, false));
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error al cargar: ${esc(e.message)}</div>`;
  }
}

function exportarReporte() {
  try {
    const rows = lastListRows || [];
    if (!rows.length) { alert('No hay requerimientos para exportar.'); return; }
    const data = rows.map((r) => buildExportRowData(r));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 28 }, { wch: 22 },
      { wch: 14 }, { wch: 22 }, { wch: 24 }, { wch: 8 }, { wch: 20 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Requerimientos');
    XLSX.writeFile(wb, `requerimientos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (e) {
    alert('Error al exportar el reporte: ' + e.message);
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
  const rl = document.getElementById('reqExport');
  if (rl) rl.onclick = exportarReporte;
  bindBandejaToolbar({
    prefix: 'req',
    onFilter: () => { registroListFilters = readFilterParams('req'); loadList({}, true); },
    onClear: () => { registroListFilters = {}; loadList({}, true); },
  });
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
        <div ${reqShared.editingFromEvaluacion ? 'style="display:none"' : ''}>
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

      <!-- Cabecera: logo + entidad + títulos centrados -->
      <div class="card mb-3">
        <div class="card-body d-flex align-items-center gap-3">
          <div style="width:150px; text-align:center;">${logoImg}</div>
          <div class="flex-fill text-center">
            <div class="fw-bold">${esc(entidadNombre || 'INSTITUTO NACIONAL DE SALUD')}</div>
            <div class="mt-2">
              <div class="fw-bold">ANEXO N° 01</div>
              <div class="text-uppercase small fw-bold">ESPECIFICACIONES TÉCNICAS PARA ADQUISICIÓN DE BIENES</div>
            </div>
            <div class="mt-3 d-flex align-items-center justify-content-center gap-3">
              <div class="fw-bold bg-light d-inline-block px-3 py-1 rounded">REQUERIMIENTO N° ${state.codigo || '00000'}</div>
              <div class="d-flex align-items-center gap-1">
                <span class="fw-bold small">CMN N°</span>
                <input id="reqCmn" class="form-control form-control-sm" type="text" inputmode="numeric" maxlength="5"
                  style="width: 80px; text-align: center;" value="${esc(state.cmn || '')}"
                  placeholder="00000" />
              </div>
            </div>
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
              <label class="form-label small mb-0">Centro</label>
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
          ${renderItemsFichaSections()}
        </div>

      </div></div>

      <!-- c)…18 + firmas (cargado automáticamente del Formato Bienes de Glosas) -->
      <div class="card border-0 shadow-sm">
        <div class="card-body pt-2" id="reqGlosa">${MODELO.map(renderGlosaSection).join('')}</div>
      </div>
    </div>
  `;
}

function renderItemsTable() {
  const rows = state.items.map((it, i) => `
    <tr>
      <td>${esc(it.item_bien)}${it.ficha_tecnica ? ' <span class="badge bg-info" title="Ficha Técnica">F.T.</span>' : ''}${it.producto_controlado ? ' <span class="badge bg-danger" title="Producto Controlado">P.C.</span>' : ''}${it.acuerdo_marco ? ' <span class="badge bg-success" title="Acuerdo Marco">A.M.</span>' : ''}</td>
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
        <tfoot><tr class="table-secondary fw-bold"><td colspan="3" class="text-end">TOTAL CANTIDAD</td><td id="itemsTotal">${totalCantidadItems()}</td><td style="width:60px"></td></tr></tfoot>
      </table>
    </div>`;
}

function syncEntregaCantidadFromItems() {
  const total = totalCantidadItems();
  ensureEntregas();
  if (state.entregas[0]) {
    state.entregas[0].cantidad = total;
    const el = document.querySelector('.req-ent[data-i="0"][data-f="cantidad"]');
    if (el && document.activeElement !== el) el.value = total;
    refreshEntTotal();
  }
}

function renderItemsFichaSections() {
  if (!state.items.length) {
    return `<div class="fw-bold mb-1">b) Características técnicas</div>
      <div class="text-muted small border rounded p-3">Agregue ítems en el apartado a) para vincular automáticamente la Ficha NET.</div>`;
  }
  const multi = state.items.length > 1;
  return state.items.map((it, i) => {
    const linked = !!(it.fichaNetSnapshot && it.fichaNetId != null);
    const manual = it.caracteristicas_tecnicas ?? (!multi ? state.caracteristicas : '') ?? '';
    const header = multi
      ? `<div class="fw-bold mt-3 mb-2 border-bottom pb-1">ÍTEM ${i + 1} — ${esc(it.item_bien)} — ${esc(it.nombre_item)}</div>`
      : '';
    const previewBtn = linked
      ? `<button type="button" class="btn btn-sm btn-outline-info req-ficha-preview" data-i="${i}"><i class="bi bi-eye"></i> Ver Ficha NET</button>`
      : '';
    const manualField = linked
      ? renderFichaNetContentBlock(it.fichaNetSnapshot)
      : `<textarea class="form-control req-item-car" data-i="${i}" rows="4" placeholder="Ingrese las características técnicas del ítem…">${esc(manual)}</textarea>`;
    return `${header}
      <div class="mb-3 req-item-ficha" data-i="${i}">
        <div class="fw-bold mb-1">b) Características técnicas${multi ? ` (Ítem ${i + 1})` : ''}</div>
        <div class="mb-2">${renderFichaNetAlert(linked)}</div>
        ${manualField}
        ${previewBtn ? `<div class="mt-2">${previewBtn}</div>` : ''}
      </div>`;
  }).join('');
}

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
  if (q.trim().length < 2) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="text-muted small">Buscando…</div>';
  try {
    const resp = await api.list('areas', { page: 1, pageSize: 15, search: q.trim() });
    const rows = (resp && resp.data) || [];
    if (!rows.length) { box.innerHTML = '<div class="text-muted small">Sin resultados en Metas y Áreas.</div>'; return; }
    box.innerHTML = `<div class="list-group mb-2" style="max-height:200px; overflow-y:auto;">${rows.map((r) => `
      <button type="button" class="list-group-item list-group-item-action area-pick"
        data-codigo="${esc(r.codigo)}" data-nombre="${esc(r.nombre)}" data-resp="${esc(r.responsable || '')}">
        <strong>${esc(r.codigo || '')}</strong> — ${esc(r.nombre || '')} <span class="text-muted small">(${esc(r.responsable || 'sin responsable')})</span>
      </button>`).join('')}</div>`;
    box.querySelectorAll('.area-pick').forEach((b) => b.onclick = () => {
      state.area = { codigo: b.dataset.codigo, nombre: b.dataset.nombre, responsable: b.dataset.resp };
      document.getElementById('areaNombre').value = state.area.nombre;
      document.getElementById('areaResponsable').value = state.area.responsable;
      box.innerHTML = '';
      document.getElementById('areaSearch').value = '';
    });
  } catch (e) {
    box.innerHTML = `<div class="text-danger small">Error: ${esc(e.message)}</div>`;
  }
}
const buscarAreasDebounced = debounce(buscarAreas, 300);

// NOTA: buscarItems, buscarItemsServicio, buscarItemsLocador y sus debounced
// han sido reemplazados por la función compartida autocompleteCatalogo
// que se configura directamente en attachBienes/attachServicios/attachLocadores.

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
  document.querySelectorAll('.req-item-car').forEach((el) => {
    const i = Number(el.dataset.i);
    if (state.items[i]) state.items[i].caracteristicas_tecnicas = el.value;
  });
  state.caracteristicas = state.items.map((it) => it.caracteristicas_tecnicas).filter(Boolean).join('\n\n---\n\n');
  if (document.getElementById('reqCmn') != null) {
    const raw = g('reqCmn') || '';
    const num = parseInt(raw.replace(/\D/g, ''), 10);
    state.cmn = isNaN(num) ? '' : String(num).padStart(5, '0');
  }
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
  if (back) back.onclick = () => {
    if (reqShared.editingFromEvaluacion && reqShared.onBackToEvaluacion) {
      reqShared.onBackToEvaluacion();
    } else {
      showSelect();
    }
  };
  const save = document.getElementById('reqSave');
  if (save) save.onclick = () => saveRequerimiento();
  const print = document.getElementById('reqPrint');
  if (print) print.onclick = () => {
    collectInputs();
    openPrintWindow(buildState());
  };

  // Auto-formato CMN: al perder el foco, rellena con ceros a la izquierda a 5 dígitos
  const cmnInput = document.getElementById('reqCmn');
  if (cmnInput) {
    cmnInput.onblur = () => {
      const raw = cmnInput.value || '';
      const num = parseInt(raw.replace(/\D/g, ''), 10);
      cmnInput.value = isNaN(num) ? '' : String(num).padStart(5, '0');
      state.cmn = cmnInput.value;
    };
    // Restringir solo números mientras escribe
    cmnInput.oninput = () => {
      cmnInput.value = cmnInput.value.replace(/\D/g, '').slice(0, 5);
    };
  }

  const areaBtn = document.getElementById('areaBtn');
  if (areaBtn) areaBtn.onclick = buscarAreas;
  const areaSearch = document.getElementById('areaSearch');
  if (areaSearch) {
    areaSearch.oninput = buscarAreasDebounced;
    areaSearch.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarAreas(); } };
  }

  // Autocomplete Catálogo SIGAMEF para Bienes (tipo_bien = B)
  autocompleteCatalogo({
    inputId: 'itemSearch',
    resultsId: 'itemResults',
    tipoBien: 'B',
    renderItem: (r) => {
      let badges = '';
      if (r.ficha_tecnica) badges += '<span class="badge bg-info ms-1">F.T.</span>';
      if (r.producto_controlado) badges += '<span class="badge bg-danger ms-1">P.C.</span>';
      if (r.acuerdo_marco) badges += '<span class="badge bg-success ms-1">A.M.</span>';
      const precio = Number(r.precio_unitario || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `<button type="button" class="list-group-item list-group-item-action autocomplete-item"
        data-cod="${esc(r.item_bien)}" data-nom="${esc(r.nombre_item)}" data-um="${esc(r.unidad_medida || '')}" data-ft="${r.ficha_tecnica ? '1' : '0'}" data-pc="${r.producto_controlado ? '1' : '0'}" data-am="${r.acuerdo_marco ? '1' : '0'}" data-precio="${Number(r.precio_unitario) || 0}">
        <strong>${esc(r.item_bien || '')}</strong> — ${esc(r.nombre_item || '')} <span class="text-muted small">(${esc(r.unidad_medida || '')}) S/. ${precio}</span>
        ${badges}
      </button>`;
    },
    onSelect: async (data) => {
      collectInputs();
      const item = {
        item_bien: data.cod,
        codigoSigamef: data.cod,
        nombre_item: data.nom,
        unidad_medida: data.um,
        cantidad: 1,
        ficha_tecnica: data.ft === '1',
        producto_controlado: data.pc === '1',
        acuerdo_marco: data.am === '1',
        precio_unitario: Number(data.precio) || 0,
        fichaNetId: null,
        fichaNetVersion: null,
        fichaNetSnapshot: null,
        caracteristicas_tecnicas: '',
      };
      state.items.push(item);
      try {
        const ficha = await getByCodigoSigamef(data.cod);
        applyFichaNetToItem(item, ficha);
      } catch (_) {
        applyFichaNetToItem(item, null);
      }
      syncEntregaCantidadFromItems();
      rerenderBienesBody();
    },
  });
  // Botón manual ejecuta búsqueda
  const itemBtn = document.getElementById('itemBtn');
  if (itemBtn) itemBtn.onclick = () => {
    const evt = new Event('input');
    document.getElementById('itemSearch')?.dispatchEvent(evt);
  };

  document.querySelectorAll('.req-ficha-preview').forEach((b) => {
    b.onclick = () => {
      const it = state.items[Number(b.dataset.i)];
      if (it && it.fichaNetSnapshot) showFichaNetPreviewModal(it.fichaNetSnapshot);
    };
  });

  document.querySelectorAll('.req-it').forEach((el) => el.oninput = () => {
    const i = Number(el.dataset.i);
    if (state.items[i]) state.items[i].cantidad = Number(el.value) || 0;
    refreshItemsTotal();
    syncEntregaCantidadFromItems();
  });
  document.querySelectorAll('.req-it-del').forEach((b) => b.onclick = () => {
    collectInputs();
    state.items.splice(Number(b.dataset.i), 1);
    syncEntregaCantidadFromItems();
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

  syncEntregaCantidadFromItems();
}

function buildState() {
  return JSON.parse(JSON.stringify(state));
}

// =========================================================================
// GUARDAR / ABRIR / ELIMINAR
// =========================================================================
async function ensureFichaNetOnItems(items) {
  for (const it of items) {
    if (it.fichaNetSnapshot && it.fichaNetId != null) continue;
    if (!it.codigoSigamef) it.codigoSigamef = it.item_bien;
    try {
      const ficha = await getByCodigoSigamef(it.item_bien);
      applyFichaNetToItem(it, ficha);
    } catch (_) {
      applyFichaNetToItem(it, null);
    }
  }
}

async function saveRequerimiento() {
  collectInputs();
  setMsg('info', 'Guardando requerimiento…');
  const user = authService.getCurrentUser();
  const usuario = getUserDisplayName(user) || 'sistema';
  await ensureFichaNetOnItems(state.items);
  collectInputs();

  const payloadObj = {
    area: state.area,
    objetivo: state.objetivo,
    finalidad: state.finalidad,
    caracteristicas: state.caracteristicas,
    items: state.items,
    glosaOverrides: state.glosaOverrides,
    entregas: state.entregas,
    header: state.header,
    observaciones: state.observaciones || [],
  };
  // Formatear cmn a 5 dígitos con ceros a la izquierda
  const cmnRaw = state.cmn || '';
  const cmnNum = parseInt(cmnRaw.replace(/\D/g, ''), 10);
  const cmnFormatted = isNaN(cmnNum) ? '' : String(cmnNum).padStart(5, '0');
  state.cmn = cmnFormatted;

  const body = {
    tipo: 'bienes',
    cmn: cmnFormatted,
    denominacion: state.denominacion,
    area: state.area.nombre,
    responsable: state.area.responsable,
    payload: JSON.stringify(payloadObj),
    usuario_modificacion: usuario,
  };
  if (!reqShared.editingFromEvaluacion) {
    body.estado = 'Registrado';
  }

  try {
    if (state.reqId) {
      await requerimientosService.update(state.reqId, body);
      // Actualizar el código en el state después de actualizar
      if (body.codigo) state.codigo = body.codigo;
      state.cmn = cmnFormatted;
    } else {
      const created = await requerimientosService.create(body);
      if (created && created.id) {
        state.reqId = created.id;
        if (!created.codigo) {
          // Asigna un código legible único REQ-XXXXX (sin letra de tipo)
          const codigo = `REQ-${String(created.id).padStart(5, '0')}`;
          await requerimientosService.update(created.id, { codigo });
          state.codigo = codigo;
        } else {
          state.codigo = created.codigo;
        }
      }
    }
    setMsg('success', 'Requerimiento guardado correctamente.');
    // Refrescar la lista si estamos en la vista de selección
    if (state.view === 'select') {
      loadList();
    } else {
      // Si estamos en el formulario, actualizar la visualización del código
      const codigoElement = document.querySelector('.bg-light.d-inline-block');
      if (codigoElement) codigoElement.textContent = `REQUERIMIENTO N° ${state.codigo || '00000'}`;
    }
  } catch (e) {
    setMsg('danger', `Error al guardar: ${e.message}`);
  }
}

function applyPayload(row) {
  let p = {};
  try { p = JSON.parse(row.payload || '{}'); } catch (_) { p = {}; }
  state.reqId = row.id;
  state.codigo = row.codigo || '';
  state.cmn = row.cmn || '';
  state.area = p.area || { codigo: '', nombre: row.area || '', responsable: row.responsable || '' };
  state.denominacion = row.denominacion || '';
  state.objetivo = p.objetivo || '';
  state.finalidad = p.finalidad || '';
  state.caracteristicas = p.caracteristicas || '';
  state.items = Array.isArray(p.items) ? p.items : [];
  state.glosaOverrides = p.glosaOverrides || {};
  state.entregas = Array.isArray(p.entregas) && p.entregas.length ? p.entregas : [];
  state.observaciones = Array.isArray(p.observaciones) ? p.observaciones : [];
  const fichasLegacy = Array.isArray(p.fichas) ? p.fichas : [];
  state.items.forEach((it) => {
    if (!it.codigoSigamef) it.codigoSigamef = it.item_bien;
    if (it.fichaNetSnapshot && it.fichaNetId != null) return;
    const legacy = fichasLegacy.find((f) => String(f.idcartcodigosiga || '').trim() === String(it.item_bien || '').trim());
    if (legacy) applyFichaNetToItem(it, legacy);
    else if (p.caracteristicas && state.items.length === 1 && !it.caracteristicas_tecnicas) {
      it.caracteristicas_tecnicas = p.caracteristicas;
    }
  });
  state.caracteristicas = state.items.map((it) => it.caracteristicas_tecnicas).filter(Boolean).join('\n\n---\n\n') || p.caracteristicas || '';
  if (p.header) state.header = p.header;
}

async function openRequerimiento(id) {
  closeDetailPanel();
  try {
    const row = await requerimientosService.getById(id);
    resetState();
    await loadHeader();
    if (row.tipo === 'servicios') {
      await loadServicioGlosaDefaults();
      applyPayloadServicios(row);
      ensureServicioEntregas();
      ensureServicioInformacion();
      showServicios();
    } else if (row.tipo === 'locacion') {
      await loadLocadorGlosaDefaults();
      applyPayloadLocador(row);
      ensureLocadorEntregas();
      // Cargar carreras profesionales para el selector de Título en edición
      try {
        const resp = await api.get('/carreras?pageSize=2000');
        state.carrerasLista = (resp.data || []).map(c => c.nombre_carrera).sort();
      } catch (_) { state.carrerasLista = []; }
      showLocadores();
    } else {
      await loadGlosaDefaults();
      applyPayload(row);
      ensureEntregas();
      showBienes();
    }
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
    if (row.tipo === 'servicios') {
      await loadServicioGlosaDefaults();
      applyPayloadServicios(row);
      openPrintWindowServicios(buildState());
    } else if (row.tipo === 'locacion') {
      await loadLocadorGlosaDefaults();
      applyPayloadLocador(row);
      openPrintWindowLocadores(buildState());
    } else {
      await loadGlosaDefaults();
      applyPayload(row);
      openPrintWindow(buildState());
    }
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
    codigo: '',
    cmn: '',
    header: { logo: '', entidadNombre: '' },
    area: { codigo: '', nombre: '', responsable: '' },
    denominacion: '', objetivo: '', finalidad: '', caracteristicas: '',
    items: [], glosaOverrides: {}, entregas: [], observaciones: [],
    servicioItems: [], servicioGlosaOverrides: {}, servicioEntregas: [], servicioInformacion: [],
    locadorItems: [], locadorGlosaOverrides: {}, locadorEntregas: [],
    locadorPerfil: { formacion: '', titulo: '', habilitacion: '', serum: '', otros: '' }, locadorModalidad: '',
  };
}

async function newRequerimiento(tipo) {
  closeDetailPanel();
  if (tipo === 'bienes') {
    resetState();
    setRootLoading();
    await loadHeader();
    await loadGlosaDefaults();
    ensureEntregas();
    showBienes();
  } else if (tipo === 'servicios') {
    resetState();
    setRootLoading();
    await loadHeader();
    await loadServicioGlosaDefaults();
    ensureServicioEntregas();
    ensureServicioInformacion();
    showServicios();
  } else if (tipo === 'locacion') {
    resetState();
    setRootLoading();
    await loadHeader();
    await loadLocadorGlosaDefaults();
    ensureLocadorEntregas();
    // Cargar carreras profesionales para el selector de Título
    try {
      const resp = await api.get('/carreras?pageSize=2000');
      state.carrerasLista = (resp.data || []).map(c => c.nombre_carrera).sort();
    } catch (_) { state.carrerasLista = []; }
    showLocadores();
  }
}

function setRootLoading() {
  const root = document.getElementById('reqRoot');
  if (root) root.innerHTML = '<div class="container-fluid py-5 text-center text-muted"><div class="spinner-border"></div><div class="mt-2">Cargando formato…</div></div>';
}

function showSelect() {
  closeDetailPanel();
  state.view = 'select';
  const root = document.getElementById('reqRoot');
  if (root) { root.innerHTML = renderSelect(); attachSelect(); }
}

function showBienes() {
  closeDetailPanel();
  state.view = 'bienes';
  const root = document.getElementById('reqRoot');
  if (root) { root.innerHTML = renderBienes(); attachBienes(); }
}

function showServicios() {
  closeDetailPanel();
  state.view = 'servicios';
  const root = document.getElementById('reqRoot');
  if (root) { root.innerHTML = renderServicios(); attachServicios(); }
}

function showLocadores() {
  closeDetailPanel();
  state.view = 'locacion';
  const root = document.getElementById('reqRoot');
  if (root) { root.innerHTML = renderLocadores(); attachLocadores(); }
}

// =========================================================================
// SERVICIOS — FORMULARIO COMPLETO
// =========================================================================
const DOC_TITULO_SERV = '__FORMATO_SERVICIOS_DOC__';

function ensureServicioEntregas() {
  if (!Array.isArray(state.servicioEntregas) || !state.servicioEntregas.length) {
    state.servicioEntregas = [{ plazo: '', condicion: '' }];
  }
  return state.servicioEntregas;
}
function ensureServicioInformacion() {
  if (!Array.isArray(state.servicioInformacion) || !state.servicioInformacion.length) {
    state.servicioInformacion = [{ entregable: '', plazo: '', porcentaje: '' }];
  }
  return state.servicioInformacion;
}

async function loadServicioGlosaDefaults() {
  try {
    const resp = await glosasServiciosService.getAll();
    const rows = (resp && resp.data) || [];
    const docRow = rows.find((r) => r.titulo === DOC_TITULO_SERV);
    if (docRow) {
      try {
        const parsed = JSON.parse(docRow.contenido || '{}');
        if (!Object.keys(state.servicioGlosaOverrides).length) state.servicioGlosaOverrides = parsed.overrides || {};
        if (!state.servicioEntregas.length && Array.isArray(parsed.entregas)) state.servicioEntregas = parsed.entregas;
        if (!state.servicioInformacion.length && Array.isArray(parsed.informacion)) state.servicioInformacion = parsed.informacion;
      } catch (_) { /* contenido no-JSON */ }
    }
  } catch (_) { /* si falla, se usan los valores por defecto del MODELO_SERVICIOS */ }
}

function applyPayloadServicios(row) {
  let p = {};
  try { p = JSON.parse(row.payload || '{}'); } catch (_) { p = {}; }
  state.reqId = row.id;
  state.codigo = row.codigo || '';
  state.cmn = row.cmn || '';
  state.area = p.area || { codigo: '', nombre: row.area || '', responsable: row.responsable || '' };
  state.denominacion = row.denominacion || '';
  state.objetivo = p.objetivo || '';
  state.finalidad = p.finalidad || '';
  state.servicioItems = Array.isArray(p.servicioItems) ? p.servicioItems : [];
  state.servicioGlosaOverrides = p.servicioGlosaOverrides || {};
  state.servicioEntregas = Array.isArray(p.servicioEntregas) ? p.servicioEntregas : [];
  state.servicioInformacion = Array.isArray(p.servicioInformacion) ? p.servicioInformacion : [];
  state.observaciones = Array.isArray(p.observaciones) ? p.observaciones : [];
  if (p.header) state.header = p.header;
}

function totalMontoServicios() {
  return state.servicioItems.reduce((s, it) => s + (Number(it.monto) || 0), 0);
}

function srvTituloDe(item) {
  const o = state.servicioGlosaOverrides[item.key];
  return o && o.titulo != null && o.titulo !== '' ? o.titulo : (item.titulo || '');
}
function srvContenidoDe(item) {
  const o = state.servicioGlosaOverrides[item.key];
  if (o && o.contenido != null && o.contenido !== '') return o.contenido;
  return item.default || '';
}

function renderServicios() {
  const { logo, entidadNombre } = state.header;
  const logoImg = logo
    ? `<img src="${logo}" alt="logo" style="max-height:64px;max-width:130px;object-fit:contain;">`
    : '<span class="text-muted small">Sin logo</span>';

  return `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div ${reqShared.editingFromEvaluacion ? 'style="display:none"' : ''}>
          <h3 class="mb-1"><i class="bi bi-tools"></i> Registro de Requerimiento — Formato de Servicios</h3>
          <p class="text-muted mb-0">Anexo N.° 02 — Términos de Referencia para Contratación de Servicios</p>
        </div>
        <div class="btn-group">
          <button id="reqBack" class="btn btn-outline-secondary"><i class="bi bi-arrow-left"></i> Volver</button>
          <button id="reqSave" class="btn btn-success"><i class="bi bi-save"></i> Grabar</button>
          <button id="reqPrint" class="btn btn-dark"><i class="bi bi-printer"></i> Generar documento</button>
        </div>
      </div>
      <div id="reqMsg"></div>

      <!-- Cabecera -->
      <div class="card mb-3">
        <div class="card-body d-flex align-items-center gap-3">
          <div style="width:150px; text-align:center;">${logoImg}</div>
          <div class="flex-fill text-center">
            <div class="fw-bold">${esc(entidadNombre || 'INSTITUTO NACIONAL DE SALUD')}</div>
            <div class="mt-2">
              <div class="fw-bold">ANEXO N° 02</div>
              <div class="text-uppercase small fw-bold">TÉRMINOS DE REFERENCIA PARA CONTRATACIÓN DE SERVICIOS EN GENERAL</div>
            </div>
            <div class="mt-3 d-flex align-items-center justify-content-center gap-3">
              <div class="fw-bold bg-light d-inline-block px-3 py-1 rounded">REQUERIMIENTO N° ${state.codigo || '00000'}</div>
              <div class="d-flex align-items-center gap-1">
                <span class="fw-bold small">CMN N°</span>
                <input id="reqCmn" class="form-control form-control-sm" type="text" inputmode="numeric" maxlength="5"
                  style="width: 80px; text-align: center;" value="${esc(state.cmn || '')}" placeholder="00000" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-3"><div class="card-body">
        <!-- 1) ÁREA USUARIA -->
        <div class="mb-3">
          <div class="fw-bold mb-1">1. ÁREA USUARIA / DEPENDENCIA QUE REQUIERE EL SERVICIO</div>
          <div class="input-group mb-2">
            <input id="areaSearch" class="form-control" placeholder="Ingrese código o nombre del área usuaria…" />
            <button id="areaBtn" class="btn btn-outline-primary" type="button"><i class="bi bi-search"></i> Buscar</button>
          </div>
          <div id="areaResults"></div>
          <div class="row g-2">
            <div class="col-md-6"><label class="form-label small mb-0">Área usuaria</label><input id="areaNombre" class="form-control" value="${esc(state.area.nombre)}" readonly /></div>
            <div class="col-md-6"><label class="form-label small mb-0">Centro</label><input id="areaResponsable" class="form-control" value="${esc(state.area.responsable)}" readonly /></div>
          </div>
        </div>

        <!-- 2) DENOMINACIÓN -->
        <div class="mb-3">
          <div class="fw-bold mb-1">2. DENOMINACIÓN DE LA CONTRATACIÓN</div>
          <input id="denominacion" class="form-control" value="${esc(state.denominacion)}" placeholder="Ingrese la denominación de la contratación" />
        </div>

        <!-- 3) OBJETIVO Y/O FINALIDAD PÚBLICA -->
        <div class="mb-2 fw-bold">3. OBJETIVO Y/O FINALIDAD PÚBLICA</div>
        <div class="mb-3"><div class="fw-bold mb-1">3.1. OBJETIVO</div><textarea id="objetivo" class="form-control" rows="2" placeholder="Describa el objetivo">${esc(state.objetivo)}</textarea></div>
        <div class="mb-3"><div class="fw-bold mb-1">3.2. FINALIDAD</div><textarea id="finalidad" class="form-control" rows="2" placeholder="Describa la finalidad pública">${esc(state.finalidad)}</textarea></div>

        <!-- 4) DESCRIPCIÓN DEL SERVICIO -->
        <div class="mb-2 fw-bold">4. DESCRIPCIÓN DEL SERVICIO</div>
        <div class="mb-3">
          <div class="fw-bold mb-1">4.1. Requerimiento</div>
          <div class="input-group mb-2">
            <input id="srvItemSearch" class="form-control" placeholder="Ingrese código o descripción del servicio (Catálogo SIGAMEF)…" />
            <button id="srvItemBtn" class="btn btn-outline-primary" type="button"><i class="bi bi-search"></i> Buscar</button>
          </div>
          <div id="srvItemResults"></div>
          ${renderServicioItemsTable()}
        </div>
      </div></div>

      <!-- 4.2…16 + firmas (TDR Servicios) -->
      <div class="card">
        <div class="card-body" id="reqGlosaSrv">${MODELO_SERVICIOS.map(renderServicioGlosaSection).join('')}</div>
      </div>
    </div>
  `;
}

function renderServicioItemsTable() {
  const rows = state.servicioItems.map((it, i) => `
    <tr>
      <td>${esc(it.item_bien)}</td>
      <td>${esc(it.nombre_item)}</td>
      <td class="text-center">${esc(it.unidad_medida)}</td>
      <td style="width:140px"><input class="form-control form-control-sm srv-it-monto" data-i="${i}" type="number" min="0" step="0.01" value="${esc(it.monto ?? 0)}" /></td>
      <td class="text-center"><button class="btn btn-sm btn-outline-danger srv-it-del" data-i="${i}" title="Quitar"><i class="bi bi-trash"></i></button></td>
    </tr>`).join('');
  return `
    <div class="table-responsive">
      <table class="table table-bordered align-middle mb-0">
        <thead class="table-light">
          <tr><th>Código SIGAMEF</th><th>Descripción del Servicio</th><th class="text-center" style="width:130px">Unidad de Medida</th><th style="width:140px">Monto (S/.)</th><th style="width:60px" class="text-center">Acción</th></tr>
        </thead>
        <tbody id="srvItemsBody">${rows || '<tr><td colspan="5" class="text-center text-muted">Busque y agregue ítems del Catálogo SIGAMEF.</td></tr>'}</tbody>
        <tfoot><tr class="table-secondary fw-bold"><td colspan="3" class="text-end">MONTO TOTAL</td><td id="srvItemsTotal">S/. ${totalMontoServicios().toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr></tfoot>
      </table>
    </div>`;
}

function renderServicioGlosaSection(item) {
  if (item.kind === 'firmas') return renderFirmas();
  if (item.kind === 'tabla_entregas') return renderSrvTablaEntregas(item);
  if (item.kind === 'tabla_informacion') return renderSrvTablaInformacion(item);

  const pre = item.label ? `${item.label}. ` : '';
  const titulo = `<div class="fw-bold mb-1 d-flex align-items-center gap-2">
      ${pre ? `<span class="text-nowrap">${esc(pre.trim())}</span>` : ''}
      <input class="form-control form-control-sm fw-bold srv-gtitle" data-key="${item.key}" type="text" value="${esc(srvTituloDe(item))}" />
    </div>`;
  if (item.kind === 'heading') return `<div class="mt-4 mb-2 border-bottom pb-1">${titulo}</div>`;

  const helper = item.helper ? `<div class="form-text fst-italic text-secondary mb-1">${esc(item.helper)}</div>` : '';
  const val = srvContenidoDe(item);
  const field = item.type === 'text'
    ? `<input class="form-control srv-gcont" data-key="${item.key}" type="text" value="${esc(val)}" />`
    : `<textarea class="form-control srv-gcont" data-key="${item.key}" rows="3">${esc(val)}</textarea>`;
  return `<div class="mb-3 mt-3">${titulo}${helper}${field}</div>`;
}

function renderSrvTablaEntregas(item) {
  const entregas = ensureServicioEntregas();
  const rows = entregas.map((e, i) => `
    <tr>
      <td class="text-center align-middle">${i + 1}</td>
      <td><input class="form-control form-control-sm srv-ent" data-i="${i}" data-f="plazo" type="text" value="${esc(e.plazo || '')}" placeholder="Plazo" /></td>
      <td><input class="form-control form-control-sm srv-ent" data-i="${i}" data-f="condicion" type="text" value="${esc(e.condicion || '')}" placeholder="Condición" /></td>
      <td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger srv-ent-del" data-i="${i}" ${entregas.length <= 1 ? 'disabled' : ''}><i class="bi bi-trash"></i></button></td>
    </tr>`).join('');
  return `
    <div class="mt-3">
      <div class="fw-bold mb-1 d-flex align-items-center gap-2">
        <span class="text-nowrap">${esc(item.label)}.</span>
        <input class="form-control form-control-sm fw-bold srv-gtitle" data-key="${item.key}" type="text" value="${esc(srvTituloDe(item))}" />
      </div>
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-2">
          <thead class="table-light"><tr><th style="width:90px" class="text-center">N° Entrega</th><th>Plazo de Entrega</th><th>Condición de entrega</th><th style="width:60px" class="text-center">Acción</th></tr></thead>
          <tbody id="srvEntBody">${rows}</tbody>
        </table>
      </div>
      <button type="button" id="srvEntAdd" class="btn btn-sm btn-outline-primary"><i class="bi bi-plus-lg"></i> Agregar entregable</button>
    </div>`;
}

function renderSrvTablaInformacion(item) {
  const info = ensureServicioInformacion();
  const rows = info.map((e, i) => `
    <tr>
      <td class="text-center align-middle">${i + 1}</td>
      <td><input class="form-control form-control-sm srv-info" data-i="${i}" data-f="entregable" type="text" value="${esc(e.entregable || '')}" placeholder="Entregable" /></td>
      <td><input class="form-control form-control-sm srv-info" data-i="${i}" data-f="plazo" type="text" value="${esc(e.plazo || '')}" placeholder="Plazo" /></td>
      <td><input class="form-control form-control-sm srv-info" data-i="${i}" data-f="porcentaje" type="text" value="${esc(e.porcentaje || '')}" placeholder="%" /></td>
      <td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger srv-info-del" data-i="${i}" ${info.length <= 1 ? 'disabled' : ''}><i class="bi bi-trash"></i></button></td>
    </tr>`).join('');
  return `
    <div class="mt-3">
      <div class="fw-bold mb-1 d-flex align-items-center gap-2">
        <span class="text-nowrap">${esc(item.label)}.</span>
        <input class="form-control form-control-sm fw-bold srv-gtitle" data-key="${item.key}" type="text" value="${esc(srvTituloDe(item))}" />
      </div>
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-2">
          <thead class="table-light"><tr><th style="width:60px" class="text-center">N°</th><th>Entregable</th><th>Plazo del entregable</th><th>PORCENTAJE</th><th style="width:60px" class="text-center">Acción</th></tr></thead>
          <tbody id="srvInfoBody">${rows}</tbody>
        </table>
      </div>
      <button type="button" id="srvInfoAdd" class="btn btn-sm btn-outline-primary"><i class="bi bi-plus-lg"></i> Agregar fila</button>
    </div>`;
}

function collectServicioInputs() {
  const g = (id) => (document.getElementById(id) || {}).value;
  if (document.getElementById('denominacion') != null) state.denominacion = g('denominacion') || '';
  if (document.getElementById('objetivo') != null) state.objetivo = g('objetivo') || '';
  if (document.getElementById('finalidad') != null) state.finalidad = g('finalidad') || '';
  if (document.getElementById('reqCmn') != null) {
    const raw = g('reqCmn') || '';
    const num = parseInt(raw.replace(/\D/g, ''), 10);
    state.cmn = isNaN(num) ? '' : String(num).padStart(5, '0');
  }
  document.querySelectorAll('.srv-it-monto').forEach((el) => {
    const i = Number(el.dataset.i);
    if (state.servicioItems[i]) state.servicioItems[i].monto = Number(el.value) || 0;
  });
  document.querySelectorAll('.srv-gtitle').forEach((el) => {
    const k = el.dataset.key;
    if (!state.servicioGlosaOverrides[k]) state.servicioGlosaOverrides[k] = {};
    state.servicioGlosaOverrides[k].titulo = el.value;
  });
  document.querySelectorAll('.srv-gcont').forEach((el) => {
    const k = el.dataset.key;
    if (!state.servicioGlosaOverrides[k]) state.servicioGlosaOverrides[k] = {};
    state.servicioGlosaOverrides[k].contenido = el.value;
  });
  document.querySelectorAll('.srv-ent').forEach((el) => {
    const i = Number(el.dataset.i); const f = el.dataset.f;
    if (!state.servicioEntregas[i]) state.servicioEntregas[i] = { plazo: '', condicion: '' };
    state.servicioEntregas[i][f] = el.value;
  });
  document.querySelectorAll('.srv-info').forEach((el) => {
    const i = Number(el.dataset.i); const f = el.dataset.f;
    if (!state.servicioInformacion[i]) state.servicioInformacion[i] = { entregable: '', plazo: '', porcentaje: '' };
    state.servicioInformacion[i][f] = el.value;
  });
}

function rerenderServiciosBody(skipCollect) {
  if (!skipCollect) collectServicioInputs();
  const host = document.getElementById('reqRoot');
  if (!host) return;
  host.innerHTML = renderServicios();
  attachServicios();
}


function attachServicios() {
  const back = document.getElementById('reqBack');
  if (back) back.onclick = () => {
    if (reqShared.editingFromEvaluacion && reqShared.onBackToEvaluacion) {
      reqShared.onBackToEvaluacion();
    } else {
      showSelect();
    }
  };
  const save = document.getElementById('reqSave');
  if (save) save.onclick = () => saveRequerimientoServicio();
  const print = document.getElementById('reqPrint');
  if (print) print.onclick = () => {
    collectServicioInputs();
    openPrintWindowServicios(buildState());
  };

  const cmnInput = document.getElementById('reqCmn');
  if (cmnInput) {
    cmnInput.onblur = () => {
      const raw = cmnInput.value || '';
      const num = parseInt(raw.replace(/\D/g, ''), 10);
      cmnInput.value = isNaN(num) ? '' : String(num).padStart(5, '0');
      state.cmn = cmnInput.value;
    };
    cmnInput.oninput = () => { cmnInput.value = cmnInput.value.replace(/\D/g, '').slice(0, 5); };
  }

  const areaBtn = document.getElementById('areaBtn');
  if (areaBtn) areaBtn.onclick = buscarAreas;
  const areaSearch = document.getElementById('areaSearch');
  if (areaSearch) {
    areaSearch.oninput = buscarAreasDebounced;
    areaSearch.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarAreas(); } };
  }

  // Autocomplete Catálogo SIGAMEF para Servicios (tipo_bien = S)
  autocompleteCatalogo({
    inputId: 'srvItemSearch',
    resultsId: 'srvItemResults',
    tipoBien: 'S',
    renderItem: (r) => `
      <button type="button" class="list-group-item list-group-item-action autocomplete-item"
        data-cod="${esc(r.item_bien)}" data-nom="${esc(r.nombre_item)}" data-um="${esc(r.unidad_medida || '')}" data-precio="${Number(r.precio_unitario) || 0}">
        <strong>${esc(r.item_bien || '')}</strong> — ${esc(r.nombre_item || '')} <span class="text-muted small">(${esc(r.unidad_medida || '')})</span>
      </button>`,
    onSelect: (data) => {
      collectServicioInputs();
      state.servicioItems.push({
        item_bien: data.cod, nombre_item: data.nom,
        unidad_medida: data.um, monto: Number(data.precio) || 0,
      });
      rerenderServiciosBody();
    },
  });
  // Botón manual ejecuta búsqueda
  const srvItemBtn = document.getElementById('srvItemBtn');
  if (srvItemBtn) srvItemBtn.onclick = () => {
    const evt = new Event('input');
    document.getElementById('srvItemSearch')?.dispatchEvent(evt);
  };

  document.querySelectorAll('.srv-it-monto').forEach((el) => el.oninput = () => {
    const i = Number(el.dataset.i);
    if (state.servicioItems[i]) state.servicioItems[i].monto = Number(el.value) || 0;
    const tot = document.getElementById('srvItemsTotal');
    if (tot) tot.textContent = 'S/. ' + totalMontoServicios().toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
  document.querySelectorAll('.srv-it-del').forEach((b) => b.onclick = () => {
    collectServicioInputs();
    state.servicioItems.splice(Number(b.dataset.i), 1);
    rerenderServiciosBody();
  });

  // Tabla entregas
  const srvEntAdd = document.getElementById('srvEntAdd');
  if (srvEntAdd) srvEntAdd.onclick = () => {
    collectServicioInputs();
    ensureServicioEntregas().push({ plazo: '', condicion: '' });
    rerenderServiciosBody();
  };
  document.querySelectorAll('.srv-ent-del').forEach((b) => {
    b.onclick = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const idx = Number(b.dataset.i);
      if (state.servicioEntregas.length <= 1) return;
      collectServicioInputs();
      state.servicioEntregas.splice(idx, 1);
      rerenderServiciosBody(true);
    };
  });

  // Tabla información
  const srvInfoAdd = document.getElementById('srvInfoAdd');
  if (srvInfoAdd) srvInfoAdd.onclick = () => {
    collectServicioInputs();
    ensureServicioInformacion().push({ entregable: '', plazo: '', porcentaje: '' });
    rerenderServiciosBody();
  };
  document.querySelectorAll('.srv-info-del').forEach((b) => {
    b.onclick = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const idx = Number(b.dataset.i);
      if (state.servicioInformacion.length <= 1) return;
      collectServicioInputs();
      state.servicioInformacion.splice(idx, 1);
      rerenderServiciosBody(true);
    };
  });
}

async function saveRequerimientoServicio() {
  collectServicioInputs();
  setMsg('info', 'Guardando requerimiento de servicios…');
  const user = authService.getCurrentUser();
  const usuario = getUserDisplayName(user) || 'sistema';

  const cmnRaw = state.cmn || '';
  const cmnNum = parseInt(cmnRaw.replace(/\D/g, ''), 10);
  const cmnFormatted = isNaN(cmnNum) ? '' : String(cmnNum).padStart(5, '0');
  state.cmn = cmnFormatted;

  const payloadObj = {
    area: state.area,
    objetivo: state.objetivo,
    finalidad: state.finalidad,
    servicioItems: state.servicioItems,
    servicioGlosaOverrides: state.servicioGlosaOverrides,
    servicioEntregas: state.servicioEntregas,
    servicioInformacion: state.servicioInformacion,
    header: state.header,
    observaciones: state.observaciones || [],
  };

  const body = {
    tipo: 'servicios',
    cmn: cmnFormatted,
    denominacion: state.denominacion,
    area: state.area.nombre,
    responsable: state.area.responsable,
    payload: JSON.stringify(payloadObj),
    usuario_modificacion: usuario,
  };
  if (!reqShared.editingFromEvaluacion) {
    body.estado = 'Registrado';
  }

  try {
    if (state.reqId) {
      await requerimientosService.update(state.reqId, body);
      state.cmn = cmnFormatted;
    } else {
      const created = await requerimientosService.create(body);
      if (created && created.id) {
        state.reqId = created.id;
        if (!created.codigo) {
          const codigo = `REQ-${String(created.id).padStart(5, '0')}`;
          await requerimientosService.update(created.id, { codigo });
          state.codigo = codigo;
        } else {
          state.codigo = created.codigo;
        }
      }
    }
    setMsg('success', 'Requerimiento de servicios guardado correctamente.');
    if (state.view === 'select') {
      loadList();
    } else {
      const codigoElement = document.querySelector('.bg-light.d-inline-block');
      if (codigoElement) codigoElement.textContent = `REQUERIMIENTO N° ${state.codigo || '00000'}`;
    }
  } catch (e) {
    setMsg('danger', `Error al guardar: ${e.message}`);
  }
}

// =========================================================================
// PDF SERVICIOS
// =========================================================================
function buildPrintHTMLServicios(s) {
  const { logo, entidadNombre } = s.header || {};
  const logoImg = logo ? `<img src="${logo}" style="max-height:70px;max-width:140px;object-fit:contain;">` : '';
  const ent = entidadNombre || 'INSTITUTO NACIONAL DE SALUD';
  const codigoRequerimiento = s.codigo || '00000';

  // Items table (sin columna Monto)
  const itemsRows = (s.servicioItems || []).map((it, i) => `
    <tr><td style="text-align:center">${i + 1}</td>
      <td>${esc(it.item_bien)}</td>
      <td>${esc(it.nombre_item)}</td>
      <td style="text-align:center">${esc(it.unidad_medida)}</td>
    </tr>`).join('');

  // Glosas TDR
  const glosa = MODELO_SERVICIOS.map((item) => srvGlosaPrint(item, s)).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Requerimiento — ${esc(s.denominacion || 'Servicios')}</title>
  <style>
    * { box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color:#000; margin:0; padding:18px 26px; font-size:12px; line-height:1.4; }
    .hdr { display:flex; align-items:center; border:1px solid #000; margin-bottom:14px; }
    .hdr .logo { width:170px; border-right:1px solid #000; padding:8px; text-align:center; }
    .hdr .title { flex:1; text-align:center; padding:8px; }
    .hdr .title h1 { font-size:14px; margin:0 0 4px; }
    .hdr .title h2 { font-size:12px; margin:8px 0 0 0; font-weight:bold; }
    .hdr .title h3 { font-size:12px; margin:4px 0 0 0; font-weight:bold; text-transform:uppercase; }
    .hdr .title .req-num { font-size:12px; margin:10px 0 0 0; font-weight:bold; background:#f0f0f0; display:inline-block; padding:4px 12px; border-radius:4px; }
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
    <div class="title">
      <h1>${esc(ent)}</h1>
      <h2>ANEXO N° 02</h2>
      <h3>TÉRMINOS DE REFERENCIA PARA CONTRATACIÓN DE SERVICIOS EN GENERAL</h3>
      <div class="req-num">REQUERIMIENTO N° ${esc(codigoRequerimiento)}</div>
      ${s.cmn ? `<div style="margin-top:6px; font-size:12px; font-weight:bold;">CMN N° ${esc(s.cmn)}</div>` : ''}
    </div>
  </div>

  <h3 class="sec">1. ÁREA USUARIA / DEPENDENCIA QUE REQUIERE EL SERVICIO</h3>
  <div class="fld"><div class="box">${esc((s.area && s.area.nombre) || '')}${s.area && s.area.responsable ? ' — Centro: ' + esc(s.area.responsable) : ''}</div></div>

  <h3 class="sec">2. DENOMINACIÓN DE LA CONTRATACIÓN</h3>
  <div class="fld"><div class="box">${esc(s.denominacion || '')}</div></div>

  <h3 class="sec">3. OBJETIVO Y/O FINALIDAD PÚBLICA</h3>
  <div class="fld"><div class="lbl">3.1. Objetivo</div><div class="box">${esc(s.objetivo || '')}</div></div>
  <div class="fld"><div class="lbl">3.2. Finalidad</div><div class="box">${esc(s.finalidad || '')}</div></div>

  <h3 class="sec">4. DESCRIPCIÓN DEL SERVICIO</h3>
  <div class="fld"><div class="lbl">4.1. Requerimiento</div>
    <table><thead><tr><th style="text-align:center">N°</th><th>Código SIGAMEF</th><th>Descripción del Servicio</th><th style="text-align:center">Unidad de Medida</th></tr></thead>
    <tbody>${itemsRows || '<tr><td colspan="4" style="text-align:center">—</td></tr>'}</tbody>
    </table>
  </div>

  ${glosa}

  <div class="firma">
    <div class="l">FIRMA DEL SUB DIRECTOR Y/O<br>JEFE DE UNIDAD</div>
    <div class="l">FIRMA DEL JEFE Y/O<br>DIRECTOR GENERAL</div>
  </div>
  </body></html>`;
}

function srvGlosaTituloPrint(item, s) {
  const o = (s.servicioGlosaOverrides || {})[item.key];
  return o && o.titulo != null && o.titulo !== '' ? o.titulo : (item.titulo || '');
}
function srvGlosaContPrint(item, s) {
  const o = (s.servicioGlosaOverrides || {})[item.key];
  if (o && o.contenido != null && o.contenido !== '') return o.contenido;
  return item.default || '';
}

function srvGlosaPrint(item, s) {
  if (item.kind === 'firmas') return '';
  const pre = item.label ? `${item.label}. ` : '';
  if (item.kind === 'heading') return `<h3 class="sec">${esc(pre)}${esc(srvGlosaTituloPrint(item, s))}</h3>`;
  if (item.kind === 'tabla_entregas') {
    const ents = (s.servicioEntregas || []);
    const rows = ents.map((e, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${esc(e.plazo)}</td><td>${esc(e.condicion)}</td></tr>`).join('');
    return `<h3 class="sec">${esc(pre)}${esc(srvGlosaTituloPrint(item, s))}</h3>
      <table><thead><tr><th style="text-align:center">N° Entrega</th><th>Plazo de Entrega</th><th>Condición de entrega</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3" style="text-align:center">—</td></tr>'}</tbody></table>`;
  }
  if (item.kind === 'tabla_informacion') {
    const info = (s.servicioInformacion || []);
    const rows = info.map((e, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${esc(e.entregable)}</td><td>${esc(e.plazo)}</td><td>${esc(e.porcentaje)}</td></tr>`).join('');
    return `<h3 class="sec">${esc(pre)}${esc(srvGlosaTituloPrint(item, s))}</h3>
      <table><thead><tr><th style="text-align:center">N°</th><th>Entregable</th><th>Plazo del entregable</th><th>PORCENTAJE</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="text-align:center">—</td></tr>'}</tbody></table>`;
  }
  return `<h3 class="sec">${esc(pre)}${esc(srvGlosaTituloPrint(item, s))}</h3><div class="box">${esc(srvGlosaContPrint(item, s))}</div>`;
}

function openPrintWindowServicios(s) {
  const win = window.open('', '_blank');
  if (!win) { alert('Permita las ventanas emergentes para generar el documento.'); return; }
  win.document.open();
  win.document.write(buildPrintHTMLServicios(s));
  win.document.close();
}

// =========================================================================
// LOCADORES — FORMULARIO COMPLETO
// =========================================================================

function ensureLocadorEntregas() {
  if (!Array.isArray(state.locadorEntregas) || !state.locadorEntregas.length) {
    state.locadorEntregas = [{ plazo: '', condicion: '' }];
  }
  return state.locadorEntregas;
}

const DOC_TITULO_LOC = '__FORMATO_LOCADORES_DOC__';

function ensureLocadorInformacion() {
  if (!Array.isArray(state.locadorInformacion) || !state.locadorInformacion.length) {
    state.locadorInformacion = [{ entregable: '', plazo: '' }];
  }
  return state.locadorInformacion;
}

async function loadLocadorGlosaDefaults() {
  try {
    const resp = await glosasLocadoresService.getAll();
    const rows = (resp && resp.data) || [];
    const docRow = rows.find((r) => r.titulo === DOC_TITULO_LOC);
    if (docRow) {
      try {
        const parsed = JSON.parse(docRow.contenido || '{}');
        if (!Object.keys(state.locadorGlosaOverrides).length) state.locadorGlosaOverrides = parsed.overrides || {};
        if (!state.locadorEntregas.length && Array.isArray(parsed.entregas)) state.locadorEntregas = parsed.entregas;
        if (!state.locadorInformacion.length && (Array.isArray(parsed.informacion) || Array.isArray(parsed.plazos))) state.locadorInformacion = parsed.informacion || parsed.plazos;
        if (parsed.perfil) state.locadorPerfil = parsed.perfil;
        if (parsed.modalidad) state.locadorModalidad = parsed.modalidad;
      } catch (_) { /* contenido no-JSON */ }
    }
  } catch (_) { /* si falla, se usan los valores por defecto del MODELO_LOCADORES */ }
}

function applyPayloadLocador(row) {
  state.reqId = row.id;
  state.codigo = row.codigo || '';
  try {
    const p = JSON.parse(row.payload || '{}');
    state.area = p.area || { codigo: '', nombre: '', responsable: '' };
    state.denominacion = p.denominacion || '';
    state.objetivo = p.objetivo || '';
    state.finalidad = p.finalidad || '';
    state.cmn = p.cmn || '';
    state.locadorItems = p.locadorItems || [];
    state.locadorGlosaOverrides = p.locadorGlosaOverrides || state.locadorGlosaOverrides;
    state.locadorEntregas = p.locadorEntregas || [];
    state.locadorInformacion = p.locadorInformacion || p.locadorPlazos || [];
    state.locadorPerfil = p.locadorPerfil || { formacion: '', titulo: '', colegiado_habilitado: '', serum: '', otros: '' };
    state.locadorModalidad = p.locadorModalidad || '';
    state.observaciones = p.observaciones || [];
  } catch (_) {}
}

function totalMontoLocadores() {
  return state.locadorItems.reduce((s, it) => s + (Number(it.monto) || 0), 0);
}

function locTituloDe(item) {
  const o = state.locadorGlosaOverrides[item.key];
  return o && o.titulo != null && o.titulo !== '' ? o.titulo : (item.titulo || '');
}
function locContenidoDe(item) {
  const o = state.locadorGlosaOverrides[item.key];
  if (o && o.contenido != null && o.contenido !== '') return o.contenido;
  return item.default || '';
}

function renderLocadores() {
  const { logo, entidadNombre } = state.header || {};
  const logoImg = logo ? `<img src="${logo}" style="max-height:70px;max-width:140px;object-fit:contain;">` : '';
  return `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div ${reqShared.editingFromEvaluacion ? 'style="display:none"' : ''}>
          <h3 class="mb-1"><i class="bi bi-person-badge"></i> Registro de Requerimiento — Formato de Locadores</h3>
          <p class="text-muted mb-0">Anexo N.° 03 — Términos de Referencia para Contratación de Locadores</p>
        </div>
        <div class="btn-group">
          <button id="reqBack" class="btn btn-outline-secondary"><i class="bi bi-arrow-left"></i> Volver</button>
          <button id="reqSave" class="btn btn-success"><i class="bi bi-save"></i> Grabar</button>
          <button id="reqPrint" class="btn btn-dark"><i class="bi bi-printer"></i> Generar documento</button>
        </div>
      </div>
      <div id="reqMsg"></div>

      <!-- Cabecera -->
      <div class="card mb-3">
        <div class="card-body d-flex align-items-center gap-3">
          <div style="width:150px; text-align:center;">${logoImg}</div>
          <div class="flex-fill text-center">
            <div class="fw-bold">${esc(entidadNombre || 'INSTITUTO NACIONAL DE SALUD')}</div>
            <div class="mt-2">
              <div class="fw-bold">ANEXO N° 03</div>
              <div class="text-uppercase small fw-bold">TÉRMINOS DE REFERENCIA PARA CONTRATACIÓN DE LOCADORES</div>
            </div>
            <div class="mt-3 d-flex align-items-center justify-content-center gap-3">
              <div class="fw-bold bg-light d-inline-block px-3 py-1 rounded">REQUERIMIENTO N° ${state.codigo || '00000'}</div>
              <div class="d-flex align-items-center gap-1">
                <span class="fw-bold small">CMN N°</span>
                <input id="reqCmn" class="form-control form-control-sm" type="text" inputmode="numeric" maxlength="5"
                  style="width: 80px; text-align: center;" value="${esc(state.cmn || '')}" placeholder="00000" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-3"><div class="card-body">
        <!-- 1) ÁREA USUARIA -->
        <div class="mb-3">
          <div class="fw-bold mb-1">1. ÁREA USUARIA / DEPENDENCIA QUE REQUIERE EL SERVICIO</div>
          <div class="input-group mb-2">
            <input id="areaSearch" class="form-control" placeholder="Ingrese código o nombre del área usuaria…" />
            <button id="areaBtn" class="btn btn-outline-primary" type="button"><i class="bi bi-search"></i> Buscar</button>
          </div>
          <div id="areaResults"></div>
          <div class="row g-2">
            <div class="col-md-6"><label class="form-label small mb-0">Área usuaria</label><input id="areaNombre" class="form-control" value="${esc(state.area.nombre)}" readonly /></div>
            <div class="col-md-6"><label class="form-label small mb-0">Centro</label><input id="areaResponsable" class="form-control" value="${esc(state.area.responsable)}" readonly /></div>
          </div>
        </div>

        <!-- 2) DENOMINACIÓN -->
        <div class="mb-3">
          <div class="fw-bold mb-1">2. DENOMINACIÓN DE LA CONTRATACIÓN</div>
          <input id="denominacion" class="form-control" value="${esc(state.denominacion)}" placeholder="Ingrese la denominación de la contratación" />
        </div>

        <!-- 3) OBJETIVO Y/O FINALIDAD PÚBLICA -->
        <div class="mb-2 fw-bold">3. OBJETIVO Y/O FINALIDAD PÚBLICA</div>
        <div class="mb-3"><div class="fw-bold mb-1">3.1. OBJETIVO</div><textarea id="objetivo" class="form-control" rows="2" placeholder="Describa el objetivo">${esc(state.objetivo)}</textarea></div>
        <div class="mb-3"><div class="fw-bold mb-1">3.2. FINALIDAD</div><textarea id="finalidad" class="form-control" rows="2" placeholder="Describa la finalidad pública">${esc(state.finalidad)}</textarea></div>

        <!-- 4) DESCRIPCIÓN DEL SERVICIO -->
        <div class="mb-2 fw-bold">4. DESCRIPCIÓN DEL SERVICIO</div>
        <div class="mb-3">
          <div class="fw-bold mb-1">4.1. Requerimiento</div>
          <div class="input-group mb-2">
            <input id="locItemSearch" class="form-control" placeholder="Ingrese código o descripción del servicio (Catálogo SIGAMEF)…" />
            <button id="locItemBtn" class="btn btn-outline-primary" type="button"><i class="bi bi-search"></i> Buscar</button>
          </div>
          <div id="locItemResults"></div>
          ${renderLocadorItemsTable()}
        </div>
      </div></div>

      <!-- 4.2…11 + firmas (TDR Locadores) -->
      <div class="card">
        <div class="card-body" id="reqGlosaLoc">${MODELO_LOCADORES.map(renderLocadorGlosaSection).join('')}</div>
      </div>
    </div>
  `;
}

function renderLocadorItemsTable() {
  const total = totalMontoLocadores();
  const rows = state.locadorItems.map((it, i) => `
    <tr>
      <td>${esc(it.item_bien)}</td>
      <td>${esc(it.nombre_item)}</td>
      <td class="text-center">${esc(it.unidad_medida)}</td>
      <td style="width:140px"><input class="form-control form-control-sm loc-it-monto" data-i="${i}" type="number" min="0" step="0.01" value="${esc(it.monto ?? 0)}" /></td>
      <td class="text-center"><button class="btn btn-sm btn-outline-danger loc-it-del" data-i="${i}" title="Quitar"><i class="bi bi-trash"></i></button></td>
    </tr>`).join('');
  return `
    <div class="table-responsive">
      <table class="table table-bordered align-middle mb-0">
        <thead class="table-light">
          <tr><th>Código SIGAMEF</th><th>Descripción del Servicio</th><th class="text-center" style="width:130px">Unidad de Medida</th><th style="width:140px">Monto (S/.)</th><th style="width:60px" class="text-center">Acción</th></tr>
        </thead>
        <tbody id="locItemsBody">${rows || '<tr><td colspan="5" class="text-center text-muted">Busque y agregue ítems del Catálogo SIGAMEF.</td></tr>'}</tbody>
        <tfoot><tr class="table-secondary fw-bold"><td colspan="3" class="text-end">MONTO TOTAL</td><td id="locItemsTotal">S/. ${total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr></tfoot>
      </table>
    </div>`;
}

function renderLocadorGlosaSection(item) {
  if (item.kind === 'firmas') return renderFirmas();
  if (item.kind === 'tabla_entregas') return renderLocTablaEntregas(item);
  if (item.kind === 'tabla_informacion') return renderLocTablaInformacion(item);
  if (item.kind === 'perfil_academico') return renderLocPerfilAcademico(item);
  if (item.kind === 'select_modalidad') return renderLocModalidad(item);

  const pre = item.label ? `${item.label}. ` : '';
  const titulo = `<div class="fw-bold mb-1 d-flex align-items-center gap-2">
      ${pre ? `<span class="text-nowrap">${esc(pre.trim())}</span>` : ''}
      <input class="form-control form-control-sm fw-bold loc-gtitle" data-key="${item.key}" type="text" value="${esc(locTituloDe(item))}" />
    </div>`;
  if (item.kind === 'heading') return `<div class="mt-4 mb-2 border-bottom pb-1">${titulo}</div>`;

  const helper = item.helper ? `<div class="form-text fst-italic text-secondary mb-1">${esc(item.helper)}</div>` : '';
  const val = locContenidoDe(item);
  const field = item.type === 'text'
    ? `<input class="form-control loc-gcont" data-key="${item.key}" type="text" value="${esc(val)}" />`
    : `<textarea class="form-control loc-gcont" data-key="${item.key}" rows="3">${esc(val)}</textarea>`;
  return `<div class="mb-3 mt-3">${titulo}${helper}${field}</div>`;
}

function renderLocPerfilAcademico(item) {
  const p = state.locadorPerfil || {};
  const carrerasOpts = (state.carrerasLista || []).map(c => `<option value="${esc(c)}" ${p.titulo === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  return `
    <div class="mb-3 mt-3">
      <div class="fw-bold mb-2"><span class="text-nowrap">${esc(item.label)}.</span> ${esc(locTituloDe(item))}</div>
      <div class="row g-2 mb-2">
        <div class="col-md-4">
          <label class="form-label small mb-0">Formación Académica</label>
          <select id="locFormacion" class="form-select form-select-sm">
            <option value="">— Seleccione —</option>
            <option value="Profesional" ${p.formacion === 'Profesional' ? 'selected' : ''}>Profesional</option>
            <option value="Técnico" ${p.formacion === 'Técnico' ? 'selected' : ''}>Técnico</option>
            <option value="Egresado" ${p.formacion === 'Egresado' ? 'selected' : ''}>Egresado</option>
            <option value="Secundaria" ${p.formacion === 'Secundaria' ? 'selected' : ''}>Secundaria</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-0">Título Profesional</label>
          <select id="locTitulo" class="form-select form-select-sm">
            <option value="">— Seleccionar carrera —</option>
            ${carrerasOpts}
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-0">Colegiado y Habilitado</label>
          <div class="d-flex gap-3 mt-1">
            <div class="form-check"><input class="form-check-input" type="radio" name="locColegiado" id="locColegiadoSi" value="Sí" ${p.colegiado_habilitado === 'Sí' ? 'checked' : ''} /><label class="form-check-label" for="locColegiadoSi">Sí</label></div>
            <div class="form-check"><input class="form-check-input" type="radio" name="locColegiado" id="locColegiadoNo" value="No" ${p.colegiado_habilitado === 'No' ? 'checked' : ''} /><label class="form-check-label" for="locColegiadoNo">No</label></div>
          </div>
        </div>
      </div>
      <div class="row g-2">
        <div class="col-md-4">
          <label class="form-label small mb-0">Resolución SERUM</label>
          <div class="d-flex gap-3 mt-1">
            <div class="form-check"><input class="form-check-input" type="radio" name="locSerum" id="locSerumSi" value="Sí" ${p.serum === 'Sí' ? 'checked' : ''} /><label class="form-check-label" for="locSerumSi">Sí</label></div>
            <div class="form-check"><input class="form-check-input" type="radio" name="locSerum" id="locSerumNo" value="No" ${p.serum === 'No' ? 'checked' : ''} /><label class="form-check-label" for="locSerumNo">No</label></div>
          </div>
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-0">Otros (indicar)</label>
          <input id="locOtros" class="form-control form-control-sm" type="text" value="${esc(p.otros || '')}" placeholder="Otros requisitos" />
        </div>
      </div>
    </div>`;
}

function renderLocModalidad(item) {
  const m = state.locadorModalidad || '';
  return `
    <div class="mb-3 mt-1">
      <label class="form-label small mb-0 fw-bold">Modalidad del servicio</label>
      <select id="locModalidad" class="form-select form-select-sm" style="width:200px">
        <option value="">— Seleccione —</option>
        <option value="Presencial" ${m === 'Presencial' ? 'selected' : ''}>Presencial</option>
        <option value="Híbrido" ${m === 'Híbrido' ? 'selected' : ''}>Híbrido</option>
        <option value="Remoto" ${m === 'Remoto' ? 'selected' : ''}>Remoto</option>
      </select>
    </div>`;
}

function renderLocTablaEntregas(item) {
  const entregas = ensureLocadorEntregas();
  const rows = entregas.map((e, i) => `
    <tr>
      <td class="text-center align-middle">${i + 1}</td>
      <td><input class="form-control form-control-sm loc-ent" data-i="${i}" data-f="plazo" type="text" value="${esc(e.plazo || '')}" placeholder="Plazo" /></td>
      <td><input class="form-control form-control-sm loc-ent" data-i="${i}" data-f="condicion" type="text" value="${esc(e.condicion || '')}" placeholder="Condición" /></td>
      <td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger loc-ent-del" data-i="${i}" ${entregas.length <= 1 ? 'disabled' : ''}><i class="bi bi-trash"></i></button></td>
    </tr>`).join('');
  return `
    <div class="mt-3">
      <div class="fw-bold mb-1 d-flex align-items-center gap-2">
        <span class="text-nowrap">${esc(item.label)}.</span>
        <input class="form-control form-control-sm fw-bold loc-gtitle" data-key="${item.key}" type="text" value="${esc(locTituloDe(item))}" />
      </div>
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-2">
          <thead class="table-light"><tr><th style="width:90px" class="text-center">N° Entrega</th><th>Plazo de Entrega</th><th>Condición de entrega</th><th style="width:60px" class="text-center">Acción</th></tr></thead>
          <tbody id="locEntBody">${rows}</tbody>
        </table>
      </div>
      <button type="button" id="locEntAdd" class="btn btn-sm btn-outline-primary"><i class="bi bi-plus-circle"></i> Agregar entregable</button>
    </div>`;
}

function renderLocTablaInformacion(item) {
  const plazos = ensureLocadorInformacion();
  const rows = plazos.map((e, i) => `
    <tr>
      <td class="text-center align-middle">${i + 1}</td>
      <td><input class="form-control form-control-sm loc-plz" data-i="${i}" data-f="entregable" type="text" value="${esc(e.entregable || '')}" placeholder="Entregable" /></td>
      <td><input class="form-control form-control-sm loc-plz" data-i="${i}" data-f="plazo" type="text" value="${esc(e.plazo || '')}" placeholder="Plazo" /></td>
      <td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger loc-plz-del" data-i="${i}" ${plazos.length <= 1 ? 'disabled' : ''}><i class="bi bi-trash"></i></button></td>
    </tr>`).join('');
  return `
    <div class="mt-3">
      <div class="fw-bold mb-1 d-flex align-items-center gap-2">
        <span class="text-nowrap">${esc(item.label)}.</span>
        <input class="form-control form-control-sm fw-bold loc-gtitle" data-key="${item.key}" type="text" value="${esc(locTituloDe(item))}" />
      </div>
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-2">
          <thead class="table-light"><tr><th style="width:60px" class="text-center">N°</th><th>Entregable</th><th>Plazo de presentación del entregable</th><th style="width:60px" class="text-center">Acción</th></tr></thead>
          <tbody id="locPlzBody">${rows}</tbody>
        </table>
      </div>
      <button type="button" id="locPlzAdd" class="btn btn-sm btn-outline-primary"><i class="bi bi-plus-circle"></i> Agregar fila</button>
    </div>`;
}

function collectLocadorInputs() {
  const g = (id) => (document.getElementById(id) || {}).value;
  if (document.getElementById('denominacion') != null) state.denominacion = g('denominacion') || '';
  if (document.getElementById('objetivo') != null) state.objetivo = g('objetivo') || '';
  if (document.getElementById('finalidad') != null) state.finalidad = g('finalidad') || '';
  if (document.getElementById('reqCmn') != null) {
    const raw = g('reqCmn') || '';
    const num = parseInt(raw.replace(/\D/g, ''), 10);
    state.cmn = isNaN(num) ? '' : String(num).padStart(5, '0');
  }
  document.querySelectorAll('.loc-it-monto').forEach((el) => {
    const i = Number(el.dataset.i);
    if (state.locadorItems[i]) state.locadorItems[i].monto = Number(el.value) || 0;
  });
  document.querySelectorAll('.loc-gtitle').forEach((el) => {
    const k = el.dataset.key;
    if (!state.locadorGlosaOverrides[k]) state.locadorGlosaOverrides[k] = {};
    state.locadorGlosaOverrides[k].titulo = el.value;
  });
  document.querySelectorAll('.loc-gcont').forEach((el) => {
    const k = el.dataset.key;
    if (!state.locadorGlosaOverrides[k]) state.locadorGlosaOverrides[k] = {};
    state.locadorGlosaOverrides[k].contenido = el.value;
  });
  document.querySelectorAll('.loc-ent').forEach((el) => {
    const i = Number(el.dataset.i); const f = el.dataset.f;
    if (!state.locadorEntregas[i]) state.locadorEntregas[i] = { plazo: '', condicion: '' };
    state.locadorEntregas[i][f] = el.value;
  });
  // Perfil académico
  const lf = document.getElementById('locFormacion');
  if (lf) state.locadorPerfil.formacion = lf.value;
  const lt = document.getElementById('locTitulo');
  if (lt) state.locadorPerfil.titulo = lt.value;
  const lo = document.getElementById('locOtros');
  if (lo) state.locadorPerfil.otros = lo.value;
  const colegSi = document.getElementById('locColegiadoSi');
  const colegNo = document.getElementById('locColegiadoNo');
  if (colegSi && colegSi.checked) state.locadorPerfil.colegiado_habilitado = 'Sí';
  else if (colegNo && colegNo.checked) state.locadorPerfil.colegiado_habilitado = 'No';
  const serumSi = document.getElementById('locSerumSi');
  const serumNo = document.getElementById('locSerumNo');
  if (serumSi && serumSi.checked) state.locadorPerfil.serum = 'Sí';
  else if (serumNo && serumNo.checked) state.locadorPerfil.serum = 'No';
  // Modalidad
  const lm = document.getElementById('locModalidad');
  if (lm) state.locadorModalidad = lm.value;
}

function rerenderLocadoresBody(skipCollect) {
  if (!skipCollect) collectLocadorInputs();
  const host = document.getElementById('reqRoot');
  if (!host) return;
  host.innerHTML = renderLocadores();
  attachLocadores();
}

function attachLocadores() {
  // Volver
  const back = document.getElementById('reqBack');
  if (back) back.onclick = () => {
    if (reqShared.editingFromEvaluacion && reqShared.onBackToEvaluacion) {
      reqShared.onBackToEvaluacion();
    } else { showSelect(); loadList(); }
  };
  // Grabar
  const save = document.getElementById('reqSave');
  if (save) save.onclick = () => saveRequerimientoLocador();
  // Imprimir
  const pr = document.getElementById('reqPrint');
  if (pr) pr.onclick = () => {
    collectLocadorInputs();
    openPrintWindowLocadores(buildState());
  };
  // CMN
  const cmnInput = document.getElementById('reqCmn');
  if (cmnInput) {
    cmnInput.onblur = () => {
      const raw = cmnInput.value || '';
      const num = parseInt(raw.replace(/\D/g, ''), 10);
      cmnInput.value = isNaN(num) ? '' : String(num).padStart(5, '0');
      state.cmn = cmnInput.value;
    };
    cmnInput.oninput = () => { cmnInput.value = cmnInput.value.replace(/\D/g, '').slice(0, 5); };
  }
  // Buscar área
  const areaBtn = document.getElementById('areaBtn');
  const areaSearch = document.getElementById('areaSearch');
  if (areaBtn) areaBtn.onclick = buscarAreas;
  if (areaSearch) {
    areaSearch.oninput = buscarAreasDebounced;
    areaSearch.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarAreas(); } };
  }
  // Autocomplete Catálogo SIGAMEF para Locadores (tipo_bien = S)
  autocompleteCatalogo({
    inputId: 'locItemSearch',
    resultsId: 'locItemResults',
    tipoBien: 'S',
    renderItem: (r) => `
      <button type="button" class="list-group-item list-group-item-action autocomplete-item"
        data-code="${esc(r.item_bien)}" data-name="${esc(r.nombre_item)}" data-unit="${esc(r.unidad_medida || '')}">
        <strong>${esc(r.item_bien || '')}</strong> — ${esc(r.nombre_item || '')} <span class="text-muted small">(${esc(r.unidad_medida || '')})</span>
      </button>`,
    onSelect: (data) => {
      state.locadorItems.push({
        item_bien: data.code, nombre_item: data.name,
        unidad_medida: data.unit, monto: 0,
      });
      rerenderLocadoresBody();
    },
  });
  // Botón manual ejecuta búsqueda
  const locItemBtn = document.getElementById('locItemBtn');
  if (locItemBtn) locItemBtn.onclick = () => {
    const evt = new Event('input');
    document.getElementById('locItemSearch')?.dispatchEvent(evt);
  };
  // Monto inputs: actualizar total en vivo
  document.querySelectorAll('.loc-it-monto').forEach((el) => el.oninput = () => {
    const i = Number(el.dataset.i);
    if (state.locadorItems[i]) state.locadorItems[i].monto = Number(el.value) || 0;
    const tot = document.getElementById('locItemsTotal');
    if (tot) tot.textContent = 'S/. ' + totalMontoLocadores().toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
  // Eliminar ítems
  document.querySelectorAll('.loc-it-del').forEach((b) => b.onclick = () => {
    state.locadorItems.splice(Number(b.dataset.i), 1);
    rerenderLocadoresBody();
  });
  // Tabla entregas
  const locEntAdd = document.getElementById('locEntAdd');
  if (locEntAdd) locEntAdd.onclick = () => {
    collectLocadorInputs();
    ensureLocadorEntregas().push({ plazo: '', condicion: '' });
    rerenderLocadoresBody();
  };
  document.querySelectorAll('.loc-ent-del').forEach((b) => {
    b.onclick = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const idx = Number(b.dataset.i);
      if (state.locadorEntregas.length <= 1) return;
      collectLocadorInputs();
      state.locadorEntregas.splice(idx, 1);
      rerenderLocadoresBody(true);
    };
  });
  // Tabla plazos
  const locPlzAdd = document.getElementById('locPlzAdd');
  if (locPlzAdd) locPlzAdd.onclick = () => {
    collectLocadorInputs();
    ensureLocadorInformacion().push({ entregable: '', plazo: '' });
    rerenderLocadoresBody();
  };
  document.querySelectorAll('.loc-plz-del').forEach((b) => {
    b.onclick = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const idx = Number(b.dataset.i);
      if (state.locadorInformacion.length <= 1) return;
      collectLocadorInputs();
      state.locadorInformacion.splice(idx, 1);
      rerenderLocadoresBody(true);
    };
  });
  document.querySelectorAll('.loc-plz').forEach((inp) => {
    inp.oninput = () => {
      const plazos = ensureLocadorInformacion();
      const i = Number(inp.dataset.i);
      const f = inp.dataset.f;
      if (!plazos[i]) plazos[i] = { entregable: '', plazo: '' };
      plazos[i][f] = inp.value;
    };
  });
}

async function saveRequerimientoLocador() {
  collectLocadorInputs();
  const cmnRaw = state.cmn || '';
  const cmnNum = parseInt(cmnRaw.replace(/\D/g, ''), 10);
  const cmnFormatted = isNaN(cmnNum) ? '' : String(cmnNum).padStart(5, '0');
  state.cmn = cmnFormatted;
  const payload = {
    area: state.area,
    denominacion: state.denominacion,
    objetivo: state.objetivo,
    finalidad: state.finalidad,
    cmn: cmnFormatted,
    locadorItems: state.locadorItems,
    locadorGlosaOverrides: state.locadorGlosaOverrides,
    locadorEntregas: state.locadorEntregas,
    locadorInformacion: state.locadorInformacion,
    locadorPerfil: state.locadorPerfil,
    locadorModalidad: state.locadorModalidad,
    observaciones: state.observaciones || [],
  };
  const body = {
    tipo: 'locacion',
    cmn: cmnFormatted,
    area: state.area.nombre || '',
    responsable: state.area.responsable || '',
    denominacion: state.denominacion,
    payload: JSON.stringify(payload),
    usuario_modificacion: getUserDisplayName(authService.getCurrentUser()) || 'sistema',
  };
  // RC118: mismo estado inicial canónico que bienes/servicios (backend también lo fuerza).
  if (!reqShared.editingFromEvaluacion) {
    body.estado = 'Registrado';
  } else {
    body.estado = undefined;
  }
  try {
    if (state.reqId) {
      await requerimientosService.update(state.reqId, body);
    } else {
      const created = await requerimientosService.create(body);
      if (created && created.id) {
        state.reqId = created.id;
        if (!created.codigo) {
          const codigo = `REQ-${String(created.id).padStart(5, '0')}`;
          await requerimientosService.update(created.id, { codigo });
          state.codigo = codigo;
        } else {
          state.codigo = created.codigo;
        }
      }
    }
    setMsg('success', 'Requerimiento de Locadores guardado correctamente.');
    if (state.view === 'select') {
      loadList();
    } else {
      const codigoElement = document.querySelector('.bg-light.d-inline-block');
      if (codigoElement) codigoElement.textContent = `REQUERIMIENTO N° ${state.codigo || '00000'}`;
    }
  } catch (e) {
    setMsg('danger', `Error al guardar: ${e.message}`);
  }
}

function buildPrintHTMLLocadores(s) {
  const { logo, entidadNombre } = s.header || {};
  const logoImg = logo ? `<img src="${logo}" style="max-height:70px;max-width:140px;object-fit:contain;">` : '';
  const ent = entidadNombre || 'INSTITUTO NACIONAL DE SALUD';
  const codigoRequerimiento = s.codigo || '00000';
  const items = s.locadorItems || [];
  const itemsRows = items.map((it, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${esc(it.item_bien)}</td><td>${esc(it.nombre_item)}</td><td style="text-align:center">${esc(it.unidad_medida)}</td></tr>`).join('');

  let glosaHTML = '';
  for (const item of MODELO_LOCADORES) {
    glosaHTML += locGlosaPrint(item, s);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>TDR Locador — ${esc(codigoRequerimiento)}</title>
  <style>
  @page { size: A4; margin: 20mm 25mm; }
  body { font-family: Arial, sans-serif; font-size: 11px; line-height: 1.4; color: #000; }
  .hdr { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
  .logo img { max-height: 60px; }
  .title { text-align: center; flex: 1; }
  .title h1 { font-size: 14px; margin: 0; }
  .title h2 { font-size: 12px; margin: 8px 0 0 0; font-weight: bold; }
  .title h3 { font-size: 12px; margin: 4px 0 0 0; font-weight: bold; text-transform: uppercase; }
  .req-num { font-size: 12px; font-weight: bold; margin-top: 8px; }
  .sec { font-size: 11px; font-weight: bold; margin: 14px 0 4px; }
  .box { white-space: pre-wrap; margin-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 10px; }
  th, td { border: 1px solid #000; padding: 4px 6px; }
  th { background: #f0f0f0; font-weight: bold; }
  .bar { text-align: center; margin-bottom: 12px; }
  .bar button { padding: 6px 18px; font-size: 13px; cursor: pointer; }
  .firmas { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; }
  .firmas div { width: 45%; border-top: 1px solid #000; padding-top: 6px; }
  @media print { .bar { display: none; } }
  </style></head><body>
  <div class="bar"><button onclick="window.print()">🖨 Imprimir / Guardar como PDF</button></div>
  <div class="hdr"><div class="logo">${logoImg}</div>
    <div class="title">
      <h1>${esc(ent)}</h1>
      <h2>ANEXO N° 03</h2>
      <h3>TÉRMINOS DE REFERENCIA PARA CONTRATACIÓN DE LOCADORES</h3>
      <div class="req-num">REQUERIMIENTO N° ${esc(codigoRequerimiento)}</div>
      ${s.cmn ? `<div style="margin-top:6px; font-size:12px; font-weight:bold;">CMN N° ${esc(s.cmn)}</div>` : ''}
    </div>
  </div>
  <h3 class="sec">1. ÁREA USUARIA / DEPENDENCIA QUE REQUIERE EL SERVICIO</h3>
  <div class="box">Área: ${esc(s.area?.nombre || '')}    Centro: ${esc(s.area?.responsable || '')}</div>
  <h3 class="sec">2. DENOMINACIÓN DE LA CONTRATACIÓN</h3>
  <div class="box">${esc(s.denominacion || '')}</div>
  <h3 class="sec">3. OBJETIVO Y/O FINALIDAD PÚBLICA</h3>
  <h3 class="sec">3.1. OBJETIVO</h3><div class="box">${esc(s.objetivo || '')}</div>
  <h3 class="sec">3.2. FINALIDAD</h3><div class="box">${esc(s.finalidad || '')}</div>
  <h3 class="sec">4. DESCRIPCIÓN DEL SERVICIO</h3>
  <h3 class="sec">4.1. Requerimiento</h3>
  <table><thead><tr><th>N°</th><th>Código SIGAMEF</th><th>Descripción del Servicio</th><th>Unidad de Medida</th></tr></thead>
    <tbody>${itemsRows || '<tr><td colspan="4" style="text-align:center">—</td></tr>'}</tbody></table>
  ${glosaHTML}
  </body></html>`;
}

function locGlosaPrint(item, s) {
  if (item.kind === 'firmas') {
    // Renderizar las firmas desde las glosas si existen, o usar el default del modelo
    const firmasHtml = (s.locadorGlosaOverrides && s.locadorGlosaOverrides[item.key])
      ? `<div class="box">${esc(s.locadorGlosaOverrides[item.key].contenido || '')}</div>`
      : (item.default || '');
    if (firmasHtml) {
      return `<div class="fld"><div class="box" style="border:none; padding:0;">${firmasHtml}</div></div>`;
    }
    return `<div class="firmas"><div>FIRMA DEL SUB DIRECTOR Y/O<br>JEFE DE UNIDAD</div><div>FIRMA DEL JEFE Y/O<br>DIRECTOR GENERAL</div></div>`;
  }
  const pre = item.label ? `${item.label}. ` : '';
  const ov = (s.locadorGlosaOverrides || {})[item.key];
  const titulo = ov && ov.titulo ? ov.titulo : (item.titulo || '');
  const contenido = ov && ov.contenido ? ov.contenido : (item.default || '');

  if (item.kind === 'perfil_academico') {
    const p = s.locadorPerfil || {};
    return `<h3 class="sec">${esc(pre)}${esc(titulo)}</h3>
      <div class="box"><strong>Formación Académica:</strong><br>${esc(p.formacion || '—')}</div>
      <div class="box"><strong>Título Profesional:</strong><br>${esc(p.titulo || '—')}</div>
      <div class="box"><strong>Colegiado y Habilitado:</strong><br>${esc(p.colegiado_habilitado || '—')}</div>
      <div class="box"><strong>Resolución SERUM:</strong><br>${esc(p.serum || '—')}</div>
      <div class="box"><strong>Otros:</strong><br>${esc(p.otros || '—')}</div>`;
  }
  if (item.kind === 'select_modalidad') {
    const m = s.locadorModalidad || '—';
    return `<div class="box" style="margin-top:-4px"><strong>Modalidad:</strong> ${esc(m)}</div>`;
  }
  if (item.kind === 'tabla_entregas') {
    const entregas = s.locadorEntregas || [];
    const rows = entregas.map((e, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${esc(e.plazo || '')}</td><td>${esc(e.condicion || '')}</td></tr>`).join('');
    return `<h3 class="sec">${esc(pre)}${esc(titulo)}</h3>
      <table><thead><tr><th>N°</th><th>Plazo del entregable</th><th>Condición de entrega</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3" style="text-align:center">—</td></tr>'}</tbody></table>`;
  }
  if (item.kind === 'tabla_informacion') {
    const plazos = s.locadorInformacion || [];
    const rows = plazos.map((e, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${esc(e.entregable || '')}</td><td>${esc(e.plazo || '')}</td></tr>`).join('');
    return `<h3 class="sec">${esc(pre)}${esc(titulo)}</h3>
      <table><thead><tr><th>N°</th><th>Entregable</th><th>Plazo de presentación del entregable</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3" style="text-align:center">—</td></tr>'}</tbody></table>`;
  }
  if (item.kind === 'heading') return `<h3 class="sec">${esc(pre)}${esc(titulo)}</h3>`;
  return `<h3 class="sec">${esc(pre)}${esc(titulo)}</h3><div class="box">${esc(contenido)}</div>`;
}

function openPrintWindowLocadores(s) {
  const win = window.open('', '_blank');
  if (!win) { alert('Permita las ventanas emergentes para generar el documento.'); return; }
  win.document.open();
  win.document.write(buildPrintHTMLLocadores(s));
  win.document.close();
}

// =========================================================================
// DOCUMENTO IMPRIMIBLE (incluye Ficha NET adjunta)
// =========================================================================
function buildPrintHTML(s) {
  const { logo, entidadNombre } = s.header || {};
  const logoImg = logo ? `<img src="${logo}" style="max-height:70px;max-width:140px;object-fit:contain;">` : '';
  const ent = entidadNombre || 'INSTITUTO NACIONAL DE SALUD';
  
  // Obtener el código del requerimiento (correlativo)
  const codigoRequerimiento = s.codigo || '00000';

  const itemsRows = (s.items || []).map((it, i) => `
    <tr><td style="text-align:center">${i + 1}</td>
      <td>${esc(it.item_bien)}</td>
      <td>${esc(it.nombre_item)}</td>
      <td style="text-align:center">${esc(it.unidad_medida)}</td>
      <td style="text-align:right">${esc(it.cantidad)}</td>
    </tr>`).join('');
  const totalItems = (s.items || []).reduce((a, b) => a + (Number(b.cantidad) || 0), 0);

  const glosa = MODELO.map((item) => glosaPrint(item, s)).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Requerimiento — ${esc(s.denominacion || 'Bienes')}</title>
  <style>
    * { box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color:#000; margin:0; padding:18px 26px; font-size:12px; line-height:1.4; }
    .hdr { display:flex; align-items:center; border:1px solid #000; margin-bottom:14px; }
    .hdr .logo { width:170px; border-right:1px solid #000; padding:8px; text-align:center; }
    .hdr .title { flex:1; text-align:center; padding:8px; }
    .hdr .title h1 { font-size:14px; margin:0 0 4px; }
    .hdr .title h2 { font-size:12px; margin:8px 0 0 0; font-weight:bold; }
    .hdr .title h3 { font-size:12px; margin:4px 0 0 0; font-weight:bold; text-transform:uppercase; }
    .hdr .title .req-num { font-size:12px; margin:10px 0 0 0; font-weight:bold; background:#f0f0f0; display:inline-block; padding:4px 12px; border-radius:4px; }
    h3.sec { font-size:12px; margin:14px 0 4px; }
    .fld { margin-bottom:8px; }
    .lbl { font-weight:bold; }
    .box { border:1px solid #000; padding:4px 7px; min-height:22px; white-space:pre-wrap; word-break:break-word; }
    table { width:100%; border-collapse:collapse; margin:6px 0; }
    th, td { border:1px solid #000; padding:4px 6px; font-size:11px; vertical-align:top; }
    th { background:#eee; }
    .firma { display:flex; justify-content:space-around; text-align:center; margin-top:120px; }
    .firma .l { border-top:1px solid #000; width:40%; padding-top:4px; }
    @media print { body { padding:10px 18px; } button { display:none; } }
    .bar { text-align:center; margin-bottom:14px; }
    .bar button { padding:8px 18px; font-size:13px; cursor:pointer; }
    ${FICHA_NET_PRINT_CSS}
  </style></head><body>
  <div class="bar"><button onclick="window.print()">🖨 Imprimir / Guardar como PDF</button></div>
  <div class="hdr"><div class="logo">${logoImg}</div>
    <div class="title">
      <h1>${esc(ent)}</h1>
      <h2>ANEXO N° 01</h2>
      <h3>ESPECIFICACIONES TÉCNICAS PARA ADQUISICIÓN DE BIENES</h3>
      <div class="req-num">REQUERIMIENTO N° ${esc(codigoRequerimiento)}</div>
      ${s.cmn ? `<div style="margin-top:6px; font-size:12px; font-weight:bold;">CMN N° ${esc(s.cmn)}</div>` : ''}
    </div>
  </div>

  <h3 class="sec">1. ÁREA USUARIA / DEPENDENCIA QUE REQUIERE EL BIEN</h3>
  <div class="fld"><div class="box">${esc((s.area && s.area.nombre) || '')}${s.area && s.area.responsable ? ' — Centro: ' + esc(s.area.responsable) : ''}</div></div>

  <h3 class="sec">2. DENOMINACIÓN DE LA CONTRATACIÓN</h3>
  <div class="fld"><div class="box">${esc(s.denominacion || '')}</div></div>

  <h3 class="sec">3. OBJETIVO Y/O FINALIDAD PÚBLICA</h3>
  <div class="fld"><div class="lbl">3.1. Objetivo</div><div class="box">${esc(s.objetivo || '')}</div></div>
  <div class="fld"><div class="lbl">3.2. Finalidad</div><div class="box">${esc(s.finalidad || '')}</div></div>

  <h3 class="sec">4. REQUERIMIENTO O CARACTERÍSTICAS TÉCNICAS</h3>
  <div class="fld"><div class="lbl">a) Descripción del bien</div>
    <table><thead><tr><th style="text-align:center">N°</th><th>Código SIGAMEF</th><th>Descripción del bien</th><th style="text-align:center">Unidad</th><th style="text-align:right">Cantidad</th></tr></thead>
    <tbody>${itemsRows || '<tr><td colspan="5" style="text-align:center">—</td></td>'}</tbody>
    <tfoot><tr><th colspan="4" style="text-align:right">TOTAL</th><th style="text-align:right">${totalItems}</th></tr></tfoot>
    </table>
  </div>
  ${renderRequerimientoItemsPrintSection(s.items)}

  ${glosa}

  <div class="firma">
    <div class="l">FIRMA DEL SUB DIRECTOR Y/O<br>JEFE DE UNIDAD</div>
    <div class="l">FIRMA DEL JEFE Y/O<br>DIRECTOR GENERAL</div>
  </div>

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
    const rows = ents.map((e, i) => `<tr><td style="text-align:center">${i + 1}</td><td style="text-align:right">${esc(e.cantidad)}</td><td>${esc(e.plazo)}</td><td>${esc(e.condicion)}</td>`).join('');
    const tot = ents.reduce((a, b) => a + (Number(b.cantidad) || 0), 0);
    return `<h3 class="sec">${esc(pre)}${esc(glosaTituloPrint(item, s))}</h3>
      <div class="box">${esc(glosaContPrint(item, s) || item.intro || '')}</div>
      <table><thead><tr><th style="text-align:center">N° Entrega</th><th style="text-align:right">Cantidad</th><th>Plazo de Entrega</th><th>Condición de entrega</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="text-align:center">—</td></tr>'}</tbody>
      <tfoot><tr><th style="text-align:right">TOTAL</th><th style="text-align:right">${tot}</th><th colspan="2"></th></tr></tfoot></table>`;
  }
  return `<h3 class="sec">${esc(pre)}${esc(glosaTituloPrint(item, s))}</h3><div class="box">${esc(glosaContPrint(item, s))}</div>`;
}

function openPrintWindow(s) {
  const win = window.open('', '_blank');
  if (!win) { alert('Permita las ventanas emergentes para generar el documento.'); return; }
  win.document.open();
  win.document.write(buildPrintHTML(s));
  win.document.close();
}

// =========================================================================
// GESTIÓN DE ADJUNTOS — delegado a adjuntosModal.js (implementación única)
// =========================================================================
const manageAdjuntos = openAdjuntosModal;
async function cargarContadorAdjuntos(requerimientoId) {
  return syncAdjuntosCount(requerimientoId);
}

async function solicitarAprobacion(requerimientoId) {
  if (!confirm('¿Aprobar y enviar este requerimiento a Evaluación de Requerimientos?')) {
    return;
  }

  try {
    const res = await api.put(`/requerimientos/${requerimientoId}/solicitar-aprobacion`, {
      usuario: getUserDisplayName(authService.getCurrentUser()),
    });
    if (res && res.success) {
      alert('Requerimiento enviado a Evaluación de Requerimientos correctamente.');
      loadList();
    } else {
      alert('Error al enviar a evaluación');
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// =========================================================================
// API DEL MÓDULO
// =========================================================================
export function renderRegistroRequerimientoView() {
  return '<div id="reqRoot"></div>';
}

export function initRegistroRequerimientoView() {
  resetState();
  if (reqShared.pendingOpenId != null) {
    const id = reqShared.pendingOpenId;
    reqShared.pendingOpenId = null;
    openRequerimiento(id);
  } else {
    showSelect();
  }
}

// Reutilizados por Evaluación de Requerimientos.
export { printRequerimiento, manageAdjuntos, cargarContadorAdjuntos, openRequerimiento };
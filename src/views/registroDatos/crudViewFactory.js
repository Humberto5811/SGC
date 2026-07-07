// =====================================================
// Fábrica de vistas CRUD genéricas conectadas al backend.
// Genera un par { render, init } a partir de una configuración declarativa,
// con tabla paginada, búsqueda server-side, modal de alta/edición,
// y (opcional) importar/exportar Excel.
// =====================================================
import { api } from '../../services/apiService.js';

const PAGE_SIZE = 50;

/**
 * @param {object} cfg
 * @param {string} cfg.resource    nombre del recurso en la API (ej: 'fichas')
 * @param {string} cfg.title       título visible
 * @param {string} [cfg.icon]      icono bootstrap (ej: 'bi-card-list')
 * @param {string} [cfg.subtitle]
 * @param {Array}  cfg.fields      campos del formulario {name,label,type,required,col,options,step}
 * @param {Array}  cfg.columns     columnas de la tabla {name,label,type}
 * @param {boolean}[cfg.excel]     mostrar importar/exportar Excel
 * @param {string} [cfg.importPath] ruta de importación masiva (ej: '/fichanet/import'). Si se define,
 *                                  Importar Excel envía todas las filas en lote a ese endpoint.
 * @param {Function}[cfg.onPrint]   si se define, agrega un botón de impresión por fila; recibe el item.
 * @param {string} [cfg.printTitle] tooltip del botón de impresión.
 */
export function createCrudView(cfg) {
  const { resource, title, icon = 'bi-table', subtitle = '', fields, columns, excel = false } = cfg;
  const importPath = cfg.importPath || null;
  const tableStyle = cfg.tableStyle || '';
  const onPrint = typeof cfg.onPrint === 'function' ? cfg.onPrint : null;
  const printTitle = cfg.printTitle || 'Imprimir / PDF';

  // Adaptador de API: por defecto usa las rutas REST estándar /<resource>.
  // Se puede sobreescribir (ej. Glosas, cuyo path incluye :tipo).
  const adapter = cfg.api || {
    list: (opts) => api.list(resource, opts),
    create: (body) => api.create(resource, body),
    update: (itemId, body) => api.update(resource, itemId, body),
    remove: (itemId) => api.remove(resource, itemId),
  };

  // Estado por instancia
  const state = { rows: [], page: 1, total: 0, totalPages: 1, search: '', editingId: null, error: '' };

  const id = (suffix) => `${resource}_${suffix}`;

  function formatDateDisplay(v) {
    if (!v) return '';
    const text = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const n = Number(text);
    if (Number.isFinite(n) && n > 20000 && n < 120000) {
      const epoch = Date.UTC(1899, 11, 30);
      return new Date(epoch + Math.round(n) * 86400000).toISOString().slice(0, 10);
    }
    return text.slice(0, 10);
  }

  function fmtCell(item, col) {
    let v = item[col.name];
    if (col.type === 'bool') return v ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle text-secondary"></i>';
    if (col.type === 'money') return (parseFloat(v) || 0).toFixed(2);
    if (col.type === 'date' && v) return formatDateDisplay(v);
    return v == null ? '' : String(v);
  }

  function renderRows() {
    const colspan = columns.length + 1;
    if (state.error) {
      return `<tr><td colspan="${colspan}" class="text-center text-danger py-4">
        <i class="bi bi-exclamation-triangle"></i> ${state.error}<br>
        <small class="text-muted">Verifique que el servidor backend esté corriendo (npm run server).</small></td></tr>`;
    }
    if (state.rows.length === 0) {
      return `<tr><td colspan="${colspan}" class="text-center text-muted py-4">No se encontraron registros</td></tr>`;
    }
    return state.rows.map((item) => {
      const tds = columns.map((c) => {
        const align = (c.type === 'money') ? ' class="text-end"' : (c.type === 'bool' ? ' class="text-center"' : '');
        return `<td${align}>${fmtCell(item, c)}</td>`;
      }).join('');
      const printBtn = onPrint
        ? `<button class="btn btn-sm btn-outline-dark me-1 ${resource}-print" data-id="${item.id}" title="${printTitle}"><i class="bi bi-printer"></i></button>`
        : '';
      return `<tr>${tds}
        <td class="text-center" style="white-space:nowrap;">
          ${printBtn}<button class="btn btn-sm btn-outline-primary me-1 ${resource}-edit" data-id="${item.id}" title="Editar"><i class="bi bi-pencil-square"></i></button>
          <button class="btn btn-sm btn-outline-danger ${resource}-del" data-id="${item.id}" title="Eliminar"><i class="bi bi-trash"></i></button>
        </td></tr>`;
    }).join('');
  }

  function renderPagination() {
    const tp = Math.max(1, state.totalPages);
    if (tp <= 1) return '';
    const maxVisible = 5;
    let startP = Math.max(1, state.page - Math.floor(maxVisible / 2));
    let endP = Math.min(tp, startP + maxVisible - 1);
    if (endP - startP < maxVisible - 1) startP = Math.max(1, endP - maxVisible + 1);
    let pages = '';
    if (startP > 1) pages += `<li class="page-item"><a class="page-link ${resource}-page" data-page="1" href="#">1</a></li>` + (startP > 2 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : '');
    for (let i = startP; i <= endP; i++) {
      pages += `<li class="page-item ${i === state.page ? 'active' : ''}"><a class="page-link ${resource}-page" data-page="${i}" href="#">${i}</a></li>`;
    }
    if (endP < tp) pages += (endP < tp - 1 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : '') + `<li class="page-item"><a class="page-link ${resource}-page" data-page="${tp}" href="#">${tp}</a></li>`;
    return `<nav><ul class="pagination pagination-sm justify-content-center mb-0">
      <li class="page-item ${state.page <= 1 ? 'disabled' : ''}"><a class="page-link ${resource}-page" data-page="${state.page - 1}" href="#">&laquo;</a></li>
      ${pages}
      <li class="page-item ${state.page >= tp ? 'disabled' : ''}"><a class="page-link ${resource}-page" data-page="${state.page + 1}" href="#">&raquo;</a></li>
    </ul></nav>`;
  }

  function renderField(f) {
    const fid = id(`f_${f.name}`);
    const col = f.col || 6;
    let input;
    if (f.type === 'textarea') {
      input = `<textarea class="form-control" id="${fid}" rows="${f.rows || 2}" ${f.required ? 'required' : ''}></textarea>`;
    } else if (f.type === 'select') {
      input = `<select class="form-select" id="${fid}">${(f.options || []).map((o) => `<option value="${o}">${o}</option>`).join('')}</select>`;
    } else if (f.type === 'checkbox') {
      return `<div class="col-md-${col}"><div class="form-check form-switch mt-4">
        <input class="form-check-input" type="checkbox" id="${fid}">
        <label class="form-check-label" for="${fid}">${f.label}</label></div></div>`;
    } else {
      const step = f.type === 'number' || f.type === 'money' ? 'step="0.01"' : '';
      const type = (f.type === 'money' || f.type === 'number') ? 'number' : (f.type === 'date' ? 'date' : 'text');
      input = `<input type="${type}" ${step} class="form-control" id="${fid}" ${f.required ? 'required' : ''}>`;
    }
    return `<div class="col-md-${col}"><label class="form-label fw-bold">${f.label}</label>${input}</div>`;
  }

  function renderModal() {
    return `
    <div class="modal fade" id="${id('modal')}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg"><div class="modal-content">
        <div class="modal-header bg-primary text-white">
          <h5 class="modal-title" id="${id('modalTitle')}">Nuevo Registro</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body"><form id="${id('form')}"><div class="row g-3">
          ${fields.map(renderField).join('')}
        </div></form></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-primary" id="${id('save')}"><i class="bi bi-save"></i> Guardar</button>
        </div>
      </div></div>
    </div>
    <div class="modal fade" id="${id('delModal')}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-sm"><div class="modal-content">
        <div class="modal-header bg-danger text-white"><h5 class="modal-title">Confirmar Eliminación</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
        <div class="modal-body"><p>¿Está seguro de eliminar este registro?</p><p class="fw-bold" id="${id('delName')}"></p></div>
        <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-danger" id="${id('delConfirm')}"><i class="bi bi-trash"></i> Eliminar</button></div>
      </div></div>
    </div>`;
  }

  function render() {
    const ths = columns.map((c) => `<th${c.width ? ` style="width:${c.width};"` : ''}${c.type === 'money' ? ' class="text-end"' : (c.type === 'bool' ? ' class="text-center"' : '')}>${c.label}</th>`).join('');
    const excelBtns = excel ? `
      <label class="btn btn-outline-primary mb-0" for="${id('import')}" style="cursor:pointer;"><i class="bi bi-file-earmark-arrow-up"></i> Importar Excel</label>
      <input type="file" id="${id('import')}" accept=".xlsx,.xls" style="display:none;">
      <button class="btn btn-outline-success" id="${id('export')}"><i class="bi bi-file-earmark-arrow-down"></i> Exportar Excel</button>` : '';
    return `
    <div class="dashboard-container">
      <div class="welcome-banner"><div class="welcome-banner-content">
        <h2><i class="bi ${icon}"></i> ${title}</h2>
        <p>${subtitle || ('Gestión de ' + title.toLowerCase())}</p>
      </div></div>
      <div class="card mb-3"><div class="card-body">
        <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between">
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-success" id="${id('new')}"><i class="bi bi-plus-circle"></i> Nuevo</button>
            ${excelBtns}
          </div>
          <div class="d-flex gap-2 align-items-center">
            <span class="badge bg-info text-dark" id="${id('total')}">0 registros</span>
            <input type="text" class="form-control form-control-sm" id="${id('search')}" placeholder="Buscar..." style="width:220px;">
            <button class="btn btn-sm btn-outline-secondary" id="${id('clear')}" title="Limpiar"><i class="bi bi-x-lg"></i></button>
          </div>
        </div>
      </div></div>
      <div class="card"><div class="card-body p-0"><div class="table-responsive">
        <table class="table table-hover table-bordered table-sm mb-0"${tableStyle ? ` style="${tableStyle}"` : ''}>
          <thead class="table-dark"><tr>${ths}<th style="width:90px;" class="text-center">Acciones</th></tr></thead>
          <tbody id="${id('body')}"><tr><td colspan="${columns.length + 1}" class="text-center text-muted py-4">Cargando...</td></tr></tbody>
        </table>
      </div></div>
      <div class="card-footer d-flex justify-content-between align-items-center flex-wrap gap-2">
        <small class="text-muted" id="${id('pagInfo')}">Mostrando 0 de 0</small>
        <div id="${id('pag')}"></div>
      </div></div>
      ${renderModal()}
    </div>`;
  }

  async function fetchPage() {
    try {
      const resp = await adapter.list({ page: state.page, pageSize: PAGE_SIZE, search: state.search });
      state.rows = resp.data || [];
      state.total = resp.total || 0;
      state.totalPages = resp.totalPages || 1;
      if (state.page > state.totalPages) state.page = state.totalPages;
      state.error = '';
    } catch (e) {
      state.rows = []; state.total = 0; state.totalPages = 1;
      state.error = e.message || 'No se pudo conectar con el servidor.';
    }
  }

  function paint() {
    const tbody = document.getElementById(id('body'));
    if (!tbody) return;
    tbody.innerHTML = renderRows();
    const pag = document.getElementById(id('pag'));
    if (pag) pag.innerHTML = renderPagination();
    const start = state.total > 0 ? (state.page - 1) * PAGE_SIZE + 1 : 0;
    const end = Math.min(start + state.rows.length - 1, state.total);
    const info = document.getElementById(id('pagInfo'));
    if (info) info.textContent = `Mostrando ${start}-${end < 0 ? 0 : end} de ${state.total}`;
    const total = document.getElementById(id('total'));
    if (total) total.textContent = `${state.total} registros`;
  }

  async function refresh() { await fetchPage(); paint(); }

  function readForm() {
    const obj = {};
    for (const f of fields) {
      const el = document.getElementById(id(`f_${f.name}`));
      if (!el) continue;
      if (f.type === 'checkbox') obj[f.name] = el.checked;
      else if (f.type === 'money' || f.type === 'number') obj[f.name] = parseFloat(el.value) || 0;
      else obj[f.name] = el.value;
    }
    return obj;
  }

  function fillForm(item) {
    for (const f of fields) {
      const el = document.getElementById(id(`f_${f.name}`));
      if (!el) continue;
      const v = item ? item[f.name] : undefined;
      if (f.type === 'checkbox') el.checked = !!v;
      else if (f.type === 'date') el.value = v ? String(v).slice(0, 10) : '';
      else if (f.type === 'select') el.value = v == null ? (el.options[0] ? el.options[0].value : '') : v;
      else el.value = v == null ? '' : v;
    }
  }

  function openModal(item) {
    state.editingId = item ? item.id : null;
    const t = document.getElementById(id('modalTitle'));
    if (t) t.textContent = item ? 'Editar Registro' : 'Nuevo Registro';
    fillForm(item);
    new bootstrap.Modal(document.getElementById(id('modal'))).show();
  }

  async function save() {
    const data = readForm();
    const required = fields.filter((f) => f.required);
    for (const f of required) {
      if (!data[f.name]) { alert(`El campo "${f.label}" es obligatorio.`); return; }
    }
    const btn = document.getElementById(id('save'));
    if (btn) btn.disabled = true;
    try {
      if (state.editingId != null) await adapter.update(state.editingId, data);
      else await adapter.create(data);
      await refresh();
      const m = bootstrap.Modal.getInstance(document.getElementById(id('modal')));
      if (m) m.hide();
    } catch (e) {
      alert('Error al guardar: ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function confirmDelete(itemId) {
    const item = state.rows.find((r) => String(r.id) === String(itemId));
    if (!item) return;
    const nameEl = document.getElementById(id('delName'));
    if (nameEl) nameEl.textContent = columns.map((c) => fmtCell(item, c)).filter(Boolean).slice(0, 2).join(' - ');
    new bootstrap.Modal(document.getElementById(id('delModal'))).show();
    const btn = document.getElementById(id('delConfirm'));
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', async () => {
      try { await adapter.remove(itemId); await refresh(); }
      catch (e) { alert('Error al eliminar: ' + e.message); }
      const m = bootstrap.Modal.getInstance(document.getElementById(id('delModal')));
      if (m) m.hide();
    });
  }

  function exportExcel() {
    (async () => {
      try {
        const all = [];
        let page = 1, pages = 1;
        do {
          const resp = await adapter.list({ page, pageSize: 5000, search: state.search });
          all.push(...(resp.data || []));
          pages = resp.totalPages || 1; page += 1;
        } while (page <= pages);
        if (all.length === 0) { alert('No hay datos para exportar.'); return; }
        const exportData = all.map((item) => {
          const o = {};
          for (const c of columns) {
            o[c.name] = c.type === 'bool' ? (item[c.name] ? 1 : 0) : (item[c.name] == null ? '' : item[c.name]);
          }
          return o;
        });
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 28));
        XLSX.writeFile(wb, `${resource}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      } catch (e) { alert('Error al exportar: ' + e.message); }
    })();
  }

  function formatImportStats(resp, fileName = '') {
    const leidos = resp.leidos ?? resp.read ?? '—';
    const ins = resp.insertados ?? resp.inserted ?? 0;
    const upd = resp.actualizados ?? resp.updated ?? 0;
    const omit = resp.omitidos ?? resp.skipped ?? 0;
    const errs = (resp.errores || []).length;
    const dur = resp.duracion_ms ? `\nTiempo: ${resp.duracion_ms} ms` : '';
    const archivo = fileName ? `\nArchivo: ${fileName}` : '';
    let msg = `Importación UPSERT finalizada.${archivo}${dur}\n\nLeídos: ${leidos}\nInsertados: ${ins}\nActualizados: ${upd}\nOmitidos: ${omit}\nErrores: ${errs}`;
    if (errs > 0 && resp.errores?.length) {
      const preview = resp.errores.slice(0, 5).map((e) => `  Fila ${e.fila}: ${e.error}`).join('\n');
      msg += `\n\nDetalle (primeros errores):\n${preview}`;
    }
    return msg;
  }

  // Importación masiva UPSERT vía ImportEngine (sin TRUNCATE).
  function bulkImport(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!raw.length) { alert('El archivo no contiene datos.'); return; }
        const rows = raw.map((r) => {
          const rec = {};
          Object.keys(r).forEach((k) => { rec[k.toLowerCase().trim()] = r[k]; });
          return rec;
        });
        const resp = await api.post(importPath, {
          rows,
          archivo: file.name || '',
          fileName: file.name || '',
        });
        state.page = 1; state.search = '';
        const si = document.getElementById(id('search')); if (si) si.value = '';
        await refresh();
        alert(formatImportStats(resp, file.name));
      } catch (err) {
        console.error('Error al importar Excel (masivo):', err);
        alert('Error al importar: ' + (err.message || 'verifique el formato del archivo.'));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function importExcel(file) {
    if (importPath) { bulkImport(file); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rows.length) { alert('El archivo no contiene datos.'); return; }
        // Mapea encabezados (case-insensitive) a nombres de campo conocidos.
        const fieldNames = fields.map((f) => f.name);
        const toBool = (v) => v === true || v === 1 || ['1', 'si', 'sí', 'x', 'true'].includes(String(v).toLowerCase());
        let ok = 0, fail = 0;
        for (const raw of rows) {
          const rec = {};
          const lower = {};
          Object.keys(raw).forEach((k) => { lower[k.toLowerCase().trim()] = raw[k]; });
          for (const f of fields) {
            const key = f.name.toLowerCase();
            const label = (f.label || '').toLowerCase();
            let v = lower[key] !== undefined ? lower[key] : lower[label];
            if (v === undefined) continue;
            if (f.type === 'checkbox') rec[f.name] = toBool(v);
            else if (f.type === 'money' || f.type === 'number') rec[f.name] = parseFloat(v) || 0;
            else rec[f.name] = v;
          }
          if (Object.keys(rec).length === 0) continue;
          try { await adapter.create(rec); ok += 1; } catch (e) { fail += 1; console.warn(`[import] Fila ${ok + fail} falló:`, e.message); }
        }
        state.page = 1; state.search = '';
        const si = document.getElementById(id('search')); if (si) si.value = '';
        await refresh();
        alert(`Importación finalizada: ${ok} registros agregados${fail ? `, ${fail} con error` : ''}.`);
      } catch (err) {
        console.error('Error al importar Excel:', err);
        alert('Error al procesar el archivo Excel. Verifique el formato.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function onClick(e) {
    if (onPrint) {
      const pr = e.target.closest(`.${resource}-print`);
      if (pr) { e.preventDefault(); const it = state.rows.find((r) => String(r.id) === String(pr.dataset.id)); if (it) onPrint(it); return; }
    }
    const edit = e.target.closest(`.${resource}-edit`);
    if (edit) { e.preventDefault(); const it = state.rows.find((r) => String(r.id) === String(edit.dataset.id)); openModal(it); return; }
    const del = e.target.closest(`.${resource}-del`);
    if (del) { e.preventDefault(); confirmDelete(del.dataset.id); return; }
    const pg = e.target.closest(`.${resource}-page`);
    if (pg) { e.preventDefault(); const p = parseInt(pg.dataset.page, 10); if (p >= 1 && p <= Math.max(1, state.totalPages)) { state.page = p; refresh(); } return; }
  }

  let searchTimer = null;

  function init() {
    state.page = 1; state.search = ''; state.editingId = null;
    refresh();

    const bind = (sid, ev, fn) => { const el = document.getElementById(id(sid)); if (el) el.addEventListener(ev, fn); };
    bind('new', 'click', () => openModal(null));
    bind('save', 'click', save);
    bind('export', 'click', exportExcel);
    bind('import', 'change', (e) => { const f = e.target.files[0]; if (f) { importExcel(f); e.target.value = ''; } });
    bind('search', 'input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.search = e.target.value.trim(); state.page = 1; refresh(); }, 350);
    });
    bind('clear', 'click', () => { const si = document.getElementById(id('search')); if (si) si.value = ''; state.search = ''; state.page = 1; refresh(); });

    document.removeEventListener('click', onClick);
    document.addEventListener('click', onClick);
  }

  return { render, init };
}

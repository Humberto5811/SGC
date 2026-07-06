/**
 * Sistema de Paginación Universal para SGC
 * - Paginación real (server-side) cuando el backend devuelve metadatos
 * - Paginación virtual (client-side) cuando el backend devuelve todo
 * - Integración con ordenamiento (Prompt #5) vía resetPage()
 */

const paginationState = {};

export function getPaginationState(key, defaultState = { page: 1, pageSize: 25 }) {
  if (!paginationState[key]) {
    paginationState[key] = {
      page: defaultState.page || 1,
      pageSize: defaultState.pageSize || 25,
      total: 0,
      totalPages: 1,
      isVirtual: false,
    };
  }
  return paginationState[key];
}

export function updatePaginationState(key, updates) {
  const state = getPaginationState(key);
  Object.assign(state, updates);
  return state;
}

function extractAllData(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.data)) return result.data;
  if (Array.isArray(result.filas)) return result.filas;
  if (Array.isArray(result.paquetes)) return result.paquetes;
  return [];
}

function applyVirtualSlice(state, allData) {
  const totalItems = Array.isArray(allData) ? allData.length : 0;
  state.total = totalItems;
  state.totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize));
  state.isVirtual = true;
  if (state.page > state.totalPages) state.page = state.totalPages;
  if (state.page < 1) state.page = 1;
  const start = (state.page - 1) * state.pageSize;
  const end = Math.min(start + state.pageSize, totalItems);
  const pageData = Array.isArray(allData) ? allData.slice(start, end) : [];
  return {
    data: pageData,
    total: totalItems,
    page: state.page,
    pageSize: state.pageSize,
    totalPages: state.totalPages,
    isVirtual: true,
    allData,
  };
}

function applyServerMetadata(state, result) {
  state.total = result.total ?? 0;
  state.page = result.page ?? state.page;
  state.pageSize = result.pageSize ?? state.pageSize;
  state.totalPages = result.totalPages ?? 1;
  state.isVirtual = false;
  return {
    data: result.data || [],
    total: state.total,
    page: state.page,
    pageSize: state.pageSize,
    totalPages: state.totalPages,
    isVirtual: false,
    metadata: result,
  };
}

function processPaginationResult(state, result) {
  const hasMetadata = result != null
    && result.total !== undefined
    && result.page !== undefined
    && result.totalPages !== undefined;

  if (hasMetadata) {
    return applyServerMetadata(state, result);
  }
  return applyVirtualSlice(state, extractAllData(result));
}

/**
 * @param {string} key - Identificador único de bandeja
 * @param {Function} loadFunction - (params) => Promise<result>
 * @param {{ defaultPageSize?: number, pageSizeOptions?: number[] }} options
 */
export function usePagination(key, loadFunction, options = {}) {
  const { defaultPageSize = 25, pageSizeOptions = [25, 50, 100] } = options;
  const state = getPaginationState(key, { page: 1, pageSize: defaultPageSize });
  let cachedParams = {};

  async function loadData(params = {}, resetPage = false) {
    if (resetPage) state.page = 1;
    cachedParams = { ...params };
    const backendParams = {
      page: state.page,
      pageSize: state.pageSize,
      ...params,
    };
    const result = await loadFunction(backendParams);
    return processPaginationResult(state, result);
  }

  function paginateVirtual(allRows) {
    return applyVirtualSlice(state, allRows);
  }

  async function reload() {
    return loadData(cachedParams, false);
  }

  function renderControls(containerId, onReload) {
    renderPaginationControls(
      containerId,
      {
        total: state.total,
        page: state.page,
        pageSize: state.pageSize,
        totalPages: state.totalPages,
      },
      async (updates) => {
        if (updates.pageSize != null) {
          state.pageSize = updates.pageSize;
          state.page = 1;
        }
        if (updates.page != null) {
          state.page = Math.max(1, Math.min(updates.page, state.totalPages || 1));
        }
        if (typeof onReload === 'function') await onReload();
        else await reload();
      },
      { pageSizeOptions, isVirtual: state.isVirtual },
    );
  }

  return {
    state,
    loadData,
    paginateVirtual,
    reload,
    renderControls,
    resetPage: () => { state.page = 1; },
    getQueryParams: () => ({ page: state.page, pageSize: state.pageSize }),
    pageSizeOptions,
  };
}

function generatePageNumbers(current, total) {
  const pages = [];
  const maxVisible = 5;

  if (total <= maxVisible) {
    for (let i = 1; i <= total; i += 1) pages.push(i);
  } else {
    pages.push(1);
    let start = Math.max(2, current - 1);
    let end = Math.min(total - 1, current + 1);

    if (current <= 3) end = Math.min(total - 1, 4);
    if (current >= total - 2) start = Math.max(2, total - 3);

    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i += 1) pages.push(i);
    if (end < total - 1) pages.push('...');
    if (total > 1) pages.push(total);
  }

  return pages.map((p) => {
    if (p === '...') {
      return '<li class="page-item disabled"><span class="page-link">…</span></li>';
    }
    return `<li class="page-item ${p === current ? 'active' : ''}">
      <a class="page-link" data-page="${p}" href="#">${p}</a>
    </li>`;
  }).join('');
}

export function renderPaginationControls(containerId, metadata, onPageChange, options = {}) {
  const { total, page, pageSize, totalPages } = metadata;
  const { pageSizeOptions = [25, 50, 100], isVirtual = false } = options;

  const container = document.getElementById(containerId);
  if (!container) return;

  const host = container.closest('.sgc-bandeja-wrap')
    || container.closest('.ped-matriz-wrap')
    || container.closest('.paq-matriz-wrap')
    || container.closest('.inv-tab-panel')
    || container.parentElement;
  if (!host) return;

  const existing = host.querySelector(':scope > .sgc-pagination-controls');
  if (existing) existing.remove();

  const virtualBadge = isVirtual
    ? '<span class="badge bg-info ms-2 small">Virtual</span>'
    : '';

  const html = `
    <div class="sgc-pagination-controls d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
      <div class="sgc-pagination-size">
        <span class="text-muted small">Mostrar:</span>
        <select class="form-select form-select-sm d-inline-block w-auto ms-1" id="${containerId}-size">
          ${pageSizeOptions.map((size) =>
    `<option value="${size}" ${pageSize === size ? 'selected' : ''}>${size}</option>`).join('')}
        </select>
        <span class="text-muted small ms-2">${total} registros</span>
        ${virtualBadge}
      </div>
      <div class="sgc-pagination-nav d-flex align-items-center flex-wrap gap-2">
        <nav>
          <ul class="pagination pagination-sm mb-0">
            <li class="page-item ${page <= 1 ? 'disabled' : ''}">
              <a class="page-link" data-page="1" href="#">«</a>
            </li>
            <li class="page-item ${page <= 1 ? 'disabled' : ''}">
              <a class="page-link" data-page="${page - 1}" href="#">‹</a>
            </li>
            ${generatePageNumbers(page, totalPages)}
            <li class="page-item ${page >= totalPages ? 'disabled' : ''}">
              <a class="page-link" data-page="${page + 1}" href="#">›</a>
            </li>
            <li class="page-item ${page >= totalPages ? 'disabled' : ''}">
              <a class="page-link" data-page="${totalPages}" href="#">»</a>
            </li>
          </ul>
        </nav>
        <span class="text-muted small">Página ${page} de ${totalPages}</span>
      </div>
    </div>`;

  host.insertAdjacentHTML('beforeend', html);

  const sizeSelect = document.getElementById(`${containerId}-size`);
  if (sizeSelect) {
    sizeSelect.onchange = function onSizeChange() {
      const newSize = parseInt(this.value, 10);
      if (!Number.isNaN(newSize)) onPageChange({ page: 1, pageSize: newSize });
    };
  }

  host.querySelectorAll('.sgc-pagination-controls .page-link[data-page]').forEach((link) => {
    link.onclick = function onNavClick(e) {
      e.preventDefault();
      const newPage = parseInt(this.dataset.page, 10);
      if (newPage && newPage !== page && !Number.isNaN(newPage)) {
        onPageChange({ page: newPage });
      }
    };
  });
}

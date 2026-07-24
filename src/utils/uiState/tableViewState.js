/**
 * RC8.0 — Estado de contexto de bandeja por viewId (scroll, filtros, página, tab…).
 */

const store = new Map();

function emptyState() {
  return {
    scrollLeft: 0,
    scrollTop: 0,
    windowScrollY: 0,
    page: 1,
    pageSize: 25,
    filters: {},
    sortField: null,
    sortDirection: 'desc',
    activeTab: null,
    expandedRows: [],
    selectedIds: [],
  };
}

export function getTableViewState(viewId) {
  const key = String(viewId);
  if (!store.has(key)) store.set(key, emptyState());
  return store.get(key);
}

export function updateTableViewState(viewId, partial = {}) {
  const state = getTableViewState(viewId);
  Object.assign(state, partial || {});
  return state;
}

export function clearTableViewState(viewId) {
  store.delete(String(viewId));
}

/**
 * Captura scroll del contenedor de tabla (y opcionalmente window).
 */
export function captureTableViewState(viewId, options = {}) {
  const state = getTableViewState(viewId);
  const scrollEl = typeof options.scrollSelector === 'string'
    ? document.querySelector(options.scrollSelector)
    : options.scrollEl;
  if (scrollEl) {
    state.scrollLeft = scrollEl.scrollLeft || 0;
    state.scrollTop = scrollEl.scrollTop || 0;
  }
  if (options.captureWindow !== false) {
    state.windowScrollY = window.scrollY || 0;
  }
  if (options.filters) state.filters = { ...options.filters };
  if (options.page != null) state.page = options.page;
  if (options.pageSize != null) state.pageSize = options.pageSize;
  if (options.sortField != null) state.sortField = options.sortField;
  if (options.sortDirection != null) state.sortDirection = options.sortDirection;
  if (options.activeTab != null) state.activeTab = options.activeTab;
  if (options.selectedIds) state.selectedIds = [...options.selectedIds];
  return { ...state };
}

/**
 * Restaura scroll tras un paint (requestAnimationFrame doble para layout estable).
 */
export function restoreTableViewState(viewId, options = {}) {
  const state = getTableViewState(viewId);
  const apply = () => {
    const scrollEl = typeof options.scrollSelector === 'string'
      ? document.querySelector(options.scrollSelector)
      : options.scrollEl;
    if (scrollEl) {
      scrollEl.scrollLeft = state.scrollLeft || 0;
      scrollEl.scrollTop = state.scrollTop || 0;
    }
    if (options.restoreWindow) {
      window.scrollTo(0, state.windowScrollY || 0);
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(apply));
  return { ...state };
}

/** Rehidrata inputs de filtro estándar de bandeja (prefixFiltro*). */
export function hydrateFilterInputs(prefix, filters = {}) {
  const map = {
    Buscar: filters.buscar || filters.codigo || '',
    Estado: filters.estado_actual || '',
    Responsable: filters.responsable_actual || '',
    Area: filters.area || '',
    FechaDesde: filters.fecha_desde || '',
    FechaHasta: filters.fecha_hasta || '',
  };
  Object.entries(map).forEach(([suffix, value]) => {
    const el = document.getElementById(`${prefix}Filtro${suffix}`);
    if (el) el.value = value;
  });
}

export const tableViewState = {
  get: getTableViewState,
  update: updateTableViewState,
  clear: clearTableViewState,
  capture: captureTableViewState,
  restore: restoreTableViewState,
  hydrateFilterInputs,
};

export default tableViewState;

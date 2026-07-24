/** RC8.0 — Barril de utilidades de estado UI / refresh no destructivo. */
export {
  createViewLifecycle,
  cleanupCurrentView,
  getActiveViewLifecycle,
} from './viewLifecycle.js';

export {
  pollingRegistry,
  startPolling,
  stopPolling,
  stopAllPolling,
  hasPolling,
  getPollingIds,
} from './pollingRegistry.js';

export {
  createRequestSequenceGuard,
  isAbortError,
} from './requestSequenceGuard.js';

export {
  createTableSelectionState,
} from './tableSelectionState.js';

export {
  tableViewState,
  getTableViewState,
  updateTableViewState,
  clearTableViewState,
  captureTableViewState,
  restoreTableViewState,
  hydrateFilterInputs,
} from './tableViewState.js';

export {
  createBackgroundRefreshIndicator,
} from './backgroundRefreshIndicator.js';

export {
  ensureBandejaTableShell,
  captureScroll,
  restoreScroll,
  setEmptyState,
} from './bandejaRefresh.js';

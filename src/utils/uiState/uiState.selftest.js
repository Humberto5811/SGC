/**
 * Self-test RC8.0 utilitarios uiState (sin framework).
 * Ejecutar: node src/utils/uiState/uiState.selftest.js
 */
import { createViewLifecycle, cleanupCurrentView } from './viewLifecycle.js';
import { startPolling, stopPolling, hasPolling, getPollingIds } from './pollingRegistry.js';
import { createRequestSequenceGuard, isAbortError } from './requestSequenceGuard.js';
import { createTableSelectionState } from './tableSelectionState.js';
import { updateTableViewState, getTableViewState, clearTableViewState } from './tableViewState.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  OK  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${msg}`);
  }
}

console.log('1. SelectionState');
{
  const sel = createTableSelectionState();
  sel.select(1).select('2').select(1);
  assert(sel.size === 2, 'size after duplicate select');
  assert(sel.has(1) && sel.has(2), 'has ids');
  sel.toggle(1);
  assert(!sel.has(1) && sel.size === 1, 'toggle off');
  const r = sel.reconcile([2, 3], [2]);
  assert(r.kept.length === 1 && r.kept[0] === '2', 'reconcile keeps eligible');
  sel.clear();
  assert(sel.size === 0, 'clear');
}

console.log('2. Lifecycle cleanup once');
{
  let n = 0;
  const lc = createViewLifecycle('test-view');
  lc.addCleanup(() => { n += 1; });
  assert(lc.isActive(), 'active after create');
  lc.destroy();
  lc.destroy();
  assert(n === 1, 'cleanup once');
  assert(!lc.isActive(), 'inactive after destroy');
  cleanupCurrentView();
}

console.log('3. PollingRegistry no duplicados');
{
  startPolling('p1', () => {}, 999999);
  startPolling('p1', () => {}, 999999);
  assert(getPollingIds().filter((x) => x === 'p1').length === 1, 'single id');
  assert(hasPolling('p1'), 'has polling');
  stopPolling('p1');
  assert(!hasPolling('p1'), 'stopped');
}

console.log('4. RequestSequenceGuard');
{
  const g = createRequestSequenceGuard();
  const a = g.begin();
  const b = g.begin();
  assert(!a.isCurrent() && b.isCurrent(), 'B is current, A stale');
  assert(isAbortError({ name: 'AbortError' }), 'detect AbortError');
}

console.log('5. tableViewState isolation');
{
  updateTableViewState('va', { page: 3, filters: { buscar: 'x' } });
  updateTableViewState('vb', { page: 1, filters: { buscar: 'y' } });
  assert(getTableViewState('va').page === 3, 'va page');
  assert(getTableViewState('vb').filters.buscar === 'y', 'vb filters');
  clearTableViewState('va');
  assert(getTableViewState('va').page === 1, 'va reset default');
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed) process.exit(1);

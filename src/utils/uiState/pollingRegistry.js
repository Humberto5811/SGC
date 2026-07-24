/**
 * RC8.0 — Un solo polling activo por vista/ID.
 */

const registry = new Map();
const g = typeof globalThis !== 'undefined' ? globalThis : {};

export function hasPolling(id) {
  return registry.has(String(id));
}

export function stopPolling(id) {
  const key = String(id);
  const entry = registry.get(key);
  if (!entry) return;
  try { g.clearInterval(entry.handle); } catch (_) { /* noop */ }
  registry.delete(key);
}

export function stopAllPolling(viewIdPrefix) {
  const prefix = viewIdPrefix == null ? null : String(viewIdPrefix);
  for (const key of [...registry.keys()]) {
    if (prefix == null || key === prefix || key.startsWith(`${prefix}:`)) {
      stopPolling(key);
    }
  }
}

/**
 * @param {string} id
 * @param {() => void} callback
 * @param {number} milliseconds
 * @param {{ containerSelector?: string, skipIfInteracting?: () => boolean }} [opts]
 */
export function startPolling(id, callback, milliseconds, opts = {}) {
  const key = String(id);
  stopPolling(key);

  const handle = g.setInterval(() => {
    if (opts.containerSelector && typeof document !== 'undefined' && !document.querySelector(opts.containerSelector)) {
      stopPolling(key);
      return;
    }
    if (typeof opts.skipIfInteracting === 'function' && opts.skipIfInteracting()) {
      return;
    }
    try { callback(); } catch (_) { /* noop */ }
  }, milliseconds);

  registry.set(key, { handle, milliseconds });
  return handle;
}

export function getPollingIds() {
  return [...registry.keys()];
}

export const pollingRegistry = {
  hasPolling,
  stopPolling,
  stopAllPolling,
  startPolling,
  getPollingIds,
};

export default pollingRegistry;

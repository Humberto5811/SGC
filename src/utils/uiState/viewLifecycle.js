/**
 * RC8.0 — Ciclo de vida de vistas SGC.
 * Registra cleanup (timers, listeners, AbortControllers) y evita render tras destroy.
 */

let activeLifecycle = null;
const g = typeof globalThis !== 'undefined' ? globalThis : {};

export function getActiveViewLifecycle() {
  return activeLifecycle;
}

export function cleanupCurrentView() {
  if (!activeLifecycle) return;
  try {
    activeLifecycle.destroy();
  } catch (_) { /* idempotente */ }
  activeLifecycle = null;
}

export function createViewLifecycle(viewId) {
  cleanupCurrentView();

  const cleanups = [];
  let destroyed = false;
  const id = String(viewId || 'view');

  const api = {
    viewId: id,

    isActive() {
      return !destroyed && activeLifecycle === api;
    },

    addCleanup(fn) {
      if (typeof fn !== 'function' || destroyed) return;
      cleanups.push(fn);
    },

    addInterval(callback, milliseconds) {
      if (destroyed) return null;
      const handle = g.setInterval(() => {
        if (!api.isActive()) return;
        callback();
      }, milliseconds);
      cleanups.push(() => g.clearInterval(handle));
      return handle;
    },

    addTimeout(callback, milliseconds) {
      if (destroyed) return null;
      const handle = g.setTimeout(() => {
        if (!api.isActive()) return;
        callback();
      }, milliseconds);
      cleanups.push(() => g.clearTimeout(handle));
      return handle;
    },

    addEventListener(target, event, handler, options) {
      if (destroyed || !target?.addEventListener) return;
      target.addEventListener(event, handler, options);
      cleanups.push(() => {
        try { target.removeEventListener(event, handler, options); } catch (_) { /* noop */ }
      });
    },

    addAbortController(controller) {
      if (!controller || destroyed) return controller;
      cleanups.push(() => {
        try { if (!controller.signal.aborted) controller.abort(); } catch (_) { /* noop */ }
      });
      return controller;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (activeLifecycle === api) activeLifecycle = null;
      while (cleanups.length) {
        const fn = cleanups.pop();
        try { fn(); } catch (_) { /* noop */ }
      }
    },
  };

  activeLifecycle = api;
  return api;
}

export default createViewLifecycle;

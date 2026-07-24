/**
 * RC8.0 — Evita que respuestas antiguas sobrescriban datos nuevos.
 */

export function isAbortError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const msg = String(err.message || err);
  return /abort|cancelled|canceled/i.test(msg);
}

export function createRequestSequenceGuard() {
  let seq = 0;
  let currentController = null;

  return {
    begin({ abortPrevious = true } = {}) {
      seq += 1;
      const token = seq;

      if (abortPrevious && currentController) {
        try { currentController.abort(); } catch (_) { /* noop */ }
      }

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      currentController = controller;

      return {
        token,
        signal: controller?.signal,
        controller,
        isCurrent() {
          return token === seq;
        },
        abort() {
          try { controller?.abort(); } catch (_) { /* noop */ }
        },
      };
    },

    isCurrent(token) {
      return token === seq;
    },

    getCurrentToken() {
      return seq;
    },

    abortCurrent() {
      try { currentController?.abort(); } catch (_) { /* noop */ }
      currentController = null;
    },
  };
}

export default createRequestSequenceGuard;

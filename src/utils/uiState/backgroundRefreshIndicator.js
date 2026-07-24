/**
 * RC8.0 — Indicador discreto de actualización en segundo plano (sin destruir la tabla).
 */

const STYLE_ID = 'sgc-bg-refresh-style';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .sgc-bg-refresh {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 0.75rem; color: #5f6368; min-height: 1.25rem;
      opacity: 0; transition: opacity .15s ease; pointer-events: none;
    }
    .sgc-bg-refresh.is-visible { opacity: 1; }
    .sgc-bg-refresh.is-error { color: #b3261e; }
    .sgc-bg-refresh .spinner-border { width: .75rem; height: .75rem; border-width: .12em; }
  `;
  document.head.appendChild(style);
}

/**
 * @param {string|HTMLElement} hostOrSelector — contenedor donde insertar el indicador
 * @param {{ id?: string }} [opts]
 */
export function createBackgroundRefreshIndicator(hostOrSelector, opts = {}) {
  ensureStyles();
  const id = opts.id || 'sgcBgRefresh';
  let el = document.getElementById(id);

  const host = typeof hostOrSelector === 'string'
    ? document.querySelector(hostOrSelector)
    : hostOrSelector;

  if (!el && host) {
    el = document.createElement('span');
    el.id = id;
    el.className = 'sgc-bg-refresh';
    el.setAttribute('aria-live', 'polite');
    host.appendChild(el);
  }

  return {
    show(message = 'Actualizando…') {
      if (!el) return;
      el.classList.remove('is-error');
      el.classList.add('is-visible');
      el.innerHTML = `<span class="spinner-border" role="status" aria-hidden="true"></span><span>${message}</span>`;
    },

    error(message = 'No se pudo actualizar. Se conservan los datos actuales.') {
      if (!el) return;
      el.classList.add('is-visible', 'is-error');
      el.innerHTML = `<i class="bi bi-exclamation-circle"></i><span>${message}</span>`;
    },

    hide() {
      if (!el) return;
      el.classList.remove('is-visible', 'is-error');
      el.innerHTML = '';
    },

    get element() {
      return el;
    },
  };
}

export default createBackgroundRefreshIndicator;

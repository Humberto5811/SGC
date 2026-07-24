/**
 * RC8.0 — Helpers para refresh no destructivo de bandejas (tbody + scroll).
 */

import {
  captureTableViewState,
  restoreTableViewState,
} from './tableViewState.js';

/**
 * Asegura un shell de tabla con thead/tbody estables.
 * @returns {{ outer: HTMLElement, wrap: HTMLElement, thead: HTMLElement, tbody: HTMLElement } | null}
 */
export function ensureBandejaTableShell(container, {
  outerId,
  wrapId,
  theadId,
  tbodyId,
  outerClass = 'sgc-bandeja-wrap',
  wrapClass = 'table-responsive',
  tableClass = 'table table-sm table-hover table-bordered req-list-table mb-0',
  emptyId = null,
} = {}) {
  if (!container) return null;
  let wrap = document.getElementById(wrapId);
  let tbody = document.getElementById(tbodyId);
  if (wrap && tbody) {
    return {
      outer: document.getElementById(outerId) || wrap.parentElement,
      wrap,
      thead: document.getElementById(theadId) || wrap.querySelector('thead'),
      tbody,
      empty: emptyId ? document.getElementById(emptyId) : null,
    };
  }

  container.innerHTML = `
    <div class="${outerClass}" id="${outerId}">
      <div class="${wrapClass}" id="${wrapId}">
        <table class="${tableClass}">
          <thead class="table-light" id="${theadId}"></thead>
          <tbody id="${tbodyId}"></tbody>
        </table>
      </div>
      ${emptyId ? `<div id="${emptyId}" class="alert alert-light border d-none"></div>` : ''}
    </div>`;

  return {
    outer: document.getElementById(outerId),
    wrap: document.getElementById(wrapId),
    thead: document.getElementById(theadId),
    tbody: document.getElementById(tbodyId),
    empty: emptyId ? document.getElementById(emptyId) : null,
  };
}

export function captureScroll(viewId, scrollSelector) {
  return captureTableViewState(viewId, { scrollSelector });
}

export function restoreScroll(viewId, scrollSelector) {
  return restoreTableViewState(viewId, { scrollSelector });
}

export function setEmptyState(shell, { empty = true, message = '' } = {}) {
  if (!shell) return;
  if (shell.wrap) shell.wrap.classList.toggle('d-none', !!empty);
  if (shell.empty) {
    shell.empty.classList.toggle('d-none', !empty);
    if (message) shell.empty.textContent = message;
  }
}

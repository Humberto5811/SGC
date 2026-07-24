/**
 * RC8.0 — Selección de filas independiente del DOM (IDs estables).
 */

export function createTableSelectionState({ normalizeId = (id) => String(id) } = {}) {
  const selected = new Set();

  function norm(id) {
    if (id == null || id === '') return null;
    return normalizeId(id);
  }

  const api = {
    select(id) {
      const n = norm(id);
      if (n != null) selected.add(n);
      return api;
    },

    deselect(id) {
      const n = norm(id);
      if (n != null) selected.delete(n);
      return api;
    },

    toggle(id) {
      const n = norm(id);
      if (n == null) return api;
      if (selected.has(n)) selected.delete(n);
      else selected.add(n);
      return api;
    },

    has(id) {
      const n = norm(id);
      return n != null && selected.has(n);
    },

    clear() {
      selected.clear();
      return api;
    },

    values() {
      return [...selected];
    },

    get size() {
      return selected.size;
    },

    /**
     * Conserva solo IDs presentes en validIds.
     * Si se pasa eligibleIds, además quita los no elegibles.
     * @returns {{ removed: string[], kept: string[] }}
     */
    reconcile(validIds, eligibleIds = null) {
      const valid = new Set((validIds || []).map(norm).filter((x) => x != null));
      const eligible = eligibleIds == null
        ? null
        : new Set((eligibleIds || []).map(norm).filter((x) => x != null));
      const removed = [];
      for (const id of [...selected]) {
        if (!valid.has(id) || (eligible && !eligible.has(id))) {
          selected.delete(id);
          removed.push(id);
        }
      }
      return { removed, kept: [...selected] };
    },

    removeMany(ids) {
      (ids || []).forEach((id) => api.deselect(id));
      return api;
    },

    /**
     * Restaura checked en checkboxes del contenedor.
     */
    restoreCheckboxes(container, selector = 'input[type="checkbox"][data-id]', getId = (el) => el.dataset.id) {
      if (!container) return api;
      container.querySelectorAll(selector).forEach((el) => {
        const id = getId(el);
        el.checked = api.has(id);
      });
      return api;
    },
  };

  return api;
}

export default createTableSelectionState;

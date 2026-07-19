/**
 * Drag & drop de modales Bootstrap SGC — arrastre solo desde .modal-header.
 * No mueve backdrop ni el contenido interno; conserva posición al soltar.
 */

const MIN_VISIBLE = 48;
const BOUND_ATTR = 'sgcDragBound';

function clampDialogPosition(dialog, left, top) {
  const rect = dialog.getBoundingClientRect();
  const w = rect.width || dialog.offsetWidth || 320;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Mantener visible al menos MIN_VISIBLE px del encabezado
  const minLeft = -(w - MIN_VISIBLE);
  const maxLeft = vw - MIN_VISIBLE;
  const minTop = 0;
  const maxTop = Math.max(0, vh - MIN_VISIBLE);
  return {
    left: Math.min(maxLeft, Math.max(minLeft, left)),
    top: Math.min(maxTop, Math.max(minTop, top)),
  };
}

function isInteractiveTarget(target) {
  return !!target?.closest?.(
    'button, .btn-close, a, input, select, textarea, label, [role="button"]',
  );
}

/**
 * Habilita arrastre del .modal-dialog desde su .modal-header.
 * @param {HTMLElement} modalEl — elemento .modal
 */
export function makeModalDraggable(modalEl) {
  if (!modalEl || modalEl.nodeType !== 1 || !modalEl.classList.contains('modal')) return;
  if (modalEl.dataset.sgcDragSkip === '1') return;

  const dialog = modalEl.querySelector('.modal-dialog');
  const header = modalEl.querySelector('.modal-header');
  if (!dialog || !header) return;
  if (header.dataset[BOUND_ATTR] === '1' || header.dataset.draggableBound === '1') return;

  header.dataset[BOUND_ATTR] = '1';
  header.dataset.draggableBound = '1';
  header.classList.add('sgc-modal-drag-handle');
  header.style.cursor = 'grab';
  header.style.userSelect = 'none';
  header.style.touchAction = 'none';

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  const resetDialogStyle = () => {
    dialog.style.position = '';
    dialog.style.left = '';
    dialog.style.top = '';
    dialog.style.margin = '';
    dialog.style.transform = '';
  };

  const onMove = (e) => {
    if (!dragging) return;
    const next = clampDialogPosition(
      dialog,
      originLeft + (e.clientX - startX),
      originTop + (e.clientY - startY),
    );
    dialog.style.left = `${next.left}px`;
    dialog.style.top = `${next.top}px`;
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    header.style.cursor = 'grab';
    document.body.style.removeProperty('cursor');
  };

  const onDown = (e) => {
    if (e.button !== 0) return;
    if (isInteractiveTarget(e.target)) return;
    const rect = dialog.getBoundingClientRect();
    dialog.style.position = 'fixed';
    dialog.style.margin = '0';
    dialog.style.transform = 'none';
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    originLeft = rect.left;
    originTop = rect.top;
    header.style.cursor = 'grabbing';
    document.body.style.cursor = 'grabbing';
    e.preventDefault();
  };

  header.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  modalEl.addEventListener('hidden.bs.modal', () => {
    dragging = false;
    header.style.cursor = 'grab';
    document.body.style.removeProperty('cursor');
    resetDialogStyle();
  });
}

/**
 * Activa arrastre automático en todos los modales SGC (Bootstrap + fallback).
 * Idempotente.
 */
export function initSgcModalDragging() {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset.sgcModalDragInit === '1') return;
  document.documentElement.dataset.sgcModalDragInit = '1';

  document.addEventListener('shown.bs.modal', (e) => {
    makeModalDraggable(e.target);
  });

  const observeTarget = document.body || document.documentElement;
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        const el = m.target;
        if (el.classList?.contains('modal') && el.classList.contains('show')) {
          makeModalDraggable(el);
        }
      }
      if (m.type === 'childList') {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.classList?.contains('modal') && n.classList.contains('show')) {
            makeModalDraggable(n);
          }
          n.querySelectorAll?.('.modal.show').forEach((el) => makeModalDraggable(el));
        });
      }
    }
  });
  obs.observe(observeTarget, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  document.querySelectorAll('.modal.show').forEach((el) => makeModalDraggable(el));
}

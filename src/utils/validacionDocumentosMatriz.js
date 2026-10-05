/**
 * RC8.17.8H6-C3-D8-C3/D — Matriz revisión documental + modal por ítem.
 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Acciones compactas Ver/Descargar (patrón Recepción). */
export function renderDocIconActions(cotId, ref, escFn = esc) {
  if (!ref) return '<span class="text-muted small">—</span>';
  const id = escFn(String(cotId ?? ''));
  const r = escFn(ref);
  return `<span class="val-doc-actions d-inline-flex gap-1 align-items-center">
    <button type="button" class="btn btn-link btn-sm p-0 text-secondary val-cot-ver" data-cot-id="${id}" data-ref="${r}"
      title="Ver" aria-label="Ver"><i class="bi bi-eye"></i></button>
    <button type="button" class="btn btn-link btn-sm p-0 text-danger val-cot-dl" data-cot-id="${id}" data-ref="${r}"
      title="Descargar" aria-label="Descargar"><i class="bi bi-download"></i></button>
  </span>`;
}

function renderDocsListCompact(cotId, docs, emptyLabel, escFn) {
  const list = (docs || []).filter((d) => d.disponible !== false && d.ref);
  if (!list.length) {
    return `<span class="text-muted small">${escFn(emptyLabel)}</span>`;
  }
  return list.map((d) => `
    <div class="d-flex align-items-center gap-1 mb-1 small">
      <span class="text-truncate flex-grow-1" title="${escFn(d.nombre)}">${escFn(d.nombre)}</span>
      ${renderDocIconActions(cotId, d.ref, escFn)}
    </div>`).join('');
}

export function renderMatrizDocumentalRevision(matrizDocumental, escFn = esc) {
  const filas = matrizDocumental?.filas || [];
  if (!filas.length) {
    return '<div class="alert alert-light border small mb-0">No hay ítems cotizados para revisar documentación.</div>';
  }
  return `
    <div class="table-responsive val-docs-matriz-wrap" style="max-height:420px">
      <table class="table table-sm table-bordered table-hover align-middle mb-0">
        <thead class="table-light sticky-top">
          <tr>
            <th>Proveedor</th>
            <th>Requerimiento</th>
            <th class="val-docs-desc-col">Descripción</th>
            <th style="min-width:11rem">Documentos solicitados</th>
            <th style="min-width:11rem">Documentos técnicos</th>
          </tr>
        </thead>
        <tbody>
          ${filas.map((f) => `
            <tr data-cot-id="${escFn(f.cotizacion_id)}" data-item-key="${escFn(f.item_key)}">
              <td class="small">${escFn(f.razon_social || '—')}</td>
              <td class="small">${escFn(f.requerimiento_codigo || '—')}</td>
              <td class="small val-docs-desc-col" title="${escFn(f.descripcion)}">${escFn(f.descripcion || '—')}</td>
              <td class="small">${renderDocsListCompact(f.cotizacion_id, f.documentos_solicitados, 'Sin documentos solicitados', escFn)}</td>
              <td class="small">${f.legacy_global_rtm
    ? '<span class="text-muted small">Sin documentos técnicos por ítem (legacy global)</span>'
    : renderDocsListCompact(
      f.cotizacion_id,
      f.documentos_tecnicos,
      'Sin documentos técnicos',
      escFn,
    )}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

export function renderItemDocumentosModalBody(fila, escFn = esc) {
  if (!fila) {
    return '<div class="alert alert-warning small mb-0">No se encontró la fila documental.</div>';
  }
  return `
    <div class="small mb-2">
      <div><span class="text-muted">Proveedor:</span> <strong>${escFn(fila.razon_social)}</strong></div>
      <div><span class="text-muted">Requerimiento:</span> ${escFn(fila.requerimiento_codigo || '—')}</div>
      <div><span class="text-muted">Ítem:</span> ${escFn(fila.descripcion || fila.item_key)}</div>
    </div>
    <h6 class="small fw-semibold mt-3">Documentos solicitados</h6>
    <div class="mb-3">${renderDocsListCompact(fila.cotizacion_id, fila.documentos_solicitados, 'Sin documentos solicitados', escFn)}</div>
    <h6 class="small fw-semibold">Documentos técnicos</h6>
    <div>${fila.legacy_global_rtm
    ? '<p class="text-muted small mb-0">Sin documentos técnicos por ítem (presentación legacy global).</p>'
    : renderDocsListCompact(fila.cotizacion_id, fila.documentos_tecnicos, 'Sin documentos técnicos', escFn)}</div>`;
}

export function findMatrizDocumentalFila(matrizDocumental, cotizacionId, itemKey) {
  const cid = String(cotizacionId);
  const ik = String(itemKey || '');
  return (matrizDocumental?.filas || []).find((f) => String(f.cotizacion_id) === cid
    && (String(f.item_key) === ik
      || String(f.item_key) === `${cid}:${ik}`
      || String(f.item_key).endsWith(`:${ik}`)
      || ik.endsWith(String(f.item_key))));
}

/** Modal Bootstrap sobre el modal Validar existente. */
export function showValidacionItemDocumentosModal(fila, { onBindDocs, escFn = esc } = {}) {
  const modalId = `valItemDocs_${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true" style="z-index:1080">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header py-2">
            <h6 class="modal-title">Documentos del ítem</h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body py-2" id="${modalId}_body">
            ${renderItemDocumentosModalBody(fila, escFn)}
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const el = document.getElementById(modalId);
  const bsModal = window.bootstrap?.Modal?.getOrCreateInstance(el);
  el.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
  if (onBindDocs) onBindDocs(el.querySelector(`#${modalId}_body`));
  bsModal?.show();
}

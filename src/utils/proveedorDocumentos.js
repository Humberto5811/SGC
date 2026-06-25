import { portalService } from '../services/portalService.js';
import { esc } from './proveedorShared.js';

function docIcon(nombre, mime) {
  const n = String(nombre || '').toLowerCase();
  const m = String(mime || '').toLowerCase();
  if (n.endsWith('.doc') || n.endsWith('.docx') || m.includes('word')) return 'bi-file-earmark-word text-primary';
  if (n.endsWith('.xls') || n.endsWith('.xlsx') || m.includes('sheet')) return 'bi-file-earmark-excel text-success';
  return 'bi-file-earmark-pdf text-danger';
}

function canOpenDoc(d) {
  return d.disponible === true || !!d.adjunto_id || !!d.embedded;
}

export function renderDocumentoLista(docs = [], { compact = false } = {}) {
  if (!docs.length) {
    return `<span class="text-muted small">${compact ? '—' : 'Sin documentos'}</span>`;
  }
  return docs.map((d) => `
    <div class="prov-doc-row ${compact ? 'mb-1' : 'mb-2 pb-1 border-bottom'}">
      <div class="small d-flex align-items-start gap-1">
        <i class="bi ${docIcon(d.nombre, d.mime_type)}"></i>
        <span class="flex-grow-1">${esc(d.nombre)}</span>
      </div>
      ${canOpenDoc(d) ? `
        <div class="mt-1 d-flex gap-1 flex-wrap">
          <button type="button" class="btn btn-outline-primary btn-sm py-0 px-2 prov-doc-ver"
            data-sol-id="${esc(d._solicitudId || '')}" data-ref="${esc(d.ref)}"
            data-mime="${esc(d.mime_type || '')}">Ver</button>
          <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-2 prov-doc-dl"
            data-sol-id="${esc(d._solicitudId || '')}" data-ref="${esc(d.ref)}"
            data-name="${esc(d.nombre)}" data-mime="${esc(d.mime_type || '')}">Descargar</button>
        </div>` : `<div class="small text-muted">${esc(d.fuente || 'Referencia')} — pendiente de adjunto</div>`}
    </div>`).join('');
}

export function renderRequisitosTecnicos(list = []) {
  if (!list.length) {
    return '<p class="text-muted small mb-0">No se registraron requisitos técnicos mínimos.</p>';
  }
  return `
    <div class="table-responsive">
      <table class="table table-sm table-bordered mb-0">
        <thead class="table-light"><tr>
          <th>Requisito técnico mínimo</th><th class="text-center" style="width:110px;">Obligatorio</th><th>Observación</th>
        </tr></thead>
        <tbody>${list.map((r) => `
          <tr>
            <td>${esc(r.requisito || r.nombre || '—')}</td>
            <td class="text-center">${r.obligatorio !== false ? '<i class="bi bi-check-circle-fill text-success"></i>' : '—'}</td>
            <td class="small">${r.archivo ? esc(r.archivo) : '—'}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

export function ensurePdfViewerModal() {
  if (document.getElementById('provPdfModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="provPdfModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header py-2">
            <h6 class="modal-title" id="provPdfModalTitle">Documento</h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-0" style="min-height:70vh;">
            <iframe id="provPdfFrame" title="Visor documento" style="width:100%;height:70vh;border:0;"></iframe>
            <div id="provDocNoPreview" class="d-none p-4 text-center">
              <p class="mb-3">Este tipo de archivo no puede previsualizarse en el navegador.</p>
              <button type="button" class="btn btn-primary btn-sm" id="provDocNoPreviewDl">Descargar archivo</button>
            </div>
          </div>
        </div>
      </div>
    </div>`);
}

function isPdfLike(mime, name) {
  const m = String(mime || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  return m.includes('pdf') || n.endsWith('.pdf');
}

export function bindDocumentoActions(root, solicitudId) {
  ensurePdfViewerModal();
  root.querySelectorAll('.prov-doc-ver').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sid = btn.dataset.solId || solicitudId;
      const ref = btn.dataset.ref;
      const mime = btn.dataset.mime || '';
      const name = btn.closest('.prov-doc-row')?.querySelector('span')?.textContent?.trim() || 'Documento';
      try {
        const blob = await portalService.fetchDocumentoBlob(sid, ref, 'ver');
        const url = URL.createObjectURL(blob);
        const frame = document.getElementById('provPdfFrame');
        const noPreview = document.getElementById('provDocNoPreview');
        const title = document.getElementById('provPdfModalTitle');
        if (title) title.textContent = name;

        if (isPdfLike(mime || blob.type, name)) {
          frame?.classList.remove('d-none');
          noPreview?.classList.add('d-none');
          if (frame) frame.src = url;
        } else {
          frame?.classList.add('d-none');
          noPreview?.classList.remove('d-none');
          const dlBtn = document.getElementById('provDocNoPreviewDl');
          if (dlBtn) {
            dlBtn.onclick = () => {
              const a = document.createElement('a');
              a.href = url;
              a.download = name;
              a.click();
            };
          }
        }
        bootstrap.Modal.getOrCreateInstance(document.getElementById('provPdfModal')).show();
      } catch (err) { alert(err.message); }
    });
  });
  root.querySelectorAll('.prov-doc-dl').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sid = btn.dataset.solId || solicitudId;
      const ref = btn.dataset.ref;
      const name = btn.dataset.name || 'documento.pdf';
      try {
        await portalService.downloadDocumento(sid, ref, name);
      } catch (err) { alert(err.message); }
    });
  });
}

export function attachSolicitudId(docs, solicitudId) {
  return (docs || []).map((d) => ({ ...d, _solicitudId: solicitudId }));
}

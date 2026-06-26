// Visor de documentos interno SGC (adjuntos de requerimientos)
import { adjuntosService } from '../services/adjuntosService.js';
import { api } from '../services/apiService.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isPdfLike(mime, name) {
  const m = String(mime || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  return m.includes('pdf') || n.endsWith('.pdf');
}

function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDt(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function ensureViewerModal() {
  if (document.getElementById('sgcDocViewerModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="sgcDocViewerModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header py-2">
            <h6 class="modal-title" id="sgcDocViewerTitle">Documento</h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-0" style="min-height:70vh;">
            <iframe id="sgcDocViewerFrame" title="Visor documento" style="width:100%;height:70vh;border:0;"></iframe>
            <div id="sgcDocViewerFallback" class="d-none p-4 text-center">
              <p class="mb-3">Este tipo de archivo no puede previsualizarse en el navegador.</p>
              <button type="button" class="btn btn-primary btn-sm" id="sgcDocViewerDl">Descargar archivo</button>
            </div>
          </div>
        </div>
      </div>
    </div>`);
}

let lastBlobUrl = null;

function revokeLastBlob() {
  if (lastBlobUrl) {
    URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = null;
  }
}

export function openBase64Document({ nombre, mime_type, contenido_base64 }) {
  ensureViewerModal();
  revokeLastBlob();
  const mime = mime_type || 'application/octet-stream';
  const bytes = atob(contenido_base64 || '');
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: mime });
  const url = URL.createObjectURL(blob);
  lastBlobUrl = url;
  showInViewer(nombre || 'Documento', mime, url);
}

export async function openAdjuntoDocument(adjuntoId, nombre, mimeType) {
  await previewAdjuntoById(adjuntoId, nombre, mimeType);
}

export async function previewAdjuntoById(adjuntoId, nombreArchivo, mimeType) {
  ensureViewerModal();
  revokeLastBlob();
  try {
    const data = await api.get(`/adjuntos/descargar/${adjuntoId}`);
    if (data?.contenido_base64) {
      openBase64Document({
        nombre: nombreArchivo,
        mime_type: data.mime_type || mimeType,
        contenido_base64: data.contenido_base64,
      });
      return;
    }
    throw new Error('Documento sin contenido');
  } catch (_) {
    await adjuntosService.descargarAdjunto(adjuntoId, nombreArchivo);
  }
}

function showInViewer(nombre, mime, url) {
  const title = document.getElementById('sgcDocViewerTitle');
  const frame = document.getElementById('sgcDocViewerFrame');
  const fallback = document.getElementById('sgcDocViewerFallback');
  if (title) title.textContent = nombre;
  if (isPdfLike(mime, nombre)) {
    frame?.classList.remove('d-none');
    fallback?.classList.add('d-none');
    if (frame) frame.src = url;
  } else {
    frame?.classList.add('d-none');
    fallback?.classList.remove('d-none');
    const dlBtn = document.getElementById('sgcDocViewerDl');
    if (dlBtn) {
      dlBtn.onclick = () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        a.click();
      };
    }
  }
  const modalEl = document.getElementById('sgcDocViewerModal');
  modalEl?.addEventListener('hidden.bs.modal', revokeLastBlob, { once: true });
  window.bootstrap?.Modal?.getOrCreateInstance(modalEl)?.show();
}

export function renderAdjuntosTable(adjuntos = [], { showActions = true } = {}) {
  if (!adjuntos.length) {
    return '<p class="text-muted small mb-0">Sin documentos adjuntos.</p>';
  }
  return `
    <div class="table-responsive">
      <table class="table table-sm table-bordered mb-0">
        <thead class="table-light"><tr>
          <th>Documento</th><th>Tipo</th><th>Fecha</th><th>Tamaño</th><th>Estado</th>
          ${showActions ? '<th>Acciones</th>' : ''}
        </tr></thead>
        <tbody>${adjuntos.map((a) => `
          <tr>
            <td>${esc(a.nombre_archivo || a.nombre)}</td>
            <td class="small">${esc(a.mime_type || '—')}</td>
            <td class="small">${fmtDt(a.created_at || a.fecha_registro)}</td>
            <td class="small">${fmtBytes(a.tamaño_bytes || a.tamano)}</td>
            <td><span class="badge bg-success">Disponible</span></td>
            ${showActions ? `<td class="text-nowrap">
              <button type="button" class="btn btn-sm btn-outline-primary sgc-adj-ver" data-id="${a.id}"
                data-name="${esc(a.nombre_archivo)}" data-mime="${esc(a.mime_type || '')}">Ver</button>
              <button type="button" class="btn btn-sm btn-outline-secondary sgc-adj-dl" data-id="${a.id}"
                data-name="${esc(a.nombre_archivo)}">Descargar</button>
            </td>` : ''}
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

export function bindAdjuntosTable(root) {
  root.querySelectorAll('.sgc-adj-ver').forEach((btn) => {
    btn.onclick = () => previewAdjuntoById(btn.dataset.id, btn.dataset.name, btn.dataset.mime);
  });
  root.querySelectorAll('.sgc-adj-dl').forEach((btn) => {
    btn.onclick = () => adjuntosService.descargarAdjunto(btn.dataset.id, btn.dataset.name);
  });
}

export function renderDocumentosTable(docs = [], { editableOtros = false } = {}) {
  if (!docs.length) return '<p class="text-muted small mb-0">Sin documentos.</p>';
  return `
    <div class="table-responsive">
      <table class="table table-sm table-bordered mb-0">
        <thead class="table-light"><tr>
          <th>Documento</th><th>Tipo</th><th>Fecha</th><th>Versión</th><th>Tamaño</th><th>Estado</th><th>Acciones</th>
        </tr></thead>
        <tbody>${docs.map((d, i) => {
          const esOtros = String(d.documento || d.tipo || '').toLowerCase().includes('otros');
          const puedeEditar = editableOtros && esOtros;
          const tieneArchivo = !!(d.archivo || d.nombre);
          return `<tr>
            <td>${esc(d.documento || d.tipo || d.nombre || '—')}</td>
            <td class="small">${esc(d.tipo_doc || d.mime_type || 'PDF')}</td>
            <td class="small">${fmtDt(d.fecha_registro || d.fecha)}</td>
            <td class="small">${esc(d.version || '1.0')}</td>
            <td class="small">${fmtBytes(d.tamano || d.tamaño_bytes)}</td>
            <td><span class="badge bg-${tieneArchivo ? 'success' : 'secondary'}">${tieneArchivo ? 'Cargado' : 'Pendiente'}</span></td>
            <td class="text-nowrap">
              ${tieneArchivo && d.contenido_base64 ? `<button type="button" class="btn btn-sm btn-outline-primary sgc-doc-ver" data-i="${i}">Ver</button>` : ''}
              ${tieneArchivo && d.contenido_base64 ? `<button type="button" class="btn btn-sm btn-outline-secondary sgc-doc-dl" data-i="${i}">Descargar</button>` : ''}
              ${puedeEditar ? `<button type="button" class="btn btn-sm btn-outline-danger sgc-doc-del" data-i="${i}">Eliminar</button>` : ''}
              ${puedeEditar && !tieneArchivo ? `<button type="button" class="btn btn-sm btn-outline-primary sgc-doc-add" data-i="${i}">Agregar</button>` : ''}
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
}

export function bindDocumentosTable(root, docs, { onChange } = {}) {
  root.querySelectorAll('.sgc-doc-ver').forEach((btn) => {
    btn.onclick = () => {
      const d = docs[parseInt(btn.dataset.i, 10)];
      if (d?.contenido_base64) openBase64Document({ nombre: d.archivo || d.nombre || d.documento, mime_type: d.mime_type, contenido_base64: d.contenido_base64 });
    };
  });
  root.querySelectorAll('.sgc-doc-dl').forEach((btn) => {
    btn.onclick = () => {
      const d = docs[parseInt(btn.dataset.i, 10)];
      if (!d?.contenido_base64) return;
      openBase64Document({ nombre: d.archivo || d.nombre || d.documento, mime_type: d.mime_type, contenido_base64: d.contenido_base64 });
      const a = document.createElement('a');
      a.href = `data:${d.mime_type || 'application/octet-stream'};base64,${d.contenido_base64}`;
      a.download = d.archivo || d.nombre || 'documento';
      a.click();
    };
  });
  root.querySelectorAll('.sgc-doc-del').forEach((btn) => {
    btn.onclick = () => {
      const i = parseInt(btn.dataset.i, 10);
      if (docs[i]) { docs[i].archivo = ''; docs[i].contenido_base64 = ''; if (onChange) onChange(); }
    };
  });
  root.querySelectorAll('.sgc-doc-add').forEach((btn) => {
    btn.onclick = () => {
      const i = parseInt(btn.dataset.i, 10);
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f || !docs[i]) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          docs[i].archivo = f.name;
          docs[i].mime_type = f.type;
          docs[i].tamano = f.size;
          docs[i].fecha_registro = new Date().toISOString();
          docs[i].contenido_base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
          if (onChange) onChange();
        };
        reader.readAsDataURL(f);
      };
      input.click();
    };
  });
}

export { esc, fmtDt, fmtBytes, isPdfLike };

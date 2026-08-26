/**
 * RC8.15.6G-8 — Visor y modales del checklist documental de Pagos.
 */
import { entregablesServiciosService } from '../services/entregablesServiciosService.js';
import { ordenesContratacionService } from '../services/ordenesContratacionService.js';
import { api } from '../services/apiService.js';
import { openBase64Document, openBlobDocument, previewAdjuntoById } from './documentViewer.js';
import {
  badgeEstadoChecklist,
  labelEstadoChecklist,
  TIPOS_ANALISTA_CHECKLIST,
  TIPO_CHECKLIST_OTRO,
} from '../../shared/entregableChecklistPago.js';

const ROOT_ID = 'pagoChecklistModalRoot';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ensureRoot() {
  let el = document.getElementById(ROOT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ROOT_ID;
    document.body.appendChild(el);
  }
  return el;
}

function showModal(html) {
  const root = ensureRoot();
  root.innerHTML = html;
  const modalEl = root.querySelector('.modal');
  // eslint-disable-next-line no-undef
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static' });
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => { root.innerHTML = ''; }, { once: true });
  return { root, modalEl, modal };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

export async function openChecklistPreview(preview, ctx = {}) {
  if (!preview?.kind) throw new Error('Documento no disponible');
  const name = preview.nombre || 'documento';
  if (preview.kind === 'adjunto' && preview.id) {
    await previewAdjuntoById(preview.id, name);
    return;
  }
  if (preview.kind === 'ccp' && ctx.requerimiento_id) {
    const resp = await ordenesContratacionService.getCcpFirmado(ctx.requerimiento_id, true);
    const doc = resp?.data || resp;
    if (!doc?.contenido_base64) throw new Error('CCP sin contenido');
    openBase64Document({
      nombre: doc.nombre_archivo || name,
      mime_type: doc.mime_type || 'application/pdf',
      contenido_base64: doc.contenido_base64,
    });
    return;
  }
  if (preview.kind === 'cotizacion' && preview.cotizacion_id && preview.ref) {
    const path = `/contrataciones/portal-analista/cotizaciones/${preview.cotizacion_id}/documento/${encodeURIComponent(preview.ref)}/ver`;
    const { blob, contentType } = await api.getBlob(path);
    await openBlobDocument({ nombre: name, mime_type: contentType, blob });
    return;
  }
  if (preview.kind === 'orden' && ctx.orden_id && preview.id) {
    const res = await ordenesContratacionService.getDocumento(ctx.orden_id, preview.id, true);
    const doc = res?.data || res;
    if (!doc?.contenido_base64) throw new Error('Documento sin contenido');
    openBase64Document({
      nombre: doc.nombre_archivo || name,
      mime_type: doc.mime_type || 'application/pdf',
      contenido_base64: doc.contenido_base64,
    });
    return;
  }
  if (preview.kind === 'entregable_recepcion' && preview.recepcion_id && preview.id) {
    const { blob, contentType } = await entregablesServiciosService.previewDocumentoBlob(
      preview.recepcion_id,
      preview.id,
    );
    await openBlobDocument({ nombre: name, mime_type: contentType, blob });
    return;
  }
  if (preview.kind === 'pago_documento' && ctx.orden_entrega_id && preview.id) {
    const { blob, contentType } = await api.getBlob(
      `/entregables-servicios/${ctx.orden_entrega_id}/checklist-pago/documentos/${preview.id}/preview`,
    );
    await openBlobDocument({ nombre: name, mime_type: contentType, blob });
    return;
  }
  if (preview.kind === 'conformidad_firmada' && ctx.orden_entrega_id && preview.id) {
    const { blob, contentType } = await entregablesServiciosService.previewActaFirmadaBlob(
      ctx.orden_entrega_id,
      preview.id,
    );
    await openBlobDocument({ nombre: name, mime_type: contentType, blob });
    return;
  }
  if (preview.kind === 'conformidad_generada' && ctx.orden_entrega_id && preview.id) {
    const { blob, contentType } = await entregablesServiciosService.previewActaGeneradaBlob(
      ctx.orden_entrega_id,
      preview.id,
    );
    await openBlobDocument({ nombre: name, mime_type: contentType, blob });
    return;
  }
  if (preview.kind === 'adjunto' || preview.kind === 'orden' || preview.kind === 'cotizacion') {
    if (preview.id && ctx.requerimiento_id) {
      await previewAdjuntoById(preview.id, name);
      return;
    }
  }
  throw new Error('No se pudo abrir el documento');
}

function renderChecklistTable(filas = [], bloque = 'SISTEMA', { gestionar = false } = {}) {
  if (!filas.length) return '<p class="text-muted small mb-0">Sin ítems.</p>';
  return `<div class="table-responsive"><table class="table table-sm table-bordered mb-0" style="font-size:11px">
    <thead class="table-light"><tr>
      <th>Documento</th><th>Estado</th><th>Vigencia</th><th>Fuente</th><th></th>
      ${gestionar ? '<th>Gestión</th>' : ''}
    </tr></thead>
    <tbody>${filas.map((f, idx) => {
    const badge = badgeEstadoChecklist(f.estado);
    const canVer = Boolean(f.preview);
    const docId = f.documento_id;
    return `<tr>
      <td>${esc(f.label)}</td>
      <td><span class="badge bg-${badge}">${esc(labelEstadoChecklist(f.estado))}</span></td>
      <td class="text-nowrap">${esc(f.vigencia || '—')}</td>
      <td>${esc(f.fuente || '—')}</td>
      <td class="text-nowrap">
        ${canVer ? `<button type="button" class="btn btn-sm btn-outline-primary pago-chk-ver" data-bloque="${esc(bloque)}" data-idx="${idx}">Ver</button>` : '<span class="text-muted">—</span>'}
      </td>
      ${gestionar ? `<td class="text-nowrap">
        ${docId ? `
          <button type="button" class="btn btn-sm btn-outline-secondary pago-chk-rep" data-id="${esc(docId)}">Reemplazar</button>
          <button type="button" class="btn btn-sm btn-outline-danger pago-chk-del" data-id="${esc(docId)}">Eliminar</button>
        ` : `<button type="button" class="btn btn-sm btn-outline-primary pago-chk-adj" data-tipo="${esc(f.tipo_documento || '')}">Adjuntar</button>`}
      </td>` : ''}
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

async function reloadChecklistModal(entregableId, modalEl) {
  const resp = await entregablesServiciosService.obtenerChecklistPago(entregableId);
  const data = resp?.data || resp || {};
  modalEl._checklistCtx = {
    orden_entrega_id: entregableId,
    orden_id: data.orden_id,
    requerimiento_id: data.requerimiento_id,
    bloques: {
      SISTEMA: data.bloques?.sistema || [],
      ANALISTA: data.bloques?.analista || [],
    },
    puede_gestionar: Boolean(data.puede_gestionar_analista),
  };
  const prog = modalEl.querySelector('#pagoChecklistProgreso');
  if (prog) prog.textContent = data.progreso?.texto || '';
  const sistema = modalEl.querySelector('#pagoChecklistSistema');
  const analista = modalEl.querySelector('#pagoChecklistAnalista');
  if (sistema) {
    sistema.innerHTML = renderChecklistTable(modalEl._checklistCtx.bloques.SISTEMA, 'SISTEMA', { gestionar: false });
  }
  if (analista) {
    analista.innerHTML = renderChecklistTable(modalEl._checklistCtx.bloques.ANALISTA, 'ANALISTA', {
      gestionar: Boolean(data.puede_gestionar_analista),
    });
  }
  bindChecklistTableActions(modalEl);
}

function bindChecklistTableActions(modalEl) {
  const ctx = modalEl._checklistCtx || {};
  modalEl.querySelectorAll('.pago-chk-ver').forEach((btn) => {
    btn.onclick = async () => {
      const bloque = btn.dataset.bloque || 'SISTEMA';
      const fila = (ctx.bloques?.[bloque] || [])[Number(btn.dataset.idx)];
      try {
        const preview = fila?.preview;
        if (preview?.kind === 'ccp') preview.kind = 'ccp';
        await openChecklistPreview(preview, ctx);
      } catch (err) {
        window.alert(err.message || 'No se pudo abrir el documento');
      }
    };
  });
  modalEl.querySelectorAll('.pago-chk-adj').forEach((btn) => {
    btn.onclick = () => openAdjuntarChecklistDoc(modalEl, btn.dataset.tipo || TIPO_CHECKLIST_OTRO);
  });
  modalEl.querySelectorAll('.pago-chk-rep').forEach((btn) => {
    btn.onclick = () => openReemplazarChecklistDoc(modalEl, btn.dataset.id);
  });
  modalEl.querySelectorAll('.pago-chk-del').forEach((btn) => {
    btn.onclick = async () => {
      if (!window.confirm('¿Eliminar este documento del checklist?')) return;
      try {
        await entregablesServiciosService.retirarDocumentoChecklistPago(ctx.orden_entrega_id, btn.dataset.id);
        await reloadChecklistModal(ctx.orden_entrega_id, modalEl);
      } catch (err) {
        window.alert(err.message || 'No se pudo eliminar');
      }
    };
  });
  const addBtn = modalEl.querySelector('#pagoChecklistAddOtro');
  if (addBtn) {
    addBtn.onclick = () => openAdjuntarChecklistDoc(modalEl, TIPO_CHECKLIST_OTRO);
  }
}

function openAdjuntarChecklistDoc(modalEl, tipo) {
  const ctx = modalEl._checklistCtx || {};
  const esOtro = tipo === TIPO_CHECKLIST_OTRO;
  const label = esOtro ? 'Otro documento' : (TIPOS_ANALISTA_CHECKLIST.find((t) => t.codigo === tipo)?.label || tipo);
  const html = `
    <div class="modal fade" tabindex="-1" id="pagoChecklistAdjModal">
      <div class="modal-dialog"><div class="modal-content">
        <form id="pagoChecklistAdjForm">
          <div class="modal-header py-2">
            <h6 class="modal-title mb-0">Adjuntar — ${esc(label)}</h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            ${esOtro ? `
              <div class="mb-2">
                <label class="form-label small mb-0">Descripción</label>
                <input type="text" class="form-control form-control-sm" id="pagoChecklistAdjDesc" required>
              </div>
              <div class="mb-2">
                <label class="form-label small mb-0">Obligatorio</label>
                <select class="form-select form-select-sm" id="pagoChecklistAdjObl">
                  <option value="1">Sí</option><option value="0">No</option>
                </select>
              </div>` : ''}
            <div class="mb-2">
              <label class="form-label small mb-0">Archivo</label>
              <input type="file" class="form-control form-control-sm" id="pagoChecklistAdjFile" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" required>
            </div>
            <div class="alert alert-danger d-none small py-2" id="pagoChecklistAdjErr"></div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-sm btn-primary">Adjuntar</button>
          </div>
        </form>
      </div></div>
    </div>`;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  const adjEl = wrap.querySelector('.modal');
  // eslint-disable-next-line no-undef
  const adjModal = bootstrap.Modal.getOrCreateInstance(adjEl);
  adjModal.show();
  adjEl.querySelector('#pagoChecklistAdjForm').onsubmit = async (e) => {
    e.preventDefault();
    const errBox = adjEl.querySelector('#pagoChecklistAdjErr');
    const file = adjEl.querySelector('#pagoChecklistAdjFile')?.files?.[0];
    if (!file) return;
    try {
      errBox?.classList.add('d-none');
      const contenido_base64 = await fileToBase64(file);
      const body = {
        tipo_documento: tipo,
        documento: {
          nombre_archivo: file.name,
          mime_type: file.type || 'application/pdf',
          contenido_base64,
        },
      };
      if (esOtro) {
        body.descripcion = adjEl.querySelector('#pagoChecklistAdjDesc')?.value?.trim();
        body.obligatorio = adjEl.querySelector('#pagoChecklistAdjObl')?.value === '1';
      }
      await entregablesServiciosService.adjuntarDocumentoChecklistPago(ctx.orden_entrega_id, body);
      adjModal.hide();
      await reloadChecklistModal(ctx.orden_entrega_id, modalEl);
    } catch (err) {
      if (errBox) {
        errBox.textContent = err.message || 'No se pudo adjuntar';
        errBox.classList.remove('d-none');
      }
    }
  };
  adjEl.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
}

function openReemplazarChecklistDoc(modalEl, documentoId) {
  const ctx = modalEl._checklistCtx || {};
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.png,.jpg,.jpeg,.doc,.docx';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const contenido_base64 = await fileToBase64(file);
      await entregablesServiciosService.reemplazarDocumentoChecklistPago(ctx.orden_entrega_id, documentoId, {
        documento: {
          nombre_archivo: file.name,
          mime_type: file.type || 'application/pdf',
          contenido_base64,
        },
      });
      await reloadChecklistModal(ctx.orden_entrega_id, modalEl);
    } catch (err) {
      window.alert(err.message || 'No se pudo reemplazar');
    }
  };
  input.click();
}

export async function openChecklistPagoModal(entregableId) {
  const { modalEl } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header py-2">
            <h5 class="modal-title mb-0"><i class="bi bi-list-check"></i> Checklist del expediente de pago</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-light border small py-2 mb-3" id="pagoChecklistProgreso">Cargando…</div>
            <h6 class="small fw-bold">Documentos del sistema</h6>
            <div class="mb-3" id="pagoChecklistSistema"><p class="text-muted small">Cargando…</p></div>
            <h6 class="small fw-bold">Documentos a cargo del Analista CM</h6>
            <div class="mb-2" id="pagoChecklistAnalista"><p class="text-muted small">Cargando…</p></div>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="pagoChecklistAddOtro">
              <i class="bi bi-plus"></i> Agregar otro documento
            </button>
          </div>
        </div>
      </div>
    </div>`);
  try {
    await reloadChecklistModal(entregableId, modalEl);
    const addBtn = modalEl.querySelector('#pagoChecklistAddOtro');
    if (addBtn && !modalEl._checklistCtx?.puede_gestionar) addBtn.classList.add('d-none');
  } catch (err) {
    modalEl.querySelector('#pagoChecklistProgreso').textContent = err.message || 'Error al cargar checklist';
  }
}

export async function openVerEntregablePagoModal(entregableId) {
  const resp = await entregablesServiciosService.listarEntregablesChecklistPago(entregableId);
  const data = resp?.data || resp || {};
  const docs = data.documentos || [];
  const { modalEl } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header py-2">
            <h5 class="modal-title mb-0"><i class="bi bi-file-earmark-text"></i> Ver entregable</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            ${docs.length ? `<div class="table-responsive"><table class="table table-sm table-bordered mb-0" style="font-size:11px">
              <thead class="table-light"><tr><th>Documento</th><th>Vigencia</th><th></th></tr></thead>
              <tbody>${docs.map((d, i) => `
                <tr>
                  <td>${esc(d.nombre || d.nombre_archivo)}</td>
                  <td>${esc(d.vigencia_hasta || '—')}</td>
                  <td class="text-nowrap">
                    <button type="button" class="btn btn-sm btn-outline-primary pago-ent-ver" data-i="${i}">Ver</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary pago-ent-dl" data-i="${i}">Descargar</button>
                  </td>
                </tr>`).join('')}</tbody>
            </table></div>` : '<p class="text-muted small mb-0">No hay documentos ENTREGABLE en la recepción vigente.</p>'}
          </div>
        </div>
      </div>
    </div>`);
  const ctx = { orden_entrega_id: entregableId };
  modalEl.querySelectorAll('.pago-ent-ver').forEach((btn) => {
    btn.onclick = async () => {
      const d = docs[Number(btn.dataset.i)];
      try {
        await openChecklistPreview(d.preview, ctx);
      } catch (err) {
        window.alert(err.message || 'No se pudo abrir');
      }
    };
  });
  modalEl.querySelectorAll('.pago-ent-dl').forEach((btn) => {
    btn.onclick = async () => {
      const d = docs[Number(btn.dataset.i)];
      try {
        const { blob, contentType } = await entregablesServiciosService.downloadDocumentoBlob(
          d.recepcion_id,
          d.id,
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = d.nombre_archivo || 'entregable.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        void contentType;
      } catch (err) {
        window.alert(err.message || 'No se pudo descargar');
      }
    };
  });
}

export async function openVerActaConformidadPagoModal(entregableId) {
  const resp = await entregablesServiciosService.obtenerActaConformidadPago(entregableId);
  const data = resp?.data || resp || {};
  if (!data.disponible || !data.preview) {
    window.alert('No hay acta de conformidad disponible para este entregable.');
    return;
  }
  const ctx = { orden_entrega_id: entregableId };
  try {
    await openChecklistPreview(data.preview, ctx);
  } catch (err) {
    window.alert(err.message || 'No se pudo abrir el acta');
  }
}

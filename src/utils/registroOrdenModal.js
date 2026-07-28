/**
 * Modales — Registro de Órdenes (CCP firmado, orden, entregas, envío).
 */
import { ordenesContratacionService } from '../services/ordenesContratacionService.js';
import {
  fileToBase64, fmtMonto, fmtFecha, tipoOrdenSugerido, CONDICIONES_INICIO_OPTS,
} from './ordenesUtils.js';
import { openBase64Document } from './documentViewer.js';
export { openEntregasModal } from './registroOrdenEntregasModal.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ensureModalRoot() {
  let el = document.getElementById('roModalRoot');
  if (!el) {
    el = document.createElement('div');
    el.id = 'roModalRoot';
    document.body.appendChild(el);
  }
  return el;
}

function showModal(html) {
  const root = ensureModalRoot();
  root.innerHTML = html;
  const modalEl = root.querySelector('.modal');
  // eslint-disable-next-line no-undef
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => { root.innerHTML = ''; }, { once: true });
  return { root, modalEl, modal };
}

export async function openAdjuntarCcpFirmadoModal(row, { onDone } = {}) {
  const ctxResp = await ordenesContratacionService.getContexto(row.requerimiento_id);
  const ctx = ctxResp?.data || ctxResp;
  const { modalEl } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Adjuntar CCP firmado</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-2"><label class="form-label">CCP</label>
              <input class="form-control" value="${esc(ctx.codigo_ccp)}" readonly></div>
            <div class="mb-2"><label class="form-label">Requerimiento</label>
              <input class="form-control" value="${esc(ctx.requerimiento_codigo)}" readonly></div>
            <div class="mb-2"><label class="form-label">Proveedor</label>
              <input class="form-control" value="${esc(ctx.proveedor_razon_social)}" readonly></div>
            <div class="mb-2">
              <label class="form-label">Archivo CCP firmado (PDF) *</label>
              <input type="file" class="form-control" id="roCcpPdf" accept="application/pdf,.pdf">
              <div class="form-text" id="roCcpFileName">Ningún archivo seleccionado</div>
            </div>
            <div class="alert alert-danger d-none" id="roCcpErr"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="roCcpSave">
              <span class="ro-save-label">Cargar</span>
              <span class="spinner-border spinner-border-sm d-none" id="roCcpSpin"></span>
            </button>
          </div>
        </div>
      </div>
    </div>`);

  modalEl.querySelector('#roCcpPdf').onchange = (e) => {
    const f = e.target.files?.[0];
    modalEl.querySelector('#roCcpFileName').textContent = f ? f.name : 'Ningún archivo seleccionado';
  };

  modalEl.querySelector('#roCcpSave').onclick = async () => {
    const err = modalEl.querySelector('#roCcpErr');
    const spin = modalEl.querySelector('#roCcpSpin');
    const btn = modalEl.querySelector('#roCcpSave');
    err.classList.add('d-none');
    try {
      const file = modalEl.querySelector('#roCcpPdf').files?.[0];
      if (!file) throw new Error('Seleccione el PDF del CCP firmado');
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
        throw new Error('Solo se acepta PDF');
      }
      if (file.size > 25 * 1024 * 1024) throw new Error('El archivo supera 25 MB');
      spin.classList.remove('d-none');
      btn.disabled = true;
      const base64 = await fileToBase64(file);
      await ordenesContratacionService.adjuntarCcpFirmado(row.requerimiento_id, {
        nombre_archivo: file.name,
        base64,
      });
      // eslint-disable-next-line no-undef
      bootstrap.Modal.getInstance(modalEl)?.hide();
      onDone?.();
    } catch (e) {
      err.textContent = e.message || 'Error al guardar';
      err.classList.remove('d-none');
    } finally {
      spin.classList.add('d-none');
      btn.disabled = false;
    }
  };
}

export async function openRegistrarOrdenModal(row, { onDone, editId = null } = {}) {
  const ctxResp = await ordenesContratacionService.getContexto(row.requerimiento_id);
  const ctx = ctxResp?.data || ctxResp;
  let orden = null;
  if (editId) {
    const det = await ordenesContratacionService.getDetalle(editId);
    orden = (det?.data || det)?.orden;
  }
  const tipoSug = orden?.tipo_orden || tipoOrdenSugerido(ctx.tipo_contratacion);
  const itemsHtml = (ctx.items_adjudicados || []).map((it) => `
    <tr>
      <td>${esc(it.descripcion)}</td>
      <td>${esc(it.unidad_medida || '—')}</td>
      <td class="text-end">${esc(it.cantidad)}</td>
      <td class="text-end">${fmtMonto(it.precio_unitario, it.moneda)}</td>
      <td class="text-end">${fmtMonto(it.precio_total, it.moneda)}</td>
    </tr>`).join('');

  const { modalEl } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${editId ? 'Editar orden' : 'Registrar orden'}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-2 mb-3 small">
              <div class="col-md-3"><strong>CCP:</strong> ${esc(ctx.codigo_ccp)}</div>
              <div class="col-md-3"><strong>Req.:</strong> ${esc(ctx.requerimiento_codigo)}</div>
              <div class="col-md-3"><strong>Centro:</strong> ${esc(ctx.centro)}</div>
              <div class="col-md-3"><strong>Tipo:</strong> ${esc(ctx.tipo_contratacion)}</div>
              <div class="col-md-3"><strong>RUC:</strong> ${esc(ctx.proveedor_ruc)}</div>
              <div class="col-md-5"><strong>Proveedor:</strong> ${esc(ctx.proveedor_razon_social)}</div>
              <div class="col-md-4"><strong>Monto:</strong> ${fmtMonto(ctx.monto_adjudicado)}</div>
            </div>
            <div class="table-responsive mb-3">
              <table class="table table-sm table-bordered">
                <thead><tr><th>Descripción</th><th>Unidad de medida</th><th>Cantidad</th><th>Precio unitario</th><th>Total</th></tr></thead>
                <tbody>${itemsHtml || '<tr><td colspan="5" class="text-muted">Sin ítems</td></tr>'}</tbody>
              </table>
            </div>
            <div class="row g-2">
              <div class="col-md-3">
                <label class="form-label">Tipo de orden *</label>
                <select class="form-select" id="roTipoOrden">
                  <option value="OC" ${tipoSug === 'OC' ? 'selected' : ''}>OC — Orden de Compra</option>
                  <option value="OS" ${tipoSug === 'OS' ? 'selected' : ''}>OS — Orden de Servicio</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label">Número de orden *</label>
                <input class="form-control" id="roNumero" value="${esc(orden?.numero_orden || '')}">
              </div>
              <div class="col-md-3">
                <label class="form-label">Fecha de orden *</label>
                <input type="date" class="form-control" id="roFecha" value="${esc(orden?.fecha_orden ? String(orden.fecha_orden).slice(0, 10) : '')}">
              </div>
              <div class="col-md-3">
                <label class="form-label">Inicio del plazo</label>
                <select class="form-select" id="roReglaPlazo">
                  <option value="INICIO_PLAZO_CONFIRMACION_RECEPCION">Confirmación de recepción</option>
                  <option value="INICIO_PLAZO_FECHA_ORDEN">Fecha de la orden</option>
                  <option value="INICIO_PLAZO_ENVIO_PROVEEDOR">Envío al proveedor</option>
                  <option value="INICIO_PLAZO_FECHA_MANUAL">Fecha manual</option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label">Observaciones</label>
                <textarea class="form-control" id="roObs" rows="2">${esc(orden?.observaciones || '')}</textarea>
              </div>
            </div>
            <div class="alert alert-danger d-none mt-2" id="roOrdenErr"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="roOrdenSave">Guardar</button>
          </div>
        </div>
      </div>
    </div>`);

  if (orden?.regla_inicio_plazo) {
    modalEl.querySelector('#roReglaPlazo').value = orden.regla_inicio_plazo;
  }

  modalEl.querySelector('#roOrdenSave').onclick = async () => {
    const err = modalEl.querySelector('#roOrdenErr');
    err.classList.add('d-none');
    try {
      const body = {
        requerimiento_id: row.requerimiento_id,
        tipo_orden: modalEl.querySelector('#roTipoOrden').value,
        numero_orden: modalEl.querySelector('#roNumero').value.trim(),
        fecha_orden: modalEl.querySelector('#roFecha').value,
        regla_inicio_plazo: modalEl.querySelector('#roReglaPlazo').value,
        observaciones: modalEl.querySelector('#roObs').value,
      };
      if (editId) await ordenesContratacionService.actualizar(editId, body);
      else await ordenesContratacionService.registrar(body);
      // eslint-disable-next-line no-undef
      bootstrap.Modal.getInstance(modalEl)?.hide();
      onDone?.();
    } catch (e) {
      err.textContent = e.message || 'Error al guardar';
      err.classList.remove('d-none');
    }
  };
}

export async function openAdjuntarOrdenFirmadaModal(ordenId, { onDone } = {}) {
  const { modalEl } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Adjuntar orden firmada</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="file" class="form-control" id="roOrdPdf" accept="application/pdf,.pdf">
            <div class="alert alert-danger d-none mt-2" id="roOrdPdfErr"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="roOrdPdfSave">Adjuntar</button>
          </div>
        </div>
      </div>
    </div>`);
  modalEl.querySelector('#roOrdPdfSave').onclick = async () => {
    const err = modalEl.querySelector('#roOrdPdfErr');
    err.classList.add('d-none');
    try {
      const file = modalEl.querySelector('#roOrdPdf').files?.[0];
      if (!file) throw new Error('Seleccione el PDF');
      const base64 = await fileToBase64(file);
      await ordenesContratacionService.adjuntarOrdenFirmada(ordenId, {
        nombre_archivo: file.name,
        base64,
      });
      // eslint-disable-next-line no-undef
      bootstrap.Modal.getInstance(modalEl)?.hide();
      onDone?.();
    } catch (e) {
      err.textContent = e.message || 'Error';
      err.classList.remove('d-none');
    }
  };
}

export async function openEnviarProveedorModal(ordenId, { onDone } = {}) {
  const detResp = await ordenesContratacionService.getDetalle(ordenId);
  const det = detResp?.data || detResp;
  const emails = (det.contexto?.proveedor_emails || []).join(', ');
  let docsMeta = [];
  let docsLoadError = null;
  try {
    const docsResp = await ordenesContratacionService.getDocsNotificacion(ordenId);
    docsMeta = (docsResp?.data || docsResp)?.documentos || [];
    if (!docsMeta.length) docsLoadError = 'No se encontraron documentos para la notificación.';
  } catch (e) {
    docsLoadError = e.message || 'No se pudieron cargar los documentos a remitir.';
    docsMeta = [];
  }
  const labels = {
    ORDEN_FIRMADA: 'Orden firmada',
    REQUERIMIENTO: 'Copia del requerimiento',
    COTIZACION: 'Cotización presentada por el proveedor adjudicado',
    CRONOGRAMA: 'Cronograma de entregas/entregables',
  };
  const faltantes = docsMeta.filter((d) => !d.disponible);
  const bloqueaEnvio = !!docsLoadError || faltantes.length > 0;

  async function openDoc(tipo, download = false) {
    const full = await ordenesContratacionService.getDocNotificacion(ordenId, tipo, true);
    const data = full?.data || full;
    if (!data?.contenido_base64) throw new Error('Documento sin contenido');
    if (download) {
      const { downloadPdfBase64 } = await import('./ordenesUtils.js');
      // HTML también se descarga como archivo
      const raw = String(data.contenido_base64 || '');
      const b64 = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: data.mime_type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.nombre_archivo || `${tipo}.bin`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return;
    }
    if ((data.mime_type || '').includes('pdf')) {
      openBase64Document({
        nombre: data.nombre_archivo,
        mime_type: data.mime_type || 'application/pdf',
        contenido_base64: data.contenido_base64,
      });
    } else {
      const raw = String(data.contenido_base64 || '');
      const b64 = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
      const html = decodeURIComponent(escape(atob(b64)));
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); }
    }
  }

  const { modalEl } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Notificar al proveedor</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-2 small mb-2">
              <div class="col-md-4"><strong>Orden:</strong> ${esc(det.orden?.tipo_orden)} ${esc(det.orden?.numero_orden)}</div>
              <div class="col-md-4"><strong>RUC:</strong> ${esc(det.contexto?.proveedor_ruc)}</div>
              <div class="col-md-4"><strong>Proveedor:</strong> ${esc(det.contexto?.proveedor_razon_social)}</div>
            </div>
            <div class="mb-2">
              <label class="form-label">Correo</label>
              <input class="form-control" id="roEnvioCorreo" value="${esc(emails.split(',')[0] || '')}">
            </div>
            <div class="mb-2">
              <label class="form-label">Asunto</label>
              <input class="form-control" id="roEnvioAsunto"
                value="[SGC] Orden ${esc(det.orden?.tipo_orden || '')} ${esc(det.orden?.numero_orden || '')} — confirmación de recepción">
            </div>
            <div class="mb-2">
              <label class="form-label">Mensaje</label>
              <textarea class="form-control" id="roEnvioMsg" rows="3">Se remite la orden para su revisión y confirmación de recepción en el Portal de Proveedores.</textarea>
            </div>
            <h6 class="fs-6">Documentos a remitir</h6>
            <div class="table-responsive mb-2">
              <table class="table table-sm align-middle">
                <thead><tr><th>Nombre</th><th>Tipo</th><th>Versión</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  ${docsMeta.map((d) => `
                    <tr data-tipo="${esc(d.tipo)}">
                      <td>${esc(d.nombre)}</td>
                      <td>${esc(labels[d.tipo] || d.tipo)}</td>
                      <td>${esc(d.version ?? '—')}</td>
                      <td><span class="badge ${d.disponible ? 'bg-success' : 'bg-danger'}">${esc(d.estado)}</span></td>
                      <td class="text-nowrap">
                        <button type="button" class="btn btn-sm btn-outline-primary ro-doc-ver" ${d.disponible ? '' : 'disabled'}>Ver</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary ro-doc-dl" ${d.disponible ? '' : 'disabled'}>Descargar</button>
                      </td>
                    </tr>`).join('') || `<tr><td colspan="5" class="text-muted">${docsLoadError ? esc(docsLoadError) : 'Sin documentos'}</td></tr>`}
                </tbody>
              </table>
            </div>
            ${docsLoadError ? `<div class="alert alert-warning py-2 small">${esc(docsLoadError)}</div>` : ''}
            ${faltantes.length ? `<div class="alert alert-warning py-2 small">Faltan documentos: ${esc(faltantes.map((f) => labels[f.tipo] || f.tipo).join(', '))}</div>` : ''}
            <div class="alert alert-danger d-none" id="roEnvioErr"></div>
            <div class="alert alert-success d-none" id="roEnvioOk"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="roEnvioSend" ${bloqueaEnvio ? 'disabled' : ''}>Enviar</button>
          </div>
        </div>
      </div>
    </div>`);

  modalEl.querySelectorAll('.ro-doc-ver').forEach((btn) => {
    btn.onclick = async () => {
      const tipo = btn.closest('tr')?.dataset?.tipo;
      const err = modalEl.querySelector('#roEnvioErr');
      err.classList.add('d-none');
      try { await openDoc(tipo, false); }
      catch (e) { err.textContent = e.message || 'No se pudo abrir'; err.classList.remove('d-none'); }
    };
  });
  modalEl.querySelectorAll('.ro-doc-dl').forEach((btn) => {
    btn.onclick = async () => {
      const tipo = btn.closest('tr')?.dataset?.tipo;
      const err = modalEl.querySelector('#roEnvioErr');
      err.classList.add('d-none');
      try { await openDoc(tipo, true); }
      catch (e) { err.textContent = e.message || 'No se pudo descargar'; err.classList.remove('d-none'); }
    };
  });

  modalEl.querySelector('#roEnvioSend').onclick = async () => {
    const err = modalEl.querySelector('#roEnvioErr');
    const ok = modalEl.querySelector('#roEnvioOk');
    const btn = modalEl.querySelector('#roEnvioSend');
    err.classList.add('d-none');
    ok.classList.add('d-none');
    try {
      if (docsLoadError) throw new Error(docsLoadError);
      if (faltantes.length) throw new Error(`Faltan documentos: ${faltantes.map((f) => labels[f.tipo] || f.tipo).join(', ')}`);
      const correo = modalEl.querySelector('#roEnvioCorreo').value.trim();
      if (!correo) throw new Error('Indique el correo destinatario');
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      const resp = await ordenesContratacionService.enviarProveedor(ordenId, {
        correo,
        correos: [correo],
        asunto: modalEl.querySelector('#roEnvioAsunto').value,
        mensaje: modalEl.querySelector('#roEnvioMsg').value,
      });
      const data = resp?.data || resp;
      ok.innerHTML = `Orden notificada. Enlace: <code>${esc(data.url || '')}</code>`;
      ok.classList.remove('d-none');
      if (data.url) {
        try { await navigator.clipboard.writeText(data.url); } catch (_) {}
      }
      onDone?.();
    } catch (e) {
      err.textContent = e.message || 'Error al enviar';
      err.classList.remove('d-none');
      btn.disabled = bloqueaEnvio;
      btn.textContent = 'Enviar';
    }
  };
}


const EVENTO_LABEL = {
  CCP_FIRMADO_ADJUNTADO: 'CCP firmado adjuntado',
  CCP_FIRMADO_ELIMINADO: 'CCP firmado eliminado',
  CCP_FIRMADO_REEMPLAZADO: 'CCP firmado reemplazado',
  ORDEN_REGISTRADA: 'Orden registrada',
  ORDEN_ACTUALIZADA: 'Orden editada',
  CRONOGRAMA_CREADO: 'Cronograma creado',
  CRONOGRAMA_ACTUALIZADO: 'Cronograma actualizado',
  ORDEN_FIRMADA_ADJUNTADA: 'Orden firmada adjuntada',
  ORDEN_FIRMADA_REEMPLAZADA: 'Orden firmada reemplazada',
  ORDEN_NOTIFICADA: 'Orden notificada',
  ORDEN_ENVIADA: 'Orden notificada',
  ORDEN_REENVIADA: 'Orden reenviada',
  RECEPCION_CONFIRMADA: 'Recepción confirmada',
  ORDEN_ANULADA: 'Orden anulada',
  DERIVADO_EJECUCION: 'Derivación a Ejecución',
  INICIO_ACTIVIDAD_REGISTRADO: 'Inicio de actividad registrado',
};

export async function openHistorialOrdenModal(ordenId) {
  const h = await ordenesContratacionService.historial(ordenId);
  const rows = h?.data || h || [];
  const body = rows.length ? rows.map((e) => `
    <tr>
      <td class="small text-nowrap">${esc(e.creado_at ? new Date(e.creado_at).toLocaleString('es-PE') : '—')}</td>
      <td class="small">${esc(e.usuario || '—')}</td>
      <td class="small">${esc(e.rol || '—')}</td>
      <td class="small">${esc(EVENTO_LABEL[e.tipo_evento] || e.tipo_evento)}</td>
      <td class="small">${esc(e.estado_anterior || '—')}</td>
      <td class="small">${esc(e.estado_nuevo || '—')}</td>
      <td class="small">${esc(e.observacion || e.datos?.nombre || '—')}</td>
      <td class="small">${esc(e.documento_ref || (e.datos && e.datos.documento) || '—')}</td>
    </tr>`).join('') : '<tr><td colspan="8" class="text-muted text-center">Sin eventos</td></tr>';

  showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Trazabilidad / historial de la orden</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="table-responsive">
              <table class="table table-sm table-striped align-middle">
                <thead>
                  <tr>
                    <th>Fecha y hora</th><th>Usuario</th><th>Rol</th><th>Acción</th>
                    <th>Estado anterior</th><th>Estado nuevo</th><th>Observación</th><th>Documentos</th>
                  </tr>
                </thead>
                <tbody>${body}</tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`);
}

export async function openInicioActividadModal(row, { onDone } = {}) {
  const needsManual = (v) => [
    'SUSCRIPCION_ACTA_INICIO', 'DIA_SIGUIENTE_ACTA_INICIO',
    'SUSCRIPCION_CONTRATO', 'DIA_SIGUIENTE_CONTRATO',
  ].includes(v);

  const opts = CONDICIONES_INICIO_OPTS.map((o) => `
    <option value="${o.value}">${esc(o.label)}</option>`).join('');

  const { modalEl } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Inicio de actividad</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-2">
              <label class="form-label">Condición de inicio *</label>
              <select class="form-select" id="roIniCond">${opts}</select>
            </div>
            <div class="mb-2 d-none" id="roIniManualWrap">
              <label class="form-label">Fecha del acta / contrato *</label>
              <input type="date" class="form-control" id="roIniManual">
            </div>
            <div class="row g-2 mb-2">
              <div class="col-md-4">
                <label class="form-label">Tipo de días</label>
                <select class="form-select" id="roIniTipoDias">
                  <option value="calendario">Calendario</option>
                  <option value="habiles">Hábiles</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label">Plazo (días)</label>
                <input type="number" min="0" class="form-control" id="roIniPlazo" value="0">
              </div>
            </div>
            <div class="mb-2">
              <label class="form-label">Sustento</label>
              <textarea class="form-control" id="roIniSustento" rows="2"></textarea>
            </div>
            <div class="border rounded p-2 bg-light small" id="roIniPreview">
              Seleccione una condición para ver el cálculo.
            </div>
            <div class="alert alert-danger d-none mt-2" id="roIniErr"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="roIniSave">Guardar</button>
          </div>
        </div>
      </div>
    </div>`);

  async function refreshPreview() {
    const cond = modalEl.querySelector('#roIniCond').value;
    modalEl.querySelector('#roIniManualWrap').classList.toggle('d-none', !needsManual(cond));
    try {
      const resp = await ordenesContratacionService.previewInicioActividad({
        condicion_inicio: cond,
        fecha_orden: row.fecha_orden,
        fecha_notificacion: row.fecha_envio_proveedor,
        fecha_manual: modalEl.querySelector('#roIniManual').value || null,
        tipo_dias: modalEl.querySelector('#roIniTipoDias').value,
        dias_plazo: Number(modalEl.querySelector('#roIniPlazo').value || 0),
      });
      const d = resp?.data || resp;
      modalEl.querySelector('#roIniPreview').innerHTML = `
        <div><strong>Condición:</strong> ${esc(d.condicion_label)}</div>
        <div><strong>Fecha del evento:</strong> ${fmtFecha(d.fecha_evento)}</div>
        <div><strong>Fecha efectiva de inicio:</strong> ${fmtFecha(d.fecha_efectiva_inicio)}</div>
        <div><strong>Tipo de días:</strong> ${esc(d.tipo_dias)} · <strong>Plazo:</strong> ${esc(d.dias_plazo)}</div>
        <div><strong>Fecha máxima resultante:</strong> ${fmtFecha(d.fecha_maxima)}</div>`;
    } catch (e) {
      modalEl.querySelector('#roIniPreview').textContent = e.message || 'Complete los datos requeridos';
    }
  }

  ['roIniCond', 'roIniManual', 'roIniTipoDias', 'roIniPlazo'].forEach((id) => {
    modalEl.querySelector(`#${id}`)?.addEventListener('change', refreshPreview);
    modalEl.querySelector(`#${id}`)?.addEventListener('input', refreshPreview);
  });
  refreshPreview();

  modalEl.querySelector('#roIniSave').onclick = async () => {
    const err = modalEl.querySelector('#roIniErr');
    err.classList.add('d-none');
    try {
      await ordenesContratacionService.guardarInicioActividad({
        requerimiento_id: row.requerimiento_id,
        orden_id: row.orden_id || null,
        condicion_inicio: modalEl.querySelector('#roIniCond').value,
        fecha_orden: row.fecha_orden,
        fecha_notificacion: row.fecha_envio_proveedor,
        fecha_manual: modalEl.querySelector('#roIniManual').value || null,
        tipo_dias: modalEl.querySelector('#roIniTipoDias').value,
        dias_plazo: Number(modalEl.querySelector('#roIniPlazo').value || 0),
        sustento: modalEl.querySelector('#roIniSustento').value,
      });
      // eslint-disable-next-line no-undef
      bootstrap.Modal.getInstance(modalEl)?.hide();
      onDone?.();
    } catch (e) {
      err.textContent = e.message || 'Error al guardar';
      err.classList.remove('d-none');
    }
  };
}

export { showModal, esc, fmtFecha, openBase64Document };

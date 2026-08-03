/**
 * Modales operativos — Ejecución → Recepción de Bienes
 * Patrón alineado a Registro de Órdenes / Validaciones.
 * Reutiliza el visor documental común (openBase64Document / previewAdjuntoById).
 */
import { recepcionBienesService } from '../services/recepcionBienesService.js';
import { adjuntosService } from '../services/adjuntosService.js';
import { ordenesContratacionService } from '../services/ordenesContratacionService.js';
import { openBase64Document, previewAdjuntoById, openBlobDocument, downloadBlobFile } from './documentViewer.js';
import { fileToBase64 } from './ordenesUtils.js';
import { showTrazabilidadModal } from '../views/requerimiento/reqShared.js';
import { generateActaRecepcionPdf, buildActaRecepcionPreviewHtml } from './recepcionActaPdf.js';
import { readPdfUpload } from './validacionAnexo07aPdf.js';
import { buildActaRecepcionData } from '../../shared/recepcionActaData.js';
import {
  formatCalendarDdMmYyyy,
  toCalendarIso,
  validateFechaRecepcionVsEmision,
} from '../../shared/calendarDate.js';
import { dedupeDocumentos } from '../../shared/expedienteDocumentos.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  return formatCalendarDdMmYyyy(iso);
}

function fmtMonto(n, moneda = 'PEN') {
  const val = Number(n || 0);
  const sym = String(moneda).toUpperCase() === 'USD' ? 'US$' : 'S/';
  return `${sym} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toRawBase64(dataUrlOrB64) {
  const raw = String(dataUrlOrB64 || '');
  return raw.includes('base64,') ? raw.split('base64,').pop() : raw;
}

function currentUserName() {
  try {
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const full = [u.apellidos, u.nombres].filter(Boolean).join(' ').trim();
    return full || u.nombre || u.username || u.dni || '';
  } catch (_) { return ''; }
}

function ensureModalRoot() {
  let el = document.getElementById('rbModalRoot');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rbModalRoot';
    document.body.appendChild(el);
  }
  return el;
}

function showModal(html) {
  const root = ensureModalRoot();
  root.innerHTML = html;
  const modalEl = root.querySelector('.modal');
  // eslint-disable-next-line no-undef
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static' });
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => { root.innerHTML = ''; }, { once: true });
  return { root, modalEl, modal };
}

function showErr(modalEl, msg) {
  const err = modalEl.querySelector('#rbModalErr');
  if (!err) return;
  err.textContent = msg || 'Error';
  err.classList.remove('d-none');
}

function hideErr(modalEl) {
  modalEl.querySelector('#rbModalErr')?.classList.add('d-none');
}

function docsTableHtml(rows, { tipo, empty = 'Sin documentos', fechaLabel = 'Fecha de envío' } = {}) {
  if (!rows?.length) return `<p class="text-muted small mb-0">${esc(empty)}</p>`;
  return `
    <div class="table-responsive">
      <table class="table table-sm table-bordered mb-0">
        <thead class="table-light"><tr>
          <th>Documento</th><th>Tipo</th><th>${esc(fechaLabel)}</th><th>Acciones</th>
        </tr></thead>
        <tbody>
          ${rows.map((d) => `
            <tr>
              <td class="small">${esc(d.nombre || d.nombre_archivo || d.numero_guia || '—')}</td>
              <td class="small">${esc(d.tipo || d.tipo_documento || d.categoria || tipo || '—')}</td>
              <td class="small text-nowrap">${esc(fmtFecha(
    d.fechaEnvio || d.fecha_envio || d.created_at || d.fecha || d.fecha_guia || d.generado_at,
  ))}</td>
              <td class="text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-primary rb-doc-ver"
                  data-kind="${esc(d._kind || d.kind || tipo || '')}"
                  data-id="${esc(d.documentoId || d.id || '')}"
                  data-adjunto="${esc(d.adjunto_id || (d._kind === 'adjunto' ? d.id : '') || '')}"
                  data-orden-doc="${esc(d._kind === 'orden' ? d.id : '')}"
                  data-name="${esc(d.nombre || d.nombre_archivo || 'documento')}">Ver</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function openRbDoc(btn, detalle) {
  const kind = btn.dataset.kind;
  const name = btn.dataset.name || 'documento';
  if (btn.dataset.adjunto) {
    await previewAdjuntoById(btn.dataset.adjunto, name);
    return;
  }
  if (kind === 'orden' && detalle?.orden_id && btn.dataset.id) {
    const res = await ordenesContratacionService.getDocumento(detalle.orden_id, btn.dataset.id, true);
    const doc = res?.data || res;
    if (!doc?.contenido_base64) throw new Error('Documento sin contenido');
    openBase64Document({
      nombre: doc.nombre || doc.nombre_archivo || name,
      mime_type: doc.mime_type || 'application/pdf',
      contenido_base64: doc.contenido_base64,
    });
    return;
  }
  if (detalle?.id && btn.dataset.id && kind) {
    const docKey = kind === 'cotizacion'
      ? encodeURIComponent(btn.dataset.id)
      : btn.dataset.id;
    const res = await recepcionBienesService.getDocumento(detalle.id, kind, docKey);
    const doc = res?.data || res;
    if (!doc?.contenido_base64) throw new Error('Documento sin contenido disponible');
    openBase64Document({
      nombre: doc.nombre || name,
      mime_type: doc.mime_type || 'application/pdf',
      contenido_base64: doc.contenido_base64,
    });
  }
}

function bindDocButtons(modalEl, detalle) {
  modalEl.querySelectorAll('.rb-doc-ver').forEach((btn) => {
    btn.onclick = async () => {
      try {
        btn.disabled = true;
        await openRbDoc(btn, detalle);
      } catch (e) {
        showErr(modalEl, e.message || 'No se pudo abrir el documento');
      } finally {
        btn.disabled = false;
      }
    };
  });
}

/** 1. Ver expediente — ventana documental completa */
function endpointKindFromTipo(tipo, documentoId = '') {
  const t = String(tipo || '').toUpperCase();
  if (t === 'ORDEN') return 'orden';
  if (t === 'GUIA_REMISION') return 'guia';
  if (t === 'ACTA_RECEPCION') return 'acta';
  if (t === 'ACTA_VISADA_ALMACEN') {
    return String(documentoId || '').startsWith('legacy') ? 'acta_visada_legacy' : 'acta_visada';
  }
  if (t === 'ADJUNTO_DERIVACION' || t === 'DOCUMENTO_TECNICO_RECEPCION') return 'recepcion';
  return String(tipo || '').toLowerCase();
}

export async function openExpedienteRecepcionModal(row) {
  const res = await recepcionBienesService.getDetalle(row.id);
  const d = res?.data || res;

  let rol = 'dec';
  try {
    rol = String(JSON.parse(localStorage.getItem('currentUser') || '{}').rol || 'dec').toLowerCase();
  } catch (_) { /* ok */ }
  const isAu = rol === 'au' || rol === 'area_usuaria';
  const estado = d.estado_vigente || d.estadoVigente?.codigo || d.estado_global || '';
  const auPendiente = estado === 'CONFORMIDAD_PENDIENTE_AU';
  const auDerivado = [
    'CONFORMIDAD_PENDIENTE_AU',
    'CONFORMIDAD_RECIBIDA_AU',
    'CONFORMIDAD_EN_COORDINACION_CM',
    'EXPEDIENTE_DERIVADO_PAGO',
  ].includes(estado);

  // AU: solo el paquete derivado (no expediente completo con 5-A/5-B/req)
  if (isAu && auDerivado) {
    let pack = { items: [] };
    try {
      pack = await recepcionBienesService.getPaqueteDerivado(d.id);
    } catch (_) { /* ok */ }
    const items = pack?.items || [];
    const byGrupo = new Map();
    items.forEach((it) => {
      const g = it.grupo || it.tipo || 'Documentos';
      if (!byGrupo.has(g)) byGrupo.set(g, []);
      byGrupo.get(g).push(it);
    });
    let packHtml = '';
    for (const [grupo, rows] of byGrupo.entries()) {
      packHtml += `<h6 class="fw-semibold mt-2 mb-1">${esc(grupo)}</h6>`;
      packHtml += docsTableHtml(rows.map((x) => ({
        id: x.documento_id,
        documentoId: x.documento_id,
        nombre: x.nombre,
        tipo: x.tipo,
        created_at: x.created_at,
        _kind: endpointKindFromTipo(x.tipo, x.documento_id),
      })), { empty: 'Sin documentos en este grupo' });
    }
    if (!items.length) {
      packHtml = '<div class="alert alert-warning small">No hay paquete documental persistido para esta derivación.</div>';
    }

    const { modalEl } = showModal(`
      <div class="modal fade" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <div>
                <h5 class="modal-title mb-0">Paquete derivado · OC ${esc(d.numero_orden || d.orden_id)}</h5>
                <div class="small text-muted">${esc(d.proveedor_razon_social || '')} · recepción/conformidad</div>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="alert alert-danger d-none" id="rbModalErr"></div>
              <div class="alert alert-info small py-2">
                Vista Área Usuaria · únicamente los documentos enviados por Almacén para conformidad.
                No incluye requerimiento, cotizaciones ni CCP.
              </div>
              <div class="row g-2 mb-3 small">
                <div class="col-md-3"><strong>Estado:</strong> ${esc(d.estado_vigente_label || d.etiqueta_estado || '—')}</div>
                <div class="col-md-3"><strong>Monto OC:</strong> ${esc(fmtMonto(d.monto_total, d.moneda))}</div>
                <div class="col-md-3"><strong>Notificación:</strong> ${esc(fmtFecha(d.fecha_notificacion))}</div>
                <div class="col-md-3"><strong>Monto a liquidar:</strong> ${esc(fmtMonto(d.monto_a_liquidar, d.moneda))}</div>
              </div>
              ${packHtml}
            </div>
            <div class="modal-footer flex-wrap gap-2">
              ${auPendiente ? `
                <button type="button" class="btn btn-success" id="rbExpCargarActa">Firmar / adjuntar acta</button>
                <button type="button" class="btn btn-warning" id="rbExpObservar">Observar → Almacén</button>
              ` : ''}
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
            </div>
          </div>
        </div>
      </div>`);

    bindDocButtons(modalEl, d);
    modalEl.querySelector('#rbExpCargarActa')?.addEventListener('click', () => {
      openCargarActaFirmadaModal(d, { onDone: () => { /* keep open */ } });
    });
    modalEl.querySelector('#rbExpObservar')?.addEventListener('click', () => {
      openObservarAuModal(d);
    });
    return;
  }

  let adjuntos = d.documentos_requerimiento || [];
  if (!adjuntos.length && d.requerimiento_id) {
    try {
      const a = await adjuntosService.getAdjuntos(d.requerimiento_id);
      adjuntos = Array.isArray(a) ? a : (a?.data || a?.adjuntos || []);
    } catch (_) { /* ok */ }
  }

  const docsOrden = (d.documentos_orden || []).map((x) => ({ ...x, _kind: 'orden' }));
  const docsReq = (adjuntos || []).map((x) => ({
    ...x,
    nombre: x.nombre_archivo || x.nombre,
    tipo: x.tipo_documento || 'Requerimiento',
    _kind: 'adjunto',
    adjunto_id: x.id,
  }));
  const mapCot = (list, label) => (list || []).map((x) => ({
    ...x,
    id: `${x.cotizacion_id || String(x.id).split(':')[0]}:${x.ref || 'anexo05a'}`,
    nombre: x.nombre || label,
    tipo: x.tipo || label,
    _kind: 'cotizacion',
  }));
  const docs05a = mapCot(d.documentos_anexo_05a || d.documentos_cotizacion?.filter((x) => x.ref === 'anexo05a'), 'Anexo 5-A');
  const docs05b = mapCot(d.documentos_anexo_05b || d.documentos_cotizacion?.filter((x) => x.ref === 'anexo05b'), 'Anexo 5-B');
  const docsTecCot = mapCot(
    dedupeDocumentos(
      d.documentos_tecnicos
        || d.documentos_tecnicos_cotizacion
        || (d.documentos_cotizacion || []).filter((x) => {
          const ref = String(x.ref || '');
          return ref.startsWith('docs-') || ref.startsWith('req-') || ref.startsWith('cert-') || ref.startsWith('extra-');
        }),
    ),
    'Documento técnico',
  );
  const docsRec = (d.documentos_recepcion || [])
    .filter((x) => x.tipo !== 'OBSERVACION_AU')
    .map((x) => ({ ...x, _kind: 'recepcion' }));
  const docsObs = (d.documentos_recepcion || [])
    .filter((x) => x.tipo === 'OBSERVACION_AU')
    .map((x) => ({ ...x, _kind: 'recepcion', tipo: 'Observación AU' }));
  const guias = [];
  (d.recepciones || []).forEach((r) => {
    (r.guias || []).forEach((g) => guias.push({
      ...g,
      nombre: g.documento_nombre || `Guía ${g.numero_guia}`,
      tipo: 'Guía de Remisión',
      fecha: g.fecha_guia,
      _kind: 'guia',
    }));
  });
  const actas = (d.actas || []).flatMap((a) => {
    const rows = [{
      ...a,
      id: a.id,
      nombre: a.documento_nombre || a.numero_acta || `Proyecto Acta v${a.version}`,
      tipo: a.estado_documental || 'Proyecto de Acta',
      created_at: a.generado_at,
      _kind: 'acta',
    }];
    if (a.acta_firmada_nombre) {
      rows.push({
        ...a,
        nombre: a.acta_firmada_nombre,
        tipo: 'Acta firmada AU',
        created_at: a.firmado_au_at,
        _kind: 'acta_firmada',
      });
    }
    return rows;
  });

  const { modalEl } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h5 class="modal-title mb-0">Expediente · OC ${esc(d.numero_orden || d.orden_id)}</h5>
              <div class="small text-muted">${esc(d.proveedor_razon_social || '')} · ${esc(d.requerimiento_codigo || '')}</div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-danger d-none" id="rbModalErr"></div>
            <div class="row g-2 mb-3 small">
              <div class="col-md-3"><strong>Estado:</strong> ${esc(d.estado_vigente_label || d.etiqueta_estado || '—')}</div>
              <div class="col-md-3"><strong>Monto OC:</strong> ${esc(fmtMonto(d.monto_total, d.moneda))}</div>
              <div class="col-md-3"><strong>Notificación:</strong> ${esc(fmtFecha(d.fecha_notificacion))}</div>
              <div class="col-md-3"><strong>Monto a liquidar:</strong> ${esc(fmtMonto(d.monto_a_liquidar, d.moneda))}</div>
            </div>
            <ul class="nav nav-tabs flex-wrap" role="tablist">
              <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#rbExpOrden" type="button">Orden</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rbExpReq" type="button">Requerimiento</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rbExp05a" type="button">Cotización 5-A</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rbExp05b" type="button">Cotización 5-B</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rbExpTec" type="button">Documentos Técnicos</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rbExpGuias" type="button">Guías</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rbExpActas" type="button">Proyecto o Actas</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rbExpHist" type="button">Historial</button></li>
            </ul>
            <div class="tab-content border border-top-0 p-3">
              <div class="tab-pane fade show active" id="rbExpOrden">
                ${docsTableHtml(docsOrden, { tipo: 'orden', empty: 'Sin documentos de orden' })}
              </div>
              <div class="tab-pane fade" id="rbExpReq">
                ${docsTableHtml(docsReq, { tipo: 'adjunto', empty: 'Sin adjuntos del requerimiento' })}
              </div>
              <div class="tab-pane fade" id="rbExp05a">
                ${docsTableHtml(docs05a, { tipo: 'cotizacion', empty: 'Sin Anexo 5-A del proveedor adjudicado' })}
              </div>
              <div class="tab-pane fade" id="rbExp05b">
                ${docsTableHtml(docs05b, { tipo: 'cotizacion', empty: 'Sin Anexo 5-B del proveedor adjudicado' })}
              </div>
              <div class="tab-pane fade" id="rbExpTec">
                <p class="small text-muted mb-2">Documentos técnicos del proveedor adjudicado y adjuntos de recepción.</p>
                ${docsTableHtml([...docsTecCot, ...docsRec], { tipo: 'cotizacion', empty: 'Sin documentos técnicos', fechaLabel: 'Fecha de envío' })}
              </div>
              <div class="tab-pane fade" id="rbExpGuias">
                ${docsTableHtml(guias, { tipo: 'guia', empty: 'Sin guías registradas' })}
              </div>
              <div class="tab-pane fade" id="rbExpActas">
                ${docsTableHtml(actas, { tipo: 'acta', empty: 'Sin proyecto de acta' })}
                ${docsObs.length ? `<hr/><p class="small fw-semibold">Adjuntos de observaciones</p>${docsTableHtml(docsObs, { tipo: 'recepcion' })}` : ''}
              </div>
              <div class="tab-pane fade" id="rbExpHist">
                <div class="table-responsive">
                  <table class="table table-sm table-striped">
                    <thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Estado</th><th>Motivo</th></tr></thead>
                    <tbody>
                      ${(d.historial || []).length
    ? (d.historial || []).map((e) => `
                          <tr>
                            <td class="small text-nowrap">${esc(e.created_at ? new Date(e.created_at).toLocaleString('es-PE') : '—')}</td>
                            <td class="small">${esc(e.usuario || '—')}</td>
                            <td class="small">${esc(e.rol || '—')}</td>
                            <td class="small">${esc(e.tipo || '—')}</td>
                            <td class="small">${esc((e.estado_anterior || '—') + ' → ' + (e.estado_nuevo || '—'))}</td>
                            <td class="small">${esc(e.motivo || '—')}</td>
                          </tr>`).join('')
    : '<tr><td colspan="6" class="text-muted text-center">Sin eventos</td></tr>'}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer flex-wrap gap-2">
            ${d.requerimiento_id ? `<button type="button" class="btn btn-outline-primary" id="rbExpTraza">Trazabilidad</button>` : ''}
            ${actas.some((a) => a._kind === 'acta') ? `<button type="button" class="btn btn-outline-secondary" id="rbExpDescActa">Descargar proyecto</button>` : ''}
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>`);

  bindDocButtons(modalEl, d);
  // Fix cotizacion kind on mixed técnicos table
  modalEl.querySelectorAll('#rbExpTec .rb-doc-ver').forEach((btn) => {
    if (String(btn.dataset.id || '').includes(':')) btn.dataset.kind = 'cotizacion';
  });
  modalEl.querySelector('#rbExpTraza')?.addEventListener('click', async () => {
    try {
      await showTrazabilidadModal(d.requerimiento_id);
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo abrir la trazabilidad');
    }
  });
  modalEl.querySelector('#rbExpDescActa')?.addEventListener('click', async () => {
    try {
      const acta = (d.actas || [])[0];
      if (!acta) throw new Error('No hay proyecto de acta');
      const resDoc = await recepcionBienesService.getDocumento(d.id, 'acta', acta.id);
      const doc = resDoc?.data || resDoc;
      if (!doc?.contenido_base64) throw new Error('Acta sin contenido');
      openBase64Document({
        nombre: doc.nombre || acta.documento_nombre || 'proyecto-acta.pdf',
        mime_type: doc.mime_type || 'application/pdf',
        contenido_base64: doc.contenido_base64,
      });
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo descargar el acta');
    }
  });
}

/** Ver historial → trazabilidad institucional completa (sin historial local previo) */
export async function openHistorialRecepcionModal(row) {
  let reqId = row.requerimiento_id;
  if (!reqId) {
    try {
      const res = await recepcionBienesService.getDetalle(row.id);
      const d = res?.data || res;
      reqId = d?.requerimiento_id;
    } catch (_) { /* ok */ }
  }
  if (!reqId) {
    const { modalEl } = showModal(`
      <div class="modal fade" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Trazabilidad</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="alert alert-warning mb-0">No se encontró el requerimiento vinculado al expediente.</div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
            </div>
          </div>
        </div>
      </div>`);
    return modalEl;
  }
  showTrazabilidadModal(reqId);
}

/** Derivar al Área Usuaria — NO genera acta; exige acta visada + destinatario + docs */
export async function openDerivarAuModal(row, { onDone } = {}) {
  const res = await recepcionBienesService.getDetalle(row.id);
  const detalle = res?.data || res || row;
  const acta = (detalle.actas || [])[0];
  const visada = !!(detalle.acta_visada
    || acta?.estado_documental === 'ACTA_RECEPCION_VISADA_ALMACEN'
    || acta?.visado_almacen_at);

  if (!visada) {
    const { modalEl } = showModal(`
      <div class="modal fade" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Derivar al Área Usuaria</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <div class="alert alert-warning mb-0">
            Debe generar el acta y adjuntar el <strong>acta visada por Almacén</strong> antes de derivar.
            Use la acción <em>Ver / administrar acta</em>.
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
          <button type="button" class="btn btn-primary" id="rbAuGoActa">Ir a administrar acta</button>
        </div>
      </div></div></div>`);
    modalEl.querySelector('#rbAuGoActa').onclick = () => {
      bootstrap.Modal.getInstance(modalEl)?.hide();
      openRegistrarActaModal(row, { onDone });
    };
    return;
  }

  let paquete;
  try {
    paquete = await recepcionBienesService.getPaqueteDerivacionAu(row.id, {
      acta_id: acta?.id,
      recepcion_id: acta?.recepcion_bien_id,
    });
  } catch (e) {
    showModal(`
      <div class="modal fade" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Derivar al Área Usuaria</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body"><div class="alert alert-danger mb-0">${esc(e.message || 'No se pudo cargar el paquete documental')}</div></div>
        <div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button></div>
      </div></div></div>`);
    return;
  }

  let docsPack = [...(paquete.documentos || [])];
  let destinatarios = [];
  const centroResuelto = !!(detalle.centro || detalle.area_usuaria);
  // El backend resuelve el área real desde el requerimiento; no se envía área como autorización.
  try {
    const uRes = await recepcionBienesService.listDestinatariosAu(row.id, {});
    destinatarios = uRes?.data || uRes || [];
  } catch (_) { /* ok */ }
  const guardarHabilitado = centroResuelto;

  const renderDocsTable = () => {
    const byGrupo = new Map();
    (paquete.grupos || []).forEach((g) => byGrupo.set(g, []));
    docsPack.forEach((d) => {
      if (!byGrupo.has(d.grupo)) byGrupo.set(d.grupo, []);
      byGrupo.get(d.grupo).push(d);
    });
    let html = '';
    for (const [grupo, items] of byGrupo.entries()) {
      if (!items.length) continue;
      html += `<tr class="table-light"><td colspan="5" class="fw-semibold small">${esc(grupo)}</td></tr>`;
      items.forEach((d) => {
        const disponible = d.previewDisponible !== false && d.documentoId != null;
        html += `
          <tr>
            <td>
              <input type="checkbox" class="form-check-input rb-au-doc"
                data-key="${esc(d.documentoKey)}"
                data-tipo="${esc(d.tipo)}"
                data-id="${esc(d.documentoId)}"
                ${d.obligatorio || d.seleccionado ? 'checked' : ''}
                ${d.obligatorio ? 'disabled' : ''}>
            </td>
            <td class="small">${esc(d.nombre)}${d.obligatorio ? ' <span class="badge text-bg-danger">Obligatorio</span>' : ''}${!disponible ? ' <span class="badge text-bg-warning">Archivo no disponible</span>' : ''}</td>
            <td class="small text-muted">${esc(d.tipo)}${d.version != null ? ` · V${esc(d.version)}` : ''}</td>
            <td class="small text-muted">${esc(d.origen || '—')}</td>
            <td class="text-nowrap">
              ${disponible ? `
              <button type="button" class="btn btn-sm btn-outline-primary rb-au-ver"
                data-tipo="${esc(d.endpointTipo || d.tipo)}" data-id="${esc(d.documentoId)}"
                data-name="${esc(d.nombre)}">Ver</button>
              <button type="button" class="btn btn-sm btn-outline-secondary rb-au-dl"
                data-tipo="${esc(d.endpointTipo || d.tipo)}" data-id="${esc(d.documentoId)}"
                data-name="${esc(d.nombre)}">Descargar</button>
              ` : '<span class="text-muted small">Sin archivo</span>'}
              ${d.tipo === 'ADJUNTO_DERIVACION' ? `<button type="button" class="btn btn-sm btn-outline-danger rb-au-del-adj" data-id="${esc(d.documentoId)}">Quitar</button>` : ''}
            </td>
          </tr>`;
      });
    }
    return html || '<tr><td colspan="5" class="text-muted">Sin documentos del paquete de conformidad</td></tr>';
  };

  const { modalEl, modal } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h5 class="modal-title mb-0">Derivar al Área Usuaria</h5>
              <div class="small text-muted">OC ${esc(detalle.numero_orden || detalle.orden_id)} · paquete de recepción/conformidad</div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-danger d-none" id="rbModalErr"></div>
            ${!paquete.completo ? `<div class="alert alert-warning small">Paquete incompleto: faltan ${esc((paquete.faltantes || []).join(', '))}</div>` : ''}
            <div class="row g-2 mb-3">
              <div class="col-md-4">
                <label class="form-label">Módulo destino</label>
                <select class="form-select" id="rbAuModulo" disabled>
                  <option value="EJECUCION" selected>Ejecución</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label">Submódulo destino *</label>
                <select class="form-select" id="rbAuSub">
                  <option value="RECEPCION_BIENES_AU" selected>Recepción de Bienes – Área Usuaria</option>
                </select>
              </div>
              <div class="col-md-2">
                <label class="form-label">Centro *</label>
                <input class="form-control" id="rbAuCentro" value="${esc(detalle.centro || '—')}" readonly
                  ${centroResuelto ? '' : 'title="Centro no resuelto — debe corregirse antes de derivar"'}>
              </div>
              <div class="col-md-2">
                <label class="form-label">Área / unidad destino</label>
                <input class="form-control" id="rbAuArea" value="${esc(detalle.area_usuaria || '')}" readonly>
              </div>
              <div class="col-md-8">
                <label class="form-label">Persona responsable *</label>
                <select class="form-select" id="rbAuDest" ${centroResuelto ? '' : 'disabled'}>
                  <option value="">Seleccione…</option>
                  ${destinatarios.map((u) => `
                    <option value="${esc(u.id)}"
                      data-nombre="${esc(u.nombre)}"
                      data-cargo="${esc(u.cargo || '')}"
                      data-correo="${esc(u.correo || '')}">
                      ${esc(u.nombre)}${u.cargo ? ` — ${esc(u.cargo)}` : ''}${u.dni ? ` · DNI ${esc(u.dni)}` : ''}
                    </option>`).join('')}
                </select>
                ${centroResuelto ? '' : '<div class="form-text text-warning small">Centro no resuelto: no se puede seleccionar responsable ni derivar.</div>'}
              </div>
              <div class="col-md-4">
                <label class="form-label">Correo / cargo</label>
                <div class="form-control-plaintext small" id="rbAuDestMeta">—</div>
              </div>
              <div class="col-12">
                <label class="form-label">Mensaje / observación</label>
                <textarea class="form-control" id="rbAuMotivo" rows="2" placeholder="Opcional"></textarea>
              </div>
            </div>
            <h6 class="fw-semibold">Documentos a derivar</h6>
            <div class="table-responsive border rounded mb-2">
              <table class="table table-sm mb-0 align-middle" style="font-size:12px">
                <thead class="table-light">
                  <tr><th style="width:36px"></th><th>Documento</th><th>Tipo</th><th>Origen</th><th>Acciones</th></tr>
                </thead>
                <tbody id="rbAuDocsBody">${renderDocsTable()}</tbody>
              </table>
            </div>
            <div class="border rounded p-2 bg-light">
              <label class="form-label small mb-1">Agregar adjunto propio</label>
              <div class="row g-2 align-items-end">
                <div class="col-md-6">
                  <input type="file" class="form-control form-control-sm" id="rbAuExtraFile"
                    accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*">
                </div>
                <div class="col-md-3">
                  <button type="button" class="btn btn-sm btn-success w-100" id="rbAuExtraAdjuntar" disabled>Adjuntar</button>
                </div>
                <div class="col-md-3">
                  <button type="button" class="btn btn-sm btn-outline-secondary w-100" id="rbAuExtraQuitar" disabled>Quitar</button>
                </div>
              </div>
              <div id="rbAuExtraPendiente" class="small mt-2 d-none"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="rbAuSave" ${guardarHabilitado ? '' : 'disabled'}>
              <span>Derivar</span>
              <span class="spinner-border spinner-border-sm d-none" id="rbAuSpin"></span>
            </button>
          </div>
        </div>
      </div>
    </div>`);

  const refreshPaquete = async () => {
    paquete = await recepcionBienesService.getPaqueteDerivacionAu(row.id, {
      acta_id: acta?.id,
      recepcion_id: acta?.recepcion_bien_id,
    });
    docsPack = [...(paquete.documentos || [])];
    modalEl.querySelector('#rbAuDocsBody').innerHTML = renderDocsTable();
  };

  modalEl.querySelector('#rbAuDest').onchange = () => {
    const opt = modalEl.querySelector('#rbAuDest option:checked');
    const meta = modalEl.querySelector('#rbAuDestMeta');
    if (!opt?.value) { meta.textContent = '—'; return; }
    meta.textContent = [opt.dataset.cargo, opt.dataset.correo].filter(Boolean).join(' · ') || '—';
  };
  modalEl.querySelector('#rbAuSave').disabled = !guardarHabilitado;

  modalEl.querySelector('#rbAuExtraFile')?.addEventListener('change', () => {
    const file = modalEl.querySelector('#rbAuExtraFile')?.files?.[0];
    const box = modalEl.querySelector('#rbAuExtraPendiente');
    const btnA = modalEl.querySelector('#rbAuExtraAdjuntar');
    const btnQ = modalEl.querySelector('#rbAuExtraQuitar');
    if (!file) {
      box.classList.add('d-none');
      btnA.disabled = true;
      btnQ.disabled = true;
      return;
    }
    box.classList.remove('d-none');
    box.innerHTML = `
      <div><strong>${esc(file.name)}</strong></div>
      <div class="text-muted">${esc(file.type || 'application/pdf')} · ${(file.size / 1024).toFixed(1)} KB</div>
      <div><span class="badge text-bg-warning">Pendiente de adjuntar</span></div>
      <div class="small text-muted mt-1">Aún no está en el paquete. Presione <strong>Adjuntar</strong>.</div>`;
    btnA.disabled = false;
    btnQ.disabled = false;
  });
  modalEl.querySelector('#rbAuExtraQuitar')?.addEventListener('click', () => {
    modalEl.querySelector('#rbAuExtraFile').value = '';
    modalEl.querySelector('#rbAuExtraPendiente').classList.add('d-none');
    modalEl.querySelector('#rbAuExtraAdjuntar').disabled = true;
    modalEl.querySelector('#rbAuExtraQuitar').disabled = true;
  });
  modalEl.querySelector('#rbAuExtraAdjuntar')?.addEventListener('click', async () => {
    hideErr(modalEl);
    const btnA = modalEl.querySelector('#rbAuExtraAdjuntar');
    try {
      const file = modalEl.querySelector('#rbAuExtraFile')?.files?.[0];
      if (!file) throw new Error('Seleccione un archivo');
      if (file.type && !/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
        throw new Error('Solo se aceptan archivos PDF');
      }
      btnA.disabled = true;
      const b64 = toRawBase64(await fileToBase64(file));
      const res = await recepcionBienesService.adjuntarAdjuntoDerivacion(row.id, {
        nombre: file.name,
        mime_type: file.type || 'application/pdf',
        documento_base64: b64,
      });
      const doc = res?.data || res || {};
      if (!doc.documentoId && !doc.id) {
        throw new Error('El servidor no devolvió documentoId');
      }
      modalEl.querySelector('#rbAuExtraFile').value = '';
      modalEl.querySelector('#rbAuExtraPendiente').classList.add('d-none');
      modalEl.querySelector('#rbAuExtraAdjuntar').disabled = true;
      modalEl.querySelector('#rbAuExtraQuitar').disabled = true;
      await refreshPaquete();
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo adjuntar');
      if (modalEl.querySelector('#rbAuExtraFile')?.files?.[0]) btnA.disabled = false;
    }
  });

  modalEl.querySelector('#rbAuDocsBody')?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    hideErr(modalEl);
    try {
      if (btn.classList.contains('rb-au-ver') || btn.classList.contains('rb-au-dl')) {
        const tipo = btn.dataset.tipo;
        const id = btn.dataset.id;
        const nombre = btn.dataset.name || 'documento.pdf';
        btn.disabled = true;
        if (btn.classList.contains('rb-au-ver')) {
          const { blob, contentType } = await recepcionBienesService.previewDocumentoBlob(row.id, tipo, id);
          await openBlobDocument({ nombre, mime_type: contentType, blob });
        } else {
          const { blob, contentType } = await recepcionBienesService.downloadDocumentoBlob(row.id, tipo, id);
          downloadBlobFile({ blob, contentType, nombre });
        }
        return;
      }
      if (btn.classList.contains('rb-au-del-adj')) {
        await recepcionBienesService.eliminarAdjuntoDerivacion(row.id, btn.dataset.id, {
          motivo: 'Eliminado antes de derivar',
        });
        await refreshPaquete();
      }
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo abrir el documento');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  modalEl.querySelector('#rbAuSave').onclick = async () => {
    hideErr(modalEl);
    const btn = modalEl.querySelector('#rbAuSave');
    const spin = modalEl.querySelector('#rbAuSpin');
    if (!guardarHabilitado) {
      showErr(modalEl, 'No se puede derivar: el centro del expediente no está resuelto');
      return;
    }
    try {
      const sel = modalEl.querySelector('#rbAuDest');
      const opt = sel.options[sel.selectedIndex];
      if (!sel.value) throw new Error('Seleccione la persona responsable del Área Usuaria');
      const docs = [...modalEl.querySelectorAll('.rb-au-doc:checked')].map((el) => el.dataset.key);
      // Incluir siempre obligatorios aunque disabled no envíe checked en algunos browsers
      docsPack.filter((d) => d.obligatorio).forEach((d) => {
        if (!docs.includes(d.documentoKey)) docs.push(d.documentoKey);
      });
      spin.classList.remove('d-none');
      btn.disabled = true;
      await recepcionBienesService.derivarAu(row.id, {
        destinatario_id: Number(sel.value),
        destinatario_nombre: opt.dataset.nombre || opt.textContent.trim(),
        modulo_destino: 'EJECUCION',
        submodulo_destino: modalEl.querySelector('#rbAuSub').value,
        area_destino: modalEl.querySelector('#rbAuArea').value,
        motivo: modalEl.querySelector('#rbAuMotivo').value.trim(),
        mensaje: modalEl.querySelector('#rbAuMotivo').value.trim(),
        documentos_ids: docs,
        recepcion_id: paquete.recepcionId,
        acta_id: paquete.actaId,
        idempotency_key: `ui-au-${row.id}-v${detalle.version || 1}`,
      });
      modal.hide();
      onDone?.();
    } catch (e) {
      const extra = e.detail?.faltantes ? ` Faltan: ${e.detail.faltantes.join(', ')}` : '';
      showErr(modalEl, (e.message || 'No se pudo derivar') + extra);
    } finally {
      spin.classList.add('d-none');
      btn.disabled = false;
    }
  };
}

/** AU — cargar acta firmada → Conformidad recibida del AU */
export function openCargarActaFirmadaModal(row, { onDone } = {}) {
  let fileMeta = null;
  const { modalEl, modal } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Adjuntar Acta firmada</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-danger d-none" id="rbModalErr"></div>
            <p class="small text-muted">OC ${esc(row.numero_orden || row.orden_id)}. Al cargar el PDF firmado el estado pasa a <strong>Conformidad recibida del AU</strong>.</p>
            <div class="mb-2">
              <label class="form-label">PDF firmado *</label>
              <input type="file" class="form-control" id="rbActaFile" accept=".pdf,application/pdf">
              <div class="form-text" id="rbActaFileName">Ningún archivo seleccionado</div>
            </div>
            <div class="mb-2">
              <label class="form-label">Comentario</label>
              <textarea class="form-control" id="rbActaCom" rows="2"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-success" id="rbActaSave">Registrar conformidad</button>
          </div>
        </div>
      </div>
    </div>`);

  modalEl.querySelector('#rbActaFile').onchange = async (ev) => {
    try {
      const f = ev.target.files?.[0];
      if (!f) return;
      fileMeta = await readPdfUpload(f);
      modalEl.querySelector('#rbActaFileName').textContent = fileMeta.nombre;
    } catch (e) {
      fileMeta = null;
      showErr(modalEl, e.message);
    }
  };

  modalEl.querySelector('#rbActaSave').onclick = async () => {
    hideErr(modalEl);
    if (!fileMeta?.base64) {
      showErr(modalEl, 'Seleccione el PDF firmado');
      return;
    }
    const btn = modalEl.querySelector('#rbActaSave');
    try {
      btn.disabled = true;
      await recepcionBienesService.cargarActaFirmada(row.id, {
        acta_firmada_base64: fileMeta.base64,
        acta_firmada_nombre: fileMeta.nombre,
        acta_firmada_mime: fileMeta.mime_type || 'application/pdf',
        comentario: modalEl.querySelector('#rbActaCom').value.trim(),
        idempotency_key: `ui-firmada-${row.id}-${Date.now()}`,
      });
      modal.hide();
      onDone?.();
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo cargar el acta');
    } finally {
      btn.disabled = false;
    }
  };
}

/** AU — observar y devolver a Almacén (historial + adjuntos) */
export function openObservarAuModal(row, { onDone } = {}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const adjuntos = [];
  const { modalEl, modal } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Observar → devolver a Almacén</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-danger d-none" id="rbModalErr"></div>
            <p class="small text-muted">El historial se conserva. El expediente vuelve a la bandeja de Almacén.</p>
            <div class="mb-2">
              <label class="form-label">Motivo *</label>
              <textarea class="form-control" id="rbObsMotivo" rows="3" required></textarea>
            </div>
            <div class="row g-2 mb-2">
              <div class="col-md-6">
                <label class="form-label">Fecha</label>
                <input type="date" class="form-control" id="rbObsFecha" value="${hoy}">
              </div>
              <div class="col-md-6">
                <label class="form-label">Responsable</label>
                <input type="text" class="form-control" id="rbObsResp" value="${esc(currentUserName())}">
              </div>
            </div>
            <div class="mb-2">
              <label class="form-label">Adjuntos (PDF)</label>
              <input type="file" class="form-control" id="rbObsFiles" accept=".pdf,application/pdf" multiple>
              <ul class="small mt-1 mb-0" id="rbObsList"></ul>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-warning" id="rbObsSave">Registrar observación</button>
          </div>
        </div>
      </div>
    </div>`);

  const paintAdj = () => {
    modalEl.querySelector('#rbObsList').innerHTML = adjuntos.map((a, i) =>
      `<li>${esc(a.nombre)} <button type="button" class="btn btn-link btn-sm p-0 rb-obs-del" data-i="${i}">quitar</button></li>`).join('');
    modalEl.querySelectorAll('.rb-obs-del').forEach((b) => {
      b.onclick = () => { adjuntos.splice(Number(b.dataset.i), 1); paintAdj(); };
    });
  };

  modalEl.querySelector('#rbObsFiles').onchange = async (ev) => {
    try {
      for (const f of [...(ev.target.files || [])]) {
        const meta = await readPdfUpload(f);
        adjuntos.push({
          nombre: meta.nombre,
          mime_type: meta.mime_type,
          contenido_base64: meta.base64,
        });
      }
      paintAdj();
      ev.target.value = '';
    } catch (e) {
      showErr(modalEl, e.message);
    }
  };

  modalEl.querySelector('#rbObsSave').onclick = async () => {
    hideErr(modalEl);
    const motivo = modalEl.querySelector('#rbObsMotivo').value.trim();
    if (!motivo) {
      showErr(modalEl, 'El motivo es obligatorio');
      return;
    }
    const btn = modalEl.querySelector('#rbObsSave');
    try {
      btn.disabled = true;
      await recepcionBienesService.observar(row.id, {
        motivo,
        fecha: modalEl.querySelector('#rbObsFecha').value || hoy,
        responsable: modalEl.querySelector('#rbObsResp').value.trim(),
        destino: 'ALMACEN',
        adjuntos,
      });
      modal.hide();
      onDone?.();
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo registrar la observación');
    } finally {
      btn.disabled = false;
    }
  };
}

/** Almacén — Registrar / editar Acta (Orden + Ítem + Entrega + Recepción) */
export async function openRegistrarActaModal(row, { onDone, actaId = null } = {}) {
  const res = await recepcionBienesService.getDetalle(row.id);
  const d = res?.data || res;
  if (!(d.recepciones || []).length) {
    const { modalEl } = showModal(`
      <div class="modal fade" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Registrar acta</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body"><div class="alert alert-warning mb-0">Debe existir al menos una recepción registrada.</div></div>
        <div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button></div>
      </div></div></div>`);
    return modalEl;
  }

  const items = d.orden_items || d.items || [];
  const entregas = d.cronograma || d.entregas || [];
  const recepciones = d.recepciones || [];
  const actas = (d.actas || []).filter((a) => !a.eliminado_at);
  const actaEdit = actaId ? actas.find((a) => Number(a.id) === Number(actaId)) : null;

  const actaVigente = actaEdit || actas[0] || null;
  const yaGenerada = !!(actaVigente && ['ACTA_RECEPCION_GENERADA', 'ACTA_RECEPCION_EDITADA', 'ACTA_RECEPCION_VISADA_ALMACEN', 'ACTA_RECEPCION_ENVIADA_AU'].includes(actaVigente.estado_documental));
  const yaVisada = !!(actaVigente?.visado_almacen_at || actaVigente?.estado_documental === 'ACTA_RECEPCION_VISADA_ALMACEN');

  const { modalEl, modal } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h5 class="modal-title mb-0">${actaVigente ? 'Administrar' : 'Registrar'} acta · OC ${esc(d.numero_orden || d.orden_id)}</h5>
              <div class="small text-muted">Orden + Ítem + Entrega + Recepción · ${esc(actaVigente?.estado_documental || 'sin acta')}</div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-danger d-none" id="rbModalErr"></div>
            <ul class="nav nav-tabs" role="tablist">
              <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#rbActaTabDatos" type="button">Datos contractuales</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rbActaTabSel" type="button">Ítem / entrega / recepción</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rbActaTabFechas" type="button">Fechas y penalidad</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rbActaTabPrev" type="button">Vista previa</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rbActaTabDocs" type="button">Documentos / visado</button></li>
            </ul>
            <div class="tab-content border border-top-0 p-3">
              <div class="tab-pane fade show active" id="rbActaTabDatos">
                <div class="row g-2">
                  <div class="col-md-3"><label class="form-label">N.° de orden</label><input class="form-control" value="${esc(d.numero_orden || d.orden_id)}" readonly></div>
                  <div class="col-md-3"><label class="form-label">Fecha de emisión</label><input class="form-control" value="${esc(fmtFecha(d.fecha_emision || d.fecha_orden))}" readonly></div>
                  <div class="col-md-3"><label class="form-label">Monto total</label><input class="form-control" value="${esc(fmtMonto(d.monto_total, d.moneda))}" readonly></div>
                  <div class="col-md-3"><label class="form-label">Proveedor / RUC</label><input class="form-control" value="${esc(`${d.proveedor_razon_social || ''} · ${d.proveedor_ruc || ''}`)}" readonly></div>
                  <div class="col-md-4"><label class="form-label">Requerimiento</label><input class="form-control" value="${esc(d.requerimiento_codigo || '')}" readonly></div>
                  <div class="col-md-4"><label class="form-label">Pedido SIGAMEF</label><input class="form-control" value="${esc(d.pedido_sigamef || '')}" readonly></div>
                  <div class="col-md-4"><label class="form-label">Área Usuaria</label><input class="form-control" value="${esc(d.area_usuaria || '')}" readonly></div>
                  <div class="col-md-6"><label class="form-label">Lugar de entrega</label><input class="form-control" value="${esc(d.lugar_entrega || '')}" readonly></div>
                  <div class="col-md-6"><label class="form-label">Responsable Almacén</label><input class="form-control" id="rbActaResp" value="${esc(currentUserName() || d.responsable || '')}"></div>
                </div>
              </div>
              <div class="tab-pane fade" id="rbActaTabSel">
                <div class="row g-2">
                  <div class="col-md-4">
                    <label class="form-label">Ítem *</label>
                    <select class="form-select" id="rbActaItem">
                      ${items.map((it) => `<option value="${esc(it.id)}" ${(actaVigente && Number(actaVigente.orden_item_id) === Number(it.id)) || items.length === 1 ? 'selected' : ''}>${esc(`${it.codigo_sigamef || it.codigo || it.id} — ${it.descripcion || ''}`)}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Entrega / entregable *</label>
                    <select class="form-select" id="rbActaEntrega">
                      ${entregas.length ? entregas.map((e) => `<option value="${esc(e.id)}" ${(actaVigente && Number(actaVigente.orden_entrega_id) === Number(e.id)) || entregas.length === 1 ? 'selected' : ''}>${esc(e.etiqueta_entrega || e.etiquetaEntrega || e.label || `Entrega ${e.id}`)}</option>`).join('')
    : '<option value="">ÚNICO</option>'}
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Recepción *</label>
                    <select class="form-select" id="rbActaRecepcion">
                      ${recepciones.map((r, idx) => `<option value="${esc(r.id)}" ${(actaVigente && Number(actaVigente.recepcion_bien_id) === Number(r.id)) || recepciones.length === 1 || idx === 0 ? 'selected' : ''}>${esc(`${fmtFecha(r.fecha_recepcion_guia)} · ${fmtMonto(r.monto_liquidar, d.moneda)} · ${r.estado_fisico || ''}`)}</option>`).join('')}
                    </select>
                  </div>
                </div>
              </div>
              <div class="tab-pane fade" id="rbActaTabFechas">
                <div id="rbActaFechasBox" class="small text-muted">Cargando…</div>
              </div>
              <div class="tab-pane fade" id="rbActaTabPrev">
                <div class="border rounded p-3 bg-light" id="rbActaPreview"></div>
                <div class="mt-3">
                  <label class="form-label">Observación</label>
                  <textarea class="form-control" id="rbActaObs" rows="2">${esc(actaVigente?.observacion_acta || '')}</textarea>
                </div>
              </div>
              <div class="tab-pane fade" id="rbActaTabDocs">
                <p class="small text-muted mb-2">Tras generar el PDF, descárguelo, viselo externamente y adjunte aquí el archivo firmado/visado por Almacén.</p>
                <div class="row g-2 align-items-end">
                  <div class="col-md-5">
                    <label class="form-label">Seleccionar PDF</label>
                    <input type="file" class="form-control" id="rbActaVisadaFile" accept=".pdf,application/pdf" ${yaGenerada && !actaVigente?.enviado_au_at ? '' : 'disabled'}>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Observación de visado</label>
                    <input type="text" class="form-control" id="rbActaVisadaObs" ${yaGenerada && !actaVigente?.enviado_au_at ? '' : 'disabled'}>
                  </div>
                  <div class="col-md-3">
                    <button type="button" class="btn btn-success w-100" id="rbActaVisadaAdjuntar" disabled>Adjuntar acta visada</button>
                  </div>
                </div>
                <div id="rbActaVisadaPendiente" class="border rounded p-2 mt-2 small d-none bg-warning-subtle"></div>
                <div id="rbActaVisadaOk" class="alert alert-success small mt-2 d-none mb-0"></div>
                <div class="mt-3">
                  <div class="fw-semibold small mb-1">Actas visadas registradas</div>
                  <div id="rbActaVisadaLista" class="table-responsive">
                    <div class="text-muted small">Sin documentos visados.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer flex-wrap gap-2">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
            <button type="button" class="btn btn-outline-primary" id="rbActaBorrador">Guardar borrador</button>
            <button type="button" class="btn btn-outline-dark" id="rbActaPreviewPdf">Vista previa</button>
            <button type="button" class="btn btn-primary" id="rbActaGenerar">Generar PDF</button>
            ${yaGenerada ? '<button type="button" class="btn btn-outline-secondary" id="rbActaDescargar">Descargar generada</button>' : ''}
            ${actaVigente && !actaVigente.enviado_au_at && ['ACTA_RECEPCION_BORRADOR', 'ACTA_RECEPCION_GENERADA', 'ACTA_RECEPCION_EDITADA'].includes(actaVigente.estado_documental) ? `<button type="button" class="btn btn-outline-danger" id="rbActaEliminar">Eliminar borrador</button>` : ''}
          </div>
        </div>
      </div>
    </div>`);

  // reuse actaEdit variable for handlers
  const actaEditRef = { current: actaVigente };

  const paintPreview = () => {
    const item = items.find((it) => String(it.id) === String(modalEl.querySelector('#rbActaItem').value));
    const entrega = entregas.find((e) => String(e.id) === String(modalEl.querySelector('#rbActaEntrega').value)) || null;
    const recepcion = recepciones.find((r) => String(r.id) === String(modalEl.querySelector('#rbActaRecepcion').value));
    const combo = (d.item_entregas || []).find((c) =>
      Number(c.orden_item_id) === Number(item?.id)
      && (!entrega || Number(c.orden_entrega_id) === Number(entrega.id)));
    const data = buildActaRecepcionData(d, {
      item, entrega, recepcion, combo,
      observaciones: modalEl.querySelector('#rbActaObs')?.value || '',
      generadoPor: currentUserName(),
      responsable: modalEl.querySelector('#rbActaResp')?.value || currentUserName(),
    });
    const prev = modalEl.querySelector('#rbActaPreview');
    if (prev) {
      const html = buildActaRecepcionPreviewHtml(data, {
        generadoPor: currentUserName(),
        responsable: modalEl.querySelector('#rbActaResp')?.value || currentUserName(),
      });
      // Misma plantilla institucional HTML que alimenta el PDF (sin secciones I–VI).
      prev.innerHTML = '';
      const frame = document.createElement('iframe');
      frame.title = 'Vista previa acta';
      frame.style.cssText = 'width:100%;height:640px;border:1px solid #ccc;background:#fff';
      frame.srcdoc = html;
      prev.appendChild(frame);
    }
    const fechas = modalEl.querySelector('#rbActaFechasBox');
    if (fechas) {
      fechas.innerHTML = `
        <div class="row g-2">
          <div class="col-md-4"><strong>Condición de inicio:</strong><br>${esc(data.entrega.condicion_inicio)}</div>
          <div class="col-md-4"><strong>Fecha efectiva:</strong><br>${esc(data.entrega.fecha_inicio)}</div>
          <div class="col-md-4"><strong>Plazo:</strong><br>${esc(data.entrega.plazo || d.plazo_entrega_label || '—')}</div>
          <div class="col-md-4"><strong>Fecha máxima:</strong><br>${esc(data.entrega.fecha_maxima)}</div>
          <div class="col-md-4"><strong>Fecha recepción:</strong><br>${esc(data.recepcion.fecha)}</div>
          <div class="col-md-4"><strong>Corresponde penalidad:</strong><br>
            <span class="badge ${data.corresponde_penalidad === 'SÍ' ? 'bg-danger' : 'bg-success'}">${esc(data.corresponde_penalidad)}</span>
          </div>
        </div>`;
    }
    return { item, entrega, recepcion, combo, data };
  };

  paintPreview();
  ['#rbActaItem', '#rbActaEntrega', '#rbActaRecepcion', '#rbActaObs', '#rbActaResp'].forEach((sel) => {
    modalEl.querySelector(sel)?.addEventListener('change', paintPreview);
    modalEl.querySelector(sel)?.addEventListener('input', paintPreview);
  });

  const buildPayload = (borrador) => {
    const { item, entrega, recepcion, combo, data } = paintPreview();
    if (!item || !recepcion) throw new Error('Seleccione ítem y recepción');
    const pdf = borrador ? null : generateActaRecepcionPdf(d, {
      item, entrega, recepcion, combo,
      observaciones: modalEl.querySelector('#rbActaObs').value,
      generadoPor: currentUserName(),
      correspondePenalidad: data.corresponde_penalidad,
      montoEntregable: data.entrega.monto_num,
      fechaMaxima: combo?.fecha_maxima || entrega?.fechaMaxima || d.fecha_maxima,
      fechaRecepcion: recepcion.fecha_recepcion_guia,
      lugarEntrega: data.lugar_entrega,
      responsable: modalEl.querySelector('#rbActaResp')?.value || data.responsable_almacen,
    });
    return {
      orden_item_id: item.id,
      orden_entrega_id: entrega?.id || null,
      recepcion_id: recepcion.id,
      observaciones: modalEl.querySelector('#rbActaObs').value,
      borrador: !!borrador,
      monto_entregable: data.entrega.monto_num,
      corresponde_penalidad: data.corresponde_penalidad === 'SÍ',
      lugar_entrega: data.lugar_entrega,
      responsable: modalEl.querySelector('#rbActaResp')?.value || data.responsable_almacen,
      documento_base64: pdf?.base64 || null,
      documento_nombre: pdf?.nombre || null,
      documento_mime: 'application/pdf',
      numero_acta: data.numero_acta,
    };
  };

  modalEl.querySelector('#rbActaBorrador').onclick = async () => {
    hideErr(modalEl);
    try {
      const payload = buildPayload(true);
      if (actaEditRef.current) await recepcionBienesService.editarActa(row.id, actaEditRef.current.id, payload);
      else await recepcionBienesService.generarActa(row.id, payload);
      modal.hide();
      onDone?.();
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo guardar el borrador');
    }
  };

  modalEl.querySelector('#rbActaPreviewPdf').onclick = async () => {
    hideErr(modalEl);
    try {
      const { item, entrega, recepcion, combo, data } = paintPreview();
      const pdf = generateActaRecepcionPdf(d, {
        item, entrega, recepcion, combo,
        observaciones: modalEl.querySelector('#rbActaObs').value,
        generadoPor: currentUserName(),
        correspondePenalidad: data.corresponde_penalidad,
        montoEntregable: data.entrega.monto_num,
      });
      openBase64Document({
        nombre: pdf.nombre,
        mime_type: 'application/pdf',
        contenido_base64: pdf.base64,
      });
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo previsualizar');
    }
  };

  modalEl.querySelector('#rbActaGenerar').onclick = async () => {
    hideErr(modalEl);
    try {
      const payload = buildPayload(false);
      let saved;
      if (actaEditRef.current) saved = await recepcionBienesService.editarActa(row.id, actaEditRef.current.id, payload);
      else saved = await recepcionBienesService.generarActa(row.id, payload);
      if (payload.documento_base64) {
        const a = document.createElement('a');
        a.href = `data:application/pdf;base64,${payload.documento_base64}`;
        a.download = payload.documento_nombre || 'acta.pdf';
        a.click();
      }
      modal.hide();
      onDone?.();
      return saved;
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo generar el acta');
    }
  };

  modalEl.querySelector('#rbActaDescargar')?.addEventListener('click', async () => {
    hideErr(modalEl);
    try {
      const acta = actaEditRef.current;
      if (!acta) throw new Error('No hay acta generada');
      const docRes = await recepcionBienesService.getDocumento(row.id, 'acta', acta.id);
      const doc = docRes?.data || docRes;
      if (!doc?.contenido_base64) throw new Error('Acta sin contenido');
      openBase64Document({
        nombre: doc.nombre || acta.documento_nombre || 'acta.pdf',
        mime_type: doc.mime_type || 'application/pdf',
        contenido_base64: doc.contenido_base64,
      });
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo descargar');
    }
  });

  modalEl.querySelector('#rbActaVisadaFile')?.addEventListener('change', () => {
    hideErr(modalEl);
    const file = modalEl.querySelector('#rbActaVisadaFile')?.files?.[0] || null;
    const box = modalEl.querySelector('#rbActaVisadaPendiente');
    const btn = modalEl.querySelector('#rbActaVisadaAdjuntar');
    modalEl.querySelector('#rbActaVisadaOk')?.classList.add('d-none');
    if (!file) {
      box?.classList.add('d-none');
      if (btn) btn.disabled = true;
      return;
    }
    const mime = String(file.type || '').toLowerCase();
    const name = String(file.name || '').toLowerCase();
    if ((mime && mime !== 'application/pdf') || (!name.endsWith('.pdf') && mime !== 'application/pdf')) {
      showErr(modalEl, 'Solo se aceptan archivos PDF');
      modalEl.querySelector('#rbActaVisadaFile').value = '';
      box?.classList.add('d-none');
      if (btn) btn.disabled = true;
      return;
    }
    if (file.size <= 0) {
      showErr(modalEl, 'El archivo está vacío');
      modalEl.querySelector('#rbActaVisadaFile').value = '';
      if (btn) btn.disabled = true;
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showErr(modalEl, 'El PDF supera el tamaño máximo permitido (10 MB)');
      modalEl.querySelector('#rbActaVisadaFile').value = '';
      if (btn) btn.disabled = true;
      return;
    }
    const kb = (file.size / 1024).toFixed(1);
    box.classList.remove('d-none');
    box.innerHTML = `
      <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap">
        <div>
          <span class="badge text-bg-warning me-1">SELECCIONADO</span>
          <strong>${esc(file.name)}</strong>
          <span class="text-muted"> · ${esc(kb)} KB · ${esc(file.type || 'application/pdf')} · Pendiente de adjuntar</span>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="rbActaVisadaQuitar">Quitar selección</button>
      </div>`;
    if (btn) btn.disabled = false;
    box.querySelector('#rbActaVisadaQuitar')?.addEventListener('click', () => {
      modalEl.querySelector('#rbActaVisadaFile').value = '';
      box.classList.add('d-none');
      if (btn) btn.disabled = true;
    });
  });

  const fmtBytes = (n) => {
    const v = Number(n || 0);
    if (!v) return '—';
    if (v < 1024) return `${v} B`;
    return `${(v / 1024).toFixed(1)} KB`;
  };

  const renderVisadosLista = (items = []) => {
    const host = modalEl.querySelector('#rbActaVisadaLista');
    if (!host) return;
    if (!items.length) {
      host.innerHTML = '<div class="text-muted small">Sin documentos visados.</div>';
      return;
    }
    const derivado = !!actaEditRef.current?.enviado_au_at;
    host.innerHTML = `
      <table class="table table-sm table-bordered align-middle mb-0" style="font-size:12px">
        <thead class="table-light">
          <tr>
            <th>Documento</th><th>Versión</th><th>Fecha</th><th>Cargado por</th>
            <th>Estado</th><th>Observación</th><th style="min-width:210px">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((it) => `
            <tr data-doc="${esc(it.documentoId)}">
              <td>${esc(it.nombre)}</td>
              <td class="text-center">V${esc(it.version)}</td>
              <td>${esc(fmtFecha(it.fechaRegistro))}</td>
              <td>${esc(it.registradoPor || '—')}</td>
              <td><span class="badge ${it.vigente ? 'text-bg-success' : 'text-bg-secondary'}">${esc(it.estadoDocumental || '')}</span>
                ${it.vigente ? '<span class="badge text-bg-primary ms-1">REGISTRADO / VISADO</span>' : ''}
              </td>
              <td>${esc(it.observacion || '—')}</td>
              <td class="text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-primary rb-vis-ver" data-id="${esc(it.documentoId)}">Ver</button>
                <button type="button" class="btn btn-sm btn-outline-secondary rb-vis-dl" data-id="${esc(it.documentoId)}" data-name="${esc(it.nombre)}">Descargar</button>
                ${!derivado && it.puedeReemplazar ? `<button type="button" class="btn btn-sm btn-outline-warning rb-vis-reemp" data-id="${esc(it.documentoId)}">Reemplazar</button>` : ''}
                ${!derivado && it.puedeEliminar ? `<button type="button" class="btn btn-sm btn-outline-danger rb-vis-del" data-id="${esc(it.documentoId)}">Eliminar</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  };

  const refreshVisados = async () => {
    const acta = actaEditRef.current;
    if (!acta?.id) {
      renderVisadosLista(d.actas_visadas || []);
      return;
    }
    try {
      const res = await recepcionBienesService.listarActaVisada(row.id, acta.id);
      const items = res?.items || res?.data?.items || [];
      renderVisadosLista(items);
    } catch (_) {
      renderVisadosLista(d.actas_visadas || []);
    }
  };

  await refreshVisados();

  const adjuntarVisada = async ({ reemplazarId = null } = {}) => {
    hideErr(modalEl);
    const acta = actaEditRef.current;
    if (!acta?.id) throw new Error('Genere el acta antes de adjuntar la versión visada');
    const file = modalEl.querySelector('#rbActaVisadaFile')?.files?.[0];
    if (!file) throw new Error('Seleccione el PDF del acta visada');
    const meta = await readPdfUpload(file);
    const payload = {
      acta_id: acta.id,
      recepcion_id: acta.recepcion_bien_id || null,
      acta_visada_base64: meta.base64,
      acta_visada_nombre: meta.nombre,
      acta_visada_mime: meta.mime_type || 'application/pdf',
      observacion: modalEl.querySelector('#rbActaVisadaObs')?.value || '',
      idempotency_key: `visada-${row.id}-${acta.id}-${file.name}-${file.size}-${file.lastModified || 0}`,
    };
    const btn = modalEl.querySelector('#rbActaVisadaAdjuntar');
    if (btn) btn.disabled = true;
    let res;
    if (reemplazarId) {
      res = await recepcionBienesService.reemplazarActaVisada(row.id, acta.id, reemplazarId, {
        ...payload,
        motivo: payload.observacion || 'Reemplazo de acta visada',
        idempotency_key: `reemp-${reemplazarId}-${payload.idempotency_key}`,
      });
    } else {
      res = await recepcionBienesService.adjuntarActaVisada(row.id, payload);
    }
    const doc = res?.data || res || {};
    modalEl.querySelector('#rbActaVisadaFile').value = '';
    modalEl.querySelector('#rbActaVisadaPendiente')?.classList.add('d-none');
    const ok = modalEl.querySelector('#rbActaVisadaOk');
    if (ok) {
      ok.classList.remove('d-none');
      ok.textContent = `Acta visada ${reemplazarId ? 'reemplazada' : 'adjuntada'}: ${doc.nombre || meta.nombre} · documentoId ${doc.documentoId || '—'}`;
    }
    if (doc.data) {
      Object.assign(d, doc.data);
      actaEditRef.current = (doc.data.actas || [])[0] || acta;
    }
    await refreshVisados();
    onDone?.();
  };

  modalEl.querySelector('#rbActaVisadaAdjuntar')?.addEventListener('click', async () => {
    try {
      await adjuntarVisada();
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo adjuntar el acta visada');
      const btn = modalEl.querySelector('#rbActaVisadaAdjuntar');
      if (btn && modalEl.querySelector('#rbActaVisadaFile')?.files?.[0]) btn.disabled = false;
    }
  });

  modalEl.querySelector('#rbActaVisadaLista')?.addEventListener('click', async (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    const acta = actaEditRef.current;
    const docId = t.dataset.id;
    if (!acta?.id || !docId) return;
    hideErr(modalEl);
    try {
      if (t.classList.contains('rb-vis-ver')) {
        const tipo = String(docId).startsWith('legacy') ? 'acta_visada_legacy' : 'acta_visada';
        const doc = await recepcionBienesService.getDocumento(row.id, tipo, docId);
        await openBase64Document({
          nombre: doc.nombre || 'acta-visada.pdf',
          mime_type: doc.mime_type || 'application/pdf',
          contenido_base64: doc.contenido_base64,
        });
        return;
      }
      if (t.classList.contains('rb-vis-dl')) {
        const tipo = String(docId).startsWith('legacy') ? 'acta_visada_legacy' : 'acta_visada';
        const doc = await recepcionBienesService.getDocumento(row.id, tipo, docId);
        const a = document.createElement('a');
        a.href = `data:application/pdf;base64,${toRawBase64(doc.contenido_base64)}`;
        const base = String(acta.numero_acta || `ACTA-RB-${d.numero_orden || row.id}`).replace(/\.pdf$/i, '');
        a.download = t.dataset.name?.endsWith('.pdf')
          ? String(t.dataset.name).replace(/\.pdf$/i, '-VISADA.pdf')
          : `${base}-VISADA.pdf`;
        a.click();
        return;
      }
      if (t.classList.contains('rb-vis-reemp')) {
        const file = modalEl.querySelector('#rbActaVisadaFile')?.files?.[0];
        if (!file) {
          showErr(modalEl, 'Seleccione primero el nuevo PDF y luego pulse Reemplazar');
          return;
        }
        await adjuntarVisada({ reemplazarId: docId });
        return;
      }
      if (t.classList.contains('rb-vis-del')) {
        modalEl.querySelector('#rbVisDelBox')?.remove();
        const host = modalEl.querySelector('#rbActaVisadaLista');
        host.insertAdjacentHTML('beforebegin', `
          <div class="alert alert-warning" id="rbVisDelBox">
            <div class="fw-semibold mb-1">¿Confirma eliminar esta versión del acta visada?</div>
            <label class="form-label small">Motivo *</label>
            <textarea class="form-control form-control-sm mb-2" id="rbVisDelMotivo" rows="2"></textarea>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-sm btn-danger" id="rbVisDelOk">Confirmar eliminación</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" id="rbVisDelCancel">Cancelar</button>
            </div>
          </div>`);
        const box = modalEl.querySelector('#rbVisDelBox');
        box.querySelector('#rbVisDelCancel').onclick = () => box.remove();
        box.querySelector('#rbVisDelOk').onclick = async () => {
          const motivo = box.querySelector('#rbVisDelMotivo').value.trim();
          if (!motivo) {
            showErr(modalEl, 'El motivo es obligatorio');
            return;
          }
          try {
            await recepcionBienesService.eliminarActaVisada(row.id, acta.id, docId, { motivo });
            box.remove();
            await refreshVisados();
            onDone?.();
          } catch (e) {
            showErr(modalEl, e.message || 'No se pudo eliminar');
          }
        };
        return;
      }
    } catch (e) {
      showErr(modalEl, e.message || 'Operación no disponible');
    }
  });

  modalEl.querySelector('#rbActaEliminar')?.addEventListener('click', async () => {
    hideErr(modalEl);
    try {
      const acta = actaEditRef.current;
      if (!acta) throw new Error('No hay acta');
      const motivo = modalEl.querySelector('#rbActaObs').value.trim() || 'Eliminación de borrador de acta';
      await recepcionBienesService.eliminarActa(row.id, acta.id, { motivo });
      modal.hide();
      onDone?.();
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo eliminar');
    }
  });
}

/** Compat: Generar proyecto de Acta → modal Registrar acta */
export async function openGenerarActaModal(row, { onDone } = {}) {
  return openRegistrarActaModal(row, { onDone });
}

/** 2. Registrar recepción — modal grande con 3 pestañas */
export async function openRegistrarRecepcionModal(row, { onDone } = {}) {
  const detRes = await recepcionBienesService.getDetalle(row.id);
  const d = detRes?.data || detRes;
  if (d.puede_registrar_recepcion === false) {
    const { modalEl } = showModal(`
      <div class="modal fade" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Registrar recepción</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <div class="alert alert-warning mb-0">${esc(d.puede_registrar_motivo || 'La entrega ya fue recibida completamente y no admite otra recepción.')}</div>
        </div>
        <div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button></div>
      </div></div></div>`);
    return modalEl;
  }
  const hoy = toCalendarIso(new Date()) || new Date().toISOString().slice(0, 10);
  const responsableDefault = currentUserName() || d.responsable || '';

  let guiasDraft = [];
  let docsDraft = [];

  const paintGuias = (host) => {
    if (!guiasDraft.length) {
      host.innerHTML = '<p class="text-muted small mb-2">No hay guías agregadas.</p>';
      return;
    }
    host.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <thead><tr><th>#</th><th>Número</th><th>Fecha</th><th>Transportista</th><th>PDF</th><th></th></tr></thead>
          <tbody>
            ${guiasDraft.map((g, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${esc(g.numero_guia)}</td>
                <td>${esc(g.fecha_guia || '—')}</td>
                <td>${esc(g.transportista || '—')}</td>
                <td class="small">${esc(g.documento_nombre || '—')}</td>
                <td class="text-nowrap">
                  <button type="button" class="btn btn-sm btn-outline-secondary rb-guia-edit" data-i="${i}">Editar</button>
                  <button type="button" class="btn btn-sm btn-outline-danger rb-guia-del" data-i="${i}">Eliminar</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    host.querySelectorAll('.rb-guia-del').forEach((btn) => {
      btn.onclick = () => {
        guiasDraft.splice(Number(btn.dataset.i), 1);
        paintGuias(host);
      };
    });
    host.querySelectorAll('.rb-guia-edit').forEach((btn) => {
      btn.onclick = () => fillGuiaForm(Number(btn.dataset.i));
    });
  };

  const paintDocs = (host) => {
    if (!docsDraft.length) {
      host.innerHTML = '<p class="text-muted small mb-2">No hay documentos técnicos.</p>';
      return;
    }
    host.innerHTML = `
      <ul class="list-group list-group-flush">
        ${docsDraft.map((doc, i) => `
          <li class="list-group-item d-flex justify-content-between align-items-center px-0">
            <span class="small"><span class="badge bg-light text-dark border me-1">${esc(doc.tipo)}</span>${esc(doc.nombre)}</span>
            <button type="button" class="btn btn-sm btn-outline-danger rb-doc-del" data-i="${i}">Quitar</button>
          </li>`).join('')}
      </ul>`;
    host.querySelectorAll('.rb-doc-del').forEach((btn) => {
      btn.onclick = () => {
        docsDraft.splice(Number(btn.dataset.i), 1);
        paintDocs(host);
      };
    });
  };

  const { modalEl, modal } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h5 class="modal-title mb-0">Registrar recepción · OC ${esc(d.numero_orden || d.orden_id)}</h5>
              <div class="small text-muted">${esc(d.proveedor_razon_social || '')} · Monto OC ${esc(fmtMonto(d.monto_total, d.moneda))} · Emisión ${esc(fmtFecha(d.fecha_emision || d.fecha_orden))}</div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-danger d-none" id="rbModalErr"></div>
            <ul class="nav nav-tabs" role="tablist">
              <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#rbTabRec" type="button">Recepción</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rbTabGuias" type="button">Guías de Remisión</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rbTabDocs" type="button">Documentos Técnicos</button></li>
            </ul>
            <div class="tab-content border border-top-0 p-3">
              <div class="tab-pane fade show active" id="rbTabRec">
                <div class="row g-2">
                  <div class="col-md-4">
                    <label class="form-label">Fecha de recepción *</label>
                    <input type="date" class="form-control" id="rbFechaRec" value="${hoy}">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Responsable *</label>
                    <input type="text" class="form-control" id="rbResponsable" value="${esc(responsableDefault)}">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Monto a liquidar *</label>
                    <input type="number" step="0.01" min="0" class="form-control" id="rbMonto"
                      value="${esc(String(Number(d.monto_total || 0) - Number(d.monto_a_liquidar || 0)))}">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Estado físico *</label>
                    <div class="d-flex flex-wrap gap-3 mt-1">
                      <div class="form-check">
                        <input class="form-check-input" type="radio" name="rbEstadoFisico" id="rbConforme" value="CONFORME" checked>
                        <label class="form-check-label" for="rbConforme">Recepción conforme</label>
                      </div>
                      <div class="form-check">
                        <input class="form-check-input" type="radio" name="rbEstadoFisico" id="rbObservada" value="OBSERVADA">
                        <label class="form-check-label" for="rbObservada">Recepción observada</label>
                      </div>
                    </div>
                  </div>
                  <div class="col-md-6 d-none" id="rbMotivoWrap">
                    <label class="form-label">Motivo de observación *</label>
                    <select class="form-select" id="rbMotivoObs">
                      <option value="">Seleccione…</option>
                      <option value="faltante de cantidad">Faltante de cantidad</option>
                      <option value="defecto">Defecto</option>
                      <option value="daño">Daño</option>
                      <option value="producto diferente">Producto diferente</option>
                      <option value="documentación incompleta">Documentación incompleta</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div class="col-12">
                    <label class="form-label">Observaciones</label>
                    <textarea class="form-control" id="rbObs" rows="3" placeholder="Detalle faltantes, defectos o diferencias…"></textarea>
                  </div>
                </div>
              </div>
              <div class="tab-pane fade" id="rbTabGuias">
                <div class="border rounded p-2 mb-3 bg-light">
                  <div class="row g-2 align-items-end">
                    <div class="col-md-3">
                      <label class="form-label">N.° guía *</label>
                      <input type="text" class="form-control form-control-sm" id="rbGuiaNum">
                    </div>
                    <div class="col-md-2">
                      <label class="form-label">Fecha</label>
                      <input type="date" class="form-control form-control-sm" id="rbGuiaFecha" value="${hoy}">
                    </div>
                    <div class="col-md-3">
                      <label class="form-label">Transportista</label>
                      <input type="text" class="form-control form-control-sm" id="rbGuiaTrans">
                    </div>
                    <div class="col-md-3">
                      <label class="form-label">Archivo PDF</label>
                      <input type="file" class="form-control form-control-sm" id="rbGuiaFile" accept="application/pdf,.pdf">
                    </div>
                    <div class="col-md-1">
                      <button type="button" class="btn btn-sm btn-primary w-100" id="rbGuiaAdd">Agregar</button>
                    </div>
                  </div>
                  <input type="hidden" id="rbGuiaEditIdx" value="">
                </div>
                <div id="rbGuiasList"></div>
              </div>
              <div class="tab-pane fade" id="rbTabDocs">
                <p class="small text-muted">Documentos heredados de cotización (consulta en Ver expediente). Aquí adjunte documentos presentados en la entrega.</p>
                <div class="border rounded p-2 mb-3 bg-light">
                  <div class="row g-2 align-items-end">
                    <div class="col-md-3">
                      <label class="form-label">Tipo</label>
                      <select class="form-select form-select-sm" id="rbDocTipo">
                        <option value="CERTIFICADO">Certificado</option>
                        <option value="PROTOCOLO">Protocolo</option>
                        <option value="GUIA">Guía</option>
                        <option value="MANUAL">Manual</option>
                        <option value="GARANTIA">Garantía</option>
                        <option value="FICHA_TECNICA">Ficha técnica</option>
                        <option value="OTROS">Otros</option>
                      </select>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Archivo</label>
                      <input type="file" class="form-control form-control-sm" id="rbDocFile"
                        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*">
                    </div>
                    <div class="col-md-3">
                      <button type="button" class="btn btn-sm btn-primary w-100" id="rbDocAdd">Adjuntar</button>
                    </div>
                  </div>
                </div>
                <div id="rbDocsList"></div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="rbRecSave">
              <span>Guardar recepción</span>
              <span class="spinner-border spinner-border-sm d-none" id="rbRecSpin"></span>
            </button>
          </div>
        </div>
      </div>
    </div>`);

  const guiasHost = modalEl.querySelector('#rbGuiasList');
  const docsHost = modalEl.querySelector('#rbDocsList');
  paintGuias(guiasHost);
  paintDocs(docsHost);

  const syncMotivo = () => {
    const obs = modalEl.querySelector('input[name="rbEstadoFisico"]:checked')?.value === 'OBSERVADA';
    modalEl.querySelector('#rbMotivoWrap')?.classList.toggle('d-none', !obs);
  };
  modalEl.querySelectorAll('input[name="rbEstadoFisico"]').forEach((el) => {
    el.addEventListener('change', syncMotivo);
  });
  syncMotivo();

  function fillGuiaForm(idx) {
    const g = guiasDraft[idx];
    if (!g) return;
    modalEl.querySelector('#rbGuiaEditIdx').value = String(idx);
    modalEl.querySelector('#rbGuiaNum').value = g.numero_guia || '';
    modalEl.querySelector('#rbGuiaFecha').value = g.fecha_guia || hoy;
    modalEl.querySelector('#rbGuiaTrans').value = g.transportista || '';
    modalEl.querySelector('#rbGuiaAdd').textContent = 'Actualizar';
  }

  modalEl.querySelector('#rbGuiaAdd').onclick = async () => {
    hideErr(modalEl);
    try {
      const numero = modalEl.querySelector('#rbGuiaNum').value.trim();
      if (!numero) throw new Error('Ingrese el número de guía');
      if (guiasDraft.some((g, i) => {
        const editIdx = modalEl.querySelector('#rbGuiaEditIdx').value;
        if (editIdx !== '' && Number(editIdx) === i) return false;
        return String(g.numero_guia).toUpperCase() === numero.toUpperCase();
      })) {
        throw new Error('Guía duplicada en el borrador (mismo número)');
      }
      const fecha = modalEl.querySelector('#rbGuiaFecha').value || hoy;
      const transportista = modalEl.querySelector('#rbGuiaTrans').value.trim();
      const file = modalEl.querySelector('#rbGuiaFile').files?.[0];
      let documento_nombre = null;
      let documento_mime = null;
      let documento_base64 = null;
      if (file) {
        if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
          throw new Error('La guía debe ser PDF');
        }
        documento_nombre = file.name;
        documento_mime = file.type || 'application/pdf';
        documento_base64 = toRawBase64(await fileToBase64(file));
      }
      const editIdx = modalEl.querySelector('#rbGuiaEditIdx').value;
      const entry = {
        numero_guia: numero,
        fecha_guia: fecha,
        transportista,
        documento_nombre,
        documento_mime,
        documento_base64,
      };
      if (editIdx !== '') {
        const prev = guiasDraft[Number(editIdx)] || {};
        guiasDraft[Number(editIdx)] = {
          ...prev,
          ...entry,
          documento_nombre: documento_nombre || prev.documento_nombre,
          documento_mime: documento_mime || prev.documento_mime,
          documento_base64: documento_base64 || prev.documento_base64,
        };
      } else {
        guiasDraft.push(entry);
      }
      modalEl.querySelector('#rbGuiaNum').value = '';
      modalEl.querySelector('#rbGuiaTrans').value = '';
      modalEl.querySelector('#rbGuiaFile').value = '';
      modalEl.querySelector('#rbGuiaEditIdx').value = '';
      modalEl.querySelector('#rbGuiaAdd').textContent = 'Agregar';
      paintGuias(guiasHost);
    } catch (e) {
      showErr(modalEl, e.message || 'Error en guía');
    }
  };

  modalEl.querySelector('#rbDocAdd').onclick = async () => {
    hideErr(modalEl);
    try {
      const file = modalEl.querySelector('#rbDocFile').files?.[0];
      if (!file) throw new Error('Seleccione un archivo');
      const tipo = modalEl.querySelector('#rbDocTipo').value;
      const base64 = toRawBase64(await fileToBase64(file));
      docsDraft.push({
        tipo,
        nombre: file.name,
        mime_type: file.type || 'application/pdf',
        contenido_base64: base64,
      });
      modalEl.querySelector('#rbDocFile').value = '';
      paintDocs(docsHost);
    } catch (e) {
      showErr(modalEl, e.message || 'Error al adjuntar');
    }
  };

  modalEl.querySelector('#rbRecSave').onclick = async () => {
    hideErr(modalEl);
    const btn = modalEl.querySelector('#rbRecSave');
    const spin = modalEl.querySelector('#rbRecSpin');
    try {
      const fecha = modalEl.querySelector('#rbFechaRec').value;
      const responsable = modalEl.querySelector('#rbResponsable').value.trim();
      const monto = Number(modalEl.querySelector('#rbMonto').value);
      const observaciones = modalEl.querySelector('#rbObs').value.trim();
      const estadoFisico = modalEl.querySelector('input[name="rbEstadoFisico"]:checked')?.value || 'CONFORME';
      const motivoObservacion = modalEl.querySelector('#rbMotivoObs')?.value || '';
      if (!fecha) throw new Error('Fecha de recepción obligatoria');
      if (!responsable) throw new Error('Responsable obligatorio');
      if (!guiasDraft.length) throw new Error('Agregue al menos una Guía de Remisión');
      if (estadoFisico === 'OBSERVADA' && !motivoObservacion) {
        throw new Error('Seleccione el motivo de la recepción observada');
      }
      if (estadoFisico === 'OBSERVADA' && !observaciones) {
        throw new Error('Detalle la observación (faltantes, defectos o diferencias)');
      }
      const fechaCheck = validateFechaRecepcionVsEmision(fecha, d.fecha_emision || d.fecha_orden);
      if (!fechaCheck.ok) {
        throw new Error(fechaCheck.message);
      }
      spin.classList.remove('d-none');
      btn.disabled = true;
      await recepcionBienesService.registrarRecepcion(row.id, {
        fecha_recepcion: toCalendarIso(fecha) || fecha,
        fecha_recepcion_guia: toCalendarIso(fecha) || fecha,
        fecha_entrega_almacen: toCalendarIso(fecha) || fecha,
        responsable,
        monto_liquidar: monto,
        observaciones,
        motivo_observacion: motivoObservacion || null,
        estado_fisico: estadoFisico,
        recepcion_observada: estadoFisico === 'OBSERVADA',
        recepcion_conforme: estadoFisico === 'CONFORME',
        guias: guiasDraft,
        documentos_tecnicos: docsDraft,
        idempotency_key: `ui-rec-${row.id}-${guiasDraft[0].numero_guia}-${fecha}`,
      });
      modal.hide();
      onDone?.();
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo guardar la recepción');
    } finally {
      spin.classList.add('d-none');
      btn.disabled = false;
    }
  };
}

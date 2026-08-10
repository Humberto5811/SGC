/**
 * Modal «Ver expediente» — Registro de Órdenes (consulta integral OD40).
 * Pestañas: Resumen · Ítems · Entregas (ítem×entrega) · Documentos · Notificación · Recepciones · Historial.
 */
import { ordenesContratacionService } from '../services/ordenesContratacionService.js';
import { adjuntosService } from '../services/adjuntosService.js';
import { openBase64Document, previewAdjuntoById } from './documentViewer.js';
import { fmtMonto, fmtFecha, fmtFechaHora, getOrdenEdicionAcciones } from './ordenesUtils.js';
import { showTrazabilidadModal } from '../views/requerimiento/reqShared.js';

const API_BASE = '/api';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function authHeaders() {
  try {
    const t = localStorage.getItem('token') || localStorage.getItem('authToken') || '';
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch (_) { return {}; }
}

function ensureRoot() {
  let el = document.getElementById('roExpModalRoot');
  if (!el) {
    el = document.createElement('div');
    el.id = 'roExpModalRoot';
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

function showErr(modalEl, msg) {
  const err = modalEl.querySelector('#roExpErr');
  if (!err) return;
  err.textContent = msg || 'Error';
  err.classList.remove('d-none');
}

function kv(label, value) {
  return `<div class="col-md-4 col-lg-3 mb-2">
    <div class="text-muted" style="font-size:9px">${esc(label)}</div>
    <div style="font-size:11px;font-weight:600">${value == null || value === '' ? '—' : value}</div>
  </div>`;
}

function docsTable(rows) {
  if (!rows?.length) return '<p class="text-muted small mb-0">Sin documentos</p>';
  return `<div class="table-responsive"><table class="table table-sm table-bordered mb-0" style="font-size:11px;font-family:Arial,sans-serif">
    <thead class="table-light"><tr>
      <th>Documento</th><th>Tipo</th><th>Origen</th><th>Versión</th><th>Fecha</th><th></th>
    </tr></thead>
    <tbody>${rows.map((d) => `
      <tr>
        <td>${esc(d.nombre || d.nombre_archivo || '—')}</td>
        <td>${esc(d.tipo || d.tipo_documento || '—')}</td>
        <td>${esc(d.origen || '—')}</td>
        <td>${esc(d.version ?? '—')}</td>
        <td class="text-nowrap">${esc(fmtFecha(d.fecha || d.created_at || d.subido_at))}</td>
        <td class="text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-primary ro-exp-doc"
            data-kind="${esc(d.kind || '')}"
            data-id="${esc(d.documentoId || d.id || '')}"
            data-cot="${esc(d.cotizacion_id || '')}"
            data-ref="${esc(d.ref || d.preview_ref || '')}"
            data-name="${esc(d.nombre || 'documento')}"
            ${d.previewDisponible === false ? 'disabled title="Vista no disponible"' : ''}>Ver</button>
        </td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

async function openDoc(btn, data) {
  const kind = btn.dataset.kind;
  const id = btn.dataset.id;
  const name = btn.dataset.name || 'documento';
  if (!id && kind !== 'cotizacion') {
    throw new Error('Documento sin identificador válido');
  }
  if (kind === 'adjunto' && id) {
    await previewAdjuntoById(id, name);
    return;
  }
  if (kind === 'ccp' && data?.resumen?.requerimiento_id) {
    const resp = await ordenesContratacionService.getCcpFirmado(data.resumen.requerimiento_id, true);
    const doc = resp?.data || resp;
    if (!doc?.contenido_base64) throw new Error('CCP sin contenido');
    openBase64Document({
      nombre: doc.nombre_archivo || name,
      mime_type: doc.mime_type || 'application/pdf',
      contenido_base64: doc.contenido_base64,
    });
    return;
  }
  if (kind === 'cotizacion') {
    const cotId = btn.dataset.cot;
    let ref = btn.dataset.ref || '';
    // Normalizar refs legacy al contrato del portal analista
    if (ref === 'anexo05a_firmado' || ref === 'anexo_tecnico_firmado') ref = 'anexo05a';
    if (ref === 'anexo05b_firmado' || ref === 'anexo_economico_firmado') ref = 'anexo05b';
    if (!cotId || !ref) throw new Error('Referencia de cotización incompleta');
    const url = `${API_BASE}/contrataciones/portal-analista/cotizaciones/${cotId}/documento/${encodeURIComponent(ref)}/ver`;
    const res = await fetch(url, { headers: { ...authHeaders() } });
    if (res.status === 403) throw new Error('No tiene permiso para ver este documento (403)');
    if (res.status === 404) throw new Error('Documento no encontrado (404)');
    if (!res.ok) throw new Error(`No se pudo abrir el documento (${res.status})`);
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    window.open(obj, '_blank');
    setTimeout(() => URL.revokeObjectURL(obj), 60_000);
    return;
  }
  if (kind === 'orden' && data?.resumen?.orden_id && id) {
    const res = await ordenesContratacionService.getDocumento(data.resumen.orden_id, id, true);
    const doc = res?.data || res;
    if (!doc?.contenido_base64) throw new Error('Documento sin contenido');
    openBase64Document({
      nombre: doc.nombre_archivo || name,
      mime_type: doc.mime_type || 'application/pdf',
      contenido_base64: doc.contenido_base64,
    });
    return;
  }
  if (kind === 'recepcion_bien') {
    throw new Error('Abra el documento desde Recepción de Bienes (visor específico)');
  }
  throw new Error('No se pudo abrir el documento');
}

export async function openExpedienteOrdenModal(row, { onAction } = {}) {
  if (!row?.orden_id) throw new Error('La orden aún no está registrada');

  const edicionAcciones = getOrdenEdicionAcciones(row, { canManage: true });

  const resp = await ordenesContratacionService.getExpediente(row.orden_id);
  const data = resp?.data || resp;
  const r = data.resumen || {};

  let docs = [...(data.documentos || [])];
  // Defensa FE: dedupe por documentoId / fingerprint
  const seen = new Set();
  docs = docs.filter((d) => {
    const k = String(d.documentoId || d.fingerprint || `${d.origen}|${d.tipo}|${d.cotizacion_id || ''}|${d.ref || ''}|${d.id || ''}|${d.nombre || ''}`);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!docs.some((d) => d.kind === 'adjunto') && r.requerimiento_id) {
    try {
      const a = await adjuntosService.getAdjuntos(r.requerimiento_id);
      const list = Array.isArray(a) ? a : (a?.data || a?.adjuntos || []);
      docs = [
        ...list.map((x) => ({
          id: x.id,
          nombre: x.nombre_archivo || x.nombre,
          tipo: x.tipo_documento || 'Adjunto requerimiento',
          origen: 'REQUERIMIENTO',
          created_at: x.created_at,
          kind: 'adjunto',
        })),
        ...docs,
      ];
    } catch (_) { /* ok */ }
  }

  const combos = data.item_entregas || [];

  const { modalEl } = showModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content" style="font-family:Arial,sans-serif;font-size:11px">
          <div class="modal-header py-2">
            <div>
              <h5 class="modal-title mb-0" style="font-size:14px">Expediente · ${esc(r.tipo_orden || '')} ${esc(r.numero_orden || r.orden_id)}</h5>
              <div class="text-muted" style="font-size:10px">${esc(r.proveedor_razon_social || '')} · ${esc(r.requerimiento_codigo || '')}</div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-danger d-none" id="roExpErr"></div>
            <ul class="nav nav-tabs" role="tablist" style="font-size:11px">
              <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#roExpRes" type="button">Resumen</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#roExpIt" type="button">Ítems</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#roExpEnt" type="button">Entregas</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#roExpDoc" type="button">Documentos</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#roExpNot" type="button">Notificación</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#roExpRec" type="button">Recepciones</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#roExpHist" type="button">Historial</button></li>
            </ul>
            <div class="tab-content border border-top-0 p-3">
              <div class="tab-pane fade show active" id="roExpRes">
                <div class="row g-2">
                  ${kv('N.° requerimiento', esc(r.requerimiento_codigo))}
                  ${kv('Pedido SIGAMEF', esc(r.pedido_sigamef))}
                  ${kv('CCP', esc(r.codigo_ccp))}
                  ${kv('N.° orden', esc(`${r.tipo_orden || ''} ${r.numero_orden || ''}`.trim()))}
                  ${kv('Tipo de orden', esc(r.tipo_orden))}
                  ${kv('Fecha de emisión', esc(fmtFecha(r.fecha_emision || r.fecha_orden)))}
                  ${kv('Proveedor', esc(r.proveedor_razon_social))}
                  ${kv('RUC', esc(r.proveedor_ruc))}
                  ${kv('Monto total', esc(fmtMonto(r.monto_total, r.moneda)))}
                  ${kv('Moneda', esc(r.moneda))}
                  ${kv('Estado', esc(r.estado))}
                  ${kv('Fecha de notificación', esc(fmtFecha(r.fecha_notificacion)))}
                  ${kv('Confirmación proveedor', esc(fmtFechaHora(r.fecha_confirmacion)))}
                  ${kv('Condición de inicio del plazo', esc(r.condicion_inicio_label || r.condicion_inicio))}
                  ${kv('Fecha efectiva de inicio', esc(r.fecha_efectiva_inicio ? fmtFecha(r.fecha_efectiva_inicio) : 'Pendiente'))}
                  ${kv('Plazo de entrega', esc(r.plazo_entrega_label || (r.plazo_entrega ? `${r.plazo_entrega} días` : '—')))}
                  ${kv('Fecha máxima', esc(r.fecha_maxima ? fmtFecha(r.fecha_maxima) : 'Pendiente'))}
                  ${kv('Centro', esc(r.centro))}
                  ${kv('Área Usuaria', esc(r.area_usuaria))}
                  ${kv('Tipo de proceso', esc(r.tipo_proceso))}
                  ${kv('Contrato', esc(r.numero_contrato))}
                  ${kv('Lugar de entrega', esc(r.lugar_entrega))}
                </div>
              </div>
              <div class="tab-pane fade" id="roExpIt">
                <div class="table-responsive">
                  <table class="table table-sm table-bordered" style="font-size:11px">
                    <thead class="table-light"><tr>
                      <th>Código SIGAMEF</th><th>Descripción</th><th>U.M.</th>
                      <th class="text-end">Cant.</th><th class="text-end">P.U.</th><th class="text-end">Total</th>
                      <th>Específica</th><th>Centro</th><th>Centro de costo</th><th>Pedido SIGAMEF</th>
                    </tr></thead>
                    <tbody>
                      ${(data.items || []).length
    ? (data.items || []).map((it) => `
                          <tr>
                            <td>${esc(it.codigo_sigamef || it.codigo || '—')}</td>
                            <td>${esc(it.descripcion || '—')}</td>
                            <td>${esc(it.unidad_medida || it.um || '—')}</td>
                            <td class="text-end">${esc(it.cantidad)}</td>
                            <td class="text-end">${esc(fmtMonto(it.precio_unitario))}</td>
                            <td class="text-end">${esc(fmtMonto(it.precio_total))}</td>
                            <td>${esc(it.especifica || it.especifica_gasto || '—')}</td>
                            <td>${esc(it.centro || '—')}</td>
                            <td>${esc(it.centro_costo || '—')}</td>
                            <td>${esc(it.pedido_sigamef || '—')}</td>
                          </tr>`).join('')
    : '<tr><td colspan="10" class="text-muted text-center">Sin ítems</td></tr>'}
                    </tbody>
                  </table>
                </div>
              </div>
              <div class="tab-pane fade" id="roExpEnt">
                <div class="table-responsive">
                  <table class="table table-sm table-bordered" style="font-size:11px">
                    <thead class="table-light"><tr>
                      <th>Código SIGAMEF</th><th>Descripción</th>
                      <th class="text-end">Cant.</th><th class="text-end">P.U.</th><th class="text-end">Total</th>
                      <th>Entrega</th><th>Inicio del plazo</th><th>Fecha efectiva</th>
                      <th>Plazo</th><th>Fecha máxima</th><th>Lugar</th>
                    </tr></thead>
                    <tbody>
                      ${combos.length
    ? combos.map((e) => `
                          <tr>
                            <td>${esc(e.codigo_sigamef || '—')}</td>
                            <td>${esc(e.descripcion || '—')}</td>
                            <td class="text-end">${esc(e.cantidad)}</td>
                            <td class="text-end">${esc(fmtMonto(e.precio_unitario))}</td>
                            <td class="text-end">${esc(fmtMonto(e.precio_total))}</td>
                            <td><strong>${esc(e.etiqueta_entrega || '—')}</strong></td>
                            <td>${esc(e.condicion_inicio_label || e.evento_inicio_plazo || '—')}</td>
                            <td>${esc(e.fecha_efectiva ? fmtFecha(e.fecha_efectiva) : (e.pendiente_motivo || 'Pendiente'))}</td>
                            <td>${esc(e.plazo_label || (e.dias_plazo != null ? `${e.dias_plazo} días` : '—'))}</td>
                            <td>${esc(e.fecha_maxima ? fmtFecha(e.fecha_maxima) : 'Pendiente')}</td>
                            <td>${esc(e.lugar_entrega || '—')}</td>
                          </tr>`).join('')
    : '<tr><td colspan="11" class="text-muted text-center">Sin entregas</td></tr>'}
                    </tbody>
                  </table>
                </div>
              </div>
              <div class="tab-pane fade" id="roExpDoc">${docsTable(docs)}</div>
              <div class="tab-pane fade" id="roExpNot">
                <div class="row g-2 mb-3">
                  ${kv('Fecha de notificación', esc(fmtFecha(data.notificacion?.fecha_notificacion || r.fecha_notificacion)))}
                  ${kv('Fecha y hora', esc(fmtFechaHora(data.notificacion?.enviado_at || r.fecha_notificacion_at)))}
                  ${kv('Correo', esc(data.notificacion?.correo_destino))}
                  ${kv('Estado', esc(data.notificacion?.estado))}
                  ${kv('Confirmación', esc(fmtFechaHora(data.notificacion?.confirmado_at)))}
                  ${kv('Fuente', esc(data.notificacion?.fecha_notificacion_fuente || r.fecha_notificacion_fuente || '—'))}
                </div>
                <div class="table-responsive">
                  <table class="table table-sm table-striped" style="font-size:11px">
                    <thead><tr>
                      <th>Intento</th><th>Fecha y hora</th><th>Destino</th><th>Estado</th><th>Por</th><th>Error</th>
                    </tr></thead>
                    <tbody>
                      ${(data.notificacion?.envios || []).length
    ? (data.notificacion.envios || []).map((e) => `
                          <tr>
                            <td>${esc(e.intento ?? e.id)}</td>
                            <td>${esc(fmtFechaHora(e.enviado_at))}</td>
                            <td>${esc(e.correo_destino)}</td>
                            <td>${esc(e.estado)}</td>
                            <td>${esc(e.enviado_por)}</td>
                            <td>${esc(e.error || '—')}</td>
                          </tr>`).join('')
    : '<tr><td colspan="6" class="text-muted text-center">Sin envíos</td></tr>'}
                    </tbody>
                  </table>
                </div>
              </div>
              <div class="tab-pane fade" id="roExpRec">
                <div class="table-responsive">
                  <table class="table table-sm table-bordered" style="font-size:11px">
                    <thead class="table-light"><tr>
                      <th>Fecha</th><th>Entrega</th><th>Monto</th><th>Estado físico</th>
                      <th>Estado</th><th>Responsable</th><th>Obs.</th>
                    </tr></thead>
                    <tbody>
                      ${(data.recepciones || []).length
    ? (data.recepciones || []).map((x) => `
                          <tr>
                            <td>${esc(fmtFecha(x.fecha_recepcion_guia || x.fecha_entrega_almacen))}</td>
                            <td>${esc(x.etiqueta_entrega || x.numero_entrega || '—')}</td>
                            <td class="text-end">${esc(fmtMonto(x.monto_liquidar))}</td>
                            <td>${esc(x.estado_fisico || '—')}</td>
                            <td>${esc(x.estado_interno || x.estado_global || '—')}</td>
                            <td>${esc(x.responsable || '—')}</td>
                            <td>${esc(x.observaciones || '—')}</td>
                          </tr>`).join('')
    : '<tr><td colspan="7" class="text-muted text-center">Sin recepciones asociadas</td></tr>'}
                    </tbody>
                  </table>
                </div>
              </div>
              <div class="tab-pane fade" id="roExpHist">
                <p class="text-muted mb-2" style="font-size:10px">
                  Historial operativo local de la orden. Use el botón «Trazabilidad completa» del pie para el recorrido integral del expediente.
                </p>
                <div class="table-responsive">
                  <table class="table table-sm table-striped" style="font-size:11px">
                    <thead><tr>
                      <th>Fecha</th><th>Actor</th><th>Rol</th><th>Acción</th>
                      <th>Estado ant.</th><th>Estado nuevo</th><th>Observación</th>
                    </tr></thead>
                    <tbody>
                      ${(data.historial || data.historial_orden || []).length
    ? (data.historial || data.historial_orden || []).map((e) => `
                          <tr>
                            <td class="text-nowrap">${esc(fmtFechaHora(e.creado_at || e.created_at))}</td>
                            <td>${esc(e.usuario || e.usuario_id || '—')}</td>
                            <td>${esc(e.rol || '—')}</td>
                            <td>${esc(e.tipo_evento || e.tipo || '—')}</td>
                            <td>${esc(e.estado_anterior || '—')}</td>
                            <td>${esc(e.estado_nuevo || '—')}</td>
                            <td>${esc(e.observacion || e.motivo || '—')}</td>
                          </tr>`).join('')
    : '<tr><td colspan="7" class="text-muted text-center">Sin eventos de orden</td></tr>'}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer py-2">
            ${edicionAcciones.length
    ? `<div class="dropdown">
                <button type="button" class="btn btn-outline-warning btn-sm dropdown-toggle" data-bs-toggle="dropdown" id="roExpEditar">
                  <i class="bi bi-pencil"></i> Editar
                </button>
                <ul class="dropdown-menu dropdown-menu-end" style="font-size:11px">
                  ${edicionAcciones.map((it) => `
                    <li><button type="button" class="dropdown-item ro-exp-edit-act" data-act="${esc(it.act)}"
                      ${it.disabled ? 'disabled' : ''} title="${esc(it.title || '')}">
                      <i class="bi ${esc(it.icon || 'bi-pencil')}"></i> ${esc(it.label)}
                    </button></li>`).join('')}
                </ul>
              </div>`
    : `<button type="button" class="btn btn-outline-secondary btn-sm" disabled
        title="No editable: el estado actual de la orden (${esc(r.estado_global || r.estado || '')}) no admite modificación directa">
        <i class="bi bi-pencil"></i> Editar
      </button>`}
            ${r.requerimiento_id
    ? '<button type="button" class="btn btn-outline-primary btn-sm" id="roExpTraza">Trazabilidad completa</button>'
    : ''}
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`);

  modalEl.querySelectorAll('.ro-exp-doc').forEach((btn) => {
    btn.onclick = async () => {
      try {
        btn.disabled = true;
        await openDoc(btn, data);
      } catch (e) {
        showErr(modalEl, e.message || 'Error al abrir documento');
      } finally {
        btn.disabled = false;
      }
    };
  });

  modalEl.querySelector('#roExpTraza')?.addEventListener('click', async () => {
    try {
      await showTrazabilidadModal(r.requerimiento_id);
    } catch (e) {
      showErr(modalEl, e.message || 'No se pudo abrir la trazabilidad');
    }
  });

  modalEl.querySelectorAll('.ro-exp-edit-act').forEach((btn) => {
    btn.onclick = async () => {
      const act = btn.dataset.act;
      if (!act || !onAction) return;
      // eslint-disable-next-line no-undef
      bootstrap.Modal.getInstance(modalEl)?.hide();
      try {
        await onAction(act);
      } catch (e) {
        // El propio handler de la acción (registroOrdenesView) ya maneja sus errores.
      }
    };
  });
}

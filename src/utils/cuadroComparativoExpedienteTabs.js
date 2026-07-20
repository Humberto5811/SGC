/**
 * RC8.5-C / C1 — Contenido de pestañas del expediente integral (solo lectura).
 * Compone datos de APIs/helpers existentes; no crea formularios editables.
 */
import { historialHtml } from '../views/requerimiento/reqShared.js';
import {
  renderMatrizBienesHtml,
  renderResumenAdjudicacion,
  renderHistorialAdjudicacion,
  renderPanelSegundaFuente,
} from './cuadroComparativoMatriz.js';
import { renderPanelVersionado } from './cuadroComparativoVersionado.js';
import { labelCuadroEstado, badgeClassCuadro } from './cuadroComparativoUtils.js';
import { timelineModalStyles, renderTimeline } from '../services/timelineService.js';
import {
  renderExpedienteDocsTable,
  listDocsSolicitadosConfig,
  listRequisitosTecnicosConfig,
  renderDocsSolicitadosConfigTable,
  renderRequisitosTecnicosConfigTable,
  normalizeExpedienteDoc,
  dedupeDocumentos,
  ORIGEN_DOC,
} from './cuadroComparativoExpedienteDocs.js';
import {
  buildVistaCotizacionPresentada,
  renderBloqueCotizacionPresentada,
} from './cotizacionDocumentosPresentados.js';

export {
  mergeDocumentosCronologicos,
  renderExpedienteDocsTable,
  buildExpedienteDocumental,
  dedupeDocumentos,
  documentIdentityKey,
  listDocsSolicitadosConfig,
  listRequisitosTecnicosConfig,
  renderDocsSolicitadosConfigTable,
  renderRequisitosTecnicosConfigTable,
  groupDocsCotizacionPresentada,
} from './cuadroComparativoExpedienteDocs.js';

export {
  buildVistaCotizacionPresentada,
  renderBloqueCotizacionPresentada,
  countDocsPresentados,
  groupByManifiestoGrupo,
} from './cotizacionDocumentosPresentados.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  if (!iso) return '—';
  return String(iso).slice(0, 16).replace('T', ' ');
}

/** RC8.5-C3 — Documentos integrados en pestañas funcionales (sin pestaña Documentos). */
export const EXPEDIENTE_TABS = Object.freeze([
  { id: 'resumen', label: 'Resumen', icon: 'bi-info-circle' },
  { id: 'requerimientos', label: 'Requerimientos', icon: 'bi-file-earmark-text' },
  { id: 'pedidos', label: 'Pedidos SIGAMEF', icon: 'bi-cart' },
  { id: 'solicitud', label: 'Solicitud de Cotización', icon: 'bi-envelope' },
  { id: 'proveedores', label: 'Cotizaciones presentadas por proveedores', shortLabel: 'Cotizaciones', icon: 'bi-building' },
  { id: 'validaciones', label: 'Validaciones', icon: 'bi-shield-check' },
  { id: 'cuadro', label: 'Cuadro Comparativo', icon: 'bi-table' },
  { id: 'observaciones', label: 'Observaciones', icon: 'bi-chat-left-text' },
  { id: 'trazabilidad', label: 'Trazabilidad', icon: 'bi-signpost-split' },
]);

export function renderTabNav(activeId = 'resumen') {
  return `
    <ul class="nav nav-tabs flex-nowrap overflow-auto mb-3 pb-1 cc-exp-tabs" role="tablist" id="ccExpTabNav"
      style="scrollbar-width:thin;-webkit-overflow-scrolling:touch;">
      ${EXPEDIENTE_TABS.map((t) => `
        <li class="nav-item flex-shrink-0" role="presentation">
          <button class="nav-link text-nowrap py-2 px-3 ${t.id === activeId ? 'active' : ''}"
            id="ccExpTab_${t.id}" data-bs-toggle="tab" data-bs-target="#ccExpPane_${t.id}"
            type="button" role="tab">
            <i class="bi ${t.icon}"></i> <span class="d-none d-sm-inline">${esc(t.label)}</span>
            <span class="d-inline d-sm-none">${esc(t.shortLabel || t.label.split(' ')[0])}</span>
          </button>
        </li>`).join('')}
    </ul>`;
}

export function renderResumenTab({ exp, cuadro, solicitud }) {
  const estado = cuadro?.estado_cuadro || cuadro?.estado || exp?.estado_cuadro;
  return `
    <div class="alert alert-light border small py-2 mb-3">
      Expediente en <strong>solo lectura</strong>. No se permiten editar, eliminar ni agregar documentos o datos económicos.
    </div>
    <div class="row g-2 mb-3">
      <div class="col-md-3"><div class="small text-muted">Solicitud</div><strong>${esc(exp?.solicitud_codigo || solicitud?.codigo || '—')}</strong></div>
      <div class="col-md-3"><div class="small text-muted">Tipo</div><strong>${esc(exp?.tipo || cuadro?.tipo || '—')}</strong></div>
      <div class="col-md-3"><div class="small text-muted">Versión cuadro</div><strong>v${esc(cuadro?.version || exp?.version || 1)}</strong></div>
      <div class="col-md-3"><div class="small text-muted">Estado</div>
        <span class="badge bg-${esc(badgeClassCuadro(estado))}">${esc(cuadro?.estado_cuadro_label || labelCuadroEstado(estado))}</span>
      </div>
      <div class="col-12"><div class="small text-muted">Denominación</div><div>${esc(exp?.denominacion || solicitud?.denominacion || '—')}</div></div>
      <div class="col-md-4"><div class="small text-muted">Área usuaria</div><div>${esc(exp?.area_usuaria || '—')}</div></div>
      <div class="col-md-4"><div class="small text-muted">Responsable actual</div><div>${esc(exp?.responsable_actual || exp?.responsable_revision || '—')}</div></div>
      <div class="col-md-4"><div class="small text-muted">Ingreso a cuadro</div><div>${esc(fmtFecha(exp?.fecha_ingreso_cuadro || exp?.fecha_actualizacion))}</div></div>
      ${exp?.objeto || solicitud?.objeto ? `<div class="col-12"><div class="small text-muted">Objeto</div><div class="small">${esc(exp?.objeto || solicitud?.objeto)}</div></div>` : ''}
    </div>
    <h6 class="fw-bold">Requerimientos vinculados</h6>
    <ul class="small mb-0">${(exp?.requerimientos || []).map((r) => `
      <li><strong>${esc(r.codigo || '—')}</strong> — ${esc(r.descripcion || r.denominacion || '')}</li>
    `).join('') || '<li class="text-muted">Sin requerimientos</li>'}</ul>`;
}

export function renderRequerimientosTab({ reqsDetalle = [], adjuntosPorReq = {} }) {
  if (!reqsDetalle.length) {
    return '<div class="alert alert-light border small">Sin requerimientos vinculados.</div>';
  }
  return reqsDetalle.map((req) => {
    const id = req.id;
    const adj = dedupeDocumentos((adjuntosPorReq[id] || []).map((a) => normalizeExpedienteDoc(a, {
      origen: ORIGEN_DOC.REQUERIMIENTO,
      source: 'requerimiento',
      requerimiento_id: id,
      requerimiento_codigo: req.codigo || '',
    })));
    const payload = (() => {
      try {
        return typeof req.payload === 'string' ? JSON.parse(req.payload || '{}') : (req.payload || {});
      } catch (_) { return {}; }
    })();
    const tipoDoc = payload.tipo_documento || payload.formato || req.tipo || '';
    return `
      <div class="card border mb-3">
        <div class="card-header py-2 bg-light">
          <strong>${esc(req.codigo || `#${id}`)}</strong>
          <span class="small text-muted ms-2">${esc(req.denominacion || '')}</span>
          <span class="badge bg-secondary ms-2">${esc(tipoDoc || '—')}</span>
        </div>
        <div class="card-body py-2">
          <div class="row g-2 small mb-2">
            <div class="col-md-3"><span class="text-muted">Centro:</span> ${esc(req.centro || payload.centro || '—')}</div>
            <div class="col-md-3"><span class="text-muted">Área:</span> ${esc(req.area || req.area_usuaria || '—')}</div>
            <div class="col-md-3"><span class="text-muted">Estado:</span> ${esc(req.estado || req.estado_actual || '—')}</div>
            <div class="col-md-3"><span class="text-muted">Tipo:</span> ${esc(req.tipo || '—')}</div>
          </div>
          <h6 class="small fw-bold mb-1">Documentos del requerimiento</h6>
          ${renderExpedienteDocsTable(adj, { showActions: true })}
        </div>
      </div>`;
  }).join('');
}

export function renderPedidosTab({ pedidosPorReq = {} }) {
  const entries = Object.entries(pedidosPorReq);
  if (!entries.length) {
    return '<div class="alert alert-light border small">Sin pedidos SIGAMEF asociados a los requerimientos del expediente.</div>';
  }
  return entries.map(([reqKey, pedidos]) => {
    const rows = (pedidos || []).map((p) => `
      <tr>
        <td class="small">${esc(p.nro_pedido || p.codigo || p.pedido || '—')}</td>
        <td class="small">${esc(p.codigo_sigamef || p.sigamef || '—')}</td>
        <td class="small">${esc(p.centro || p.centro_costo || '—')}</td>
        <td class="small">${esc(p.sec_func || p.meta || p.meta_codigo || '—')}</td>
        <td class="small">${esc(p.especifica || p.cadena || p.cadena_presupuestal || '—')}</td>
        <td class="small">${esc(p.fuente_fto || p.fuente || '—')}</td>
        <td class="small">${esc(p.descripcion || p.denominacion || '—')}</td>
      </tr>`).join('') || '<tr><td colspan="7" class="text-muted small">Sin pedidos</td></tr>';
    return `
      <h6 class="fw-bold">Requerimiento ${esc(reqKey)}</h6>
      <table class="table table-sm table-bordered mb-3"><thead class="table-light"><tr>
        <th>Pedido SIGAMEF</th><th>Código</th><th>Centro</th><th>Meta</th>
        <th>Cadena presupuestal</th><th>Fuente</th><th>Descripción</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
  }).join('');
}

export function renderSolicitudTab({
  solicitud,
  invitados = [],
}) {
  const invRows = invitados.map((p) => `
    <tr>
      <td class="small">${esc(p.ruc || '—')}</td>
      <td class="small">${esc(p.razon_social || p.nombre || '—')}</td>
      <td class="small">${esc(p.estado || p.estado_invitacion || '—')}</td>
      <td class="small">${esc(fmtFecha(p.fecha_envio || p.enviado_at || p.created_at))}</td>
      <td class="small">${esc(p.correo || p.email || '—')}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="text-muted small">Sin proveedores invitados</td></tr>';

  const docsSolicitados = listDocsSolicitadosConfig(solicitud);
  const requisitos = listRequisitosTecnicosConfig(solicitud);

  return `
    <div class="row g-2 mb-3">
      <div class="col-md-3"><div class="small text-muted">Código SC</div><strong>${esc(solicitud?.codigo || '—')}</strong></div>
      <div class="col-md-3"><div class="small text-muted">Estado</div><div>${esc(solicitud?.estado || '—')}</div></div>
      <div class="col-md-3"><div class="small text-muted">Tipo</div><div>${esc(solicitud?.tipo || '—')}</div></div>
      <div class="col-md-3"><div class="small text-muted">Fecha</div><div>${esc(fmtFecha(solicitud?.created_at || solicitud?.fecha))}</div></div>
      <div class="col-12"><div class="small text-muted">Denominación</div><div>${esc(solicitud?.denominacion || '—')}</div></div>
    </div>
    <h6 class="fw-bold">Proveedores invitados / Constancias de envío</h6>
    <table class="table table-sm table-bordered mb-4"><thead class="table-light"><tr>
      <th>RUC</th><th>Razón social</th><th>Estado</th><th>Fecha envío</th><th>Correo</th>
    </tr></thead><tbody>${invRows}</tbody></table>

    <div class="border rounded p-3 mb-4 bg-light">
      <h6 class="fw-bold text-primary mb-1">
        <i class="bi bi-file-earmark-check"></i> A. Documentos solicitados al proveedor
      </h6>
      <p class="small text-muted mb-2">
        Configuración almacenada en la Solicitud de Cotización (Anexo 09, Anexo 10, otros, adicionales y adjuntos).
      </p>
      <div data-cc-exp-docs="solicitados">
        ${renderDocsSolicitadosConfigTable(docsSolicitados)}
      </div>
    </div>

    <div class="border rounded p-3 mb-0">
      <h6 class="fw-bold text-secondary mb-1">
        <i class="bi bi-list-check"></i> B. Requerimientos técnicos mínimos
      </h6>
      <p class="small text-muted mb-2">
        Requisitos definidos por el Analista (no inferidos a partir de documentos).
      </p>
      <div data-cc-exp-docs="requisitos">
        ${renderRequisitosTecnicosConfigTable(requisitos)}
      </div>
    </div>`;
}

/**
 * RC8.5-C4 — Misma fuente que Recepción → Cotización recibida (`getRecepcionCotizacionDetalle`).
 * @param {{ proveedores?: array, detallePorCot?: object, docsPorCot?: object, solicitud?: object }} opts
 */
export function renderProveedoresTab({
  proveedores = [],
  detallePorCot = {},
  docsPorCot = {},
  solicitud = null,
} = {}) {
  if (!proveedores.length) {
    return '<div class="alert alert-light border small">Sin cotizaciones presentadas por proveedores.</div>';
  }
  return `
    <p class="small text-muted mb-3">
      Documentación presentada por cada proveedor (solo consulta). Misma fuente documental que
      <strong>Recepción de Cotizaciones → Cotización recibida</strong>.
    </p>
    ${proveedores.map((p, idx) => {
    const cotId = p.cotizacion_id;
    let detalle = detallePorCot[cotId];
    if (!detalle && docsPorCot[cotId]) {
      detalle = {
        id: cotId,
        razon_social: p.razon_social,
        ruc: p.ruc,
        fecha_presentacion: p.fecha_presentacion,
        estado: p.estado,
        validacion_estado: p.validacion_estado,
        monto: p.monto,
        moneda: p.moneda,
        documentos: docsPorCot[cotId],
      };
    }
    const vista = buildVistaCotizacionPresentada(detalle || {
      id: cotId,
      razon_social: p.razon_social,
      ruc: p.ruc,
      fecha_presentacion: p.fecha_presentacion,
      estado: p.estado,
      validacion_estado: p.validacion_estado,
      documentos: [],
    }, { solicitud });
    // Completar generales desde fila bandeja si el detalle vino parcial
    vista.generales = {
      ...vista.generales,
      razon_social: vista.generales.razon_social || p.razon_social,
      ruc: vista.generales.ruc || p.ruc,
      fecha_presentacion: vista.generales.fecha_presentacion || p.fecha_presentacion,
      validacion_estado: vista.generales.validacion_estado || p.validacion_estado,
      estado: vista.generales.estado || p.estado,
      cotizacion_id: vista.generales.cotizacion_id || cotId,
    };
    return renderBloqueCotizacionPresentada(vista, { collapseId: `ccCotProv_${cotId || idx}` });
  }).join('')}`;
}

export function renderValidacionesTab({ proveedores = [] }) {
  // RC8.5-D1 — solo PDF (visor real). Se eliminó Detalle: fallaba por asignación AU
  // ("No tiene asignada esta validación") para Coordinador/DEC del expediente.
  const rows = proveedores.map((p) => {
    const est = String(p.validacion_estado || '').toUpperCase();
    const badge = est === 'APTO' ? 'success' : (est === 'NO_APTO' || est === 'OBSERVADO' ? 'danger' : 'secondary');
    return `
      <tr>
        <td class="small"><strong>${esc(p.razon_social)}</strong><div class="text-muted">${esc(p.ruc)}</div></td>
        <td><span class="badge bg-${badge}">${esc(p.validacion_estado || '—')}</span></td>
        <td class="small">${esc(p.validado_por || p.validacion_responsable || '—')}</td>
        <td class="small">${esc(fmtFecha(p.validado_at || p.fecha_presentacion))}</td>
        <td class="text-nowrap">
          ${p.tiene_pdf_validacion
    ? `<button type="button" class="btn btn-sm btn-outline-primary cc-exp-pdf-val" data-cot="${esc(p.cotizacion_id)}">
              <i class="bi bi-file-earmark-pdf"></i> PDF
            </button>`
    : '<span class="text-muted small">Sin PDF</span>'}
        </td>
      </tr>`;
  }).join('') || '<tr><td colspan="5" class="text-muted">Sin validaciones</td></tr>';

  return `
    <p class="small text-muted">Resultado y profesional de Validación AU. Use <strong>PDF</strong> para ver el documento firmado.</p>
    <table class="table table-sm table-bordered mb-0"><thead class="table-light"><tr>
      <th>Proveedor</th><th>Resultado</th><th>Validado por</th><th>Fecha</th><th>Documento</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderCuadroTab({ cuadro, matriz, versiones }) {
  // RC8.5-E — sin botones Ver/Descargar/Ver Firmado aquí (solo en barra superior)
  const pdfAnexo = cuadro?.tiene_pdf || cuadro?.pdf_nombre
    ? esc(cuadro.pdf_nombre || 'Anexo generado')
    : 'No generado';
  const pdfFirmado = cuadro?.tiene_pdf_firmado || cuadro?.firmado_nombre
    ? esc(cuadro.firmado_nombre || 'Firmado Coordinador')
    : 'Pendiente';
  const pdfDec = cuadro?.tiene_pdf_firmado_dec || cuadro?.firmado_dec_nombre
    ? esc(cuadro.firmado_dec_nombre || 'Firma DEC')
    : 'Pendiente';
  return `
    ${renderPanelVersionado(cuadro, versiones)}
    <h6 class="fw-bold mb-2">Matriz comparativa</h6>
    <div class="mb-3 table-responsive">${renderMatrizBienesHtml(matriz || {}, { editable: false })}</div>
    <h6 class="fw-bold mb-2">Segunda fuente</h6>
    <div class="mb-3">${renderPanelSegundaFuente(matriz || {}, { editable: false })}</div>
    <h6 class="fw-bold mb-2 mt-3">Proveedor ganador / Valor adjudicado</h6>
    ${renderResumenAdjudicacion(matriz || {}) || '<div class="alert alert-light border small mb-0">Sin adjudicación registrada.</div>'}
    ${renderHistorialAdjudicacion(matriz?.historial_adjudicacion || [])}
    <h6 class="fw-bold mb-2 mt-3">Documentos del cuadro</h6>
    <div class="small text-muted border rounded px-3 py-2 bg-light">
      <div class="row g-2">
        <div class="col-md-4"><span class="text-muted">PDF Anexo:</span> <strong>${pdfAnexo}</strong></div>
        <div class="col-md-4"><span class="text-muted">Firmado Coord:</span> <strong>${pdfFirmado}</strong></div>
        <div class="col-md-4"><span class="text-muted">Firma DEC:</span> <strong>${pdfDec}</strong></div>
      </div>
      <div class="mt-1">Use la barra de acciones superior para descargar, adjuntar o ver firmados.</div>
    </div>`;
}

export function renderDocumentosTab({ documentosCronologicos = [] }) {
  if (!documentosCronologicos.length) {
    return '<div class="alert alert-light border small">Sin documentos registrados en el expediente.</div>';
  }
  return `
    <p class="small text-muted mb-2">
      Expediente documental completo · <strong>${documentosCronologicos.length}</strong> archivo(s) único(s) ·
      orden cronológico · con categoría y origen.
    </p>
    <div data-cc-exp-docs="todos">
      ${renderExpedienteDocsTable(documentosCronologicos, { showActions: true })}
    </div>`;
}

export function renderObservacionesTab({ reqsDetalle = [] }) {
  // RC8.5-D1 — historial general institucional (payload.observaciones), sin tabla aparte del cuadro
  const bloques = reqsDetalle.map((req) => {
    const html = historialHtml(req);
    return `
      <div class="mb-3">
        <h6 class="fw-bold">${esc(req.codigo || `#${req.id}`)}</h6>
        ${html}
      </div>`;
  }).join('');

  return `
    <p class="small text-muted mb-2">
      Historial general de observaciones del expediente (mismo componente y persistencia institucional).
      Incluye observaciones emitidas desde la revisión del Cuadro Comparativo.
    </p>
    ${bloques || '<p class="small text-muted">Sin observaciones registradas.</p>'}`;
}

function extractTrazaRows(trazaData) {
  const movs = trazaData?.historialMovimientos || trazaData?.historial_movimientos || [];
  if (movs.length) {
    return movs.slice().sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0)).map((m) => ({
      fecha: m.fecha || m.fechaIngreso,
      usuario: m.usuario || m.responsable || '—',
      accion: m.accion || '—',
      estado: m.estado || m.subModulo || m.sub_modulo || m.etapa || '—',
      version: m.version || '—',
      documento: m.documento || '—',
      observacion: m.observacion || '',
    }));
  }
  const hist = trazaData?.historialEstados || trazaData?.historial_estados || [];
  return hist.slice().reverse().map((h) => ({
    fecha: h.fechaIngreso || h.fecha,
    usuario: h.usuario || '—',
    accion: h.accion || '—',
    estado: h.estadoTexto || h.estado || '—',
    version: '—',
    documento: '—',
    observacion: h.observacion || '',
  }));
}

export function renderTrazabilidadTab({ trazaData = null, reqCodigo = '' }) {
  if (!trazaData) {
    return `
      <div class="alert alert-light border small">
        No se pudo cargar la trazabilidad del requerimiento ${esc(reqCodigo || '')}.
        Use el botón inferior para abrir el visor completo.
      </div>`;
  }
  const rows = extractTrazaRows(trazaData);
  const tableRows = rows.map((r) => `
    <tr>
      <td class="small text-nowrap">${esc(fmtFecha(r.fecha))}</td>
      <td class="small">${esc(r.usuario)}</td>
      <td class="small"><span class="badge bg-secondary">${esc(String(r.accion).replace(/_/g, ' '))}</span></td>
      <td class="small">${esc(r.estado)}</td>
      <td class="small text-nowrap">${esc(r.version)}</td>
      <td class="small">${esc(r.documento)}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="text-muted small">Sin movimientos registrados</td></tr>';

  return `
    <style>${timelineModalStyles()}</style>
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
      <div class="small text-muted">
        Requerimiento: <strong>${esc(reqCodigo || trazaData.requerimiento?.codigo || '')}</strong>
        · Etapa: <strong>${esc(trazaData.subModuloActual || trazaData.estadoActualTexto || '—')}</strong>
        · Responsable: <strong>${esc(trazaData.responsableActual || '—')}</strong>
      </div>
      <small class="text-muted">${rows.length} eventos · más reciente arriba</small>
    </div>
    <div class="table-responsive mb-3" style="max-height:min(40vh,360px);overflow:auto;">
      <table class="table table-sm table-bordered table-striped mb-0">
        <thead class="table-light sticky-top">
          <tr>
            <th>Fecha</th><th>Usuario</th><th>Acción</th><th>Estado</th><th>Versión</th><th>Documento</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <h6 class="fw-bold mb-2">Línea de tiempo</h6>
    <div class="traza-modal-scroll">
      <div class="traza-timeline-wrap">${renderTimeline(trazaData)}</div>
    </div>`;
}

/* mergeDocumentosCronologicos re-exportado desde cuadroComparativoExpedienteDocs.js */

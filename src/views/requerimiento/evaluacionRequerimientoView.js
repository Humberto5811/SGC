// Evaluación de Requerimientos - Vista para aprobación por gerentes/jefes.
// Muestra el listado en la misma estructura que Registro (sin botones de tipos).
// Acciones: Editar, Imprimir, Adjuntos, Observar, Aprobar, Eliminar.
import { api } from '../../services/apiService.js';
import { authService } from '../../services/authService.js';
import { requerimientosService } from '../../services/requerimientosService.js';
import { adjuntosService } from '../../services/adjuntosService.js';
import { escapeHtml as esc } from '../../utils/escapeHtml.js';

function estadoBadgeEval(estado) {
  const e = estado || '';
  if (e === 'Observado') return `<span class="badge bg-danger">${esc(e)}</span>`;
  if (e === 'En tramite de aprobación') return `<span class="badge bg-warning text-dark">${esc(e)}</span>`;
  if (e === 'Aprobado') return `<span class="badge bg-success">${esc(e)}</span>`;
  return `<span class="badge bg-secondary">${esc(e)}</span>`;
}

let stateEval = { listaRequerimientos: [] };

function renderEvaluacionRequerimientoView() {
  return `
    <div class="container-fluid">
      <div class="mb-3">
        <h3 class="mb-1"><i class="bi bi-check-circle"></i> Evaluación de Requerimientos</h3>
        <p class="text-muted mb-0">Revise y apruebe los requerimientos en trámite de aprobación.</p>
      </div>
      <hr/>
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h5 class="mb-0"><i class="bi bi-list-check"></i> Requerimientos en evaluación</h5>
        <button id="evalReload" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
      </div>
      <div id="evalList"><div class="text-muted">Cargando…</div></div>
    </div>
    <!-- Modal Observar / Revisar -->
    <div class="modal fade" id="modalObservar" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header bg-danger text-white">
            <h5 class="modal-title" id="observarModalTitle"><i class="bi bi-exclamation-triangle"></i> Observar Requerimiento</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="observarReqId"/>
            <!-- Historial section (shown when there is history) -->
            <div id="observarHistorialSection" class="mb-3" style="display:none;">
              <h6 class="fw-bold"><i class="bi bi-clock-history"></i> Historial de evaluación</h6>
              <div id="observarHistorialBody" class="border rounded p-2 mb-2" style="max-height:300px;overflow-y:auto;"></div>
            </div>
            <!-- New observation textarea -->
            <div class="mb-3">
              <label for="observarMotivo" class="form-label fw-bold">Motivo de la observación</label>
              <textarea id="observarMotivo" class="form-control" rows="3" placeholder="Describa el motivo de la observación…"></textarea>
              <small class="text-muted">Complete este campo solo si desea observar el requerimiento.</small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-danger" id="btnGuardarObservacion"><i class="bi bi-exclamation-triangle"></i> Guardar observación</button>
            <button type="button" class="btn btn-success" id="btnAprobarDesdeModal"><i class="bi bi-check-circle"></i> Aprobar requerimiento</button>
          </div>
        </div>
      </div>
    </div>
    <!-- Modal Adjuntos Evaluación -->
    <div class="modal fade" id="modalEvalAdjuntos" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-paperclip"></i> Adjuntos del Requerimiento</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="evalAdjuntosBody">Cargando…</div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
    <!-- Modal Historial -->
    <div class="modal fade" id="modalHistorial" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-clock-history"></i> Historial de Evaluación</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="historialBody"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function loadEvaluacionList() {
  const cont = document.getElementById('evalList');
  if (!cont) return;

  try {
    const resp = await requerimientosService.listConDetalles({ pageSize: 200 });
    let rows = (resp && resp.data) || [];
    rows = rows.filter((r) => r.estado && r.estado !== 'Registrado');

    // Enrich with monto_total from payload
    rows = rows.map((r) => {
      let monto_total = 0;
      try {
        const p = JSON.parse(r.payload || '{}');
        if (p.items && Array.isArray(p.items)) {
          monto_total = p.items.reduce((sum, item) => {
            return sum + ((Number(item.precio_unitario) || 0) * (Number(item.cantidad) || 0));
          }, 0);
        }
      } catch (_) {}
      return { ...r, monto_total: Number(monto_total.toFixed(2)) };
    });

    rows.sort((a, b) => {
      const n = (r) => { const m = String(r.codigo || '').match(/(\d+)/); return m ? Number(m[1]) : (r.id || 0); };
      return n(a) - n(b);
    });

    stateEval.listaRequerimientos = rows;

    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay requerimientos en evaluación.</div>';
      return;
    }

    cont.innerHTML = `
      <style>
        #evalList .eval-table,
        #evalList .eval-table th,
        #evalList .eval-table td { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; font-weight: normal; }
        #evalList .eval-table .badge { font-weight: normal !important; font-size: 10pt !important; }
      </style>
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle eval-table">
          <thead class="table-light">
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Código SIGAMEF</th>
              <th>Descripción del bien</th>
              <th>Área usuaria</th>
              <th>Centro</th>
              <th>Monto Total</th>
              <th>CMN N°</th>
              <th>Estado</th>
              <th style="width: 200px;" class="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              let codigosSigamef = '<span class="text-muted small">—</span>';
              let descripcionesBien = '<span class="text-muted small">—</span>';
              try {
                const p = JSON.parse(r.payload || '{}');
                if (p.items && Array.isArray(p.items) && p.items.length) {
                  codigosSigamef = p.items.map(it => esc(it.item_bien || '')).join(', ');
                  descripcionesBien = p.items.map(it => esc(it.nombre_item || '')).join(', ');
                }
              } catch (_) {}
              return `
              <tr>
                <td>${esc(r.codigo || ('#' + r.id))}</td>
                <td><span class="badge bg-secondary text-uppercase" style="font-size: 0.65rem;">${esc(r.tipo)}</span></td>
                <td class="small">${codigosSigamef}</td>
                <td class="small">${descripcionesBien}</td>
                <td>${esc(r.area || '')}</td>
                <td>${esc(r.responsable || r.centro_nombre || '')}</td>
                <td class="text-end">
                  <strong>${r.monto_total ? 'S/. ' + r.monto_total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'S/. 0.00'}</strong>
                </td>
                <td class="text-center">${r.cmn ? esc(r.cmn) : '<span class="text-muted">—</span>'}</td>
                <td>${estadoBadgeEval(r.estado)}</td>
                <td class="text-center" style="white-space: nowrap;">
                  <button class="btn btn-xs btn-outline-primary eval-edit" data-id="${r.id}" title="Editar" style="padding: 2px 6px; font-size: 11px;"><i class="bi bi-pencil" style="font-size: 11px;"></i></button>
                  <button class="btn btn-xs btn-outline-dark eval-print" data-id="${r.id}" title="Imprimir" style="padding: 2px 6px; font-size: 11px;"><i class="bi bi-printer" style="font-size: 11px;"></i></button>
                  <button class="btn btn-xs btn-outline-info eval-attach" data-id="${r.id}" title="Adjuntos" style="padding: 2px 6px; font-size: 11px;"><i class="bi bi-paperclip" style="font-size: 11px;"></i></button>
                  <button class="btn btn-xs btn-danger eval-observar" data-id="${r.id}" title="Revisar / Observar" style="padding: 2px 6px; font-size: 11px;"><i class="bi bi-exclamation-triangle" style="font-size: 11px;"></i></button>
                  ${r.estado === 'Aprobado' ? `<button class="btn btn-xs btn-success" disabled title="Aprobado" style="padding: 2px 6px; font-size: 11px;"><i class="bi bi-check-circle-fill" style="font-size: 11px;"></i></button>` : `<button class="btn btn-xs btn-outline-success eval-approve" data-id="${r.id}" title="Aprobar" style="padding: 2px 6px; font-size: 11px;"><i class="bi bi-check-circle" style="font-size: 11px;"></i></button>`}
                  <button class="btn btn-xs btn-outline-danger eval-del" data-id="${r.id}" title="Eliminar" style="padding: 2px 6px; font-size: 11px;"><i class="bi bi-trash" style="font-size: 11px;"></i></button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    // Bind events
    cont.querySelectorAll('.eval-edit').forEach((b) => b.onclick = () => evalEdit(b.dataset.id));
    cont.querySelectorAll('.eval-print').forEach((b) => b.onclick = () => evalPrint(b.dataset.id));
    cont.querySelectorAll('.eval-attach').forEach((b) => b.onclick = () => evalAdjuntos(b.dataset.id));
    cont.querySelectorAll('.eval-observar').forEach((b) => b.onclick = () => openObservarModal(b.dataset.id));
    cont.querySelectorAll('.eval-approve').forEach((b) => b.onclick = () => evalAprobar(b.dataset.id));
    cont.querySelectorAll('.eval-del').forEach((b) => b.onclick = () => evalEliminar(b.dataset.id));
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error al cargar: ${esc(e.message)}</div>`;
  }
}

function evalEdit(id) {
  // Navigate to the Registro view for editing
  window.location.hash = `#/au/requerimientos/registro?edit=${id}`;
}

async function evalPrint(id) {
  // Open the print view (reuse same approach as Registro)
  try {
    const row = await requerimientosService.getById(id);
    let payload = {};
    try { payload = JSON.parse(row.payload || '{}'); } catch (e) { console.warn('[evaluacion] Payload JSON inválido:', e.message); }
    const items = payload.items || [];
    const printW = window.open('', '_blank');
    printW.document.write(`<html><head><title>Requerimiento ${esc(row.codigo || row.id)}</title>
      <style>body{font-family:Arial,sans-serif;font-size:10pt;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #000;padding:4px 6px;text-align:left}th{background:#f0f0f0}</style>
      </head><body>
      <h3>Requerimiento: ${esc(row.codigo || '#' + row.id)}</h3>
      <p><strong>Denominación:</strong> ${esc(row.denominacion)}</p>
      <p><strong>Área:</strong> ${esc(row.area)} | <strong>Responsable:</strong> ${esc(row.responsable)}</p>
      <p><strong>Estado:</strong> ${esc(row.estado)}</p>
      ${items.length ? `<table><thead><tr><th>Código</th><th>Descripción</th><th>U.M.</th><th>Cantidad</th></tr></thead><tbody>
        ${items.map(it => `<tr><td>${esc(it.item_bien)}</td><td>${esc(it.nombre_item)}</td><td>${esc(it.unidad_medida)}</td><td>${esc(it.cantidad)}</td></tr>`).join('')}
      </tbody></table>` : ''}
      </body></html>`);
    printW.document.close();
    printW.print();
  } catch (err) {
    alert('Error al imprimir: ' + err.message);
  }
}

async function evalAdjuntos(id) {
  const body = document.getElementById('evalAdjuntosBody');
  if (!body) return;
  body.innerHTML = 'Cargando…';
  const modal = new bootstrap.Modal(document.getElementById('modalEvalAdjuntos'));
  modal.show();
  try {
    const resp = await adjuntosService.getAdjuntos(id);
    const adjuntos = (resp && resp.adjuntos) || [];
    if (!adjuntos.length) {
      body.innerHTML = '<div class="alert alert-light">Sin adjuntos.</div>';
      return;
    }
    body.innerHTML = `<div class="list-group">${adjuntos.map((a) => `
      <div class="list-group-item d-flex justify-content-between align-items-center">
        <span class="eval-adj-dl" data-id="${a.id}" data-name="${esc(a.nombre_archivo)}" style="cursor:pointer;color:#0d6efd;">
          <i class="bi bi-file-earmark"></i> ${esc(a.nombre_archivo)}
          <span class="badge bg-secondary ms-2">${a.tamaño_bytes ? (a.tamaño_bytes / 1024).toFixed(1) + ' KB' : ''}</span>
        </span>
        <button class="btn btn-sm btn-outline-danger eval-adj-rm" data-id="${a.id}" data-req="${id}" title="Eliminar"><i class="bi bi-trash"></i></button>
      </div>`).join('')}</div>`;
    body.querySelectorAll('.eval-adj-dl').forEach(el => {
      el.onclick = async () => {
        try { await adjuntosService.descargarAdjunto(el.dataset.id, el.dataset.name); } catch (e) { alert(e.message); }
      };
    });
    body.querySelectorAll('.eval-adj-rm').forEach(el => {
      el.onclick = async () => {
        if (!confirm('¿Eliminar este adjunto?')) return;
        try {
          await adjuntosService.eliminarAdjunto(el.dataset.id);
          evalAdjuntos(el.dataset.req);
        } catch (e) { alert(e.message); }
      };
    });
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

async function openObservarModal(id) {
  document.getElementById('observarReqId').value = id;
  document.getElementById('observarMotivo').value = '';

  const histSection = document.getElementById('observarHistorialSection');
  const histBody = document.getElementById('observarHistorialBody');
  const titleEl = document.getElementById('observarModalTitle');

  // Fetch the requerimiento to get historial
  try {
    const row = await requerimientosService.getById(id);
    let payload = {};
    try { payload = JSON.parse(row.payload || '{}'); } catch (_) {}
    const historial = payload.historial_evaluacion || [];

    if (historial.length) {
      titleEl.innerHTML = '<i class="bi bi-clock-history"></i> Revisar y Evaluar Requerimiento';
      histSection.style.display = 'block';
      histBody.innerHTML = historial.map(h => {
        const fecha = h.fecha ? new Date(h.fecha).toLocaleString('es-PE') : '';
        if (h.tipo === 'observacion') {
          return `<div class="alert alert-danger py-1 px-2 mb-1 small">
            <strong><i class="bi bi-exclamation-triangle"></i> Observación</strong> (${esc(fecha)} - ${esc(h.usuario || 'Gerente')}):<br/>
            ${esc(h.motivo)}
          </div>`;
        } else if (h.tipo === 'subsanacion') {
          return `<div class="alert alert-info py-1 px-2 mb-1 small">
            <strong><i class="bi bi-reply"></i> Subsanación</strong> (${esc(fecha)} - ${esc(h.usuario || 'Asistente')}):<br/>
            ${esc(h.respuesta)}
          </div>`;
        } else if (h.tipo === 'aprobacion') {
          return `<div class="alert alert-success py-1 px-2 mb-1 small">
            <strong><i class="bi bi-check-circle"></i> Aprobación</strong> (${esc(fecha)} - ${esc(h.usuario || '')})
          </div>`;
        }
        return '';
      }).join('');
    } else {
      titleEl.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Observar Requerimiento';
      histSection.style.display = 'none';
      histBody.innerHTML = '';
    }
  } catch (err) {
    titleEl.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Observar Requerimiento';
    histSection.style.display = 'none';
    histBody.innerHTML = '';
  }

  const modal = new bootstrap.Modal(document.getElementById('modalObservar'));
  modal.show();
}

async function guardarObservacion() {
  const id = document.getElementById('observarReqId').value;
  const motivo = (document.getElementById('observarMotivo').value || '').trim();
  if (!motivo) { alert('Ingrese el motivo de la observación.'); return; }

  const user = authService.getCurrentUser();
  try {
    const res = await api.put(`/requerimientos/${id}/observar`, {
      motivo,
      usuario: user ? user.nombre : '',
    });
    if (res && res.success) {
      bootstrap.Modal.getInstance(document.getElementById('modalObservar')).hide();
      alert('Observación guardada. El requerimiento fue observado.');
      loadEvaluacionList();
    } else {
      alert('Error al guardar observación.');
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function evalAprobar(id) {
  // Redirect to the Observar modal so gerente can review historial first
  openObservarModal(id);
}

async function aprobarDesdeModal() {
  const id = document.getElementById('observarReqId').value;
  if (!id) return;
  if (!confirm('¿Aprobar este requerimiento?')) return;
  const user = authService.getCurrentUser();
  try {
    const res = await api.put(`/requerimientos/${id}/aprobar-evaluacion`, {
      usuario: user ? user.nombre : '',
    });
    if (res && res.success) {
      bootstrap.Modal.getInstance(document.getElementById('modalObservar')).hide();
      alert('Requerimiento aprobado correctamente.');
      loadEvaluacionList();
    } else {
      alert('Error al aprobar.');
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function evalEliminar(id) {
  if (!confirm('¿Eliminar este requerimiento? Esta acción no se puede deshacer.')) return;
  try {
    await requerimientosService.remove(id);
    loadEvaluacionList();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function initEvaluacionRequerimientoView() {
  const reload = document.getElementById('evalReload');
  if (reload) reload.onclick = loadEvaluacionList;

  const btnObs = document.getElementById('btnGuardarObservacion');
  if (btnObs) btnObs.onclick = guardarObservacion;

  const btnAprobarModal = document.getElementById('btnAprobarDesdeModal');
  if (btnAprobarModal) btnAprobarModal.onclick = aprobarDesdeModal;

  loadEvaluacionList();
}

export { renderEvaluacionRequerimientoView, initEvaluacionRequerimientoView };

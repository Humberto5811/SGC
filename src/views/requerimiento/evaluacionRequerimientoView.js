// Evaluación de Requerimientos - Vista para aprobación por jefes
import { api } from '../../services/apiService.js';
import { authService } from '../../services/authService.js';
import { requerimientosService } from '../../services/requerimientosService.js';
import { adjuntosService } from '../../services/adjuntosService.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let stateEval = {
  listaRequerimientos: [],
  requerimientoActual: null,
};

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
      <div id="evalDetail" style="display:none;" class="mt-4 p-3 border rounded bg-light">
        <button id="evalBack" class="btn btn-sm btn-outline-secondary mb-3"><i class="bi bi-arrow-left"></i> Volver</button>
        <div id="evalDetailContent"></div>
      </div>
    </div>
  `;
}

async function loadEvaluacionList() {
  const cont = document.getElementById('evalList');
  if (!cont) return;

  try {
    // Cargar solo requerimientos en "En tramite de aprobación"
    const resp = await requerimientosService.list({ pageSize: 200 });
    let rows = (resp && resp.data) || [];
    
    // Filtrar solo los que están en "En tramite de aprobación"
    rows = rows.filter((r) => r.estado === 'En tramite de aprobación');
    
    stateEval.listaRequerimientos = rows;

    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay requerimientos en evaluación.</div>';
      return;
    }

    cont.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle">
          <thead class="table-light">
            <tr><th>Código</th><th>Denominación</th><th>Área usuaria</th><th>Responsable</th><th>Estado</th><th class="text-end">Acciones</th></tr>
          </thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td>${esc(r.codigo || ('#' + r.id))}</td>
                <td>${esc(r.denominacion || '')}</td>
                <td>${esc(r.area || '')}</td>
                <td>${esc(r.responsable || '')}</td>
                <td><span class="badge bg-warning text-dark">${esc(r.estado)}</span></td>
                <td class="text-end text-nowrap">
                  <button class="btn btn-sm btn-outline-primary eval-review" data-id="${r.id}" title="Revisar"><i class="bi bi-eye"></i></button>
                  <button class="btn btn-sm btn-outline-success eval-approve" data-id="${r.id}" title="Aprobar"><i class="bi bi-check2-circle"></i></button>
                  <button class="btn btn-sm btn-outline-danger eval-reject" data-id="${r.id}" title="Rechazar"><i class="bi bi-x-circle"></i></button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    cont.querySelectorAll('.eval-review').forEach((b) => b.onclick = () => reviewRequerimiento(b.dataset.id));
    cont.querySelectorAll('.eval-approve').forEach((b) => b.onclick = () => approveRequerimiento(b.dataset.id));
    cont.querySelectorAll('.eval-reject').forEach((b) => b.onclick = () => rejectRequerimiento(b.dataset.id));
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error al cargar: ${esc(e.message)}</div>`;
  }
}

async function reviewRequerimiento(requerimientoId) {
  try {
    const row = await requerimientosService.getById(requerimientoId);
    stateEval.requerimientoActual = row;

    // Cargar adjuntos
    let adjuntos = [];
    try {
      const adjResp = await adjuntosService.getAdjuntos(requerimientoId);
      adjuntos = (adjResp && adjResp.adjuntos) || [];
    } catch (_) {}

    let payload = {};
    try {
      payload = JSON.parse(row.payload || '{}');
    } catch (_) {}

    const adjuntosHTML = adjuntos.length ? `
      <div class="mb-3">
        <h6>Archivos Adjuntos</h6>
        <div class="list-group">
          ${adjuntos.map((a) => `
            <button type="button" class="list-group-item list-group-item-action adj-item" data-id="${a.id}" data-name="${esc(a.nombre_archivo)}">
              <i class="bi bi-file-earmark"></i> ${esc(a.nombre_archivo)} 
              <span class="badge bg-secondary float-end">${a.tamaño_bytes ? (a.tamaño_bytes / 1024).toFixed(1) + ' KB' : ''}</span>
            </button>`).join('')}
        </div>
      </div>
    ` : '<div class="alert alert-light">Sin archivos adjuntos.</div>';

    const detalleHTML = `
      <div class="mb-3">
        <h5>${esc(row.codigo || 'Requerimiento')}</h5>
        <p class="text-muted mb-2">${esc(row.denominacion)}</p>
        <div class="row mb-3">
          <div class="col-md-6"><strong>Área:</strong> ${esc(row.area)}</div>
          <div class="col-md-6"><strong>Responsable:</strong> ${esc(row.responsable)}</div>
        </div>
        <div class="row mb-3">
          <div class="col-12"><strong>Objetivo:</strong> ${esc(payload.objetivo || '')}</div>
        </div>
        <div class="row mb-3">
          <div class="col-12"><strong>Finalidad:</strong> ${esc(payload.finalidad || '')}</div>
        </div>
      </div>
      ${adjuntosHTML}
      <div class="alert alert-info">
        <strong>Instrucciones:</strong> Revise la documentación adjunta. 
        Si toda está correcta, haga clic en "Aprobar". Si hay problemas, haga clic en "Rechazar" para devolver al usuario.
      </div>
    `;

    document.getElementById('evalDetailContent').innerHTML = detalleHTML;
    document.getElementById('evalList').style.display = 'none';
    document.getElementById('evalDetail').style.display = 'block';

    // Eventos de adjuntos
    document.querySelectorAll('.adj-item').forEach((b) => {
      b.onclick = async () => {
        try {
          await adjuntosService.descargarAdjunto(b.dataset.id, b.dataset.name);
        } catch (err) {
          alert('Error al descargar: ' + err.message);
        }
      };
    });
  } catch (err) {
    alert('Error al revisar: ' + err.message);
  }
}

async function approveRequerimiento(requerimientoId) {
  if (!confirm('¿Aprobar este requerimiento?')) return;

  try {
    const res = await api.put(`/requerimientos/${requerimientoId}`, { estado: 'Aprobado' });
    if (res && res.success) {
      alert('Requerimiento aprobado correctamente.');
      backToEvaluacionList();
      loadEvaluacionList();
    } else {
      alert('Error al aprobar');
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function rejectRequerimiento(requerimientoId) {
  const motivo = prompt('¿Por qué rechaza este requerimiento?');
  if (!motivo) return;

  try {
    const res = await api.put(`/requerimientos/${requerimientoId}`, { 
      estado: 'Rechazado',
      observaciones: motivo
    });
    if (res && res.success) {
      alert('Requerimiento rechazado. El usuario debe corregir y resubmitir.');
      backToEvaluacionList();
      loadEvaluacionList();
    } else {
      alert('Error al rechazar');
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function backToEvaluacionList() {
  document.getElementById('evalList').style.display = 'block';
  document.getElementById('evalDetail').style.display = 'none';
  stateEval.requerimientoActual = null;
}

function initEvaluacionRequerimientoView() {
  const back = document.getElementById('evalBack');
  if (back) back.onclick = backToEvaluacionList;

  const reload = document.getElementById('evalReload');
  if (reload) reload.onclick = loadEvaluacionList;

  loadEvaluacionList();
}

export { renderEvaluacionRequerimientoView, initEvaluacionRequerimientoView };
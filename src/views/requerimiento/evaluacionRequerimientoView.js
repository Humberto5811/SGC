// Evaluación de Requerimientos — listado de requerimientos derivados al gerente.
// Reutiliza la estructura del listado de Registro (mismas columnas) y agrega el
// ciclo de observaciones/subsanaciones. Solo muestra requerimientos cuyo estado
// es distinto de "Registrado" (es decir, los que el usuario ya envió a aprobación).
import { authService } from '../../services/authService.js';
import { requerimientosService } from '../../services/requerimientosService.js';
import { reqShared, estadoBadge, addObservacion, ultimaObservacion, todasObservaciones, historialHtml, showTextModal } from './reqShared.js';
import { printRequerimiento, manageAdjuntos, cargarContadorAdjuntos, openRequerimiento } from './registroRequerimientoView.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let lastEvalRows = [];

function renderEvaluacionRequerimientoView() {
  return `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-check-circle"></i> Evaluación de Requerimientos</h3>
          <p class="text-muted mb-0">Revise, observe o apruebe los requerimientos enviados a aprobación.</p>
        </div>
        <button id="evalReload" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
      </div>
      <hr/>
      <div id="evalList"><div class="text-muted">Cargando…</div></div>
    </div>
  `;
}

async function loadEvaluacionList() {
  const cont = document.getElementById('evalList');
  if (!cont) return;
  try {
    const resp = await requerimientosService.listConDetalles({ pageSize: 200 });
    let rows = (resp && resp.data) || [];

    // Calcular monto_total desde el payload (precio_unitario × cantidad).
    rows = rows.map((r) => {
      let monto_total = 0;
      try {
        const payload = JSON.parse(r.payload || '{}');
        if (Array.isArray(payload.items)) {
          monto_total = payload.items.reduce((sum, it) =>
            sum + ((Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0)), 0);
        }
      } catch (_) {}
      return { ...r, monto_total: Number(monto_total.toFixed(2)) };
    });

    // Solo los que ya fueron enviados a aprobación (cualquier estado distinto de "Registrado").
    rows = rows.filter((r) => String(r.estado || 'Registrado') !== 'Registrado');

    rows = rows.slice().sort((a, b) => {
      const getNum = (r) => {
        if (r && r.codigo) { const m = String(r.codigo).match(/(\d+)/); if (m) return Number(m[1]); }
        return Number(r && r.id) || 0;
      };
      return getNum(a) - getNum(b);
    });
    lastEvalRows = rows;

    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay requerimientos en evaluación.</div>';
      return;
    }

    cont.innerHTML = `
      <style>
        #evalList .req-list-table,
        #evalList .req-list-table th,
        #evalList .req-list-table td { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; font-weight: normal; }
        #evalList .req-list-table .badge { font-weight: normal !important; font-size: 10pt !important; }
        #evalList .req-list-table strong { font-weight: normal; }
      </style>
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle req-list-table">
          <thead class="table-light">
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Código SIGAMEF</th>
              <th>Descripción del bien</th>
              <th>Área usuaria</th>
              <th>Centro</th>
              <th class="text-center">Monto Total</th>
              <th class="text-center">CMN N°</th>
              <th>Estado</th>
              <th style="width: 180px;" class="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              let codigosSigamef = '<span class="text-muted small">—</span>';
              let descripcionesBien = '<span class="text-muted small">—</span>';
              try {
                const p = JSON.parse(r.payload || '{}');
                if (Array.isArray(p.items) && p.items.length) {
                  codigosSigamef = p.items.map((it) => esc(it.item_bien || '')).join(', ');
                  descripcionesBien = p.items.map((it) => esc(it.nombre_item || '')).join(', ');
                }
              } catch (_) {}
              const enTramite = /tr[aá]mite/i.test(String(r.estado || ''));
              const observado = /observ/i.test(String(r.estado || ''));
              const aprobado = /aprobad/i.test(String(r.estado || ''));
              const style = 'padding: 2px 6px; font-size: 11px;';
              const observarBtn = `<button class="btn btn-xs ${aprobado ? 'btn-outline-secondary' : 'btn-danger'} eval-observar" data-id="${r.id}" title="${aprobado ? 'Ver observaciones' : 'Observar'}" style="${style}" ${(enTramite || observado || aprobado) ? '' : 'disabled'}><i class="bi bi-chat-left-dots" style="font-size: 11px;"></i></button>`;
              const aprobarBtn = aprobado
                ? `<button class="btn btn-xs btn-success" data-id="${r.id}" title="Aprobado" style="${style}" disabled><i class="bi bi-check-circle-fill" style="font-size: 11px;"></i></button>`
                : `<button class="btn btn-xs btn-outline-success eval-approve" data-id="${r.id}" title="Aprobar" style="${style}" ${enTramite ? '' : 'disabled'}><i class="bi bi-check-circle" style="font-size: 11px;"></i></button>`;
              return `
              <tr>
                <td>${esc(r.codigo || ('#' + r.id))}</td>
                <td><span class="badge bg-secondary text-uppercase" style="font-size: 0.65rem;">${esc(r.tipo)}</span></td>
                <td class="small">${codigosSigamef}</td>
                <td class="small">${descripcionesBien}</td>
                <td>${esc(r.area || '')}</td>
                <td>${esc(r.responsable || r.centro_nombre || '')}</td>
                <td class="text-center">${r.monto_total ? 'S/. ' + r.monto_total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'S/. 0.00'}</td>
                <td class="text-center">${r.cmn ? esc(r.cmn) : '<span class="text-muted">—</span>'}</td>
                <td>${estadoBadge(r.estado)}</td>
                <td class="text-center" style="white-space: nowrap;">
                  <button class="btn btn-xs btn-outline-primary eval-edit" data-id="${r.id}" title="Editar" style="${style}" ${aprobado ? 'disabled' : ''}><i class="bi bi-pencil" style="font-size: 11px;"></i></button>
                  <button class="btn btn-xs btn-outline-dark eval-print" data-id="${r.id}" title="Documento" style="${style}"><i class="bi bi-printer" style="font-size: 11px;"></i></button>
                  <button class="btn btn-xs btn-outline-info eval-attach" data-id="${r.id}" title="Adjuntos" style="${style}"><i class="bi bi-paperclip" style="font-size: 11px;"></i> <span class="badge bg-info adjunto-count-${r.id}" style="font-size: 9px; padding: 1px 4px;">0</span></button>
                  ${observarBtn}
                  ${aprobarBtn}
                  <button class="btn btn-xs btn-outline-danger eval-del" data-id="${r.id}" title="Eliminar" style="${style}" ${aprobado ? 'disabled' : ''}><i class="bi bi-trash" style="font-size: 11px;"></i></button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    cont.querySelectorAll('.eval-edit').forEach((b) => b.onclick = () => editarRequerimiento(b.dataset.id));
    cont.querySelectorAll('.eval-print').forEach((b) => b.onclick = () => printRequerimiento(b.dataset.id));
    cont.querySelectorAll('.eval-attach').forEach((b) => b.onclick = () => manageAdjuntos(b.dataset.id));
    cont.querySelectorAll('.eval-observar').forEach((b) => b.onclick = () => observarRequerimiento(b.dataset.id));
    cont.querySelectorAll('.eval-approve').forEach((b) => b.onclick = () => approveRequerimiento(b.dataset.id));
    cont.querySelectorAll('.eval-del').forEach((b) => b.onclick = () => eliminarRequerimiento(b.dataset.id));

    rows.forEach((r) => cargarContadorAdjuntos(r.id));
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error al cargar: ${esc(e.message)}</div>`;
  }
}

// Editar el requerimiento dentro de la vista de Evaluación (sin navegar a Registro).
function editarRequerimiento(id) {
  const cont = document.getElementById('evalList');
  if (!cont) return;
  const wrapper = cont.closest('.container-fluid');
  if (!wrapper) return;
  wrapper.innerHTML = `
    <div class="mb-2">
      <h5 class="mb-0"><i class="bi bi-check-circle"></i> Evaluación — Edición de Requerimiento</h5>
    </div>
    <div id="reqRoot"></div>
  `;
  reqShared.editingFromEvaluacion = true;
  reqShared.onBackToEvaluacion = () => {
    reqShared.editingFromEvaluacion = false;
    reqShared.onBackToEvaluacion = null;
    const tmp = document.createElement('div');
    tmp.innerHTML = renderEvaluacionRequerimientoView();
    const cf = tmp.querySelector('.container-fluid');
    wrapper.innerHTML = cf ? cf.innerHTML : tmp.innerHTML;
    initEvaluacionRequerimientoView();
  };
  openRequerimiento(id);
}

async function observarRequerimiento(id) {
  const req = (lastEvalRows || []).find((x) => String(x.id) === String(id));
  if (!req) return;
  const allObs = todasObservaciones(req);
  const aprobado = /aprobad/i.test(String(req.estado || ''));
  if (aprobado) {
    await showTextModal({
      title: 'Historial de observaciones',
      historyHtml: historialHtml(allObs),
      readOnlyMode: true,
    });
    return;
  }
  const motivo = await showTextModal({
    title: 'Observar requerimiento',
    historyHtml: historialHtml(allObs),
    label: 'Nueva observación',
    placeholder: 'Indique el motivo de la observación…',
    buttonText: 'Guardar observación',
    buttonClass: 'btn-danger',
  });
  if (!motivo) return;
  try {
    const user = (authService.getCurrentUser && authService.getCurrentUser()) || {};
    await addObservacion(req, motivo, user.dni || user.usuario || 'gerente');
    loadEvaluacionList();
  } catch (e) {
    alert('Error al guardar la observación: ' + e.message);
  }
}

async function approveRequerimiento(id) {
  if (!confirm('¿Aprobar este requerimiento?')) return;
  try {
    const res = await requerimientosService.update(id, { estado: 'Aprobado' });
    if (res && res.success === false) throw new Error('No se pudo aprobar');
    loadEvaluacionList();
  } catch (e) {
    alert('Error al aprobar: ' + e.message);
  }
}

async function eliminarRequerimiento(id) {
  if (!confirm('¿Eliminar este requerimiento?')) return;
  try {
    await requerimientosService.remove(id);
    loadEvaluacionList();
  } catch (e) {
    alert('Error al eliminar: ' + e.message);
  }
}

function initEvaluacionRequerimientoView() {
  const reload = document.getElementById('evalReload');
  if (reload) reload.onclick = () => loadEvaluacionList();
  loadEvaluacionList();
}

export { renderEvaluacionRequerimientoView, initEvaluacionRequerimientoView };

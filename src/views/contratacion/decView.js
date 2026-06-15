// DEC (Documento de Evaluacion de Contrataciones)
// Muestra requerimientos visibles para DEC: Aprobado, Aprobado DEC, Observado DEC, Observado Programacion
// Acciones: Ver, Adjuntos (readOnly), Observar, Aprobar
import { authService } from '../../services/authService.js';
import { contratacionesService } from '../../services/contratacionesService.js';
import { reqShared, estadoBadge, todasObservaciones, historialHtml, showTextModal } from '../requerimiento/reqShared.js';
import { printRequerimiento, manageAdjuntos, cargarContadorAdjuntos, openRequerimiento } from '../requerimiento/registroRequerimientoView.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

let lastRows = [];

function renderDecView() {
  return `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-file-earmark-check"></i> DEC — Documento de Evaluacion de Contrataciones</h3>
          <p class="text-muted mb-0">Requermientos aprobados por el Gerente pendientes de revision DEC.</p>
        </div>
        <button id="decReload" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
      </div>
      <hr/>
      <div id="decList"><div class="text-muted">Cargando…</div></div>
    </div>
  `;
}

async function loadDecList() {
  const cont = document.getElementById('decList');
  if (!cont) return;
  try {
    const resp = await contratacionesService.listDEC({ pageSize: 200 });
    let rows = (resp && resp.data) || [];

    rows = rows.map((r) => {
      let monto_total = 0;
      try {
        const payload = JSON.parse(r.payload || '{}');
        if (r.tipo === 'servicios' && Array.isArray(payload.servicioItems)) {
          monto_total = payload.servicioItems.reduce((sum, it) => sum + (Number(it.monto) || 0), 0);
        } else if (r.tipo === 'locacion' && Array.isArray(payload.locadorItems)) {
          monto_total = payload.locadorItems.reduce((sum, it) => sum + (Number(it.monto) || 0), 0);
        } else if (Array.isArray(payload.items)) {
          monto_total = payload.items.reduce((sum, it) => sum + ((Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0)), 0);
        }
      } catch (_) {}
      return { ...r, monto_total: Number(monto_total.toFixed(2)) };
    });

    rows = rows.slice().sort((a, b) => {
      const getNum = (r) => { if (r && r.codigo) { const m = String(r.codigo).match(/(\d+)/); if (m) return Number(m[1]); } return Number(r && r.id) || 0; };
      return getNum(a) - getNum(b);
    });
    lastRows = rows;

    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay requerimientos pendientes para DEC.</div>';
      return;
    }

    const style = 'padding: 2px 6px; font-size: 11px;';
    cont.innerHTML = [
      '<div class="table-responsive">',
      '<table class="table table-sm table-hover align-middle">',
      '<thead class="table-light"><tr>',
      '<th>Codigo</th><th>Tipo</th><th>Descripcion</th><th>Area usuaria</th><th>Centro</th>',
      '<th class="text-center">Monto Total</th><th>Estado</th>',
      '<th style="width: 240px;" class="text-center">Acciones</th>',
      '</tr></thead><tbody>',
      rows.map((r) => {
        let descrip = '';
        try {
          const p = JSON.parse(r.payload || '{}');
          const items = r.tipo === 'servicios' ? (p.servicioItems || []) : r.tipo === 'locacion' ? (p.locadorItems || []) : (p.items || []);
          if (Array.isArray(items) && items.length) descrip = items.map(it => esc(it.nombre_item || '')).join(', ');
        } catch (_) {}
        const esAprobado = r.estado === 'Aprobado';
        return '<tr><td>' + esc(r.codigo || ('#' + r.id)) + '</td>' +
          '<td><span class="badge bg-secondary text-uppercase" style="font-size:0.65rem;">' + esc(r.tipo) + '</span></td>' +
          '<td class="small">' + (descrip || '<span class="text-muted small">—</span>') + '</td>' +
          '<td>' + esc(r.area || '') + '</td>' +
          '<td>' + esc(r.responsable || r.centro_nombre || '') + '</td>' +
          '<td class="text-center">' + (r.monto_total ? 'S/. ' + r.monto_total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'S/. 0.00') + '</td>' +
          '<td>' + estadoBadge(r.estado) + '</td>' +
          '<td class="text-center" style="white-space:nowrap;">' +
          '<button class="btn btn-xs btn-outline-primary dec-ver" data-id="' + r.id + '" title="Ver documento" style="' + style + '"><i class="bi bi-eye" style="font-size:11px;"></i></button> ' +
          '<button class="btn btn-xs btn-outline-info dec-attach" data-id="' + r.id + '" title="Adjuntos" style="' + style + '"><i class="bi bi-paperclip" style="font-size:11px;"></i> <span class="badge bg-info adjunto-count-' + r.id + '" style="font-size:9px;padding:1px 4px;">0</span></button> ' +
          '<button class="btn btn-xs btn-outline-danger dec-observar" data-id="' + r.id + '" title="Observar" style="' + style + '"><i class="bi bi-chat-left-dots" style="font-size:11px;"></i></button> ' +
          '<button class="btn btn-xs btn-success dec-aprobar" data-id="' + r.id + '" title="Aprobar" style="' + style + '"' + (esAprobado ? '' : ' disabled') + '><i class="bi bi-check-circle" style="font-size:11px;"></i> Aprobar</button>' +
          '</td></tr>';
      }).join(''),
      '</tbody></table></div>'
    ].join('');

    cont.querySelectorAll('.dec-ver').forEach((b) => b.onclick = () => printRequerimiento(b.dataset.id));
    cont.querySelectorAll('.dec-attach').forEach((b) => b.onclick = () => {
      manageAdjuntos(b.dataset.id, true);
    });
    cont.querySelectorAll('.dec-aprobar').forEach((b) => b.onclick = () => aprobarDec(b.dataset.id));
    cont.querySelectorAll('.dec-observar').forEach((b) => b.onclick = () => observarDec(b.dataset.id));
    rows.forEach((r) => cargarContadorAdjuntos(r.id));
  } catch (e) {
    cont.innerHTML = '<div class="alert alert-danger">Error al cargar: ' + esc(e.message) + '</div>';
  }
}

async function aprobarDec(id) {
  if (!confirm('Confirmar aprobacion desde DEC? El expediente pasara a Programacion.')) return;
  try {
    const user = (authService.getCurrentUser && authService.getCurrentUser()) || {};
    const res = await contratacionesService.aprobarDEC(id, user.dni || 'dec');
    if (res && res.success === false) throw new Error('No se pudo aprobar');
    loadDecList();
  } catch (e) {
    alert('Error al aprobar: ' + e.message);
  }
}

async function observarDec(id) {
  const req = (lastRows || []).find((x) => String(x.id) === String(id));
  if (!req) return;
  const allObs = todasObservaciones(req);
  const motivo = await showTextModal({
    title: 'Observar requerimiento desde DEC',
    historyHtml: historialHtml(allObs),
    label: 'Motivo de la observacion',
    placeholder: 'Indique el motivo de la observacion...',
    buttonText: 'Observar',
    buttonClass: 'btn-danger',
  });
  if (!motivo) return;
  try {
    const user = (authService.getCurrentUser && authService.getCurrentUser()) || {};
    await contratacionesService.observarDEC(id, motivo, user.dni || 'dec');
    loadDecList();
  } catch (e) {
    alert('Error al observar: ' + e.message);
  }
}

function initDecView() {
  const reload = document.getElementById('decReload');
  if (reload) reload.onclick = () => loadDecList();
  loadDecList();
}

export { renderDecView, initDecView };
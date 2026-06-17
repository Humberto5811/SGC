// src/views/programacion/programacionView.js
import { programacionService } from '../../services/programacionService.js';
import { authService } from '../../services/authService.js';

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

let allRows = [];
let pedidosCountMap = {};
let paquetesList = [];
let paqueteReqIds = new Set();
let selectedIds = new Set();

// ==================== RENDER ====================
export function renderProgramacionView() {
  return `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-calendar-check"></i> Programación</h3>
          <p class="text-muted mb-0">Asociar pedidos SIGAMEF y consolidar requerimientos aprobados.</p>
        </div>
        <div class="d-flex gap-2">
          <button id="progConsolidar" class="btn btn-sm btn-success" disabled>
            <i class="bi bi-box-seam"></i> Consolidar Requerimientos
          </button>
          <span id="progSeleccionados" class="badge bg-secondary align-self-center">0 seleccionados</span>
          <button id="progReload" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
        </div>
      </div>
      <hr/>
      <ul class="nav nav-tabs mb-3" id="progTabs">
        <li class="nav-item"><a class="nav-link active" href="#" data-tab="bandeja">📋 Bandeja</a></li>
        <li class="nav-item"><a class="nav-link" href="#" data-tab="paquetes">📦 Paquetes</a></li>
      </ul>
      <div id="progContent"><div class="text-muted">Cargando…</div></div>
    </div>
    <style>
      #progContent .prog-table, #progContent .prog-table th, #progContent .prog-table td {
        font-family: Arial, Helvetica, sans-serif; font-size: 10pt; font-weight: normal;
      }
      #progContent .badge { font-weight: normal !important; font-size: 10pt !important; }
      .btn-xs { padding: 1px 6px; font-size: 11px; }
    </style>
  `;
}

let currentTab = 'bandeja';

// ==================== LOAD ====================
async function loadBandeja() {
  const cont = document.getElementById('progContent');
  if (!cont) return;
  try {
    const [respReq, countMap, paqList] = await Promise.all([
      programacionService.getRequerimientos(),
      programacionService.getPedidosCount(),
      programacionService.listPaquetes(),
    ]);

    pedidosCountMap = countMap || {};
    paquetesList = (paqList && paqList.data) || [];

    paqueteReqIds = new Set();
    const paqDetailsPromises = paquetesList.map((p) => programacionService.getPaquete(p.id));
    const paqDetails = await Promise.all(paqDetailsPromises);
    paqDetails.forEach((d) => {
      if (d && d.requerimientos) {
        d.requerimientos.forEach((r) => paqueteReqIds.add(r.id));
      }
    });

    let rows = [];
    if (respReq && respReq.data) {
      rows = respReq.data;
    } else if (Array.isArray(respReq)) {
      rows = respReq;
    }

    rows = rows.filter((r) => /aprobad|programad/i.test(String(r.estado || '')));

    rows = rows.map((r) => {
      let monto_total = 0;
      try {
        const payload = JSON.parse(r.payload || '{}');
        if (r.tipo === 'servicios') {
          if (Array.isArray(payload.servicioItems)) monto_total = payload.servicioItems.reduce((s, it) => s + (Number(it.monto) || 0), 0);
        } else if (r.tipo === 'locacion') {
          if (Array.isArray(payload.locadorItems)) monto_total = payload.locadorItems.reduce((s, it) => s + (Number(it.monto) || 0), 0);
        } else {
          if (Array.isArray(payload.items)) monto_total = payload.items.reduce((s, it) => s + ((Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0)), 0);
        }
      } catch (_) {}
      return { ...r, monto_total: Number(monto_total.toFixed(2)) };
    });

    rows.sort((a, b) => {
      const n = (r) => { const m = String(r.codigo || '').match(/(\d+)/); return m ? Number(m[1]) : (r.id || 0); };
      return n(a) - n(b);
    });
    allRows = rows;

    const combinedItems = [];
    const usedPaqIds = new Set();
    for (const r of rows) {
      if (paqueteReqIds.has(r.id)) {
        for (const pd of paqDetails) {
          if (!pd || !pd.paquete) continue;
          const pId = pd.paquete.id;
          if (usedPaqIds.has(pId)) continue;
          if (pd.requerimientos.some((pr) => pr.id === r.id)) {
            combinedItems.push({ type: 'paquete', paquete: pd.paquete, detail: pd });
            usedPaqIds.add(pId);
            break;
          }
        }
      } else {
        combinedItems.push({ type: 'req', req: r });
      }
    }
    for (const pd of paqDetails) {
      if (pd && pd.paquete && !usedPaqIds.has(pd.paquete.id)) {
        combinedItems.push({ type: 'paquete', paquete: pd.paquete, detail: pd });
      }
    }

    selectedIds = new Set();

    if (!combinedItems.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay requerimientos aprobados en la bandeja.</div>';
      return;
    }

    const style = 'padding: 2px 6px; font-size: 11px;';
    cont.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle prog-table">
          <thead class="table-light">
            <tr>
              <th style="width:35px;"><input type="checkbox" id="progSelectAll" title="Seleccionar todos"></th>
              <th>Código</th>
              <th>Tipo</th>
              <th>Área Usuaria</th>
              <th>Denominación</th>
              <th class="text-center">Monto</th>
              <th>Estado</th>
              <th class="text-center">Pedidos</th>
              <th style="width:180px;" class="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${combinedItems.map((item) => {
              if (item.type === 'paquete') {
                const p = item.paquete;
                const d = item.detail;
                const cnt = d.requerimientos ? d.requerimientos.length : 0;
                const estadoBg = p.estado === 'Aprobado' ? 'bg-success' : 'bg-info';
                return `
                <tr class="table-warning" style="cursor:pointer;" data-paquete-id="${p.id}">
                  <td></td>
                  <td colspan="3"><strong>📦 ${esc(p.codigo_paquete)}</strong> <span class="badge bg-secondary">${cnt} REQ</span></td>
                  <td></td>
                  <td class="text-center">${d.resumen ? 'S/. ' + d.resumen.monto_total.toLocaleString('es-PE', { minimumFractionDigits: 2 }) : ''}</td>
                  <td><span class="badge ${estadoBg}">${esc(p.estado)}</span></td>
                  <td class="text-center">${d.pedidos ? d.pedidos.length : 0}</td>
                  <td class="text-center">
                    <button class="btn btn-xs btn-outline-info prog-paq-detail" data-id="${p.id}" title="Ver Detalle"><i class="bi bi-eye"></i></button>
                    ${p.estado === 'Pendiente' ? `<button class="btn btn-xs btn-outline-success prog-paq-approve" data-id="${p.id}" title="Aprobar"><i class="bi bi-check-circle"></i></button>` : ''}
                    ${p.estado === 'Pendiente' ? `<button class="btn btn-xs btn-outline-danger prog-paq-del" data-id="${p.id}" title="Eliminar"><i class="bi bi-trash"></i></button>` : ''}
                  </td>
                </tr>`;
              }
              const r = item.req;
              const pedCnt = pedidosCountMap[r.id] || 0;
              const inPaq = paqueteReqIds.has(r.id);
              const aprobado = /aprobad/i.test(String(r.estado || ''));
              const canSelect = aprobado && !inPaq && pedCnt > 0;
              return `
              <tr>
                <td><input type="checkbox" class="prog-select" data-id="${r.id}" ${canSelect ? '' : 'disabled'} title="${!canSelect ? (pedCnt === 0 ? 'Sin pedidos asociados' : 'Ya consolidado') : 'Seleccionar'}"></td>
                <td><strong>${esc(r.codigo || ('REQ-' + String(r.id).padStart(5, '0')))}</strong></td>
                <td><span class="badge bg-secondary text-uppercase" style="font-size:0.65rem;">${esc(r.tipo)}</span></td>
                <td>${esc(r.area || '')}</td>
                <td class="small">${esc(r.denominacion || '')}</td>
                <td class="text-center">${r.monto_total ? 'S/. ' + r.monto_total.toLocaleString('es-PE', { minimumFractionDigits: 2 }) : 'S/. 0.00'}</td>
                <td><span class="badge bg-success">${esc(r.estado)}</span></td>
                <td class="text-center">
                  ${pedCnt > 0 ? `<a href="#" class="prog-ver-pedidos text-success" data-id="${r.id}" title="Ver pedidos asociados">📎 ${pedCnt}</a>` : '<span class="text-muted small">0</span>'}
                </td>
                <td class="text-center" style="white-space:nowrap;">
                  <button class="btn btn-xs btn-success prog-add-pedido" data-id="${r.id}" title="Agregar Pedido SIGAMEF" style="${style}"><i class="bi bi-plus-circle"></i> Pedido</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    bindBandejaEvents(cont);
    updateConsolidarBtn();
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error al cargar: ${esc(e.message)}</div>`;
  }
}

function estadoBadge(estado) {
  const e = String(estado || '');
  if (/aprobad/i.test(e)) return `<span class="badge bg-success">${esc(e)}</span>`;
  if (/programad/i.test(e)) return `<span class="badge bg-primary">${esc(e)}</span>`;
  return `<span class="badge bg-secondary">${esc(e)}</span>`;
}

function bindBandejaEvents(cont) {
  const selectAll = cont.querySelector('#progSelectAll');
  if (selectAll) selectAll.onchange = () => {
    cont.querySelectorAll('.prog-select:not(:disabled)').forEach((cb) => {
      cb.checked = selectAll.checked;
      if (cb.checked) selectedIds.add(Number(cb.dataset.id));
      else selectedIds.delete(Number(cb.dataset.id));
    });
    updateConsolidarBtn();
  };

  cont.querySelectorAll('.prog-select').forEach((cb) => cb.onchange = () => {
    if (cb.checked) selectedIds.add(Number(cb.dataset.id));
    else selectedIds.delete(Number(cb.dataset.id));
    updateConsolidarBtn();
  });

  cont.querySelectorAll('.prog-add-pedido').forEach((b) => b.onclick = () => openAsociarPedidosModal(Number(b.dataset.id)));

  cont.querySelectorAll('.prog-ver-pedidos').forEach((a) => { a.onclick = (e) => { e.preventDefault(); openVerPedidosModal(Number(a.dataset.id)); }; });

  cont.querySelectorAll('.prog-paq-detail').forEach((b) => b.onclick = () => openPaqueteDetail(Number(b.dataset.id)));
  cont.querySelectorAll('.prog-paq-approve').forEach((b) => b.onclick = () => aprobarPaquete(Number(b.dataset.id)));
  cont.querySelectorAll('.prog-paq-del').forEach((b) => b.onclick = () => eliminarPaquete(Number(b.dataset.id)));
}

function updateConsolidarBtn() {
  const btn = document.getElementById('progConsolidar');
  const label = document.getElementById('progSeleccionados');
  const count = selectedIds.size;
  if (btn) btn.disabled = count < 2;
  if (label) label.textContent = `${count} seleccionados`;
}

// ==================== MODAL: ASOCIAR PEDIDOS ====================
async function openAsociarPedidosModal(requerimientoId) {
  const req = allRows.find((r) => r.id === requerimientoId);
  const reqLabel = req ? (req.codigo || 'REQ-' + String(req.id).padStart(5, '0')) : '#' + requerimientoId;

  let currentPedidos = [];
  try {
    const resp = await programacionService.getPedidos(requerimientoId);
    currentPedidos = (resp && resp.data) || [];
  } catch (_) {}

  const tempPedidos = [...currentPedidos];
  const newPedidoIds = [];

  const modal = document.createElement('div');
  modal.className = 'modal fade show d-block';
  modal.style.background = 'rgba(0,0,0,0.5)';
  modal.setAttribute('tabindex', '-1');

  function renderModal() {
    modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-success text-white">
            <h5 class="modal-title"><i class="bi bi-link-45deg"></i> Asociar Pedidos SIGAMEF — ${esc(reqLabel)}</h5>
            <button type="button" class="btn-close btn-close-white" id="closeAsociar"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label fw-bold">Buscar Pedido SIGAMEF</label>
              <div class="input-group">
                <input type="text" class="form-control" id="buscarPedidoInput" placeholder="Código, número o descripción...">
                <button class="btn btn-outline-primary" id="buscarPedidoBtn"><i class="bi bi-search"></i> Buscar</button>
              </div>
              <div id="buscarPedidoResults" class="mt-2"></div>
            </div>
            <hr/>
            <h6>Pedidos Asociados (${tempPedidos.length})</h6>
            <div id="pedidosAsociadosList">
              ${tempPedidos.length === 0 ? '<p class="text-muted small">No hay pedidos asociados.</p>' : `
                <table class="table table-sm table-bordered" style="font-size:10px; font-family:Arial;">
                  <thead class="table-light"><tr>
                    <th>Código</th><th>Año</th><th>Tipo</th><th>Nro Pedido</th><th>Centro</th>
                    <th>Descripción</th><th>Cantidad</th><th>P.Unit.</th><th>Total</th><th>Acción</th>
                  </tr></thead>
                  <tbody>
                    ${tempPedidos.map((p, i) => `
                      <tr>
                        <td>${esc(p.codigo_pedido)}</td><td>${esc(p.ano_eje)}</td><td>${esc(p.tipo)}</td>
                        <td>${esc(p.nro_pedido)}</td><td>${esc(p.centro)}</td>
                        <td class="small">${esc(p.descripcion)}</td>
                        <td class="text-end">${parseFloat(p.cant_solicitada || 0).toFixed(2)}</td>
                        <td class="text-end">${parseFloat(p.precio_unitario || 0).toFixed(2)}</td>
                        <td class="text-end">${parseFloat(p.total_item || 0).toFixed(2)}</td>
                        <td class="text-center"><button class="btn btn-xs btn-outline-danger remove-ped" data-idx="${i}" title="Eliminar"><i class="bi bi-trash"></i></button></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>`
              }
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelAsociar">Cancelar</button>
            <button class="btn btn-success" id="guardarAsociar"><i class="bi bi-save"></i> Guardar</button>
          </div>
        </div>
      </div>
    `;

    modal.querySelector('#closeAsociar').onclick = () => modal.remove();
    modal.querySelector('#cancelAsociar').onclick = () => modal.remove();

    const searchInput = modal.querySelector('#buscarPedidoInput');
    const searchBtn = modal.querySelector('#buscarPedidoBtn');
    const resultsDiv = modal.querySelector('#buscarPedidoResults');

    async function doSearch() {
      const q = searchInput.value.trim();
      if (!q) return;
      try {
        const resp = await programacionService.buscarPedido(q);
        const results = (resp && resp.data) || [];
        if (!results.length) {
          resultsDiv.innerHTML = '<p class="text-muted small">No se encontraron pedidos.</p>';
          return;
        }
        const assocIds = new Set(tempPedidos.map((p) => p.id));
        resultsDiv.innerHTML = `
          <table class="table table-sm table-bordered" style="font-size:10px; font-family:Arial;">
            <thead class="table-light"><tr>
              <th>Código</th><th>Año</th><th>Tipo</th><th>Nro</th><th>Centro</th>
              <th>Descripción</th><th>Cantidad</th><th>P.Unit.</th><th>Total</th><th></th>
            </tr></thead>
            <tbody>
              ${results.map((p) => `
                <tr>
                  <td>${esc(p.codigo_pedido)}</td><td>${esc(p.ano_eje)}</td><td>${esc(p.tipo)}</td>
                  <td>${esc(p.nro_pedido)}</td><td>${esc(p.centro)}</td>
                  <td class="small">${esc(p.descripcion)}</td>
                  <td class="text-end">${parseFloat(p.cant_solicitada || 0).toFixed(2)}</td>
                  <td class="text-end">${parseFloat(p.precio_unitario || 0).toFixed(2)}</td>
                  <td class="text-end">${parseFloat(p.total_item || 0).toFixed(2)}</td>
                  <td class="text-center">
                    ${assocIds.has(p.id) ? '<span class="text-success">✓</span>' : `<button class="btn btn-xs btn-outline-success add-ped-result" data-ped='${JSON.stringify(p).replace(/'/g, '&#39;')}' title="Agregar"><i class="bi bi-plus-circle"></i></button>`}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>`;
        resultsDiv.querySelectorAll('.add-ped-result').forEach((b) => {
          b.onclick = () => {
            const ped = JSON.parse(b.dataset.ped);
            tempPedidos.push(ped);
            newPedidoIds.push(ped.id);
            renderModal();
          };
        });
      } catch (e) {
        resultsDiv.innerHTML = `<p class="text-danger small">Error: ${esc(e.message)}</p>`;
      }
    }

    searchBtn.onclick = doSearch;
    searchInput.onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };

    modal.querySelectorAll('.remove-ped').forEach((b) => {
      b.onclick = () => {
        const idx = Number(b.dataset.idx);
        const removed = tempPedidos.splice(idx, 1)[0];
        const nIdx = newPedidoIds.indexOf(removed.id);
        if (nIdx >= 0) newPedidoIds.splice(nIdx, 1);
        renderModal();
      };
    });

    modal.querySelector('#guardarAsociar').onclick = async () => {
      try {
        for (const orig of currentPedidos) {
          if (!tempPedidos.some((tp) => tp.id === orig.id)) {
            await programacionService.eliminarAsociacion(orig.asociacion_id);
          }
        }
        if (newPedidoIds.length) {
          const user = authService.getCurrentUser();
          await programacionService.asociarPedidos({
            requerimiento_id: requerimientoId,
            pedido_ids: newPedidoIds,
            usuario: user ? (user.nombre || user.dni || '') : '',
          });
        }
        modal.remove();
        alert('✅ Pedidos asociados correctamente.');
        loadBandeja();
      } catch (e) {
        alert('❌ Error al guardar: ' + e.message);
      }
    };
  }

  renderModal();
  document.body.appendChild(modal);
}

// ==================== MODAL: VER PEDIDOS ====================
async function openVerPedidosModal(requerimientoId) {
  const req = allRows.find((r) => r.id === requerimientoId);
  const reqLabel = req ? (req.codigo || 'REQ-' + String(req.id).padStart(5, '0')) : '#' + requerimientoId;
  let pedidos = [];
  try {
    const resp = await programacionService.getPedidos(requerimientoId);
    pedidos = (resp && resp.data) || [];
  } catch (_) {}

  const modal = document.createElement('div');
  modal.className = 'modal fade show d-block';
  modal.style.background = 'rgba(0,0,0,0.5)';
  modal.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">📎 Pedidos Asociados — ${esc(reqLabel)}</h5>
          <button type="button" class="btn-close" id="closeVerPed"></button>
        </div>
        <div class="modal-body">
          ${pedidos.length === 0 ? '<p class="text-muted">No hay pedidos asociados.</p>' : `
            <table class="table table-sm table-bordered" style="font-size:10px; font-family:Arial;">
              <thead class="table-light"><tr>
                <th>Código</th><th>Año</th><th>Tipo</th><th>Nro Pedido</th><th>Centro</th><th>C. Costo</th>
                <th>Descripción</th><th>Cantidad</th><th>P.Unit.</th><th>Total</th>
              </tr></thead>
              <tbody>
                ${pedidos.map((p) => `
                  <tr>
                    <td>${esc(p.codigo_pedido)}</td><td>${esc(p.ano_eje)}</td><td>${esc(p.tipo)}</td>
                    <td>${esc(p.nro_pedido)}</td><td>${esc(p.centro)}</td><td class="small">${esc(p.centro_costo)}</td>
                    <td class="small">${esc(p.descripcion)}</td>
                    <td class="text-end">${parseFloat(p.cant_solicitada || 0).toFixed(2)}</td>
                    <td class="text-end">${parseFloat(p.precio_unitario || 0).toFixed(2)}</td>
                    <td class="text-end">${parseFloat(p.total_item || 0).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`
          }
        </div>
        <div class="modal-footer"><button class="btn btn-secondary" id="cerrarVerPed">Cerrar</button></div>
      </div>
    </div>`;
  modal.querySelector('#closeVerPed').onclick = () => modal.remove();
  modal.querySelector('#cerrarVerPed').onclick = () => modal.remove();
  document.body.appendChild(modal);
}

// ==================== CONSOLIDAR ====================
function openConsolidarModal() {
  const selReqs = allRows.filter((r) => selectedIds.has(r.id));
  if (selReqs.length < 2) { alert('Seleccione al menos 2 requerimientos.'); return; }

  for (const r of selReqs) {
    if (/anulad/i.test(String(r.estado || ''))) { alert(`${r.codigo} está anulado.`); return; }
    if (/programad/i.test(String(r.estado || ''))) { alert(`${r.codigo} ya fue programado.`); return; }
    if (paqueteReqIds.has(r.id)) { alert(`${r.codigo} ya pertenece a un paquete.`); return; }
    if (!(pedidosCountMap[r.id] > 0)) { alert(`${r.codigo} no tiene pedidos SIGAMEF asociados.`); return; }
  }

  const modal = document.createElement('div');
  modal.className = 'modal fade show d-block';
  modal.style.background = 'rgba(0,0,0,0.5)';
  modal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header bg-success text-white">
          <h5 class="modal-title"><i class="bi bi-box-seam"></i> Consolidar Requerimientos</h5>
          <button type="button" class="btn-close btn-close-white" id="closeConsolidar"></button>
        </div>
        <div class="modal-body">
          <p><strong>Requerimientos seleccionados:</strong></p>
          <ul>${selReqs.map((r) => `<li>${esc(r.codigo || 'REQ-' + String(r.id).padStart(5, '0'))} — ${esc(r.denominacion || r.area || '')}</li>`).join('')}</ul>
          <p class="fw-bold">Cantidad: ${selReqs.length} requerimientos</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelConsolidar">Cancelar</button>
          <button class="btn btn-success" id="crearPaquete"><i class="bi bi-box-seam"></i> Crear Paquete</button>
        </div>
      </div>
    </div>`;

  modal.querySelector('#closeConsolidar').onclick = () => modal.remove();
  modal.querySelector('#cancelConsolidar').onclick = () => modal.remove();
  modal.querySelector('#crearPaquete').onclick = async () => {
    try {
      const user = authService.getCurrentUser();
      const resp = await programacionService.crearPaquete({
        requerimiento_ids: [...selectedIds],
        usuario: user ? (user.nombre || user.dni || '') : '',
      });
      modal.remove();
      alert(`✅ Paquete ${resp.paquete.codigo_paquete} creado exitosamente.`);
      selectedIds = new Set();
      loadBandeja();
    } catch (e) {
      alert('❌ Error al crear paquete: ' + e.message);
    }
  };

  document.body.appendChild(modal);
}

// ==================== PAQUETE DETAIL ====================
async function openPaqueteDetail(paqueteId) {
  const cont = document.getElementById('progContent');
  if (!cont) return;
  try {
    const d = await programacionService.getPaquete(paqueteId);
    const p = d.paquete;
    const reqs = d.requerimientos || [];
    const peds = d.pedidos || [];
    const res = d.resumen || {};

    cont.innerHTML = `
      <div class="mb-3">
        <button class="btn btn-sm btn-outline-secondary" id="backToBandeja"><i class="bi bi-arrow-left"></i> Volver a Bandeja</button>
      </div>
      <div class="card mb-3">
        <div class="card-header bg-primary text-white"><h5 class="mb-0">📦 ${esc(p.codigo_paquete)}</h5></div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-3"><strong>Estado:</strong> <span class="badge ${p.estado === 'Aprobado' ? 'bg-success' : 'bg-info'}">${esc(p.estado)}</span></div>
            <div class="col-md-3"><strong>Requerimientos:</strong> ${reqs.length}</div>
            <div class="col-md-3"><strong>Fecha creación:</strong> ${p.fecha_creacion ? String(p.fecha_creacion).slice(0, 10) : ''}</div>
            <div class="col-md-3"><strong>Creado por:</strong> ${esc(p.usuario_creacion)}</div>
          </div>
          ${p.estado === 'Aprobado' ? `
          <div class="row mt-2">
            <div class="col-md-3"><strong>Aprobado por:</strong> ${esc(p.usuario_aprobacion)}</div>
            <div class="col-md-3"><strong>Fecha aprobación:</strong> ${p.fecha_aprobacion ? String(p.fecha_aprobacion).slice(0, 10) : ''}</div>
          </div>` : ''}
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-header"><h6 class="mb-0">Resumen Consolidado</h6></div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-3"><strong>Monto Total:</strong> S/. ${(res.monto_total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div>
            <div class="col-md-3"><strong>Centros:</strong> ${(res.centros || []).join(', ') || '—'}</div>
            <div class="col-md-3"><strong>Específicas:</strong> ${(res.especificas || []).join(', ') || '—'}</div>
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-header"><h6 class="mb-0">Requerimientos (${reqs.length})</h6></div>
        <div class="card-body p-0">
          <table class="table table-sm table-bordered mb-0 prog-table">
            <thead class="table-light"><tr><th>Código</th><th>Tipo</th><th>Área</th><th>Denominación</th><th>Estado</th></tr></thead>
            <tbody>
              ${reqs.map((r) => `
                <tr>
                  <td>${esc(r.codigo || 'REQ-' + String(r.id).padStart(5, '0'))}</td>
                  <td><span class="badge bg-secondary text-uppercase" style="font-size:0.65rem;">${esc(r.tipo)}</span></td>
                  <td>${esc(r.area || '')}</td>
                  <td class="small">${esc(r.denominacion || '')}</td>
                  <td>${estadoBadge(r.estado)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-header"><h6 class="mb-0">Pedidos SIGAMEF Asociados (${peds.length})</h6></div>
        <div class="card-body p-0">
          <table class="table table-sm table-bordered mb-0 prog-table">
            <thead class="table-light"><tr><th>Código</th><th>Año</th><th>Tipo</th><th>Nro</th><th>Centro</th><th>Descripción</th><th>Cantidad</th><th>P.Unit.</th><th>Total</th></tr></thead>
            <tbody>
              ${peds.map((p) => `
                <tr>
                  <td>${esc(p.codigo_pedido)}</td><td>${esc(p.ano_eje)}</td><td>${esc(p.tipo)}</td>
                  <td>${esc(p.nro_pedido)}</td><td>${esc(p.centro)}</td>
                  <td class="small">${esc(p.descripcion)}</td>
                  <td class="text-end">${parseFloat(p.cant_solicitada || 0).toFixed(2)}</td>
                  <td class="text-end">${parseFloat(p.precio_unitario || 0).toFixed(2)}</td>
                  <td class="text-end">${parseFloat(p.total_item || 0).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="d-flex gap-2">
        ${p.estado === 'Pendiente' ? `<button class="btn btn-success" id="paqApproveDetail" data-id="${p.id}"><i class="bi bi-check-circle"></i> Aprobar Paquete</button>` : ''}
        <button class="btn btn-outline-dark" id="paqPrint" data-id="${p.id}"><i class="bi bi-printer"></i> Reporte</button>
      </div>
    `;

    cont.querySelector('#backToBandeja').onclick = () => { currentTab = 'bandeja'; loadBandeja(); };
    const approveBtn = cont.querySelector('#paqApproveDetail');
    if (approveBtn) approveBtn.onclick = () => aprobarPaquete(Number(approveBtn.dataset.id));
    const printBtn = cont.querySelector('#paqPrint');
    if (printBtn) printBtn.onclick = () => printPaquete(d);
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error: ${esc(e.message)}</div>`;
  }
}

async function aprobarPaquete(id) {
  if (!confirm('¿Aprobar este paquete? Los requerimientos serán enviados a Actos Preparatorios.')) return;
  try {
    const user = authService.getCurrentUser();
    await programacionService.aprobarPaquete(id, { usuario: user ? (user.nombre || user.dni || '') : '' });
    alert('✅ Paquete aprobado exitosamente.');
    loadBandeja();
  } catch (e) {
    alert('❌ Error al aprobar: ' + e.message);
  }
}

async function eliminarPaquete(id) {
  if (!confirm('¿Eliminar este paquete? Los requerimientos quedarán libres.')) return;
  try {
    await programacionService.eliminarPaquete(id);
    alert('✅ Paquete eliminado.');
    loadBandeja();
  } catch (e) {
    alert('❌ Error al eliminar: ' + e.message);
  }
}

// ==================== PAQUETES TAB ====================
async function loadPaquetesTab() {
  const cont = document.getElementById('progContent');
  if (!cont) return;
  try {
    const resp = await programacionService.listPaquetes();
    const paquetes = (resp && resp.data) || [];
    if (!paquetes.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay paquetes creados.</div>';
      return;
    }
    cont.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-hover prog-table">
          <thead class="table-light">
            <tr><th>Código</th><th>Estado</th><th>Requerimientos</th><th>Creado por</th><th>Fecha</th><th class="text-center">Acciones</th></tr>
          </thead>
          <tbody>
            ${paquetes.map((p) => `
              <tr>
                <td><strong>${esc(p.codigo_paquete)}</strong></td>
                <td><span class="badge ${p.estado === 'Aprobado' ? 'bg-success' : 'bg-info'}">${esc(p.estado)}</span></td>
                <td>${p.cant_requerimientos || 0}</td>
                <td>${esc(p.usuario_creacion)}</td>
                <td>${p.fecha_creacion ? String(p.fecha_creacion).slice(0, 10) : ''}</td>
                <td class="text-center">
                  <button class="btn btn-xs btn-outline-info paq-tab-detail" data-id="${p.id}" title="Ver Detalle"><i class="bi bi-eye"></i></button>
                  ${p.estado === 'Pendiente' ? `<button class="btn btn-xs btn-outline-success paq-tab-approve" data-id="${p.id}" title="Aprobar"><i class="bi bi-check-circle"></i></button>` : ''}
                  ${p.estado === 'Pendiente' ? `<button class="btn btn-xs btn-outline-danger paq-tab-del" data-id="${p.id}" title="Eliminar"><i class="bi bi-trash"></i></button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
    cont.querySelectorAll('.paq-tab-detail').forEach((b) => b.onclick = () => openPaqueteDetail(Number(b.dataset.id)));
    cont.querySelectorAll('.paq-tab-approve').forEach((b) => b.onclick = () => aprobarPaquete(Number(b.dataset.id)));
    cont.querySelectorAll('.paq-tab-del').forEach((b) => b.onclick = () => eliminarPaquete(Number(b.dataset.id)));
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error: ${esc(e.message)}</div>`;
  }
}

// ==================== REPORT ====================
function printPaquete(detail) {
  const p = detail.paquete;
  const reqs = detail.requerimientos || [];
  const peds = detail.pedidos || [];
  const res = detail.resumen || {};

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Reporte ${p.codigo_paquete}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 10pt; margin: 20px; }
      h2 { text-align: center; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
      th, td { border: 1px solid #999; padding: 4px 6px; font-size: 9pt; }
      th { background: #e9ecef; text-align: left; }
      .text-end { text-align: right; }
      .section { margin-top: 15px; font-weight: bold; font-size: 11pt; }
      @media print { button { display: none; } }
    </style></head><body>
    <h2>REPORTE DE PAQUETE DE CONSOLIDACIÓN</h2>
    <p><strong>Código:</strong> ${esc(p.codigo_paquete)} &nbsp;&nbsp;
       <strong>Estado:</strong> ${esc(p.estado)} &nbsp;&nbsp;
       <strong>Fecha:</strong> ${p.fecha_creacion ? String(p.fecha_creacion).slice(0, 10) : ''} &nbsp;&nbsp;
       <strong>Creado por:</strong> ${esc(p.usuario_creacion)}</p>
    ${p.estado === 'Aprobado' ? `<p><strong>Aprobado por:</strong> ${esc(p.usuario_aprobacion)} &nbsp;&nbsp; <strong>Fecha aprobación:</strong> ${p.fecha_aprobacion ? String(p.fecha_aprobacion).slice(0, 10) : ''}</p>` : ''}

    <p class="section">Resumen Consolidado</p>
    <p><strong>Monto Total:</strong> S/. ${(res.monto_total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })} &nbsp;&nbsp;
       <strong>Centros:</strong> ${(res.centros || []).join(', ') || '—'} &nbsp;&nbsp;
       <strong>Específicas:</strong> ${(res.especificas || []).join(', ') || '—'}</p>

    <p class="section">Requerimientos (${reqs.length})</p>
    <table>
      <tr><th>Código</th><th>Tipo</th><th>Área</th><th>Denominación</th><th>Estado</th></tr>
      ${reqs.map((r) => `<tr><td>${esc(r.codigo || 'REQ-' + String(r.id).padStart(5, '0'))}</td><td>${esc(r.tipo)}</td><td>${esc(r.area)}</td><td>${esc(r.denominacion)}</td><td>${esc(r.estado)}</td></tr>`).join('')}
    </table>

    <p class="section">Pedidos SIGAMEF Asociados (${peds.length})</p>
    <table>
      <tr><th>Código</th><th>Año</th><th>Tipo</th><th>Nro</th><th>Centro</th><th>Descripción</th><th>Cant.</th><th>P.Unit.</th><th>Total</th></tr>
      ${peds.map((p) => `<tr><td>${esc(p.codigo_pedido)}</td><td>${esc(p.ano_eje)}</td><td>${esc(p.tipo)}</td><td>${esc(p.nro_pedido)}</td><td>${esc(p.centro)}</td><td>${esc(p.descripcion)}</td><td class="text-end">${parseFloat(p.cant_solicitada || 0).toFixed(2)}</td><td class="text-end">${parseFloat(p.precio_unitario || 0).toFixed(2)}</td><td class="text-end">${parseFloat(p.total_item || 0).toFixed(2)}</td></tr>`).join('')}
    </table>

    <br/><button onclick="window.print()">Imprimir</button>
  </body></html>`);
  w.document.close();
}

// ==================== INIT ====================
export function initProgramacionView() {
  const reload = document.getElementById('progReload');
  if (reload) reload.onclick = () => {
    if (currentTab === 'bandeja') loadBandeja();
    else loadPaquetesTab();
  };

  const consolidarBtn = document.getElementById('progConsolidar');
  if (consolidarBtn) consolidarBtn.onclick = () => openConsolidarModal();

  document.querySelectorAll('#progTabs .nav-link').forEach((tab) => {
    tab.onclick = (e) => {
      e.preventDefault();
      document.querySelectorAll('#progTabs .nav-link').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      if (currentTab === 'bandeja') loadBandeja();
      else loadPaquetesTab();
    };
  });

  currentTab = 'bandeja';
  loadBandeja();
}
/**
 * Portal Proveedor — Órdenes recibidas
 */
import { portalService } from '../../services/portalService.js';
import {
  esc, renderProveedorShell, requireProveedorSession, bindProveedorLogout,
  PROVEEDOR_ROUTES,
} from '../../utils/proveedorShared.js';
import { formatDateTimeLima } from '../../utils/dateTimeLima.js';

// RC8.14.13: enviado_proveedor_at/recibido_proveedor_at son TIMESTAMP (instante UTC).
// Se formatean con formatDateTimeLima (America/Lima explícito) en vez de fmtDt()
// (proveedorShared.js), que depende del timezone del runtime. fmtDt() no se toca
// aquí porque es compartida por otros módulos fuera de alcance de RC8.14.13.
function fmtTs(v) {
  return esc(formatDateTimeLima(v));
}

function fmtMonto(n, moneda = 'PEN') {
  const val = Number(n || 0);
  const sym = String(moneda).toUpperCase() === 'USD' ? 'US$' : 'S/';
  return `${sym} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function renderOrdenesProveedorView() {
  if (!requireProveedorSession()) return '';
  return renderProveedorShell(PROVEEDOR_ROUTES.ordenesRecibidas, `
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white d-flex justify-content-between align-items-center">
        <h6 class="mb-0"><i class="bi bi-clipboard-check"></i> Órdenes recibidas</h6>
        <button type="button" class="btn btn-sm btn-outline-primary" id="provOrdRefresh">Actualizar</button>
      </div>
      <div class="card-body" id="provOrdList"><div class="text-muted">Cargando…</div></div>
    </div>
    <div class="modal fade" id="provOrdDetalleModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="provOrdDetalleTitle">Orden</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="provOrdDetalleBody"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
            <button type="button" class="btn btn-success d-none" id="provOrdConfirmar">Confirmar recepción</button>
          </div>
        </div>
      </div>
    </div>`);
}

async function loadList() {
  const el = document.getElementById('provOrdList');
  if (!el) return;
  el.innerHTML = '<div class="text-muted">Cargando…</div>';
  try {
    const resp = await portalService.listMisOrdenes();
    const rows = resp?.data || [];
    if (!rows.length) {
      el.innerHTML = '<div class="text-muted text-center py-4">No hay órdenes recibidas.</div>';
      return;
    }
    el.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle">
          <thead><tr>
            <th>Orden</th><th>Fecha</th><th>Requerimiento</th><th>CCP</th>
            <th>Monto</th><th>Enviado</th><th>Estado</th><th></th>
          </tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td><strong>${esc(r.tipo_orden)} ${esc(r.numero_orden)}</strong>/${esc(r.anio_orden)}</td>
                <td>${esc(String(r.fecha_orden || '').slice(0, 10))}</td>
                <td>${esc(r.requerimiento_codigo)}</td>
                <td>${esc(r.codigo_ccp || '—')}</td>
                <td>${fmtMonto(r.monto_total, r.moneda)}</td>
                <td class="small">${fmtTs(r.enviado_proveedor_at || r.envio_at)}</td>
                <td><span class="badge bg-secondary">${esc(r.estado)}</span></td>
                <td><button type="button" class="btn btn-sm btn-outline-primary prov-ord-ver" data-id="${r.id}">Ver</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    el.querySelectorAll('.prov-ord-ver').forEach((btn) => {
      btn.addEventListener('click', () => openDetalle(btn.dataset.id));
    });
  } catch (err) {
    el.innerHTML = `<div class="text-danger">${esc(err.message || 'Error')}</div>`;
  }
}

let currentOrdenId = null;

async function openDetalle(ordenId) {
  currentOrdenId = ordenId;
  const resp = await portalService.getOrden(ordenId);
  const d = resp?.data || resp;
  const body = document.getElementById('provOrdDetalleBody');
  const title = document.getElementById('provOrdDetalleTitle');
  const btnConf = document.getElementById('provOrdConfirmar');
  title.textContent = `${d.orden?.tipo_orden || ''} ${d.orden?.numero_orden || ''}/${d.orden?.anio_orden || ''}`;
  body.innerHTML = `
    <p class="small mb-2">
      <strong>Requerimiento:</strong> ${esc(d.contexto?.requerimiento_codigo)} ·
      <strong>CCP:</strong> ${esc(d.contexto?.codigo_ccp || '—')}<br>
      <strong>Proveedor:</strong> ${esc(d.contexto?.proveedor_razon_social)} (${esc(d.contexto?.proveedor_ruc)})<br>
      <strong>Monto:</strong> ${fmtMonto(d.orden?.monto_total, d.orden?.moneda)}
    </p>
    <h6 class="fs-6">Detalle adjudicado</h6>
    <ul class="small">${(d.items || []).map((it) => `
      <li>${esc(it.descripcion)} — cant. ${esc(it.cantidad)} × ${fmtMonto(it.precio_unitario)} = ${fmtMonto(it.precio_total)}</li>
    `).join('')}</ul>
    <h6 class="fs-6">Cronograma</h6>
    <ul class="small">${(d.entregas || []).map((e) => `
      <li>${esc(e.descripcion)} · ${esc(e.dias_plazo)} días (${esc(e.tipo_dias)})
        ${e.fecha_maxima ? `· máx. ${esc(String(e.fecha_maxima).slice(0, 10))}` : ''}</li>
    `).join('')}</ul>
    ${d.documento ? `<button type="button" class="btn btn-sm btn-outline-secondary" id="provOrdDescargar">
      <i class="bi bi-download"></i> Descargar orden firmada</button>` : '<p class="text-muted small">Sin documento</p>'}
    ${d.orden?.recibido_proveedor_at
      ? `<div class="alert alert-success mt-2 small">Recepción confirmada: ${fmtTs(d.orden.recibido_proveedor_at)}</div>`
      : ''}
  `;
  body.querySelector('#provOrdDescargar')?.addEventListener('click', async () => {
    await portalService.downloadOrdenDocumento(ordenId, d.documento.id, d.documento.nombre_archivo);
  });
  if (d.puede_confirmar) {
    btnConf.classList.remove('d-none');
  } else {
    btnConf.classList.add('d-none');
  }
  // eslint-disable-next-line no-undef
  bootstrap.Modal.getOrCreateInstance(document.getElementById('provOrdDetalleModal')).show();
}

export function initOrdenesProveedorView() {
  bindProveedorLogout();
  document.getElementById('provOrdRefresh')?.addEventListener('click', loadList);
  document.getElementById('provOrdConfirmar')?.addEventListener('click', async () => {
    if (!currentOrdenId) return;
    const ok = confirm(
      'Declaro haber recibido la orden y revisado el cronograma de entregas/entregables. ¿Confirmar recepción?',
    );
    if (!ok) return;
    try {
      await portalService.confirmarRecepcionOrden(currentOrdenId);
      alert('Recepción confirmada');
      // eslint-disable-next-line no-undef
      bootstrap.Modal.getInstance(document.getElementById('provOrdDetalleModal'))?.hide();
      loadList();
    } catch (err) {
      alert(err.message || 'Error al confirmar');
    }
  });
  loadList();
}

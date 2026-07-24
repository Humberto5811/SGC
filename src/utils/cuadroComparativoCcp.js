/**
 * RC8.8 — Generación / derivación del CCP desde Cuadro Comparativo aprobado.
 */
import { contratacionesService } from '../services/contratacionesService.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Modal de selección de responsable CCP (idempotente en UI: deshabilita confirmar al enviar).
 * @returns {Promise<object|null>} payload de derivación o null si cancela
 */
export function showDerivarCcpPanel({ onConfirm } = {}) {
  return new Promise((resolve) => {
    const id = `ccDestCcp_${Date.now()}`;
    document.querySelectorAll('.cc-dest-overlay').forEach((n) => n.remove());
    const overlay = document.createElement('div');
    overlay.className = 'cc-dest-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2000',
      'background:rgba(15,23,42,.55)', 'display:flex',
      'align-items:center', 'justify-content:center', 'padding:1rem',
    ].join(';');
    overlay.innerHTML = `
      <div class="card shadow border-0" style="width:min(520px,100%);max-height:90vh;overflow:auto" id="${id}">
        <div class="card-header bg-light d-flex justify-content-between align-items-center py-2">
          <strong><i class="bi bi-send"></i> Aprobar y derivar a CCP</strong>
          <button type="button" class="btn-close" data-cc-dest="cancel" aria-label="Cerrar"></button>
        </div>
        <div class="card-body" id="${id}_body">
          <div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span> Cargando destino…</div>
        </div>
        <div class="card-footer d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-secondary" data-cc-dest="cancel">Cancelar</button>
          <button type="button" class="btn btn-success" data-cc-dest="ok" disabled>Confirmar derivación</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const body = overlay.querySelector(`#${id}_body`);
    const btnOk = overlay.querySelector('[data-cc-dest="ok"]');
    let closed = false;
    const close = (result) => {
      if (closed) return;
      closed = true;
      overlay.remove();
      resolve(result);
    };
    overlay.querySelectorAll('[data-cc-dest="cancel"]').forEach((b) => {
      b.onclick = (ev) => { ev.preventDefault(); close(null); };
    });

    (async () => {
      try {
        const usersResp = await contratacionesService.listValidacionUsuarios('CCP', '');
        const usuarios = usersResp.data || [];
        body.innerHTML = `
          <div class="mb-2">
            <label class="form-label fw-semibold">Destino</label>
            <select class="form-select form-select-sm" disabled>
              <option value="CCP" selected>CCP</option>
            </select>
            <div class="form-text small">Transición oficial Workflow: Cuadro Comparativo → CCP</div>
          </div>
          <div class="mb-2">
            <label class="form-label fw-semibold">Usuario responsable</label>
            <select class="form-select form-select-sm" id="${id}_resp">
              <option value="">Seleccione…</option>
              ${usuarios.map((u) => `<option value="${u.id}" data-nombre="${esc(u.nombre)}">${esc(u.nombre)}${u.cargo ? ` — ${esc(u.cargo)}` : ''}</option>`).join('')}
            </select>
            ${!usuarios.length ? '<div class="text-danger small mt-1">No existen usuarios habilitados para CCP.</div>' : ''}
          </div>
          <div class="mb-0">
            <label class="form-label fw-semibold">Observación</label>
            <textarea class="form-control form-control-sm" id="${id}_obs" rows="2" placeholder="Opcional"></textarea>
          </div>
          <div id="${id}_err" class="alert alert-danger d-none py-2 mt-2 mb-0 small"></div>
          <div id="${id}_busy" class="alert alert-info d-none py-2 mt-2 mb-0 small">Derivando expediente…</div>`;

        const sync = () => {
          btnOk.disabled = !usuarios.length || !overlay.querySelector(`#${id}_resp`)?.value;
        };
        overlay.querySelector(`#${id}_resp`)?.addEventListener('change', sync);
        sync();

        btnOk.onclick = async (ev) => {
          ev.preventDefault();
          const sel = overlay.querySelector(`#${id}_resp`);
          const opt = sel?.selectedOptions?.[0];
          const errBox = overlay.querySelector(`#${id}_err`);
          const busy = overlay.querySelector(`#${id}_busy`);
          if (!sel?.value || !opt) {
            if (errBox) {
              errBox.textContent = 'Seleccione el usuario responsable.';
              errBox.classList.remove('d-none');
            }
            return;
          }
          btnOk.disabled = true;
          if (busy) busy.classList.remove('d-none');
          if (errBox) errBox.classList.add('d-none');
          try {
            const destPayload = {
              destino_submodulo: 'CCP',
              destino: 'CCP',
              responsable_destino_id: parseInt(sel.value, 10),
              responsable_id: parseInt(sel.value, 10),
              responsable_ccp_id: parseInt(sel.value, 10),
              responsable_destino_nombre: opt.dataset.nombre || opt.textContent,
              responsable_nombre: opt.dataset.nombre || opt.textContent,
              responsable_ccp_nombre: opt.dataset.nombre || opt.textContent,
              observacion_derivacion: overlay.querySelector(`#${id}_obs`)?.value || '',
            };
            if (typeof onConfirm === 'function') await onConfirm(destPayload);
            close(destPayload);
          } catch (err) {
            if (busy) busy.classList.add('d-none');
            if (errBox) {
              errBox.textContent = err.message || 'Error al derivar';
              errBox.classList.remove('d-none');
            }
            btnOk.disabled = false;
          }
        };
      } catch (err) {
        body.innerHTML = `<div class="alert alert-danger mb-0">${esc(err.message)}</div>`;
      }
    })();
  });
}

export function isModoGeneracionCcp(cuadro) {
  const e = String(cuadro?.estado || '').toUpperCase();
  return ['APROBADO_DEC', 'PENDIENTE_CCP'].includes(e);
}

export function evaluarGatesCcpCliente(cuadro) {
  const g = cuadro?.ccp_gates || {};
  const faltantes = [];
  if (!(g.conformidad_coordinador ?? cuadro?.conformidad_coordinador)) {
    faltantes.push('aprobación Coordinador');
  }
  if (!(g.conformidad_dec ?? cuadro?.conformidad_dec)) {
    faltantes.push('aprobación DEC');
  }
  if (g.version_vigente === false || String(cuadro?.estado || '').toUpperCase() === 'ANULADO') {
    faltantes.push('versión vigente');
  }
  if (!(g.pdf_firmado ?? cuadro?.tiene_pdf_firmado ?? cuadro?.firmado_nombre)) {
    faltantes.push('PDF firmado Coordinador');
  }
  if (!(g.pdf_firmado_dec ?? cuadro?.tiene_pdf_firmado_dec ?? cuadro?.firmado_dec_nombre)) {
    faltantes.push('PDF firmado DEC');
  }
  return { ok: faltantes.length === 0, faltantes };
}

export function renderPanelGeneracionCcp(cuadro) {
  const e = String(cuadro?.estado || '').toUpperCase();
  if (!['APROBADO_DEC', 'PENDIENTE_CCP', 'DERIVADO_CCP'].includes(e)) return '';

  const gates = evaluarGatesCcpCliente(cuadro);
  const derivado = e === 'DERIVADO_CCP';
  const generado = e === 'PENDIENTE_CCP' || derivado;
  const badge = (ok, label) => `<span class="badge ${ok ? 'bg-success' : 'bg-warning text-dark'}">${esc(label)}: ${ok ? 'Sí' : 'No'}</span>`;
  const g = cuadro?.ccp_gates || {};

  return `
    <div class="card border border-success mb-3" id="ccPanelCcp">
      <div class="card-body py-3">
        <h6 class="fw-bold mb-2"><i class="bi bi-file-earmark-check"></i> Generación del CCP</h6>
        <p class="small text-muted mb-2">
          Solo disponible cuando el cuadro está completamente aprobado
          (Coordinador + DEC, versión vigente y PDFs firmados).
        </p>
        <div class="d-flex flex-wrap gap-2 mb-2">
          ${badge(!!(g.conformidad_coordinador ?? cuadro?.conformidad_coordinador), 'Aprob. Coordinador')}
          ${badge(!!(g.conformidad_dec ?? cuadro?.conformidad_dec), 'Aprob. DEC')}
          ${badge(g.version_vigente !== false && e !== 'ANULADO', 'Versión vigente')}
          ${badge(!!(g.pdf_firmado ?? cuadro?.tiene_pdf_firmado), 'PDF firmado Coord.')}
          ${badge(!!(g.pdf_firmado_dec ?? cuadro?.tiene_pdf_firmado_dec), 'PDF firmado DEC')}
        </div>
        ${!gates.ok && !derivado ? `
          <div class="alert alert-warning py-2 small mb-2">
            No se puede Generar CCP: falta ${esc(gates.faltantes.join(', '))}.
          </div>` : ''}
        <div class="d-flex flex-wrap gap-2" id="ccCcpActions">
          <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnCcpDescargarFinal">
            <i class="bi bi-download"></i> Descargar Cuadro Final
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="ccBtnCcpVerFirmas">
            <i class="bi bi-pen"></i> Ver Firmas
          </button>
          <button type="button" class="btn btn-sm btn-success" id="ccBtnCcpGenerar"
            ${derivado || !gates.ok || generado ? 'disabled' : ''}
            title="${generado ? 'CCP ya generado' : (gates.ok ? 'Generar CCP' : 'Faltan aprobaciones')}">
            <i class="bi bi-file-earmark-plus"></i> Generar CCP
          </button>
          <button type="button" class="btn btn-sm btn-primary" id="ccBtnCcpDerivar"
            ${derivado || !gates.ok ? 'disabled' : ''}
            title="${derivado ? 'Ya derivado' : (gates.ok ? 'Derivar a CCP' : 'Faltan aprobaciones')}">
            <i class="bi bi-send"></i> Derivar CCP
          </button>
        </div>
        ${generado && !derivado ? '<div class="small text-success mt-2">CCP generado — pendiente de derivación.</div>' : ''}
        ${derivado ? `<div class="small text-muted mt-2">Derivado a CCP${cuadro.responsable_ccp_nombre ? ` · ${esc(cuadro.responsable_ccp_nombre)}` : ''}.</div>` : ''}
      </div>
    </div>`;
}

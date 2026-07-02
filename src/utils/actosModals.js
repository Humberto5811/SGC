// Modales — Coordinación CM (asignación, derivación, aprobación)
import { contratacionesService } from '../services/contratacionesService.js';
import { SUBMODULOS_DESTINO, getSubmoduloByLabel } from './observacionDestino.js';
import { esc } from './trazabilidad.js';
import { getRolDisplayFromRow } from './observacionDestino.js';
import { estadoModernBadge } from './bandejaUi.js';

function formatNombre(u) {
  return String(u?.nombre || '').trim();
}

export function isCoordinadorActos(user) {
  const cargo = String(user?.cargo || '').toLowerCase();
  if (cargo.includes('coordinador') && cargo.includes('contratos')) return true;
  return user?.rol === 'admin';
}

export function isExpedientePoolCoordinador(req) {
  const resp = String(req?.responsable_actual || req?.responsableActual || '');
  return /coordinador.*contratos/i.test(resp) || resp === 'Especialista Contrataciones';
}

export function isExpedienteAsignadoAMi(req, userName) {
  if (!userName) return false;
  const resp = String(req?.responsable_actual || req?.responsableActual || '').toLowerCase();
  const me = String(userName).toLowerCase();
  if (/coordinador.*contratos/i.test(resp)) return false;
  return resp.includes(me) || me.split(' ').filter((p) => p.length > 2).some((p) => resp.includes(p));
}


async function loadUsuariosInvitaciones() {
  const resp = await contratacionesService.listActosUsuarios({ perfil: 'invitaciones' });
  const list = resp?.data || [];
  if (list.length) return list;
  return [{ nombre: 'Especialista Contrataciones', cargo: 'Invitaciones' }];
}

async function loadUsuariosPorSubmodulo(code, search = '') {
  const params = { submodulo: code };
  if (search.trim()) params.search = search.trim();
  const resp = await contratacionesService.listActosUsuarios(params);
  return resp?.data || [];
}

export const ASIGNACION_DESTINOS = [
  { code: 'ACTOS_PREPARATORIOS', label: 'Coordinación CM', subLabel: 'Coordinación CM' },
  { code: 'INVITACIONES', label: 'Invitaciones', subLabel: 'Invitaciones' },
  { code: 'CCP', label: 'CCP', subLabel: 'CCP' },
  { code: 'CUADRO_COMPARATIVO', label: 'Cuadro Comparativo', subLabel: 'Cuadro Comparativo' },
  { code: 'EJECUCION', label: 'Ejecución', subLabel: 'Ejecución Contractual' },
];

function renderAnalistaResults(id, usuarios, selectedNombre) {
  if (!usuarios.length) {
    return '<p class="text-muted small mb-0">Sin usuarios con permiso en el submódulo seleccionado. Revise Mantenimiento → Usuarios → Accesos.</p>';
  }
  return `<div class="list-group list-group-flush border rounded" id="${id}_results">${usuarios.map((u, i) => {
    const nom = formatNombre(u);
    const checked = selectedNombre ? selectedNombre === nom : i === 0;
    return `<label class="list-group-item list-group-item-action py-2 mb-0">
      <input class="form-check-input me-2 ${id}_sel" type="radio" name="${id}_sel" value="${esc(nom)}" ${checked ? 'checked' : ''}>
      <strong>${esc(nom)}</strong>
      ${u.cargo ? `<span class="text-muted small ms-1">— ${esc(u.cargo)}</span>` : ''}
      ${u.username ? `<span class="text-muted small d-block ms-4">${esc(u.username)}</span>` : ''}
    </label>`;
  }).join('')}</div>`;
}

async function openAsignacionAnalistaModal(opts = {}) {
  const defaultCode = opts.defaultSubmodulo || 'ACTOS_PREPARATORIOS';
  const destOpts = ASIGNACION_DESTINOS.map((d) =>
    `<option value="${esc(d.code)}" data-sublabel="${esc(d.subLabel)}" ${d.code === defaultCode ? 'selected' : ''}>${esc(d.label)}</option>`,
  ).join('');

  const wrap = document.createElement('div');
  const id = 'modAsignar_' + Date.now();
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-lg"><div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">${esc(opts.title || 'Asignar analista')}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <p class="text-muted small">${esc(opts.subtitle || 'Seleccione submódulo destino y analista autorizado.')}</p>
          <div class="row g-3">
            <div class="col-md-5">
              <label class="form-label fw-semibold">Submódulo destino</label>
              <select id="${id}_sub" class="form-select form-select-sm">${destOpts}</select>
            </div>
            <div class="col-md-7">
              <label class="form-label fw-semibold">Analista destino</label>
              <input type="search" id="${id}_search" class="form-control form-control-sm" placeholder="Buscar por nombre, usuario o cargo…" autocomplete="off">
            </div>
          </div>
          <div class="mt-3" id="${id}_list"><p class="text-muted small mb-0">Cargando analistas…</p></div>
          ${opts.motivoField ? `
            <label class="form-label mt-3">${esc(opts.motivoLabel || 'Observación (opcional)')}</label>
            <textarea id="${id}_motivo" class="form-control form-control-sm" rows="2" placeholder="${esc(opts.motivoPlaceholder || 'Comentario…')}"></textarea>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" id="${id}_ok" class="btn ${opts.buttonClass || 'btn-primary'}">${esc(opts.buttonText || 'Confirmar asignación')}</button>
        </div>
      </div></div>
    </div>`;
  document.body.appendChild(wrap);
  const el = document.getElementById(id);
  const modal = new bootstrap.Modal(el);
  const subEl = document.getElementById(`${id}_sub`);
  const searchEl = document.getElementById(`${id}_search`);
  const listEl = document.getElementById(`${id}_list`);
  let selectedNombre = '';
  let searchTimer;

  const refreshList = async () => {
    listEl.innerHTML = '<p class="text-muted small mb-0">Buscando…</p>';
    const code = subEl.value;
    const users = await loadUsuariosPorSubmodulo(code, searchEl.value);
    listEl.innerHTML = renderAnalistaResults(id, users, selectedNombre);
    listEl.querySelectorAll(`.${id}_sel`).forEach((inp) => {
      inp.onchange = () => { selectedNombre = inp.value; };
    });
    const checked = listEl.querySelector(`input[name="${id}_sel"]:checked`);
    selectedNombre = checked?.value || '';
  };

  subEl.onchange = () => { selectedNombre = ''; refreshList(); };
  searchEl.oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshList, 300);
  };

  await refreshList();

  return new Promise((resolve) => {
    let resolved = false;
    document.getElementById(`${id}_ok`).onclick = () => {
      const sel = document.querySelector(`input[name="${id}_sel"]:checked`);
      if (!sel?.value) {
        alert('Seleccione un analista autorizado para el submódulo indicado.');
        return;
      }
      const dest = ASIGNACION_DESTINOS.find((d) => d.code === subEl.value) || ASIGNACION_DESTINOS[0];
      const motivo = opts.motivoField ? (document.getElementById(`${id}_motivo`)?.value || '').trim() : '';
      resolved = true;
      resolve({
        analista: sel.value,
        submodulo_code: dest.code,
        submodulo_label: dest.subLabel,
        motivo,
      });
      modal.hide();
    };
    el.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      if (!resolved) resolve(null);
    }, { once: true });
    modal.show();
  });
}

function radioListHtml(id, usuarios) {
  if (!usuarios.length) {
    return '<p class="text-muted small">No hay analistas activos con permiso en Coordinación CM. Revise Usuarios y Permisos.</p>';
  }
  return `<div class="list-group">${usuarios.map((u, i) => {
    const nom = formatNombre(u);
    return `<label class="list-group-item list-group-item-action py-2">
      <input class="form-check-input me-2" type="radio" name="${id}_sel" value="${esc(nom)}" ${i === 0 ? 'checked' : ''}>
      <strong>${esc(nom)}</strong>${u.cargo ? `<span class="text-muted small ms-1">— ${esc(u.cargo)}</span>` : ''}
    </label>`;
  }).join('')}</div>`;
}

function openBootstrapModal(html, onConfirm) {
  const id = 'modActos_' + Date.now();
  const wrap = document.createElement('div');
  wrap.innerHTML = html.replace(/\{MOD_ID\}/g, id);
  document.body.appendChild(wrap);
  const el = document.getElementById(id);
  const modal = new bootstrap.Modal(el);
  return new Promise((resolve) => {
    let resolved = false;
    const okBtn = document.getElementById(`${id}_ok`);
    if (okBtn) {
      okBtn.onclick = () => {
        const data = onConfirm(id);
        if (data === null) return;
        resolved = true;
        resolve(data);
        modal.hide();
      };
    }
    el.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      if (!resolved) resolve(null);
    }, { once: true });
    modal.show();
  });
}

export async function showAsignarAnalistaModal(opts = {}) {
  return openAsignacionAnalistaModal({
    title: opts.title || 'Asignar analista',
    subtitle: opts.subtitle || 'Seleccione el submódulo destino y el analista con permiso correspondiente.',
    defaultSubmodulo: opts.defaultSubmodulo || 'ACTOS_PREPARATORIOS',
    buttonText: opts.buttonText || 'Confirmar asignación',
  });
}

export async function showAprobarInvitacionesModal() {
  const usuarios = await loadUsuariosInvitaciones();
  return openBootstrapModal(`
    <div class="modal fade" id="{MOD_ID}" tabindex="-1">
      <div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">¿Enviar expediente a Invitaciones?</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <p class="alert alert-light border small">El expediente pasará a la etapa <strong>Invitaciones</strong>.</p>
          <label class="form-label fw-semibold">Responsable destino</label>
          ${radioListHtml('{MOD_ID}', usuarios)}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" id="{MOD_ID}_ok" class="btn btn-success">Confirmar envío</button>
        </div>
      </div></div>
    </div>`, (id) => {
    const sel = document.querySelector(`input[name="${id}_sel"]:checked`);
    if (!sel?.value) { alert('Seleccione responsable destino.'); return null; }
    return { responsable_destino: sel.value };
  });
}

export async function showActosDestinoModal(opts = {}) {
  const motivoReq = opts.motivoRequired !== false;
  const optsSub = SUBMODULOS_DESTINO.map((s) =>
    `<option value="${esc(s.label)}" data-code="${esc(s.code)}">${esc(s.label)}</option>`,
  ).join('');

  const wrap = document.createElement('div');
  const id = 'modActosDest_' + Date.now();
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-lg"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">${esc(opts.title || 'Observación')}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          ${opts.historyHtml || ''}
          <div class="row g-2 mb-3 border rounded p-2 bg-light">
            <div class="col-md-6">
              <label class="form-label small fw-semibold">Submódulo destino</label>
              <select id="${id}_destSub" class="form-select form-select-sm">${optsSub}</select>
            </div>
            <div class="col-md-6">
              <label class="form-label small fw-semibold">Usuario destino</label>
              <select id="${id}_destUsr" class="form-select form-select-sm"><option value="">Cargando…</option></select>
            </div>
          </div>
          <label class="form-label">${esc(opts.motivoLabel || 'Motivo')}${motivoReq ? '' : ' (opcional)'}</label>
          <textarea id="${id}_motivo" class="form-control" rows="4" placeholder="${esc(opts.placeholder || 'Indique el motivo…')}"></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" id="${id}_ok" class="btn ${opts.buttonClass || 'btn-danger'}">${esc(opts.buttonText || 'Confirmar')}</button>
        </div>
      </div></div>
    </div>`;
  document.body.appendChild(wrap);
  const el = document.getElementById(id);
  const modal = new bootstrap.Modal(el);
  const subEl = document.getElementById(`${id}_destSub`);
  const usrEl = document.getElementById(`${id}_destUsr`);

  const refreshUsuarios = async () => {
    const sub = getSubmoduloByLabel(subEl.value);
    usrEl.innerHTML = '<option value="">Cargando…</option>';
    const users = await loadUsuariosPorSubmodulo(sub?.code || '');
    const fallback = getSubmoduloByLabel(subEl.value)?.personas || [];
    const nombres = users.length ? users.map(formatNombre).filter(Boolean) : fallback;
    usrEl.innerHTML = nombres.length
      ? nombres.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')
      : '<option value="">Sin usuarios registrados</option>';
  };
  subEl.onchange = refreshUsuarios;
  await refreshUsuarios();

  return new Promise((resolve) => {
    let resolved = false;
    document.getElementById(`${id}_ok`).onclick = () => {
      const motivo = (document.getElementById(`${id}_motivo`)?.value || '').trim();
      if (motivoReq && !motivo) { alert('Ingrese el motivo.'); return; }
      const sub = getSubmoduloByLabel(subEl.value);
      const persona = usrEl.value;
      if (!persona) { alert('Seleccione usuario destino.'); return; }
      resolved = true;
      resolve({
        motivo,
        destino_submodulo: subEl.value,
        destino_etapa: sub?.code || '',
        destino_persona: persona,
        origen_submodulo: opts.origenSubmodulo || 'Coordinación CM',
      });
      modal.hide();
    };
    el.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      if (!resolved) resolve(null);
    }, { once: true });
    modal.show();
  });
}

export async function showDerivarAnalistaModal(opts = {}) {
  return openAsignacionAnalistaModal({
    title: opts.title || 'Derivar a analista',
    subtitle: opts.subtitle || 'Seleccione submódulo destino y analista autorizado.',
    defaultSubmodulo: opts.defaultSubmodulo || 'ACTOS_PREPARATORIOS',
    buttonText: 'Derivar',
    buttonClass: 'btn-primary',
    motivoField: true,
    motivoLabel: 'Observación (opcional)',
    motivoPlaceholder: 'Comentario de derivación…',
  });
}

export function actosBandejaStyles() {
  return `
    .actos-bandeja-page { overflow: visible; padding-bottom: 2rem; }
    .actos-bandeja-wrap .table-responsive { overflow-x: auto; overflow-y: visible; max-height: none; width: 100%; }
    .actos-bandeja-wrap .req-list-table { table-layout: auto; width: 100%; min-width: 1280px; }
    .actos-bandeja-wrap .req-list-table th,
    .actos-bandeja-wrap .req-list-table td { vertical-align: middle; font-size: 0.8125rem; padding: 0.5rem 0.55rem; }
    .actos-bandeja-wrap .req-col-acc { overflow: visible; position: relative; }
    .actos-bandeja-wrap .req-col-acc .dropdown { position: static; }
    .actos-bandeja-wrap .req-col-acc .dropdown-menu {
      z-index: 1080;
      max-height: min(70vh, 480px);
      overflow-y: auto;
      min-width: 220px;
    }
    .actos-bandeja-wrap .actos-col-desc { white-space: normal; min-width: 200px; max-width: 360px; }
    .actos-bandeja-wrap .actos-col-desc .req-desc-text {
      white-space: normal; overflow: visible; text-overflow: unset; display: block; line-height: 1.35;
    }
    .actos-bandeja-wrap .actos-col-paq { min-width: 100px; }
    .actos-bandeja-wrap .actos-col-sc { min-width: 130px; white-space: nowrap; }
    .inv-bandeja-wrap .actos-col-area { min-width: 90px; max-width: 120px; }
    .inv-bandeja-wrap .actos-col-inv-count { min-width: 88px; max-width: 100px; }
    .actos-bandeja-wrap .actos-col-pedido { min-width: 110px; white-space: normal; }
    .actos-bandeja-wrap .actos-col-sigamef { min-width: 110px; white-space: normal; }
    .inv-bandeja-page { overflow: visible; padding-bottom: 2.5rem; }
    .inv-bandeja-page #invContent { overflow: visible; }
    .inv-bandeja-wrap .req-list-table { min-width: 1680px; }
    .inv-bandeja-wrap .req-col-acc .dropdown-menu { min-width: 240px; max-height: none; overflow: visible; }
    #invTabs { border-bottom: 2px solid #dee2e6; }
    #invTabs .nav-link {
      border: 1px solid transparent; border-radius: 6px 6px 0 0; margin-bottom: -2px;
      color: #495057; background: #f8f9fa;
    }
    #invTabs .nav-link.active {
      border-color: #dee2e6 #dee2e6 #fff; background: #fff; font-weight: 600; color: #0a4275;
    }
    #invTabs .nav-link[data-tab="solicitudes"].active { border-top: 3px solid #0a4275; }
    .inv-tab-panel { border: 1px solid #dee2e6; border-radius: 8px; background: #fff; padding: 1rem; }
  `;
}

function getResponsableRolDisplay(r) {
  const resp = String(r?.responsable_actual || r?.responsableActual || '').trim();
  if (/coordinador.*contratos/i.test(resp)) return 'Coordinador CM';
  if (/analista.*contratos/i.test(resp) || /\banalista\b/i.test(resp)) return 'Analista CM';
  return getRolDisplayFromRow(r);
}

export function renderActosRowCells(r, opts = {}) {
  const { escFn = esc, includeScColumn = false, narrowArea = false } = opts;
  const sigamef = (() => {
    try {
      const p = JSON.parse(r.payload || '{}');
      const items = r.tipo === 'servicios' ? (p.servicioItems || []) : r.tipo === 'locacion' ? (p.locadorItems || []) : (p.items || []);
      if (items?.length) return items.map((it) => it.item_bien || '').filter(Boolean).join(', ');
    } catch (_) {}
    return '';
  })();
  const nombreItem = (() => {
    try {
      const p = JSON.parse(r.payload || '{}');
      const items = r.tipo === 'servicios' ? (p.servicioItems || []) : r.tipo === 'locacion' ? (p.locadorItems || []) : (p.items || []);
      if (Array.isArray(items) && items.length) {
        const names = items.map((it) => it.nombre_item || '').filter(Boolean);
        if (names.length) return names.join(', ');
      }
    } catch (_) {}
    return r.denominacion || '';
  })();
  const paqBadge = r.codigo_paquete
    ? `<span class="badge bg-success">${escFn(r.codigo_paquete)}</span>`
    : '<span class="text-muted small">Sin paquete</span>';
  const fechaAsig = r.fecha_estado_actual || r.fechaEstadoActual || '';
  const fechaFmt = fechaAsig ? String(fechaAsig).slice(0, 16).replace('T', ' ') : '—';
  const dias = r.dias_en_estado ?? r.diasEnEstado ?? 0;
  const resp = r.responsable_actual || r.responsableActual || '—';
  const rol = getResponsableRolDisplay(r);
  const estadoBadgeHtml = estadoModernBadge(
    r.estado_actual || r.estadoActual,
    r.estadoActualTexto || r.estado_actual_texto,
    r.estado,
    r,
    'Coordinación CM',
  );
  const pedidos = r.pedidos_sigamef || r.pedidosSigamef || '—';
  const scCode = r.codigo_solicitud || r.codigoSolicitud || '';
  const scCell = includeScColumn
    ? `<td class="actos-col-sc small"><strong>${scCode ? escFn(scCode) : '<span class="text-muted">—</span>'}</strong></td>`
    : '';
  const areaClass = narrowArea ? ' actos-col-area' : '';

  return `
    <td class="text-center"><button type="button" class="btn btn-link btn-sm p-0 req-traza text-secondary" data-id="${r.id}" onclick="event.stopPropagation()"><i class="bi bi-clock-history"></i></button></td>
    <td><strong>${escFn(r.codigo || ('#' + r.id))}</strong></td>
    ${scCell}
    <td class="actos-col-paq">${paqBadge}</td>
    <td class="actos-col-pedido small">${escFn(pedidos)}</td>
    <td class="actos-col-sigamef small">${escFn(sigamef || '—')}</td>
    <td class="actos-col-desc"><span class="req-desc-text" title="${escFn(nombreItem)}">${escFn(nombreItem)}</span></td>
    <td class="${areaClass.trim()}">${escFn(r.area || '—')}</td>
    <td>${estadoBadgeHtml}</td>
    <td><div class="req-resp-name">${escFn(resp)}</div><div class="req-resp-role">${escFn(rol)}</div></td>
    <td class="small text-muted">${escFn(fechaFmt)}</td>
    <td class="text-center"><span class="badge badge-dias-mod" style="background:${dias > 10 ? '#dc3545' : dias > 5 ? '#fd7e14' : '#198754'};color:#fff;">${dias}d</span></td>`;
}

export function actosBandejaHeaders(opts = {}) {
  const { includeAcc = true, includeScColumn = false } = opts;
  const accCol = includeAcc ? '<th class="req-col-acc"></th>' : '';
  const scCol = includeScColumn
    ? '<th class="actos-col-sc" style="min-width:130px;">Solicitud de Cotización</th>'
    : '';
  return `
    <th class="req-col-timeline" title="Timeline">🕒</th>
    <th>N° Requerimiento</th>
    ${scCol}
    <th>Paquete</th>
    <th>Pedido SIGAMEF</th>
    <th>Código SIGAMEF</th>
    <th>Descripción</th>
    <th>Área Usuaria</th>
    <th>Estado Actual</th>
    <th>Responsable Actual</th>
    <th>Fecha Asignación</th>
    <th>Días</th>
    ${accCol}`;
}

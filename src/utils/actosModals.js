// Modales — Coordinación CM (asignación, derivación, aprobación)
import { contratacionesService } from '../services/contratacionesService.js';
import { listEquiposUadCatalogo } from '../../shared/equiposUad.js';
import { etapaTransicionDestinoDerivacionEquipoUad } from '../../shared/contMenoresDerivacionUad.js';
import { SUBMODULOS_DESTINO, getSubmoduloByLabel } from './observacionDestino.js';
import { api } from '../services/apiService.js';
import { esc } from './trazabilidad.js';
import { renderResponsableCellHtml, estadoModernBadge } from './bandejaUi.js';
import { esCoordinadorActosUsuario } from '../../shared/contMenoresBandejaAccess.js';

function formatNombre(u) {
  return String(u?.nombre || '').trim();
}

/** Alineado con server: cargo CM, admin, o COORDINADOR + equipo CONT_MENORES. */
export function isCoordinadorActos(user) {
  return esCoordinadorActosUsuario(user || {});
}

export function isExpedientePoolCoordinador(req) {
  const resp = String(req?.responsableActual || req?.responsable_actual || '');
  return /coordinador.*contratos/i.test(resp) || resp === 'Especialista Contrataciones';
}

export function isExpedienteAsignadoAMi(req, userName, userId = null) {
  const uid = userId != null && Number.isFinite(Number(userId)) ? Number(userId) : null;
  const bcUid = req?.bandeja_contrato?.responsable?.usuarioId
    ?? req?.responsable_usuario_id
    ?? req?.responsableUsuarioId;
  if (uid != null && bcUid != null && Number(bcUid) === uid) return true;

  const respRaw = String(req?.responsableActual || req?.responsable_actual || '').trim();
  if (uid != null && /^\d+$/.test(respRaw) && Number(respRaw) === uid) return true;

  if (!userName) return false;
  const resp = respRaw.toLowerCase();
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

async function loadUsuariosPorEquipoUad(equipoCodigo, search = '') {
  const params = { equipo_uad: equipoCodigo };
  if (search.trim()) params.search = search.trim();
  const resp = await contratacionesService.listActosUsuarios(params);
  return resp?.data || [];
}

const OBS_CONT_MENORES_LABELS = new Set([
  'Registro de Requerimiento',
  'Evaluación de Requerimiento',
  'DEC',
  'Programación',
]);

async function loadCandidatosObservacionContMenores(requerimientoId, destinoLabel) {
  if (!requerimientoId || !destinoLabel) return [];
  const q = new URLSearchParams({ destino_submodulo: destinoLabel }).toString();
  const resp = await api.get(`/contrataciones/actos/candidatos-observacion-destino/${requerimientoId}?${q}`);
  const data = resp?.data || resp;
  const list = data?.candidatos || data?.data?.candidatos || [];
  const rec = data?.recomendado || data?.data?.recomendado;
  return rec ? [rec, ...list.filter((c) => c.id !== rec.id)] : list;
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
  const destinos = opts.observacionContMenores
    ? SUBMODULOS_DESTINO.filter((s) => OBS_CONT_MENORES_LABELS.has(s.label))
    : SUBMODULOS_DESTINO;
  const optsSub = destinos.map((s) =>
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
    let users = [];
    if (opts.observacionContMenores && opts.requerimientoId) {
      users = await loadCandidatosObservacionContMenores(opts.requerimientoId, subEl.value);
    } else {
      users = await loadUsuariosPorSubmodulo(sub?.code || '');
    }
    const fallback = getSubmoduloByLabel(subEl.value)?.personas || [];
    if (!users.length && fallback.length) {
      usrEl.innerHTML = fallback.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
      return;
    }
    usrEl.innerHTML = users.length
      ? users.map((u) => {
        const nom = formatNombre(u);
        const rol = u.rol_label || u.cargo || '';
        const val = u.id != null ? String(u.id) : nom;
        return `<option value="${esc(val)}">${esc(nom)}${rol ? ` — ${esc(rol)}` : ''}</option>`;
      }).join('')
      : '<option value="">Sin usuarios elegibles</option>';
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

/** RC8.17.8H5 — Paso 1: equipo UAD destino; paso 2: personas del pool UAD real. */
export async function showContMenoresDerivacionUadModal(opts = {}) {
  const equipos = listEquiposUadCatalogo().filter((e) => e.codigo !== 'CONT_MENORES' || opts.incluirContMenores);
  const eqOpts = equipos.map((e, i) =>
    `<option value="${esc(e.codigo)}" ${i === 0 ? 'selected' : ''}>${esc(e.label)}</option>`,
  ).join('');

  const wrap = document.createElement('div');
  const id = 'modCmDeriv_' + Date.now();
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-lg"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">${esc(opts.title || 'Derivar expediente')}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          ${opts.subtitle ? `<p class="text-muted small mb-2">${esc(opts.subtitle)}</p>` : ''}
          <div class="row g-2 mb-3 border rounded p-2 bg-light">
            <div class="col-md-5">
              <label class="form-label small fw-semibold">Equipo / submódulo destino</label>
              <select id="${id}_eq" class="form-select form-select-sm">${eqOpts}</select>
            </div>
            <div class="col-md-7">
              <label class="form-label small fw-semibold">Persona destino</label>
              <select id="${id}_usr" class="form-select form-select-sm"><option value="">Cargando…</option></select>
            </div>
          </div>
          <label class="form-label">${esc(opts.motivoLabel || 'Observación (opcional)')}</label>
          <textarea id="${id}_motivo" class="form-control form-control-sm" rows="3"></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" id="${id}_ok" class="btn btn-primary">${esc(opts.buttonText || 'Derivar')}</button>
        </div>
      </div></div>
    </div>`;
  document.body.appendChild(wrap);
  const el = document.getElementById(id);
  const modal = new bootstrap.Modal(el);
  const eqEl = document.getElementById(`${id}_eq`);
  const usrEl = document.getElementById(`${id}_usr`);

  const refreshUsuarios = async () => {
    usrEl.innerHTML = '<option value="">Cargando…</option>';
    const users = await loadUsuariosPorEquipoUad(eqEl.value);
    usrEl.innerHTML = users.length
      ? users.map((u) => {
        const nom = formatNombre(u);
        const rol = u.rol_label || u.cargo || '';
        return `<option value="${esc(String(u.id))}">${esc(nom)}${rol ? ` — ${esc(rol)}` : ''}</option>`;
      }).join('')
      : '<option value="">Sin usuarios en el equipo UAD</option>';
  };
  eqEl.onchange = refreshUsuarios;
  await refreshUsuarios();

  return new Promise((resolve) => {
    let resolved = false;
    document.getElementById(`${id}_ok`).onclick = () => {
      const persona = usrEl.value;
      if (!persona) { alert('Seleccione persona destino.'); return; }
      const eq = eqEl.value;
      const etapa = etapaTransicionDestinoDerivacionEquipoUad(eq) || '';
      const eqLabel = equipos.find((e) => e.codigo === eq)?.label || eq;
      resolved = true;
      resolve({
        motivo: (document.getElementById(`${id}_motivo`)?.value || '').trim(),
        equipo_uad: eq,
        destino_submodulo: eqLabel,
        destino_etapa: etapa,
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

/**
 * @deprecated RC8.17.8H6-A1 — usar showWorkflowTransicionModal (COORDINACION_CM_APROBADA / ASIGNADA).
 */
export async function showDerivarAnalistaModal(opts = {}) {
  return openAsignacionAnalistaModal({
    title: opts.title || 'Derivar a analista',
    subtitle: opts.subtitle || 'Obsoleto: use Derivar a Invitaciones o Reasignar responsable en bandeja CM.',
    defaultSubmodulo: 'ACTOS_PREPARATORIOS',
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
    .actos-bandeja-wrap .actos-col-pedido { min-width: 110px; white-space: normal; }
    .actos-bandeja-wrap .actos-col-sigamef { min-width: 110px; white-space: normal; }
    /* RC8.17.8H6-A3 — Invitaciones: bandeja compacta (ref. Registro / CM) */
    .inv-bandeja-page { overflow: visible; padding-bottom: 1.25rem; }
    .inv-bandeja-page #invContent { overflow: visible; }
    .inv-bandeja-page .inv-page-subtitle { font-size: 0.78rem; line-height: 1.2; }
    #invTabs { border-bottom: 2px solid #dee2e6; }
    #invTabs.inv-tabs-compact { margin-bottom: 0.5rem !important; }
    #invTabs .nav-link {
      border: 1px solid transparent; border-radius: 6px 6px 0 0; margin-bottom: -2px;
      color: #495057; background: #f8f9fa;
    }
    #invTabs.inv-tabs-compact .nav-link { padding: 0.35rem 0.75rem; font-size: 0.8125rem; }
    #invTabs .nav-link.active {
      border-color: #dee2e6 #dee2e6 #fff; background: #fff; font-weight: 600; color: #0a4275;
    }
    #invTabs .nav-link[data-tab="solicitudes"].active { border-top: 3px solid #0a4275; }
    .inv-tab-panel { border: 1px solid #dee2e6; border-radius: 6px; background: #fff; padding: 0.5rem 0.65rem; }
    .inv-bandeja-wrap .req-list-table {
      table-layout: fixed; width: 100%; min-width: 1180px;
    }
    .inv-bandeja-wrap .req-list-table th,
    .inv-bandeja-wrap .req-list-table td {
      vertical-align: middle; font-size: 0.78rem; padding: 0.32rem 0.38rem; line-height: 1.25;
    }
    .inv-bandeja-wrap .req-list-table tbody tr { height: 34px; max-height: 38px; }
    .inv-bandeja-wrap .inv-col-select { width: 28px; max-width: 32px; padding-left: 0.25rem; padding-right: 0.25rem; }
    .inv-bandeja-wrap .req-col-req { width: 5.5rem; max-width: 5.5rem; }
    .inv-bandeja-wrap .actos-col-sc { min-width: 0; width: 5.25rem; max-width: 5.5rem; white-space: nowrap; }
    .inv-bandeja-wrap .actos-col-paq { min-width: 0; width: 4.25rem; max-width: 4.5rem; }
    .inv-bandeja-wrap .actos-col-pedido,
    .inv-bandeja-wrap .actos-col-sigamef { min-width: 0; width: 4.75rem; max-width: 5rem; white-space: nowrap; }
    .inv-bandeja-wrap .actos-col-desc { min-width: 0; width: 8%; max-width: 10.5rem; }
    .inv-bandeja-wrap .actos-col-desc .req-desc-text {
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; line-height: 1.25; max-width: 100%;
    }
    .inv-bandeja-wrap .actos-col-centro { min-width: 0; width: 4.25rem; max-width: 4.75rem; }
    .inv-bandeja-wrap .actos-col-area { min-width: 0; width: 4.5rem; max-width: 5rem; }
    .inv-bandeja-wrap .actos-col-cmn { width: 3.5rem; max-width: 3.75rem; }
    .inv-bandeja-wrap .req-col-etapa,
    .inv-bandeja-wrap .req-col-estado-cell,
    .inv-bandeja-wrap .req-col-resp { padding: 0.28rem 0.35rem; vertical-align: middle; }
    .inv-bandeja-wrap .req-col-etapa { width: 7.5rem; max-width: 7.5rem; }
    .inv-bandeja-wrap .req-col-estado-cell { width: 7.75rem; max-width: 7.75rem; }
    .inv-bandeja-wrap .req-col-resp { width: 8.25rem; max-width: 8.25rem; }
    .inv-bandeja-wrap .req-col-etapa .sgc-etapa-badge,
    .inv-bandeja-wrap .req-col-estado-cell .sgc-estado-badge,
    .inv-bandeja-wrap .req-col-resp .sgc-responsable-badge {
      min-height: 22px; max-height: 24px; max-width: 100%;
    }
    .inv-bandeja-wrap .req-col-etapa .sgc-etapa-badge__text { max-width: 6.75rem; }
    .inv-bandeja-wrap .req-col-estado-cell .sgc-estado-badge__text { max-width: 7rem; }
    .inv-bandeja-wrap .req-col-resp .sgc-responsable-badge__text { max-width: 7.5rem; }
    .inv-bandeja-wrap .sgc-etapa-badge__text,
    .inv-bandeja-wrap .sgc-estado-badge__text,
    .inv-bandeja-wrap .sgc-responsable-badge__text {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      display: inline-block; vertical-align: bottom;
    }
    .inv-bandeja-wrap .inv-col-fecha { width: 6.25rem; max-width: 6.5rem; white-space: nowrap; font-size: 0.72rem; }
    .inv-bandeja-wrap .req-col-dias { width: 2.75rem; max-width: 3rem; }
    .inv-bandeja-wrap .actos-col-inv-count { min-width: 0; width: 2.75rem; max-width: 3rem; font-size: 0.72rem; }
    .inv-bandeja-wrap .actos-col-inv-num { min-width: 0; width: 3rem; max-width: 3.25rem; font-size: 0.72rem; }
    .inv-bandeja-wrap .req-col-acc { width: 2.5rem; max-width: 2.75rem; overflow: visible; }
    .inv-bandeja-wrap .req-col-acc .dropdown-menu { min-width: 240px; max-height: none; overflow: visible; }
    @media (max-width: 991.98px) {
      .inv-bandeja-wrap .req-list-table { min-width: 980px; }
    }
  `;
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
  const estadoBadgeHtml = estadoModernBadge(r, 'Coordinación CM');
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
    <td class="req-col-estado-cell">${estadoBadgeHtml}</td>
    <td class="small">${renderResponsableCellHtml(r, escFn)}</td>
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
    <th>Estado</th>
    <th>Responsable</th>
    <th>Fecha Asignación</th>
    <th>Días</th>
    ${accCol}`;
}

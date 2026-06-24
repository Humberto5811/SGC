// Portal de Proveedores — módulo independiente
import { portalService } from '../../services/portalService.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let session = null;
let misInvitaciones = [];
let solicitudActiva = null;

export function renderPortalProveedoresView() {
  session = portalService.getSession();
  if (session?.debeCambiarPassword) {
    return renderCambioPassword();
  }
  if (!session) return renderLogin();
  return renderPortalMain();
}

function renderLogin() {
  return `
    <div class="container py-5" style="max-width:420px;">
      <div class="card shadow-sm">
        <div class="card-body p-4">
          <h4 class="mb-1"><i class="bi bi-building"></i> Portal de Proveedores</h4>
          <p class="text-muted small mb-3">Acceda con su RUC y contraseña temporal recibida por correo.</p>
          <div class="mb-3"><label class="form-label">RUC</label><input type="text" class="form-control" id="portalRuc" maxlength="11"></div>
          <div class="mb-3"><label class="form-label">Contraseña</label><input type="password" class="form-control" id="portalPass"></div>
          <button class="btn btn-primary w-100" id="portalLoginBtn">Ingresar</button>
          <p class="small text-muted mt-3 mb-0">Las cotizaciones y consultas se gestionan únicamente dentro del SGC.</p>
        </div>
      </div>
    </div>`;
}

function renderCambioPassword() {
  return `
    <div class="container py-5" style="max-width:420px;">
      <div class="card shadow-sm"><div class="card-body p-4">
        <h5>Cambio de contraseña obligatorio</h5>
        <div class="mb-2"><label class="form-label small">Contraseña actual</label><input type="password" class="form-control" id="portalPassActual"></div>
        <div class="mb-2"><label class="form-label small">Nueva contraseña</label><input type="password" class="form-control" id="portalPassNueva"></div>
        <div class="mb-3"><label class="form-label small">Confirmar</label><input type="password" class="form-control" id="portalPassConf"></div>
        <button class="btn btn-primary w-100" id="portalCambiarBtn">Guardar y continuar</button>
      </div></div>
    </div>`;
}

function renderPortalMain() {
  return `
    <div class="container-fluid py-3">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div><h4 class="mb-0">${esc(session.razon_social)}</h4><small class="text-muted">RUC ${esc(session.ruc)}</small></div>
        <button class="btn btn-sm btn-outline-secondary" id="portalLogout">Salir</button>
      </div>
      <ul class="nav nav-tabs mb-3">
        <li class="nav-item"><a class="nav-link active" href="#" data-ptab="invitaciones">Mis invitaciones</a></li>
        <li class="nav-item"><a class="nav-link" href="#" data-ptab="consultas">Consultas</a></li>
        <li class="nav-item"><a class="nav-link" href="#" data-ptab="cotizacion">Presentar cotización</a></li>
        <li class="nav-item"><a class="nav-link" href="#" data-ptab="absoluciones">Absoluciones</a></li>
      </ul>
      <div id="portalContent"><div class="text-muted">Cargando…</div></div>
    </div>`;
}

async function loadInvitacionesTab() {
  const cont = document.getElementById('portalContent');
  const resp = await portalService.listMisInvitaciones();
  misInvitaciones = resp.data || [];
  if (!misInvitaciones.length) {
    cont.innerHTML = '<div class="alert alert-light border">No tiene invitaciones activas.</div>';
    return;
  }
  cont.innerHTML = `
    <table class="table table-sm table-hover">
      <thead><tr><th>Solicitud</th><th>Estado</th><th>Límite cotización</th><th>Acciones</th></tr></thead>
      <tbody>${misInvitaciones.map((i) => `
        <tr>
          <td><strong>${esc(i.codigo)}</strong><br><small>${esc(i.objeto || i.denominacion || '')}</small></td>
          <td><span class="badge ${i.convocatoria_cerrada ? 'bg-secondary' : 'bg-success'}">${i.convocatoria_cerrada ? 'CERRADA' : esc(i.estado || i.solicitud_estado)}</span></td>
          <td class="small">${i.cotizaciones_fin ? esc(String(i.cotizaciones_fin).slice(0, 16).replace('T', ' ')) : '—'}</td>
          <td><button class="btn btn-sm btn-outline-primary portal-select-sol" data-id="${i.solicitud_id}">Seleccionar</button></td>
        </tr>`).join('')}</tbody>
    </table>`;
  cont.querySelectorAll('.portal-select-sol').forEach((btn) => {
    btn.onclick = () => {
      solicitudActiva = parseInt(btn.dataset.id, 10);
      alert(`Convocatoria #${solicitudActiva} seleccionada para consultas y cotización.`);
    };
  });
}

function renderConsultasForm() {
  const cont = document.getElementById('portalContent');
  cont.innerHTML = `
    <div class="row"><div class="col-md-8">
      <div class="mb-2"><label class="form-label small">Solicitud ID</label>
        <input class="form-control form-control-sm" id="portalSolId" value="${solicitudActiva || ''}"></div>
      <div class="mb-2"><label class="form-label small">Asunto</label><input class="form-control form-control-sm" id="portalConsAsunto"></div>
      <div class="mb-2"><label class="form-label small">Consulta</label><textarea class="form-control" rows="4" id="portalConsTexto"></textarea></div>
      <button class="btn btn-primary btn-sm" id="portalConsEnviar">Registrar consulta</button>
    </div></div>
    <hr/><div id="portalConsList"></div>`;
  document.getElementById('portalConsEnviar').onclick = async () => {
    try {
      await portalService.crearConsulta({
        solicitud_id: parseInt(document.getElementById('portalSolId').value, 10),
        asunto: document.getElementById('portalConsAsunto').value,
        consulta: document.getElementById('portalConsTexto').value,
      });
      alert('Consulta registrada.');
      loadConsultasList();
    } catch (err) { alert(err.message); }
  };
  loadConsultasList();
}

async function loadConsultasList() {
  const list = document.getElementById('portalConsList');
  if (!list) return;
  const resp = await portalService.listConsultas(solicitudActiva);
  const rows = resp.data || [];
  list.innerHTML = rows.length ? `<ul class="list-group">${rows.map((c) => `
    <li class="list-group-item"><strong>${esc(c.asunto)}</strong> — <span class="badge bg-${c.estado === 'RESPONDIDA' ? 'success' : 'warning'}">${esc(c.estado)}</span>
      <div class="small text-muted">${esc(c.consulta)}</div>
      ${c.respuesta ? `<div class="small mt-1 border-start ps-2">${esc(c.respuesta)}</div>` : ''}
    </li>`).join('')}</ul>` : '<p class="text-muted small">Sin consultas.</p>';
}

function renderCotizacionForm() {
  const cont = document.getElementById('portalContent');
  cont.innerHTML = `
    <div class="alert alert-info small">Suba sus propuestas en el sistema. No envíe documentos por correo.</div>
    <div class="row g-2 col-md-8">
      <div class="col-12"><label class="form-label small">Solicitud ID</label>
        <input class="form-control form-control-sm" id="portalCotSol" value="${solicitudActiva || ''}"></div>
      <div class="col-12"><label class="form-label small">Propuesta técnica (referencia / descripción)</label>
        <textarea class="form-control form-control-sm" rows="2" id="portalCotTec"></textarea></div>
      <div class="col-12"><label class="form-label small">Propuesta económica (monto / referencia)</label>
        <textarea class="form-control form-control-sm" rows="2" id="portalCotEco"></textarea></div>
      <div class="col-12"><button class="btn btn-success btn-sm" id="portalCotEnviar">Presentar cotización</button></div>
    </div>`;
  document.getElementById('portalCotEnviar').onclick = async () => {
    try {
      await portalService.presentarCotizacion({
        solicitud_id: parseInt(document.getElementById('portalCotSol').value, 10),
        propuesta_tecnica: { descripcion: document.getElementById('portalCotTec').value },
        propuesta_economica: { descripcion: document.getElementById('portalCotEco').value },
      });
      alert('Cotización presentada — estado: COTIZACIÓN PRESENTADA');
    } catch (err) { alert(err.message); }
  };
}

async function loadAbsolucionesTab() {
  const cont = document.getElementById('portalContent');
  if (!solicitudActiva) {
    cont.innerHTML = '<div class="alert alert-light border">Seleccione una invitación para ver absoluciones publicadas.</div>';
    return;
  }
  const resp = await portalService.listAbsoluciones(solicitudActiva);
  const rows = resp.data || [];
  cont.innerHTML = rows.length ? rows.map((a) => `
    <div class="card mb-2"><div class="card-body py-2">
      <strong>${esc(a.asunto)}</strong>
      <div class="small">${esc(a.respuesta)}</div>
    </div></div>`).join('') : '<p class="text-muted">No hay absoluciones publicadas aún.</p>';
}

function bindPortalTabs() {
  document.querySelectorAll('[data-ptab]').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('[data-ptab]').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.dataset.ptab;
      if (name === 'invitaciones') loadInvitacionesTab();
      else if (name === 'consultas') renderConsultasForm();
      else if (name === 'cotizacion') renderCotizacionForm();
      else if (name === 'absoluciones') loadAbsolucionesTab();
    });
  });
}

export function initPortalProveedoresView() {
  session = portalService.getSession();

  document.getElementById('portalLoginBtn')?.addEventListener('click', async () => {
    try {
      await portalService.login(
        document.getElementById('portalRuc').value,
        document.getElementById('portalPass').value,
      );
      location.hash = '#/portal-proveedores';
      location.reload();
    } catch (err) { alert(err.message); }
  });

  document.getElementById('portalCambiarBtn')?.addEventListener('click', async () => {
    const nueva = document.getElementById('portalPassNueva').value;
    const conf = document.getElementById('portalPassConf').value;
    if (nueva !== conf) { alert('Las contraseñas no coinciden'); return; }
    try {
      await portalService.changePassword(document.getElementById('portalPassActual').value, nueva);
      const s = portalService.getSession();
      if (s) { s.debeCambiarPassword = false; portalService.setSession(s); }
      location.hash = '#/portal-proveedores';
      location.reload();
    } catch (err) { alert(err.message); }
  });

  document.getElementById('portalLogout')?.addEventListener('click', () => {
    portalService.logout();
    location.hash = '#/portal-proveedores';
    location.reload();
  });

  if (session && !session.debeCambiarPassword) {
    bindPortalTabs();
    loadInvitacionesTab();
  }
}

/**
 * RC8.7 — Mantenimiento → Workflow SGC
 * Pestañas: Estados | Etapas | Reglas | Transiciones | Reconciliación | Diagnóstico
 * No edita estado de expedientes a mano.
 */
const API = '/api/workflow/mantenimiento';
let activeTab = 'diagnostico';
let cache = {};

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function authHeaders() {
  try {
    const raw = localStorage.getItem('currentUser');
    if (!raw) return {};
    const u = JSON.parse(raw);
    const h = {};
    if (u?.id) h['x-user-id'] = String(u.id);
    if (u?.username || u?.nombre) h['x-user-name'] = String(u.username || u.nombre);
    if (u?.rol) h['x-user-rol'] = String(u.rol);
    return h;
  } catch (_) {
    return {};
  }
}

async function apiGet(path) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

function tabsHtml() {
  const tabs = [
    ['estados', 'Estados'],
    ['etapas', 'Etapas'],
    ['reglas', 'Reglas de Responsable'],
    ['transiciones', 'Transiciones'],
    ['reconciliacion', 'Reconciliación'],
    ['diagnostico', 'Diagnóstico'],
  ];
  return tabs.map(([id, label]) => `
    <li class="nav-item">
      <button type="button" class="nav-link ${activeTab === id ? 'active' : ''}" data-wf-tab="${id}">${esc(label)}</button>
    </li>`).join('');
}

function renderEstados(data) {
  const rows = (data.estados || []).map((e) => `
    <tr>
      <td><code>${esc(e.codigo)}</code></td>
      <td>${esc(e.label)}</td>
      <td><span class="badge text-bg-secondary">${esc(e.categoria_visual)}</span></td>
      <td>${e.activo === false ? 'No' : 'Sí'}</td>
      <td>${esc(e.orden ?? '')}</td>
    </tr>`).join('');
  return `
    <p class="small text-muted mb-2">El color sale solo de <strong>categoria_visual</strong> (sin hex por estado).</p>
    <div class="table-responsive"><table class="table table-sm table-bordered">
      <thead class="table-light"><tr><th>Código</th><th>Label</th><th>Categoría visual</th><th>Activo</th><th>Orden</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="text-muted">Sin datos</td></tr>'}</tbody>
    </table></div>`;
}

function renderEtapas(data) {
  const rows = (data.etapas || []).map((e) => `
    <tr>
      <td><code>${esc(e.codigo)}</code></td>
      <td>${esc(e.label)}</td>
      <td>${esc(e.orden_proceso ?? '')}</td>
      <td>${esc(e.modulo || '—')}</td>
      <td>${esc(e.submodulo || '—')}</td>
    </tr>`).join('');
  return `<div class="table-responsive"><table class="table table-sm table-bordered">
    <thead class="table-light"><tr><th>Código</th><th>Label</th><th>Orden</th><th>Módulo</th><th>Submódulo</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="text-muted">Sin datos</td></tr>'}</tbody>
  </table></div>`;
}

function renderReglas(data) {
  const rows = (data.reglas || []).slice(0, 80).map((r) => `
    <tr>
      <td><code>${esc(r.etapa_codigo)}</code></td>
      <td>${esc(r.tipo_fuente)}</td>
      <td>${esc(r.prioridad)}</td>
      <td>${r.permite_persona ? 'Sí' : 'No'}</td>
      <td>${r.permite_unidad ? 'Sí' : 'No'}</td>
      <td>${r.permite_pendiente ? 'Sí' : 'No'}</td>
    </tr>`).join('');
  return `
    <p class="small text-muted">Fuentes: ${(data.fuentesPermitidas || []).map(esc).join(', ')}</p>
    <div class="table-responsive"><table class="table table-sm table-bordered">
      <thead class="table-light"><tr><th>Etapa</th><th>Fuente</th><th>Prioridad</th><th>Persona</th><th>Unidad</th><th>Pendiente</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="text-muted">Sin datos</td></tr>'}</tbody>
    </table></div>`;
}

function renderTransiciones(data) {
  return `<div class="alert alert-info mb-0">${esc(data.mensaje || '')}
    <div class="mt-2 small">Edición libre de estado de expedientes: <strong>prohibida</strong>.</div>
  </div>`;
}

function renderReconciliacion() {
  return `
    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <p class="small text-muted">Analiza evidencia real y propone etapa/responsable. Apply solo admin con motivo.</p>
        <div class="row g-2 align-items-end">
          <div class="col-md-4">
            <label class="form-label small mb-0">Códigos (coma)</label>
            <input id="wfRecCodigos" class="form-control form-control-sm" value="REQ-00001,REQ-00002">
          </div>
          <div class="col-md-5">
            <label class="form-label small mb-0">Motivo (obligatorio al aplicar)</label>
            <input id="wfRecMotivo" class="form-control form-control-sm" placeholder="Obs46 / RC8.7 cierre">
          </div>
          <div class="col-md-3 d-flex gap-2">
            <button type="button" class="btn btn-sm btn-outline-primary" id="wfRecAnalizar">Analizar</button>
            <button type="button" class="btn btn-sm btn-danger" id="wfRecAplicar">Aplicar</button>
          </div>
        </div>
        <pre id="wfRecOut" class="bg-light border rounded p-2 mt-3 small" style="max-height:420px;overflow:auto">Sin análisis</pre>
      </div>
    </div>`;
}

function renderDiagnostico(data) {
  const rows = (data.matriz || []).map((m) => {
    const p = m.persistido || {};
    const e = m.evidencia || {};
    const missing = m.canonicalMissing === true;
    const diag = m.diagnostico || (missing ? 'Sin fuente canónica — requiere reconciliación' : '—');
    return `<tr class="${missing ? 'table-danger' : (m.inconsistente ? 'table-warning' : '')}">
      <td><strong>${esc(m.codigo)}</strong></td>
      <td>${missing ? esc(diag) : esc(p.estadoLabel || p.estadoCodigo || '—')}</td>
      <td>${missing ? '—' : esc(p.etapaLabel || p.etapaCodigo || '—')}</td>
      <td>${missing ? '—' : esc(
        p.responsableTipo === 'PERSONA'
          ? (p.responsableNombre || p.responsableUsername || p.responsableUsuarioId || '')
          : (p.responsableUnidad || p.responsableTipo || ''),
      )}</td>
      <td>${missing ? '—' : esc(p.responsableFuente || '—')}</td>
      <td>${missing ? '—' : esc(p.version != null ? String(p.version) : '—')}</td>
      <td>${esc(diag)}</td>
      <td>${missing ? '—' : esc(e.etapaPropuesta || '—')}</td>
    </tr>`;
  }).join('');
  const sin = (data.sinFuenteCanonica || []).map((m) => esc(m.codigo)).join(', ');
  return `
    <div class="d-flex justify-content-between mb-2 flex-wrap gap-2">
      <span class="small text-muted">Contrato canónico real (misma fuente que bandejas)</span>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="wfDiagRefresh">Actualizar</button>
    </div>
    ${sin ? `<div class="alert alert-warning py-2 small">Sin fuente canónica — requiere reconciliación: <strong>${sin}</strong></div>` : ''}
    <div class="table-responsive"><table class="table table-sm table-bordered">
      <thead class="table-light">
        <tr>
          <th>REQ</th><th>Estado</th><th>Etapa</th>
          <th>Responsable</th><th>Fuente</th><th>Versión</th>
          <th>Diagnóstico</th><th>Etapa evidencia</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="8" class="text-muted">Sin datos</td></tr>'}</tbody>
    </table></div>`;
}

export function renderWorkflowSgcView() {
  return `
    <div class="container-fluid py-3" id="wfSgcRoot">
      <h2 class="h4 mb-1">Workflow SGC</h2>
      <p class="text-muted small mb-3">Fuente única de estados, etapas, responsables y reconciliación controlada (RC8.7).</p>
      <ul class="nav nav-tabs mb-3" id="wfSgcTabs">${tabsHtml()}</ul>
      <div id="wfSgcPanel" class="py-2"><div class="text-muted">Cargando…</div></div>
    </div>`;
}

async function loadPanel() {
  const panel = document.getElementById('wfSgcPanel');
  if (!panel) return;
  panel.innerHTML = '<div class="text-muted">Cargando…</div>';
  try {
    if (activeTab === 'estados') {
      cache.estados = await apiGet('/estados');
      panel.innerHTML = renderEstados(cache.estados);
    } else if (activeTab === 'etapas') {
      cache.etapas = await apiGet('/etapas');
      panel.innerHTML = renderEtapas(cache.etapas);
    } else if (activeTab === 'reglas') {
      cache.reglas = await apiGet('/reglas-responsable');
      panel.innerHTML = renderReglas(cache.reglas);
    } else if (activeTab === 'transiciones') {
      cache.trans = await apiGet('/transiciones');
      panel.innerHTML = renderTransiciones(cache.trans);
    } else if (activeTab === 'reconciliacion') {
      panel.innerHTML = renderReconciliacion();
      bindReconcile();
    } else {
      cache.diag = await apiGet('/diagnostico?codigos=REQ-00001,REQ-00002');
      panel.innerHTML = renderDiagnostico(cache.diag);
      document.getElementById('wfDiagRefresh')?.addEventListener('click', () => loadPanel());
    }
  } catch (err) {
    panel.innerHTML = `<div class="alert alert-danger">${esc(err.message || err)}</div>`;
  }
}

function bindReconcile() {
  const out = document.getElementById('wfRecOut');
  const resolveIds = async () => {
    const codigos = String(document.getElementById('wfRecCodigos')?.value || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const diag = await apiGet(`/diagnostico?codigos=${encodeURIComponent(codigos.join(','))}`);
    // Map códigos → ids vía matriz persistida no expone id; re-analizar por códigos en body
    return { codigos, diag };
  };
  document.getElementById('wfRecAnalizar')?.addEventListener('click', async () => {
    try {
      const { codigos } = await resolveIds();
      // Resolver ids desde diagnóstico API interna: pedir reconcile dry-run sin ids filtra todos;
      // usamos diagnostico + post con códigos mapeados vía fetch requerimientos
      const res = await fetch('/api/requerimientos?limit=500', { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      const list = data.data || data.rows || data || [];
      const ids = (Array.isArray(list) ? list : [])
        .filter((r) => codigos.includes(r.codigo))
        .map((r) => r.id);
      const result = await apiPost('/reconciliar', { dryRun: true, requerimientoIds: ids });
      out.textContent = JSON.stringify(result, null, 2);
    } catch (err) {
      out.textContent = String(err.message || err);
    }
  });
  document.getElementById('wfRecAplicar')?.addEventListener('click', async () => {
    const motivo = String(document.getElementById('wfRecMotivo')?.value || '').trim();
    if (!motivo) {
      alert('Indique motivo para aplicar');
      return;
    }
    if (!confirm('¿Aplicar reconciliación? Esta acción actualiza estado/responsable vigente.')) return;
    try {
      const codigos = String(document.getElementById('wfRecCodigos')?.value || '')
        .split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch('/api/requerimientos?limit=500', { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      const list = data.data || data.rows || data || [];
      const ids = (Array.isArray(list) ? list : [])
        .filter((r) => codigos.includes(r.codigo))
        .map((r) => r.id);
      const result = await apiPost('/reconciliar', {
        dryRun: false,
        requerimientoIds: ids,
        motivo,
      });
      out.textContent = JSON.stringify(result, null, 2);
    } catch (err) {
      out.textContent = String(err.message || err);
    }
  });
}

export function initWorkflowSgcView() {
  const root = document.getElementById('wfSgcRoot');
  if (!root) return;
  root.querySelectorAll('[data-wf-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.getAttribute('data-wf-tab');
      root.querySelector('#wfSgcTabs').innerHTML = tabsHtml();
      initWorkflowSgcView();
    });
  });
  loadPanel();
}

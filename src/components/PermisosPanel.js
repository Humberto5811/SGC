import {
  MODULOS, ACTIVIDADES, emptyPermisos, getSubmodulosOfModulo, getModuloOfSubmodulo,
  getActividadesForSubmodulo,
} from '../utils/permissionsCatalog.js';

const MODULO_ICONS = {
  REQUERIMIENTOS: 'bi-file-text',
  CONTRATACIONES: 'bi-cart-check',
  EJECUCION: 'bi-graph-up',
  MANTENIMIENTO: 'bi-wrench',
};

const ACTIVIDAD_META = {
  VER: { label: 'Ver', icon: 'bi-eye' },
  CREAR: { label: 'Crear', icon: 'bi-plus-square' },
  EDITAR: { label: 'Editar', icon: 'bi-pencil' },
  ELIMINAR: { label: 'Eliminar', icon: 'bi-trash' },
  APROBAR: { label: 'Aprobar', icon: 'bi-check-circle' },
  OBSERVAR: { label: 'Observar', icon: 'bi-chat-left-dots' },
  DERIVAR: { label: 'Derivar', icon: 'bi-arrow-right-circle' },
  RECHAZAR: { label: 'Rechazar', icon: 'bi-x-circle' },
  EXPORTAR: { label: 'Exportar', icon: 'bi-box-arrow-up' },
  FIRMAR: { label: 'Firmar', icon: 'bi-pen' },
  DESCARGAR: { label: 'Descargar', icon: 'bi-download' },
};

export const PERM_PANEL_STYLES = `
.perm-panel { font-size: 13px; }
.perm-panel-toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.perm-panel-toolbar .perm-hint { color: #5f6368; font-size: 12px; margin: 0; max-width: 70%; }
.perm-panel-actions { display: flex; gap: 6px; flex-shrink: 0; }
.perm-panel-grid { display: grid; grid-template-columns: 240px 1fr; border: 1px solid #dadce0; border-radius: 8px; overflow: hidden; min-height: 380px; background: #fff; }
.perm-col { display: flex; flex-direction: column; min-height: 0; }
.perm-col-modules { background: #f8f9fa; border-right: 1px solid #dadce0; }
.perm-col-title { font-size: 11px; font-weight: 700; letter-spacing: .04em; color: #5f6368; padding: 10px 12px 6px; text-transform: uppercase; }
.perm-select-all { display: flex; align-items: center; gap: 8px; padding: 4px 12px 10px; margin: 0; cursor: pointer; color: #3c4043; font-size: 12px; border-bottom: 1px solid #e8eaed; }
.perm-mod-list { overflow-y: auto; max-height: 420px; padding: 6px; }
.perm-mod-item { display: flex; align-items: center; gap: 8px; width: 100%; border: 1px solid transparent; background: transparent; border-radius: 8px; padding: 8px 10px; text-align: left; cursor: pointer; color: #202124; }
.perm-mod-item:hover { background: #eef3fd; }
.perm-mod-item.active { background: #e8f0fe; border-color: #aecbfa; }
.perm-mod-item .perm-mod-icon { color: #1a73e8; font-size: 15px; width: 18px; text-align: center; }
.perm-mod-item .perm-mod-label { flex: 1; font-weight: 500; }
.perm-mod-item .perm-mod-chevron { color: #5f6368; font-size: 12px; }
.perm-col-subs { overflow: hidden; }
.perm-sub-scroll { overflow-y: auto; max-height: 460px; padding: 8px 10px 12px; }
.perm-sub-panel { display: none; }
.perm-sub-panel.active { display: block; }
.perm-sub-card { border: 1px solid #e8eaed; border-radius: 8px; margin-bottom: 8px; background: #fff; overflow: hidden; }
.perm-sub-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #fafafa; border-bottom: 1px solid transparent; }
.perm-sub-card.open .perm-sub-head { border-bottom-color: #e8eaed; }
.perm-sub-toggle { border: none; background: transparent; padding: 0 4px; color: #5f6368; cursor: pointer; }
.perm-sub-toggle .bi { transition: transform .15s; }
.perm-sub-card.open .perm-sub-toggle .bi { transform: rotate(90deg); }
.perm-sub-label { flex: 1; font-weight: 600; color: #202124; margin: 0; cursor: pointer; }
.perm-sub-body { display: none; padding: 10px 12px 12px; }
.perm-sub-card.open .perm-sub-body { display: block; }
.perm-act-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.perm-act-head span { font-size: 11px; color: #5f6368; text-transform: uppercase; letter-spacing: .03em; }
.perm-act-all { border: none; background: none; color: #1a73e8; font-size: 12px; padding: 0; cursor: pointer; }
.perm-act-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px; }
.perm-act-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px; border: 1px solid #e8eaed; border-radius: 8px; background: #fff; cursor: pointer; transition: border-color .15s, background .15s; }
.perm-act-item:hover { border-color: #aecbfa; background: #f8fbff; }
.perm-act-item.checked { border-color: #1a73e8; background: #e8f0fe; }
.perm-act-item input { margin: 0; }
.perm-act-item .perm-act-icon { font-size: 16px; color: #1a73e8; }
.perm-act-item .perm-act-text { font-size: 11px; color: #3c4043; text-align: center; line-height: 1.2; }
.perm-legend { display: flex; align-items: center; gap: 16px; margin-top: 12px; padding: 10px 12px; border: 1px solid #e8eaed; border-radius: 8px; background: #fafafa; font-size: 12px; color: #5f6368; }
.perm-legend-item { display: flex; align-items: center; gap: 6px; }
.perm-panel .form-check-input { width: 16px; height: 16px; border: 2px solid #9aa0a6; cursor: pointer; }
.perm-panel .form-check-input:checked { background-color: #1a73e8; border-color: #1a73e8; }
`;

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderActividades(sub, selected) {
  const subActs = getActividadesForSubmodulo(selected, sub.id);
  return ACTIVIDADES.map((act) => {
    const meta = ACTIVIDAD_META[act] || { label: act, icon: 'bi-dot' };
    const checked = subActs.includes(act);
    return `
      <label class="perm-act-item ${checked ? 'checked' : ''}" data-sub="${sub.id}">
        <input class="form-check-input perm-act" type="checkbox" data-act="${act}" data-sub="${sub.id}" ${checked ? 'checked' : ''}>
        <i class="bi ${meta.icon} perm-act-icon"></i>
        <span class="perm-act-text">${esc(meta.label)}</span>
      </label>`;
  }).join('');
}

function renderSubmodulos(mod, selected) {
  return mod.submodulos.map((sub, idx) => {
    const subChecked = selected.submodulos.includes(sub.id);
    const open = idx === 0 ? ' open' : '';
    return `
      <div class="perm-sub-card${open}" data-sub="${sub.id}" data-mod="${mod.id}">
        <div class="perm-sub-head">
          <input class="form-check-input perm-sub" type="checkbox" id="ps_${sub.id}" data-sub="${sub.id}" data-mod="${mod.id}" ${subChecked ? 'checked' : ''}>
          <button type="button" class="perm-sub-toggle" aria-label="Expandir"><i class="bi bi-chevron-right"></i></button>
          <label class="perm-sub-label" for="ps_${sub.id}">${esc(sub.label)}</label>
        </div>
        <div class="perm-sub-body">
          <div class="perm-act-head">
            <span>Actividades permitidas</span>
            <button type="button" class="perm-act-all" data-sub="${sub.id}">Seleccionar todas</button>
          </div>
          <div class="perm-act-grid">${renderActividades(sub, selected)}</div>
        </div>
      </div>`;
  }).join('');
}

export function renderPermPanel(selected, activeModId) {
  const active = activeModId || MODULOS[0]?.id || '';
  const allModsChecked = MODULOS.every((m) => selected.modulos.includes(m.id));

  const modList = MODULOS.map((mod) => {
    const icon = MODULO_ICONS[mod.id] || 'bi-folder';
    const isActive = mod.id === active;
    const checked = selected.modulos.includes(mod.id);
    return `
      <button type="button" class="perm-mod-item ${isActive ? 'active' : ''}" data-mod="${mod.id}">
        <input class="form-check-input perm-mod" type="checkbox" data-mod="${mod.id}" ${checked ? 'checked' : ''} onclick="event.stopPropagation()">
        <i class="bi ${icon} perm-mod-icon"></i>
        <span class="perm-mod-label">${esc(mod.label)}</span>
        <i class="bi bi-chevron-right perm-mod-chevron"></i>
      </button>`;
  }).join('');

  const subPanels = MODULOS.map((mod) => `
    <div class="perm-sub-panel ${mod.id === active ? 'active' : ''}" data-mod-panel="${mod.id}">
      ${renderSubmodulos(mod, selected)}
    </div>`).join('');

  return `
    <style>${PERM_PANEL_STYLES}</style>
    <div class="perm-panel" data-active-mod="${esc(active)}">
      <div class="perm-panel-toolbar">
        <p class="perm-hint">Seleccione los módulos, submódulos y actividades que el usuario puede realizar en el sistema.</p>
        <div class="perm-panel-actions">
          <button type="button" class="btn btn-sm btn-outline-secondary perm-expand-all"><i class="bi bi-arrows-expand"></i> Expandir todo</button>
          <button type="button" class="btn btn-sm btn-outline-secondary perm-collapse-all"><i class="bi bi-arrows-collapse"></i> Contraer todo</button>
        </div>
      </div>
      <div class="perm-panel-grid">
        <div class="perm-col perm-col-modules">
          <div class="perm-col-title">Módulos</div>
          <label class="perm-select-all">
            <input class="form-check-input perm-all-mods" type="checkbox" ${allModsChecked ? 'checked' : ''}>
            Seleccionar todos
          </label>
          <div class="perm-mod-list">${modList}</div>
        </div>
        <div class="perm-col perm-col-subs">
          <div class="perm-col-title">Submódulos y actividades</div>
          <div class="perm-sub-scroll">${subPanels}</div>
        </div>
      </div>
      <div class="perm-legend">
        <strong>Leyenda:</strong>
        <span class="perm-legend-item"><input class="form-check-input" type="checkbox" checked disabled> Con acceso</span>
        <span class="perm-legend-item"><input class="form-check-input" type="checkbox" disabled> Sin acceso</span>
      </div>
    </div>`;
}

export function readPermisosFromPanel(container) {
  const root = container.querySelector('.perm-panel') || container;
  const p = emptyPermisos();
  root.querySelectorAll('.perm-mod:checked').forEach((el) => p.modulos.push(el.dataset.mod));
  root.querySelectorAll('.perm-sub:checked').forEach((el) => p.submodulos.push(el.dataset.sub));

  const actividadesPorSubmodulo = {};
  root.querySelectorAll('.perm-sub:checked').forEach((subEl) => {
    const subId = subEl.dataset.sub;
    const acts = [];
    root.querySelectorAll(`.perm-act[data-sub="${subId}"]:checked`).forEach((a) => acts.push(a.dataset.act));
    // RC119: submódulo marcado sin actividades → VER mínimo (acceso al menú)
    if (!acts.length) acts.push('VER');
    actividadesPorSubmodulo[subId] = [...new Set(acts)];
  });
  p.actividadesPorSubmodulo = actividadesPorSubmodulo;
  p.actividades = [...new Set(Object.values(actividadesPorSubmodulo).flat())];

  p.modulos = [...new Set(p.modulos)];
  p.submodulos = [...new Set(p.submodulos)];
  return p;
}

function syncActItemStyle(container, subId) {
  container.querySelectorAll(`.perm-act-item[data-sub="${subId}"]`).forEach((item) => {
    const chk = item.querySelector('.perm-act');
    item.classList.toggle('checked', !!chk?.checked);
  });
}

function setSubExpanded(card, open) {
  card.classList.toggle('open', open);
}

function selectModule(panel, modId) {
  panel.dataset.activeMod = modId;
  panel.querySelectorAll('.perm-mod-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mod === modId);
  });
  panel.querySelectorAll('.perm-sub-panel').forEach((p) => {
    p.classList.toggle('active', p.dataset.modPanel === modId);
  });
}

export function bindPermPanel(container, onChange) {
  const panel = container.querySelector('.perm-panel');
  if (!panel) return;

  const notify = () => { if (onChange) onChange(readPermisosFromPanel(container)); };

  panel.querySelector('.perm-all-mods')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    panel.querySelectorAll('.perm-mod').forEach((el) => { el.checked = checked; });
    MODULOS.forEach((mod) => {
      panel.querySelectorAll(`.perm-sub[data-mod="${mod.id}"]`).forEach((s) => { s.checked = checked; });
      getSubmodulosOfModulo(mod.id).forEach((sid) => {
        if (checked) {
          const ver = panel.querySelector(`.perm-act[data-sub="${sid}"][data-act="VER"]`);
          if (ver) ver.checked = true;
        } else {
          panel.querySelectorAll(`.perm-act[data-sub="${sid}"]`).forEach((a) => { a.checked = false; });
        }
        syncActItemStyle(panel, sid);
      });
    });
    notify();
  });

  panel.querySelectorAll('.perm-mod').forEach((el) => {
    el.addEventListener('change', () => {
      const modId = el.dataset.mod;
      const subs = getSubmodulosOfModulo(modId);
      panel.querySelectorAll(`.perm-sub[data-mod="${modId}"]`).forEach((s) => { s.checked = el.checked; });
      if (el.checked) {
        subs.forEach((sid) => {
          const ver = panel.querySelector(`.perm-act[data-sub="${sid}"][data-act="VER"]`);
          if (ver) ver.checked = true;
          syncActItemStyle(panel, sid);
        });
      } else {
        subs.forEach((sid) => {
          panel.querySelectorAll(`.perm-act[data-sub="${sid}"]`).forEach((a) => { a.checked = false; });
          syncActItemStyle(panel, sid);
        });
      }
      notify();
    });
  });

  panel.querySelectorAll('.perm-mod-item').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('perm-mod')) return;
      selectModule(panel, btn.dataset.mod);
    });
  });

  panel.querySelectorAll('.perm-sub').forEach((el) => {
    el.addEventListener('change', () => {
      const subId = el.dataset.sub;
      const modId = el.dataset.mod;
      if (el.checked) {
        panel.querySelector(`.perm-mod[data-mod="${modId}"]`).checked = true;
        // Auto-marcar VER al habilitar submódulo
        const ver = panel.querySelector(`.perm-act[data-sub="${subId}"][data-act="VER"]`);
        if (ver) ver.checked = true;
      } else {
        panel.querySelectorAll(`.perm-act[data-sub="${subId}"]`).forEach((a) => { a.checked = false; });
      }
      syncActItemStyle(panel, subId);
      notify();
    });
  });

  panel.querySelectorAll('.perm-act').forEach((el) => {
    el.addEventListener('change', () => {
      const subId = el.dataset.sub;
      const modId = getModuloOfSubmodulo(subId);
      if (el.checked) {
        panel.querySelector(`.perm-sub[data-sub="${subId}"]`).checked = true;
        if (modId) panel.querySelector(`.perm-mod[data-mod="${modId}"]`).checked = true;
      }
      syncActItemStyle(panel, subId);
      notify();
    });
  });

  panel.querySelectorAll('.perm-act-all').forEach((btn) => {
    btn.addEventListener('click', () => {
      const subId = btn.dataset.sub;
      const acts = panel.querySelectorAll(`.perm-act[data-sub="${subId}"]`);
      const allChecked = [...acts].every((a) => a.checked);
      acts.forEach((a) => { a.checked = !allChecked; });
      panel.querySelector(`.perm-sub[data-sub="${subId}"]`).checked = !allChecked;
      const modId = getModuloOfSubmodulo(subId);
      if (modId && !allChecked) panel.querySelector(`.perm-mod[data-mod="${modId}"]`).checked = true;
      syncActItemStyle(panel, subId);
      notify();
    });
  });

  panel.querySelectorAll('.perm-sub-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.perm-sub-card');
      if (card) setSubExpanded(card, !card.classList.contains('open'));
    });
  });

  panel.querySelectorAll('.perm-sub-label').forEach((lbl) => {
    lbl.addEventListener('dblclick', () => {
      const card = lbl.closest('.perm-sub-card');
      if (card) setSubExpanded(card, !card.classList.contains('open'));
    });
  });

  panel.querySelector('.perm-expand-all')?.addEventListener('click', () => {
    panel.querySelectorAll('.perm-sub-card').forEach((c) => setSubExpanded(c, true));
  });

  panel.querySelector('.perm-collapse-all')?.addEventListener('click', () => {
    panel.querySelectorAll('.perm-sub-card').forEach((c) => setSubExpanded(c, false));
  });
}

export function mountPermPanel(container, selected, activeModId, onChange) {
  const prev = container.querySelector('.perm-panel')?.dataset.activeMod;
  const active = activeModId || prev || MODULOS[0]?.id;
  container.innerHTML = renderPermPanel(selected, active);
  bindPermPanel(container, onChange);
  return active;
}

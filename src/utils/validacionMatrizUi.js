/**
 * RC7.7B/C — Render / collect de matriz institucional (Bienes / Servicios).
 * Encabezados horizontales + scroll controlado.
 */
import {
  getValidacionConfig,
  TIPO_VALIDACION,
  OBS_MAX_CHARS,
  calcularResultadoCotizacion,
  calcularResultadoExpedienteValidacion,
  validarMatrizCompleta,
  filasV2ToLegacyItems,
} from './validacionFormatosConfig.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLES = `
.val-mtx-wrap { overflow-x: auto; max-width: 100%; border: 1px solid #dee2e6; border-radius: .25rem; }
.val-mtx-table { font-size: .75rem; margin-bottom: 0; min-width: 2480px; }
.val-mtx-table thead th {
  position: sticky; top: 0; z-index: 1;
  white-space: normal; writing-mode: horizontal-tb; transform: none;
  vertical-align: middle; text-align: center; font-weight: 600;
  min-width: 72px; max-width: 140px; padding: .4rem .35rem; line-height: 1.2;
}
.val-mtx-table th.val-mtx-auto { background: #cfe8f5 !important; color: #0a4275; }
.val-mtx-table th.val-mtx-eval {
  background: #d4edda !important; color: #155724;
  min-width: 148px; max-width: 210px; font-size: .65rem; line-height: 1.2;
  vertical-align: bottom; padding: .55rem .4rem; font-weight: 700;
}
.val-mtx-table th.val-mtx-resultado {
  min-width: 320px; max-width: 380px;
}
.val-mtx-table td.val-mtx-resultado {
  min-width: 320px; max-width: 380px;
}
.val-mtx-table select.val-mtx-resultado-sel {
  min-width: 310px; max-width: 100%; width: 100%;
  white-space: normal;
  text-overflow: clip;
}
.val-mtx-table th.val-mtx-docs { background: #cfe8f5 !important; color: #0a4275; min-width: 64px; }
.val-mtx-table th.val-mtx-wide { min-width: 140px; max-width: 220px; }
.val-mtx-table th.val-mtx-obs { min-width: 220px; max-width: 300px; font-size: .65rem; }
.val-mtx-table td.val-mtx-auto { background: #eef7fb; }
.val-mtx-table td.val-mtx-eval { background: #f3faf4; }
.val-mtx-table textarea.val-mtx-obs { min-width: 180px; min-height: 56px; font-size: .72rem; resize: vertical; }
.val-mtx-table .form-select-sm { font-size: .72rem; min-width: 110px; }
.val-mtx-legend span { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
.val-mtx-firma { max-width: 480px; margin-top: 1rem; }
.val-mtx-cell-clip { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

export function renderMatrizStyles() {
  return `<style>${STYLES}</style>`;
}

/**
 * @param {object} opts
 * @param {string} opts.prefix
 * @param {object} opts.matriz_v2
 * @param {string} opts.tipoFormato
 * @param {boolean} opts.readonly
 * @param {object} opts.meta — fecha, profesional, sustento, observacion_global
 */
export function renderMatrizValidacion(opts = {}) {
  const {
    prefix,
    matriz_v2,
    tipoFormato,
    readonly = false,
    meta = {},
  } = opts;

  const { tipoKey, config } = getValidacionConfig(tipoFormato || matriz_v2?.tipo);
  if (tipoKey === TIPO_VALIDACION.LOCADORES || !config) {
    return `
      <div class="alert alert-warning small">
        El formato institucional completo de Validación para <strong>Locadores</strong> no está incluido en este paquete.
        No se utiliza el formato de Bienes.
      </div>`;
  }

  const filas = matriz_v2?.filas || [];
  const cols = config.columnas;
  const calc = calcularResultadoExpedienteValidacion(tipoKey, filas);

  const thead = cols.map((c) => {
    let cls = c.kind === 'eval' ? 'val-mtx-eval' : (c.kind === 'docs' ? 'val-mtx-docs' : 'val-mtx-auto');
    if (c.key === 'descripcion' || c.key === 'razon_social') cls += ' val-mtx-wide';
    if (c.key === 'resultado') cls += ' val-mtx-resultado';
    if (c.input === 'textarea' || c.key === 'observaciones' || c.key === 'obs_specs') cls += ' val-mtx-obs';
    // Evaluación (verde): texto institucional completo; automáticos pueden usar short
    const label = c.kind === 'eval' ? c.label : (c.short || c.label);
    return `<th class="${cls}" title="${esc(c.label)}" scope="col">${esc(label)}</th>`;
  }).join('');

  const tbody = filas.map((fila, idx) => {
    const auto = fila.automaticos || {};
    const ev = fila.evaluacion || {};
    const cells = cols.map((c) => {
      if (c.kind === 'auto') {
        const val = auto[c.key];
        const display = (val === '' || val == null) ? '—' : String(val);
        const clip = (c.key === 'descripcion' || c.key === 'razon_social') ? ' val-mtx-cell-clip' : '';
        return `<td class="val-mtx-auto small${clip}" data-auto="${esc(c.key)}" title="${esc(display)}">${esc(display)}</td>`;
      }
      if (c.kind === 'docs') {
        return `<td class="text-center">
          <button type="button" class="btn btn-sm btn-outline-primary val-mtx-docs-btn"
            data-cot-id="${esc(fila.cotizacion_id)}"
            data-req-id="${esc(fila.requerimiento_id || '')}"
            data-req-codigo="${esc(fila.requerimiento_codigo || '')}"
            title="Ver documentos técnicos"
            ${readonly ? '' : ''}>
            <i class="bi bi-eye"></i>
          </button>
        </td>`;
      }
      const val = ev[c.key] ?? '';
      if (c.input === 'select') {
        // Compat: valores legacy con acento o NO REQUIERE siguen seleccionables si están el valor guardado
        const baseOpts = [...(c.options || [])];
        const valNorm = String(val || '');
        if (valNorm && !baseOpts.includes(valNorm)) baseOpts.push(valNorm);
        const optsHtml = baseOpts.map((o) =>
          `<option value="${esc(o)}"${String(o) === valNorm ? ' selected' : ''}>${esc(o || '—')}</option>`).join('');
        const isResultado = c.key === 'resultado';
        const tdCls = isResultado ? 'val-mtx-eval val-mtx-resultado' : 'val-mtx-eval';
        const selCls = isResultado
          ? 'form-select form-select-sm val-mtx-f val-mtx-resultado-sel'
          : 'form-select form-select-sm val-mtx-f';
        return `<td class="${tdCls}">
          <select class="${selCls}" data-idx="${idx}" data-field="${esc(c.key)}"
            aria-label="${esc(c.label)}" title="${esc(valNorm || c.label)}" ${readonly ? 'disabled' : ''}>${optsHtml}</select>
        </td>`;
      }
      const len = String(val || '').length;
      return `<td class="val-mtx-eval">
        <textarea class="form-control form-control-sm val-mtx-obs val-mtx-f" data-idx="${idx}" data-field="${esc(c.key)}"
          aria-label="${esc(c.short || c.label)}" maxlength="${OBS_MAX_CHARS}" rows="2"
          ${readonly ? 'readonly' : ''}>${esc(val)}</textarea>
        <div class="text-muted" style="font-size:.65rem">${len}/${OBS_MAX_CHARS}</div>
      </td>`;
    }).join('');
    return `<tr data-idx="${idx}" data-item-key="${esc(fila.item_key)}">${cells}</tr>`;
  }).join('');

  const fecha = meta.fecha || new Date().toLocaleDateString('es-PE');
  const profesional = meta.profesional || '';

  return `
    ${renderMatrizStyles()}
    <div class="mb-2">
      <h6 class="fw-semibold mb-0">Registro de Validación — ${esc(config.label)}</h6>
      <div class="val-mtx-legend small text-muted mt-1">
        <span style="background:#cfe8f5"></span> Automático (solo lectura)
        <span class="ms-2" style="background:#d4edda"></span> Evaluación del Área Usuaria
      </div>
      <input type="hidden" id="${prefix}_resGlobal" value="${esc(calc.ok ? (calc.resultado_global || '') : '')}">
      <input type="hidden" id="${prefix}_cumple" value="${esc(calc.ok ? (calc.cumple || '') : '')}">
    </div>
    <div class="val-mtx-wrap" id="${prefix}_mtxWrap">
      <table class="table table-bordered table-sm val-mtx-table" id="${prefix}_mtx">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody || `<tr><td colspan="${cols.length}" class="text-muted text-center">Sin ítems para validar.</td></tr>`}</tbody>
      </table>
    </div>
    <div class="val-mtx-firma border rounded p-3 bg-light">
      <div class="small mb-2"><span class="text-muted">Lugar:</span> <strong>Chorrillos</strong>
        <span class="ms-3 text-muted">Fecha:</span> <strong id="${prefix}_fechaAuto">${esc(fecha)}</strong></div>
      <div class="small mb-3"><span class="text-muted">Nombre y apellido del profesional que realizó la validación:</span><br>
        <strong id="${prefix}_respAuto">${esc(profesional)}</strong></div>
      <div class="small text-muted mb-1">Firma:</div>
      <div style="border-bottom:1px solid #495057;height:48px;max-width:320px"></div>
    </div>`;
}

/** Lee matriz desde DOM + filas base. */
export function collectMatrizFromDom(prefix, matrizBase) {
  const tipoKey = matrizBase?.tipo || 'BIENES';
  const filas = (matrizBase?.filas || []).map((fila, idx) => {
    const ev = { ...(fila.evaluacion || {}) };
    document.querySelectorAll(`#${prefix}_mtx tr[data-idx="${idx}"] .val-mtx-f`).forEach((el) => {
      const field = el.dataset.field;
      if (field) ev[field] = el.value;
    });
    return {
      ...fila,
      evaluacion: ev,
      resultado: ev.resultado || '',
      observaciones: ev.observaciones || '',
    };
  });
  const calc = calcularResultadoExpedienteValidacion(tipoKey, filas);
  const resEl = document.getElementById(`${prefix}_resGlobal`);
  const cumpleEl = document.getElementById(`${prefix}_cumple`);
  if (resEl) resEl.value = calc.ok ? (calc.resultado_global || '') : '';
  if (cumpleEl) cumpleEl.value = calc.ok ? (calc.cumple || '') : '';

  // Obs. de remisión = observaciones de filas (ya no hay campos separados debajo de la matriz)
  const obsFilas = filas
    .map((f) => String(f.evaluacion?.observaciones || f.observaciones || '').trim())
    .filter(Boolean)
    .join(' | ');

  return {
    matriz_v2: {
      version: 2,
      tipo: tipoKey,
      cotizacion_id: matrizBase.cotizacion_id,
      proveedor_id: matrizBase.proveedor_id,
      solicitud_id: matrizBase.solicitud_id,
      filas,
    },
    formulario_07a: {
      items: filasV2ToLegacyItems(filas, tipoKey),
      resultado_global: calc.ok ? calc.resultado_global : '',
      cumple: calc.ok ? calc.cumple : '',
      observacion_global: obsFilas || (calc.ok ? calc.resultado_global : '') || '',
      sustento: '',
      fecha: document.getElementById(`${prefix}_fechaAuto`)?.textContent || new Date().toLocaleDateString('es-PE'),
      profesional: document.getElementById(`${prefix}_respAuto`)?.textContent || '',
      producto_adquisicion: '',
      lugar: 'Chorrillos',
    },
    calc,
    checkCompleta: validarMatrizCompleta(tipoKey, filas),
  };
}

export function bindMatrizUi(prefix, { onChange, onDocsClick, readonly } = {}) {
  const wrap = document.getElementById(`${prefix}_mtxWrap`);
  if (!wrap) return;
  wrap.querySelectorAll('.val-mtx-f').forEach((el) => {
    el.addEventListener('change', () => {
      if (el.dataset.field === 'resultado') el.title = el.value || el.getAttribute('aria-label') || '';
      if (onChange) onChange();
    });
    el.addEventListener('input', () => {
      if (el.tagName === 'TEXTAREA') {
        const counter = el.parentElement?.querySelector('.text-muted');
        if (counter) counter.textContent = `${el.value.length}/${OBS_MAX_CHARS}`;
      }
      if (onChange) onChange();
    });
  });
  wrap.querySelectorAll('.val-mtx-docs-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (onDocsClick) onDocsClick(btn);
    });
  });
  void readonly;
}

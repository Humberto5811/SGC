/**
 * Render matriz Cuadro Comparativo Bienes — Anexo 8A (RC8.3.1).
 * Columnas fijas (ítem) + columnas verticales por cotización / segunda fuente.
 */

export const TIPOS_SEGUNDA_FUENTE = Object.freeze([
  { code: 'ORDEN_COMPRA_ANTERIOR', label: 'Orden de compra anterior' },
  { code: 'CONTRATO_ANTERIOR', label: 'Contrato anterior' },
  { code: 'PAGINA_WEB', label: 'Página web' },
  { code: 'CATALOGO', label: 'Catálogo' },
  { code: 'PRESUPUESTO', label: 'Presupuesto' },
  { code: 'ESTRUCTURA_COSTOS', label: 'Estructura de costos' },
  { code: 'OTRA', label: 'Otra fuente' },
]);

export function labelTipoSegundaFuente(code) {
  return TIPOS_SEGUNDA_FUENTE.find((t) => t.code === code)?.label || code || '—';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtNum(n) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function badgeVal(estado) {
  const v = String(estado || '').toUpperCase();
  if (v === 'APTO') return 'success';
  if (v === 'NO_APTO' || v === 'OBSERVADO') return 'secondary';
  return 'warning';
}

function na(v, fallback = '—') {
  const s = String(v == null ? '' : v).trim();
  if (!s || s === 'undefined' || s === 'null') return fallback;
  return s;
}

export function getFuentesVista(matriz = {}) {
  const primera = Array.isArray(matriz.primera_fuente) && matriz.primera_fuente.length
    ? matriz.primera_fuente
    : (matriz.resumen_proveedores || []).map((p, idx) => ({
      id: `cot-${p.cotizacion_id || p.proveedor_id}`,
      tipo: 'COTIZACION',
      nro: idx + 1,
      label: `Cotización N.° ${idx + 1}`,
      cotizacion_id: p.cotizacion_id,
      proveedor_id: p.proveedor_id,
      datos_proveedor: {
        razon_social: p.razon_social,
        ruc: p.ruc,
        contacto: '—',
        telefono: '—',
        correo: '—',
      },
      validacion_estado: p.validacion_estado,
      cumple_tecnicamente: !!p.cumple_tecnicamente,
      precios_por_item: Object.fromEntries((matriz.items || []).map((it) => {
        const of = (it.ofertas || []).find((o) => Number(o.proveedor_id) === Number(p.proveedor_id));
        return [it.item_key, {
          precio_unitario: of?.precio_unitario ?? null,
          precio_total: of?.precio_total ?? null,
        }];
      })),
      info_por_item: {},
      acciones_administrativas: {},
      readonly: true,
    }));
  const segunda = Array.isArray(matriz.segunda_fuente) ? matriz.segunda_fuente : [];
  return { primera, segunda, todas: [...primera, ...segunda] };
}

export function renderResumenProveedores(resumen = []) {
  if (!resumen.length) return '<div class="text-muted small">Sin proveedores (primera fuente)</div>';
  return `
    <table class="table table-sm table-bordered mb-3">
      <thead class="table-light"><tr>
        <th>Cotización</th><th>Proveedor</th><th>RUC</th><th>Validación</th><th>Total ofertado</th>
      </tr></thead>
      <tbody>${resumen.map((p, i) => {
    const apto = String(p.validacion_estado || '').toUpperCase() === 'APTO';
    return `
        <tr class="${apto ? '' : 'table-secondary text-muted'}">
          <td class="small">N.° ${i + 1}</td>
          <td class="small">${esc(p.razon_social)}${apto ? '' : ' <span class="badge bg-secondary">No adjudicar</span>'}</td>
          <td class="small">${esc(p.ruc)}</td>
          <td><span class="badge bg-${badgeVal(p.validacion_estado)}">${esc(p.validacion_estado || '—')}</span></td>
          <td class="text-end small">${apto ? fmtNum(p.total_ofertado) : '—'}</td>
        </tr>`;
  }).join('')}</tbody>
    </table>`;
}

export function renderInconsistencias(list = []) {
  if (!list.length) {
    return '<div class="alert alert-success py-2 small mb-3">Sin inconsistencias económicas detectadas.</div>';
  }
  return `
    <div class="alert alert-warning py-2 small mb-3">
      <strong>Información incompleta / inconsistencias</strong>
      <ul class="mb-0 mt-1">${list.slice(0, 40).map((i) => `
        <li>${esc(i.mensaje || i.tipo)}${i.item_key ? ` <span class="text-muted">[${esc(i.item_key)}]</span>` : ''}</li>`).join('')}
      </ul>
    </div>`;
}

export function renderAdvertenciasAdjudicacion(matriz) {
  const adv = matriz?.advertencias || {};
  const parts = [];
  if (adv.menos_de_tres_presentadas) {
    parts.push(`<div class="alert alert-warning py-2 small mb-2">${esc(adv.mensaje_menos_de_tres
      || 'Existen menos de tres cotizaciones válidas. Registre el sustento y considere agregar segunda fuente.')}
      <div class="text-muted mt-1">Presentadas: ${esc(adv.cotizaciones_presentadas)} · APTO: ${esc(adv.cotizaciones_aptas)}</div>
    </div>`);
  }
  if (matriz?.meta?.hay_empate || (matriz?.items || []).some((i) => i.empate)) {
    parts.push('<div class="alert alert-info py-2 small mb-2"><strong>EMPATE</strong> en uno o más ítems: no hay selección automática. Indique metodología y sustento.</div>');
  }
  const nSf = (matriz?.segunda_fuente || []).length;
  parts.push(`<p class="small text-muted mb-2">Estructura Anexo 8A · Primera fuente: cotizaciones · Segunda fuente: ${nSf} referencia(s). PDF oficial bloqueado hasta estabilizar matriz (solo borrador).</p>`);
  return parts.join('');
}

/**
 * Matriz principal Anexo 8A: columnas fijas + PU/PT por fuente + valor adjudicado.
 */
export function renderMatrizBienesHtml(matriz, opts = {}) {
  const editable = opts.editable !== false;
  const items = matriz?.items || [];
  const { primera, segunda, todas } = getFuentesVista(matriz);

  if (!items.length) {
    return '<div class="alert alert-light border">No hay ítems para comparar.</div>';
  }

  const colSpanCot = 2; // PU + PT (segunda fuente: PU + factor + actualizado + PT = 4)
  const headFuentes = todas.map((f) => {
    const isSf = f.tipo === 'SEGUNDA_FUENTE' || f.tipo_fuente;
    const span = isSf ? 4 : colSpanCot;
    const title = isSf
      ? `${esc(f.label || 'Segunda fuente')} — ${esc(f.tipo_fuente_label || labelTipoSegundaFuente(f.tipo_fuente))}`
      : esc(f.label || `Cotización N.° ${f.nro}`);
    const sub = isSf
      ? esc(f.denominacion || f.entidad || '—')
      : `${esc(f.datos_proveedor?.razon_social || '—')}<div class="text-muted" style="font-size:0.65rem">${esc(f.datos_proveedor?.ruc || '')} · ${esc(f.validacion_estado || '')}</div>`;
    return `<th colspan="${span}" class="text-center ${isSf ? 'table-warning' : 'table-success'}">
      <div class="small fw-semibold">${title}</div>
      <div class="small">${sub}</div>
    </th>`;
  }).join('');

  const subHead = todas.map((f) => {
    const isSf = f.tipo === 'SEGUNDA_FUENTE' || f.tipo_fuente;
    if (isSf) {
      return `<th class="small">P. unit.</th><th class="small">Factor</th><th class="small">P. act.</th><th class="small">P. total</th>`;
    }
    return `<th class="small">P. unit.</th><th class="small">P. total</th>`;
  }).join('');

  const body = items.map((it, idx) => {
    const cells = todas.map((f) => {
      const isSf = f.tipo === 'SEGUNDA_FUENTE' || f.tipo_fuente;
      const pr = (f.precios_por_item || {})[it.item_key] || {};
      if (isSf) {
        return `
          <td class="small text-end">${fmtNum(pr.precio_unitario ?? pr.precio_original)}</td>
          <td class="small text-end">${pr.factor_ajuste != null ? esc(pr.factor_ajuste) : '—'}</td>
          <td class="small text-end">${fmtNum(pr.precio_actualizado)}</td>
          <td class="small text-end">${fmtNum(pr.precio_total_actualizado ?? pr.precio_total)}</td>`;
      }
      const of = (it.ofertas || []).find((o) => Number(o.proveedor_id) === Number(f.proveedor_id)) || {};
      const pu = pr.precio_unitario ?? of.precio_unitario;
      const pt = pr.precio_total ?? of.precio_total;
      const muted = !f.cumple_tecnicamente ? 'table-secondary text-muted' : '';
      return `
        <td class="small text-end ${muted}">${fmtNum(pu)}</td>
        <td class="small text-end ${muted}">${fmtNum(pt)}</td>`;
    }).join('');

    const adjFuente = it.fuente_adjudicada_id || it.adjudicacion_fuente_id || '';
    const adjOpts = todas.map((f) => {
      const isSf = f.tipo === 'SEGUNDA_FUENTE' || f.tipo_fuente;
      const label = isSf ? (f.denominacion || f.label) : (f.datos_proveedor?.razon_social || f.label);
      const val = f.id || f.id_fuente;
      const selected = String(adjFuente) === String(val)
        || (!adjFuente && Number(it.proveedor_adjudicado_id) === Number(f.proveedor_id));
      const disabled = !isSf && !f.cumple_tecnicamente ? 'disabled' : '';
      return `<option value="${esc(val)}" data-tipo="${esc(isSf ? 'SEGUNDA_FUENTE' : 'COTIZACION')}"
        data-proveedor-id="${esc(f.proveedor_id || '')}" ${selected ? 'selected' : ''} ${disabled}>${esc(label)}</option>`;
    }).join('');

    const adjSelect = editable
      ? `<select class="form-select form-select-sm cc-adj-fuente" data-item-key="${esc(it.item_key)}">
          <option value="">— Seleccione —</option>${adjOpts}
        </select>`
      : `<span class="small">${esc(it.adjudicado_razon_social || adjFuente || '—')}</span>`;

    return `
      <tr>
        <td class="small text-center sticky-col">${idx + 1}</td>
        <td class="small sticky-col">${esc(it.requerimiento_codigo || '—')}</td>
        <td class="small">${esc(it.codigo_sigamef || '—')}</td>
        <td class="small" style="min-width:160px">${esc(it.descripcion || '—')}</td>
        <td class="small text-center">${esc(it.unidad_medida || 'UND')}</td>
        <td class="small text-center">${it.cantidad != null ? esc(it.cantidad) : '—'}</td>
        ${cells}
        <td class="small bg-warning-subtle">${adjSelect}</td>
        <td class="small text-end bg-warning-subtle">${fmtNum(it.valor_adjudicado_unitario)}</td>
        <td class="small text-end bg-warning-subtle">${fmtNum(it.valor_adjudicado_item)}</td>
      </tr>`;
  }).join('');

  return `
    <style>
      .cc-matriz-wrap { max-height: 55vh; overflow: auto; }
      .cc-matriz-table { font-size: 0.78rem; }
      .cc-matriz-table thead th { position: sticky; top: 0; z-index: 2; }
      .cc-matriz-table .sticky-col { position: sticky; left: 0; background: #fff; z-index: 1; }
    </style>
    <div class="table-responsive cc-matriz-wrap">
      <table class="table table-sm table-bordered mb-0 align-middle cc-matriz-table">
        <thead class="table-light">
          <tr>
            <th rowspan="2" class="small sticky-col">Ítem N.°</th>
            <th rowspan="2" class="small sticky-col">N.° REQ</th>
            <th rowspan="2" class="small">Código SIGAMEF</th>
            <th rowspan="2" class="small">Descripción</th>
            <th rowspan="2" class="small">UM</th>
            <th rowspan="2" class="small">Cant.</th>
            ${headFuentes}
            <th colspan="3" class="text-center table-warning">VALOR ADJUDICADO</th>
          </tr>
          <tr>
            ${subHead}
            <th class="small">Fuente</th>
            <th class="small">V. unit.</th>
            <th class="small">V. total</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="small text-muted mt-2 mb-0">
      Primera fuente (cotizaciones) en columnas verticales. Segunda fuente opcional a la derecha.
      Precios y datos de proveedores son de solo lectura.
    </p>`;
}

/** Matriz inferior: información adicional alineada por fuente. */
export function renderInfoAdicionalFuentes(matriz) {
  const { todas } = getFuentesVista(matriz);
  if (!todas.length) return '';
  const rows = [
    ['Marca', 'marca'],
    ['Modelo', 'modelo'],
    ['Procedencia', 'procedencia'],
    ['Año de fabricación', 'anio_fabricacion'],
    ['Garantía comercial', 'garantia'],
    ['Plazo de entrega', 'plazo_entrega'],
    ['Forma de pago', 'forma_pago'],
    ['Moneda de la fuente', 'moneda'],
  ];
  const head = todas.map((f) => {
    const isSf = f.tipo === 'SEGUNDA_FUENTE' || f.tipo_fuente;
    return `<th class="small text-center ${isSf ? 'table-warning' : ''}">${esc(f.label || f.denominacion || '—')}</th>`;
  }).join('');
  const body = rows.map(([label, key]) => {
    const cells = todas.map((f) => {
      const isSf = f.tipo === 'SEGUNDA_FUENTE' || f.tipo_fuente;
      const fallback = isSf ? 'NO APLICA' : '—';
      const val = f.informacion_adicional?.[key]
        || Object.values(f.info_por_item || {})[0]?.[key]
        || fallback;
      return `<td class="small text-center">${esc(na(val, fallback))}</td>`;
    }).join('');
    return `<tr><th class="small table-light">${esc(label)}</th>${cells}</tr>`;
  }).join('');
  return `
    <h6 class="fw-bold mt-3">Información adicional de la fuente</h6>
    <div class="table-responsive">
      <table class="table table-sm table-bordered mb-3">
        <thead class="table-light"><tr><th class="small">Dato</th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

/** Acciones administrativas por fuente. */
export function renderAccionesAdministrativas(matriz, opts = {}) {
  const editable = opts.editable !== false;
  const { todas } = getFuentesVista(matriz);
  if (!todas.length) return '';
  const fields = [
    ['fecha_solicitud', 'Fecha de solicitud', 'date'],
    ['reiteraciones', 'Cantidad de reiteraciones', 'number'],
    ['fecha_recepcion', 'Fecha de recepción', 'date'],
    ['dedicado_objeto', 'Se dedica al objeto de la contratación', 'bool'],
    ['au_participo_rtm', 'AU participó en verificación RTM', 'bool'],
    ['cumple_rtm_o_similar', 'Cumple RTM / igual o similar', 'bool'],
    ['tomo_valor_referencial', 'Se tomó en cuenta para valor referencial', 'bool'],
  ];
  const head = todas.map((f) => `<th class="small text-center">${esc(f.label || '—')}</th>`).join('');
  const body = fields.map(([key, label, type]) => {
    const cells = todas.map((f) => {
      const aa = f.acciones_administrativas || {};
      const val = aa[key];
      const fid = f.id || f.id_fuente;
      const ro = !editable || f.readonly && f.tipo === 'COTIZACION' && ['cumple_rtm_o_similar'].includes(key);
      if (type === 'bool') {
        if (!editable) {
          return `<td class="small text-center">${val == null ? '—' : (val ? 'Sí' : 'No')}</td>`;
        }
        return `<td class="text-center">
          <select class="form-select form-select-sm cc-aa-field" data-fuente-id="${esc(fid)}" data-field="${key}" ${ro ? 'disabled' : ''}>
            <option value="">—</option>
            <option value="1" ${val === true ? 'selected' : ''}>Sí</option>
            <option value="0" ${val === false ? 'selected' : ''}>No</option>
          </select>
        </td>`;
      }
      if (!editable) {
        return `<td class="small text-center">${esc(val != null && val !== '' ? val : '—')}</td>`;
      }
      return `<td>
        <input type="${type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}"
          class="form-control form-control-sm cc-aa-field" data-fuente-id="${esc(fid)}" data-field="${key}"
          value="${esc(val != null ? String(val).slice(0, 40) : '')}" ${f.readonly && key === 'fecha_recepcion' ? '' : ''}>
      </td>`;
    }).join('');
    return `<tr><th class="small table-light">${esc(label)}</th>${cells}</tr>`;
  }).join('');
  return `
    <h6 class="fw-bold">Acciones administrativas</h6>
    <div class="table-responsive mb-3">
      <table class="table table-sm table-bordered mb-0">
        <thead class="table-light"><tr><th class="small">Acción</th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

export function renderPanelSegundaFuente(matriz, opts = {}) {
  const editable = opts.editable !== false;
  const lista = Array.isArray(matriz?.segunda_fuente) ? matriz.segunda_fuente : [];
  const rows = lista.map((f, i) => `
    <tr data-sf-id="${esc(f.id_fuente || f.id)}">
      <td class="small">${i + 1}</td>
      <td class="small">${esc(f.tipo_fuente_label || labelTipoSegundaFuente(f.tipo_fuente))}</td>
      <td class="small">${esc(f.denominacion || '—')}</td>
      <td class="small">${esc(f.entidad || '—')}</td>
      <td class="small">${esc(f.ruc || '—')}</td>
      <td class="small">${esc(f.anio || '—')}</td>
      <td class="small text-nowrap">
        ${editable ? `
          <button type="button" class="btn btn-sm btn-outline-primary cc-sf-edit" data-id="${esc(f.id_fuente || f.id)}">Editar</button>
          <button type="button" class="btn btn-sm btn-outline-danger cc-sf-del" data-id="${esc(f.id_fuente || f.id)}">Eliminar</button>
        ` : '<span class="text-muted">Solo lectura</span>'}
      </td>
    </tr>`).join('') || '<tr><td colspan="7" class="text-muted small">Sin segunda fuente registrada.</td></tr>';

  return `
    <div class="card border mb-3" id="ccPanelSegundaFuente">
      <div class="card-body py-3">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h6 class="fw-bold mb-0">Segunda fuente</h6>
          ${editable ? `<button type="button" class="btn btn-sm btn-outline-success" id="ccBtnAddSegundaFuente">
            <i class="bi bi-plus-lg"></i> Agregar segunda fuente
          </button>` : ''}
        </div>
        <p class="small text-muted mb-2">Referencias adicionales (orden/contrato/web/catálogo). Puede usarse aunque existan 3+ cotizaciones.</p>
        <table class="table table-sm table-bordered mb-0">
          <thead class="table-light"><tr>
            <th>#</th><th>Tipo</th><th>Denominación</th><th>Entidad</th><th>RUC</th><th>Año</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

export function renderResumenAdjudicacion(matriz) {
  const adj = matriz?.adjudicacion;
  if (!adj) return '';
  const rows = (adj.resumen_proveedores || []).map((p) => `
    <tr>
      <td class="small">${esc(p.razon_social)}</td>
      <td class="small">${esc(p.ruc)}</td>
      <td class="text-center small">${esc(p.items)}</td>
      <td class="text-end small">${fmtNum(p.valor_adjudicado)}</td>
    </tr>`).join('');
  return `
    <div class="card border-success mb-3">
      <div class="card-body py-2">
        <h6 class="fw-bold text-success mb-2">Resumen de adjudicación</h6>
        <div class="small mb-2">Valor total: <strong>S/ ${fmtNum(adj.valor_adjudicado)}</strong>
          · Metodología: ${esc(adj.metodologia || adj.criterio_label || adj.criterio_seleccion || '—')}
          · ${esc(adj.usuario_adjudicacion || '')}</div>
        <table class="table table-sm table-bordered mb-0"><thead class="table-light"><tr>
          <th>Proveedor / fuente</th><th>RUC</th><th>Ítems</th><th>Valor</th>
        </tr></thead><tbody>${rows || '<tr><td colspan="4" class="text-muted">—</td></tr>'}</tbody></table>
      </div>
    </div>`;
}

export function renderHistorialAdjudicacion(historial = []) {
  if (!historial?.length) return '';
  return `
    <details class="mb-3">
      <summary class="small fw-semibold">Historial de adjudicaciones (${historial.length})</summary>
      <ul class="small mb-0 mt-2">${historial.slice().reverse().map((h) => `
        <li>${esc(String(h.at || '').slice(0, 16).replace('T', ' '))} — ${esc(h.usuario || '')}
          · ${esc(h.criterio || '')} · S/ ${fmtNum(h.valor)}</li>`).join('')}
      </ul>
    </details>`;
}

/** Recolecta observaciones + selecciones de adjudicación (fuente). */
export function collectObservacionesFromDom(container, matriz) {
  const selMap = new Map();
  container?.querySelectorAll('.cc-adj-fuente').forEach((sel) => {
    const opt = sel.selectedOptions?.[0];
    selMap.set(sel.dataset.itemKey, {
      fuente_id: sel.value || null,
      fuente_tipo: opt?.dataset?.tipo || null,
      proveedor_adjudicado_id: opt?.dataset?.proveedorId ? Number(opt.dataset.proveedorId) : null,
    });
  });

  const items = (matriz?.items || []).map((it) => {
    const sel = selMap.get(it.item_key);
    let valor_unitario = it.valor_adjudicado_unitario;
    let valor_total = it.valor_adjudicado_item;
    if (sel?.fuente_id) {
      const { todas } = getFuentesVista(matriz);
      const f = todas.find((x) => String(x.id || x.id_fuente) === String(sel.fuente_id));
      const pr = f?.precios_por_item?.[it.item_key] || {};
      if (f?.tipo === 'SEGUNDA_FUENTE' || f?.tipo_fuente) {
        valor_unitario = pr.precio_actualizado ?? pr.precio_unitario;
        valor_total = pr.precio_total_actualizado ?? pr.precio_total;
      } else {
        const of = (it.ofertas || []).find((o) => Number(o.proveedor_id) === Number(sel.proveedor_adjudicado_id));
        valor_unitario = pr.precio_unitario ?? of?.precio_unitario;
        valor_total = pr.precio_total ?? of?.precio_total;
      }
    }
    return {
      ...it,
      proveedor_adjudicado_id: sel?.proveedor_adjudicado_id ?? it.proveedor_adjudicado_id,
      fuente_adjudicada_id: sel?.fuente_id ?? it.fuente_adjudicada_id,
      fuente_adjudicada_tipo: sel?.fuente_tipo ?? it.fuente_adjudicada_tipo,
      valor_adjudicado_unitario: valor_unitario,
      valor_adjudicado_item: valor_total,
    };
  });

  // Acciones administrativas
  const primera = [...(matriz.primera_fuente || [])];
  const segunda = [...(matriz.segunda_fuente || [])];
  container?.querySelectorAll('.cc-aa-field').forEach((el) => {
    const fid = el.dataset.fuenteId;
    const field = el.dataset.field;
    let val = el.value;
    if (el.tagName === 'SELECT' && (val === '1' || val === '0')) val = val === '1';
    else if (el.tagName === 'SELECT' && val === '') val = null;
    const apply = (list) => {
      const f = list.find((x) => String(x.id || x.id_fuente) === String(fid));
      if (!f) return;
      f.acciones_administrativas = { ...(f.acciones_administrativas || {}), [field]: val };
    };
    apply(primera);
    apply(segunda);
  });

  const notas = container?.querySelector('#ccNotasInternas')?.value ?? matriz?.notas_internas ?? '';
  return {
    ...matriz,
    items,
    primera_fuente: primera.length ? primera : matriz.primera_fuente,
    segunda_fuente: segunda,
    notas_internas: notas,
  };
}

export function collectSeleccionesFromDom(container, matriz) {
  const datos = collectObservacionesFromDom(container, matriz);
  return (datos.items || []).map((it) => ({
    item_key: it.item_key,
    proveedor_adjudicado_id: it.proveedor_adjudicado_id,
    fuente_id: it.fuente_adjudicada_id,
    fuente_tipo: it.fuente_adjudicada_tipo,
    precio_unitario: it.valor_adjudicado_unitario,
    precio_total: it.valor_adjudicado_item,
  }));
}

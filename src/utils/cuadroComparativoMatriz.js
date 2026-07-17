/**
 * Render HTML de matriz comparativa Bienes (RC8.2/RC8.3) — ofertas + adjudicación por ítem.
 */

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

export function renderResumenProveedores(resumen = []) {
  if (!resumen.length) return '<div class="text-muted small">Sin proveedores</div>';
  return `
    <table class="table table-sm table-bordered mb-3">
      <thead class="table-light"><tr>
        <th>Proveedor</th><th>RUC</th><th>Validación</th><th>Total ofertado</th><th>Ítems OK</th><th>Incompletos</th>
      </tr></thead>
      <tbody>${resumen.map((p) => {
    const apto = String(p.validacion_estado || '').toUpperCase() === 'APTO';
    return `
        <tr class="${apto ? '' : 'table-secondary text-muted'}">
          <td class="small">${esc(p.razon_social)}${apto ? '' : ' <span class="badge bg-secondary">No adjudicar</span>'}</td>
          <td class="small">${esc(p.ruc)}</td>
          <td><span class="badge bg-${badgeVal(p.validacion_estado)}">${esc(p.validacion_estado || '—')}</span></td>
          <td class="text-end small">${apto ? fmtNum(p.total_ofertado) : '—'}</td>
          <td class="text-center small">${esc(p.items_validos)}</td>
          <td class="text-center small">${esc(p.items_incompletos)}</td>
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
      || 'Existen menos de tres cotizaciones válidas. Registre el sustento para continuar.')}
      <div class="text-muted mt-1">Presentadas: ${esc(adv.cotizaciones_presentadas)} · APTO: ${esc(adv.cotizaciones_aptas)}</div>
    </div>`);
  }
  if (matriz?.meta?.hay_empate || (matriz?.items || []).some((i) => i.empate)) {
    parts.push('<div class="alert alert-info py-2 small mb-2"><strong>EMPATE</strong> en uno o más ítems: no hay selección automática. Indique criterio Empate y sustento.</div>');
  }
  parts.push('<p class="small text-muted mb-2">Modalidad: <strong>adjudicación por ítem</strong> (resumen agregado por proveedor).</p>');
  return parts.join('');
}

/**
 * Matriz con radio de adjudicación (solo APTO).
 */
export function renderMatrizBienesHtml(matriz, opts = {}) {
  const items = matriz?.items || [];
  const proveedores = (matriz?.resumen_proveedores || []).map((p) => ({
    id: p.proveedor_id,
    ruc: p.ruc,
    razon_social: p.razon_social,
    validacion_estado: p.validacion_estado,
  }));
  if (!proveedores.length && items[0]?.ofertas?.length) {
    items[0].ofertas.forEach((o) => {
      proveedores.push({
        id: o.proveedor_id,
        ruc: o.ruc,
        razon_social: o.razon_social,
        validacion_estado: o.validacion_estado,
      });
    });
  }

  if (!items.length) {
    return '<div class="alert alert-light border">No hay ítems para comparar.</div>';
  }

  const editable = opts.editable !== false;
  const headProv = proveedores.map((p) => {
    const apto = String(p.validacion_estado || '').toUpperCase() === 'APTO';
    return `<th colspan="7" class="text-center ${apto ? '' : 'table-secondary'}">
      <div class="small fw-semibold">${esc(p.razon_social)}</div>
      <div class="text-muted" style="font-size:0.7rem">${esc(p.ruc)} · ${esc(p.validacion_estado || '—')}</div>
    </th>`;
  }).join('');

  const subHead = proveedores.map((p) => {
    const apto = String(p.validacion_estado || '').toUpperCase() === 'APTO';
    const cls = apto ? '' : 'table-secondary';
    return `
      <th class="small ${cls}">Adjudicar</th>
      <th class="small ${cls}">Técnico</th>
      <th class="small ${cls}">P. unit.</th>
      <th class="small ${cls}">P. total</th>
      <th class="small ${cls}">Δ menor</th>
      <th class="small ${cls}">Marca / Modelo</th>
      <th class="small ${cls}">Obs. analista</th>`;
  }).join('');

  const body = items.map((it) => {
    const recLabel = it.estado_recomendacion === 'EMPATE'
      ? '<span class="badge bg-info text-dark">EMPATE</span>'
      : (it.recomendado_proveedor_id
        ? '<span class="badge bg-success">Hay recomendado</span>'
        : '<span class="badge bg-secondary">Sin oferta válida</span>');
    const cells = proveedores.map((p) => {
      const of = (it.ofertas || []).find((o) => o.proveedor_id === p.id) || {};
      const apto = String(of.validacion_estado || p.validacion_estado || '').toUpperCase() === 'APTO';
      const cls = apto ? '' : 'table-secondary text-muted';
      const incompleto = of.incompleto
        ? `<div class="text-danger" style="font-size:0.65rem" title="${esc(of.incompleto_motivo || '')}">Información incompleta</div>`
        : '';
      const recomendado = of.recomendado
        ? '<span class="badge bg-success mb-1">Recomendado</span>'
        : (of.en_empate_menor_precio ? '<span class="badge bg-info text-dark mb-1">Empate</span>' : '');
      const selected = Number(it.proveedor_adjudicado_id) === Number(p.id);
      const canAdj = editable && apto && !of.incompleto && of.precio_total != null;
      const radio = canAdj
        ? `<input type="radio" class="form-check-input cc-adj-radio" name="cc-adj-${esc(it.item_key)}"
            data-item-key="${esc(it.item_key)}" data-proveedor-id="${p.id}"
            ${selected ? 'checked' : ''} title="Seleccionar adjudicatario">`
        : (apto ? '<span class="text-muted">—</span>' : '<span class="text-muted" title="No adjudicar">✕</span>');
      const obsCell = editable
        ? `<textarea class="form-control form-control-sm cc-obs-analista" rows="2"
            data-item-key="${esc(it.item_key)}" data-proveedor-id="${p.id}"
            ${apto ? '' : 'disabled'}>${esc(of.observacion_analista || '')}</textarea>`
        : `<span class="small">${esc(of.observacion_analista || '—')}</span>`;
      const diff = of.diferencia_menor_precio;
      const diffTxt = diff == null ? '—' : (diff === 0 ? '0.00' : `+${fmtNum(diff)}`);
      return `
        <td class="text-center ${cls}">${recomendado}<div>${radio}</div>${selected ? '<div class="badge bg-primary mt-1">Seleccionado</div>' : ''}</td>
        <td class="small ${cls}">${of.cumple_tecnicamente ? 'Cumple' : esc(of.validacion_estado || '—')}${incompleto}</td>
        <td class="small text-end ${cls}">${fmtNum(of.precio_unitario)}</td>
        <td class="small text-end ${cls}">${fmtNum(of.precio_total)}</td>
        <td class="small text-end ${cls}">${diffTxt}</td>
        <td class="small ${cls}">${esc(of.marca || '—')}<div class="text-muted">${esc(of.modelo || '')}</div>
          <div class="text-muted" style="font-size:0.65rem">${esc(of.procedencia || '')} · ${esc(of.garantia || '')}</div></td>
        <td class="${cls}">${obsCell}</td>`;
    }).join('');

    return `
      <tr>
        <td class="small">${esc(it.requerimiento_codigo || '—')}<div class="mt-1">${recLabel}</div></td>
        <td class="small">${esc(it.pedido_sigamef || '—')}</td>
        <td class="small">${esc(it.codigo_sigamef || '—')}</td>
        <td class="small">${esc(it.descripcion || '—')}</td>
        <td class="small text-center">${esc(it.unidad_medida || 'UND')}</td>
        <td class="small text-center">${it.cantidad != null ? esc(it.cantidad) : '—'}</td>
        <td class="small text-end text-success">${fmtNum(it.menor_precio_valido)}</td>
        ${cells}
      </tr>`;
  }).join('');

  return `
    <div class="table-responsive cc-matriz-wrap" style="max-height:55vh;overflow:auto;">
      <table class="table table-sm table-bordered mb-0 align-middle cc-matriz-table">
        <thead class="table-light sticky-top">
          <tr>
            <th rowspan="2" class="small">N.° REQ</th>
            <th rowspan="2" class="small">Pedido SIGAMEF</th>
            <th rowspan="2" class="small">Cód. SIGAMEF</th>
            <th rowspan="2" class="small">Descripción</th>
            <th rowspan="2" class="small">UM</th>
            <th rowspan="2" class="small">Cant.</th>
            <th rowspan="2" class="small">Menor precio válido</th>
            ${headProv}
          </tr>
          <tr>${subHead}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="small text-muted mt-2 mb-0">
      Precios y resultado técnico son de solo lectura. Solo APTO con oferta completa puede adjudicarse.
      Si elige distinto al recomendado, o hay empate / menos de 3 cotizaciones, el sustento es obligatorio.
    </p>`;
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
          · Criterio: ${esc(adj.criterio_label || adj.criterio_seleccion)}
          · ${esc(adj.usuario_adjudicacion || '')} · ${esc(String(adj.fecha_adjudicacion || '').slice(0, 16).replace('T', ' '))}</div>
        <table class="table table-sm table-bordered mb-0"><thead class="table-light"><tr>
          <th>Proveedor</th><th>RUC</th><th>Ítems</th><th>Valor</th>
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

/** Recolecta observaciones + selecciones de adjudicación. */
export function collectObservacionesFromDom(container, matriz) {
  const map = new Map();
  container?.querySelectorAll('.cc-obs-analista').forEach((ta) => {
    map.set(`${ta.dataset.itemKey}::${ta.dataset.proveedorId}`, ta.value);
  });
  const selMap = new Map();
  container?.querySelectorAll('.cc-adj-radio:checked').forEach((r) => {
    selMap.set(r.dataset.itemKey, Number(r.dataset.proveedorId));
  });
  const items = (matriz?.items || []).map((it) => {
    const ofertas = (it.ofertas || []).map((of) => {
      const key = `${it.item_key}::${of.proveedor_id}`;
      return {
        ...of,
        observacion_analista: map.has(key) ? map.get(key) : (of.observacion_analista || ''),
      };
    });
    return {
      ...it,
      ofertas,
      proveedor_adjudicado_id: selMap.has(it.item_key)
        ? selMap.get(it.item_key)
        : it.proveedor_adjudicado_id,
    };
  });
  const notas = container?.querySelector('#ccNotasInternas')?.value ?? matriz?.notas_internas ?? '';
  return {
    ...matriz,
    items,
    notas_internas: notas,
  };
}

export function collectSeleccionesFromDom(container, matriz) {
  const datos = collectObservacionesFromDom(container, matriz);
  return (datos.items || []).map((it) => ({
    item_key: it.item_key,
    proveedor_adjudicado_id: it.proveedor_adjudicado_id,
  }));
}

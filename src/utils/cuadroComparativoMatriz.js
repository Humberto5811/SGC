/**
 * Render HTML de matriz comparativa Bienes (RC8.2) — solo lectura de ofertas.
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

/**
 * Matriz: filas = ítems; columnas base + bloque por proveedor.
 */
export function renderMatrizBienesHtml(matriz, opts = {}) {
  const items = matriz?.items || [];
  const proveedores = (matriz?.resumen_proveedores || []).map((p) => ({
    id: p.proveedor_id,
    ruc: p.ruc,
    razon_social: p.razon_social,
    validacion_estado: p.validacion_estado,
  }));
  // Si no hay resumen, inferir de primera fila
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
    return `<th colspan="6" class="text-center ${apto ? '' : 'table-secondary'}">
      <div class="small fw-semibold">${esc(p.razon_social)}</div>
      <div class="text-muted" style="font-size:0.7rem">${esc(p.ruc)} · ${esc(p.validacion_estado || '—')}</div>
    </th>`;
  }).join('');

  const subHead = proveedores.map((p) => {
    const apto = String(p.validacion_estado || '').toUpperCase() === 'APTO';
    const cls = apto ? '' : 'table-secondary';
    return `
      <th class="small ${cls}">Técnico</th>
      <th class="small ${cls}">P. unit.</th>
      <th class="small ${cls}">P. total</th>
      <th class="small ${cls}">Marca / Modelo</th>
      <th class="small ${cls}">Garantía / Plazo</th>
      <th class="small ${cls}">Obs. analista</th>`;
  }).join('');

  const body = items.map((it) => {
    const cells = proveedores.map((p) => {
      const of = (it.ofertas || []).find((o) => o.proveedor_id === p.id) || {};
      const apto = String(of.validacion_estado || p.validacion_estado || '').toUpperCase() === 'APTO';
      const cls = apto ? '' : 'table-secondary text-muted';
      const incompleto = of.incompleto
        ? `<div class="text-danger" style="font-size:0.65rem" title="${esc(of.incompleto_motivo || '')}">Información incompleta</div>`
        : '';
      const obsId = `cc-obs-${esc(it.item_key)}-${p.id}`;
      const obsCell = editable
        ? `<textarea class="form-control form-control-sm cc-obs-analista" rows="2"
            data-item-key="${esc(it.item_key)}" data-proveedor-id="${p.id}"
            id="${obsId}" ${apto ? '' : 'disabled'}>${esc(of.observacion_analista || '')}</textarea>`
        : `<span class="small">${esc(of.observacion_analista || '—')}</span>`;
      return `
        <td class="small ${cls}">${of.cumple_tecnicamente ? 'Cumple' : esc(of.validacion_estado || '—')}${incompleto}</td>
        <td class="small text-end ${cls}">${fmtNum(of.precio_unitario)}</td>
        <td class="small text-end ${cls}">${fmtNum(of.precio_total)}</td>
        <td class="small ${cls}">${esc(of.marca || '—')}<div class="text-muted">${esc(of.modelo || '')}</div>
          <div class="text-muted" style="font-size:0.65rem">${esc(of.procedencia || '')}</div></td>
        <td class="small ${cls}">${esc(of.garantia || '—')}<div class="text-muted">${esc(of.plazo_entrega || '')}</div></td>
        <td class="${cls}">${obsCell}</td>`;
    }).join('');

    return `
      <tr>
        <td class="small">${esc(it.requerimiento_codigo || '—')}</td>
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
      Cantidades y precios son de solo lectura. Solo se editan observaciones del analista y notas internas.
      Proveedores NO_APTO/OBSERVADO aparecen atenuados y no son adjudicables en esta etapa.
    </p>`;
}

/** Recolecta observaciones editables del DOM hacia estructura datos_json parcial. */
export function collectObservacionesFromDom(container, matriz) {
  const map = new Map();
  container?.querySelectorAll('.cc-obs-analista').forEach((ta) => {
    map.set(`${ta.dataset.itemKey}::${ta.dataset.proveedorId}`, ta.value);
  });
  const items = (matriz?.items || []).map((it) => {
    const ofertas = (it.ofertas || []).map((of) => {
      const key = `${it.item_key}::${of.proveedor_id}`;
      return {
        ...of,
        observacion_analista: map.has(key) ? map.get(key) : (of.observacion_analista || ''),
      };
    });
    return { ...it, ofertas };
  });
  const notas = container?.querySelector('#ccNotasInternas')?.value ?? matriz?.notas_internas ?? '';
  return {
    ...matriz,
    items,
    notas_internas: notas,
  };
}

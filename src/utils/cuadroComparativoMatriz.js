/**
 * Render matriz Cuadro Comparativo Bienes — Anexo 08-A (RC8.3.2-A).
 * Una sola tabla: precios + información adicional + acciones administrativas
 * como continuación vertical de cada columna de fuente.
 * VALOR ADJUDICADO queda independiente (sin filas debajo).
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

function isSegundaFuente(f) {
  return f?.tipo === 'SEGUNDA_FUENTE' || !!f?.tipo_fuente;
}

function spanFuente(f) {
  // SF: Referencia/Orden/Contrato + P.unit + Factor + P.act + P.total
  return isSegundaFuente(f) ? 5 : 2;
}

function labelReferenciaCol(tipoFuente) {
  const t = String(tipoFuente || '').toUpperCase();
  if (t === 'ORDEN_COMPRA_ANTERIOR') return 'N.° Orden';
  if (t === 'CONTRATO_ANTERIOR') return 'Contrato';
  return 'Referencia';
}

function textoReferenciaFuente(f) {
  const ref = String(f?.referencia || '').trim();
  return ref || '—';
}

/** Segunda fuente solo afecta ítems asociados (requerimiento / item_keys). */
export function fuenteAplicaAItem(f, it) {
  if (!isSegundaFuente(f)) return true;
  const keys = Array.isArray(f.item_keys) ? f.item_keys.filter(Boolean) : [];
  if (keys.length) return keys.includes(it.item_key);
  if (f.requerimiento_id != null && f.requerimiento_id !== '') {
    return String(it.requerimiento_id) === String(f.requerimiento_id);
  }
  if (f.requerimiento_codigo) {
    return String(it.requerimiento_codigo || '') === String(f.requerimiento_codigo);
  }
  // Legacy sin asociación: aplica a todos
  return true;
}

function labelSegundaFuenteHead() {
  return {
    title: 'Segunda fuente',
    subtitle: 'Valor histórico / páginas web',
  };
}

function htmlCabeceraCotizacion(f) {
  const d = f.datos_proveedor || {};
  const nombre = d.razon_social || f.razon_social || '—';
  const ruc = d.ruc || '—';
  const contacto = d.contacto || d.persona_contacto || '—';
  const telefono = d.telefono || d.celular || '—';
  const correo = d.correo || '—';
  return `
    <div class="small fw-semibold">${esc(f.label || `Cotización N.° ${f.nro}`)}</div>
    <div class="small text-start px-1" style="font-size:0.68rem; line-height:1.25">
      <div><span class="text-muted">Proveedor:</span> ${esc(nombre)}</div>
      <div><span class="text-muted">RUC:</span> ${esc(ruc)}</div>
      <div><span class="text-muted">Contacto:</span> ${esc(contacto)}</div>
      <div><span class="text-muted">Teléfono:</span> ${esc(telefono)}</div>
      <div><span class="text-muted">Correo:</span> ${esc(correo)}</div>
    </div>`;
}

/** Valores unitario/total desde la oferta del proveedor adjudicado. */
export function valoresDesdeOferta(it, proveedorId) {
  if (proveedorId == null || proveedorId === '') {
    return { unitario: null, total: null };
  }
  const of = (it?.ofertas || []).find((o) => Number(o.proveedor_id) === Number(proveedorId));
  return {
    unitario: of?.precio_unitario ?? null,
    total: of?.precio_total ?? null,
  };
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
  return parts.join('');
}

const INFO_ROWS_BIENES = [
  ['Marca', 'marca'],
  ['Modelo', 'modelo'],
  ['Procedencia', 'procedencia'],
  ['Año de fabricación', 'anio_fabricacion'],
  ['Garantía comercial', 'garantia'],
  ['Plazo de entrega', 'plazo_entrega'],
  ['Forma de pago', 'forma_pago'],
  ['Moneda de la fuente', 'moneda'],
];

/** Anexo 08-B: solo plazo de entrega y forma de pago */
const INFO_ROWS_SERVICIOS = [
  ['Plazo de entrega', 'plazo_entrega'],
  ['Forma de pago', 'forma_pago'],
];

export function isCuadroServicios(matriz = {}) {
  const anexo = String(matriz?.meta?.anexo_codigo || '').toUpperCase();
  if (anexo === '8B') return true;
  if (anexo === '8A') return false;
  const t = String(
    matriz?.meta?.tipo_contratacion || matriz?.solicitud?.tipo_contratacion || matriz?.solicitud?.tipo || '',
  ).toLowerCase();
  return t.includes('serv');
}

function infoRowsForMatriz(matriz) {
  return isCuadroServicios(matriz) ? INFO_ROWS_SERVICIOS : INFO_ROWS_BIENES;
}

const AA_FIELDS = [
  ['fecha_solicitud', 'Fecha de solicitud', 'date'],
  ['reiteraciones', 'Cantidad de reiteraciones', 'number'],
  ['fecha_recepcion', 'Fecha de recepción', 'date'],
  ['dedicado_objeto', 'Se dedica al objeto de la contratación', 'bool'],
  ['au_participo_rtm', 'AU participó en verificación RTM', 'bool'],
  ['cumple_rtm_o_similar', 'Cumple RTM / igual o similar', 'bool'],
  ['tomo_valor_referencial', 'Se tomó en cuenta para valor referencial', 'bool'],
];

function cellInfoFuente(f, key) {
  const sf = isSegundaFuente(f);
  if (sf) {
    const raw = f.informacion_adicional?.[key];
    const s = String(raw == null ? '' : raw).trim();
    if (!s || s === '—' || s === '-' || s.toLowerCase() === 'n/a') return esc('NO APLICA');
    return esc(s);
  }
  const val = f.informacion_adicional?.[key]
    || Object.values(f.info_por_item || {})[0]?.[key]
    || '—';
  return esc(na(val, '—'));
}

function fmtAaDate(v) {
  if (v == null || v === '') return '—';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.slice(0, 40);
}

function cellAccionFuente(f, key, type, editable = false) {
  // Segunda fuente: siempre NO APLICA (como Información adicional)
  if (isSegundaFuente(f)) return esc('NO APLICA');

  const aa = f.acciones_administrativas || {};
  const val = aa[key];
  const fid = f.id || f.id_fuente;

  // Único campo editable en AA: «Se dedica al objeto de la contratación» (por proveedor / cotización)
  if (key === 'dedicado_objeto') {
    if (!editable) {
      if (val === true) return esc('Sí');
      if (val === false) return esc('No');
      return esc('—');
    }
    return `<select class="form-select form-select-sm cc-aa-field"
      data-fuente-id="${esc(fid)}"
      data-proveedor-id="${esc(f.proveedor_id ?? '')}"
      data-cotizacion-id="${esc(f.cotizacion_id ?? '')}"
      data-field="dedicado_objeto">
      <option value="">—</option>
      <option value="1" ${val === true ? 'selected' : ''}>Sí</option>
      <option value="0" ${val === false ? 'selected' : ''}>No</option>
    </select>`;
  }

  // Resto de AA de cotización: automáticos (solo lectura)
  if (type === 'bool') {
    if (val === true) return esc('Sí');
    if (val === false) return esc('No');
    return esc('—');
  }
  if (type === 'date') return esc(fmtAaDate(val));
  if (val == null || val === '') return esc('—');
  return esc(String(val));
}

/**
 * Una sola tabla Anexo 08-A:
 * precios → información adicional → acciones administrativas
 * (continuación vertical por columna de fuente; VALOR ADJUDICADO sin filas debajo).
 */
export function renderMatrizBienesHtml(matriz, opts = {}) {
  const editable = opts.editable !== false;
  const items = matriz?.items || [];
  const { todas } = getFuentesVista(matriz);

  if (!items.length) {
    return '<div class="alert alert-light border">No hay ítems para comparar.</div>';
  }

  const fixedCols = 6;
  const adjCols = 3;
  const spanFuentes = todas.reduce((n, f) => n + spanFuente(f), 0);
  const totalCols = fixedCols + spanFuentes + adjCols;

  const headFuentes = todas.map((f) => {
    const sf = isSegundaFuente(f);
    const span = spanFuente(f);
    const cls = sf ? 'cc-col-sf table-warning' : 'table-success';
    if (sf) {
      const L = labelSegundaFuenteHead();
      return `<th colspan="${span}" class="text-center ${cls}">
        <div class="small fw-semibold">${esc(L.title)}</div>
        <div class="small fw-semibold">${esc(L.subtitle)}</div>
      </th>`;
    }
    return `<th colspan="${span}" class="text-center ${cls}">${htmlCabeceraCotizacion(f)}</th>`;
  }).join('');

  const { primera } = getFuentesVista(matriz);

  const subHead = todas.map((f) => {
    if (isSegundaFuente(f)) {
      return `<th class="small cc-col-sf">${esc(labelReferenciaCol(f.tipo_fuente))}</th>
        <th class="small cc-col-sf">P. unit.</th><th class="small cc-col-sf">Factor</th>
        <th class="small cc-col-sf">P. act.</th><th class="small cc-col-sf">P. total</th>`;
    }
    return `<th class="small">P. unit.</th><th class="small">P. total</th>`;
  }).join('');

  const priceBody = items.map((it, idx) => {
    const cells = todas.map((f) => {
      const sf = isSegundaFuente(f);
      if (sf) {
        const aplica = fuenteAplicaAItem(f, it);
        const pr = aplica ? ((f.precios_por_item || {})[it.item_key] || {}) : {};
        const refTxt = aplica ? textoReferenciaFuente(f) : '—';
        return `
          <td class="small text-center cc-col-sf">${esc(refTxt)}</td>
          <td class="small text-end cc-col-sf">${aplica ? fmtNum(pr.precio_unitario ?? pr.precio_original) : '—'}</td>
          <td class="small text-end cc-col-sf">${aplica && pr.factor_ajuste != null ? esc(pr.factor_ajuste) : '—'}</td>
          <td class="small text-end cc-col-sf">${aplica ? fmtNum(pr.precio_actualizado) : '—'}</td>
          <td class="small text-end cc-col-sf">${aplica ? fmtNum(pr.precio_total_actualizado ?? pr.precio_total) : '—'}</td>`;
      }
      const pr = (f.precios_por_item || {})[it.item_key] || {};
      const of = (it.ofertas || []).find((o) => Number(o.proveedor_id) === Number(f.proveedor_id)) || {};
      const pu = pr.precio_unitario ?? of.precio_unitario;
      const pt = pr.precio_total ?? of.precio_total;
      const muted = !f.cumple_tecnicamente ? 'table-secondary text-muted' : '';
      return `
        <td class="small text-end ${muted}">${fmtNum(pu)}</td>
        <td class="small text-end ${muted}">${fmtNum(pt)}</td>`;
    }).join('');

    // Combo: razón social de proveedores que presentaron cotización (primera fuente)
    const adjOpts = primera.map((f, i) => {
      const pid = f.proveedor_id;
      const of = (it.ofertas || []).find((o) => Number(o.proveedor_id) === Number(pid)) || {};
      const label = String(
        f.datos_proveedor?.razon_social || of.razon_social || f.razon_social || ''
      ).trim() || `Cotización ${f.nro || i + 1}`;
      const selected = Number(it.proveedor_adjudicado_id) === Number(pid);
      const disabled = !f.cumple_tecnicamente ? 'disabled' : '';
      const pu = of.precio_unitario != null ? of.precio_unitario : '';
      const pt = of.precio_total != null ? of.precio_total : '';
      return `<option value="${esc(pid)}" data-tipo="COTIZACION"
        data-proveedor-id="${esc(pid || '')}" data-pu="${esc(pu)}" data-pt="${esc(pt)}"
        ${selected ? 'selected' : ''} ${disabled}>${esc(label)}</option>`;
    }).join('');

    let adjReadonlyLabel = '—';
    if (it.proveedor_adjudicado_id != null) {
      const ix = primera.findIndex((f) => Number(f.proveedor_id) === Number(it.proveedor_adjudicado_id));
      if (ix >= 0) {
        const f = primera[ix];
        const of = (it.ofertas || []).find((o) => Number(o.proveedor_id) === Number(f.proveedor_id)) || {};
        adjReadonlyLabel = String(
          f.datos_proveedor?.razon_social || of.razon_social || f.razon_social
          || it.adjudicado_razon_social || ''
        ).trim() || '—';
      } else {
        adjReadonlyLabel = String(it.adjudicado_razon_social || '').trim() || '—';
      }
    }
    const adjSelect = editable
      ? `<select class="form-select form-select-sm cc-adj-fuente" data-item-key="${esc(it.item_key)}">
          <option value="">— Seleccione —</option>${adjOpts}
        </select>`
      : `<span class="small">${esc(adjReadonlyLabel)}</span>`;

    const vals = valoresDesdeOferta(it, it.proveedor_adjudicado_id);
    const vu = it.valor_adjudicado_unitario ?? vals.unitario;
    const vt = it.valor_adjudicado_item ?? vals.total;

    return `
      <tr>
        <td class="small text-center sticky-col">${idx + 1}</td>
        <td class="small sticky-col">${esc(it.requerimiento_codigo || '—')}</td>
        <td class="small">${esc(it.codigo_sigamef || '—')}</td>
        <td class="small" style="min-width:140px">${esc(it.descripcion || '—')}</td>
        <td class="small text-center">${esc(it.unidad_medida || 'UND')}</td>
        <td class="small text-center">${it.cantidad != null ? esc(it.cantidad) : '—'}</td>
        ${cells}
        <td class="small cc-adj-block">${adjSelect}</td>
        <td class="small text-end cc-adj-block cc-adj-vu">${fmtNum(vu)}</td>
        <td class="small text-end cc-adj-block cc-adj-vt">${fmtNum(vt)}</td>
      </tr>`;
  }).join('');

  // OD34 — sin cuadrícula vacía bajo VALOR ADJUDICADO: la última fuente absorbe spanAdj.
  const spanAdj = 3;
  const celdasFuentesContinuacion = (extraClass = '') => {
    if (!todas.length) return '';
    return todas.map((f, idx) => {
      const span = spanFuente(f) + (idx === todas.length - 1 ? spanAdj : 0);
      const sf = isSegundaFuente(f) ? 'cc-col-sf' : '';
      return `<td colspan="${span}" class="small text-center ${sf} ${extraClass}"></td>`;
    }).join('');
  };
  const celdasFuentesInfo = (key) => {
    if (!todas.length) return '';
    return todas.map((f, idx) => {
      const span = spanFuente(f) + (idx === todas.length - 1 ? spanAdj : 0);
      const sf = isSegundaFuente(f) ? 'cc-col-sf' : '';
      return `<td colspan="${span}" class="small text-center ${sf}">${cellInfoFuente(f, key)}</td>`;
    }).join('');
  };
  const celdasFuentesAa = (key, type) => {
    if (!todas.length) return '';
    return todas.map((f, idx) => {
      const span = spanFuente(f) + (idx === todas.length - 1 ? spanAdj : 0);
      const sf = isSegundaFuente(f) ? 'cc-col-sf' : '';
      return `<td colspan="${span}" class="small text-center ${sf}">${cellAccionFuente(f, key, type, editable)}</td>`;
    }).join('');
  };

  const sectionInfo = `
    <tr class="cc-section-row">
      <td class="small fw-semibold sticky-col" colspan="${fixedCols}">Información adicional</td>
      ${celdasFuentesContinuacion('fw-semibold')}
    </tr>`;

  const infoBody = infoRowsForMatriz(matriz).map(([label, key]) => `
    <tr class="cc-info-row">
      <td class="small table-light sticky-col" colspan="${fixedCols}">${esc(label)}</td>
      ${celdasFuentesInfo(key)}
    </tr>`).join('');

  const sectionAa = `
    <tr class="cc-section-row">
      <td class="small fw-semibold sticky-col" colspan="${fixedCols}">Acciones administrativas</td>
      ${celdasFuentesContinuacion()}
    </tr>`;

  const aaBody = AA_FIELDS.map(([key, label, type]) => `
    <tr class="cc-aa-row">
      <td class="small table-light sticky-col" colspan="${fixedCols}">${esc(label)}</td>
      ${celdasFuentesAa(key, type)}
    </tr>`).join('');

  return `
    <style>
      .cc-matriz-wrap { max-height: 70vh; overflow: auto; }
      .cc-matriz-table { font-size: 0.78rem; width: max-content; min-width: 100%; }
      .cc-matriz-table thead th { position: sticky; top: 0; z-index: 2; vertical-align: middle; }
      .cc-matriz-table .sticky-col { position: sticky; left: 0; background: #fff; z-index: 1; }
      .cc-matriz-table .cc-col-sf { max-width: 72px; width: 72px; min-width: 56px; }
      .cc-matriz-table th.cc-col-sf { max-width: 288px; }
      .cc-matriz-table .cc-adj-block { background: #fff8e1; min-width: 88px; }
      .cc-matriz-table .cc-section-row td { background: #eef3f7; }
      .cc-sf-toolbar { margin-bottom: 0.5rem; }
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
            <th class="small">Proveedor adjudicado</th>
            <th class="small">Valor Unitario</th>
            <th class="small">Valor Total</th>
          </tr>
        </thead>
        <tbody>
          ${priceBody}
          ${sectionInfo}
          ${infoBody}
          ${sectionAa}
          ${aaBody}
        </tbody>
      </table>
    </div>
    <!-- totalCols=${totalCols} -->`;
}

/** Compat: ya no se usan paneles separados (RC8.3.2-A). */
export function renderInfoAdicionalFuentes() {
  return '';
}

/** Compat: ya no se usan paneles separados (RC8.3.2-A). */
export function renderAccionesAdministrativas() {
  return '';
}

/** Toolbar sin card — gestión de segunda fuente. */
export function renderPanelSegundaFuente(matriz, opts = {}) {
  const editable = opts.editable !== false;
  const lista = Array.isArray(matriz?.segunda_fuente) ? matriz.segunda_fuente : [];
  const chips = lista.map((f) => `
    <span class="badge text-bg-light border me-1 mb-1">
      ${esc(f.denominacion || labelTipoSegundaFuente(f.tipo_fuente))}
      ${editable ? `
        <button type="button" class="btn btn-link btn-sm p-0 ms-1 cc-sf-edit" data-id="${esc(f.id_fuente || f.id)}">Editar</button>
        <button type="button" class="btn btn-link btn-sm p-0 text-danger cc-sf-del" data-id="${esc(f.id_fuente || f.id)}">Eliminar</button>
      ` : ''}
    </span>`).join('');

  return `
    <div class="cc-sf-toolbar d-flex flex-wrap align-items-center gap-2 mb-2" id="ccPanelSegundaFuente">
      ${editable ? `<button type="button" class="btn btn-sm btn-outline-success" id="ccBtnAddSegundaFuente">
        <i class="bi bi-plus-lg"></i> Agregar segunda fuente
      </button>` : ''}
      <span class="small text-muted">Segunda fuente · Valor histórico / páginas web</span>
      <div class="w-100">${chips || '<span class="small text-muted">Sin segunda fuente.</span>'}</div>
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
    <div class="mb-3">
      <h6 class="fw-bold text-success mb-2">Resumen de adjudicación</h6>
      <div class="small mb-2">Valor total: <strong>S/ ${fmtNum(adj.valor_adjudicado)}</strong>
        · Metodología: ${esc(adj.metodologia || adj.criterio_label || adj.criterio_seleccion || '—')}
        · ${esc(adj.usuario_adjudicacion || '')}</div>
      <table class="table table-sm table-bordered mb-0"><thead class="table-light"><tr>
        <th>Proveedor / fuente</th><th>RUC</th><th>Ítems</th><th>Valor</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="4" class="text-muted">—</td></tr>'}</tbody></table>
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

/** Actualiza Valor Unitario / Valor Total al cambiar el combo Proveedor adjudicado. */
export function bindAdjProveedorLiveUpdate(container) {
  container?.querySelectorAll('.cc-adj-fuente').forEach((sel) => {
    if (sel.dataset.boundLive === '1') return;
    sel.dataset.boundLive = '1';
    sel.addEventListener('change', () => {
      const tr = sel.closest('tr');
      const opt = sel.selectedOptions?.[0];
      const vu = opt?.dataset?.pu;
      const vt = opt?.dataset?.pt;
      const vuCell = tr?.querySelector('.cc-adj-vu');
      const vtCell = tr?.querySelector('.cc-adj-vt');
      if (vuCell) vuCell.textContent = fmtNum(vu === '' || vu == null ? null : Number(vu));
      if (vtCell) vtCell.textContent = fmtNum(vt === '' || vt == null ? null : Number(vt));
    });
  });
}

/** Recolecta selecciones de adjudicación y acciones administrativas. */
export function collectObservacionesFromDom(container, matriz) {
  const selMap = new Map();
  container?.querySelectorAll('.cc-adj-fuente').forEach((sel) => {
    const opt = sel.selectedOptions?.[0];
    const pid = sel.value !== '' && sel.value != null
      ? Number(sel.value)
      : (opt?.dataset?.proveedorId ? Number(opt.dataset.proveedorId) : null);
    selMap.set(sel.dataset.itemKey, {
      fuente_tipo: 'COTIZACION',
      proveedor_adjudicado_id: Number.isFinite(pid) ? pid : null,
    });
  });

  const items = (matriz?.items || []).map((it) => {
    const sel = selMap.get(it.item_key);
    const pid = sel?.proveedor_adjudicado_id ?? it.proveedor_adjudicado_id ?? null;
    const vals = valoresDesdeOferta(it, pid);
    return {
      ...it,
      proveedor_adjudicado_id: pid,
      fuente_adjudicada_tipo: 'COTIZACION',
      valor_adjudicado_unitario: vals.unitario,
      valor_adjudicado_item: vals.total,
    };
  });

  const primera = [...(matriz.primera_fuente || [])];
  const segunda = [...(matriz.segunda_fuente || [])];
  container?.querySelectorAll('.cc-aa-field').forEach((el) => {
    const fid = el.dataset.fuenteId;
    const field = el.dataset.field;
    const pid = el.dataset.proveedorId;
    const cid = el.dataset.cotizacionId;
    let val = el.value;
    if (el.tagName === 'SELECT' && (val === '1' || val === '0')) val = val === '1';
    else if (el.tagName === 'SELECT' && val === '') val = null;
    const apply = (list) => {
      const f = list.find((x) => String(x.id || x.id_fuente) === String(fid))
        || (pid !== '' && pid != null
          ? list.find((x) => String(x.proveedor_id) === String(pid))
          : null)
        || (cid !== '' && cid != null
          ? list.find((x) => String(x.cotizacion_id) === String(cid))
          : null);
      if (!f) return;
      f.acciones_administrativas = { ...(f.acciones_administrativas || {}), [field]: val };
    };
    apply(primera);
    apply(segunda);
  });

  return {
    ...matriz,
    items,
    primera_fuente: primera.length ? primera : matriz.primera_fuente,
    segunda_fuente: segunda,
    notas_internas: matriz?.notas_internas || '',
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

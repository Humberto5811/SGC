/**
 * Modal Administrar entregas / entregables — tabla horizontal compacta.
 * Fechas: conteo inclusivo (día 1 = fecha efectiva) vía shared/diasPlazo.
 */
import { ordenesContratacionService } from '../services/ordenesContratacionService.js';
import {
  fmtMonto, fmtFecha, CONDICIONES_INICIO_OPTS, esServicioTipo,
} from './ordenesUtils.js';
import { calcularFechaMaximaEntrega } from '../../shared/diasPlazo.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ensureModalRoot() {
  let el = document.getElementById('roModalRoot');
  if (!el) {
    el = document.createElement('div');
    el.id = 'roModalRoot';
    document.body.appendChild(el);
  }
  return el;
}

function showModal(html) {
  const root = ensureModalRoot();
  root.innerHTML = html;
  const modalEl = root.querySelector('.modal');
  // eslint-disable-next-line no-undef
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => { root.innerHTML = ''; }, { once: true });
  return { root, modalEl, modal };
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function needsManual(v) {
  return [
    'SUSCRIPCION_ACTA_INICIO', 'DIA_SIGUIENTE_ACTA_INICIO',
    'SUSCRIPCION_CONTRATO', 'DIA_SIGUIENTE_CONTRATO',
  ].includes(v);
}

function correlativoOptions(selected, used) {
  const opts = [{ v: 'UNICO', l: 'ÚNICO' }, ...Array.from({ length: 24 }, (_, i) => ({ v: String(i + 1), l: String(i + 1) }))];
  return opts.map((o) => {
    const num = o.v === 'UNICO' ? 1 : Number(o.v);
    const disabled = o.v !== 'UNICO' && used.has(num) && String(selected) !== o.v
      && !(selected === 'UNICO' && num === 1);
    const sel = String(selected) === o.v || (selected === 'UNICO' && o.v === 'UNICO');
    return `<option value="${o.v}" ${sel ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${o.l}</option>`;
  }).join('');
}

function plazoOfertadoTexto(items) {
  const t = items.map((it) => it.plazo_ofertado).find(Boolean);
  if (t) return String(t);
  if (items[0]?.plazo_ofertado_dias != null) return `${items[0].plazo_ofertado_dias} días`;
  return '—';
}

function fechasPreviewLocal({ condicion, fechaOrden, fechaNotificacion, fechaManual, plazoDias }) {
  const isActa = ['SUSCRIPCION_ACTA_INICIO', 'DIA_SIGUIENTE_ACTA_INICIO'].includes(condicion);
  const isContrato = ['SUSCRIPCION_CONTRATO', 'DIA_SIGUIENTE_CONTRATO'].includes(condicion);
  return calcularFechaMaximaEntrega({
    condicionInicio: condicion,
    fechaOrden,
    fechaNotificacion,
    fechaActa: isActa ? fechaManual : null,
    fechaContrato: isContrato ? fechaManual : null,
    plazoDias,
    tipoDias: 'calendario',
  });
}

const COL_HEADERS = [
  'Ítem', 'Cantidad', 'Precio unitario', 'Precio total', 'Tipo de entrega', 'Entrega',
  'Plazo ofertado por el proveedor', 'Plazo aplicable', 'Inicio de actividad',
  'Fecha del evento', 'Fecha efectiva de inicio', 'Fecha máxima de entrega',
  'Lugar de entrega', 'Acciones',
];

export async function openEntregasModal(ordenId, { onDone } = {}) {
  const detResp = await ordenesContratacionService.getDetalle(ordenId);
  const det = detResp?.data || detResp;
  const items = det.items || [];
  const orden = det.orden || {};
  const ctx = det.contexto || {};
  const esServ = esServicioTipo(orden.tipo_contratacion || ctx.tipo_contratacion);
  const tipoDefault = esServ ? 'ENTREGABLE' : 'ENTREGA';
  const lugarGlobal = String(det.lugar_entrega || ctx.lugar_entrega || '').trim();
  const lugarFuente = det.lugar_entrega_fuente || ctx.lugar_entrega_fuente || null;
  const proveedorNombre = orden.proveedor_razon_social || ctx.proveedor_razon_social || ctx.razon_social || '—';
  const proveedorRuc = orden.proveedor_ruc || ctx.proveedor_ruc || ctx.ruc || '—';

  let ini = null;
  try {
    const iniResp = await ordenesContratacionService.getInicioActividad({ orden_id: ordenId });
    ini = iniResp?.data || iniResp;
  } catch (_) { /* opcional */ }

  const entregas = (det.entregas || []).map((e) => ({
    correlativo: (det.entregas || []).length === 1 ? 'UNICO' : String(e.numero_entrega),
    numero_entrega: e.numero_entrega,
    tipo_entrega: e.tipo_entrega || tipoDefault,
    dias_plazo: e.dias_plazo,
    condicion_inicio: e.evento_inicio_plazo || ini?.condicion_inicio || 'EMISION_ORDEN',
    fecha_manual: '',
    lugar_entrega: e.lugar_entrega || lugarGlobal || '',
    fecha_evento: e.fecha_base ? String(e.fecha_base).slice(0, 10) : '',
    fecha_efectiva: '',
    fecha_maxima: e.fecha_maxima ? String(e.fecha_maxima).slice(0, 10) : '',
    pendiente: false,
    items: items.map((it) => {
      const li = (e.items || []).find((x) => Number(x.orden_item_id) === Number(it.id));
      return {
        orden_item_id: it.id,
        cantidad: li ? Number(li.cantidad) : 0,
        precio_unitario: Number(it.precio_unitario),
      };
    }),
  }));

  if (!entregas.length && items.length) {
    const plazo = items[0]?.plazo_ofertado_dias || 0;
    entregas.push({
      correlativo: 'UNICO',
      numero_entrega: 1,
      tipo_entrega: tipoDefault,
      dias_plazo: plazo > 0 ? plazo : '',
      condicion_inicio: ini?.condicion_inicio || 'EMISION_ORDEN',
      fecha_manual: '',
      lugar_entrega: lugarGlobal,
      fecha_evento: '',
      fecha_efectiva: '',
      fecha_maxima: '',
      pendiente: false,
      items: items.map((it) => ({
        orden_item_id: it.id,
        cantidad: Number(it.cantidad),
        precio_unitario: Number(it.precio_unitario),
      })),
    });
  }

  // Restaurar fecha manual si la condición lo requiere
  if (ini?.fecha_evento && needsManual(ini.condicion_inicio)) {
    entregas.forEach((e) => {
      if (needsManual(e.condicion_inicio) && !e.fecha_manual) {
        e.fecha_manual = String(ini.fecha_evento).slice(0, 10);
      }
    });
  }

  const { modalEl } = showModal(`
    <div class="modal fade" tabindex="-1" id="roEntregasModal">
      <div class="modal-dialog modal-dialog-scrollable ro-ent-dialog">
        <div class="modal-content">
          <div class="modal-header py-2">
            <div class="flex-grow-1 pe-2">
              <h5 class="modal-title mb-1">Administrar entregas / entregables</h5>
              <div class="small text-muted ro-ent-header-line">
                <span>Orden: <strong>${esc(orden.tipo_orden)} ${esc(orden.numero_orden)}</strong></span>
                <span class="mx-2">·</span>
                <span>Total adjudicado: <strong>${fmtMonto(orden.monto_total)}</strong></span>
                <span class="mx-2">·</span>
                <span>Proveedor: <strong>${esc(proveedorNombre)}</strong></span>
                <span class="mx-2">·</span>
                <span>RUC: <strong>${esc(proveedorRuc)}</strong></span>
              </div>
              <div class="small text-secondary mt-1">
                Registre las entregas o entregables conforme a la oferta del proveedor.
                Los importes y fechas se calculan automáticamente.
              </div>
            </div>
            <button type="button" class="btn btn-sm btn-primary me-2 text-nowrap" id="roAddEntrega"
              ${entregas.length >= 24 ? 'disabled' : ''}>
              <i class="bi bi-plus-lg"></i> Agregar entrega
            </button>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body py-2">
            <style>
              .ro-ent-dialog { width: 94vw; max-width: 96vw; margin: 0.5rem auto; }
              .ro-ent-dialog .modal-content { max-height: 92vh; }
              .ro-ent-wrap { overflow: auto; max-height: min(58vh, 560px); border: 1px solid #dee2e6; border-radius: .25rem; }
              .ro-ent-table { margin-bottom: 0; min-width: 1480px; font-size: .8rem; }
              .ro-ent-table thead th {
                position: sticky; top: 0; z-index: 2; background: #f8f9fa;
                white-space: nowrap; vertical-align: middle; font-weight: 600;
              }
              .ro-ent-table th.ro-col-item, .ro-ent-table td.ro-col-item {
                position: sticky; left: 0; z-index: 1; background: #fff; min-width: 180px; max-width: 240px;
              }
              .ro-ent-table thead th.ro-col-item { z-index: 3; background: #f8f9fa; }
              .ro-ent-table th.ro-col-act, .ro-ent-table td.ro-col-act {
                position: sticky; right: 0; z-index: 1; background: #fff; min-width: 72px;
              }
              .ro-ent-table thead th.ro-col-act { z-index: 3; background: #f8f9fa; }
              .ro-ent-table .ro-item-desc {
                display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
                overflow: hidden; line-height: 1.25; word-break: break-word;
              }
              .ro-ent-table .form-control, .ro-ent-table .form-select {
                min-width: 0; padding: .15rem .35rem; font-size: .78rem;
              }
              .ro-ent-table td { vertical-align: middle; }
              .ro-sufijo { white-space: nowrap; font-size: .7rem; color: #6c757d; }
              .ro-pend { color: #b45309; font-size: .72rem; font-weight: 600; }
              .ro-check-ok { color: #198754; }
              .ro-check-warn { color: #b45309; }
              .ro-check-err { color: #dc3545; }
            </style>
            <div class="ro-ent-wrap" id="roEntregasWrap">
              <table class="table table-sm table-bordered ro-ent-table" id="roEntregasTable">
                <thead><tr>
                  ${COL_HEADERS.map((h, i) => {
                    const cls = i === 0 ? 'ro-col-item' : (i === 13 ? 'ro-col-act' : '');
                    return `<th class="${cls}">${esc(h)}</th>`;
                  }).join('')}
                </tr></thead>
                <tbody id="roEntregasList"></tbody>
              </table>
            </div>
            <div class="row g-2 mt-2">
              <div class="col-lg-7">
                <div class="border rounded p-2 bg-light" id="roResumenDist"></div>
                <div id="roCronogramaValido" class="mt-1"></div>
              </div>
              <div class="col-lg-5">
                <div class="border rounded p-2" id="roChecklistCronograma">
                  <div class="fw-semibold small mb-1">Validación del cronograma</div>
                  <ul class="list-unstyled small mb-0" id="roCheckList"></ul>
                </div>
              </div>
            </div>
            <div class="alert alert-danger d-none mt-2 py-2 small" id="roEntErr"></div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary btn-sm" id="roEntSave">Guardar cronograma</button>
          </div>
        </div>
      </div>
    </div>`);

  const listEl = modalEl.querySelector('#roEntregasList');
  const resumenEl = modalEl.querySelector('#roResumenDist');
  const checkEl = modalEl.querySelector('#roCheckList');
  const validoEl = modalEl.querySelector('#roCronogramaValido');

  function usedCorrelativos(exceptIdx) {
    const s = new Set();
    entregas.forEach((e, i) => {
      if (i === exceptIdx) return;
      const n = e.correlativo === 'UNICO' ? 1 : Number(e.numero_entrega || e.correlativo);
      if (Number.isFinite(n)) s.add(n);
    });
    return s;
  }

  function calcTotales() {
    const qty = new Map();
    const mon = new Map();
    let monTotal = 0;
    entregas.forEach((e) => {
      (e.items || []).forEach((li) => {
        const it = items.find((x) => x.id === li.orden_item_id);
        const cant = Number(li.cantidad || 0);
        const pu = Number(it?.precio_unitario || 0);
        const tot = round2(cant * pu);
        qty.set(li.orden_item_id, (qty.get(li.orden_item_id) || 0) + cant);
        mon.set(li.orden_item_id, round2((mon.get(li.orden_item_id) || 0) + tot));
        monTotal = round2(monTotal + tot);
      });
    });
    return { qty, mon, monTotal };
  }

  function syncFechasEntrega(e) {
    const calc = fechasPreviewLocal({
      condicion: e.condicion_inicio,
      fechaOrden: orden.fecha_orden,
      fechaNotificacion: orden.enviado_proveedor_at,
      fechaManual: e.fecha_manual,
      plazoDias: Number(e.dias_plazo || 0),
    });
    e.fecha_evento = calc.fechaEvento || '';
    e.fecha_efectiva = calc.fechaEfectivaInicio || '';
    e.fecha_maxima = calc.fechaMaxima || '';
    e.pendiente = !!calc.pendienteNotificacion;
    return calc;
  }

  function buildChecklist() {
    const { qty, mon, monTotal } = calcTotales();
    const monAdjTot = round2(items.reduce((a, it) => a + Number(it.precio_total || 0), 0));
    let qtyOk = true;
    let qtyPend = false;
    items.forEach((it) => {
      const dist = qty.get(it.id) || 0;
      const pend = round2(Number(it.cantidad) - dist);
      if (Math.abs(pend) > 0.0001) {
        if (pend > 0) qtyPend = true;
        else qtyOk = false;
      }
      if (dist > Number(it.cantidad) + 0.0001) qtyOk = false;
    });
    const monOk = Math.abs(monTotal - monAdjTot) <= 0.01;
    const plazosOk = entregas.every((e) => Number(e.dias_plazo) >= 1);
    const inicioOk = entregas.every((e) => !!e.condicion_inicio);
    const manualOk = entregas.every((e) => {
      if (!needsManual(e.condicion_inicio)) return true;
      return !!e.fecha_manual;
    });
    const fechasOk = entregas.every((e) => {
      syncFechasEntrega(e);
      if (e.pendiente) return true;
      return !!e.fecha_efectiva && (!!e.fecha_maxima || Number(e.dias_plazo) >= 1);
    });
    const lugarOk = entregas.every((e) => String(e.lugar_entrega || '').trim());
    const corrOk = (() => {
      const s = new Set();
      for (const e of entregas) {
        const n = e.correlativo === 'UNICO' ? 1 : Number(e.numero_entrega);
        if (s.has(n)) return false;
        s.add(n);
      }
      return true;
    })();

    const status = (ok, pend = false) => {
      if (ok && !pend) return { cls: 'ro-check-ok', label: 'Completo', icon: 'bi-check-circle-fill' };
      if (pend && ok !== false) return { cls: 'ro-check-warn', label: 'Pendiente', icon: 'bi-exclamation-circle-fill' };
      return { cls: 'ro-check-err', label: 'Error', icon: 'bi-x-circle-fill' };
    };

    const rows = [
      {
        key: 'cant', label: 'Cantidades distribuidas',
        ...status(qtyOk && !qtyPend, qtyPend),
        focus: '.ro-cant',
      },
      {
        key: 'mon', label: 'Montos correctos',
        ...status(monOk),
        focus: '.ro-cant',
      },
      {
        key: 'plazo', label: 'Plazo aplicable',
        ...status(plazosOk, !plazosOk),
        focus: '.ro-dias',
      },
      {
        key: 'inicio', label: 'Inicio de actividad',
        ...status(inicioOk),
        focus: '.ro-ini-cond',
      },
      {
        key: 'evento', label: 'Fecha del evento',
        ...status(manualOk && (fechasOk || entregas.some((e) => e.pendiente)),
          entregas.some((e) => e.pendiente) || !manualOk),
        focus: needsManual(entregas[0]?.condicion_inicio) ? '.ro-ini-manual' : '.ro-ini-cond',
      },
      {
        key: 'efectiva', label: 'Fecha efectiva',
        ...status(fechasOk || entregas.every((e) => e.pendiente), entregas.some((e) => e.pendiente)),
        focus: '.ro-ini-cond',
      },
      {
        key: 'maxima', label: 'Fecha máxima o pendiente de notificación',
        ...status(
          entregas.every((e) => e.pendiente || !!e.fecha_maxima),
          entregas.some((e) => e.pendiente),
        ),
        focus: '.ro-dias',
      },
      {
        key: 'lugar', label: 'Lugar de entrega disponible',
        ...status(lugarOk, !lugarOk),
        focus: '.ro-lugar',
      },
    ];

    const estructuralOk = qtyOk && !qtyPend && monOk && plazosOk && inicioOk && manualOk && corrOk
      && entregas.length >= 1;
    const cronogramaValido = estructuralOk && fechasOk && lugarOk !== false;

    return { rows, estructuralOk, cronogramaValido, corrOk, lugarOk };
  }

  function renderChecklist() {
    const { rows, cronogramaValido, estructuralOk } = buildChecklist();
    checkEl.innerHTML = rows.map((r) => {
      const st = r.cls.includes('ok') ? 'Completo' : (r.cls.includes('warn') ? 'Pendiente' : 'Error');
      const showBtn = (r.cls.includes('err') || r.cls.includes('warn')) && r.focus;
      return `
      <li class="d-flex align-items-start justify-content-between gap-2 py-1 border-bottom">
        <span><i class="bi ${r.icon} ${r.cls} me-1"></i>${esc(r.label)}</span>
        <span class="text-end">
          <span class="${r.cls} fw-semibold d-block">${st}</span>
          ${showBtn ? `<button type="button" class="btn btn-link btn-sm p-0 ro-check-focus" data-focus="${esc(r.focus)}">Completar información</button>` : ''}
        </span>
      </li>`;
    }).join('');

    checkEl.querySelectorAll('.ro-check-focus').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sel = btn.dataset.focus;
        if (!sel) return;
        const el = listEl.querySelector(sel);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          el.focus?.();
        }
      });
    });

    validoEl.innerHTML = cronogramaValido
      ? '<span class="badge text-bg-success">Cronograma válido</span>'
      : (estructuralOk
        ? '<span class="badge text-bg-warning">Cronograma guardable (fechas pendientes de notificación u opcionalidades)</span>'
        : '<span class="badge text-bg-secondary">Cronograma incompleto</span>');
  }

  function renderResumen() {
    const { qty, mon, monTotal } = calcTotales();
    const rows = items.map((it) => {
      const dist = qty.get(it.id) || 0;
      const pend = round2(Number(it.cantidad) - dist);
      const monDist = mon.get(it.id) || 0;
      const monAdj = Number(it.precio_total);
      const dif = round2(monAdj - monDist);
      return `<tr>
        <td class="small">${esc(it.descripcion)}</td>
        <td class="text-end">${it.cantidad}</td>
        <td class="text-end">${dist}</td>
        <td class="text-end ${Math.abs(pend) > 0.0001 ? 'text-danger fw-semibold' : ''}">${pend}</td>
        <td class="text-end">${fmtMonto(monAdj)}</td>
        <td class="text-end">${fmtMonto(monDist)}</td>
        <td class="text-end ${Math.abs(dif) > 0.01 ? 'text-danger fw-semibold' : ''}">${fmtMonto(dif)}</td>
      </tr>`;
    }).join('');
    const monAdjTot = round2(items.reduce((a, it) => a + Number(it.precio_total || 0), 0));
    resumenEl.innerHTML = `
      <div class="fw-semibold mb-1 small">Resumen de distribución</div>
      <div class="table-responsive">
        <table class="table table-sm mb-0">
          <thead><tr>
            <th>Ítem</th><th class="text-end">Cantidad adjudicada</th><th class="text-end">Cantidad distribuida</th>
            <th class="text-end">Pendiente</th><th class="text-end">Monto adjudicado</th>
            <th class="text-end">Monto distribuido</th><th class="text-end">Diferencia</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr class="fw-semibold">
            <td>Total</td><td></td><td></td><td></td>
            <td class="text-end">${fmtMonto(monAdjTot)}</td>
            <td class="text-end">${fmtMonto(monTotal)}</td>
            <td class="text-end">${fmtMonto(round2(monAdjTot - monTotal))}</td>
          </tr></tfoot>
        </table>
      </div>`;
    renderChecklist();
  }

  function syncFromDom(tr, idx) {
    const e = entregas[idx];
    const corr = tr.querySelector('.ro-corr')?.value || e.correlativo;
    e.correlativo = corr;
    e.numero_entrega = corr === 'UNICO' ? 1 : Number(corr);
    e.tipo_entrega = tr.querySelector('.ro-tipo')?.value || e.tipo_entrega;
    e.dias_plazo = Number(tr.querySelector('.ro-dias')?.value || 0);
    e.condicion_inicio = tr.querySelector('.ro-ini-cond')?.value || e.condicion_inicio;
    e.fecha_manual = tr.querySelector('.ro-ini-manual')?.value || '';
    e.lugar_entrega = tr.querySelector('.ro-lugar')?.value?.trim() || '';
    tr.querySelectorAll('.ro-cant').forEach((inp) => {
      const j = Number(inp.dataset.j);
      if (e.items[j]) {
        const v = Number(inp.value || 0);
        e.items[j].cantidad = v < 0 ? 0 : v;
        const it = items.find((x) => x.id === e.items[j].orden_item_id);
        e.items[j].precio_unitario = Number(it?.precio_unitario || 0);
      }
    });
    if (corr === 'UNICO') {
      e.items = items.map((it) => ({
        orden_item_id: it.id,
        cantidad: Number(it.cantidad),
        precio_unitario: Number(it.precio_unitario),
      }));
    }
    syncFechasEntrega(e);
  }

  function renderList() {
    const plazoTxt = plazoOfertadoTexto(items);
    listEl.innerHTML = entregas.map((e, idx) => {
      syncFechasEntrega(e);
      const used = usedCorrelativos(idx);
      const iniOpts = CONDICIONES_INICIO_OPTS.map((o) => `
        <option value="${o.value}" ${e.condicion_inicio === o.value ? 'selected' : ''}>${esc(o.label)}</option>
      `).join('');

      const itemCells = (e.items || []).map((li, j) => {
        const it = items.find((x) => x.id === li.orden_item_id) || {};
        const tot = round2(Number(li.cantidad || 0) * Number(it.precio_unitario || 0));
        const desc = String(it.descripcion || '');
        return {
          itemHtml: `
            <div class="mb-1 ${j ? 'border-top pt-1' : ''}">
              <div class="ro-item-desc" title="${esc(desc)}">${esc(desc)}</div>
              <div class="text-muted" style="font-size:.7rem">
                UM: ${esc(it.unidad_medida || '—')} · Adj.: ${esc(it.cantidad)} · ${fmtMonto(it.precio_total)}
              </div>
            </div>`,
          cantHtml: `<input type="number" step="any" min="0" class="form-control form-control-sm ro-cant mb-1"
            data-j="${j}" value="${li.cantidad}" ${e.correlativo === 'UNICO' ? 'readonly' : ''}>`,
          puHtml: `<div class="mb-1 text-nowrap">${fmtMonto(it.precio_unitario)}</div>`,
          totHtml: `<div class="mb-1 text-nowrap ro-tot" data-j="${j}">${fmtMonto(tot)}</div>`,
        };
      });

      const fechaEventoHtml = needsManual(e.condicion_inicio)
        ? `<input type="date" class="form-control form-control-sm ro-ini-manual" value="${esc(e.fecha_manual)}">
           <div class="text-muted" style="font-size:.65rem">Fecha acta/contrato</div>`
        : (e.pendiente
          ? `<span class="ro-pend">Pendiente de notificación</span>`
          : `<span class="text-nowrap">${e.fecha_evento ? fmtFecha(e.fecha_evento) : '—'}</span>`);

      return `<tr data-idx="${idx}">
        <td class="ro-col-item">${itemCells.map((c) => c.itemHtml).join('')}</td>
        <td style="min-width:88px">${itemCells.map((c) => c.cantHtml).join('')}</td>
        <td class="text-end" style="min-width:90px">${itemCells.map((c) => c.puHtml).join('')}</td>
        <td class="text-end" style="min-width:90px">${itemCells.map((c) => c.totHtml).join('')}</td>
        <td style="min-width:110px">
          <select class="form-select form-select-sm ro-tipo">
            <option value="ENTREGA" ${e.tipo_entrega === 'ENTREGA' ? 'selected' : ''}>ENTREGA</option>
            <option value="ENTREGABLE" ${e.tipo_entrega === 'ENTREGABLE' ? 'selected' : ''}>ENTREGABLE</option>
            <option value="PRESTACION" ${e.tipo_entrega === 'PRESTACION' ? 'selected' : ''}>PRESTACIÓN</option>
          </select>
        </td>
        <td style="min-width:78px">
          <select class="form-select form-select-sm ro-corr">${correlativoOptions(e.correlativo, used)}</select>
        </td>
        <td style="min-width:120px;max-width:160px">
          <div class="ro-item-desc" title="${esc(plazoTxt)}">${esc(plazoTxt)}</div>
        </td>
        <td style="min-width:110px">
          <div class="input-group input-group-sm">
            <input type="number" min="1" step="1" class="form-control ro-dias" value="${e.dias_plazo || ''}" required>
            <span class="input-group-text ro-sufijo">días calendario</span>
          </div>
        </td>
        <td style="min-width:200px">
          <select class="form-select form-select-sm ro-ini-cond">${iniOpts}</select>
        </td>
        <td style="min-width:120px">${fechaEventoHtml}</td>
        <td style="min-width:100px">
          ${e.pendiente
            ? '<span class="ro-pend">Pendiente de notificación</span>'
            : `<span class="text-nowrap">${e.fecha_efectiva ? fmtFecha(e.fecha_efectiva) : '—'}</span>`}
        </td>
        <td style="min-width:100px">
          ${e.pendiente
            ? '<span class="ro-pend">Pendiente de notificación</span>'
            : `<span class="text-nowrap">${e.fecha_maxima ? fmtFecha(e.fecha_maxima) : '—'}</span>`}
        </td>
        <td style="min-width:140px;max-width:200px">
          <textarea class="form-control form-control-sm ro-lugar" rows="2"
            placeholder="No registrado">${esc(e.lugar_entrega || lugarGlobal || '')}</textarea>
          ${!(e.lugar_entrega || lugarGlobal) ? '<div class="text-warning" style="font-size:.65rem">Sin dato en solicitud; complete aquí</div>' : ''}
          ${lugarFuente && (e.lugar_entrega || lugarGlobal) ? `<div class="text-muted" style="font-size:.65rem">Fuente: ${esc(lugarFuente)}</div>` : ''}
        </td>
        <td class="ro-col-act text-center">
          <button type="button" class="btn btn-link btn-sm p-0 me-1 ro-edit" title="Editar">
            <i class="bi bi-pencil"></i>
          </button>
          <button type="button" class="btn btn-link btn-sm p-0 text-danger ro-del"
            title="Eliminar" ${entregas.length <= 1 ? 'disabled' : ''}>
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`;
    }).join('');

    listEl.querySelectorAll('tr[data-idx]').forEach((tr) => {
      const idx = Number(tr.dataset.idx);
      tr.querySelector('.ro-del')?.addEventListener('click', () => {
        if (entregas.length <= 1) {
          // eslint-disable-next-line no-alert
          if (!window.confirm('¿Eliminar la última entrega y reconstruir el cronograma?')) return;
        }
        entregas.splice(idx, 1);
        if (!entregas.length && items.length) {
          entregas.push({
            correlativo: 'UNICO',
            numero_entrega: 1,
            tipo_entrega: tipoDefault,
            dias_plazo: '',
            condicion_inicio: 'EMISION_ORDEN',
            fecha_manual: '',
            lugar_entrega: lugarGlobal,
            fecha_evento: '',
            fecha_efectiva: '',
            fecha_maxima: '',
            pendiente: false,
            items: items.map((it) => ({
              orden_item_id: it.id, cantidad: Number(it.cantidad), precio_unitario: Number(it.precio_unitario),
            })),
          });
        }
        renderList();
      });
      tr.querySelector('.ro-edit')?.addEventListener('click', () => {
        tr.querySelector('.ro-dias')?.focus();
        tr.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      });
      tr.querySelector('.ro-corr')?.addEventListener('change', () => {
        syncFromDom(tr, idx);
        if (entregas[idx].correlativo === 'UNICO') {
          const kept = entregas[idx];
          entregas.splice(0, entregas.length, kept);
        }
        renderList();
      });
      tr.querySelectorAll('.ro-cant, .ro-dias, .ro-tipo, .ro-ini-cond, .ro-ini-manual, .ro-lugar').forEach((el) => {
        el.addEventListener('change', () => {
          syncFromDom(tr, idx);
          if (el.classList.contains('ro-lugar')) {
            renderResumen();
            return;
          }
          renderList();
        });
        el.addEventListener('input', () => {
          if (el.classList.contains('ro-cant')) {
            const j = Number(el.dataset.j);
            const it = items.find((x) => x.id === entregas[idx].items[j]?.orden_item_id);
            const tot = round2(Number(el.value || 0) * Number(it?.precio_unitario || 0));
            const totEl = tr.querySelector(`.ro-tot[data-j="${j}"]`);
            if (totEl) totEl.textContent = fmtMonto(tot);
            syncFromDom(tr, idx);
            renderResumen();
          }
          if (el.classList.contains('ro-lugar')) {
            syncFromDom(tr, idx);
            renderResumen();
          }
        });
      });
    });
    renderResumen();
    modalEl.querySelector('#roAddEntrega').disabled = entregas.length >= 24;
  }

  renderList();

  modalEl.querySelector('#roAddEntrega').onclick = () => {
    if (entregas.length >= 24) return;
    if (entregas.length === 1 && entregas[0].correlativo === 'UNICO') {
      entregas[0].correlativo = '1';
      entregas[0].numero_entrega = 1;
      entregas[0].items = items.map((it) => ({
        orden_item_id: it.id, cantidad: 0, precio_unitario: Number(it.precio_unitario),
      }));
    }
    const used = usedCorrelativos(-1);
    let n = 1;
    while (used.has(n) && n <= 24) n += 1;
    entregas.push({
      correlativo: String(n),
      numero_entrega: n,
      tipo_entrega: tipoDefault,
      dias_plazo: '',
      condicion_inicio: entregas[0]?.condicion_inicio || 'EMISION_ORDEN',
      fecha_manual: entregas[0]?.fecha_manual || '',
      lugar_entrega: lugarGlobal,
      fecha_evento: '',
      fecha_efectiva: '',
      fecha_maxima: '',
      pendiente: false,
      items: items.map((it) => ({
        orden_item_id: it.id, cantidad: 0, precio_unitario: Number(it.precio_unitario),
      })),
    });
    renderList();
  };

  modalEl.querySelector('#roEntSave').onclick = async () => {
    const err = modalEl.querySelector('#roEntErr');
    err.classList.add('d-none');
    try {
      [...listEl.querySelectorAll('tr[data-idx]')].forEach((tr) => {
        syncFromDom(tr, Number(tr.dataset.idx));
      });
      if (!entregas.length) throw new Error('Debe existir al menos una entrega');
      const { qty, monTotal } = calcTotales();
      for (const it of items) {
        const dist = qty.get(it.id) || 0;
        if (dist > Number(it.cantidad) + 0.0001) {
          throw new Error(`La cantidad del ítem "${it.descripcion}" supera la adjudicada`);
        }
        if (Math.abs(dist - Number(it.cantidad)) > 0.0001) {
          throw new Error(`La cantidad distribuida del ítem "${it.descripcion}" no coincide con la adjudicada`);
        }
      }
      const monAdj = round2(items.reduce((a, it) => a + Number(it.precio_total || 0), 0));
      if (Math.abs(monTotal - monAdj) > 0.01) {
        throw new Error('El monto distribuido no coincide con el monto adjudicado');
      }
      const nums = new Set();
      for (const e of entregas) {
        if (!(Number(e.dias_plazo) >= 1)) {
          throw new Error('Cada entrega debe tener plazo aplicable (días ≥ 1)');
        }
        if (!e.condicion_inicio) throw new Error('Indique el inicio de actividad en cada fila');
        if (needsManual(e.condicion_inicio) && !e.fecha_manual) {
          throw new Error('Indique la fecha del acta o contrato');
        }
        const n = e.correlativo === 'UNICO' ? 1 : Number(e.numero_entrega);
        if (nums.has(n)) throw new Error(`Correlativo duplicado: ${n}`);
        nums.add(n);
        syncFechasEntrega(e);
      }

      const first = entregas[0];
      const inicio = {
        condicion_inicio: first.condicion_inicio,
        fecha_manual: first.fecha_manual || null,
        fecha_orden: orden.fecha_orden,
        fecha_notificacion: orden.enviado_proveedor_at,
        tipo_dias: 'calendario',
        dias_plazo: Number(first.dias_plazo || 0),
      };

      const payload = entregas.map((e) => {
        const tipo = e.tipo_entrega;
        const label = tipo === 'ENTREGABLE' ? 'Entregable' : (tipo === 'PRESTACION' ? 'Prestación' : 'Entrega');
        const num = e.correlativo === 'UNICO' ? 1 : Number(e.numero_entrega);
        return {
          numero_entrega: num,
          tipo_entrega: tipo,
          descripcion: `${label} ${e.correlativo === 'UNICO' ? 'única' : num}`,
          dias_plazo: Number(e.dias_plazo),
          tipo_dias: 'calendario',
          lugar_entrega: String(e.lugar_entrega || '').trim() || null,
          observaciones: null,
          fecha_base: e.fecha_efectiva || null,
          fecha_maxima: e.fecha_maxima || null,
          fecha_manual: e.fecha_manual || null,
          evento_inicio_plazo: e.condicion_inicio,
          items: (e.items || []).map((li) => {
            const it = items.find((x) => x.id === li.orden_item_id);
            const cant = Number(li.cantidad || 0);
            const pu = Number(it?.precio_unitario || 0);
            return {
              orden_item_id: li.orden_item_id,
              cantidad: cant,
              precio_unitario: pu,
              precio_total: round2(cant * pu),
            };
          }).filter((li) => li.cantidad > 0),
        };
      });

      await ordenesContratacionService.saveEntregas(ordenId, payload, inicio);
      // eslint-disable-next-line no-undef
      bootstrap.Modal.getInstance(modalEl)?.hide();
      onDone?.();
    } catch (e) {
      err.textContent = e.message || 'Error al guardar';
      err.classList.remove('d-none');
      renderChecklist();
    }
  };
}

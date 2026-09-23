/**
 * Normalización y render de propuestas recibidas — Recepción de Cotizaciones (RC7.6.3 + H6-B6/B7).
 */
import { normalizeTipoCotizacion, cantidadPorTipo } from './proveedorCotizacionConfig.js';
import { buildRecepcionMatrizContract } from '../../shared/recepcionCotizacionMatriz.js';

export const RC_PROPUESTA_TABLE_WRAP = 'rc-propuesta-table-scroll';
export const RC_PROPUESTA_TABLE_CLASS = 'rc-propuesta-matriz-table';

export function normalizeTipoRecepcion(tipo) {
  const t = String(tipo || '').trim();
  if (!t) return normalizeTipoCotizacion(tipo);
  const u = t.toUpperCase();
  if (u === 'S') return 'Servicios';
  if (u === 'L') return 'Locadores';
  if (u === 'B') return 'Bienes';
  if (/^locaci[oó]n$/i.test(t)) return 'Locadores';
  return normalizeTipoCotizacion(tipo);
}

function readText(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v !== 'object' && String(v).trim() !== '') return String(v);
  }
  return '';
}

function parseJson(val, fallback) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return val;
  try { return JSON.parse(val || 'null') ?? fallback; } catch (_) { return fallback; }
}

function resolveRecepcionMatriz(cot) {
  if (cot?.recepcion_matriz) return cot.recepcion_matriz;
  return buildRecepcionMatrizContract(cot, {
    requisitos_tecnicos_sc: cot?.requisitos_tecnicos_sc,
  });
}

/** Filas unificadas técnica/económica — solo ítems cotizados (listItemsCotizados / B6). */
export function normalizeFilasPropuesta(cot) {
  const tipo = normalizeTipoRecepcion(cot?.tipo);
  const recepcion = resolveRecepcionMatriz(cot);
  const rows = Array.isArray(recepcion.items) ? recepcion.items : [];
  return rows.map((row) => ({
    item_key: row.item_key,
    requerimiento_codigo: readText(row, 'requerimiento_codigo') || '—',
    pedido_sigamef: row.pedido_sigamef ?? '—',
    descripcion: readText(row, 'descripcion', 'denominacion', 'objeto') || '—',
    cantidad: tipo === 'Bienes'
      ? (row.cantidad ?? '—')
      : cantidadPorTipo(tipo, row.cantidad),
    unidad_medida: readText(row, 'unidad_medida', 'um') || (tipo === 'Bienes' ? 'UND' : 'SERVICIO'),
    marca: readText(row, 'marca'),
    modelo: readText(row, 'modelo'),
    pais: readText(row, 'pais'),
    garantia: readText(row, 'garantia'),
    plazo_entrega: readText(row, 'plazo_entrega', 'plazoEntrega'),
  }));
}

export function getRtmColumnasRecepcion(cot) {
  const recepcion = resolveRecepcionMatriz(cot);
  if (!recepcion.contrato_rtm_por_item) return [];
  return recepcion.requisitos_tecnicos_config || [];
}

export function getCeldaRtmRecepcion(cot, itemKey, reqKey) {
  const recepcion = resolveRecepcionMatriz(cot);
  return recepcion.requisitos_por_item?.[itemKey]?.[reqKey] || { presentado: false, ref: null };
}

function renderRtmCell(cotId, cell, esc) {
  if (!cell?.presentado || !cell?.ref) {
    return '<span class="text-muted small">No presentado</span>';
  }
  const id = esc(String(cotId ?? ''));
  return `<span class="btn-group btn-group-sm">
    <button type="button" class="btn btn-outline-secondary btn-sm rc-doc-ver" data-cot-id="${id}" data-ref="${esc(cell.ref)}">Ver</button>
    <button type="button" class="btn btn-outline-primary btn-sm rc-doc-dl" data-cot-id="${id}" data-ref="${esc(cell.ref)}">Descargar</button>
  </span>`;
}

export function buildFilasEconomicas(cot) {
  const tipo = normalizeTipoRecepcion(cot?.tipo);
  const propEco = parseJson(cot?.propuesta_economica, {});
  const filas = normalizeFilasPropuesta(cot);
  const precios = propEco.precios || {};
  const entregables = propEco.entregables || {};

  if (tipo === 'Locadores') {
    const rows = [];
    filas.forEach((f) => {
      const ents = entregables[f.item_key] || [];
      if (ents.length) {
        ents.forEach((e, i) => {
          rows.push({
            requerimiento_codigo: f.requerimiento_codigo,
            pedido_sigamef: f.pedido_sigamef,
            descripcion: f.descripcion,
            nro_entregable: `Entregable ${e.nro ?? i + 1}`,
            unidad_medida: readText(e, 'um', 'unidad_medida') || 'Servicio',
            precio_unitario: e.precio_unitario ?? e.unitario,
            precio_total: e.total,
          });
        });
      }
    });
    if (rows.length) return rows;
  }

  if (tipo === 'Servicios') {
    const rows = [];
    filas.forEach((f) => {
      const ents = entregables[f.item_key] || [];
      if (ents.length) {
        ents.forEach((e, i) => {
          rows.push({
            requerimiento_codigo: f.requerimiento_codigo,
            pedido_sigamef: f.pedido_sigamef,
            descripcion: f.descripcion,
            nro_entregable: `Entregable ${e.nro ?? e.numero_entregable ?? i + 1}`,
            unidad_medida: readText(e, 'um', 'unidad_medida') || f.unidad_medida,
            precio_unitario: e.precio_unitario ?? e.unitario,
            precio_total: e.total ?? e.precio_total,
          });
        });
        return;
      }
      const p = precios[f.item_key] || {};
      rows.push({
        requerimiento_codigo: f.requerimiento_codigo,
        pedido_sigamef: f.pedido_sigamef,
        descripcion: f.descripcion,
        nro_entregable: '—',
        unidad_medida: f.unidad_medida,
        precio_unitario: p.unitario,
        precio_total: p.total,
      });
    });
    return rows;
  }

  return filas.map((f) => {
    const p = precios[f.item_key] || {};
    return {
      item_key: f.item_key,
      requerimiento_codigo: f.requerimiento_codigo,
      pedido_sigamef: f.pedido_sigamef,
      descripcion: f.descripcion,
      cantidad: f.cantidad,
      precio_unitario: p.unitario,
      precio_total: p.total,
    };
  });
}

function renderCondicionesTecnicas(propTec, esc) {
  const plazo = readText(propTec, 'plazo_ejecucion', 'plazoEjecucion') || '—';
  const forma = readText(propTec, 'forma_pago', 'formaPago') || '—';
  return `
    <div class="card border-0 bg-light mt-3">
      <div class="card-body py-3">
        <h6 class="fw-semibold mb-3">Condiciones de la propuesta técnica</h6>
        <div class="mb-3">
          <label class="form-label small text-muted mb-1">Plazo de ejecución</label>
          <div class="border rounded p-2 bg-white small" style="white-space:pre-wrap;">${esc(plazo)}</div>
        </div>
        <div>
          <label class="form-label small text-muted mb-1">Forma de pago</label>
          <div class="border rounded p-2 bg-white small" style="white-space:pre-wrap;">${esc(forma)}</div>
        </div>
      </div>
    </div>`;
}

function renderTecnicaBienes(filas, cot, esc) {
  if (!filas.length) return '<div class="text-muted small">Sin información técnica registrada.</div>';
  const cols = getRtmColumnasRecepcion(cot);
  const minWidth = 900 + cols.length * 130;
  const cotId = cot?.id;
  return `
    <div class="${RC_PROPUESTA_TABLE_WRAP}" style="overflow-x:auto;">
      <table class="table table-sm table-bordered mb-0 ${RC_PROPUESTA_TABLE_CLASS}" style="min-width:${minWidth}px;">
        <thead class="table-light text-center">
          <tr>
            <th>Requerimiento</th>
            <th>N.° Pedido SIGAMEF</th>
            <th>Descripción</th><th>Cantidad</th><th>Marca</th><th>Modelo</th>
            <th>País</th><th>Garantía</th><th>Plazo de entrega</th>
            ${cols.map((c) => `<th class="small text-wrap" style="min-width:110px;">${esc(c.requisito)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${filas.map((r) => `
          <tr>
            <td class="small">${esc(r.requerimiento_codigo)}</td>
            <td class="small">${esc(r.pedido_sigamef || '—')}</td>
            <td class="small">${esc(r.descripcion)}</td>
            <td class="text-center small">${esc(r.cantidad)}</td>
            <td class="small">${esc(r.marca || '—')}</td>
            <td class="small">${esc(r.modelo || '—')}</td>
            <td class="small">${esc(r.pais || '—')}</td>
            <td class="small">${esc(r.garantia || '—')}</td>
            <td class="small">${esc(r.plazo_entrega || '—')}</td>
            ${cols.map((c) => `<td class="small text-center align-middle">${renderRtmCell(cotId, getCeldaRtmRecepcion(cot, r.item_key, c.req_key), esc)}</td>`).join('')}
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function renderTecnicaServiciosLocadores(propTec, tipo, filas, cot, esc) {
  const descCol = tipo === 'Locadores' ? 'Descripción del servicio de locación' : 'Descripción del servicio';
  if (!filas.length) {
    return `<div class="text-muted small">Sin información técnica registrada.</div>${renderCondicionesTecnicas(propTec, esc)}`;
  }
  const cols = getRtmColumnasRecepcion(cot);
  const minWidth = 700 + cols.length * 130;
  const cotId = cot?.id;
  return `
    <div class="${RC_PROPUESTA_TABLE_WRAP}" style="overflow-x:auto;">
      <table class="table table-sm table-bordered mb-0 ${RC_PROPUESTA_TABLE_CLASS}" style="min-width:${minWidth}px;">
        <thead class="table-light text-center">
          <tr>
            <th>Ítem</th><th>N.° REQ</th><th>N.° Pedido SIGAMEF</th><th>${esc(descCol)}</th><th>Cantidad</th><th>Unidad de medida</th>
            ${cols.map((c) => `<th class="small text-wrap" style="min-width:110px;">${esc(c.requisito)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${filas.map((r, idx) => `
          <tr>
            <td class="text-center small">${idx + 1}</td>
            <td class="small">${esc(r.requerimiento_codigo)}</td>
            <td class="small">${esc(r.pedido_sigamef || '—')}</td>
            <td class="small">${esc(r.descripcion)}</td>
            <td class="text-center small">${esc(r.cantidad)}</td>
            <td class="text-center small">${esc(r.unidad_medida)}</td>
            ${cols.map((c) => `<td class="small text-center align-middle">${renderRtmCell(cotId, getCeldaRtmRecepcion(cot, r.item_key, c.req_key), esc)}</td>`).join('')}
          </tr>`).join('')}</tbody>
      </table>
    </div>
    ${renderCondicionesTecnicas(propTec, esc)}`;
}

export function renderPropuestaTecnicaRecepcion(cot, esc) {
  const tipo = normalizeTipoRecepcion(cot?.tipo);
  const propTec = parseJson(cot?.propuesta_tecnica, {});
  const filas = normalizeFilasPropuesta(cot);
  if (tipo === 'Bienes') return renderTecnicaBienes(filas, cot, esc);
  return renderTecnicaServiciosLocadores(propTec, tipo, filas, cot, esc);
}

function fmtPrecioVal(n, moneda, fmtMonto) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  return fmtMonto(n, moneda);
}

function renderEcoBienes(filas, monto, moneda, datos, fmtMonto, esc) {
  if (!filas.length) return '<div class="text-muted small">Sin precios registrados.</div>';
  return `
    <div class="${RC_PROPUESTA_TABLE_WRAP}" style="overflow-x:auto;">
      <table class="table table-sm table-bordered mb-0 ${RC_PROPUESTA_TABLE_CLASS}" style="min-width:720px;">
        <thead class="table-light text-center">
          <tr>
            <th>Requerimiento</th><th>N.° Pedido SIGAMEF</th><th>Descripción</th><th>Cantidad</th>
            <th class="text-end">Precio unitario</th><th class="text-end">Precio total</th>
          </tr>
        </thead>
        <tbody>${filas.map((r) => `
          <tr>
            <td class="small">${esc(r.requerimiento_codigo)}</td>
            <td class="small">${esc(r.pedido_sigamef || '—')}</td>
            <td class="small">${esc(r.descripcion)}</td>
            <td class="text-center small">${esc(r.cantidad)}</td>
            <td class="text-end small">${fmtPrecioVal(r.precio_unitario, moneda, fmtMonto)}</td>
            <td class="text-end small">${fmtPrecioVal(r.precio_total, moneda, fmtMonto)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="mt-2 fw-semibold text-end">Total ofertado: ${fmtMonto(monto, moneda)}</div>
    <div class="mt-2 small text-muted">Validez de la oferta: ${esc(datos.validez_oferta || '—')}</div>`;
}

function renderEcoServicios(filas, monto, moneda, datos, fmtMonto, esc) {
  if (!filas.length) return '<div class="text-muted small">Sin precios registrados.</div>';
  return `
    <div class="${RC_PROPUESTA_TABLE_WRAP}" style="overflow-x:auto;">
      <table class="table table-sm table-bordered mb-0 ${RC_PROPUESTA_TABLE_CLASS}" style="min-width:820px;">
        <thead class="table-light text-center">
          <tr>
            <th>Requerimiento</th><th>N.° Pedido SIGAMEF</th><th>Descripción del servicio</th><th>N.° de entregable</th>
            <th>Unidad de medida</th><th class="text-end">Precio unitario por entregable</th><th class="text-end">Precio total</th>
          </tr>
        </thead>
        <tbody>${filas.map((r) => `
          <tr>
            <td class="small">${esc(r.requerimiento_codigo)}</td>
            <td class="small">${esc(r.pedido_sigamef || '—')}</td>
            <td class="small">${esc(r.descripcion)}</td>
            <td class="small text-center">${esc(r.nro_entregable)}</td>
            <td class="text-center small">${esc(r.unidad_medida)}</td>
            <td class="text-end small">${fmtPrecioVal(r.precio_unitario, moneda, fmtMonto)}</td>
            <td class="text-end small">${fmtPrecioVal(r.precio_total, moneda, fmtMonto)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="mt-2 fw-semibold text-end">Precio total del servicio: ${fmtMonto(monto, moneda)}</div>
    <div class="mt-2 small text-muted">Validez de la oferta: ${esc(datos.validez_oferta || '—')}</div>`;
}

function renderEcoLocadores(filas, monto, moneda, datos, fmtMonto, esc) {
  if (!filas.length) {
    return `<div class="text-muted small">Sin precios de entregables registrados.</div>
      <div class="mt-2 fw-semibold text-end">Precio total del servicio: ${fmtMonto(monto, moneda)}</div>`;
  }
  return renderEcoServicios(filas, monto, moneda, datos, fmtMonto, esc);
}

export function renderPropuestaEconomicaRecepcion(cot, esc, fmtMonto) {
  const tipo = normalizeTipoRecepcion(cot?.tipo);
  const propEco = parseJson(cot?.propuesta_economica, {});
  const datos = cot?.datos_proveedor || propEco.datos_proveedor || {};
  const monto = cot?.monto ?? propEco.monto;
  const moneda = cot?.moneda || propEco.moneda || 'PEN';
  const filas = buildFilasEconomicas(cot);

  if (tipo === 'Servicios') return renderEcoServicios(filas, monto, moneda, datos, fmtMonto, esc);
  if (tipo === 'Locadores') return renderEcoLocadores(filas, monto, moneda, datos, fmtMonto, esc);
  return renderEcoBienes(filas, monto, moneda, datos, fmtMonto, esc);
}

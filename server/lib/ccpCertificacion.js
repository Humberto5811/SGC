/**
 * Certificación Presupuestal (CCP) — bandeja, códigos y consolidaciones.
 */
import { query } from '../db.js';
import { resolveValidationCentro } from '../../shared/validacionCentro.js';
import { buildCcpEstadoResponse } from './ccpEstadoFlags.js';
import { resolveEstadoActualExpediente, badgeVisualEstadoVigente } from '../../shared/estadoExpedienteVigente.js';
import { enrichEstadoResponsableForBandeja } from './enrichEstadoResponsable.js';
import { normalizarTipo, TIPOS_CONTRATACION } from '../../shared/workflow/tiposContratacion.js';

export const ORIGEN_CCP = Object.freeze({
  CUADRO_COMPARATIVO: 'CUADRO_COMPARATIVO',
  RECEPCION_COTIZACION_LOCACION: 'RECEPCION_COTIZACION_LOCACION',
});

export const ESTADOS_CCP_BANDEJA = Object.freeze({
  PENDIENTE_CONSOLIDACION: 'PENDIENTE_CONSOLIDACION',
  SOLICITUD_PREPARADA: 'SOLICITUD_PREPARADA',
  ENVIADA_OPPM: 'ENVIADA_OPPM',
  PENDIENTE_CCP: 'PENDIENTE_CCP',
  CCP_REGISTRADO: 'CCP_REGISTRADO',
  CCP_REGISTRADA: 'CCP_REGISTRADA',
  ANULADO: 'ANULADO',
});

export const ESTADOS_CCP_LABEL = Object.freeze({
  PENDIENTE_CONSOLIDACION: 'Pendiente de consolidación',
  SOLICITUD_PREPARADA: 'Solicitud CCP preparada',
  ENVIADA_OPPM: 'Solicitud enviada a OPPM',
  PENDIENTE_CCP: 'Pendiente de CCP',
  CCP_REGISTRADO: 'CCP registrada',
  CCP_REGISTRADA: 'CCP registrada',
  OBSERVADO_OPPM: 'Observado por OPPM',
  ANULADO: 'CCP anulado',
});

const CODIGO_CCP_RE = /^[A-Za-z0-9][A-Za-z0-9\-/._ ]{1,118}[A-Za-z0-9]$|^[A-Za-z0-9]{2,120}$/;

function parseJson(raw, fallback = {}) {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw || 'null') ?? fallback; } catch (_) { return fallback; }
}

function httpError(message, status = 400, code = 'CCP_ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function registrarEvento({
  tipo, requerimientoId = null, solicitudId = null, codigoCcpId = null,
  usuario = '', rol = '', valorAnterior = null, valorNuevo = null, observacion = '',
}) {
  await query(`
    INSERT INTO ccp_eventos (
      tipo, requerimiento_id, solicitud_id, codigo_ccp_id,
      usuario, rol, valor_anterior, valor_nuevo, observacion
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  `, [
    tipo,
    requerimientoId,
    solicitudId,
    codigoCcpId,
    String(usuario || '').slice(0, 150),
    String(rol || '').slice(0, 80),
    valorAnterior != null ? String(valorAnterior).slice(0, 2000) : null,
    valorNuevo != null ? String(valorNuevo).slice(0, 2000) : null,
    String(observacion || '').slice(0, 2000) || null,
  ]);
}

export function normalizeCodigoCcp(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

export function validateCodigoCcp(raw) {
  const codigo = normalizeCodigoCcp(raw);
  if (!codigo) throw httpError('El código CCP es obligatorio', 400, 'CCP_CODIGO_VACIO');
  if (codigo.length < 2 || codigo.length > 120) {
    throw httpError('El código CCP debe tener entre 2 y 120 caracteres', 400, 'CCP_CODIGO_LONGITUD');
  }
  if (!CODIGO_CCP_RE.test(codigo)) {
    throw httpError('El código CCP solo admite letras, números, guiones y separadores institucionales', 400, 'CCP_CODIGO_FORMATO');
  }
  return codigo;
}

function labelEstadoBandeja({ codigoActivo, consolidacionEstado, consolidacionId }) {
  if (codigoActivo) return ESTADOS_CCP_BANDEJA.CCP_REGISTRADO;
  if (!consolidacionId) return ESTADOS_CCP_BANDEJA.PENDIENTE_CONSOLIDACION;
  const e = String(consolidacionEstado || '').toUpperCase();
  if (e === 'ENVIADA_OPPM') return ESTADOS_CCP_BANDEJA.ENVIADA_OPPM;
  if (e === 'OBSERVADO_OPPM') return ESTADOS_CCP_BANDEJA.OBSERVADO_OPPM;
  if (e === 'ANULADA' || e === 'ANULADO') return ESTADOS_CCP_BANDEJA.ANULADO;
  if (codigoActivo) return ESTADOS_CCP_BANDEJA.CCP_REGISTRADO;
  return ESTADOS_CCP_BANDEJA.SOLICITUD_PREPARADA;
}

async function loadPedidosRequerimiento(requerimientoId) {
  const { rows } = await query(`
    SELECT p.id, p.centro, p.centro_costo, p.sec_func, p.fuente_fto, p.especifica,
      p.descripcion, p.codigo_sigamef, p.total_item, p.cant_solicitada, p.pedido_sigamef, p.nro_pedido
    FROM requerimiento_pedidos rp
    JOIN pedidos_sigamef p ON p.id = rp.pedido_sigamef_id
    WHERE rp.requerimiento_id = $1
    ORDER BY p.id ASC
  `, [requerimientoId]);
  return rows;
}

function montoAdjudicadoDeCuadro(cuadroRow) {
  if (!cuadroRow) return 0;
  if (cuadroRow.valor_adjudicado != null && Number.isFinite(Number(cuadroRow.valor_adjudicado))) {
    return Number(Number(cuadroRow.valor_adjudicado).toFixed(2));
  }
  const datos = parseJson(cuadroRow.datos_json, {});
  const adj = datos.adjudicacion || {};
  if (adj.valor_adjudicado != null && Number.isFinite(Number(adj.valor_adjudicado))) {
    return Number(Number(adj.valor_adjudicado).toFixed(2));
  }
  const items = Array.isArray(datos.items) ? datos.items : [];
  const sum = items.reduce((acc, it) => {
    const vt = Number(it.valor_adjudicado_item ?? it.adjudicado?.valor_total ?? 0);
    return acc + (Number.isFinite(vt) ? vt : 0);
  }, 0);
  return Number(sum.toFixed(2));
}

function montoDesdePropuestaEconomica(propuestaEconomica) {
  const eco = parseJson(propuestaEconomica, {});
  const n = Number(eco?.monto ?? eco?.total ?? eco?.precio_total ?? 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

/**
 * Fuente única de datos CCP (Bien/Servicio vía cuadro; Locación vía recepción).
 * @returns {Promise<object>}
 */
export async function resolveFuenteDatosCcp(requerimientoId) {
  const id = parseInt(requerimientoId, 10);
  if (!Number.isFinite(id)) throw httpError('Requerimiento inválido');

  const { rows: cuadroRows } = await query(`
    SELECT r.id AS requerimiento_id, r.codigo AS requerimiento_codigo, r.denominacion, r.tipo,
      r.estado_actual, r.area, r.payload,
      sc.id AS solicitud_id, sc.codigo AS solicitud_codigo, sc.estado AS solicitud_estado,
      sc.area_usuaria, sc.objeto,
      cc.id AS cuadro_id, cc.valor_adjudicado, cc.datos_json, cc.proveedor_ganador_id,
      p.razon_social AS proveedor_nombre, p.ruc AS proveedor_ruc
    FROM requerimientos r
    JOIN solicitud_requerimientos sr ON sr.requerimiento_id = r.id
    JOIN solicitudes_cotizacion sc ON sc.id = sr.solicitud_id
    JOIN cuadros_comparativos cc ON cc.solicitud_id = sc.id
      AND UPPER(COALESCE(cc.estado, '')) = 'DERIVADO_CCP'
      AND UPPER(COALESCE(cc.tipo, '')) IN ('BIENES', 'SERVICIOS')
    LEFT JOIN proveedores p ON p.id = cc.proveedor_ganador_id
    WHERE r.id = $1
    ORDER BY cc.version DESC NULLS LAST, cc.id DESC
    LIMIT 1
  `, [id]);

  if (cuadroRows[0]) {
    const row = cuadroRows[0];
    return {
      origenCcp: ORIGEN_CCP.CUADRO_COMPARATIVO,
      requerimientoId: row.requerimiento_id,
      requerimientoCodigo: row.requerimiento_codigo,
      denominacion: row.denominacion || row.objeto || '',
      tipo: row.tipo || '',
      estadoActual: row.estado_actual || '',
      cuadroId: row.cuadro_id,
      solicitudId: row.solicitud_id,
      solicitudCodigo: row.solicitud_codigo,
      solicitudEstado: row.solicitud_estado || '',
      cotizacionId: null,
      proveedorId: row.proveedor_ganador_id || null,
      proveedorNombre: row.proveedor_nombre || '',
      proveedorRuc: row.proveedor_ruc || '',
      monto: montoAdjudicadoDeCuadro(row),
      moneda: 'PEN',
      areaUsuaria: row.area_usuaria || row.area || '',
      payload: row.payload,
      // compat assertReqEnCcp / consolidación
      id: row.requerimiento_id,
      solicitud_id: row.solicitud_id,
      cuadro_id: row.cuadro_id,
      valor_adjudicado: row.valor_adjudicado,
      datos_json: row.datos_json,
    };
  }

  const { rows: locRows } = await query(`
    SELECT r.id AS requerimiento_id, r.codigo AS requerimiento_codigo, r.denominacion, r.tipo,
      r.estado_actual, r.area, r.payload,
      sc.id AS solicitud_id, sc.codigo AS solicitud_codigo, sc.estado AS solicitud_estado,
      sc.area_usuaria, sc.objeto, sc.tipo AS solicitud_tipo,
      cot.id AS cotizacion_id, cot.propuesta_economica, cot.proveedor_id,
      p.razon_social AS proveedor_nombre, p.ruc AS proveedor_ruc
    FROM requerimientos r
    JOIN solicitud_requerimientos sr ON sr.requerimiento_id = r.id
    JOIN solicitudes_cotizacion sc ON sc.id = sr.solicitud_id
    LEFT JOIN LATERAL (
      SELECT c.* FROM cotizaciones_proveedor c
      WHERE c.solicitud_id = sc.id AND c.estado = 'COTIZACION_PRESENTADA'
      ORDER BY
        CASE WHEN COALESCE(c.validacion_informe, '{}'::jsonb) ? 'derivacion_ccp' THEN 0 ELSE 1 END,
        c.fecha_presentacion DESC NULLS LAST,
        c.id DESC
      LIMIT 1
    ) cot ON TRUE
    LEFT JOIN proveedores p ON p.id = cot.proveedor_id
    WHERE r.id = $1
      AND UPPER(COALESCE(r.estado_actual, '')) = 'CCP'
      AND UPPER(COALESCE(sc.estado, '')) = 'EN_CCP'
    LIMIT 1
  `, [id]);

  if (!locRows[0]) {
    throw httpError('El requerimiento no está derivado a CCP', 409, 'CCP_NO_DERIVADO');
  }

  const row = locRows[0];
  const tipoCanon = normalizarTipo(row.tipo || row.solicitud_tipo || '');
  if (tipoCanon !== TIPOS_CONTRATACION.LOCACION) {
    throw httpError('El requerimiento no está derivado a CCP', 409, 'CCP_NO_DERIVADO');
  }
  if (!row.cotizacion_id) {
    throw httpError('Locación en CCP sin cotización presentada válida', 409, 'CCP_SIN_COTIZACION');
  }

  const eco = parseJson(row.propuesta_economica, {});
  const moneda = String(eco?.moneda || 'PEN').toUpperCase() || 'PEN';

  return {
    origenCcp: ORIGEN_CCP.RECEPCION_COTIZACION_LOCACION,
    requerimientoId: row.requerimiento_id,
    requerimientoCodigo: row.requerimiento_codigo,
    denominacion: row.denominacion || row.objeto || '',
    tipo: row.tipo || row.solicitud_tipo || 'LOCACION',
    estadoActual: row.estado_actual || 'CCP',
    cuadroId: null,
    solicitudId: row.solicitud_id,
    solicitudCodigo: row.solicitud_codigo,
    solicitudEstado: row.solicitud_estado || '',
    cotizacionId: row.cotizacion_id,
    proveedorId: row.proveedor_id || null,
    proveedorNombre: row.proveedor_nombre || '',
    proveedorRuc: row.proveedor_ruc || '',
    monto: montoDesdePropuestaEconomica(row.propuesta_economica),
    moneda,
    areaUsuaria: row.area_usuaria || row.area || '',
    payload: row.payload,
    id: row.requerimiento_id,
    solicitud_id: row.solicitud_id,
    cuadro_id: null,
    valor_adjudicado: montoDesdePropuestaEconomica(row.propuesta_economica),
    datos_json: null,
  };
}


/**
 * Filas presupuestales: Requerimiento + Centro + Meta + Fuente + Específica.
 * Distribuye el monto adjudicado proporcionalmente a total_item de pedidos (o partes iguales).
 */
export function buildFilasPresupuestales({
  requerimiento, pedidos = [], montoTotal = 0, codigoCcp = '',
}) {
  const monto = Number(montoTotal) || 0;
  const list = Array.isArray(pedidos) && pedidos.length
    ? pedidos
    : [{
      centro: '',
      sec_func: '',
      fuente_fto: '',
      especifica: '',
      descripcion: requerimiento?.denominacion || '',
      total_item: monto || 1,
    }];

  const pesos = list.map((p) => {
    const t = Number(p.total_item);
    return Number.isFinite(t) && t > 0 ? t : 0;
  });
  const pesoSum = pesos.reduce((a, b) => a + b, 0) || list.length;

  return list.map((p, idx) => {
    const centroRes = resolveValidationCentro({
      pedidoCentro: p.centro,
      requerimientoCentro: requerimiento?.centro || requerimiento?.centro_nombre || '',
      centroCosto: p.centro_costo || '',
    });
    const peso = pesos[idx] > 0 ? pesos[idx] : (pesoSum / list.length);
    const filaMonto = Number(((monto * peso) / pesoSum).toFixed(2));
    return {
      codigo_ccp: codigoCcp || '',
      centro: centroRes.centro || '—',
      descripcion: p.descripcion || requerimiento?.denominacion || '—',
      meta: p.sec_func || '—',
      fuente_fto: p.fuente_fto || '—',
      especifica: p.especifica || '—',
      requerimiento: requerimiento?.codigo || '—',
      requerimiento_id: requerimiento?.id || null,
      monto: filaMonto,
      moneda: 'PEN',
    };
  });
}

export async function listarBandejaCcp() {
  // Fuente A — Bienes/Servicios vía Cuadro Comparativo (DERIVADO_CCP).
  const { rows: rowsCuadro } = await query(`
    SELECT
      r.id AS requerimiento_id,
      r.codigo AS requerimiento_codigo,
      r.denominacion,
      r.tipo,
      r.estado_actual,
      r.payload,
      sc.id AS solicitud_id,
      sc.codigo AS solicitud_codigo,
      sc.estado AS solicitud_estado,
      sc.objeto,
      sc.area_usuaria,
      cc.id AS cuadro_id,
      cc.estado AS cuadro_estado,
      cc.valor_adjudicado,
      cc.datos_json,
      cc.proveedor_ganador_id,
      p.razon_social AS proveedor_nombre,
      p.ruc AS proveedor_ruc,
      NULL::int AS cotizacion_id,
      'CUADRO_COMPARATIVO'::text AS origen_ccp,
      cod.id AS codigo_id,
      cod.codigo_ccp,
      cod.estado AS codigo_estado,
      cod.registrado_por,
      cod.registrado_at,
      cod.modificado_por,
      cod.modificado_at,
      sol.id AS consolidacion_id,
      sol.codigo_interno AS consolidacion_codigo,
      sol.estado AS consolidacion_estado,
      COALESCE(cod.registrado_at, cc.derivado_at, sol.fecha_creacion, cc.actualizado_at, sc.updated_at) AS fecha_ingreso_ccp
    FROM cuadros_comparativos cc
    JOIN solicitudes_cotizacion sc ON sc.id = cc.solicitud_id
    JOIN solicitud_requerimientos sr ON sr.solicitud_id = sc.id
    JOIN requerimientos r ON r.id = sr.requerimiento_id
    LEFT JOIN proveedores p ON p.id = cc.proveedor_ganador_id
    LEFT JOIN LATERAL (
      SELECT c.* FROM ccp_codigos c
      WHERE c.requerimiento_id = r.id AND c.estado = 'ACTIVO'
      ORDER BY c.id DESC LIMIT 1
    ) cod ON TRUE
    LEFT JOIN LATERAL (
      SELECT csr.solicitud_id
      FROM ccp_solicitud_requerimientos csr
      WHERE csr.requerimiento_id = r.id AND csr.activo = TRUE
      ORDER BY csr.id DESC LIMIT 1
    ) link ON TRUE
    LEFT JOIN ccp_solicitudes sol ON sol.id = link.solicitud_id AND sol.estado <> 'ANULADA'
    WHERE UPPER(COALESCE(cc.estado, '')) = 'DERIVADO_CCP'
      AND UPPER(COALESCE(cc.tipo, '')) IN ('BIENES', 'SERVICIOS')
      AND (
        UPPER(COALESCE(sc.estado, '')) IN ('EN_CCP', 'EN_CUADRO_COMPARATIVO', 'EN_ORDEN', 'EN_EJECUCION')
        OR cod.codigo_ccp IS NOT NULL
      )
    ORDER BY COALESCE(cod.registrado_at, cc.derivado_at, sol.fecha_creacion, cc.actualizado_at, sc.updated_at) DESC NULLS LAST, r.id DESC
  `);

  // Fuente B — Locación directa desde Recepción (sin cuadro).
  const { rows: rowsLocacion } = await query(`
    SELECT
      r.id AS requerimiento_id,
      r.codigo AS requerimiento_codigo,
      r.denominacion,
      r.tipo,
      r.estado_actual,
      r.payload,
      sc.id AS solicitud_id,
      sc.codigo AS solicitud_codigo,
      sc.estado AS solicitud_estado,
      sc.objeto,
      sc.area_usuaria,
      NULL::int AS cuadro_id,
      NULL::text AS cuadro_estado,
      cot.propuesta_economica,
      cot.proveedor_id AS proveedor_ganador_id,
      p.razon_social AS proveedor_nombre,
      p.ruc AS proveedor_ruc,
      cot.id AS cotizacion_id,
      'RECEPCION_COTIZACION_LOCACION'::text AS origen_ccp,
      cod.id AS codigo_id,
      cod.codigo_ccp,
      cod.estado AS codigo_estado,
      cod.registrado_por,
      cod.registrado_at,
      cod.modificado_por,
      cod.modificado_at,
      sol.id AS consolidacion_id,
      sol.codigo_interno AS consolidacion_codigo,
      sol.estado AS consolidacion_estado,
      COALESCE(cod.registrado_at, sol.fecha_creacion, cot.fecha_presentacion, sc.updated_at) AS fecha_ingreso_ccp
    FROM requerimientos r
    JOIN solicitud_requerimientos sr ON sr.requerimiento_id = r.id
    JOIN solicitudes_cotizacion sc ON sc.id = sr.solicitud_id
    LEFT JOIN LATERAL (
      SELECT c.* FROM cotizaciones_proveedor c
      WHERE c.solicitud_id = sc.id AND c.estado = 'COTIZACION_PRESENTADA'
      ORDER BY
        CASE WHEN COALESCE(c.validacion_informe, '{}'::jsonb) ? 'derivacion_ccp' THEN 0 ELSE 1 END,
        c.fecha_presentacion DESC NULLS LAST,
        c.id DESC
      LIMIT 1
    ) cot ON TRUE
    LEFT JOIN proveedores p ON p.id = cot.proveedor_id
    LEFT JOIN LATERAL (
      SELECT c.* FROM ccp_codigos c
      WHERE c.requerimiento_id = r.id AND c.estado = 'ACTIVO'
      ORDER BY c.id DESC LIMIT 1
    ) cod ON TRUE
    LEFT JOIN LATERAL (
      SELECT csr.solicitud_id
      FROM ccp_solicitud_requerimientos csr
      WHERE csr.requerimiento_id = r.id AND csr.activo = TRUE
      ORDER BY csr.id DESC LIMIT 1
    ) link ON TRUE
    LEFT JOIN ccp_solicitudes sol ON sol.id = link.solicitud_id AND sol.estado <> 'ANULADA'
    WHERE cot.id IS NOT NULL
      AND (
        (
          UPPER(COALESCE(r.estado_actual, '')) = 'CCP'
          AND UPPER(COALESCE(sc.estado, '')) = 'EN_CCP'
        )
        OR (
          /* RC8.9 — pertenencia histórica: código CCP formal aunque etapa ya avanzó */
          cod.codigo_ccp IS NOT NULL
          AND UPPER(COALESCE(sc.estado, '')) IN ('EN_CCP', 'EN_ORDEN', 'EN_EJECUCION')
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM cuadros_comparativos cc
        WHERE cc.solicitud_id = sc.id
          AND UPPER(COALESCE(cc.estado, '')) = 'DERIVADO_CCP'
          AND UPPER(COALESCE(cc.tipo, '')) IN ('BIENES', 'SERVICIOS')
      )
    ORDER BY COALESCE(cod.registrado_at, sol.fecha_creacion, cot.fecha_presentacion, sc.updated_at) DESC NULLS LAST, r.id DESC
  `);

  const rows = [
    ...rowsCuadro,
    ...rowsLocacion.filter((r) => normalizarTipo(r.tipo || '') === TIPOS_CONTRATACION.LOCACION),
  ];

  const out = [];
  const seen = new Set();
  const reqIds = [...new Set(rows.map((r) => r.requerimiento_id).filter(Boolean))];
  let evidenceByReq = new Map();
  try {
    const { loadEstadoExpedienteEvidenceByIds } = await import('./estadoExpedienteEvidence.js');
    evidenceByReq = await loadEstadoExpedienteEvidenceByIds(reqIds);
  } catch (_) { /* ok */ }

  for (const row of rows) {
    const key = `${row.requerimiento_id}:${row.solicitud_id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const origenCcp = row.origen_ccp === ORIGEN_CCP.RECEPCION_COTIZACION_LOCACION
      ? ORIGEN_CCP.RECEPCION_COTIZACION_LOCACION
      : ORIGEN_CCP.CUADRO_COMPARATIVO;

    const pedidos = await loadPedidosRequerimiento(row.requerimiento_id);
    const centroRes = resolveValidationCentro({
      pedidoCentro: pedidos[0]?.centro || '',
      requerimientoCentro: (() => {
        const pl = parseJson(row.payload, {});
        return pl.centro_display || pl.centro_nombre || pl.centro || '';
      })(),
      centroCosto: pedidos[0]?.centro_costo || '',
    });
    const monto = origenCcp === ORIGEN_CCP.RECEPCION_COTIZACION_LOCACION
      ? montoDesdePropuestaEconomica(row.propuesta_economica)
      : montoAdjudicadoDeCuadro(row);
    const moneda = origenCcp === ORIGEN_CCP.RECEPCION_COTIZACION_LOCACION
      ? (String(parseJson(row.propuesta_economica, {})?.moneda || 'PEN').toUpperCase() || 'PEN')
      : 'PEN';
    const estadoCode = labelEstadoBandeja({
      codigoActivo: !!row.codigo_ccp,
      consolidacionEstado: row.consolidacion_estado,
      consolidacionId: row.consolidacion_id,
    });
    const enConsolidacionActiva = !!row.consolidacion_id;
    const ev = evidenceByReq.get(Number(row.requerimiento_id)) || {};

    const seed = {
      solicitud_estado: row.solicitud_estado,
      estado_cuadro: row.cuadro_estado || (origenCcp === ORIGEN_CCP.RECEPCION_COTIZACION_LOCACION ? '' : ''),
      codigo_ccp: row.codigo_ccp || ev.codigo_ccp || '',
      ccp_activo: !!(row.codigo_ccp || ev.ccp_activo),
      consolidacion_estado: row.consolidacion_estado,
      orden_id: ev.orden_id || null,
      orden_estado: ev.orden_estado || '',
      enviado_proveedor_at: ev.enviado_proveedor_at || null,
      recibido_proveedor_at: ev.recibido_proveedor_at || null,
      derivado_ejecucion_at: ev.derivado_ejecucion_at || null,
      orden_resuelta: !!ev.orden_resuelta,
      expediente_derivado_pago: !!ev.expediente_derivado_pago,
      recepcion_estado_global: ev.recepcion_estado_global || '',
      recepcion_estado_interno: ev.recepcion_estado_interno || '',
      recepcion_bienes_expediente_id: ev.recepcion_bienes_expediente_id ?? null,
    };
    const vigente = resolveEstadoActualExpediente(seed);
    const badge = badgeVisualEstadoVigente(seed);
    const isCcpReg = vigente.codigo === 'CCP_REGISTRADA' || vigente.code === 'CCP_REGISTRADA';
    const isOrdenOrLater = ['REGISTRO_ORDENES', 'ORDEN_REGISTRADA', 'ORDEN_LISTA_NOTIFICACION',
      'ORDEN_NOTIFICADA', 'ORDEN_RECEPCION_CONFIRMADA', 'EN_EJECUCION',
      'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO'].includes(vigente.codigo || vigente.code);
    out.push({
      requerimiento_id: row.requerimiento_id,
      requerimiento_codigo: row.requerimiento_codigo,
      denominacion: row.denominacion || row.objeto || '',
      tipo: row.tipo || '',
      tipo_label: origenCcp === ORIGEN_CCP.RECEPCION_COTIZACION_LOCACION ? 'Locación' : (row.tipo || ''),
      origen_ccp: origenCcp,
      origen_ccp_label: origenCcp === ORIGEN_CCP.RECEPCION_COTIZACION_LOCACION
        ? 'Recepción de Cotización'
        : 'Cuadro Comparativo',
      solicitud_id: row.solicitud_id,
      solicitud_codigo: row.solicitud_codigo,
      centro: centroRes.centro || '',
      area_usuaria: row.area_usuaria || '',
      estado_ccp: isCcpReg ? ESTADOS_CCP_BANDEJA.CCP_REGISTRADA : estadoCode,
      estado_ccp_label: vigente.label || ESTADOS_CCP_LABEL[estadoCode] || estadoCode,
      estado_actual: vigente.code,
      estado_codigo: vigente.code,
      etiqueta_estado: vigente.label,
      estadoVigente: vigente.estadoVigente,
      situacion: vigente.situacion
        ? { codigo: vigente.situacion.codigo, label: vigente.situacion.label }
        : null,
      estadoInterno: vigente.estadoInterno || (
        (row.codigo_ccp || isCcpReg || isOrdenOrLater)
          ? {
            codigo: 'CCP_REGISTRADA',
            label: 'CCP registrada',
            modulo: 'CCP',
          }
          : null
      ),
      estado_vigente: vigente.codigo || vigente.code,
      estado_vigente_label: vigente.label,
      badge_color: badge.color,
      badge_style: badge.style,
      badge_variante: badge.bootstrap || 'custom',
      codigo_ccp: row.codigo_ccp || '',
      codigo_id: row.codigo_id || null,
      tiene_codigo: !!row.codigo_ccp,
      ccp_activo: !!row.codigo_ccp,
      ccp_registrado: isCcpReg || !!vigente.ccpRegistrado,
      cuadro_id: origenCcp === ORIGEN_CCP.RECEPCION_COTIZACION_LOCACION ? null : row.cuadro_id,
      cotizacion_id: row.cotizacion_id || null,
      proveedor_id: row.proveedor_ganador_id || null,
      proveedor_nombre: row.proveedor_nombre || '',
      proveedor_ruc: row.proveedor_ruc || '',
      monto_adjudicado: monto,
      moneda,
      consolidacion_id: row.consolidacion_id || null,
      consolidacion_codigo: row.consolidacion_codigo || '',
      consolidacion_estado: row.consolidacion_estado || '',
      en_consolidacion_activa: enConsolidacionActiva,
      puede_seleccionar: !enConsolidacionActiva && monto > 0,
      registrado_por: row.registrado_por || '',
      registrado_at: row.registrado_at || null,
      fecha_ingreso_ccp: row.fecha_ingreso_ccp || row.registrado_at || null,
      orden_id: ev.orden_id || null,
      orden_estado: ev.orden_estado || '',
      enviado_proveedor_at: ev.enviado_proveedor_at || null,
      orden_resuelta: !!ev.orden_resuelta,
      expediente_derivado_pago: !!ev.expediente_derivado_pago,
      recepcion_estado_global: ev.recepcion_estado_global || '',
      recepcion_estado_interno: ev.recepcion_estado_interno || '',
      recepcion_bienes_expediente_id: ev.recepcion_bienes_expediente_id ?? null,
    });
  }
  await enrichEstadoResponsableForBandeja(out, 'requerimiento_id');

  // RC8.9 — pertenencia CCP: operativo + histórico con evidencia (visibilidad ≠ etapa vigente).
  // El contrato canónico ya viene de enrichEstadoResponsableForBandeja (ERV).
  const {
    puedeVerExpedienteEnBandeja,
    clasificarModoFilaCcp,
    BANDEJA_CODIGOS,
  } = await import('./bandejaVisibilidad.js');

  return out
    .filter((row) => {
      const etapaCodigo = row.estado_responsable_vigente?.etapaCodigo || '';
      const estadoCodigo = row.estado_responsable_vigente?.estadoCodigo || '';
      const tieneEvidenciaCcp = !!(row.codigo_ccp || row.ccp_activo || row.tiene_codigo);
      return puedeVerExpedienteEnBandeja({
        bandeja: BANDEJA_CODIGOS.CCP,
        tipo: row.tipo || row.tipo_contratacion || '',
        etapaCodigo,
        estadoCodigo,
        modo: 'todos',
        tieneEvidenciaCcp,
      });
    })
    .map((row) => {
      const etapaCodigo = row.estado_responsable_vigente?.etapaCodigo || '';
      const estadoCodigo = row.estado_responsable_vigente?.estadoCodigo || '';
      const modoFila = clasificarModoFilaCcp({ etapaCodigo, estadoCodigo });
      const historico = modoFila === 'historico';
      return {
        ...row,
        bandeja_modo: modoFila,
        tramite_ccp_concluido: historico,
        // Histórico: no seleccionable para consolidar / reabrir trámite
        puede_seleccionar: historico ? false : !!row.puede_seleccionar,
      };
    })
    // RC8.10.1 — criterio único: ingreso CCP más reciente primero; desempate req id DESC.
    .sort((a, b) => {
      const ta = Date.parse(a.fecha_ingreso_ccp || a.registrado_at || '') || 0;
      const tb = Date.parse(b.fecha_ingreso_ccp || b.registrado_at || '') || 0;
      if (tb !== ta) return tb - ta;
      return Number(b.requerimiento_id || 0) - Number(a.requerimiento_id || 0);
    });
}

export async function getDetalleCcpRequerimiento(requerimientoId) {
  const id = parseInt(requerimientoId, 10);
  if (!Number.isFinite(id)) throw httpError('Requerimiento inválido');

  let fuente;
  try {
    fuente = await resolveFuenteDatosCcp(id);
  } catch (err) {
    if (err?.code === 'CCP_NO_DERIVADO' || err?.status === 409) {
      throw httpError('Requerimiento no encontrado en bandeja CCP', 404);
    }
    throw err;
  }

  const { rows: codRows } = await query(`
    SELECT id, codigo_ccp, estado, registrado_por, registrado_at, modificado_por, modificado_at
    FROM ccp_codigos
    WHERE requerimiento_id = $1 AND estado = 'ACTIVO'
    ORDER BY id DESC LIMIT 1
  `, [id]);
  const cod = codRows[0] || {};

  const pedidos = await loadPedidosRequerimiento(id);
  const monto = fuente.monto;
  const filas = buildFilasPresupuestales({
    requerimiento: {
      id: fuente.requerimientoId,
      codigo: fuente.requerimientoCodigo,
      denominacion: fuente.denominacion,
    },
    pedidos,
    montoTotal: monto,
    codigoCcp: cod.codigo_ccp || '',
  });

  return {
    requerimiento_id: fuente.requerimientoId,
    requerimiento_codigo: fuente.requerimientoCodigo,
    denominacion: fuente.denominacion,
    tipo: fuente.tipo,
    origen_ccp: fuente.origenCcp,
    origen_ccp_label: fuente.origenCcp === ORIGEN_CCP.RECEPCION_COTIZACION_LOCACION
      ? 'Recepción de Cotización'
      : 'Cuadro Comparativo',
    solicitud_id: fuente.solicitudId,
    solicitud_codigo: fuente.solicitudCodigo,
    cuadro_id: fuente.cuadroId,
    cotizacion_id: fuente.cotizacionId,
    proveedor_id: fuente.proveedorId,
    proveedor_nombre: fuente.proveedorNombre,
    proveedor_ruc: fuente.proveedorRuc,
    codigo_ccp: cod.codigo_ccp || '',
    codigo_id: cod.id || null,
    monto_adjudicado: monto,
    filas,
    total: monto,
    moneda: fuente.moneda || 'PEN',
    area_usuaria: fuente.areaUsuaria || '',
  };
}

async function assertReqEnCcp(requerimientoId) {
  return resolveFuenteDatosCcp(requerimientoId);
}

export async function registrarCodigoCcp(requerimientoId, body = {}, usuario = '', rol = '') {
  const id = parseInt(requerimientoId, 10);
  if (!Number.isFinite(id)) throw httpError('Requerimiento inválido');
  const codigo = validateCodigoCcp(body.codigo_ccp || body.codigo);
  const reqRow = await assertReqEnCcp(id);

  const { rows: existentes } = await query(`
    SELECT id, codigo_ccp FROM ccp_codigos
    WHERE requerimiento_id = $1 AND estado = 'ACTIVO'
    LIMIT 1
  `, [id]);
  if (existentes.length) {
    throw httpError('Ya existe un código CCP activo. Use editar.', 409, 'CCP_YA_REGISTRADO');
  }

  const { rows: dup } = await query(`
    SELECT id, requerimiento_id FROM ccp_codigos
    WHERE UPPER(codigo_ccp) = UPPER($1) AND estado = 'ACTIVO' AND requerimiento_id <> $2
    LIMIT 1
  `, [codigo, id]);
  if (dup.length) {
    throw httpError('El código CCP ya está registrado en otro requerimiento', 409, 'CCP_CODIGO_DUPLICADO');
  }

  const { rows } = await query(`
    INSERT INTO ccp_codigos (
      requerimiento_id, solicitud_cotizacion_id, codigo_ccp, estado, registrado_por, registrado_at
    ) VALUES ($1, $2, $3, 'ACTIVO', $4, NOW())
    RETURNING *
  `, [id, reqRow.solicitud_id, codigo, String(usuario || '').slice(0, 150)]);

  await registrarEvento({
    tipo: 'CCP_REGISTRADO',
    requerimientoId: id,
    codigoCcpId: rows[0].id,
    usuario,
    rol,
    valorNuevo: codigo,
  });

  return {
    ok: true,
    codigo: rows[0],
    ...buildCcpEstadoResponse({
      codigo_ccp: codigo,
      solicitud_estado: 'EN_CCP',
      estado_cuadro: reqRow.origenCcp === ORIGEN_CCP.RECEPCION_COTIZACION_LOCACION
        ? ''
        : 'DERIVADO_CCP',
    }),
    origen_ccp: reqRow.origenCcp,
    cuadro_id: reqRow.cuadroId ?? null,
  };
}

export async function editarCodigoCcp(requerimientoId, body = {}, usuario = '', rol = '') {
  const id = parseInt(requerimientoId, 10);
  if (!Number.isFinite(id)) throw httpError('Requerimiento inválido');
  const codigo = validateCodigoCcp(body.codigo_ccp || body.codigo);
  await assertReqEnCcp(id);

  const { rows: cur } = await query(`
    SELECT * FROM ccp_codigos WHERE requerimiento_id = $1 AND estado = 'ACTIVO' LIMIT 1
  `, [id]);
  if (!cur.length) throw httpError('No hay código CCP activo para editar', 404);

  const { rows: dup } = await query(`
    SELECT id FROM ccp_codigos
    WHERE UPPER(codigo_ccp) = UPPER($1) AND estado = 'ACTIVO' AND requerimiento_id <> $2
    LIMIT 1
  `, [codigo, id]);
  if (dup.length) throw httpError('El código CCP ya está registrado en otro requerimiento', 409, 'CCP_CODIGO_DUPLICADO');

  const prev = cur[0].codigo_ccp;
  if (prev === codigo) {
    return { ok: true, idempotente: true, codigo: cur[0] };
  }

  const { rows } = await query(`
    UPDATE ccp_codigos
    SET codigo_ccp = $2,
        modificado_por = $3,
        modificado_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [cur[0].id, codigo, String(usuario || '').slice(0, 150)]);

  await registrarEvento({
    tipo: 'CCP_EDITADO',
    requerimientoId: id,
    codigoCcpId: rows[0].id,
    usuario,
    rol,
    valorAnterior: prev,
    valorNuevo: codigo,
  });

  return {
    ok: true,
    codigo: rows[0],
    ...buildCcpEstadoResponse({
      codigo_ccp: codigo,
      solicitud_estado: 'EN_CCP',
      estado_cuadro: 'DERIVADO_CCP',
    }),
  };
}

export async function anularCodigoCcp(requerimientoId, body = {}, usuario = '', rol = '') {
  const id = parseInt(requerimientoId, 10);
  if (!Number.isFinite(id)) throw httpError('Requerimiento inválido');
  const motivo = String(body.motivo || body.motivo_eliminacion || '').trim();
  if (motivo.length < 3) throw httpError('Indique el motivo de anulación (mín. 3 caracteres)');

  const { rows: cur } = await query(`
    SELECT * FROM ccp_codigos WHERE requerimiento_id = $1 AND estado = 'ACTIVO' LIMIT 1
  `, [id]);
  if (!cur.length) throw httpError('No hay código CCP activo', 404);

  const { rows } = await query(`
    UPDATE ccp_codigos
    SET estado = 'ANULADO',
        eliminado_por = $2,
        eliminado_at = NOW(),
        motivo_eliminacion = $3,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [cur[0].id, String(usuario || '').slice(0, 150), motivo.slice(0, 2000)]);

  await registrarEvento({
    tipo: 'CCP_ANULADO',
    requerimientoId: id,
    codigoCcpId: rows[0].id,
    usuario,
    rol,
    valorAnterior: cur[0].codigo_ccp,
    observacion: motivo,
  });

  return {
    ok: true,
    codigo: rows[0],
    ...buildCcpEstadoResponse({
      codigo_ccp: '',
      solicitud_estado: 'EN_CCP',
      estado_cuadro: 'DERIVADO_CCP',
    }),
  };
}

async function nextCodigoInterno() {
  const { rows } = await query(`
    SELECT codigo_interno FROM ccp_solicitudes
    WHERE codigo_interno ~ '^CCP-SOL-[0-9]+$'
    ORDER BY id DESC LIMIT 1
  `);
  let n = 1;
  if (rows.length) {
    const m = String(rows[0].codigo_interno).match(/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `CCP-SOL-${String(n).padStart(4, '0')}`;
}

export async function crearConsolidacionCcp(body = {}, usuario = '', rol = '') {
  const ids = [...new Set((body.requerimiento_ids || body.requerimientos || [])
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) throw httpError('Seleccione al menos un requerimiento');

  const items = [];
  for (const rid of ids) {
    const row = await assertReqEnCcp(rid);
    const monto = Number(row.monto ?? row.valor_adjudicado ?? 0) || 0;
    if (!(monto > 0)) {
      throw httpError(
        row.origenCcp === ORIGEN_CCP.RECEPCION_COTIZACION_LOCACION
          ? `El requerimiento ${rid} no tiene monto en la propuesta económica`
          : `El requerimiento ${rid} no tiene valor adjudicado`,
        409,
      );
    }

    const { rows: link } = await query(`
      SELECT csr.id, sol.codigo_interno
      FROM ccp_solicitud_requerimientos csr
      JOIN ccp_solicitudes sol ON sol.id = csr.solicitud_id
      WHERE csr.requerimiento_id = $1 AND csr.activo = TRUE AND sol.estado <> 'ANULADA'
      LIMIT 1
    `, [rid]);
    if (link.length) {
      throw httpError(
        `El requerimiento ya está en la consolidación ${link[0].codigo_interno}`,
        409,
        'CCP_YA_CONSOLIDADO',
      );
    }
    items.push({ rid, solicitudId: row.solicitud_id || row.solicitudId, monto });
  }

  const total = Number(items.reduce((a, it) => a + it.monto, 0).toFixed(2));
  const codigo = await nextCodigoInterno();
  const { rows: solRows } = await query(`
    INSERT INTO ccp_solicitudes (
      codigo_interno, estado, total_monto, moneda, observacion, creado_por, fecha_creacion
    ) VALUES ($1, 'PREPARADA', $2, 'PEN', $3, $4, NOW())
    RETURNING *
  `, [codigo, total, String(body.observacion || '').slice(0, 2000) || null, String(usuario || '').slice(0, 150)]);
  const sol = solRows[0];

  for (const it of items) {
    await query(`
      INSERT INTO ccp_solicitud_requerimientos (
        solicitud_id, requerimiento_id, solicitud_cotizacion_id, monto, activo
      ) VALUES ($1, $2, $3, $4, TRUE)
    `, [sol.id, it.rid, it.solicitudId, it.monto]);
    await registrarEvento({
      tipo: 'REQUERIMIENTO_AGREGADO',
      requerimientoId: it.rid,
      solicitudId: sol.id,
      usuario,
      rol,
      valorNuevo: String(it.monto),
    });
  }

  await registrarEvento({
    tipo: 'CONSOLIDACION_CREADA',
    solicitudId: sol.id,
    usuario,
    rol,
    valorNuevo: codigo,
    observacion: `${items.length} requerimiento(s)`,
  });

  return getConsolidacionCcp(sol.id);
}

export async function getConsolidacionCcp(solicitudId) {
  const id = parseInt(solicitudId, 10);
  if (!Number.isFinite(id)) throw httpError('Consolidación inválida');

  const { rows: sols } = await query('SELECT * FROM ccp_solicitudes WHERE id = $1', [id]);
  if (!sols.length) throw httpError('Consolidación no encontrada', 404);
  const sol = sols[0];

  const { rows: links } = await query(`
    SELECT csr.*, r.codigo AS requerimiento_codigo, r.denominacion, r.tipo, r.payload,
      sc.codigo AS solicitud_codigo,
      cc.valor_adjudicado, cc.datos_json,
      cod.codigo_ccp
    FROM ccp_solicitud_requerimientos csr
    JOIN requerimientos r ON r.id = csr.requerimiento_id
    LEFT JOIN solicitudes_cotizacion sc ON sc.id = csr.solicitud_cotizacion_id
    LEFT JOIN LATERAL (
      SELECT c.valor_adjudicado, c.datos_json
      FROM cuadros_comparativos c
      WHERE c.solicitud_id = csr.solicitud_cotizacion_id AND UPPER(c.estado) = 'DERIVADO_CCP'
      ORDER BY c.version DESC NULLS LAST, c.id DESC LIMIT 1
    ) cc ON TRUE
    LEFT JOIN LATERAL (
      SELECT c.codigo_ccp FROM ccp_codigos c
      WHERE c.requerimiento_id = r.id AND c.estado = 'ACTIVO'
      ORDER BY c.id DESC LIMIT 1
    ) cod ON TRUE
    WHERE csr.solicitud_id = $1 AND csr.activo = TRUE
    ORDER BY r.codigo ASC
  `, [id]);

  const filas = [];
  const requerimientos = [];
  for (const link of links) {
    const pedidos = await loadPedidosRequerimiento(link.requerimiento_id);
    let monto = Number(link.monto) || 0;
    if (!(monto > 0)) {
      try {
        const fuente = await resolveFuenteDatosCcp(link.requerimiento_id);
        monto = Number(fuente.monto) || 0;
      } catch (_) {
        monto = montoAdjudicadoDeCuadro(link);
      }
    }
    const reqFilas = buildFilasPresupuestales({
      requerimiento: {
        id: link.requerimiento_id,
        codigo: link.requerimiento_codigo,
        denominacion: link.denominacion,
      },
      pedidos,
      montoTotal: monto,
      codigoCcp: link.codigo_ccp || '',
    });
    filas.push(...reqFilas);
    requerimientos.push({
      requerimiento_id: link.requerimiento_id,
      requerimiento_codigo: link.requerimiento_codigo,
      denominacion: link.denominacion,
      solicitud_codigo: link.solicitud_codigo,
      codigo_ccp: link.codigo_ccp || '',
      monto,
      subtotal: monto,
      filas: reqFilas,
    });
  }

  const total = Number(filas.reduce((a, f) => a + Number(f.monto || 0), 0).toFixed(2));
  const codigos = [...new Set(requerimientos.map((r) => r.codigo_ccp).filter(Boolean))];
  const reqCodes = requerimientos.map((r) => r.requerimiento_codigo);

  return {
    id: sol.id,
    codigo_interno: sol.codigo_interno,
    estado: sol.estado,
    estado_label: ESTADOS_CCP_LABEL[sol.estado]
      || (String(sol.estado).toUpperCase() === 'PREPARADA' ? ESTADOS_CCP_LABEL.SOLICITUD_PREPARADA : sol.estado),
    total_monto: total,
    moneda: sol.moneda || 'PEN',
    creado_por: sol.creado_por,
    fecha_creacion: sol.fecha_creacion,
    cantidad_requerimientos: requerimientos.length,
    requerimientos,
    filas,
    asunto: buildAsuntoCcp({ reqCodes, codigosCcp: codigos }),
    label_corto: `${sol.codigo_interno} (${requerimientos.length} REQ)`,
  };
}

export function buildAsuntoCcp({ reqCodes = [], codigosCcp = [] } = {}) {
  if (codigosCcp.length === 1) {
    return `Solicitud de Certificación de Crédito Presupuestal CCP N.° ${codigosCcp[0]}`;
  }
  if (codigosCcp.length > 1) {
    return `Solicitud de Certificación de Crédito Presupuestal CCP ${codigosCcp.join(', ')}`;
  }
  if (reqCodes.length === 1) {
    return `Solicitud de Certificación de Crédito Presupuestal CCP ${reqCodes[0]}`;
  }
  if (reqCodes.length > 1) {
    return `Solicitud de Certificación de Crédito Presupuestal CCP ${reqCodes.join(', ')}`;
  }
  return 'Solicitud de Certificación de Crédito Presupuestal CCP';
}

export async function retirarRequerimientoConsolidacion(solicitudId, requerimientoId, usuario = '', rol = '') {
  const sid = parseInt(solicitudId, 10);
  const rid = parseInt(requerimientoId, 10);
  if (!Number.isFinite(sid) || !Number.isFinite(rid)) throw httpError('Parámetros inválidos');

  const det = await getConsolidacionCcp(sid);
  if (String(det.estado).toUpperCase() === 'ENVIADA_OPPM') {
    throw httpError('No se puede retirar: la solicitud ya fue enviada a OPPM', 409);
  }

  const { rows } = await query(`
    UPDATE ccp_solicitud_requerimientos
    SET activo = FALSE, updated_at = NOW()
    WHERE solicitud_id = $1 AND requerimiento_id = $2 AND activo = TRUE
    RETURNING id
  `, [sid, rid]);
  if (!rows.length) throw httpError('Requerimiento no está en la consolidación', 404);

  await registrarEvento({
    tipo: 'REQUERIMIENTO_RETIRADO',
    requerimientoId: rid,
    solicitudId: sid,
    usuario,
    rol,
  });

  const { rows: activos } = await query(`
    SELECT COALESCE(SUM(monto),0) AS total, COUNT(*)::int AS n
    FROM ccp_solicitud_requerimientos
    WHERE solicitud_id = $1 AND activo = TRUE
  `, [sid]);
  await query(`
    UPDATE ccp_solicitudes
    SET total_monto = $2, actualizado_por = $3, updated_at = NOW(),
        estado = CASE WHEN $4 = 0 THEN 'ANULADA' ELSE estado END
    WHERE id = $1
  `, [sid, Number(activos[0].total), String(usuario || '').slice(0, 150), activos[0].n]);

  return getConsolidacionCcp(sid);
}

export async function marcarWordGenerado(solicitudId, usuario = '', rol = '') {
  await registrarEvento({
    tipo: 'WORD_GENERADO',
    solicitudId: parseInt(solicitudId, 10),
    usuario,
    rol,
  });
}

/**
 * Payload compatible con generarWordSolicitudCcp para UN solo expediente
 * (sin crear consolidación masiva). Reutiliza filas presupuestales existentes.
 */
export async function buildPayloadWordIndividual(requerimientoId) {
  const det = await getDetalleCcpRequerimiento(requerimientoId);
  if (!det.codigo_ccp) {
    throw httpError(
      'Registre primero el código CCP.',
      409,
      'CCP_CODIGO_PENDIENTE',
    );
  }
  const reqCodes = [det.requerimiento_codigo];
  const codigosCcp = [det.codigo_ccp];
  return {
    id: null,
    codigo_interno: `CCP-${det.requerimiento_codigo}`,
    estado: 'INDIVIDUAL',
    estado_label: 'Solicitud individual',
    total_monto: det.total,
    moneda: det.moneda || 'PEN',
    asunto: buildAsuntoCcp({ reqCodes, codigosCcp }),
    filas: det.filas || [],
    requerimientos: [{
      requerimiento_id: det.requerimiento_id,
      requerimiento_codigo: det.requerimiento_codigo,
      denominacion: det.denominacion,
      solicitud_codigo: det.solicitud_codigo,
      codigo_ccp: det.codigo_ccp,
      monto: det.monto_adjudicado,
    }],
    individual: true,
  };
}

/**
 * Evalúa si el expediente puede derivarse a Registro de Órdenes.
 * @returns {{ ok: boolean, motivo?: string, codigo_ccp?: string, etapa?: string }}
 */
export async function evaluarPuedeDerivarRegistroOrdenes(requerimientoId) {
  const id = parseInt(requerimientoId, 10);
  if (!Number.isFinite(id)) {
    return { ok: false, motivo: 'Requerimiento inválido' };
  }

  const { rows: vig } = await query(
    `SELECT etapa_codigo, estado_codigo FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [id],
  );
  const etapa = String(vig[0]?.etapa_codigo || '').toUpperCase();
  const estadoVig = String(vig[0]?.estado_codigo || '').toUpperCase();
  const { etapaEsPostCcp } = await import('./bandejaVisibilidad.js');
  if (etapaEsPostCcp({ etapaCodigo: etapa, estadoCodigo: estadoVig })) {
    return {
      ok: false,
      motivo: 'El expediente ya fue derivado / trámite CCP concluido.',
      yaDerivado: true,
      etapa: etapa || estadoVig,
    };
  }
  if (etapa && etapa !== 'CCP') {
    return { ok: false, motivo: 'Estado no compatible.', etapa };
  }

  const { rows: reqRows } = await query(
    `SELECT estado_actual, tipo FROM requerimientos WHERE id = $1`,
    [id],
  );
  if (!reqRows.length) return { ok: false, motivo: 'Requerimiento no encontrado' };
  const estadoActual = String(reqRows[0].estado_actual || '').toUpperCase();
  if (estadoActual === 'REGISTRO_ORDEN' || estadoActual === 'REGISTRO_ORDENES') {
    return { ok: false, motivo: 'El expediente ya fue derivado.', yaDerivado: true, etapa: estadoActual };
  }
  if (estadoActual && estadoActual !== 'CCP' && !etapa) {
    return { ok: false, motivo: 'Estado no compatible.', etapa: estadoActual };
  }

  try {
    await resolveFuenteDatosCcp(id);
  } catch (err) {
    if (err?.code === 'CCP_NO_DERIVADO') {
      return { ok: false, motivo: 'Estado no compatible.', etapa: estadoActual || etapa };
    }
    throw err;
  }

  const { rows: cod } = await query(
    `SELECT codigo_ccp FROM ccp_codigos WHERE requerimiento_id = $1 AND estado = 'ACTIVO' ORDER BY id DESC LIMIT 1`,
    [id],
  );
  if (!cod.length || !cod[0].codigo_ccp) {
    return {
      ok: false,
      motivo: 'Registre primero el código CCP.',
      codigoPendiente: true,
      etapa: etapa || 'CCP',
    };
  }

  return {
    ok: true,
    codigo_ccp: cod[0].codigo_ccp,
    etapa: etapa || 'CCP',
    tipo: reqRows[0].tipo || '',
  };
}

/**
 * Deriva expediente CCP → Registro de Órdenes vía transicionarExpediente (evento CCP_REGISTRADA).
 */
export async function derivarCcpARegistroOrdenes(requerimientoId, {
  usuario = '',
  usuarioId = null,
  rol = '',
  motivo = '',
  clientRequestId = null,
} = {}) {
  const id = parseInt(requerimientoId, 10);
  if (!Number.isFinite(id)) throw httpError('Requerimiento inválido');

  const eval_ = await evaluarPuedeDerivarRegistroOrdenes(id);
  if (!eval_.ok) {
    if (eval_.yaDerivado) {
      return {
        ok: true,
        idempotente: true,
        mensaje: eval_.motivo,
        etapa: eval_.etapa,
      };
    }
    throw httpError(eval_.motivo || 'No se puede derivar', 409, 'CCP_DERIVAR_BLOQUEADO');
  }

  // Obs45 — preservar analista CCP (asignación activa o actor) como responsable en RO.
  let usuarioDestinoId = null;
  const uidActor = usuarioId != null && Number.isFinite(Number(usuarioId))
    ? Number(usuarioId)
    : null;
  const { rows: asgCcp } = await query(`
    SELECT usuario_id
    FROM expediente_asignaciones
    WHERE requerimiento_id = $1
      AND activo = TRUE
      AND UPPER(COALESCE(etapa_codigo, '')) = 'CCP'
      AND usuario_id IS NOT NULL
    ORDER BY id DESC
    LIMIT 1
  `, [id]);
  if (asgCcp[0]?.usuario_id != null) {
    usuarioDestinoId = Number(asgCcp[0].usuario_id);
  } else if (uidActor) {
    usuarioDestinoId = uidActor;
  }

  const { transicionarExpediente } = await import('./expedienteTransicion.js');
  const result = await transicionarExpediente({
    requerimientoId: id,
    evento: 'CCP_REGISTRADA',
    usuarioOrigenId: usuarioId,
    usuarioDestinoId,
    unidadDestino: 'Registro de Órdenes',
    motivo: motivo || `CCP ${eval_.codigo_ccp} → Registro de Órdenes`,
    actorRol: rol || 'usuario',
    metadata: {
      client_request_id: clientRequestId || `ccp-derivar-orden:${id}:${eval_.codigo_ccp}`,
      codigo_ccp: eval_.codigo_ccp,
      actor: String(usuario || '').slice(0, 150),
    },
    domainMutator: async (tx) => {
      await tx.query(`
        UPDATE solicitudes_cotizacion sc
        SET estado = 'EN_ORDEN', updated_at = NOW()
        FROM solicitud_requerimientos sr
        WHERE sr.solicitud_id = sc.id
          AND sr.requerimiento_id = $1
          AND UPPER(COALESCE(sc.estado, '')) IN ('EN_CCP', 'EN_CUADRO_COMPARATIVO')
      `, [id]);
      await tx.query(`
        INSERT INTO ccp_eventos (
          tipo, requerimiento_id, usuario, rol, valor_nuevo, observacion
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        'CCP_DERIVADO_REGISTRO_ORDENES',
        id,
        String(usuario || '').slice(0, 150),
        String(rol || '').slice(0, 80),
        'REGISTRO_ORDEN',
        String(eval_.codigo_ccp || '').slice(0, 2000),
      ]);
    },
  });

  return {
    ok: true,
    idempotente: !!result?.idempotente,
    etapa: 'REGISTRO_ORDEN',
    codigo_ccp: eval_.codigo_ccp,
    transicion: result,
  };
}

/**
 * Flags de acciones individuales para menú/bandeja.
 */
export function buildAccionesCcpIndividual(row = {}, evalDerivar = null) {
  const tieneCodigo = !!(row.tiene_codigo || row.ccp_activo || row.codigo_ccp);
  const consolidado = !!row.consolidacion_id;
  const etapa = String(row.estado_actual || row.etapa_codigo || '').toUpperCase();
  const yaDerivado = ['REGISTRO_ORDEN', 'REGISTRO_ORDENES', 'ORDEN'].includes(etapa)
    || !!evalDerivar?.yaDerivado;

  const acciones = {
    ver: { visible: true },
    registrarCcp: { visible: !tieneCodigo && !yaDerivado },
    editarCcp: { visible: tieneCodigo && !yaDerivado },
    eliminarCcp: { visible: tieneCodigo && !yaDerivado },
    generarWord: {
      visible: true,
      enabled: !!tieneCodigo,
      motivo: tieneCodigo ? null : 'Registre primero el código CCP.',
    },
    descargarWord: {
      visible: consolidado,
      enabled: consolidado,
      motivo: consolidado ? null : 'Consolide el requerimiento para Word consolidado.',
    },
    derivarRegistroOrdenes: {
      visible: !yaDerivado,
      enabled: !!(evalDerivar?.ok),
      motivo: yaDerivado
        ? 'El expediente ya fue derivado.'
        : (evalDerivar?.motivo || (tieneCodigo ? null : 'Registre primero el código CCP.')),
    },
  };
  return acciones;
}

export { httpError };

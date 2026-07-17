/**
 * Cuadro Comparativo (RC8.1/RC8.2) — bandeja + matriz Bienes + persistencia.
 * La salida APTO → CUADRO_COMPARATIVO permanece en validacionesCotizacion.js.
 */
import { query } from '../db.js';
import {
  buildMatrizComparativaBienes,
  validateEconomiaCuadro,
  mergeObservacionesCuadro,
  stripArchivosFromDatosJson,
} from './cuadroComparativoMapper.js';

/** Estados documentales del cuadro (independientes de la etapa Workflow). */
export const ESTADOS_CUADRO = Object.freeze({
  PENDIENTE_ELABORAR: 'PENDIENTE_ELABORAR',
  BORRADOR: 'BORRADOR',
  EN_ELABORACION: 'EN_ELABORACION',
  GENERADO: 'GENERADO',
  FIRMADO: 'FIRMADO',
  DERIVADO_CCP: 'DERIVADO_CCP',
  ANULADO: 'ANULADO',
});

export const ESTADOS_CUADRO_LABEL = Object.freeze({
  [ESTADOS_CUADRO.PENDIENTE_ELABORAR]: 'Pendiente de elaborar',
  [ESTADOS_CUADRO.BORRADOR]: 'En elaboración',
  [ESTADOS_CUADRO.EN_ELABORACION]: 'En elaboración',
  [ESTADOS_CUADRO.GENERADO]: 'Generado',
  [ESTADOS_CUADRO.FIRMADO]: 'Firmado',
  [ESTADOS_CUADRO.DERIVADO_CCP]: 'Derivado a CCP',
  [ESTADOS_CUADRO.ANULADO]: 'Anulado',
});

const TIPO_BIENES = 'BIENES';

function parseJson(val, fallback = {}) {
  if (val && typeof val === 'object') return val;
  try { return JSON.parse(val || 'null') ?? fallback; } catch (_) { return fallback; }
}

function parseInforme(cot) {
  return parseJson(cot?.validacion_informe, {});
}

function normalizeTipoContratacion(tipo) {
  const t = String(tipo || '').trim().toUpperCase();
  if (t === 'B' || t === 'BIEN' || t === 'BIENES') return 'Bien';
  if (t === 'S' || t === 'SERVICIO' || t === 'SERVICIOS') return 'Servicio';
  if (t === 'L' || t === 'LOCADOR' || t === 'LOCADORES' || /LOCACI/i.test(t)) return 'Locador';
  return tipo || '—';
}

/** Normaliza código de estado documental del cuadro. */
export function normalizeCuadroEstado(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!s) return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
  if (s === 'PENDIENTE' || s === 'PENDIENTE_DE_ELABORAR' || s === 'PENDIENTE_ELABORAR') {
    return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
  }
  if (s === 'BORRADOR') return ESTADOS_CUADRO.EN_ELABORACION;
  if (s === 'EN_ELABORACION' || s === 'ELABORACION') return ESTADOS_CUADRO.EN_ELABORACION;
  if (s === 'GENERADO' || s === 'GENERADA') return ESTADOS_CUADRO.GENERADO;
  if (s === 'FIRMADO' || s === 'FIRMADA') return ESTADOS_CUADRO.FIRMADO;
  if (s === 'DERIVADO_CCP' || s === 'DERIVADO_A_CCP' || s === 'CCP') return ESTADOS_CUADRO.DERIVADO_CCP;
  if (s === 'ANULADO') return ESTADOS_CUADRO.ANULADO;
  if (ESTADOS_CUADRO_LABEL[s]) return s;
  return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
}

export function labelCuadroEstado(code) {
  const n = normalizeCuadroEstado(code);
  return ESTADOS_CUADRO_LABEL[n] || ESTADOS_CUADRO_LABEL[ESTADOS_CUADRO.PENDIENTE_ELABORAR];
}

function mapEstadoDbABandeja(estadoDb) {
  if (!estadoDb) return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
  return normalizeCuadroEstado(estadoDb);
}

async function loadEstadosCuadroPorSolicitudes(solicitudIds) {
  const map = new Map();
  if (!solicitudIds.length) return map;
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (solicitud_id)
        id, solicitud_id, estado, version, actualizado_at
      FROM cuadros_comparativos
      WHERE solicitud_id = ANY($1::int[])
        AND tipo = $2
        AND estado <> 'ANULADO'
      ORDER BY solicitud_id, version DESC
    `, [solicitudIds, TIPO_BIENES]);
    rows.forEach((r) => {
      map.set(r.solicitud_id, {
        cuadro_id: r.id,
        estado_db: r.estado,
        estado_cuadro: mapEstadoDbABandeja(r.estado),
        version: r.version,
        actualizado_at: r.actualizado_at,
      });
    });
  } catch (err) {
    // Tabla aún no migrada: bandeja sigue operativa como RC8.1
    if (!/cuadros_comparativos/i.test(err.message || '')) throw err;
  }
  return map;
}

function badgeClassCuadro(estadoCode) {
  const e = normalizeCuadroEstado(estadoCode);
  if (e === ESTADOS_CUADRO.PENDIENTE_ELABORAR) return 'warning';
  if (e === ESTADOS_CUADRO.EN_ELABORACION) return 'info';
  if (e === ESTADOS_CUADRO.GENERADO) return 'primary';
  if (e === ESTADOS_CUADRO.FIRMADO) return 'success';
  if (e === ESTADOS_CUADRO.DERIVADO_CCP) return 'secondary';
  return 'secondary';
}

async function loadRequerimientosPorSolicitudes(solicitudIds) {
  if (!solicitudIds.length) return new Map();
  const { rows } = await query(`
    SELECT sr.solicitud_id, r.id, r.codigo, r.denominacion, r.area, r.cmn, r.estado, r.payload,
      COALESCE(
        NULLIF(TRIM(r.cmn), ''),
        NULLIF(TRIM(COALESCE(r.payload, '{}')::jsonb->>'cmn'), ''),
        NULLIF(TRIM(COALESCE(r.payload, '{}')::jsonb->>'centro'), ''),
        NULLIF(TRIM(COALESCE(r.payload, '{}')::jsonb->>'centro_costo'), ''),
        NULLIF(TRIM(r.area), ''),
        ''
      ) AS centro
    FROM solicitud_requerimientos sr
    JOIN requerimientos r ON r.id = sr.requerimiento_id
    WHERE sr.solicitud_id = ANY($1::int[])
    ORDER BY r.codigo ASC
  `, [solicitudIds]);
  const map = new Map();
  for (const r of rows) {
    const list = map.get(r.solicitud_id) || [];
    list.push({
      id: r.id,
      codigo: r.codigo || '',
      descripcion: r.denominacion || '',
      centro: r.centro || '',
      area_usuaria: r.area || '',
      estado: r.estado || '',
      etapa_workflow: parseJson(r.payload)?.workflowSnapshot?.etapaActual || '',
    });
    map.set(r.solicitud_id, list);
  }
  return map;
}

function areaUsuariaFromReqs(reqs, scArea) {
  const areas = [...new Set((reqs || []).map((r) => String(r.area_usuaria || '').trim()).filter(Boolean))];
  if (areas.length) return areas.join(', ');
  return String(scArea || '').trim();
}

function requerimientosTexto(reqs) {
  return (reqs || []).map((r) => r.codigo).filter(Boolean).join(', ');
}

/**
 * Listado legacy: una fila por cotización APTO (compatibilidad endpoint actual).
 */
export async function listarCuadroComparativo() {
  const { rows } = await query(`
    SELECT cot.*, p.ruc, p.razon_social, sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto,
      sc.estado AS solicitud_estado
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    JOIN solicitudes_cotizacion sc ON sc.id = cot.solicitud_id
    WHERE cot.validacion_estado = 'APTO'
    ORDER BY sc.codigo ASC, cot.fecha_presentacion DESC NULLS LAST
  `);
  return rows.map((r) => {
    const eco = parseJson(r.propuesta_economica, {});
    const inf = parseInforme(r);
    return {
      id: r.id,
      solicitud_id: r.solicitud_id,
      proveedor_id: r.proveedor_id,
      estado: r.estado,
      validacion_estado: r.validacion_estado || '',
      validacion_responsable: r.validacion_responsable || '',
      fecha_presentacion: r.fecha_presentacion,
      created_at: r.created_at,
      monto: eco.monto ?? null,
      moneda: eco.moneda || 'PEN',
      ruc: r.ruc,
      razon_social: r.razon_social,
      solicitud_codigo: r.solicitud_codigo,
      denominacion: r.denominacion,
      objeto: r.objeto,
      solicitud_estado: r.solicitud_estado,
      tiene_pdf_validacion: !!inf.pdf_firmado?.base64,
      resultado_validacion: inf.formulario_07a?.resultado_global || 'APTO',
      validado_por: inf.formulario_07a?.profesional || r.validacion_responsable,
      validado_at: inf.enviado_at || r.updated_at,
    };
  });
}

/**
 * Bandeja RC8.1: una fila por Solicitud de Cotización.
 * Inclusión: al menos una cotización APTO (y/o etapa/estado oficial de cuadro).
 */
export async function listarCuadroComparativoExpedientes() {
  const { rows } = await query(`
    SELECT
      sc.id AS solicitud_id,
      sc.codigo AS solicitud_codigo,
      sc.denominacion,
      sc.objeto,
      sc.tipo,
      sc.estado AS solicitud_estado,
      sc.area_usuaria,
      sc.updated_at AS solicitud_updated_at,
      COUNT(DISTINCT cot.proveedor_id) FILTER (
        WHERE cot.estado = 'COTIZACION_PRESENTADA'
      )::int AS total_proveedores,
      COUNT(DISTINCT cot.proveedor_id) FILTER (
        WHERE cot.validacion_estado = 'APTO'
      )::int AS proveedores_aptos,
      COUNT(DISTINCT cot.proveedor_id) FILTER (
        WHERE cot.validacion_estado IN ('NO_APTO', 'OBSERVADO')
      )::int AS proveedores_no_aptos,
      COUNT(DISTINCT cot.proveedor_id) FILTER (
        WHERE cot.validacion_estado IN ('DERIVADA', 'EN_PROCESO', 'PENDIENTE')
          OR COALESCE(cot.validacion_estado, '') = ''
      )::int AS proveedores_pendientes,
      MIN(
        CASE WHEN cot.validacion_estado = 'APTO' THEN
          COALESCE(
            NULLIF(cot.validacion_informe->>'enviado_at', '')::timestamptz,
            cot.updated_at,
            cot.fecha_presentacion
          )
        END
      ) AS fecha_ingreso_cuadro,
      STRING_AGG(DISTINCT p.razon_social, ' | ' ORDER BY p.razon_social) AS proveedores_nombres,
      STRING_AGG(DISTINCT p.ruc, ' | ' ORDER BY p.ruc) AS proveedores_rucs,
      BOOL_OR(
        COALESCE(r.estado, '') ILIKE '%Cuadro Comp%'
        OR COALESCE(r.payload->'workflowSnapshot'->>'etapaActual', '') = 'CUADRO_COMPARATIVO'
      ) AS req_en_cuadro
    FROM solicitudes_cotizacion sc
    JOIN cotizaciones_proveedor cot ON cot.solicitud_id = sc.id
    JOIN proveedores p ON p.id = cot.proveedor_id
    LEFT JOIN solicitud_requerimientos sr ON sr.solicitud_id = sc.id
    LEFT JOIN requerimientos r ON r.id = sr.requerimiento_id
    WHERE cot.estado = 'COTIZACION_PRESENTADA'
    GROUP BY sc.id, sc.codigo, sc.denominacion, sc.objeto, sc.tipo, sc.estado,
      sc.area_usuaria, sc.updated_at
    HAVING
      COUNT(DISTINCT cot.proveedor_id) FILTER (WHERE cot.validacion_estado = 'APTO') >= 1
      OR sc.estado = 'EN_CUADRO_COMPARATIVO'
      OR BOOL_OR(
        COALESCE(r.estado, '') ILIKE '%Cuadro Comp%'
        OR COALESCE(r.payload->'workflowSnapshot'->>'etapaActual', '') = 'CUADRO_COMPARATIVO'
      )
    ORDER BY
      MIN(
        CASE WHEN cot.validacion_estado = 'APTO' THEN
          COALESCE(
            NULLIF(cot.validacion_informe->>'enviado_at', '')::timestamptz,
            cot.updated_at,
            cot.fecha_presentacion
          )
        END
      ) DESC NULLS LAST,
      sc.codigo DESC
  `);

  // Regla operativa RC8.1: no listar sin al menos un APTO (aunque haya etapa de cuadro).
  const elegibles = rows.filter((r) => Number(r.proveedores_aptos) >= 1);
  const ids = elegibles.map((r) => r.solicitud_id);
  const reqMap = await loadRequerimientosPorSolicitudes(ids);
  const estadoMap = await loadEstadosCuadroPorSolicitudes(ids);

  return elegibles.map((r) => {
    const reqs = reqMap.get(r.solicitud_id) || [];
    const persisted = estadoMap.get(r.solicitud_id);
    const estadoCode = persisted?.estado_cuadro || ESTADOS_CUADRO.PENDIENTE_ELABORAR;
    const area = areaUsuariaFromReqs(reqs, r.area_usuaria);
    const reqTexto = requerimientosTexto(reqs);
    return {
      solicitud_id: r.solicitud_id,
      solicitud_codigo: r.solicitud_codigo || '',
      denominacion: r.denominacion || r.objeto || '',
      objeto: r.objeto || '',
      tipo: normalizeTipoContratacion(r.tipo),
      tipo_raw: r.tipo || '',
      requerimientos: reqs.map((q) => ({
        id: q.id,
        codigo: q.codigo,
        descripcion: q.descripcion,
        centro: q.centro,
        area_usuaria: q.area_usuaria,
      })),
      requerimientos_texto: reqTexto,
      requerimientos_codigos: reqTexto,
      area_usuaria: area,
      total_proveedores: Number(r.total_proveedores) || 0,
      proveedores_aptos: Number(r.proveedores_aptos) || 0,
      proveedores_no_aptos: Number(r.proveedores_no_aptos) || 0,
      proveedores_pendientes: Number(r.proveedores_pendientes) || 0,
      fecha_ingreso_cuadro: r.fecha_ingreso_cuadro || r.solicitud_updated_at || null,
      estado_cuadro: estadoCode,
      estado_cuadro_label: labelCuadroEstado(estadoCode),
      estado_cuadro_badge: badgeClassCuadro(estadoCode),
      cuadro_id: persisted?.cuadro_id || null,
      solicitud_estado: r.solicitud_estado || '',
      puede_elaborar: estadoCode === ESTADOS_CUADRO.PENDIENTE_ELABORAR
        || estadoCode === ESTADOS_CUADRO.EN_ELABORACION
        || estadoCode === ESTADOS_CUADRO.BORRADOR,
      search_text: [
        r.solicitud_codigo,
        reqTexto,
        r.denominacion,
        r.objeto,
        area,
        r.proveedores_nombres,
        r.proveedores_rucs,
      ].filter(Boolean).join(' ').toLowerCase(),
    };
  });
}

/**
 * Detalle de expediente para modales Ver expediente / Ver validaciones (sin económica).
 */
export async function getCuadroComparativoExpediente(solicitudId) {
  const sid = parseInt(solicitudId, 10);
  if (!Number.isFinite(sid)) throw new Error('Solicitud inválida');

  const lista = await listarCuadroComparativoExpedientes();
  const base = lista.find((e) => e.solicitud_id === sid);
  if (!base) throw new Error('Expediente no encontrado en Cuadro Comparativo');

  const { rows } = await query(`
    SELECT cot.id, cot.proveedor_id, cot.estado, cot.validacion_estado, cot.validacion_responsable,
      cot.validacion_informe, cot.fecha_presentacion, cot.updated_at,
      p.ruc, p.razon_social
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    WHERE cot.solicitud_id = $1
      AND cot.estado = 'COTIZACION_PRESENTADA'
    ORDER BY
      CASE UPPER(COALESCE(cot.validacion_estado, ''))
        WHEN 'APTO' THEN 1
        WHEN 'NO_APTO' THEN 2
        WHEN 'OBSERVADO' THEN 3
        ELSE 4
      END,
      p.razon_social ASC
  `, [sid]);

  const proveedores = rows.map((r) => {
    const inf = parseInforme(r);
    return {
      cotizacion_id: r.id,
      proveedor_id: r.proveedor_id,
      ruc: r.ruc || '',
      razon_social: r.razon_social || '',
      estado: r.estado,
      validacion_estado: r.validacion_estado || '',
      validacion_responsable: r.validacion_responsable || '',
      validado_por: inf.formulario_07a?.profesional || r.validacion_responsable || '',
      validado_at: inf.enviado_at || r.updated_at || null,
      fecha_presentacion: r.fecha_presentacion,
      tiene_pdf_validacion: !!inf.pdf_firmado?.base64,
    };
  });

  return {
    ...base,
    proveedores,
  };
}

async function loadSolicitudRow(solicitudId) {
  const { rows } = await query(`
    SELECT id, codigo, denominacion, objeto, tipo, estado, detalle_items, area_usuaria
    FROM solicitudes_cotizacion WHERE id = $1
  `, [solicitudId]);
  if (!rows.length) throw new Error('Solicitud no encontrada');
  return rows[0];
}

async function loadCotizacionesPresentadas(solicitudId) {
  const { rows } = await query(`
    SELECT cot.id, cot.solicitud_id, cot.proveedor_id, cot.estado, cot.validacion_estado,
      cot.propuesta_tecnica, cot.propuesta_economica, cot.validacion_informe,
      cot.fecha_presentacion, cot.updated_at,
      p.ruc, p.razon_social
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    WHERE cot.solicitud_id = $1
      AND cot.estado = 'COTIZACION_PRESENTADA'
    ORDER BY
      CASE UPPER(COALESCE(cot.validacion_estado, ''))
        WHEN 'APTO' THEN 1
        WHEN 'NO_APTO' THEN 2
        WHEN 'OBSERVADO' THEN 3
        ELSE 4
      END,
      p.razon_social ASC
  `, [solicitudId]);
  return rows;
}

async function getCuadroActivoRow(solicitudId, tipo = TIPO_BIENES) {
  const { rows } = await query(`
    SELECT * FROM cuadros_comparativos
    WHERE solicitud_id = $1 AND tipo = $2 AND estado <> 'ANULADO'
    ORDER BY version DESC
    LIMIT 1
  `, [solicitudId, tipo]);
  return rows[0] || null;
}

function assertTipoBienes(tipoRaw) {
  const t = normalizeTipoContratacion(tipoRaw);
  if (t !== 'Bien') {
    throw new Error(`RC8.2 solo elabora matriz de Bienes. Tipo actual: ${t || tipoRaw || '—'}`);
  }
}

function buildMatrizFromSources(sc, cotizaciones, requerimientos) {
  return buildMatrizComparativaBienes({
    solicitud: {
      id: sc.id,
      codigo: sc.codigo,
      denominacion: sc.denominacion,
      objeto: sc.objeto,
      tipo: sc.tipo,
    },
    detalleItems: parseJson(sc.detalle_items, []),
    cotizaciones,
    requerimientos,
  });
}

function mapCuadroRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    solicitud_id: row.solicitud_id,
    tipo: row.tipo,
    version: row.version,
    estado: row.estado,
    estado_cuadro: mapEstadoDbABandeja(row.estado),
    estado_cuadro_label: labelCuadroEstado(row.estado),
    datos_json: parseJson(row.datos_json, {}),
    proveedor_ganador_id: row.proveedor_ganador_id,
    criterio_seleccion: row.criterio_seleccion,
    sustento_decision: row.sustento_decision,
    creado_por: row.creado_por,
    actualizado_por: row.actualizado_por,
    creado_at: row.creado_at,
    actualizado_at: row.actualizado_at,
    derivado_at: row.derivado_at,
  };
}

export function validarMatrizCuadro(payload) {
  const datos = payload?.datos_json || payload || {};
  return validateEconomiaCuadro(datos);
}

/**
 * Detalle completo: matriz fresca + overlay de borrador persistido.
 * No cambia Workflow.
 */
export async function obtenerDetalleCuadro(solicitudId) {
  const sid = parseInt(solicitudId, 10);
  if (!Number.isFinite(sid)) throw new Error('Solicitud inválida');

  const sc = await loadSolicitudRow(sid);
  assertTipoBienes(sc.tipo);
  const cotizaciones = await loadCotizacionesPresentadas(sid);
  const aptos = cotizaciones.filter((c) => String(c.validacion_estado || '').toUpperCase() === 'APTO');
  if (!aptos.length) throw new Error('La solicitud no tiene cotizaciones APTO para el cuadro');

  const reqMap = await loadRequerimientosPorSolicitudes([sid]);
  const requerimientos = reqMap.get(sid) || [];
  let matriz = buildMatrizFromSources(sc, cotizaciones, requerimientos);

  let cuadro = null;
  try {
    cuadro = await getCuadroActivoRow(sid);
  } catch (err) {
    if (!/cuadros_comparativos/i.test(err.message || '')) throw err;
  }

  if (cuadro?.datos_json) {
    const saved = parseJson(cuadro.datos_json, {});
    matriz = mergeObservacionesCuadro(matriz, saved);
    // Recalcular meta sobre matriz fusionada
    const val = validateEconomiaCuadro(matriz);
    matriz.meta = { ...matriz.meta, ...val, puede_seleccionar_ganador: false };
  }

  const bandeja = (await listarCuadroComparativoExpedientes())
    .find((e) => e.solicitud_id === sid) || null;

  return {
    expediente: bandeja,
    cuadro: mapCuadroRow(cuadro),
    matriz,
    validacion: validateEconomiaCuadro(matriz),
    proveedores: cotizaciones.map((c) => ({
      cotizacion_id: c.id,
      proveedor_id: c.proveedor_id,
      ruc: c.ruc,
      razon_social: c.razon_social,
      validacion_estado: c.validacion_estado || '',
      cumple_tecnicamente: String(c.validacion_estado || '').toUpperCase() === 'APTO',
    })),
  };
}

/**
 * Crea borrador EN_ELABORACION o retorna el activo existente.
 */
export async function crearOBuscarBorrador(solicitudId, usuario = '') {
  const sid = parseInt(solicitudId, 10);
  if (!Number.isFinite(sid)) throw new Error('Solicitud inválida');

  const sc = await loadSolicitudRow(sid);
  assertTipoBienes(sc.tipo);
  const cotizaciones = await loadCotizacionesPresentadas(sid);
  if (!cotizaciones.some((c) => String(c.validacion_estado || '').toUpperCase() === 'APTO')) {
    throw new Error('Se requiere al menos una cotización APTO');
  }

  let existing = null;
  try {
    existing = await getCuadroActivoRow(sid);
  } catch (err) {
    if (/cuadros_comparativos/i.test(err.message || '')) {
      throw new Error('Tabla cuadros_comparativos no disponible. Ejecute migraciones (020).');
    }
    throw err;
  }

  if (existing) {
    const detalle = await obtenerDetalleCuadro(sid);
    return { ...detalle, created: false };
  }

  const reqMap = await loadRequerimientosPorSolicitudes([sid]);
  const matriz = buildMatrizFromSources(sc, cotizaciones, reqMap.get(sid) || []);
  const datos = stripArchivosFromDatosJson(matriz);
  const user = String(usuario || '').slice(0, 150);

  const { rows } = await query(`
    INSERT INTO cuadros_comparativos (
      solicitud_id, tipo, version, estado, datos_json,
      creado_por, actualizado_por, creado_at, actualizado_at
    ) VALUES ($1, $2, 1, 'EN_ELABORACION', $3::jsonb, $4, $4, NOW(), NOW())
    RETURNING *
  `, [sid, TIPO_BIENES, JSON.stringify(datos), user]);

  const detalle = await obtenerDetalleCuadro(sid);
  return { ...detalle, cuadro: mapCuadroRow(rows[0]), created: true };
}

/**
 * Guarda borrador. Concurrencia por actualizado_at (ISO).
 * No altera Workflow ni precios de oferta (solo notas/observaciones analista).
 */
export async function guardarBorradorCuadro(cuadroId, payload = {}, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');

  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  if (['GENERADO', 'FIRMADO', 'DERIVADO_CCP', 'ANULADO'].includes(String(cur.estado))) {
    throw new Error(`El cuadro en estado ${cur.estado} no admite edición de borrador`);
  }

  const clientUpdated = payload.actualizado_at || payload.updated_at || null;
  if (clientUpdated) {
    const serverTs = new Date(cur.actualizado_at).getTime();
    const clientTs = new Date(clientUpdated).getTime();
    if (Number.isFinite(clientTs) && Number.isFinite(serverTs) && clientTs < serverTs) {
      const err = new Error('Existe una versión más reciente del cuadro. Recargue antes de guardar.');
      err.code = 'CONFLICT_VERSION';
      err.status = 409;
      throw err;
    }
  }

  // Reconstruir matriz fresca y aplicar solo campos editables del payload
  const sc = await loadSolicitudRow(cur.solicitud_id);
  const cotizaciones = await loadCotizacionesPresentadas(cur.solicitud_id);
  const reqMap = await loadRequerimientosPorSolicitudes([cur.solicitud_id]);
  let matriz = buildMatrizFromSources(sc, cotizaciones, reqMap.get(cur.solicitud_id) || []);

  const incoming = payload.datos_json || payload.matriz || {};
  matriz = mergeObservacionesCuadro(matriz, {
    items: incoming.items,
    notas_internas: incoming.notas_internas ?? payload.notas_internas ?? '',
  });
  if (payload.notas_internas != null) matriz.notas_internas = String(payload.notas_internas);
  else if (incoming.notas_internas != null) matriz.notas_internas = String(incoming.notas_internas);

  const val = validateEconomiaCuadro(matriz);
  matriz.meta = { ...matriz.meta, ...val, puede_seleccionar_ganador: false };
  const datos = stripArchivosFromDatosJson(matriz);
  const user = String(usuario || '').slice(0, 150);

  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET datos_json = $2::jsonb,
        estado = 'EN_ELABORACION',
        actualizado_por = $3,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [id, JSON.stringify(datos), user]);

  return {
    cuadro: mapCuadroRow(rows[0]),
    matriz: datos,
    validacion: val,
    saved: true,
  };
}

export async function listarVersionesCuadro(solicitudId) {
  const sid = parseInt(solicitudId, 10);
  if (!Number.isFinite(sid)) throw new Error('Solicitud inválida');
  const { rows } = await query(`
    SELECT id, solicitud_id, tipo, version, estado, creado_por, actualizado_por,
      creado_at, actualizado_at, derivado_at
    FROM cuadros_comparativos
    WHERE solicitud_id = $1 AND tipo = $2
    ORDER BY version DESC
  `, [sid, TIPO_BIENES]);
  return rows.map((r) => ({
    ...mapCuadroRow(r),
    datos_json: undefined,
  }));
}

/** Alias API RC8.2 */
export async function getDetalleCuadro(solicitudId) {
  return obtenerDetalleCuadro(solicitudId);
}


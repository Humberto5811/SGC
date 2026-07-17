/**
 * Cuadro Comparativo (RC8.1–RC8.5) — bandeja + matriz + Anexo 8A + firma + CCP.
 * La salida APTO → CUADRO_COMPARATIVO permanece en validacionesCotizacion.js.
 * Derivación a CCP usa Workflow oficial (CUADRO_COMPARATIVO → CCP).
 */
import { query } from '../db.js';
import {
  buildMatrizComparativaBienes,
  validateEconomiaCuadro,
  mergeObservacionesCuadro,
  stripArchivosFromDatosJson,
  attachPrimeraFuenteFromCotizaciones,
} from './cuadroComparativoMapper.js';
import {
  aplicarRecomendacionesMatriz,
  mergeAdjudicacionCuadro,
  aplicarAdjudicacionMatriz,
  MODALIDAD_ADJUDICACION,
} from './cuadroComparativoAdjudicacion.js';
import { registrarTrazaPortal } from './invitaciones.js';
import { syncRequerimientosSolicitudWorkflow } from './cotizacionWorkflowSync.js';
import { TRANSICIONES_POR_ACCION } from '../../core/workflowEngine/WorkflowTransitions.js';
import { ETAPAS } from '../../core/workflowEngine/WorkflowState.js';

/** Destino oficial de salida del Cuadro (catálogo Workflow APROBAR). */
export const DESTINO_SALIDA_CUADRO = Object.freeze({
  code: ETAPAS.CCP || 'CCP',
  label: 'CCP',
  etapa_ejecutor: ETAPAS.CUADRO_COMPARATIVO || 'CUADRO_COMPARATIVO',
});

const MAX_PDF_FIRMADO_BYTES = 10 * 1024 * 1024;

function bytesFromBase64(b64) {
  if (!b64) return null;
  const s = String(b64);
  const padding = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - padding);
}

/** Estados documentales del cuadro (independientes de la etapa Workflow). */
export const ESTADOS_CUADRO = Object.freeze({
  PENDIENTE_ELABORAR: 'PENDIENTE_ELABORAR',
  BORRADOR: 'BORRADOR',
  EN_ELABORACION: 'EN_ELABORACION',
  GENERADO: 'GENERADO',
  GENERADO_PRELIMINAR: 'GENERADO_PRELIMINAR',
  ADJUDICADO: 'ADJUDICADO',
  OBSERVADO: 'OBSERVADO',
  FIRMADO: 'FIRMADO',
  DERIVADO_CCP: 'DERIVADO_CCP',
  ANULADO: 'ANULADO',
});

export const ESTADOS_CUADRO_LABEL = Object.freeze({
  [ESTADOS_CUADRO.PENDIENTE_ELABORAR]: 'Pendiente de elaborar',
  [ESTADOS_CUADRO.BORRADOR]: 'En elaboración',
  [ESTADOS_CUADRO.EN_ELABORACION]: 'En elaboración',
  [ESTADOS_CUADRO.GENERADO]: 'Generado',
  [ESTADOS_CUADRO.GENERADO_PRELIMINAR]: 'Generado preliminar',
  [ESTADOS_CUADRO.ADJUDICADO]: 'Adjudicado',
  [ESTADOS_CUADRO.OBSERVADO]: 'Observado',
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
  if (s === 'GENERADO_PRELIMINAR') return ESTADOS_CUADRO.GENERADO_PRELIMINAR;
  if (s === 'ADJUDICADO') return ESTADOS_CUADRO.ADJUDICADO;
  if (s === 'OBSERVADO') return ESTADOS_CUADRO.OBSERVADO;
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
  if (e === ESTADOS_CUADRO.GENERADO || e === ESTADOS_CUADRO.GENERADO_PRELIMINAR) return 'primary';
  if (e === ESTADOS_CUADRO.ADJUDICADO) return 'success';
  if (e === ESTADOS_CUADRO.OBSERVADO) return 'warning';
  if (e === ESTADOS_CUADRO.FIRMADO) return 'success';
  if (e === ESTADOS_CUADRO.DERIVADO_CCP) return 'secondary';
  return 'secondary';
}

async function loadRequerimientosPorSolicitudes(solicitudIds) {
  if (!solicitudIds.length) return new Map();
  // payload es TEXT (no JSONB): no usar -> / ->> en SQL; parsear en Node.
  const { rows } = await query(`
    SELECT sr.solicitud_id, r.id, r.codigo, r.denominacion, r.area, r.cmn, r.estado, r.payload
    FROM solicitud_requerimientos sr
    JOIN requerimientos r ON r.id = sr.requerimiento_id
    WHERE sr.solicitud_id = ANY($1::int[])
    ORDER BY r.codigo ASC
  `, [solicitudIds]);
  const map = new Map();
  for (const r of rows) {
    const payload = parseJson(r.payload, {});
    const centro = String(
      r.cmn
      || payload.cmn
      || payload.centro
      || payload.centro_costo
      || r.area
      || '',
    ).trim();
    const list = map.get(r.solicitud_id) || [];
    list.push({
      id: r.id,
      codigo: r.codigo || '',
      descripcion: r.denominacion || '',
      centro,
      area_usuaria: r.area || '',
      estado: r.estado || '',
      etapa_workflow: payload?.workflowSnapshot?.etapaActual || '',
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
 * Inclusión operativa: ≥1 cotización APTO.
 * No extrae JSON de requerimientos.payload (TEXT): evita "text -> unknown".
 * Tampoco carga propuesta_economica / detalle_items (eso es RC8.2).
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
      STRING_AGG(DISTINCT p.ruc, ' | ' ORDER BY p.ruc) AS proveedores_rucs
    FROM solicitudes_cotizacion sc
    JOIN cotizaciones_proveedor cot ON cot.solicitud_id = sc.id
    JOIN proveedores p ON p.id = cot.proveedor_id
    WHERE cot.estado = 'COTIZACION_PRESENTADA'
    GROUP BY sc.id, sc.codigo, sc.denominacion, sc.objeto, sc.tipo, sc.estado,
      sc.area_usuaria, sc.updated_at
    HAVING
      COUNT(DISTINCT cot.proveedor_id) FILTER (WHERE cot.validacion_estado = 'APTO') >= 1
      OR sc.estado = 'EN_CUADRO_COMPARATIVO'
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
      // Abrir siempre (excepto anulado); post-firma/derivación es «Ver cuadro».
      puede_elaborar: estadoCode !== ESTADOS_CUADRO.ANULADO,
      solo_lectura: estadoCode === ESTADOS_CUADRO.DERIVADO_CCP
        || estadoCode === ESTADOS_CUADRO.FIRMADO,
      accion_cuadro_label: (estadoCode === ESTADOS_CUADRO.DERIVADO_CCP
        || estadoCode === ESTADOS_CUADRO.FIRMADO)
        ? 'Ver cuadro'
        : 'Elaborar cuadro',
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
    SELECT id, codigo, denominacion, objeto, tipo, estado, detalle_items, area_usuaria, cmn
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
      p.ruc, p.razon_social,
      p.telefono, p.correo, p.persona_contacto, p.emails
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
  const base = buildMatrizComparativaBienes({
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
  const withRec = aplicarRecomendacionesMatriz(base);
  return attachPrimeraFuenteFromCotizaciones(withRec, cotizaciones);
}

function mapCuadroRow(row) {
  if (!row) return null;
  const estado = String(row.estado || '').toUpperCase();
  const tienePdf = !!(row.pdf_contenido || row.tiene_pdf || row.pdf_nombre);
  const tieneFirmado = !!(row.firmado_contenido || row.tiene_pdf_firmado || row.firmado_nombre);
  const derivado = estado === ESTADOS_CUADRO.DERIVADO_CCP;
  const soloLectura = derivado
    || estado === ESTADOS_CUADRO.FIRMADO
    || estado === ESTADOS_CUADRO.ANULADO;
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
    valor_adjudicado: row.valor_adjudicado != null ? Number(row.valor_adjudicado) : null,
    usuario_adjudicacion: row.usuario_adjudicacion || '',
    fecha_adjudicacion: row.fecha_adjudicacion || null,
    modalidad_adjudicacion: row.modalidad_adjudicacion || MODALIDAD_ADJUDICACION,
    pdf_nombre: row.pdf_nombre || '',
    tiene_pdf: tienePdf,
    firmado_nombre: row.firmado_nombre || '',
    tiene_pdf_firmado: tieneFirmado,
    firmado_por: row.firmado_por || '',
    firmado_at: row.firmado_at || null,
    creado_por: row.creado_por,
    actualizado_por: row.actualizado_por,
    creado_at: row.creado_at,
    actualizado_at: row.actualizado_at,
    derivado_at: row.derivado_at,
    derivado_por: row.derivado_por || '',
    responsable_ccp_id: row.responsable_ccp_id != null ? Number(row.responsable_ccp_id) : null,
    responsable_ccp_nombre: row.responsable_ccp_nombre || '',
    solo_lectura: soloLectura,
    puede_adjuntar_firmado: !derivado
      && (estado === ESTADOS_CUADRO.GENERADO || estado === ESTADOS_CUADRO.FIRMADO)
      && tienePdf,
    puede_eliminar_firmado: !derivado && tieneFirmado && estado === ESTADOS_CUADRO.FIRMADO,
    puede_derivar_ccp: !derivado
      && estado === ESTADOS_CUADRO.FIRMADO
      && tienePdf
      && tieneFirmado,
    puede_regenerar_pdf: !derivado
      && estado !== ESTADOS_CUADRO.FIRMADO
      && estado !== ESTADOS_CUADRO.ANULADO
      && ['ADJUDICADO', 'GENERADO', 'GENERADO_PRELIMINAR'].includes(estado),
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
    matriz = mergeAdjudicacionCuadro(matriz, saved);
    matriz = attachPrimeraFuenteFromCotizaciones(matriz, cotizaciones);
    const val = validateEconomiaCuadro(matriz);
    matriz.meta = {
      ...matriz.meta,
      ...val,
      puede_seleccionar_ganador: val.items_incompletos === 0 && (matriz.items || []).length > 0,
      puede_pdf_oficial: false,
      pdf_modo: 'BORRADOR',
    };
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
  const estadoCur = String(cur.estado || '').toUpperCase();
  // Tras generar PDF / firmar / derivar no se edita borrador (evita degradar GENERADO → EN_ELABORACION).
  if (['GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO', 'DERIVADO_CCP', 'ANULADO'].includes(estadoCur)) {
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
  matriz = mergeAdjudicacionCuadro(matriz, {
    ...incoming,
    adjudicacion: parseJson(cur.datos_json, {}).adjudicacion,
    historial_adjudicacion: parseJson(cur.datos_json, {}).historial_adjudicacion,
  });
  if (payload.notas_internas != null) matriz.notas_internas = String(payload.notas_internas);
  else if (incoming.notas_internas != null) matriz.notas_internas = String(incoming.notas_internas);

  const val = validateEconomiaCuadro(matriz);
  matriz.meta = {
    ...matriz.meta,
    ...val,
    puede_seleccionar_ganador: val.items_incompletos === 0 && (matriz.items || []).length > 0,
  };
  const datos = stripArchivosFromDatosJson(matriz);
  const user = String(usuario || '').slice(0, 150);
  const nextEstado = estadoCur === 'ADJUDICADO'
    ? 'ADJUDICADO'
    : (estadoCur === 'OBSERVADO' ? 'OBSERVADO' : 'EN_ELABORACION');

  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET datos_json = $2::jsonb,
        estado = $4,
        actualizado_por = $3,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [id, JSON.stringify(datos), user, nextEstado]);

  return {
    cuadro: mapCuadroRow(rows[0]),
    matriz: datos,
    validacion: val,
    saved: true,
  };
}

/**
 * Guarda adjudicación por ítem. No deriva a CCP ni altera Workflow/precios.
 */
export async function guardarAdjudicacionCuadro(cuadroId, payload = {}, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');

  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estadoAdj = String(cur.estado || '').toUpperCase();
  if (['GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO', 'DERIVADO_CCP', 'ANULADO'].includes(estadoAdj)) {
    throw new Error(`El cuadro en estado ${cur.estado} no admite adjudicación`);
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

  const sc = await loadSolicitudRow(cur.solicitud_id);
  const cotizaciones = await loadCotizacionesPresentadas(cur.solicitud_id);
  const reqMap = await loadRequerimientosPorSolicitudes([cur.solicitud_id]);
  let matriz = buildMatrizFromSources(sc, cotizaciones, reqMap.get(cur.solicitud_id) || []);
  const saved = parseJson(cur.datos_json, {});
  matriz = mergeObservacionesCuadro(matriz, saved);
  matriz = mergeAdjudicacionCuadro(matriz, saved);

  const incoming = payload.datos_json || {};
  if (incoming.notas_internas != null) matriz.notas_internas = String(incoming.notas_internas);
  // Aplicar selecciones desde payload
  const selecciones = Array.isArray(payload.selecciones)
    ? payload.selecciones
    : (matriz.items || []).map((it) => {
      const fromDom = (incoming.items || []).find((x) => x.item_key === it.item_key);
      return {
        item_key: it.item_key,
        proveedor_adjudicado_id: fromDom?.proveedor_adjudicado_id ?? it.proveedor_adjudicado_id,
      };
    });

  matriz = aplicarAdjudicacionMatriz(matriz, {
    ...payload,
    selecciones,
    criterio_seleccion: payload.criterio_seleccion,
    sustento_decision: payload.sustento_decision,
    observacion_analista: payload.observacion_analista,
    observacion_area_usuaria: payload.observacion_area_usuaria,
  }, usuario);

  const adj = matriz.adjudicacion || {};
  const datos = stripArchivosFromDatosJson(matriz);
  const user = String(usuario || '').slice(0, 150);

  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET datos_json = $2::jsonb,
        estado = 'ADJUDICADO',
        proveedor_ganador_id = $3,
        criterio_seleccion = $4,
        sustento_decision = $5,
        valor_adjudicado = $6,
        usuario_adjudicacion = $7,
        fecha_adjudicacion = NOW(),
        modalidad_adjudicacion = $8,
        actualizado_por = $7,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    id,
    JSON.stringify(datos),
    adj.proveedor_ganador_id,
    adj.criterio_seleccion || '',
    adj.sustento_decision || '',
    adj.valor_adjudicado,
    user,
    MODALIDAD_ADJUDICACION,
  ]);

  const ganador = (adj.resumen_proveedores || [])[0];
  await registrarTrazaPortal({
    solicitud_id: cur.solicitud_id,
    proveedor_id: adj.proveedor_ganador_id || null,
    evento: 'CUADRO_COMPARATIVO_ADJUDICADO',
    detalle: JSON.stringify({
      cuadro_id: id,
      solicitud_codigo: sc.codigo,
      ganador_id: adj.proveedor_ganador_id,
      ganador_ruc: ganador?.ruc || '',
      ganador_razon_social: ganador?.razon_social || '',
      valor: adj.valor_adjudicado,
      criterio: adj.criterio_seleccion,
      modalidad: MODALIDAD_ADJUDICACION,
      usuario: user,
      fecha: adj.fecha_adjudicacion,
      no_deriva_ccp: true,
    }).slice(0, 2000),
    usuario: user,
  });

  return {
    cuadro: mapCuadroRow(rows[0]),
    matriz: datos,
    adjudicacion: adj,
    saved: true,
    derivado_ccp: false,
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

/**
 * Payload para Anexo 8A: solo datos persistidos (no reconstruye desde UI).
 */
export async function obtenerDatosPdfCuadro(cuadroId) {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!rows.length) throw new Error('Cuadro no encontrado');
  const row = rows[0];
  const estado = String(row.estado || '').toUpperCase();
  if (!['ADJUDICADO', 'GENERADO', 'GENERADO_PRELIMINAR'].includes(estado)) {
    throw new Error('El Anexo 8A requiere cuadro ADJUDICADO o GENERADO');
  }
  const sc = await loadSolicitudRow(row.solicitud_id);
  const reqMap = await loadRequerimientosPorSolicitudes([row.solicitud_id]);
  const datos = parseJson(row.datos_json, {});
  const expediente = {
    solicitud_codigo: sc.codigo,
    denominacion: sc.denominacion || sc.objeto,
    area_usuaria: sc.area_usuaria || '',
    cmn: sc.cmn || '',
    requerimientos: reqMap.get(row.solicitud_id) || [],
  };
  return {
    cuadro: mapCuadroRow(row),
    datos_json: datos,
    matriz: datos,
    adjudicacion: datos.adjudicacion || null,
    expediente,
    solicitud_codigo: sc.codigo,
    cmn: sc.cmn || '',
    area_usuaria: sc.area_usuaria || '',
  };
}

/**
 * Persiste PDF Anexo 8A. Incrementa versión si ya estaba GENERADO (antes de firma).
 * No altera matriz económica ni ganador.
 */
export async function guardarPdfCuadro(cuadroId, payload = {}, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estado = String(cur.estado || '').toUpperCase();
  if (estado === 'FIRMADO') {
    throw new Error('Cuadro firmado: no se puede regenerar el PDF sin anular la versión');
  }
  if (['DERIVADO_CCP', 'ANULADO'].includes(estado)) {
    throw new Error(`El cuadro en estado ${estado} no admite generación de PDF`);
  }
  if (!['ADJUDICADO', 'GENERADO', 'GENERADO_PRELIMINAR'].includes(estado)) {
    throw new Error('Debe adjudicar el cuadro antes de generar el Anexo 8A');
  }

  const base64 = payload.pdf_contenido || payload.base64 || payload.contenido_base64;
  if (!base64) throw new Error('PDF vacío');
  const nombre = String(payload.pdf_nombre || payload.nombre || 'Anexo_08A.pdf').slice(0, 300);
  const user = String(usuario || '').slice(0, 150);
  const datos = parseJson(cur.datos_json, {});
  const hist = Array.isArray(datos.pdf_versiones) ? [...datos.pdf_versiones] : [];
  if (cur.pdf_nombre || cur.pdf_contenido) {
    hist.push({
      version: cur.version,
      pdf_nombre: cur.pdf_nombre,
      generado_at: cur.actualizado_at,
      generado_por: cur.actualizado_por,
    });
  }
  // No guardar base64 histórico completo (solo metadata); vigente en columnas
  datos.pdf_versiones = hist.slice(-20);
  datos.pdf_meta = {
    nombre,
    generado_at: new Date().toISOString(),
    generado_por: user,
    vigente: true,
  };

  const bumpVersion = estado === 'GENERADO' || estado === 'GENERADO_PRELIMINAR';
  const nextVersion = bumpVersion ? Number(cur.version || 1) + 1 : Number(cur.version || 1);

  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET pdf_nombre = $2,
        pdf_contenido = $3,
        datos_json = $4::jsonb,
        estado = 'GENERADO',
        version = $5,
        actualizado_por = $6,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING id, solicitud_id, tipo, version, estado, pdf_nombre,
      proveedor_ganador_id, criterio_seleccion, valor_adjudicado,
      creado_por, actualizado_por, creado_at, actualizado_at
  `, [id, nombre, base64, JSON.stringify(datos), nextVersion, user]);

  await registrarTrazaPortal({
    solicitud_id: cur.solicitud_id,
    proveedor_id: cur.proveedor_ganador_id || null,
    evento: 'CUADRO_COMPARATIVO_GENERADO',
    detalle: JSON.stringify({
      cuadro_id: id,
      pdf_nombre: nombre,
      version: nextVersion,
      usuario: user,
      fecha: new Date().toISOString(),
    }).slice(0, 2000),
    usuario: user,
  });

  return {
    cuadro: mapCuadroRow({ ...rows[0], datos_json: datos, pdf_contenido: undefined }),
    pdf_nombre: nombre,
    version: nextVersion,
    estado: 'GENERADO',
    saved: true,
  };
}

export async function resolverPdfCuadro(cuadroId) {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows } = await query(`
    SELECT id, pdf_nombre, pdf_contenido, estado, version
    FROM cuadros_comparativos WHERE id = $1
  `, [id]);
  if (!rows.length) throw new Error('Cuadro no encontrado');
  const row = rows[0];
  if (!row.pdf_contenido) throw new Error('PDF del Anexo 8A no encontrado');
  return {
    nombre_archivo: row.pdf_nombre || 'Anexo_08A.pdf',
    mime_type: 'application/pdf',
    contenido_base64: row.pdf_contenido,
    version: row.version,
    estado: row.estado,
  };
}

/**
 * Adjunta Anexo 8A firmado. Pasa a FIRMADO. No altera Workflow.
 */
export async function adjuntarPdfFirmadoCuadro(cuadroId, payload = {}, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estado = String(cur.estado || '').toUpperCase();
  if (estado === 'DERIVADO_CCP') {
    throw new Error('Cuadro derivado a CCP: no se puede reemplazar el PDF firmado');
  }
  if (estado === 'ANULADO') throw new Error('Cuadro anulado');
  if (!['GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO'].includes(estado)) {
    throw new Error('Debe generar el Anexo 8A antes de adjuntar el PDF firmado');
  }
  if (!cur.pdf_contenido) throw new Error('No hay PDF generado del Anexo 8A');

  const base64 = payload.pdf_firmado?.base64 || payload.base64 || payload.firmado_contenido || payload.contenido_base64;
  if (!base64) throw new Error('PDF firmado obligatorio');
  const mime = String(payload.pdf_firmado?.mime_type || payload.mime_type || 'application/pdf').toLowerCase();
  const nombre = String(payload.pdf_firmado?.nombre || payload.nombre || payload.firmado_nombre || 'Anexo_08A_firmado.pdf').slice(0, 300);
  if (mime && mime !== 'application/pdf' && !/\.pdf$/i.test(nombre)) {
    throw new Error('Solo se aceptan archivos PDF');
  }
  const size = payload.pdf_firmado?.tamaño_bytes || payload.tamaño_bytes || bytesFromBase64(base64);
  if (size != null && size > MAX_PDF_FIRMADO_BYTES) {
    throw new Error('El PDF supera el tamaño máximo permitido (10 MB)');
  }

  const user = String(usuario || '').slice(0, 150);
  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET firmado_nombre = $2,
        firmado_contenido = $3,
        firmado_por = $4,
        firmado_at = NOW(),
        estado = 'FIRMADO',
        actualizado_por = $4,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING id, solicitud_id, tipo, version, estado, pdf_nombre, firmado_nombre,
      firmado_por, firmado_at, proveedor_ganador_id, criterio_seleccion, valor_adjudicado,
      creado_por, actualizado_por, creado_at, actualizado_at, derivado_at,
      derivado_por, responsable_ccp_id, responsable_ccp_nombre, datos_json,
      usuario_adjudicacion, fecha_adjudicacion, modalidad_adjudicacion, sustento_decision
  `, [id, nombre, base64, user]);

  await registrarTrazaPortal({
    solicitud_id: cur.solicitud_id,
    proveedor_id: cur.proveedor_ganador_id || null,
    evento: 'CUADRO_COMPARATIVO_FIRMADO',
    detalle: JSON.stringify({
      cuadro_id: id,
      firmado_nombre: nombre,
      version: cur.version,
      usuario: user,
      fecha: new Date().toISOString(),
    }).slice(0, 2000),
    usuario: user,
  });

  return {
    cuadro: mapCuadroRow({
      ...rows[0],
      tiene_pdf: true,
      tiene_pdf_firmado: true,
      firmado_contenido: undefined,
      pdf_contenido: undefined,
    }),
    pdf_firmado: {
      nombre,
      mime_type: 'application/pdf',
      tamaño_bytes: size,
      uploaded_at: rows[0].firmado_at,
    },
    estado: 'FIRMADO',
    saved: true,
  };
}

/** Elimina PDF firmado solo antes de derivar; vuelve a GENERADO. */
export async function eliminarPdfFirmadoCuadro(cuadroId, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estado = String(cur.estado || '').toUpperCase();
  if (estado === 'DERIVADO_CCP') {
    throw new Error('Cuadro derivado a CCP: no se puede eliminar el PDF firmado');
  }
  if (estado !== 'FIRMADO') throw new Error('Solo se elimina el firmado en estado FIRMADO');
  if (!cur.firmado_contenido && !cur.firmado_nombre) throw new Error('No hay PDF firmado');

  const user = String(usuario || '').slice(0, 150);
  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET firmado_nombre = NULL,
        firmado_contenido = NULL,
        firmado_por = NULL,
        firmado_at = NULL,
        estado = 'GENERADO',
        actualizado_por = $2,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING id, solicitud_id, tipo, version, estado, pdf_nombre, firmado_nombre,
      firmado_por, firmado_at, proveedor_ganador_id, criterio_seleccion, valor_adjudicado,
      creado_por, actualizado_por, creado_at, actualizado_at, derivado_at,
      derivado_por, responsable_ccp_id, responsable_ccp_nombre, datos_json,
      usuario_adjudicacion, fecha_adjudicacion, modalidad_adjudicacion, sustento_decision
  `, [id, user]);

  return {
    cuadro: mapCuadroRow({
      ...rows[0],
      tiene_pdf: !!cur.pdf_contenido || !!cur.pdf_nombre,
      tiene_pdf_firmado: false,
    }),
    estado: 'GENERADO',
    removed: true,
  };
}

export async function resolverPdfFirmadoCuadro(cuadroId) {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows } = await query(`
    SELECT id, firmado_nombre, firmado_contenido, estado, version, firmado_por, firmado_at
    FROM cuadros_comparativos WHERE id = $1
  `, [id]);
  if (!rows.length) throw new Error('Cuadro no encontrado');
  const row = rows[0];
  if (!row.firmado_contenido) throw new Error('PDF firmado no encontrado');
  return {
    nombre_archivo: row.firmado_nombre || 'Anexo_08A_firmado.pdf',
    mime_type: 'application/pdf',
    contenido_base64: row.firmado_contenido,
    version: row.version,
    estado: row.estado,
    firmado_por: row.firmado_por || '',
    firmado_at: row.firmado_at,
  };
}

/**
 * Deriva cuadro FIRMADO a CCP vía Workflow oficial (registrarMovimiento).
 * Idempotente si ya está DERIVADO_CCP.
 */
export async function derivarCuadroACcp(cuadroId, body = {}, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');

  const destinoOficial = TRANSICIONES_POR_ACCION.APROBAR?.[ETAPAS.CUADRO_COMPARATIVO]
    || DESTINO_SALIDA_CUADRO.code;
  if (String(destinoOficial).toUpperCase() !== 'CCP') {
    throw new Error('Transición Workflow CUADRO_COMPARATIVO → CCP no disponible en catálogo');
  }

  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estado = String(cur.estado || '').toUpperCase();
  const user = String(usuario || '').slice(0, 150);

  if (estado === 'DERIVADO_CCP') {
    return {
      ok: true,
      idempotente: true,
      cuadro: mapCuadroRow({
        ...cur,
        tiene_pdf: !!cur.pdf_contenido || !!cur.pdf_nombre,
        tiene_pdf_firmado: !!cur.firmado_contenido || !!cur.firmado_nombre,
        firmado_contenido: undefined,
        pdf_contenido: undefined,
      }),
      destino: DESTINO_SALIDA_CUADRO,
      responsable: {
        id: cur.responsable_ccp_id,
        nombre: cur.responsable_ccp_nombre || '',
      },
      workflow: {
        etapaDestino: DESTINO_SALIDA_CUADRO.code,
        etapaEjecutor: DESTINO_SALIDA_CUADRO.etapa_ejecutor,
      },
    };
  }

  if (estado !== 'FIRMADO') {
    throw new Error('El cuadro debe estar FIRMADO para derivar a CCP');
  }
  if (!cur.pdf_contenido) throw new Error('Falta el PDF generado del Anexo 8A');
  if (!cur.firmado_contenido) throw new Error('Adjunte el PDF firmado del Anexo 8A antes de derivar');
  if (cur.valor_adjudicado == null && !cur.proveedor_ganador_id) {
    const datos = parseJson(cur.datos_json, {});
    const items = Array.isArray(datos.items) ? datos.items : [];
    const sinAdj = items.some((it) => it.proveedor_adjudicado_id == null);
    if (sinAdj || !items.length) throw new Error('El cuadro debe estar adjudicado antes de derivar');
  }

  const respId = parseInt(body.responsable_destino_id || body.responsable_id || body.responsable_ccp_id, 10);
  const respNombre = String(
    body.responsable_destino_nombre || body.responsable_nombre || body.responsable_ccp_nombre || '',
  ).trim();
  if (!Number.isFinite(respId) || respId <= 0) {
    throw new Error('Seleccione el usuario responsable de CCP');
  }
  if (!respNombre) {
    throw new Error('Nombre del responsable CCP es obligatorio');
  }

  const observacion = String(body.observacion_derivacion || body.observacion || '').trim()
    || 'Cuadro Comparativo firmado derivado a CCP';

  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET estado = 'DERIVADO_CCP',
        derivado_at = NOW(),
        derivado_por = $2,
        responsable_ccp_id = $3,
        responsable_ccp_nombre = $4,
        actualizado_por = $2,
        actualizado_at = NOW()
    WHERE id = $1 AND estado = 'FIRMADO'
    RETURNING id, solicitud_id, tipo, version, estado, pdf_nombre, firmado_nombre,
      firmado_por, firmado_at, proveedor_ganador_id, criterio_seleccion, valor_adjudicado,
      creado_por, actualizado_por, creado_at, actualizado_at, derivado_at,
      derivado_por, responsable_ccp_id, responsable_ccp_nombre, datos_json,
      usuario_adjudicacion, fecha_adjudicacion, modalidad_adjudicacion, sustento_decision
  `, [id, user, respId, respNombre.slice(0, 200)]);

  if (!rows.length) {
    // Carrera: otro proceso derivó
    const { rows: again } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
    if (String(again[0]?.estado || '').toUpperCase() === 'DERIVADO_CCP') {
      return derivarCuadroACcp(id, body, usuario);
    }
    throw new Error('No se pudo derivar el cuadro (estado no editable)');
  }

  const updated = rows[0];

  await query(`
    UPDATE solicitudes_cotizacion SET estado = 'EN_CCP', updated_at = NOW()
    WHERE id = $1 AND estado NOT IN ('CERRADA')
  `, [cur.solicitud_id]);

  const sync = await syncRequerimientosSolicitudWorkflow(cur.solicitud_id, {
    etapaDestino: DESTINO_SALIDA_CUADRO.code,
    usuario: user,
    observacion,
    etapaEjecutor: DESTINO_SALIDA_CUADRO.etapa_ejecutor,
    responsable: respNombre,
  });

  await registrarTrazaPortal({
    solicitud_id: cur.solicitud_id,
    proveedor_id: cur.proveedor_ganador_id || null,
    evento: 'CUADRO_COMPARATIVO_DERIVADO',
    detalle: JSON.stringify({
      cuadro_id: id,
      destino: DESTINO_SALIDA_CUADRO.code,
      responsable_id: respId,
      responsable: respNombre,
      usuario: user,
      fecha: new Date().toISOString(),
      workflow_actualizados: sync?.actualizados,
    }).slice(0, 2000),
    usuario: user,
  });

  await registrarTrazaPortal({
    solicitud_id: cur.solicitud_id,
    proveedor_id: cur.proveedor_ganador_id || null,
    evento: 'DERIVADO_A_CCP',
    detalle: `Expediente derivado desde Cuadro Comparativo → CCP (${respNombre})`,
    usuario: user,
  });

  return {
    ok: true,
    idempotente: false,
    cuadro: mapCuadroRow({
      ...updated,
      tiene_pdf: true,
      tiene_pdf_firmado: true,
    }),
    destino: DESTINO_SALIDA_CUADRO,
    responsable: { id: respId, nombre: respNombre },
    workflow: {
      etapaDestino: DESTINO_SALIDA_CUADRO.code,
      etapaEjecutor: DESTINO_SALIDA_CUADRO.etapa_ejecutor,
      sync,
    },
    estado: 'DERIVADO_CCP',
  };
}


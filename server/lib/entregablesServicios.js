/**
 * RC8.15.1 — Ejecución → Presentación Entregables de Servicios.
 *
 * Unidad operativa = EL ENTREGABLE (orden_entregas activa).
 * Aplica solo a SERVICIO / LOCACIÓN (OS). BIEN (OC) sigue en Recepción de Bienes.
 *
 * La bandeja NO persiste filas "pendientes": deriva entregables ACTIVOS de órdenes
 * notificadas (o estados posteriores compatibles). La recepción real se registra en
 * entregable_recepciones (1 entrega → N recepciones) sin sobrescribir historial.
 */
import { getClient, query } from '../db.js';
import { buildEntregaContract } from '../../shared/entregaContractual.js';
import {
  resolveAreaUsuaria,
  resolveOrdenFechaNotificacion,
} from '../../shared/ordenCronogramaContractual.js';
import { toIsoDateString } from './diasPlazo.js';
import { enrichEstadoResponsableForBandeja } from './enrichEstadoResponsable.js';
import { resolverCentroDesdeRequerimiento } from './recepcionBienesAlcance.js';
import { generateActaConformidadServiciosPdfServer } from './entregableConformidadPdfServer.js';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MIME_ALOWED = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
]);

function httpError(message, status = 400, code = 'ENTREGABLE_ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function isServicioOLocacion(tipoOrden, tipoContratacion, reqTipo) {
  const to = String(tipoOrden || '').toUpperCase();
  if (to === 'OC') return false;
  if (to === 'OS') return true;
  const txt = `${String(tipoContratacion || '')} ${String(reqTipo || '')}`.toUpperCase();
  return /SERVIC|LOCAC|LOCADOR/.test(txt);
}

function stripDataUrl(b64) {
  const s = String(b64 || '');
  const i = s.indexOf('base64,');
  return i >= 0 ? s.slice(i + 7) : s;
}

function validateArchivo({ contenido_base64, nombre_archivo, mime_type }) {
  const raw = stripDataUrl(contenido_base64);
  if (!raw || raw.length < 20) {
    throw httpError('Archivo del entregable inválido o vacío', 400, 'ARCHIVO_VACIO');
  }
  const approxBytes = Math.floor((raw.length * 3) / 4);
  if (approxBytes > MAX_FILE_BYTES) {
    throw httpError('El archivo supera el tamaño máximo permitido (25 MB)', 400, 'ARCHIVO_TAMANO');
  }
  const mime = String(mime_type || 'application/pdf').toLowerCase();
  if (!MIME_ALOWED.has(mime)) {
    throw httpError(`Tipo de archivo no permitido: ${mime_type}`, 400, 'ARCHIVO_MIME');
  }
  return { raw, bytes: approxBytes };
}

/** Unidad de bandeja por entregable (fila de orden_entregas ACTIVA). */
export function mapEntregableBandejaRow(row) {
  const entregaId = Number(row.orden_entrega_id);
  const recepcionesCount = Number(row.numero_recepciones || 0);
  const ultimaRecepcion = row.ultima_recepcion || null;
  const fechaMaxima = toIsoDateString(row.fecha_maxima) || row.fecha_maxima || null;
  const fechaBase = toIsoDateString(row.fecha_base) || row.fecha_base || null;

  const contract = buildEntregaContract({
    id: entregaId,
    numero_entrega: row.numero_entrega,
    tipo_entrega: row.tipo_entrega,
    descripcion: row.descripcion,
    etiqueta_entrega: row.etiqueta_entrega,
    codigo_entrega: row.codigo_entrega,
    dias_plazo: row.dias_plazo,
    fecha_base: fechaBase,
    fecha_maxima: fechaMaxima,
    importe: row.importe,
  }, { totalEntregas: Number(row.total_entregas || 1) });

  // RC8.15.5B — situación DERIVADA del entregable (desde tablas reales, sin duplicar estado workflow).
  const actaGeneradaVersion = row.acta_generada_version != null ? Number(row.acta_generada_version) : 0;
  const firmadaVigenteCount = row.firmada_vigente_count != null ? Number(row.firmada_vigente_count) : 0;
  let estadoEjecucion = recepcionesCount > 0 ? 'RECIBIDO' : 'PENDIENTE_RECEPCION';
  if (actaGeneradaVersion > 0) estadoEjecucion = 'ACTA_GENERADA';
  if (firmadaVigenteCount > 0) estadoEjecucion = 'CONFORME';
  const situacionLabel = {
    PENDIENTE_RECEPCION: 'Pendiente de recepción',
    RECIBIDO: 'Recibido',
    ACTA_GENERADA: 'Acta generada',
    CONFORME: 'Conforme',
  }[estadoEjecucion] || 'Recibido';

  return {
    orden_id: row.orden_id,
    orden_entrega_id: entregaId,
    requerimiento_id: row.requerimiento_id,
    requerimiento_codigo: row.requerimiento_codigo || '',
    tipo_orden: row.tipo_orden || 'OS',
    numero_orden: row.numero_orden || '',
    anio_orden: row.anio_orden || null,
    proveedor_id: row.proveedor_id || null,
    proveedor_ruc: row.proveedor_ruc || '',
    proveedor_razon_social: row.proveedor_razon_social || '',
    area_usuaria: row.area_usuaria || null,
    responsable: row.responsable || '',
    responsable_tipo: row.responsable_tipo || 'PENDIENTE',
    responsable_usuario_id: row.responsable_usuario_id || null,
    // RC8.15.1F — separar concepto de etapa del expediente vs situación del entregable.
    estado_etapa_codigo: row.estado_etapa_codigo || 'PRESENTACION_ENTREGABLES',
    estado_etapa_label: row.estado_etapa_label || 'Presentación de Entregables',
    etapa_label: row.estado_etapa_label || row.etapa_label || 'Presentación de Entregables',
    situacion_codigo: estadoEjecucion,
    situacion_label: situacionLabel,
    numero_entrega: row.numero_entrega,
    etiqueta_entrega: contract.etiquetaEntrega,
    descripcion: contract.descripcionEntrega,
    tipo_entregable: contract.tipoEntrega,
    dias_plazo: Number(row.dias_plazo || 0),
    fecha_base: fechaBase,
    fecha_maxima: fechaMaxima,
    importe: money(row.importe),
    numero_recepciones: recepcionesCount,
    fecha_recepcion_mesa_partes: ultimaRecepcion?.fecha_recepcion_mesa_partes || null,
    numero_expediente_sgd: ultimaRecepcion?.numero_expediente_sgd || null,
    ultima_recepcion: ultimaRecepcion,
    estado_ejecucion: estadoEjecucion,
    estado_ejecucion_label: situacionLabel,
    // RC8.15.3 — datos de orden y de ítem contractual por entregable.
    fecha_orden: toIsoDateString(row.fecha_orden) || row.fecha_orden || null,
    monto_orden: money(row.monto_total),
    moneda: row.moneda || 'PEN',
    cantidad: row.cantidad != null ? Number(row.cantidad) : null,
    precio_unitario: row.precio_unitario != null ? money(row.precio_unitario) : null,
    precio_total: row.precio_total != null ? money(row.precio_total) : null,
    acta_generada_version: actaGeneradaVersion,
    firmada_vigente: firmadaVigenteCount > 0,
    puede_registrar_recepcion: true,
  };
}

/**
 * Bandeja de entregables de SERVICIO/LOCACIÓN.
 * Devuelve cada entregable ACTIVO (unidad separada), sin duplicar por cambios de
 * estado de la orden (se agrupa por orden_entrega).
 */
export async function listarBandejaEntregablesServicios(userCtx = null) {
  const { rows } = await query(`
    SELECT
      oe.id AS orden_entrega_id,
      oe.orden_id,
      oe.numero_entrega,
      oe.tipo_entrega,
      oe.descripcion,
      oe.etiqueta_entrega,
      oe.codigo_entrega,
      oe.dias_plazo,
      oe.fecha_base,
      oe.fecha_maxima,
      oe.importe,
      oe.estado AS entrega_estado,
      oc.requerimiento_id,
      oc.tipo_orden,
      oc.numero_orden,
      oc.anio_orden,
      oc.tipo_contratacion,
      oc.fecha_orden,
      oc.monto_total,
      oc.moneda,
      oc.proveedor_id,
      oc.estado AS orden_estado,
      oc.enviado_proveedor_at,
      r.codigo AS requerimiento_codigo,
      r.area AS req_area,
      r.denominacion,
      p.ruc AS proveedor_ruc,
      p.razon_social AS proveedor_razon_social,
      (
        SELECT COUNT(*)::int FROM entregable_recepciones er
        WHERE er.orden_entrega_id = oe.id
      ) AS numero_recepciones,
      (
        SELECT json_build_object(
          'id', er.id,
          'numero_recepcion', er.numero_recepcion,
          'tipo_recepcion', er.tipo_recepcion,
          'fecha_recepcion_mesa_partes', er.fecha_recepcion_mesa_partes,
          'numero_expediente_sgd', er.numero_expediente_sgd,
          'estado', er.estado,
          'registrado_por', er.registrado_por,
          'registrado_at', er.registrado_at
        )
        FROM entregable_recepciones er
        WHERE er.orden_entrega_id = oe.id
        ORDER BY er.numero_recepcion DESC, er.id DESC
        LIMIT 1
      ) AS ultima_recepcion,
      (
        SELECT COUNT(*)::int FROM orden_entregas oe2
        WHERE oe2.orden_id = oc.id AND oe2.estado = 'ACTIVO'
      ) AS total_entregas,
      oei.cantidad,
      oei.precio_unitario,
      oei.precio_total,
      (
        SELECT MAX(eca.version)::int FROM entregable_conformidad_actas eca
        WHERE eca.orden_entrega_id = oe.id
      ) AS acta_generada_version,
      (
        SELECT COUNT(*)::int FROM entregable_conformidad_acta_visados ecav
        WHERE ecav.orden_entrega_id = oe.id AND ecav.vigente = TRUE AND ecav.deleted_at IS NULL
      ) AS firmada_vigente_count
    FROM orden_entregas oe
    JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
    LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
    LEFT JOIN proveedores p ON p.id = oc.proveedor_id
    LEFT JOIN LATERAL (
      SELECT oei.cantidad, oei.precio_unitario, oei.precio_total
      FROM orden_entrega_items oei
      WHERE oei.orden_entrega_id = oe.id
      ORDER BY oei.id
      LIMIT 1
    ) oei ON TRUE
    WHERE oe.estado = 'ACTIVO'
      AND UPPER(COALESCE(oc.estado,'')) <> 'ORDEN_ANULADA'
      AND (
        UPPER(COALESCE(oc.tipo_orden,'')) = 'OS'
        OR (
          UPPER(COALESCE(oc.tipo_orden,'')) = ''
          AND (
            UPPER(COALESCE(r.tipo,'')) ~ 'SERVIC|LOCAC|LOCADOR'
            OR UPPER(COALESCE(oc.tipo_contratacion,'')) ~ 'SERVIC|LOCAC|LOCADOR'
          )
        )
      )
      AND (
        oc.enviado_proveedor_at IS NOT NULL
        OR UPPER(COALESCE(oc.estado,'')) IN (
          'ORDEN_NOTIFICADA','ORDEN_ENVIADA_PENDIENTE_CONFIRMACION',
          'ORDEN_RECEPCION_CONFIRMADA','ORDEN_EN_EJECUCION','EN_EJECUCION',
          'DERIVADO_EJECUCION','ORDEN_RESUELTA','EXPEDIENTE_DERIVADO_PAGO'
        )
      )
    ORDER BY oc.anio_orden DESC, oc.numero_orden DESC, oe.numero_entrega ASC, oe.id ASC
  `);

  const list = rows.map((row) => {
    const areaUsuaria = resolveAreaUsuaria({
      requerimientoArea: row.req_area,
      solicitudAreaUsuaria: '',
      payloadArea: null,
      centroCosto: '',
      centro: '',
    });
    return mapEntregableBandejaRow({
      ...row,
      area_usuaria: areaUsuaria,
    });
  });

  await enrichEstadoResponsableForBandeja(list, 'requerimiento_id');
  for (const item of list) {
    const erv = item.estado_responsable_vigente;
    item.responsable = erv?.responsableNombre
      || erv?.responsableUsername
      || erv?.responsableUnidad
      || (erv?.responsableTipo === 'PENDIENTE' ? 'Pendiente' : '');
    item.responsable_tipo = erv?.responsableTipo || 'PENDIENTE';
    item.responsable_usuario_id = erv?.responsableUsuarioId ?? null;
    const responsableId = Number(item.responsable_usuario_id);
    item.puede_gestionar_conformidad = esAdmin(userCtx)
      || (Number.isFinite(responsableId) && responsableId > 0 && Number(userCtx?.id) === responsableId);
    // RC8.15.1F — etapa del expediente desde ERV (humano), separada de la situación.
    if (erv && !item.estado_etapa_label) {
      item.estado_etapa_codigo = erv.estadoCodigo || 'PRESENTACION_ENTREGABLES';
      item.estado_etapa_label = (erv.etapaLabel || erv.etapa_label || 'Presentación de Entregables');
      item.etapa_label = item.estado_etapa_label;
    }
  }
  return list;
}

/** RC8.15.3 — Bandeja pestaña Órdenes: una fila por orden (SERVICIO/LOCACIÓN). */
export async function listarBandejaOrdenesEntregablesServicios(userCtx = null) {
  const { rows } = await query(`
    SELECT
      oc.id AS orden_id,
      oc.requerimiento_id,
      oc.tipo_orden,
      oc.numero_orden,
      oc.anio_orden,
      oc.fecha_orden,
      oc.monto_total,
      oc.moneda,
      oc.tipo_contratacion,
      oc.proveedor_id,
      oc.estado AS orden_estado,
      oc.enviado_proveedor_at,
      r.codigo AS requerimiento_codigo,
      r.cmn AS requerimiento_cmn,
      r.area AS req_area,
      r.payload AS requerimiento_payload,
      p.ruc AS proveedor_ruc,
      p.razon_social AS proveedor_razon_social,
      (
        SELECT COUNT(*)::int FROM orden_entregas oe2
        WHERE oe2.orden_id = oc.id AND oe2.estado = 'ACTIVO'
      ) AS total_entregables,
      (
        SELECT COUNT(DISTINCT er.orden_entrega_id)::int
        FROM entregable_recepciones er
        JOIN orden_entregas oe3 ON oe3.id = er.orden_entrega_id
        WHERE oe3.orden_id = oc.id AND oe3.estado = 'ACTIVO'
          AND er.estado IN ('RECIBIDO', 'CONFORME')
      ) AS entregables_recibidos,
      (
        SELECT MAX(oe4.dias_plazo) FROM orden_entregas oe4
        WHERE oe4.orden_id = oc.id AND oe4.estado = 'ACTIVO'
      ) AS plazo_total_dias
    FROM ordenes_contratacion oc
    LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
    LEFT JOIN proveedores p ON p.id = oc.proveedor_id
    WHERE UPPER(COALESCE(oc.estado,'')) <> 'ORDEN_ANULADA'
      AND (
        UPPER(COALESCE(oc.tipo_orden,'')) = 'OS'
        OR (
          UPPER(COALESCE(oc.tipo_orden,'')) = ''
          AND (
            UPPER(COALESCE(r.tipo,'')) ~ 'SERVIC|LOCAC|LOCADOR'
            OR UPPER(COALESCE(oc.tipo_contratacion,'')) ~ 'SERVIC|LOCAC|LOCADOR'
          )
        )
      )
      AND EXISTS (
        SELECT 1 FROM orden_entregas oe5
        WHERE oe5.orden_id = oc.id AND oe5.estado = 'ACTIVO'
      )
      AND (
        oc.enviado_proveedor_at IS NOT NULL
        OR UPPER(COALESCE(oc.estado,'')) IN (
          'ORDEN_NOTIFICADA','ORDEN_ENVIADA_PENDIENTE_CONFIRMACION',
          'ORDEN_RECEPCION_CONFIRMADA','ORDEN_EN_EJECUCION','EN_EJECUCION',
          'DERIVADO_EJECUCION','ORDEN_RESUELTA','EXPEDIENTE_DERIVADO_PAGO'
        )
      )
    ORDER BY oc.fecha_orden DESC, oc.id DESC
  `);

  const list = rows.map((row) => {
    const total = Number(row.total_entregables || 0);
    const recibidos = Number(row.entregables_recibidos || 0);
    let situacionCodigo = 'PENDIENTE_RECEPCION';
    let situacionLabel = 'Pendiente de recepción';
    if (total > 0 && recibidos >= total) {
      situacionCodigo = 'RECIBIDO';
      situacionLabel = 'Recibido';
    } else if (recibidos > 0) {
      situacionCodigo = 'RECIBIDO_PARCIAL';
      situacionLabel = 'Recibido parcial';
    }

    let centro = '';
    try {
      const c = resolverCentroDesdeRequerimiento({
        cmn: row.requerimiento_cmn,
        area: row.req_area,
        payload: row.requerimiento_payload,
      });
      centro = c.centro_codigo || c.centro_nombre || '';
    } catch (_) {
      centro = '';
    }

    return {
      orden_id: row.orden_id,
      requerimiento_id: row.requerimiento_id,
      requerimiento_codigo: row.requerimiento_codigo || '',
      tipo_orden: row.tipo_orden || 'OS',
      numero_orden: row.numero_orden || '',
      anio_orden: row.anio_orden || null,
      fecha_orden: toIsoDateString(row.fecha_orden) || row.fecha_orden || null,
      monto_total: money(row.monto_total),
      moneda: row.moneda || 'PEN',
      proveedor_id: row.proveedor_id || null,
      proveedor_ruc: row.proveedor_ruc || '',
      proveedor_razon_social: row.proveedor_razon_social || '',
      centro,
      plazo_total_dias: Number(row.plazo_total_dias || 0),
      total_entregables: total,
      entregables_recibidos: recibidos,
      situacion_codigo: situacionCodigo,
      situacion_label: situacionLabel,
    };
  });

  await enrichEstadoResponsableForBandeja(list, 'requerimiento_id');
  for (const item of list) {
    const erv = item.estado_responsable_vigente;
    item.responsable = erv?.responsableNombre
      || erv?.responsableUsername
      || erv?.responsableUnidad
      || (erv?.responsableTipo === 'PENDIENTE' ? 'Pendiente' : '');
    item.responsable_tipo = erv?.responsableTipo || 'PENDIENTE';
    item.responsable_usuario_id = erv?.responsableUsuarioId ?? null;
    item.estado_etapa_codigo = erv?.estadoCodigo || 'PRESENTACION_ENTREGABLES';
    item.estado_etapa_label = erv?.etapaLabel || erv?.etapa_label || 'Presentación de Entregables';
  }
  return list;
}

/** RC8.15.5A — Conformidad del entregable: lectura estructural (solo lectura). */
export async function listarConformidadEntregable(ordenEntregaId) {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  const eid = Number(ordenEntregaId);
  const [actasRes, visadosRes] = await Promise.all([
    query(
      `SELECT id, orden_id, orden_entrega_id, numero_acta, version, estado_documental,
              documento_nombre, documento_mime, generado_at, generado_por, created_at, updated_at
       FROM entregable_conformidad_actas
       WHERE orden_entrega_id = $1
       ORDER BY version DESC, id DESC`,
      [eid],
    ),
    query(
      `SELECT id, orden_id, orden_entrega_id, acta_id, version, nombre, mime_type,
              tamano_bytes, estado_documental, vigente, reemplaza_id, created_by, created_at
       FROM entregable_conformidad_acta_visados
       WHERE orden_entrega_id = $1 AND deleted_at IS NULL
       ORDER BY version DESC, id DESC`,
      [eid],
    ),
  ]);
  return {
    orden_id: entrega.orden_id,
    orden_entrega_id: eid,
    actas: actasRes.rows,
    visados: visadosRes.rows,
    acta_generada_vigente: actasRes.rows[0] || null,
    acta_firmada_vigente: visadosRes.rows.find((v) => v.vigente) || visadosRes.rows[0] || null,
  };
}

export async function obtenerActaGeneradaVigente(ordenEntregaId) {
  await getEntregableOrThrow(ordenEntregaId);
  const { rows } = await query(
    `SELECT * FROM entregable_conformidad_actas
     WHERE orden_entrega_id = $1
     ORDER BY version DESC, id DESC LIMIT 1`,
    [Number(ordenEntregaId)],
  );
  return rows[0] || null;
}

export async function obtenerActaFirmadaVigente(ordenEntregaId) {
  await getEntregableOrThrow(ordenEntregaId);
  const { rows } = await query(
    `SELECT * FROM entregable_conformidad_acta_visados
     WHERE orden_entrega_id = $1 AND vigente = TRUE AND deleted_at IS NULL
     ORDER BY version DESC, id DESC LIMIT 1`,
    [Number(ordenEntregaId)],
  );
  return rows[0] || null;
}

async function getEntregableOrThrow(ordenEntregaId) {
  const eid = parseInt(ordenEntregaId, 10);
  if (!Number.isFinite(eid)) throw httpError('orden_entrega_id inválido');
  const { rows } = await query(`
    SELECT oe.*, oc.requerimiento_id, oc.tipo_orden, oc.numero_orden, oc.anio_orden,
      oc.tipo_contratacion, oc.estado AS orden_estado, oc.enviado_proveedor_at,
      oc.proveedor_id, oc.fecha_orden, oc.moneda, oc.monto_total,
      r.codigo AS requerimiento_codigo, r.area AS req_area, r.denominacion, r.tipo AS req_tipo,
      r.cmn AS requerimiento_cmn, r.payload AS requerimiento_payload,
      p.ruc AS proveedor_ruc, p.razon_social AS proveedor_razon_social,
      oei.cantidad, oei.precio_unitario, oei.precio_total
    FROM orden_entregas oe
    JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
    LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
    LEFT JOIN proveedores p ON p.id = oc.proveedor_id
    LEFT JOIN LATERAL (
      SELECT oei.cantidad, oei.precio_unitario, oei.precio_total
      FROM orden_entrega_items oei
      WHERE oei.orden_entrega_id = oe.id
      ORDER BY oei.id
      LIMIT 1
    ) oei ON TRUE
    WHERE oe.id = $1
  `, [eid]);
  if (!rows.length) throw httpError('Entregable no encontrado', 404);
  return rows[0];
}

/** Detalle/expediente del entregable (sin duplicar documentos: reutiliza expediente de la orden). */
export async function getDetalleEntregableServicio(ordenEntregaId) {
  const entrega = await getEntregableOrThrow(ordenEntregaId);

  const [recepcionesRes, documentosRes] = await Promise.all([
    query(`
      SELECT er.*,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', d.id,
            'nombre_archivo', d.nombre_archivo,
            'mime_type', d.mime_type,
            'tamanio_bytes', d.tamanio_bytes,
            'created_at', d.created_at
          ) ORDER BY d.id)
          FROM entregable_recepcion_documentos d WHERE d.recepcion_id = er.id
        ), '[]'::json) AS documentos
      FROM entregable_recepciones er
      WHERE er.orden_entrega_id = $1
      ORDER BY er.numero_recepcion DESC, er.id DESC
    `, [ordenEntregaId]),
    query(`
      SELECT d.id, d.recepcion_id, d.nombre_archivo, d.mime_type, d.tamanio_bytes, d.created_at
      FROM entregable_recepcion_documentos d
      JOIN entregable_recepciones er ON er.id = d.recepcion_id
      WHERE er.orden_entrega_id = $1
      ORDER BY d.id DESC
    `, [ordenEntregaId]),
  ]);

  // Expediente de la orden (Anexo 11 / cotización adjudicada, orden firmada, CCP, etc.).
  let expediente = null;
  try {
    const { getExpedienteOrdenCompleto } = await import('./ordenesContratacion.js');
    expediente = await getExpedienteOrdenCompleto(entrega.orden_id);
  } catch (_) {
    expediente = null;
  }

  const notif = resolveOrdenFechaNotificacion({ enviado_proveedor_at: entrega.enviado_proveedor_at }, []);
  const contract = buildEntregaContract(entrega, { totalEntregas: 1 });

  return {
    orden_id: entrega.orden_id,
    orden_entrega_id: Number(ordenEntregaId),
    requerimiento_id: entrega.requerimiento_id,
    requerimiento_codigo: entrega.requerimiento_codigo || '',
    tipo_orden: entrega.tipo_orden,
    numero_orden: entrega.numero_orden,
    anio_orden: entrega.anio_orden,
    proveedor_ruc: entrega.proveedor_ruc || '',
    proveedor_razon_social: entrega.proveedor_razon_social || '',
    area_usuaria: resolveAreaUsuaria({ requerimientoArea: entrega.req_area }),
    numero_entrega: entrega.numero_entrega,
    etiqueta_entrega: contract.etiquetaEntrega,
    descripcion: contract.descripcionEntrega,
    dias_plazo: Number(entrega.dias_plazo || 0),
    fecha_base: toIsoDateString(entrega.fecha_base) || entrega.fecha_base,
    fecha_maxima: toIsoDateString(entrega.fecha_maxima) || entrega.fecha_maxima,
    importe: money(entrega.importe),
    fecha_notificacion: notif.fechaNotificacion,
    recepciones: recepcionesRes.rows || [],
    documentos_entregable: documentosRes.rows || [],
    expediente: expediente,
  };
}

/**
 * Registra recepción de un entregable (transaccional: recepción + documento).
 * La primera recepción es INICIAL; las siguientes son SUBSANACION (no sobrescribir).
 */
export async function registrarRecepcionEntregable(ordenEntregaId, body = {}, usuario = '', rol = '') {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  if (entrega.estado !== 'ACTIVO') {
    throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
  }
  if (!isServicioOLocacion(entrega.tipo_orden, entrega.tipo_contratacion, entrega.req_tipo)) {
    throw httpError('El entregable no corresponde a un servicio/locación', 409, 'ENTREGABLE_NO_SERVICIO');
  }

  const fechaRecepcion = toIsoDateString(body.fecha_recepcion_mesa_partes)
    || body.fecha_recepcion_mesa_partes;
  const expedienteSgd = String(body.numero_expediente_sgd || '').trim();
  const observacion = String(body.observacion || '').trim();
  const archivos = Array.isArray(body.documentos) && body.documentos.length
    ? body.documentos
    : [{
        nombre_archivo: body.nombre_archivo,
        mime_type: body.mime_type,
        contenido_base64: body.contenido_base64,
      }];

  if (!fechaRecepcion) throw httpError('fecha_recepcion_mesa_partes es obligatoria');
  if (!expedienteSgd) throw httpError('numero_expediente_sgd es obligatorio');
  if (!archivos.length || !archivos.some((a) => String(a?.contenido_base64 || '').trim())) {
    throw httpError('Archivo del entregable es obligatorio');
  }
  const docsValidados = archivos.map((a) => validateArchivo({
    contenido_base64: a?.contenido_base64,
    nombre_archivo: a?.nombre_archivo || a?.nombre,
    mime_type: a?.mime_type || 'application/pdf',
  }));

  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Serializa para evitar duplicados concurrentes del mismo número de recepción.
    await client.query('SELECT id FROM orden_entregas WHERE id = $1 FOR UPDATE', [ordenEntregaId]);

    const { rows: countRows } = await client.query(
      `SELECT COALESCE(MAX(numero_recepcion), 0)::int AS n
       FROM entregable_recepciones WHERE orden_entrega_id = $1`,
      [ordenEntregaId],
    );
    const numeroRecepcion = countRows[0].n + 1;
    const tipoRecepcion = numeroRecepcion === 1 ? 'INICIAL' : 'SUBSANACION';

    const { rows: recepcionRows } = await client.query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, observacion, estado,
        registrado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'RECIBIDO',$8)
      RETURNING *
    `, [
      ordenEntregaId,
      entrega.orden_id,
      numeroRecepcion,
      tipoRecepcion,
      fechaRecepcion,
      expedienteSgd.slice(0, 120),
      observacion || null,
      String(usuario || '').slice(0, 150),
    ]);

    for (let i = 0; i < archivos.length; i += 1) {
      const a = archivos[i];
      const v = docsValidados[i];
      await client.query(`
        INSERT INTO entregable_recepcion_documentos (
          recepcion_id, nombre_archivo, mime_type, contenido_base64, tamanio_bytes
        ) VALUES ($1,$2,$3,$4,$5)
      `, [
        recepcionRows[0].id,
        String(a?.nombre_archivo || a?.nombre || `entregable-${i + 1}.pdf`).slice(0, 300),
        String(a?.mime_type || 'application/pdf').slice(0, 120),
        v.raw,
        v.bytes,
      ]);
    }

    await client.query('COMMIT');
    return {
      id: recepcionRows[0].id,
      orden_entrega_id: ordenEntregaId,
      orden_id: entrega.orden_id,
      numero_recepcion: numeroRecepcion,
      tipo_recepcion: tipoRecepcion,
      fecha_recepcion_mesa_partes: fechaRecepcion,
      numero_expediente_sgd: expedienteSgd,
      estado: 'RECIBIDO',
      registrado_por: String(usuario || '').slice(0, 150),
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw error;
  } finally {
    client.release();
  }
}

/** Contenido documental de una recepción (preview/download). */
export async function getDocumentoRecepcionEntregable(recepcionId, documentoId) {
  const { rows } = await query(`
    SELECT d.id, d.nombre_archivo, d.mime_type, d.contenido_base64, d.tamanio_bytes,
      d.recepcion_id
    FROM entregable_recepcion_documentos d
    WHERE d.recepcion_id = $1 AND d.id = $2
  `, [parseInt(recepcionId, 10), parseInt(documentoId, 10)]);
  if (!rows.length) throw httpError('Documento no encontrado', 404);
  const row = rows[0];
  return {
    id: row.id,
    nombre: row.nombre_archivo,
    mime_type: row.mime_type,
    contenido_base64: row.contenido_base64,
    tamano_bytes: row.tamanio_bytes,
    recepcion_id: row.recepcion_id,
  };
}

export async function getDocumentoRecepcionEntregableBytes(recepcionId, documentoId) {
  const doc = await getDocumentoRecepcionEntregable(recepcionId, documentoId);
  let raw = String(doc.contenido_base64 || '');
  if (raw.includes('base64,')) raw = raw.split('base64,').pop();
  raw = raw.replace(/\s+/g, '');
  if (!raw) throw httpError('Archivo no disponible', 404, 'DOCUMENTO_SIN_CONTENIDO');
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw httpError('Archivo no disponible', 404, 'DOCUMENTO_SIN_CONTENIDO');
  return {
    buffer,
    mimeType: doc.mime_type || 'application/pdf',
    nombre: doc.nombre || 'documento.pdf',
    documentoId: doc.id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RC8.15.5B — Acta de Conformidad de Servicios (generación + firmada + visor).
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ACTA_BYTES = 10 * 1024 * 1024; // 10 MB
const ACTA_MIME_PDF = 'application/pdf';

/** Override institucional: rol admin o alcance global/institucional. */
function esAdmin(userCtx) {
  if (!userCtx) return false;
  const rol = String(userCtx.rol || '').toLowerCase();
  if (rol === 'admin' || rol === 'administrador') return true;
  const alcance = String(userCtx.alcance_datos || '').toUpperCase();
  return alcance.includes('GLOBAL') || alcance.includes('INSTITUCIONAL');
}

/** Responsable canónico desde expediente_estado_vigente + JOIN usuarios. */
async function getResponsableConformidad(requerimientoId) {
  const { rows } = await query(
    `SELECT e.responsable_usuario_id, e.etapa_codigo, e.estado_codigo,
            u.nombre AS responsable_nombre, u.username AS responsable_username
     FROM expediente_estado_vigente e
     LEFT JOIN usuarios u ON u.id = e.responsable_usuario_id
     WHERE e.requerimiento_id = $1`,
    [Number(requerimientoId)],
  );
  return rows[0] || null;
}

/** Solo el responsable actual del expediente (o admin) puede gestionar la conformidad. */
function assertPuedeGestionarConformidad(userCtx, entrega, responsable) {
  if (esAdmin(userCtx)) return;
  const uid = Number(userCtx?.id);
  const responsableId = responsable ? Number(responsable.responsable_usuario_id) : null;
  if (!uid || !responsableId || uid !== responsableId) {
    const err = new Error('Solo el responsable actual del expediente puede gestionar la conformidad');
    err.status = 403;
    err.code = 'CONFORMIDAD_NO_AUTORIZADO';
    throw err;
  }
}

/** Recepción válida/vigente del entregable (RECIBIDO/CONFORME). */
async function getRecepcionVigenteEntregable(ordenEntregaId) {
  const { rows } = await query(
    `SELECT * FROM entregable_recepciones
     WHERE orden_entrega_id = $1
       AND UPPER(COALESCE(estado,'')) IN ('RECIBIDO','CONFORME')
     ORDER BY numero_recepcion DESC, id DESC
     LIMIT 1`,
    [Number(ordenEntregaId)],
  );
  return rows[0] || null;
}

/** Documento de presentación/recepción del entregable. */
async function getDocumentoRecepcionPresentacion(ordenEntregaId) {
  const { rows } = await query(
    `SELECT d.* FROM entregable_recepcion_documentos d
     JOIN entregable_recepciones er ON er.id = d.recepcion_id
     WHERE er.orden_entrega_id = $1
     ORDER BY d.id ASC LIMIT 1`,
    [Number(ordenEntregaId)],
  );
  return rows[0] || null;
}

/** Precondiciones (A–F, H). La autorización (G) se valida aparte. */
async function validarPrecondicionesConformidad(entrega) {
  if (String(entrega.estado || '').toUpperCase() !== 'ACTIVO') {
    throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
  }
  if (String(entrega.orden_estado || '').toUpperCase() === 'ORDEN_ANULADA') {
    throw httpError('La orden asociada está anulada', 409, 'ORDEN_ANULADA');
  }
  const recepcion = await getRecepcionVigenteEntregable(entrega.id);
  if (!recepcion) {
    throw httpError('El entregable no tiene una recepción válida', 409, 'SIN_RECEPCION_VALIDA');
  }
  const documento = await getDocumentoRecepcionPresentacion(entrega.id);
  if (!documento) {
    throw httpError('Falta el documento de presentación/recepción del entregable', 409, 'SIN_DOCUMENTO_RECEPCION');
  }
  return { recepcion, documento };
}

/**
 * PASO 1 — Armador de datos reales del acta.
 * Construye el objeto que recibe generateActaConformidadServiciosPdfServer().
 * Resuelve fuentes reales (centro, cantidad/PU/total, recepción, responsable).
 */
export async function buildDatosActaConformidadServicio(ordenEntregaId, opts = {}) {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  const [recepcion, responsable] = await Promise.all([
    getRecepcionVigenteEntregable(ordenEntregaId),
    getResponsableConformidad(entrega.requerimiento_id),
  ]);

  let centro = '';
  try {
    const c = resolverCentroDesdeRequerimiento({
      cmn: entrega.requerimiento_cmn,
      area: entrega.req_area,
      payload: entrega.requerimiento_payload,
    });
    centro = c.centro_codigo || c.centro_nombre || '';
  } catch (_) { centro = ''; }

  const areaUsuaria = resolveAreaUsuaria({ requerimientoArea: entrega.req_area });
  const contract = buildEntregaContract(entrega, { totalEntregas: 1 });

  return {
    numero_orden: entrega.numero_orden || '',
    fecha_orden: toIsoDateString(entrega.fecha_orden) || entrega.fecha_orden || null,
    requerimiento: entrega.requerimiento_codigo || '',
    proveedor: entrega.proveedor_razon_social || '',
    ruc: entrega.proveedor_ruc || '',
    centro,
    area_usuaria: areaUsuaria || entrega.req_area || '',
    objeto_servicio: entrega.denominacion || contract.descripcionEntrega || '',
    numero_entrega: entrega.numero_entrega,
    denominacion: contract.etiquetaEntrega || contract.descripcionEntrega || '',
    plazo: entrega.dias_plazo ? `${Number(entrega.dias_plazo)} días` : '',
    fecha_maxima: toIsoDateString(entrega.fecha_maxima) || entrega.fecha_maxima || null,
    fecha_recepcion_mesa_partes: recepcion?.fecha_recepcion_mesa_partes || null,
    numero_expediente_sgd: recepcion?.numero_expediente_sgd || '',
    cantidad: entrega.cantidad != null ? Number(entrega.cantidad) : null,
    precio_unitario: entrega.precio_unitario != null ? Number(entrega.precio_unitario) : null,
    importe_entregable: entrega.importe != null ? Number(entrega.importe)
      : (entrega.precio_total != null ? Number(entrega.precio_total) : null),
    responsable: responsable?.responsable_nombre || responsable?.responsable_username || '',
    fecha_emision: opts.fecha_emision || new Date().toISOString().slice(0, 10),
    conclusion: opts.conclusion || '',
    moneda: entrega.moneda || 'PEN',
    version: Number(opts.version) || 1,
    numero_acta: opts.numero_acta || undefined,
  };
}

/** PASO 2–6 — Genera y persiste el Acta (versionada). */
export async function generarActaConformidadEntregable(ordenEntregaId, body = {}, userCtx = null, usuario = '') {
  const conclusion = String(body?.conclusion || '').trim().toUpperCase();
  if (conclusion !== 'CONFORME') {
    throw httpError('Debe confirmar la conformidad del entregable (conclusión CONFORME)', 422, 'CONCLUSION_NO_CONFORME');
  }

  const entrega = await getEntregableOrThrow(ordenEntregaId);
  await validarPrecondicionesConformidad(entrega);
  const responsable = await getResponsableConformidad(entrega.requerimiento_id);
  assertPuedeGestionarConformidad(userCtx, entrega, responsable);

  const eid = Number(ordenEntregaId);
  const generadoPor = String(usuario || userCtx?.id || '').slice(0, 150);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Serializa la generación por entregable (evita versiones duplicadas).
    await client.query('SELECT id FROM orden_entregas WHERE id = $1 FOR UPDATE', [eid]);
    const vres = await client.query(
      'SELECT COALESCE(MAX(version),0)::int AS v FROM entregable_conformidad_actas WHERE orden_entrega_id = $1',
      [eid],
    );
    const nextVersion = Number(vres.rows[0].v) + 1;

    const data = await buildDatosActaConformidadServicio(eid, { version: nextVersion, conclusion });
    const pdf = generateActaConformidadServiciosPdfServer(data);

    const ins = await client.query(
      `INSERT INTO entregable_conformidad_actas
         (orden_id, orden_entrega_id, numero_acta, version, estado_documental, contenido_html,
          documento_nombre, documento_mime, documento_base64, generado_at, generado_por)
       VALUES ($1,$2,$3,$4,'ACTA_CONFORMIDAD_GENERADA',$5,$6,'application/pdf',$7,NOW(),$8)
       RETURNING id, orden_id, orden_entrega_id, numero_acta, version, estado_documental, generado_at, generado_por`,
      [entrega.orden_id, eid, pdf.nombre, nextVersion, pdf.html, pdf.nombre, pdf.base64, generadoPor],
    );
    await client.query('COMMIT');
    return { ok: true, data: ins.rows[0] };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

/** PASO 7–10 — Adjunta Acta firmada (PDF, versionada, idempotente). */
export async function adjuntarActaConformidadFirmada(ordenEntregaId, body = {}, userCtx = null, usuario = '') {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  const responsable = await getResponsableConformidad(entrega.requerimiento_id);
  assertPuedeGestionarConformidad(userCtx, entrega, responsable);

  const raw = stripDataUrl(body?.contenido_base64 || '');
  const mime = String(body?.mime_type || '').toLowerCase();
  if (mime && mime !== ACTA_MIME_PDF) {
    throw httpError('Solo se admite PDF para el acta firmada', 422, 'ACTA_FIRMADA_SOLO_PDF');
  }
  if (!raw || raw.length < 20) {
    throw httpError('Contenido del acta firmada inválido o vacío', 422, 'ACTA_FIRMADA_VACIA');
  }
  const approxBytes = Math.floor((raw.length * 3) / 4);
  if (approxBytes > MAX_ACTA_BYTES) {
    throw httpError('El acta firmada supera el tamaño máximo permitido (10 MB)', 422, 'ACTA_FIRMADA_TAMANO');
  }

  const acta = await obtenerActaGeneradaVigente(ordenEntregaId);
  if (!acta) {
    throw httpError('Debe existir un Acta de Conformidad generada antes de adjuntar la firmada', 409, 'SIN_ACTA_GENERADA');
  }

  const eid = Number(ordenEntregaId);
  const idem = String(body?.idempotency_key || '').trim().slice(0, 120) || null;
  const nombre = String(body?.nombre || acta.numero_acta || `ACTA-CS-${entrega.numero_orden}-E${entrega.numero_entrega}-firmada.pdf`).slice(0, 255);
  const createdBy = String(usuario || userCtx?.id || '').slice(0, 150);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    if (idem) {
      const existente = await client.query(
        `SELECT id, orden_id, orden_entrega_id, acta_id, version, nombre, mime_type, tamano_bytes,
                estado_documental, vigente, reemplaza_id, created_by, created_at
         FROM entregable_conformidad_acta_visados
         WHERE orden_entrega_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL`,
        [eid, idem],
      );
      if (existente.rows.length) {
        await client.query('COMMIT');
        return { ok: true, data: existente.rows[0], idempotente: true };
      }
    }

    const vigente = await client.query(
      `SELECT id, version FROM entregable_conformidad_acta_visados
       WHERE acta_id = $1 AND vigente = TRUE AND deleted_at IS NULL
       ORDER BY version DESC LIMIT 1`,
      [acta.id],
    );
    const prev = vigente.rows[0] || null;
    const nextVersion = prev ? Number(prev.version) + 1 : 1;

    if (prev) {
      await client.query('UPDATE entregable_conformidad_acta_visados SET vigente = FALSE WHERE id = $1', [prev.id]);
    }

    const ins = await client.query(
      `INSERT INTO entregable_conformidad_acta_visados
         (orden_id, orden_entrega_id, acta_id, version, nombre, mime_type, contenido_base64, tamano_bytes,
          estado_documental, vigente, reemplaza_id, idempotency_key, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTA_CONFORMIDAD_FIRMADA',TRUE,$9,$10,$11)
       RETURNING id, orden_id, orden_entrega_id, acta_id, version, nombre, mime_type, tamano_bytes,
                 estado_documental, vigente, reemplaza_id, created_by, created_at`,
      [entrega.orden_id, eid, acta.id, nextVersion, nombre, ACTA_MIME_PDF, raw, approxBytes,
        prev ? prev.id : null, idem, createdBy],
    );
    await client.query('COMMIT');
    return { ok: true, data: ins.rows[0] };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

/** PASO 11 — Ver/descargar Acta generada (valida ordenEntregaId + actaId). */
export async function getActaConformidadGenerada(ordenEntregaId, actaId) {
  await getEntregableOrThrow(ordenEntregaId);
  const { rows } = await query(
    `SELECT id, orden_id, orden_entrega_id, numero_acta, version, estado_documental,
            documento_nombre, documento_mime, documento_base64, generado_at, generado_por, created_at, updated_at
     FROM entregable_conformidad_actas
     WHERE id = $1 AND orden_entrega_id = $2`,
    [parseInt(actaId, 10), Number(ordenEntregaId)],
  );
  if (!rows.length) throw httpError('Acta de conformidad no encontrada', 404);
  return rows[0];
}

export async function getActaConformidadGeneradaBytes(ordenEntregaId, actaId) {
  await getEntregableOrThrow(ordenEntregaId);
  const { rows } = await query(
    `SELECT documento_base64, documento_nombre, documento_mime
     FROM entregable_conformidad_actas WHERE id = $1 AND orden_entrega_id = $2`,
    [parseInt(actaId, 10), Number(ordenEntregaId)],
  );
  if (!rows.length || !rows[0].documento_base64) throw httpError('Acta de conformidad no disponible', 404, 'ACTA_SIN_CONTENIDO');
  let raw = String(rows[0].documento_base64 || '');
  if (raw.includes('base64,')) raw = raw.split('base64,').pop();
  raw = raw.replace(/\s+/g, '');
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw httpError('Acta de conformidad no disponible', 404, 'ACTA_SIN_CONTENIDO');
  return { buffer, mimeType: rows[0].documento_mime || ACTA_MIME_PDF, nombre: rows[0].documento_nombre || 'acta-conformidad.pdf' };
}

/** PASO 11 — Ver/descargar Acta firmada (valida ordenEntregaId + visadoId). */
export async function getActaConformidadFirmada(ordenEntregaId, visadoId) {
  await getEntregableOrThrow(ordenEntregaId);
  const { rows } = await query(
    `SELECT id, orden_id, orden_entrega_id, acta_id, version, nombre, mime_type, tamano_bytes,
            estado_documental, vigente, reemplaza_id, idempotency_key, contenido_base64, created_by, created_at
     FROM entregable_conformidad_acta_visados
     WHERE id = $1 AND orden_entrega_id = $2 AND deleted_at IS NULL`,
    [parseInt(visadoId, 10), Number(ordenEntregaId)],
  );
  if (!rows.length) throw httpError('Acta firmada no encontrada', 404);
  return rows[0];
}

export async function getActaConformidadFirmadaBytes(ordenEntregaId, visadoId) {
  await getEntregableOrThrow(ordenEntregaId);
  const { rows } = await query(
    `SELECT contenido_base64, nombre, mime_type
     FROM entregable_conformidad_acta_visados
     WHERE id = $1 AND orden_entrega_id = $2 AND deleted_at IS NULL`,
    [parseInt(visadoId, 10), Number(ordenEntregaId)],
  );
  if (!rows.length || !rows[0].contenido_base64) throw httpError('Acta firmada no disponible', 404, 'ACTA_FIRMADA_SIN_CONTENIDO');
  let raw = String(rows[0].contenido_base64 || '');
  if (raw.includes('base64,')) raw = raw.split('base64,').pop();
  raw = raw.replace(/\s+/g, '');
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw httpError('Acta firmada no disponible', 404, 'ACTA_FIRMADA_SIN_CONTENIDO');
  return { buffer, mimeType: rows[0].mime_type || ACTA_MIME_PDF, nombre: rows[0].nombre || 'acta-firmada.pdf' };
}
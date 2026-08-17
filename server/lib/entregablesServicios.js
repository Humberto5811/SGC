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

  const estadoEjecucion = recepcionesCount > 0 ? 'RECIBIDO' : 'PENDIENTE_RECEPCION';

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
    situacion_label: estadoEjecucion === 'PENDIENTE_RECEPCION'
      ? 'Pendiente de recepción'
      : 'Recibido',
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
    estado_ejecucion_label: estadoEjecucion === 'PENDIENTE_RECEPCION'
      ? 'Pendiente de recepción'
      : 'Recibido',
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
      ) AS total_entregas
    FROM orden_entregas oe
    JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
    LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
    LEFT JOIN proveedores p ON p.id = oc.proveedor_id
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
    // RC8.15.1F — etapa del expediente desde ERV (humano), separada de la situación.
    if (erv && !item.estado_etapa_label) {
      item.estado_etapa_codigo = erv.estadoCodigo || 'PRESENTACION_ENTREGABLES';
      item.estado_etapa_label = (erv.etapaLabel || erv.etapa_label || 'Presentación de Entregables');
      item.etapa_label = item.estado_etapa_label;
    }
  }
  return list;
}

async function getEntregableOrThrow(ordenEntregaId) {
  const eid = parseInt(ordenEntregaId, 10);
  if (!Number.isFinite(eid)) throw httpError('orden_entrega_id inválido');
  const { rows } = await query(`
    SELECT oe.*, oc.requerimiento_id, oc.tipo_orden, oc.numero_orden, oc.anio_orden,
      oc.tipo_contratacion, oc.estado AS orden_estado, oc.enviado_proveedor_at,
      oc.proveedor_id, oc.fecha_orden,
      r.codigo AS requerimiento_codigo, r.area AS req_area, r.denominacion, r.tipo AS req_tipo,
      p.ruc AS proveedor_ruc, p.razon_social AS proveedor_razon_social
    FROM orden_entregas oe
    JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
    LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
    LEFT JOIN proveedores p ON p.id = oc.proveedor_id
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
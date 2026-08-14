/**
 * Envío de órdenes al proveedor y confirmación vía portal.
 */
import crypto from 'crypto';
import { query } from '../db.js';
import { sendMail, getPortalBaseUrl } from './emailService.js';
import { ensureProveedorPortalAccount, PORTAL_PUBLIC_BASE, generarTokenAcceso } from './proveedorPortal.js';
import {
  httpError,
  getOrdenById,
  getDetalleOrden,
  getDocumentoActivo,
  listarDocsNotificacion,
  getDocNotificacion,
  registrarEventoOrden,
  ESTADOS_ORDEN,
  loadContextoExpediente,
  aplicarFechasInicioTrasNotificacion,
} from './ordenesContratacion.js';
import { normalizeEstadoOrden } from '../../shared/estadoExpedienteVigente.js';
import { assertCronogramaListoParaEnvio, recalcularFechasEntregas, listarEntregas } from './ordenesEntregas.js';

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function buildOrdenPortalUrl(token) {
  return `${PORTAL_PUBLIC_BASE}/orden/${token}`;
}

function buildOrdenEmail({ orden, contexto, url, correos }) {
  const portalLogin = getPortalBaseUrl();
  const subject = `[SGC] Orden ${orden.tipo_orden} ${orden.numero_orden} — confirmación de recepción`;
  const text = [
    `Estimado proveedor ${contexto.proveedor_razon_social || contexto.proveedor_ruc}:`,
    '',
    `Se le remite la ${orden.tipo_orden} N° ${orden.numero_orden}/${orden.anio_orden}.`,
    `Requerimiento: ${contexto.requerimiento_codigo}`,
    `CCP: ${contexto.codigo_ccp || '—'}`,
    `Monto: ${orden.moneda} ${Number(orden.monto_total).toFixed(2)}`,
    '',
    'Acceso a la orden:',
    url,
    '',
    'Portal de Proveedores:',
    portalLogin,
    '',
    'Debe confirmar la recepción de la orden en el portal.',
  ].join('\n');
  const html = `<p>Orden <strong>${orden.tipo_orden} ${orden.numero_orden}/${orden.anio_orden}</strong></p>
<p>Requerimiento: ${contexto.requerimiento_codigo}</p>
<p><a href="${url}">Ver orden y confirmar recepción</a></p>
<p>Portal: <a href="${portalLogin}">${portalLogin}</a></p>`;
  return { subject, text, html, to: correos };
}

export async function buildOrdenEmailAttachments(ordenId) {
  const meta = await listarDocsNotificacion(ordenId);
  const documentos = Array.isArray(meta?.documentos) ? meta.documentos : [];
  const faltantes = documentos.filter((doc) => !doc.disponible);
  if (!documentos.length || faltantes.length) {
    throw httpError(
      `Documentos de notificación incompletos: ${faltantes.map((doc) => doc.tipo).join(', ') || 'sin documentos'}`,
      409,
      'DOCUMENTOS_INCOMPLETOS',
    );
  }

  const attachments = [];
  for (const doc of documentos) {
    const full = await getDocNotificacion(ordenId, doc.tipo, { includeContent: true });
    const raw = String(full?.contenido_base64 || '');
    const base64 = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
    if (!base64) {
      throw httpError(`Documento sin contenido: ${doc.nombre || doc.tipo}`, 409, 'DOCUMENTO_SIN_CONTENIDO');
    }
    attachments.push({
      filename: full.nombre_archivo || doc.nombre || `${doc.tipo}.bin`,
      content: Buffer.from(base64, 'base64'),
      contentType: full.mime_type || doc.mime_type || 'application/octet-stream',
    });
  }
  return attachments;
}

export async function enviarOrdenProveedor(ordenId, payload, usuario, rol) {
  let orden;
  let entregas;
  try {
    ({ orden, entregas } = await assertCronogramaListoParaEnvio(ordenId));
  } catch (err) {
    if (err?.code === 'MONTO_MISMATCH') {
      throw httpError('El monto distribuido no coincide con el monto adjudicado.', 409, err.code);
    }
    if (err?.code === 'CANTIDAD_MISMATCH') {
      throw httpError('La cantidad distribuida no coincide con la adjudicada.', 409, err.code);
    }
    if (err?.code === 'SIN_CRONOGRAMA' || /cronograma/i.test(err?.message || '')) {
      throw httpError('Falta el cronograma de entregas/entregables.', 409, 'SIN_CRONOGRAMA');
    }
    throw err;
  }
  const doc = await getDocumentoActivo(ordenId, 'ORDEN_FIRMADA');
  if (!doc) throw httpError('Falta la orden firmada.', 409, 'SIN_ORDEN_FIRMADA');

  if ([ESTADOS_ORDEN.DERIVADO_EJECUCION, ESTADOS_ORDEN.ORDEN_ANULADA].includes(orden.estado)) {
    throw httpError('Estado no permite envío', 409);
  }

  const ctx = await loadContextoExpediente(orden.requerimiento_id);
  const { rows: cots } = await query(`
    SELECT id FROM cotizaciones_proveedor
    WHERE solicitud_id = $1 AND proveedor_id = $2
    ORDER BY id DESC LIMIT 1
  `, [orden.solicitud_cotizacion_id, orden.proveedor_id]);
  if (!cots.length) {
    throw httpError('No existe la cotización del proveedor adjudicado.', 409, 'SIN_COTIZACION');
  }

  const { rows: ini } = await query(`
    SELECT id FROM orden_inicio_actividad
    WHERE orden_id = $1 OR (requerimiento_id = $2 AND orden_id IS NULL)
    ORDER BY id DESC LIMIT 1
  `, [ordenId, orden.requerimiento_id]);
  if (!ini.length) {
    throw httpError('Falta configurar el inicio de actividad.', 409, 'SIN_INICIO_ACTIVIDAD');
  }

  const correos = Array.isArray(payload?.correos) && payload.correos.length
    ? payload.correos
    : (ctx.proveedor_emails || []);
  const correoDestino = correos[0] || payload?.correo || '';
  if (!String(correoDestino || '').trim()) {
    throw httpError('Indique el correo del proveedor.', 400, 'SIN_CORREO');
  }

  const attachments = await buildOrdenEmailAttachments(ordenId);
  const token = generarTokenAcceso();
  const url = buildOrdenPortalUrl(token);
  const { rows: intentos } = await query(
    'SELECT COALESCE(MAX(intento),0)::int AS n FROM orden_envios_proveedor WHERE orden_id = $1',
    [ordenId],
  );
  const intento = (intentos[0]?.n || 0) + 1;

  let emailResult = { success: true, simulated: true };
  let errorMsg = null;
  try {
    const mail = buildOrdenEmail({ orden, contexto: ctx, url, correos: correoDestino ? [correoDestino] : ['sin-correo@localhost'] });
    emailResult = await sendMail({ ...mail, attachments });
    if (!emailResult?.success || emailResult.simulated) {
      errorMsg = emailResult?.simulated
        ? 'SMTP no habilitado: el correo fue simulado y no se considera enviado.'
        : 'El transporte SMTP no confirmó el envío.';
    }
  } catch (err) {
    errorMsg = err.message || String(err);
  }

  const { rows } = await query(`
    INSERT INTO orden_envios_proveedor (
      orden_id, proveedor_id, documento_version, cronograma_version,
      correo_destino, token_hash, token_plain_hint, url_acceso,
      enviado_por, estado, intento, error
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING id, enviado_at, intento, estado, url_acceso, documento_version, cronograma_version
  `, [
    ordenId,
    ctx.proveedor_id,
    doc.version,
    orden.cronograma_version,
    correoDestino || null,
    hashToken(token),
    token.slice(0, 8),
    url,
    String(usuario || '').slice(0, 150),
    errorMsg ? 'ERROR' : 'ENVIADO',
    intento,
    errorMsg,
  ]);

  if (!errorMsg) {
    // La cuenta portal solo refleja ORDEN_ENVIADA después de que sendMail terminó
    // correctamente. Un fallo SMTP no altera estado_invitacion ni fecha_ultimo_envio.
    await ensureProveedorPortalAccount({
      id: ctx.proveedor_id,
      ruc: ctx.proveedor_ruc,
      razon_social: ctx.proveedor_razon_social,
      emails: correos,
    }, {
      passwordTemporal: ctx.proveedor_ruc,
      estadoInvitacion: 'ORDEN_ENVIADA',
      fechaEnvio: new Date(),
    });
    await query(`
      UPDATE ordenes_contratacion SET
        estado = $2,
        enviado_proveedor_por = $3,
        enviado_proveedor_at = NOW(),
        actualizado_por = $3,
        actualizado_at = NOW()
      WHERE id = $1
    `, [
      ordenId,
      ESTADOS_ORDEN.ORDEN_NOTIFICADA,
      String(usuario || '').slice(0, 150),
    ]);
    // Recalcular fechas post-notificación sin abortar el envío si falla
    try {
      await aplicarFechasInicioTrasNotificacion(ordenId, usuario);
      await recalcularFechasEntregas(ordenId);
    } catch (fechaErr) {
      console.error('[ordenes] recalculo fechas tras notificación:', fechaErr?.message || fechaErr);
      await registrarEventoOrden({
        ordenId,
        requerimientoId: orden.requerimiento_id,
        tipo: 'ORDEN_FECHAS_RECALCULO_ERROR',
        usuario,
        rol,
        observacion: String(fechaErr?.message || fechaErr).slice(0, 500),
      });
    }
  }

  await registrarEventoOrden({
    ordenId,
    requerimientoId: orden.requerimiento_id,
    tipo: errorMsg ? 'ORDEN_ENVIO_ERROR' : 'ORDEN_NOTIFICADA',
    estadoAnterior: orden.estado,
    estadoNuevo: errorMsg ? orden.estado : ESTADOS_ORDEN.ORDEN_NOTIFICADA,
    usuario,
    rol,
    observacion: errorMsg || `Intento ${intento}`,
    datos: {
      documento_version: doc.version,
      cronograma_version: orden.cronograma_version,
      entregas: entregas.length,
      email: emailResult,
    },
  });

  if (errorMsg) {
    throw httpError(
      'No se pudo enviar la notificación por correo. Puede volver a intentarlo.',
      502,
      'SMTP_ERROR',
    );
  }

  // Ingreso automático a Ejecución → Recepción de Bienes (solo OC / bienes)
  try {
    const { asegurarExpedienteRecepcionDesdeOrden } = await import('./recepcionBienes.js');
    await asegurarExpedienteRecepcionDesdeOrden(ordenId, usuario);
  } catch (rbErr) {
    console.error('[recepcion-bienes] ingreso automático:', rbErr?.message || rbErr);
  }

  return {
    envio: rows[0],
    token, // solo en respuesta de creación (analista puede copiar enlace)
    url,
    estado: errorMsg ? orden.estado : ESTADOS_ORDEN.ORDEN_NOTIFICADA,
  };
}

export async function reenviarOrdenProveedor(ordenId, payload, usuario, rol) {
  return enviarOrdenProveedor(ordenId, payload, usuario, rol);
}

export async function listarEnviosOrden(ordenId) {
  const { rows } = await query(`
    SELECT id, documento_version, cronograma_version, correo_destino, enviado_por,
      enviado_at, estado, intento, error, confirmado_at, confirmado_ip, url_acceso
    FROM orden_envios_proveedor
    WHERE orden_id = $1
    ORDER BY id DESC
  `, [ordenId]);
  return rows;
}

export async function resolverEnvioPorToken(token) {
  const th = hashToken(token);
  const { rows } = await query(`
    SELECT e.*, o.estado AS orden_estado, o.tipo_orden, o.numero_orden, o.anio_orden,
      o.fecha_orden, o.monto_total, o.moneda, o.requerimiento_id, o.proveedor_id AS orden_proveedor_id,
      o.recibido_proveedor_at, o.version AS orden_version, o.cronograma_version
    FROM orden_envios_proveedor e
    JOIN ordenes_contratacion o ON o.id = e.orden_id
    WHERE e.token_hash = $1
    ORDER BY e.id DESC
    LIMIT 1
  `, [th]);
  return rows[0] || null;
}

export async function getOrdenPortalPorToken(token) {
  const envio = await resolverEnvioPorToken(token);
  if (!envio) throw httpError('Enlace de orden inválido o expirado', 404, 'TOKEN_INVALIDO');

  const detalle = await getDetalleOrden(envio.orden_id);
  if (Number(detalle.orden.proveedor_id) !== Number(envio.proveedor_id)) {
    throw httpError('Acceso denegado', 403);
  }

  const doc = await getDocumentoActivo(envio.orden_id, 'ORDEN_FIRMADA');
  return {
    token_valido: true,
    envio: {
      id: envio.id,
      enviado_at: envio.enviado_at,
      documento_version: envio.documento_version,
      cronograma_version: envio.cronograma_version,
      confirmado_at: envio.confirmado_at,
      estado: envio.estado,
    },
    orden: {
      id: detalle.orden.id,
      tipo_orden: detalle.orden.tipo_orden,
      numero_orden: detalle.orden.numero_orden,
      anio_orden: detalle.orden.anio_orden,
      fecha_orden: detalle.orden.fecha_orden,
      monto_total: detalle.orden.monto_total,
      moneda: detalle.orden.moneda,
      estado: detalle.orden.estado,
      recibido_proveedor_at: detalle.orden.recibido_proveedor_at,
    },
    contexto: {
      requerimiento_codigo: detalle.contexto.requerimiento_codigo,
      denominacion: detalle.contexto.denominacion,
      codigo_ccp: detalle.contexto.codigo_ccp,
      tipo_contratacion: detalle.contexto.tipo_contratacion,
      proveedor_ruc: detalle.contexto.proveedor_ruc,
      proveedor_razon_social: detalle.contexto.proveedor_razon_social,
      centro: detalle.contexto.centro,
    },
    items: detalle.items,
    entregas: detalle.entregas.map((e) => ({
      numero_entrega: e.numero_entrega,
      tipo_entrega: e.tipo_entrega,
      descripcion: e.descripcion,
      dias_plazo: e.dias_plazo,
      tipo_dias: e.tipo_dias,
      fecha_maxima: e.fecha_maxima,
      importe: e.importe,
    })),
    documento: doc ? {
      id: doc.id,
      nombre_archivo: doc.nombre_archivo,
      version: doc.version,
      mime_type: doc.mime_type,
    } : null,
    puede_confirmar: !detalle.orden.recibido_proveedor_at
      && ['ORDEN_NOTIFICADA', 'ORDEN_ENVIADA', 'ORDEN_ENVIADA_PENDIENTE_CONFIRMACION']
        .includes(String(detalle.orden.estado).toUpperCase()),
  };
}

/**
 * Valida que una orden esté en un estado que permita confirmar recepción.
 * Compartida por confirmarRecepcionOrden (token) y confirmarRecepcionDesdeSesion.
 */
export function assertOrdenPendienteConfirmacion(orden) {
  if (!['ORDEN_NOTIFICADA', 'ORDEN_ENVIADA', 'ORDEN_ENVIADA_PENDIENTE_CONFIRMACION']
    .includes(String(orden?.estado || '').toUpperCase())
    && normalizeEstadoOrden(orden?.estado) !== 'ORDEN_NOTIFICADA') {
    throw httpError('La orden no está pendiente de confirmación', 409);
  }
}

export async function confirmarRecepcionOrden(token, meta = {}) {
  const envio = await resolverEnvioPorToken(token);
  if (!envio) throw httpError('Enlace de orden inválido', 404, 'TOKEN_INVALIDO');

  const orden = await getOrdenById(envio.orden_id);

  // Idempotente
  if (orden.recibido_proveedor_at || envio.confirmado_at) {
    const entregas = await listarEntregas(orden.id);
    return {
      ok: true,
      idempotent: true,
      recibido_proveedor_at: orden.recibido_proveedor_at || envio.confirmado_at,
      fechas_maximas: entregas.map((e) => ({
        numero_entrega: e.numero_entrega,
        fecha_maxima: e.fecha_maxima,
      })),
      estado: orden.estado,
    };
  }

  assertOrdenPendienteConfirmacion(orden);

  // RC8.14.11 — timestamp en UTC (misma convención que NOW()); evitar que el
  // driver pg serialice new Date() en hora local del servidor (America/Lima).
  const now = new Date().toISOString();
  await query(`
    UPDATE orden_envios_proveedor SET
      confirmado_at = $2,
      confirmado_ip = $3,
      confirmado_user_agent = $4,
      estado = 'CONFIRMADO'
    WHERE id = $1
  `, [
    envio.id,
    now,
    String(meta.ip || '').slice(0, 80) || null,
    String(meta.userAgent || '').slice(0, 500) || null,
  ]);

  await query(`
    UPDATE ordenes_contratacion SET
      estado = $2,
      recibido_proveedor_at = $3,
      actualizado_at = NOW()
    WHERE id = $1
  `, [orden.id, ESTADOS_ORDEN.ORDEN_RECEPCION_CONFIRMADA, now]);

  const fechas = await recalcularFechasEntregas(orden.id);

  await registrarEventoOrden({
    ordenId: orden.id,
    requerimientoId: orden.requerimiento_id,
    tipo: 'ORDEN_RECEPCION_CONFIRMADA',
    estadoAnterior: orden.estado,
    estadoNuevo: ESTADOS_ORDEN.ORDEN_RECEPCION_CONFIRMADA,
    usuario: `proveedor:${orden.proveedor_id}`,
    rol: 'proveedor',
    datos: {
      envio_id: envio.id,
      ip: meta.ip || null,
      user_agent: meta.userAgent || null,
      documento_version: envio.documento_version,
      cronograma_version: envio.cronograma_version,
      fechas,
    },
  });

  return {
    ok: true,
    idempotent: false,
    recibido_proveedor_at: now,
    fechas_maximas: fechas,
    estado: ESTADOS_ORDEN.ORDEN_RECEPCION_CONFIRMADA,
  };
}

export async function listarOrdenesPortalProveedor(proveedorId) {
  const { rows } = await query(`
    SELECT o.id, o.tipo_orden, o.numero_orden, o.anio_orden, o.fecha_orden,
      o.monto_total, o.moneda, o.estado, o.enviado_proveedor_at, o.recibido_proveedor_at,
      r.codigo AS requerimiento_codigo, r.denominacion,
      cod.codigo_ccp,
      e.id AS ultimo_envio_id, e.url_acceso, e.enviado_at AS envio_at
    FROM ordenes_contratacion o
    JOIN requerimientos r ON r.id = o.requerimiento_id
    LEFT JOIN LATERAL (
      SELECT c.codigo_ccp FROM ccp_codigos c
      WHERE c.requerimiento_id = r.id AND c.estado = 'ACTIVO'
      ORDER BY c.id DESC LIMIT 1
    ) cod ON TRUE
    LEFT JOIN LATERAL (
      SELECT * FROM orden_envios_proveedor ep
      WHERE ep.orden_id = o.id
      ORDER BY ep.id DESC LIMIT 1
    ) e ON TRUE
    WHERE o.proveedor_id = $1
      AND o.estado IN (
        'ORDEN_ENVIADA', 'ORDEN_ENVIADA_PENDIENTE_CONFIRMACION', 'ORDEN_NOTIFICADA',
        'ORDEN_RECEPCION_CONFIRMADA', 'ORDEN_EN_EJECUCION', 'DERIVADO_EJECUCION', 'EN_EJECUCION'
      )
    ORDER BY COALESCE(o.enviado_proveedor_at, o.creado_at) DESC
  `, [proveedorId]);
  return rows;
}

export async function getOrdenPortalParaProveedor(ordenId, proveedorId) {
  const orden = await getOrdenById(ordenId);
  if (Number(orden.proveedor_id) !== Number(proveedorId)) {
    throw httpError('No autorizado para esta orden', 403);
  }
  const detalle = await getDetalleOrden(ordenId);
  const doc = await getDocumentoActivo(ordenId, 'ORDEN_FIRMADA');
  return {
    orden: detalle.orden,
    contexto: detalle.contexto,
    items: detalle.items,
    entregas: detalle.entregas,
    documento: doc ? {
      id: doc.id,
      nombre_archivo: doc.nombre_archivo,
      version: doc.version,
    } : null,
    puede_confirmar: !orden.recibido_proveedor_at
      && [
        ESTADOS_ORDEN.ORDEN_ENVIADA,
        ESTADOS_ORDEN.ORDEN_ENVIADA_PENDIENTE_CONFIRMACION,
        ESTADOS_ORDEN.ORDEN_NOTIFICADA,
      ].includes(orden.estado),
  };
}

export async function descargarDocumentoPortal(ordenId, proveedorId, documentoId) {
  const orden = await getOrdenById(ordenId);
  if (Number(orden.proveedor_id) !== Number(proveedorId)) {
    throw httpError('No autorizado', 403);
  }
  const { rows } = await query(`
    SELECT id, nombre_archivo, mime_type, contenido_base64, version
    FROM orden_documentos
    WHERE orden_id = $1 AND id = $2 AND activo = TRUE
  `, [ordenId, documentoId]);
  if (!rows.length) throw httpError('Documento no encontrado', 404);
  return rows[0];
}

export async function confirmarRecepcionDesdeSesion(ordenId, proveedorId, meta = {}) {
  const { rows } = await query(`
    SELECT * FROM orden_envios_proveedor
    WHERE orden_id = $1 AND proveedor_id = $2
    ORDER BY id DESC LIMIT 1
  `, [ordenId, proveedorId]);
  if (!rows.length) throw httpError('No hay envío registrado para confirmar', 404);

  // Usar token hash path recreando confirmación directa (sin token plain)
  const envio = rows[0];
  const orden = await getOrdenById(ordenId);
  if (Number(orden.proveedor_id) !== Number(proveedorId)) throw httpError('No autorizado', 403);

  if (orden.recibido_proveedor_at || envio.confirmado_at) {
    const entregas = await listarEntregas(ordenId);
    return {
      ok: true,
      idempotent: true,
      recibido_proveedor_at: orden.recibido_proveedor_at || envio.confirmado_at,
      fechas_maximas: entregas.map((e) => ({ numero_entrega: e.numero_entrega, fecha_maxima: e.fecha_maxima })),
      estado: orden.estado,
    };
  }

  // RC8.14.10 — validar estado solo para una NUEVA confirmación (después de la
  // idempotencia, para no bloquear una orden ya en ORDEN_RECEPCION_CONFIRMADA).
  assertOrdenPendienteConfirmacion(orden);

  // RC8.14.11 — timestamp en UTC (misma convención que NOW()).
  const now = new Date().toISOString();
  await query(`
    UPDATE orden_envios_proveedor SET
      confirmado_at = $2, confirmado_ip = $3, confirmado_user_agent = $4, estado = 'CONFIRMADO'
    WHERE id = $1
  `, [envio.id, now, String(meta.ip || '').slice(0, 80) || null, String(meta.userAgent || '').slice(0, 500) || null]);

  await query(`
    UPDATE ordenes_contratacion SET
      estado = $2, recibido_proveedor_at = $3, actualizado_at = NOW()
    WHERE id = $1
  `, [ordenId, ESTADOS_ORDEN.ORDEN_RECEPCION_CONFIRMADA, now]);

  const fechas = await recalcularFechasEntregas(ordenId);
  await registrarEventoOrden({
    ordenId,
    requerimientoId: orden.requerimiento_id,
    tipo: 'ORDEN_RECEPCION_CONFIRMADA',
    estadoAnterior: orden.estado,
    estadoNuevo: ESTADOS_ORDEN.ORDEN_RECEPCION_CONFIRMADA,
    usuario: `proveedor:${proveedorId}`,
    rol: 'proveedor',
    datos: { envio_id: envio.id, via: 'sesion_portal', fechas },
  });

  return {
    ok: true,
    idempotent: false,
    recibido_proveedor_at: now,
    fechas_maximas: fechas,
    estado: ESTADOS_ORDEN.ORDEN_RECEPCION_CONFIRMADA,
  };
}

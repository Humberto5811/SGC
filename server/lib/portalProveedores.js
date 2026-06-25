// Portal de Proveedores — autenticación e interacción (separado del SGC interno)
import bcrypt from 'bcrypt';
import { query } from '../db.js';
import { registrarTrazaPortal } from './invitaciones.js';
import { getPortalAccountByRuc, getInvitacionByToken, marcarPasswordCambiada } from './proveedorPortal.js';

function clientIp(req) {
  return String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '').split(',')[0].trim();
}

export async function portalLogin(ruc, password, req) {
  const rucNorm = String(ruc || '').replace(/\D/g, '').slice(0, 11);
  if (!rucNorm || !password) throw new Error('RUC y contraseña requeridos');

  const row = await getPortalAccountByRuc(rucNorm);
  if (!row?.password_hash) throw new Error('Credenciales inválidas');

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) throw new Error('Credenciales inválidas');

  const ip = clientIp(req);
  await query(`
    UPDATE proveedor_portal SET updated_at = NOW() WHERE proveedor_id = $1
  `, [row.proveedor_id]);
  await query(`
    UPDATE proveedor_acceso SET ultimo_acceso = NOW(), ultimo_ip = $2, updated_at = NOW()
    WHERE proveedor_id = $1
  `, [row.proveedor_id, ip]);

  await registrarTrazaPortal({
    proveedor_id: row.proveedor_id,
    evento: 'PORTAL_ACCESO',
    detalle: `Ingreso portal RUC ${rucNorm}`,
    usuario: rucNorm,
    ip,
  });

  return {
    id: row.proveedor_id,
    portal_id: row.id,
    ruc: row.ruc,
    razon_social: row.razon_social,
    telefono: row.telefono,
    correo: row.correo,
    emails: row.emails,
    usuarioPortal: row.usuario_portal,
    debeCambiarPassword: row.primer_ingreso !== false,
    primerIngreso: row.primer_ingreso !== false,
  };
}

export async function portalChangePassword(proveedorId, { actual, nueva }) {
  if (!nueva || String(nueva).length < 6) throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
  const { rows } = await query('SELECT * FROM proveedor_portal WHERE proveedor_id = $1', [proveedorId]);
  if (!rows.length) throw new Error('Acceso no encontrado');
  const acc = rows[0];
  if (acc.password_hash) {
    const ok = await bcrypt.compare(actual || '', acc.password_hash);
    if (!ok) throw new Error('Contraseña actual incorrecta');
  }
  const hash = await bcrypt.hash(nueva, 10);
  await marcarPasswordCambiada(proveedorId, hash);
  await query(`
    UPDATE proveedor_acceso SET password_hash = $2, debe_cambiar_password = FALSE,
      clave_temporal = NULL, clave_temporal_expira = NULL, updated_at = NOW()
    WHERE proveedor_id = $1
  `, [proveedorId, hash]);
  return { success: true };
}

export async function resolverInvitacionToken(token) {
  const inv = await getInvitacionByToken(token);
  if (!inv) throw new Error('Enlace de invitación inválido o expirado');
  return {
    token,
    ruc: inv.ruc,
    razon_social: inv.razon_social,
    solicitud_codigo: inv.solicitud_codigo,
    solicitud_id: inv.solicitud_id,
    estado_invitacion: inv.estado_invitacion || inv.estado,
    url_invitacion: inv.url_invitacion,
    login_url: '#/proveedor/login',
  };
}

async function getProveedorFromHeader(proveedorId) {
  const { rows } = await query('SELECT * FROM proveedores WHERE id = $1 AND activo = TRUE', [proveedorId]);
  return rows[0] || null;
}

export async function requirePortalProveedor(req, res, next) {
  const proveedorId = parseInt(req.headers['x-portal-proveedor-id'] || '', 10);
  if (!proveedorId) return res.status(401).json({ error: 'No autenticado en portal' });
  try {
    const prov = await getProveedorFromHeader(proveedorId);
    if (!prov) return res.status(401).json({ error: 'Sesión de portal inválida' });
    req.portalProveedor = prov;
    next();
  } catch (err) { next(err); }
}

function convocatoriaCerrada(solicitud) {
  if (!solicitud?.cotizaciones_fin) return false;
  if (String(solicitud.estado || '').toUpperCase() === 'CERRADA') return true;
  return new Date() > new Date(solicitud.cotizaciones_fin);
}

export async function listMisInvitaciones(proveedorId) {
  const { rows } = await query(`
    SELECT ip.*, sc.codigo, sc.objeto, sc.denominacion, sc.estado AS solicitud_estado,
      sc.consultas_inicio, sc.consultas_fin, sc.cotizaciones_inicio, sc.cotizaciones_fin,
      sc.docs_solicitados, sc.requisitos_tecnicos, sc.lugar_entrega,
      ip.url_invitacion, ip.token_acceso, ip.estado_invitacion, ip.fecha_ultimo_envio
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.proveedor_id = $1 AND ip.estado IN ('ENVIADA', 'ABIERTA', 'PARTICIPANDO', 'COTIZACION_PRESENTADA')
    ORDER BY sc.cotizaciones_fin ASC NULLS LAST
  `, [proveedorId]);
  return rows.map((r) => ({
    ...r,
    convocatoria_cerrada: convocatoriaCerrada(r),
  }));
}

export async function getDocumentosConvocatoria(proveedorId, solicitudId) {
  const { getSolicitudDetalleProveedor } = await import('./portalDocumentos.js');
  const det = await getSolicitudDetalleProveedor(proveedorId, solicitudId);
  return {
    codigo: det.solicitud.codigo,
    objeto: det.solicitud.objeto,
    docs_convocatoria: det.solicitud.docs_solicitados,
    documentos: det.documentos,
  };
}

export async function registrarConsulta(proveedorId, body, req) {
  const { solicitud_id, asunto, consulta, adjuntos } = body || {};
  if (!solicitud_id || !consulta) throw new Error('Solicitud y consulta requeridos');

  const { rows: inv } = await query(`
    SELECT ip.*, sc.consultas_fin, sc.estado AS solicitud_estado
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.proveedor_id = $1 AND ip.solicitud_id = $2
  `, [proveedorId, solicitud_id]);
  if (!inv.length) throw new Error('Sin acceso a esta convocatoria');
  if (convocatoriaCerrada(inv[0])) throw new Error('Convocatoria cerrada — no se aceptan consultas');

  const { rows } = await query(`
    INSERT INTO consultas_proveedor (solicitud_id, proveedor_id, requerimiento_id, asunto, consulta, adjuntos, estado, responsable_actual)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'PENDIENTE', 'Analista CM')
    RETURNING *
  `, [
    solicitud_id, proveedorId, inv[0].requerimiento_id,
    asunto || 'Consulta', consulta,
    JSON.stringify(adjuntos || []),
  ]);

  await registrarTrazaPortal({
    solicitud_id, proveedor_id: proveedorId, requerimiento_id: inv[0].requerimiento_id,
    evento: 'CONSULTA_REGISTRADA', detalle: asunto || consulta.slice(0, 120),
    usuario: req.portalProveedor?.ruc, ip: clientIp(req),
  });

  return rows[0];
}

export async function listConsultasProveedor(proveedorId, solicitudId) {
  const { rows } = await query(`
    SELECT c.* FROM consultas_proveedor c
    WHERE c.proveedor_id = $1 AND ($2::int IS NULL OR c.solicitud_id = $2)
    ORDER BY c.created_at DESC
  `, [proveedorId, solicitudId || null]);
  return rows;
}

export async function listAbsolucionesPublicas(solicitudId) {
  const { rows } = await query(`
    SELECT c.id, c.asunto, c.consulta, c.respuesta, c.respuesta_adjuntos, c.updated_at, c.created_at
    FROM consultas_proveedor c
    WHERE c.solicitud_id = $1 AND c.absolucion_publica = TRUE AND c.estado = 'RESPONDIDA'
    ORDER BY c.updated_at DESC
  `, [solicitudId]);
  return rows;
}

export async function registrarObservacion(proveedorId, body, req) {
  const { solicitud_id, asunto, observacion, adjuntos } = body || {};
  if (!solicitud_id || !observacion) throw new Error('Solicitud y observación requeridos');

  const { rows: inv } = await query(`
    SELECT ip.*, sc.cotizaciones_fin, sc.estado AS solicitud_estado
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.proveedor_id = $1 AND ip.solicitud_id = $2
  `, [proveedorId, solicitud_id]);
  if (!inv.length) throw new Error('Sin acceso');
  if (convocatoriaCerrada(inv[0])) throw new Error('Convocatoria cerrada');

  const { rows } = await query(`
    INSERT INTO observaciones_proveedor (solicitud_id, proveedor_id, requerimiento_id, asunto, observacion, adjuntos, estado, responsable_actual)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'PENDIENTE', 'Analista CM')
    RETURNING *
  `, [solicitud_id, proveedorId, inv[0].requerimiento_id, asunto || 'Observación', observacion, JSON.stringify(adjuntos || [])]);

  await registrarTrazaPortal({
    solicitud_id, proveedor_id: proveedorId, requerimiento_id: inv[0].requerimiento_id,
    evento: 'OBSERVACION_REGISTRADA', detalle: asunto || observacion.slice(0, 120),
    usuario: req.portalProveedor?.ruc, ip: clientIp(req),
  });

  return rows[0];
}

export async function presentarCotizacion(proveedorId, body, req) {
  const { solicitud_id, propuesta_tecnica, propuesta_economica, anexos, certificados } = body || {};
  if (!solicitud_id) throw new Error('Solicitud requerida');
  if (!propuesta_tecnica || !propuesta_economica) throw new Error('Propuesta técnica y económica obligatorias');

  const { rows: inv } = await query(`
    SELECT ip.*, sc.cotizaciones_fin, sc.estado AS solicitud_estado, sc.docs_solicitados
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.proveedor_id = $1 AND ip.solicitud_id = $2
  `, [proveedorId, solicitud_id]);
  if (!inv.length) throw new Error('Sin acceso');
  if (convocatoriaCerrada(inv[0])) throw new Error('Plazo vencido — no se aceptan cotizaciones');

  const { rows } = await query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, estado, propuesta_tecnica, propuesta_economica,
      anexos, certificados, fecha_presentacion
    ) VALUES ($1, $2, $3, 'COTIZACION_PRESENTADA', $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, NOW())
    ON CONFLICT (solicitud_id, proveedor_id) DO UPDATE SET
      estado = 'COTIZACION_PRESENTADA',
      propuesta_tecnica = EXCLUDED.propuesta_tecnica,
      propuesta_economica = EXCLUDED.propuesta_economica,
      anexos = EXCLUDED.anexos,
      certificados = EXCLUDED.certificados,
      fecha_presentacion = NOW(),
      updated_at = NOW()
    RETURNING *
  `, [
    solicitud_id, proveedorId, inv[0].requerimiento_id,
    JSON.stringify(propuesta_tecnica), JSON.stringify(propuesta_economica),
    JSON.stringify(anexos || []), JSON.stringify(certificados || []),
  ]);

  await query(`UPDATE invitacion_proveedores SET estado = 'COTIZACION_PRESENTADA', updated_at = NOW()
    WHERE proveedor_id = $1 AND solicitud_id = $2`, [proveedorId, solicitud_id]);

  await registrarTrazaPortal({
    solicitud_id, proveedor_id: proveedorId, requerimiento_id: inv[0].requerimiento_id,
    evento: 'COTIZACION_PRESENTADA', detalle: 'Cotización presentada en portal',
    usuario: req.portalProveedor?.ruc, ip: clientIp(req),
  });

  return rows[0];
}

/** Guarda borrador sin presentar cotización final */
export async function guardarBorradorCotizacion(proveedorId, body, req) {
  const { solicitud_id, propuesta_tecnica, propuesta_economica, anexos } = body || {};
  if (!solicitud_id) throw new Error('Solicitud requerida');

  const { rows: inv } = await query(`
    SELECT ip.*, sc.cotizaciones_fin, sc.estado AS solicitud_estado
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.proveedor_id = $1 AND ip.solicitud_id = $2
  `, [proveedorId, solicitud_id]);
  if (!inv.length) throw new Error('Sin acceso');
  if (convocatoriaCerrada(inv[0])) throw new Error('Convocatoria cerrada');

  const { rows } = await query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, estado, propuesta_tecnica, propuesta_economica,
      anexos, certificados
    ) VALUES ($1, $2, $3, 'BORRADOR', $4::jsonb, $5::jsonb, $6::jsonb, '[]'::jsonb)
    ON CONFLICT (solicitud_id, proveedor_id) DO UPDATE SET
      propuesta_tecnica = EXCLUDED.propuesta_tecnica,
      propuesta_economica = EXCLUDED.propuesta_economica,
      anexos = EXCLUDED.anexos,
      updated_at = NOW()
    RETURNING *
  `, [
    solicitud_id, proveedorId, inv[0].requerimiento_id,
    JSON.stringify(propuesta_tecnica || {}), JSON.stringify(propuesta_economica || {}),
    JSON.stringify(anexos || []),
  ]);

  return rows[0];
}

export async function listMisCotizaciones(proveedorId) {
  const { rows } = await query(`
    SELECT cot.*, sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto,
      ip.estado AS estado_invitacion
    FROM cotizaciones_proveedor cot
    JOIN solicitudes_cotizacion sc ON sc.id = cot.solicitud_id
    LEFT JOIN invitacion_proveedores ip ON ip.solicitud_id = cot.solicitud_id AND ip.proveedor_id = cot.proveedor_id
    WHERE cot.proveedor_id = $1
    ORDER BY cot.fecha_presentacion DESC NULLS LAST, cot.created_at DESC
  `, [proveedorId]);
  return rows;
}

export async function getEstadoParticipacion(proveedorId) {
  const { rows: invitaciones } = await query(`
    SELECT ip.estado, ip.estado_invitacion, ip.fecha_envio, ip.fecha_ultimo_envio,
      sc.id AS solicitud_id, sc.codigo, sc.denominacion, sc.cotizaciones_fin,
      cot.estado AS cotizacion_estado, cot.validacion_estado, cot.fecha_presentacion,
      cot.created_at AS cotizacion_created_at
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    LEFT JOIN cotizaciones_proveedor cot ON cot.solicitud_id = sc.id AND cot.proveedor_id = ip.proveedor_id
    WHERE ip.proveedor_id = $1
    ORDER BY ip.updated_at DESC
  `, [proveedorId]);

  const { rows: stats } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE ip.estado IN ('ENVIADA','ABIERTA','PARTICIPANDO'))::int AS invitaciones_activas,
      COUNT(*)::int AS total_invitaciones,
      (SELECT COUNT(*)::int FROM consultas_proveedor c WHERE c.proveedor_id = $1) AS consultas_realizadas,
      (SELECT COUNT(*)::int FROM consultas_proveedor c WHERE c.proveedor_id = $1 AND c.estado = 'RESPONDIDA') AS consultas_respondidas,
      (SELECT COUNT(*)::int FROM cotizaciones_proveedor cot WHERE cot.proveedor_id = $1) AS cotizaciones_enviadas
    FROM invitacion_proveedores ip
    WHERE ip.proveedor_id = $1
  `, [proveedorId]);

  return {
    resumen: stats[0] || {},
    invitaciones,
  };
}

// --- Bandejas analista CM ---

export async function listarConsultasBandeja(queryParams = {}) {
  const estado = queryParams.estado || '';
  const params = [];
  let where = 'WHERE 1=1';
  if (estado) {
    params.push(estado);
    where += ` AND c.estado = $${params.length}`;
  }
  const { rows } = await query(`
    SELECT c.*, p.ruc, p.razon_social, sc.codigo AS solicitud_codigo
    FROM consultas_proveedor c
    JOIN proveedores p ON p.id = c.proveedor_id
    JOIN solicitudes_cotizacion sc ON sc.id = c.solicitud_id
    ${where}
    ORDER BY c.created_at DESC
    LIMIT 500
  `, params);
  return rows;
}

export async function responderConsultaAnalista(consultaId, body, usuario) {
  const { respuesta, adjuntos, publicar } = body || {};
  if (!respuesta) throw new Error('Respuesta requerida');
  const { rows } = await query(`
    UPDATE consultas_proveedor SET
      respuesta = $2, respuesta_adjuntos = $3::jsonb,
      estado = 'RESPONDIDA', absolucion_publica = $4,
      historial = historial || $5::jsonb, updated_at = NOW()
    WHERE id = $1 RETURNING *
  `, [
    consultaId, respuesta, JSON.stringify(adjuntos || []), !!publicar,
    JSON.stringify([{ tipo: 'respuesta_analista', usuario, fecha: new Date().toISOString(), publicar: !!publicar }]),
  ]);
  if (!rows.length) throw new Error('Consulta no encontrada');
  const c = rows[0];
  await registrarTrazaPortal({
    solicitud_id: c.solicitud_id, proveedor_id: c.proveedor_id, requerimiento_id: c.requerimiento_id,
    evento: publicar ? 'ABSOLUCION_PUBLICADA' : 'CONSULTA_RESPONDIDA',
    detalle: respuesta.slice(0, 200), usuario,
  });
  return c;
}

export async function listarValidacionesBandeja() {
  const { rows } = await query(`
    SELECT cot.*, p.ruc, p.razon_social, sc.codigo AS solicitud_codigo
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    JOIN solicitudes_cotizacion sc ON sc.id = cot.solicitud_id
    WHERE cot.estado = 'COTIZACION_PRESENTADA'
    ORDER BY cot.fecha_presentacion DESC
  `);
  return rows;
}

export async function validarCotizacion(cotizacionId, body, usuario) {
  const { resultado, observacion, informe } = body || {};
  const map = { CONFORME: 'APTO', 'NO CONFORME': 'NO_APTO', 'REQUIERE ACLARACION': 'OBSERVADO' };
  const estado = map[String(resultado || '').toUpperCase()] || String(resultado || '').toUpperCase();
  if (!['APTO', 'NO_APTO', 'OBSERVADO'].includes(estado)) throw new Error('Resultado inválido');
  if (!observacion) throw new Error('Observación obligatoria');

  const { rows } = await query(`
    UPDATE cotizaciones_proveedor SET
      validacion_estado = $2, validacion_observacion = $3,
      validacion_informe = $4::jsonb, validacion_responsable = $5,
      historial = historial || $6::jsonb, updated_at = NOW()
    WHERE id = $1 RETURNING *
  `, [
    cotizacionId, estado, observacion,
    JSON.stringify(informe || {}), usuario,
    JSON.stringify([{ tipo: 'validacion', resultado: estado, usuario, fecha: new Date().toISOString() }]),
  ]);
  if (!rows.length) throw new Error('Cotización no encontrada');
  const cot = rows[0];

  await registrarTrazaPortal({
    solicitud_id: cot.solicitud_id, proveedor_id: cot.proveedor_id, requerimiento_id: cot.requerimiento_id,
    evento: estado === 'APTO' ? 'COTIZACION_APROBADA' : estado === 'OBSERVADO' ? 'COTIZACION_OBSERVADA' : 'COTIZACION_VALIDADA',
    detalle: observacion.slice(0, 200), usuario,
  });

  if (estado === 'APTO') {
    await query(`
      UPDATE solicitudes_cotizacion SET estado = 'EN_CUADRO_COMPARATIVO', updated_at = NOW()
      WHERE id = $1 AND estado NOT IN ('CERRADA')
    `, [cot.solicitud_id]);
  }

  return cot;
}

export async function ampliarPlazo(solicitudId, body, usuario) {
  const { nueva_fecha, motivo, campo = 'cotizaciones_fin' } = body || {};
  if (!nueva_fecha || !motivo) throw new Error('Nueva fecha y motivo requeridos');
  const col = campo === 'consultas_fin' ? 'consultas_fin' : 'cotizaciones_fin';

  await query(`
    INSERT INTO ampliaciones_plazo (solicitud_id, campo, nueva_fecha, motivo, usuario)
    VALUES ($1, $2, $3, $4, $5)
  `, [solicitudId, col, nueva_fecha, motivo, usuario]);

  if (col === 'consultas_fin') {
    await query('UPDATE solicitudes_cotizacion SET consultas_fin = $2, updated_at = NOW() WHERE id = $1', [solicitudId, nueva_fecha]);
  } else {
    await query('UPDATE solicitudes_cotizacion SET cotizaciones_fin = $2, updated_at = NOW() WHERE id = $1', [solicitudId, nueva_fecha]);
  }

  const { rows: provs } = await query(`
    SELECT p.emails, ip.correos FROM invitacion_proveedores ip
    JOIN proveedores p ON p.id = ip.proveedor_id WHERE ip.solicitud_id = $1
  `, [solicitudId]);

  await registrarTrazaPortal({
    solicitud_id: solicitudId, evento: 'AMPLIACION_PLAZO',
    detalle: `${campo}: ${motivo}`, usuario,
  });

  const { enviarNotificacionAmpliacionPlazo } = await import('./emailService.js');
  const sol = (await query('SELECT * FROM solicitudes_cotizacion WHERE id = $1', [solicitudId])).rows[0];
  await enviarNotificacionAmpliacionPlazo({ solicitud: sol, proveedores: provs, motivo, nuevaFecha: nueva_fecha });

  return { success: true, solicitud: sol };
}

// Portal de Proveedores — autenticación e interacción (separado del SGC interno)
import bcrypt from 'bcrypt';
import { query } from '../db.js';
import { registrarTrazaPortal } from './invitaciones.js';
import {
  CRONOGRAMA_SELECT_SQL, normalizeCronogramaRow, isConvocatoriaCerrada,
  INVITACION_VIGENTE_ORDER_SQL,
} from './cronogramaDatetime.js';
import { syncRequerimientosSolicitudWorkflow } from './cotizacionWorkflowSync.js';
import { getPortalAccountByRuc, getInvitacionByToken, marcarPasswordCambiada } from './proveedorPortal.js';
import { sincronizarProveedorDesdePortal } from './proveedoresMaestro.js';
import { prepareCotizacionPortalBody } from './portalCotizacionAdjuntos.js';
import { enrichEstadoResponsableForBandeja } from './enrichEstadoResponsable.js';

function clientIp(req) {
  return String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '').split(',')[0].trim();
}

function convocatoriaCerrada(row, now) {
  return isConvocatoriaCerrada({
    cotizaciones_fin: row?.cotizaciones_fin,
    solicitud_estado: row?.solicitud_estado,
    // Preferir estado de solicitud; no usar estado de invitación (ENVIADA, etc.)
    estado: row?.solicitud_estado || (String(row?.estado || '').toUpperCase() === 'CERRADA' ? row.estado : ''),
  }, now);
}

/** Carga la invitación vigente + plazo actual de la solicitud. */
async function loadInvitacionVigente(proveedorId, solicitudId) {
  const { rows } = await query(`
    SELECT ip.*, sc.cotizaciones_fin, sc.consultas_fin, sc.estado AS solicitud_estado, sc.docs_solicitados
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.proveedor_id = $1 AND ip.solicitud_id = $2
    ORDER BY ${INVITACION_VIGENTE_ORDER_SQL}
    LIMIT 1
  `, [proveedorId, solicitudId]);
  return rows[0] ? normalizeCronogramaRow(rows[0]) : null;
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

export async function listMisInvitaciones(proveedorId) {
  const { rows } = await query(`
    SELECT DISTINCT ON (ip.solicitud_id)
      ip.id AS invitacion_id,
      ip.solicitud_id, ip.proveedor_id, ip.requerimiento_id, ip.estado, ip.estado_invitacion,
      ip.nro_invitacion, ip.fecha_envio, ip.fecha_ultimo_envio,
      ip.url_invitacion, ip.token_acceso, ip.correos, ip.historial,
      sc.codigo, sc.objeto, sc.denominacion, sc.estado AS solicitud_estado, sc.tipo,
      ${CRONOGRAMA_SELECT_SQL},
      sc.docs_solicitados, sc.requisitos_tecnicos, sc.lugar_entrega
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.proveedor_id = $1
      AND UPPER(COALESCE(ip.estado, '')) IN ('ENVIADA', 'ENVIADO', 'ABIERTA', 'PARTICIPANDO', 'COTIZACION_PRESENTADA')
      AND UPPER(COALESCE(sc.estado, '')) NOT IN ('ANULADA', 'ANULADO')
    ORDER BY ip.solicitud_id, ${INVITACION_VIGENTE_ORDER_SQL}
  `, [proveedorId]);
  return rows.map((r) => {
    const norm = normalizeCronogramaRow(r);
    const cerrada = convocatoriaCerrada(norm);
    return {
      ...norm,
      id: r.invitacion_id,
      convocatoria_cerrada: cerrada,
    };
  }).sort((a, b) => String(a.cotizaciones_fin || '').localeCompare(String(b.cotizaciones_fin || '')));
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
    SELECT ip.*, sc.consultas_fin, sc.estado AS solicitud_estado, sc.cotizaciones_fin
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.proveedor_id = $1 AND ip.solicitud_id = $2
    ORDER BY ${INVITACION_VIGENTE_ORDER_SQL}
    LIMIT 1
  `, [proveedorId, solicitud_id]);
  if (!inv.length) throw new Error('Sin acceso a esta convocatoria');
  if (convocatoriaCerrada(normalizeCronogramaRow(inv[0]))) throw new Error('Convocatoria cerrada — no se aceptan consultas');

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

  const { rows: enriched } = await query(`
    SELECT c.*, sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto
    FROM consultas_proveedor c
    LEFT JOIN solicitudes_cotizacion sc ON sc.id = c.solicitud_id
    WHERE c.id = $1
  `, [rows[0].id]);
  return enriched[0] || rows[0];
}

export async function listConsultasProveedor(proveedorId, solicitudId) {
  const { rows } = await query(`
    SELECT c.*, sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto
    FROM consultas_proveedor c
    LEFT JOIN solicitudes_cotizacion sc ON sc.id = c.solicitud_id
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

  const invRow = await loadInvitacionVigente(proveedorId, solicitud_id);
  if (!invRow) throw new Error('Sin acceso');
  if (convocatoriaCerrada(invRow)) throw new Error('Convocatoria cerrada');

  const { rows } = await query(`
    INSERT INTO observaciones_proveedor (solicitud_id, proveedor_id, requerimiento_id, asunto, observacion, adjuntos, estado, responsable_actual)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'PENDIENTE', 'Analista CM')
    RETURNING *
  `, [solicitud_id, proveedorId, invRow.requerimiento_id, asunto || 'Observación', observacion, JSON.stringify(adjuntos || [])]);

  await registrarTrazaPortal({
    solicitud_id, proveedor_id: proveedorId, requerimiento_id: invRow.requerimiento_id,
    evento: 'OBSERVACION_REGISTRADA', detalle: asunto || observacion.slice(0, 120),
    usuario: req.portalProveedor?.ruc, ip: clientIp(req),
  });

  return rows[0];
}

export async function presentarCotizacion(proveedorId, body, req) {
  let light;
  try {
    light = prepareCotizacionPortalBody(body);
  } catch (e) {
    if (e.code === 'PORTAL_PAYLOAD_BINARY' || e.code === 'PORTAL_PAYLOAD_TOO_LARGE') {
      e.status = 400;
    }
    throw e;
  }
  const { solicitud_id, propuesta_tecnica, propuesta_economica, anexos, certificados } = light;
  if (!solicitud_id) throw new Error('Solicitud requerida');
  if (!propuesta_tecnica || !propuesta_economica) throw new Error('Propuesta técnica y económica obligatorias');

  const invRow = await loadInvitacionVigente(proveedorId, solicitud_id);
  if (!invRow) throw new Error('Sin acceso');
  if (convocatoriaCerrada(invRow)) throw new Error('Plazo vencido — no se aceptan cotizaciones');

  const prevCot = (await query(
    'SELECT estado FROM cotizaciones_proveedor WHERE solicitud_id = $1 AND proveedor_id = $2',
    [solicitud_id, proveedorId],
  )).rows[0];
  const yaPresentada = String(prevCot?.estado || '').toUpperCase() === 'COTIZACION_PRESENTADA';

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
    solicitud_id, proveedorId, invRow.requerimiento_id,
    JSON.stringify(propuesta_tecnica), JSON.stringify(propuesta_economica),
    JSON.stringify(anexos || {}), JSON.stringify(certificados || []),
  ]);

  // Vincular adjuntos portal a la cotización
  await query(`
    UPDATE cotizaciones_proveedor_adjuntos
    SET cotizacion_id = $3, updated_at = NOW()
    WHERE solicitud_id = $1 AND proveedor_id = $2
  `, [solicitud_id, proveedorId, rows[0].id]).catch(() => {});

  await query(`UPDATE invitacion_proveedores SET estado = 'COTIZACION_PRESENTADA', updated_at = NOW()
    WHERE id = $1`, [invRow.id]);

  await registrarTrazaPortal({
    solicitud_id, proveedor_id: proveedorId, requerimiento_id: invRow.requerimiento_id,
    evento: 'COTIZACION_PRESENTADA', detalle: 'Cotización presentada en portal',
    usuario: req.portalProveedor?.ruc, ip: clientIp(req),
  });

  await syncRequerimientosSolicitudWorkflow(solicitud_id, {
    etapaDestino: 'RECEPCION_COTIZACIONES',
    usuario: req.portalProveedor?.ruc || 'Portal',
    observacion: 'Cotización presentada — expediente en Recepción de Cotizaciones',
    etapaEjecutor: 'INVITACIONES',
  });

  const datosProveedor = propuesta_economica?.datos_proveedor || propuesta_economica?.datos || {};
  if (Object.keys(datosProveedor).length) {
    await sincronizarProveedorDesdePortal(proveedorId, datosProveedor, req.portalProveedor?.ruc);
    if (!yaPresentada) {
      await query(`
        UPDATE proveedores SET
          cantidad_cotizaciones = COALESCE(cantidad_cotizaciones, 0) + 1,
          ultima_cotizacion = NOW(),
          ultima_participacion = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `, [proveedorId]);
    }
  }

  return rows[0];
}

/** Guarda borrador sin presentar cotización final */
export async function guardarBorradorCotizacion(proveedorId, body, req) {
  let light;
  try {
    light = prepareCotizacionPortalBody(body);
  } catch (e) {
    if (e.code === 'PORTAL_PAYLOAD_BINARY' || e.code === 'PORTAL_PAYLOAD_TOO_LARGE') {
      e.status = 400;
    }
    throw e;
  }
  const { solicitud_id, propuesta_tecnica, propuesta_economica, anexos } = light;
  if (!solicitud_id) throw new Error('Solicitud requerida');

  const invRow = await loadInvitacionVigente(proveedorId, solicitud_id);
  if (!invRow) throw new Error('Sin acceso');
  if (convocatoriaCerrada(invRow)) throw new Error('Convocatoria cerrada');

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
    solicitud_id, proveedorId, invRow.requerimiento_id,
    JSON.stringify(propuesta_tecnica || {}), JSON.stringify(propuesta_economica || {}),
    JSON.stringify(anexos || {}),
  ]);

  await query(`
    UPDATE cotizaciones_proveedor_adjuntos
    SET cotizacion_id = $3, updated_at = NOW()
    WHERE solicitud_id = $1 AND proveedor_id = $2
  `, [solicitud_id, proveedorId, rows[0].id]).catch(() => {});

  return rows[0];
}

function labelEstadoCotizacionPortal({ cotEstado, validacionEstado, convocatoriaCerrada }) {
  const est = String(cotEstado || '').toUpperCase();
  const val = String(validacionEstado || '').toUpperCase();
  if (val === 'OBSERVADO') return 'Observada';
  if (val === 'SUBSANADO' || val === 'SUBSANADA') return 'Subsanada';
  if (est === 'COTIZACION_PRESENTADA') return 'Presentada';
  if (est === 'BORRADOR') return 'Borrador';
  if (convocatoriaCerrada) return 'Cerrada / fuera de plazo';
  return 'Disponible para cotizar';
}

/**
 * Mis Cotizaciones: fuente = invitaciones del proveedor + cotización opcional (LEFT JOIN).
 * No exige fila en cotizaciones_proveedor para listar la solicitud.
 */
export async function listMisCotizaciones(proveedorId) {
  const { rows } = await query(`
    SELECT DISTINCT ON (ip.solicitud_id)
      cot.id, ip.solicitud_id, ip.proveedor_id, ip.requerimiento_id,
      cot.propuesta_tecnica, cot.propuesta_economica, cot.anexos, cot.certificados,
      cot.validacion_estado, cot.validacion_observacion, cot.validacion_informe,
      cot.validacion_responsable, cot.historial,
      COALESCE(cot.created_at, ip.created_at) AS created_at,
      COALESCE(cot.updated_at, ip.updated_at) AS updated_at,
      cot.fecha_presentacion,
      cot.estado AS cotizacion_estado,
      sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto, sc.tipo,
      sc.estado AS solicitud_estado,
      ip.estado AS estado_invitacion,
      ip.id AS invitacion_id,
      ip.nro_invitacion,
      ip.fecha_envio,
      ${CRONOGRAMA_SELECT_SQL}
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    LEFT JOIN cotizaciones_proveedor cot
      ON cot.solicitud_id = sc.id AND cot.proveedor_id = ip.proveedor_id
    WHERE ip.proveedor_id = $1
      AND UPPER(COALESCE(ip.estado, '')) IN ('ENVIADA', 'ENVIADO', 'ABIERTA', 'PARTICIPANDO', 'COTIZACION_PRESENTADA')
      AND UPPER(COALESCE(sc.estado, '')) NOT IN ('ANULADA', 'ANULADO')
    ORDER BY ip.solicitud_id, ${INVITACION_VIGENTE_ORDER_SQL}
  `, [proveedorId]);

  return rows.map((r) => {
    const norm = normalizeCronogramaRow(r);
    const cerrada = convocatoriaCerrada(norm);
    const estadoUi = labelEstadoCotizacionPortal({
      cotEstado: r.cotizacion_estado,
      validacionEstado: r.validacion_estado,
      convocatoriaCerrada: cerrada,
    });
    return {
      ...norm,
      id: r.id || null,
      invitacion_id: r.invitacion_id,
      nro_invitacion: r.nro_invitacion ?? 1,
      fecha_envio: r.fecha_envio,
      estado: r.cotizacion_estado || (cerrada ? 'CERRADA' : 'DISPONIBLE'),
      cotizacion_estado: r.cotizacion_estado || null,
      estado_participacion: estadoUi,
      convocatoria_cerrada: cerrada,
      puede_presentar: !cerrada || String(r.cotizacion_estado || '').toUpperCase() === 'COTIZACION_PRESENTADA',
      puede_crear_borrador: !cerrada,
    };
  }).sort((a, b) => {
    const ta = a.cotizaciones_fin || a.updated_at || '';
    const tb = b.cotizaciones_fin || b.updated_at || '';
    return String(ta).localeCompare(String(tb));
  });
}

export async function getEstadoParticipacion(proveedorId) {
  const { rows: raw } = await query(`
    SELECT ip.id AS invitacion_id, ip.estado, ip.estado_invitacion, ip.fecha_envio, ip.fecha_ultimo_envio,
      ip.nro_invitacion, ip.proveedor_id,
      sc.id AS solicitud_id, sc.codigo, sc.denominacion, sc.estado AS solicitud_estado,
      to_char(sc.cotizaciones_fin, 'YYYY-MM-DD"T"HH24:MI') AS cotizaciones_fin,
      cot.estado AS cotizacion_estado, cot.validacion_estado, cot.fecha_presentacion,
      cot.created_at AS cotizacion_created_at
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    LEFT JOIN cotizaciones_proveedor cot ON cot.solicitud_id = sc.id AND cot.proveedor_id = ip.proveedor_id
    WHERE ip.proveedor_id = $1
    ORDER BY ip.solicitud_id, ${INVITACION_VIGENTE_ORDER_SQL}
  `, [proveedorId]);

  // Una fila vigente por solicitud (+ historial completo en campo aparte)
  const bySol = new Map();
  const historial = [];
  for (const r of raw) {
    historial.push(normalizeCronogramaRow(r));
    const key = r.solicitud_id;
    if (!bySol.has(key)) {
      const norm = normalizeCronogramaRow(r);
      bySol.set(key, {
        ...norm,
        convocatoria_cerrada: convocatoriaCerrada(norm),
      });
    }
  }

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
    invitaciones: [...bySol.values()],
    historial_invitaciones: historial,
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
    SELECT c.*, p.ruc, p.razon_social, sc.codigo AS solicitud_codigo,
      sc.denominacion, sc.objeto,
      r.codigo AS requerimiento_codigo,
      COALESCE((
        SELECT string_agg(DISTINCT r2.codigo, ', ' ORDER BY r2.codigo)
        FROM solicitud_requerimientos sr
        JOIN requerimientos r2 ON r2.id = sr.requerimiento_id
        WHERE sr.solicitud_id = c.solicitud_id
      ), COALESCE(r.codigo, '')) AS requerimientos_texto,
      COALESCE((
        SELECT string_agg(DISTINCT centro_val, ', ' ORDER BY centro_val)
        FROM (
          SELECT NULLIF(TRIM(COALESCE(
            NULLIF(TRIM(p2.centro), ''),
            NULLIF(TRIM(ce.nombre), ''),
            NULLIF(TRIM(ce.codigo), ''),
            NULLIF(TRIM(a.responsable), ''),
            NULLIF(TRIM(r2.responsable), '')
          )), '') AS centro_val
          FROM solicitud_requerimientos sr
          JOIN requerimientos r2 ON r2.id = sr.requerimiento_id
          LEFT JOIN areas a ON r2.area = a.nombre OR a.codigo = r2.area
          LEFT JOIN centros ce ON a.centro_id = ce.id
          LEFT JOIN requerimiento_pedidos rp ON rp.requerimiento_id = r2.id
          LEFT JOIN pedidos_sigamef p2 ON p2.id = rp.pedido_sigamef_id
          WHERE sr.solicitud_id = c.solicitud_id
        ) centros_src
        WHERE centro_val IS NOT NULL AND centro_val <> ''
          AND centro_val !~ '^[0-9]{4,6}$'
      ), '') AS centros_texto
    FROM consultas_proveedor c
    JOIN proveedores p ON p.id = c.proveedor_id
    JOIN solicitudes_cotizacion sc ON sc.id = c.solicitud_id
    LEFT JOIN requerimientos r ON r.id = c.requerimiento_id
    ${where}
    ORDER BY c.created_at DESC
    LIMIT 500
  `, params);

  const mapped = rows.map((r) => ({
    ...r,
    requerimientos_texto: r.requerimientos_texto || r.requerimiento_codigo || '',
    centros_texto: r.centros_texto || '',
    centro: r.centros_texto || '',
  }));

  // RC8.4E — anexar estado_responsable_vigente en batch
  try {
    const { resolveEstadoResponsableBatch } = await import('./resolvedorEstadoResponsable.js');
    const reqIds = [...new Set(
      rows.map((r) => parseInt(r.requerimiento_id, 10)).filter((n) => Number.isFinite(n) && n > 0),
    )];
    if (reqIds.length) {
      const resolved = await resolveEstadoResponsableBatch(reqIds);
      for (const row of mapped) {
        const rid = parseInt(row.requerimiento_id, 10);
        if (Number.isFinite(rid) && resolved.has(rid)) {
          row.estado_responsable_vigente = resolved.get(rid);
        } else {
          row.estado_responsable_vigente = null;
        }
      }
    }
  } catch (_) { /* resolvedor no disponible */ }

  return mapped;
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

export async function listarRecepcionCotizaciones(queryParams = {}) {
  const { buildEstadoRecepcionContract } = await import('./estadoRecepcionCotizaciones.js');
  const valEstado = String(queryParams.validacion_estado || queryParams.estado || '').trim().toUpperCase();
  const params = [];
  let where = `WHERE cot.estado = 'COTIZACION_PRESENTADA'`;
  if (valEstado === 'PENDIENTE' || valEstado === 'COTIZACION_PRESENTADA') {
    where += ` AND COALESCE(cot.validacion_estado, '') IN ('', 'PENDIENTE')`;
  } else if (valEstado === 'DERIVADA' || valEstado === 'ENVIADA_VALIDACION') {
    where += ` AND cot.validacion_estado IN ('DERIVADA', 'EN_PROCESO')`;
  } else if (valEstado === 'VALIDADA_AU' || valEstado === 'VALIDADA') {
    where += ` AND cot.validacion_estado IN ('APTO', 'NO_APTO', 'OBSERVADO')`;
  } else if (valEstado) {
    params.push(valEstado);
    where += ` AND cot.validacion_estado = $${params.length}`;
  }
  const { rows } = await query(`
    SELECT cot.id, cot.solicitud_id, cot.proveedor_id, cot.estado,
      cot.fecha_presentacion,
      COALESCE(
        cot.requerimiento_id,
        (SELECT sr.requerimiento_id FROM solicitud_requerimientos sr
         WHERE sr.solicitud_id = cot.solicitud_id ORDER BY sr.requerimiento_id LIMIT 1)
      ) AS requerimiento_id,
      (
        SELECT r.tipo FROM solicitud_requerimientos sr
        JOIN requerimientos r ON r.id = sr.requerimiento_id
        WHERE sr.solicitud_id = cot.solicitud_id
        ORDER BY sr.requerimiento_id
        LIMIT 1
      ) AS req_tipo,
      cot.validacion_estado, cot.validacion_responsable, cot.created_at, cot.propuesta_economica,
      p.ruc, p.razon_social, sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto,
      sc.tipo AS solicitud_tipo, sc.tipo,
      sc.estado AS solicitud_estado,
      (
        SELECT r.estado_actual
        FROM solicitud_requerimientos sr
        JOIN requerimientos r ON r.id = sr.requerimiento_id
        WHERE sr.solicitud_id = cot.solicitud_id
        ORDER BY
          CASE UPPER(COALESCE(r.estado_actual, ''))
            WHEN 'RECEPCION_COTIZACIONES' THEN 1
            WHEN 'VALIDACION_USUARIO' THEN 2
            WHEN 'CUADRO_COMPARATIVO' THEN 3
            WHEN 'CCP' THEN 4
            ELSE 9
          END,
          r.id
        LIMIT 1
      ) AS req_estado_actual,
      (
        SELECT r.sub_modulo_actual
        FROM solicitud_requerimientos sr
        JOIN requerimientos r ON r.id = sr.requerimiento_id
        WHERE sr.solicitud_id = cot.solicitud_id
        ORDER BY r.id
        LIMIT 1
      ) AS req_sub_modulo_actual,
      (
        SELECT cc.estado FROM cuadros_comparativos cc
        WHERE cc.solicitud_id = sc.id AND UPPER(COALESCE(cc.estado, '')) <> 'ANULADO'
        ORDER BY cc.version DESC NULLS LAST, cc.id DESC
        LIMIT 1
      ) AS estado_cuadro,
      COALESCE((
        SELECT string_agg(DISTINCT r.codigo, ', ' ORDER BY r.codigo)
        FROM solicitud_requerimientos sr
        JOIN requerimientos r ON r.id = sr.requerimiento_id
        WHERE sr.solicitud_id = cot.solicitud_id
      ), (
        SELECT string_agg(DISTINCT elem->>'requerimiento_codigo', ', ' ORDER BY elem->>'requerimiento_codigo')
        FROM jsonb_array_elements(COALESCE(sc.detalle_items, '[]'::jsonb)) elem
        WHERE COALESCE(elem->>'requerimiento_codigo', '') <> ''
      ), '') AS requerimientos_texto,
      COALESCE((
        SELECT string_agg(DISTINCT centro_val, ', ' ORDER BY centro_val)
        FROM (
          SELECT NULLIF(TRIM(COALESCE(
            NULLIF(TRIM(p2.centro), ''),
            NULLIF(TRIM(c.nombre), ''),
            NULLIF(TRIM(c.codigo), ''),
            NULLIF(TRIM(COALESCE(r.payload, '{}')::jsonb->>'centro_display'), ''),
            NULLIF(TRIM(COALESCE(r.payload, '{}')::jsonb->>'centro_nombre'), ''),
            NULLIF(TRIM(COALESCE(r.payload, '{}')::jsonb->>'centro'), ''),
            NULLIF(TRIM(a.responsable), ''),
            NULLIF(TRIM(r.responsable), '')
          )), '') AS centro_val
          FROM solicitud_requerimientos sr
          JOIN requerimientos r ON r.id = sr.requerimiento_id
          LEFT JOIN areas a ON r.area = a.nombre OR a.codigo = r.area
          LEFT JOIN centros c ON a.centro_id = c.id
          LEFT JOIN requerimiento_pedidos rp ON rp.requerimiento_id = r.id
          LEFT JOIN pedidos_sigamef p2 ON p2.id = rp.pedido_sigamef_id
          WHERE sr.solicitud_id = cot.solicitud_id
        ) centros_src
        WHERE centro_val IS NOT NULL AND centro_val <> ''
          AND centro_val !~ '^[0-9]{4,6}$'
      ), (
        SELECT string_agg(DISTINCT centro_elem, ', ')
        FROM (
          SELECT NULLIF(TRIM(COALESCE(
            elem->>'centro_display', elem->>'centro_nombre', elem->>'centro', ''
          )), '') AS centro_elem
          FROM jsonb_array_elements(COALESCE(sc.detalle_items, '[]'::jsonb)) elem
        ) di
        WHERE centro_elem IS NOT NULL AND centro_elem <> ''
          AND centro_elem !~ '^[0-9]{4,6}$'
      ), '') AS centros_texto
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    JOIN solicitudes_cotizacion sc ON sc.id = cot.solicitud_id
    ${where}
    ORDER BY cot.fecha_presentacion DESC NULLS LAST, cot.created_at DESC
    LIMIT 500
  `, params);

  const { resolveCentrosTextoSolicitud } = await import('./validacionesCotizacion.js');
  const { loadCcpFlagsBySolicitudIds, applyCcpFlagsToRow } = await import('./ccpEstadoFlags.js');
  const sids = [...new Set(rows.map((r) => r.solicitud_id).filter(Boolean))];
  const centroBySid = new Map();
  await Promise.all(sids.map(async (sid) => {
    try { centroBySid.set(sid, await resolveCentrosTextoSolicitud(sid)); }
    catch (_) { centroBySid.set(sid, ''); }
  }));
  const ccpBySid = await loadCcpFlagsBySolicitudIds(sids);

  const enriched = rows.map((r) => {
    const eco = typeof r.propuesta_economica === 'object'
      ? r.propuesta_economica
      : (() => { try { return JSON.parse(r.propuesta_economica || '{}'); } catch (_) { return {}; } })();
    const valEst = r.validacion_estado || '';
    const centro = centroBySid.get(r.solicitud_id) || r.centros_texto || '';
    const solicitudEstado = String(r.solicitud_estado || '').toUpperCase();
    const estadoCuadro = String(r.estado_cuadro || '').toUpperCase();
    const derivadoCcp = solicitudEstado === 'EN_CCP'
      || estadoCuadro === 'DERIVADO_CCP'
      || estadoCuadro === 'DERIVADO_A_CCP';
    const ccpInfo = ccpBySid.get(Number(r.solicitud_id)) || {};
    // Tipo canónico: preferir requerimiento (fuente de verdad) sobre SC.
    const tipoResuelto = r.req_tipo || r.solicitud_tipo || r.tipo || '';
    // Si ya hay cotización presentada, la ubicación operativa en esta bandeja es Recepción
    // (evita badge/responsable “Invitaciones” cuando el req aún no sincronizó etapa).
    let estadoActual = r.req_estado_actual || '';
    let subModuloActual = r.req_sub_modulo_actual || '';
    const etapaUp = String(estadoActual).toUpperCase();
    if (
      String(r.estado || '').toUpperCase() === 'COTIZACION_PRESENTADA'
      && (etapaUp === 'INVITACIONES' || !etapaUp)
    ) {
      estadoActual = 'RECEPCION_COTIZACIONES';
      subModuloActual = 'Recepción de Cotizaciones';
    }
    const base = applyCcpFlagsToRow({
      id: r.id,
      solicitud_id: r.solicitud_id,
      proveedor_id: r.proveedor_id,
      requerimiento_id: r.requerimiento_id || null,
      estado: r.estado,
      validacion_estado: valEst,
      solicitud_estado: r.solicitud_estado || '',
      solicitud_tipo: tipoResuelto,
      tipo: tipoResuelto,
      estado_cuadro: r.estado_cuadro || '',
      derivado_ccp: derivadoCcp,
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
      requerimientos_texto: r.requerimientos_texto || '',
      requerimientos_codigos: r.requerimientos_texto || '',
      centros_texto: centro,
      centro,
      estado_actual: estadoActual,
      sub_modulo_actual: subModuloActual,
    }, ccpInfo, {
      ccp_activo: !!ccpInfo.ccp_activo,
      enviada_oppm: !!ccpInfo.enviada_oppm,
      orden_id: ccpInfo.orden_id || null,
      orden_estado: ccpInfo.orden_estado || '',
      enviado_proveedor_at: ccpInfo.enviado_proveedor_at || null,
      recibido_proveedor_at: ccpInfo.recibido_proveedor_at || null,
      derivado_ejecucion_at: ccpInfo.derivado_ejecucion_at || null,
      orden_resuelta: !!ccpInfo.orden_resuelta,
      expediente_derivado_pago: !!ccpInfo.expediente_derivado_pago,
    });

    const contract = buildEstadoRecepcionContract({
      cotizacion: base,
      cotizaciones: [base],
      meta: {
        solicitud_estado: r.solicitud_estado || '',
        estado_cuadro: r.estado_cuadro || '',
        derivado_ccp: derivadoCcp,
        ccp_activo: !!ccpInfo.ccp_activo,
        ccp_registrado: !!ccpInfo.ccp_activo,
        codigo_ccp: ccpInfo.codigo_ccp || '',
        enviada_oppm: !!ccpInfo.enviada_oppm,
        estado_actual: estadoActual,
        sub_modulo_actual: subModuloActual,
        estadoVigente: (base.estadoVigente && AVANZADO_RECEPCION(base.estadoVigente?.codigo))
          ? base.estadoVigente
          : null,
      },
    });

    return {
      ...base,
      ...contract,
      // No usar estado_vigente del expediente como badge de recepción
      estado_recepcion: contract.estado_recepcion_label,
      estadoInterno: {
        codigo: contract.estado_cotizacion_codigo,
        label: contract.estado_cotizacion_label,
        modulo: 'RECEPCION_COTIZACIONES',
      },
    };
  });

  // RC8.4E / RC8.8 — anexar estado_responsable_vigente en batch (sin reinferencia)
  await enrichEstadoResponsableForBandeja(enriched);

  return enriched;
}

function AVANZADO_RECEPCION(codigo) {
  const c = String(codigo || '').toUpperCase();
  return [
    'DERIVADO_CCP', 'CCP_REGISTRADA', 'ENVIADA_OPPM',
    'ORDEN_NOTIFICADA', 'ORDEN_REGISTRADA', 'REGISTRO_ORDENES',
    'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO',
    'PENDIENTE_ELABORAR', 'CUADRO_BORRADOR', 'CUADRO_COMPARATIVO_APROBADO',
  ].includes(c);
}

export async function listarValidacionesBandeja() {
  const { listarValidacionesPendientesDerivacion } = await import('./validacionesCotizacion.js');
  return listarValidacionesPendientesDerivacion();
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

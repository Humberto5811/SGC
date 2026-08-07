/**
 * Certificación Presupuestal (CCP) — API.
 * RC8.6E: acceso GLOBAL (permiso/DEC/admin) o ASIGNACION (expediente_asignaciones activa).
 */
import express from 'express';
import {
  listarBandejaCcp,
  getDetalleCcpRequerimiento,
  registrarCodigoCcp,
  editarCodigoCcp,
  anularCodigoCcp,
  crearConsolidacionCcp,
  getConsolidacionCcp,
  retirarRequerimientoConsolidacion,
  marcarWordGenerado,
  buildPayloadWordIndividual,
  derivarCcpARegistroOrdenes,
  evaluarPuedeDerivarRegistroOrdenes,
  httpError,
} from '../lib/ccpCertificacion.js';
import { generarWordSolicitudCcp } from '../lib/ccpWord.js';
import { query } from '../db.js';
import {
  assertAccesoCcp,
  MODO_ACCESO_CCP,
} from '../lib/accesoCcp.js';

const router = express.Router();

function actorFromReq(req) {
  const usuario = req.user?.nombre
    || req.headers['x-user-name']
    || req.body?.usuario
    || '';
  const rol = String(req.user?.rol || req.headers['x-user-rol'] || '').toLowerCase();
  return { usuario: String(usuario).slice(0, 150), rol, userId: req.user?.id || null };
}

async function requireCcp(req, actividad = 'VER', requerimientoId = null) {
  const userId = req.user?.id;
  if (!userId) {
    throw httpError('No autenticado', 401, 'NO_AUTH');
  }
  return assertAccesoCcp({
    usuarioId: userId,
    actividad,
    requerimientoId,
    userRow: req.user,
  });
}

function sendLibError(res, err, next) {
  if (err?.status) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code || 'CCP_ERROR',
      detail: err.message,
    });
  }
  return next(err);
}

function filterByAlcance(data, acceso) {
  if (acceso.modo !== MODO_ACCESO_CCP.ASIGNACION) return data;
  const allow = new Set((acceso.alcanceRequerimientoIds || []).map(Number));
  return (data || []).filter((r) => allow.has(Number(r.requerimiento_id)));
}

// GET /api/ccp/bandeja
router.get('/bandeja', async (req, res, next) => {
  try {
    const acceso = await requireCcp(req, 'VER');
    const data = await listarBandejaCcp();
    let filtered = filterByAlcance(data, acceso);
    const q = String(req.query.q || req.query.search || '').trim().toLowerCase();
    const estado = String(req.query.estado || '').trim().toUpperCase();
    if (estado) filtered = filtered.filter((r) => r.estado_ccp === estado);
    if (q) {
      filtered = filtered.filter((r) => {
        const hay = [
          r.requerimiento_codigo, r.solicitud_codigo, r.centro,
          r.codigo_ccp, r.denominacion, r.consolidacion_codigo, r.estado_ccp_label,
        ].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    res.json({
      data: filtered,
      meta: {
        total: filtered.length,
        modo: acceso.modo,
        acceso_por_asignacion: acceso.modo === MODO_ACCESO_CCP.ASIGNACION,
        puede_consolidar: acceso.modo === MODO_ACCESO_CCP.GLOBAL,
        actividades: acceso.actividadesPermitidas,
      },
    });
  } catch (err) { sendLibError(res, err, next); }
});

// POST /api/ccp/consolidaciones
router.post('/consolidaciones', async (req, res, next) => {
  try {
    const acceso = await requireCcp(req, 'CONSOLIDAR');
    if (acceso.modo !== MODO_ACCESO_CCP.GLOBAL) {
      throw httpError('Consolidar CCP requiere acceso global', 403, 'CCP_CONSOLIDAR_FORBIDDEN');
    }
    const { usuario, rol } = actorFromReq(req);
    const data = await crearConsolidacionCcp(req.body || {}, usuario, rol);
    res.status(201).json({ ok: true, data });
  } catch (err) { sendLibError(res, err, next); }
});

// GET /api/ccp/consolidaciones/:id
router.get('/consolidaciones/:id', async (req, res, next) => {
  try {
    const acceso = await requireCcp(req, 'VER');
    const data = await getConsolidacionCcp(req.params.id);
    if (acceso.modo === MODO_ACCESO_CCP.ASIGNACION) {
      const allow = new Set((acceso.alcanceRequerimientoIds || []).map(Number));
      const reqs = (data?.requerimientos || data?.filas || [])
        .map((r) => Number(r.requerimiento_id || r.id))
        .filter(Boolean);
      if (reqs.length && !reqs.every((id) => allow.has(id))) {
        throw httpError('Consolidación fuera de su asignación CCP', 403, 'CCP_FORBIDDEN');
      }
    }
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

// PUT /api/ccp/consolidaciones/:id — actualizar observación / enviar OPPM
router.put('/consolidaciones/:id', async (req, res, next) => {
  try {
    const acceso = await requireCcp(req, 'CONSOLIDAR');
    if (acceso.modo !== MODO_ACCESO_CCP.GLOBAL) {
      throw httpError('Operación de consolidación requiere acceso global CCP', 403, 'CCP_FORBIDDEN');
    }
    const { usuario, rol } = actorFromReq(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) throw httpError('Consolidación inválida');
    const det = await getConsolidacionCcp(id);
    const observacion = req.body?.observacion != null
      ? String(req.body.observacion).slice(0, 2000)
      : null;
    const enviar = !!req.body?.enviar_oppm || String(req.body?.estado || '').toUpperCase() === 'ENVIADA_OPPM';

    if (enviar) {
      if (!det.cantidad_requerimientos) {
        throw httpError('No se puede enviar una consolidación sin requerimientos', 409);
      }
      await query(`
        UPDATE ccp_solicitudes
        SET estado = 'ENVIADA_OPPM', fecha_envio = NOW(), enviado_por = $2,
            observacion = COALESCE($3, observacion), actualizado_por = $2, updated_at = NOW()
        WHERE id = $1
      `, [id, usuario, observacion]);
      await query(`
        INSERT INTO ccp_eventos (tipo, solicitud_id, usuario, rol, valor_nuevo, observacion)
        VALUES ('SOLICITUD_ENVIADA', $1, $2, $3, 'ENVIADA_OPPM', $4)
      `, [id, usuario, rol, observacion]);
    } else if (observacion != null) {
      await query(`
        UPDATE ccp_solicitudes
        SET observacion = $2, actualizado_por = $3, updated_at = NOW()
        WHERE id = $1
      `, [id, observacion, usuario]);
    }

    const data = await getConsolidacionCcp(id);
    res.json({ ok: true, data });
  } catch (err) { sendLibError(res, err, next); }
});

// POST /api/ccp/consolidaciones/:id/retirar
router.post('/consolidaciones/:id/retirar', async (req, res, next) => {
  try {
    const acceso = await requireCcp(req, 'CONSOLIDAR');
    if (acceso.modo !== MODO_ACCESO_CCP.GLOBAL) {
      throw httpError('Retirar de consolidación requiere acceso global CCP', 403, 'CCP_FORBIDDEN');
    }
    const { usuario, rol } = actorFromReq(req);
    const rid = req.body?.requerimiento_id;
    const data = await retirarRequerimientoConsolidacion(req.params.id, rid, usuario, rol);
    res.json({ ok: true, data });
  } catch (err) { sendLibError(res, err, next); }
});

// POST /api/ccp/consolidaciones/:id/generar-word — Word consolidado (solo GLOBAL)
router.post('/consolidaciones/:id/generar-word', async (req, res, next) => {
  try {
    const acceso = await requireCcp(req, 'DESCARGAR');
    if (acceso.modo === MODO_ACCESO_CCP.ASIGNACION) {
      throw httpError(
        'Word consolidado requiere acceso global CCP',
        403,
        'CCP_WORD_CONSOLIDADO_FORBIDDEN',
      );
    }
    const consolidacion = await getConsolidacionCcp(req.params.id);
    const { usuario, rol } = actorFromReq(req);
    if (!consolidacion.filas?.length) {
      throw httpError('La consolidación no tiene filas presupuestales', 409);
    }
    const { buffer, filename, asunto } = await generarWordSolicitudCcp(consolidacion);
    await marcarWordGenerado(consolidacion.id, usuario, rol);
    const safeName = String(filename || 'CCP-SOL.docx').replace(/[^\w.\-]+/g, '_');
    const payload = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Length', String(payload.length));
    res.setHeader('X-CCP-Asunto', encodeURIComponent(asunto || ''));
    res.setHeader('X-CCP-Word-Mode', 'consolidado');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).end(payload);
  } catch (err) { sendLibError(res, err, next); }
});

// GET /api/ccp/:id — detalle requerimiento
router.get('/:id', async (req, res, next) => {
  try {
    await requireCcp(req, 'VER', req.params.id);
    const data = await getDetalleCcpRequerimiento(req.params.id);
    const evalDerivar = await evaluarPuedeDerivarRegistroOrdenes(req.params.id);
    res.json({
      data: {
        ...data,
        puede_derivar_ordenes: !!evalDerivar.ok,
        motivo_derivar_ordenes: evalDerivar.ok ? null : (evalDerivar.motivo || null),
      },
    });
  } catch (err) { sendLibError(res, err, next); }
});

/**
 * POST /api/ccp/:id/generar-word — Word individual (mismo generador: generarWordSolicitudCcp).
 * No crea consolidación ni segundo motor Word.
 */
router.post('/:id/generar-word', async (req, res, next) => {
  try {
    const rid = req.params.id;
    await requireCcp(req, 'DESCARGAR', rid);
    const payload = await buildPayloadWordIndividual(rid);
    if (!payload.filas?.length) {
      throw httpError('El expediente no tiene filas presupuestales para el documento', 409);
    }
    const { buffer, filename, asunto } = await generarWordSolicitudCcp(payload);
    const { usuario, rol } = actorFromReq(req);
    const reqId = parseInt(rid, 10);
    // Idempotencia de evento: no duplicar WORD_GENERADO_INDIVIDUAL si ya existe.
    const { rows: prev } = await query(`
      SELECT id FROM ccp_eventos
      WHERE tipo = 'WORD_GENERADO_INDIVIDUAL' AND requerimiento_id = $1
      ORDER BY id DESC LIMIT 1
    `, [reqId]);
    if (!prev.length) {
      await query(`
        INSERT INTO ccp_eventos (tipo, requerimiento_id, usuario, rol, valor_nuevo, observacion)
        VALUES ('WORD_GENERADO_INDIVIDUAL', $1, $2, $3, $4, $5)
      `, [reqId, usuario, rol, payload.codigo_interno || '', asunto || '']);
    }
    const safeName = String(filename || `CCP-${rid}.docx`).replace(/[^\w.\-]+/g, '_');
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('X-CCP-Asunto', encodeURIComponent(asunto || ''));
    res.setHeader('X-CCP-Word-Mode', 'individual');
    res.setHeader('X-CCP-Word-Reuse', prev.length ? '1' : '0');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).end(bytes);
  } catch (err) { sendLibError(res, err, next); }
});

/**
 * POST /api/ccp/:id/derivar-ordenes — CCP → Registro de Órdenes vía transicionarExpediente.
 */
router.post('/:id/derivar-ordenes', async (req, res, next) => {
  try {
    const rid = req.params.id;
    await requireCcp(req, 'DERIVAR', rid);
    const { usuario, rol, userId } = actorFromReq(req);
    const result = await derivarCcpARegistroOrdenes(rid, {
      usuario,
      usuarioId: userId,
      rol,
      motivo: req.body?.motivo || '',
      clientRequestId: req.body?.client_request_id
        || req.headers['x-client-request-id']
        || null,
    });
    res.json({ ok: true, ...result });
  } catch (err) { sendLibError(res, err, next); }
});

// POST /api/ccp/:id/codigo
router.post('/:id/codigo', async (req, res, next) => {
  try {
    await requireCcp(req, 'CREAR', req.params.id);
    const { usuario, rol } = actorFromReq(req);
    const result = await registrarCodigoCcp(req.params.id, req.body || {}, usuario, rol);
    res.status(201).json(result);
  } catch (err) { sendLibError(res, err, next); }
});

// PUT /api/ccp/:id/codigo
router.put('/:id/codigo', async (req, res, next) => {
  try {
    await requireCcp(req, 'EDITAR', req.params.id);
    const { usuario, rol } = actorFromReq(req);
    const result = await editarCodigoCcp(req.params.id, req.body || {}, usuario, rol);
    res.json(result);
  } catch (err) { sendLibError(res, err, next); }
});

// DELETE /api/ccp/:id/codigo
router.delete('/:id/codigo', async (req, res, next) => {
  try {
    await requireCcp(req, 'ELIMINAR', req.params.id);
    const { usuario, rol } = actorFromReq(req);
    const result = await anularCodigoCcp(req.params.id, req.body || {}, usuario, rol);
    res.json(result);
  } catch (err) { sendLibError(res, err, next); }
});

export default router;

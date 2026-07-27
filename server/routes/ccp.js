/**
 * Certificación Presupuestal (CCP) — API.
 * Roles operativos: dec / admin (alineado a ROUTE_ROLES 'dec/ccp').
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
  httpError,
} from '../lib/ccpCertificacion.js';
import { generarWordSolicitudCcp } from '../lib/ccpWord.js';
import { query } from '../db.js';

const router = express.Router();

const ROLES_CCP = new Set(['dec', 'admin']);

function actorFromReq(req) {
  const usuario = req.user?.nombre
    || req.headers['x-user-name']
    || req.body?.usuario
    || '';
  const rol = String(req.user?.rol || req.headers['x-user-rol'] || '').toLowerCase();
  return { usuario: String(usuario).slice(0, 150), rol };
}

function assertRolCcp(req) {
  const rol = String(req.user?.rol || req.headers['x-user-rol'] || '').toLowerCase();
  if (!ROLES_CCP.has(rol)) {
    throw httpError('No autorizado para Certificación Presupuestal (CCP)', 403, 'CCP_FORBIDDEN');
  }
  return rol;
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

// GET /api/ccp/bandeja
router.get('/bandeja', async (req, res, next) => {
  try {
    assertRolCcp(req);
    const data = await listarBandejaCcp();
    const q = String(req.query.q || req.query.search || '').trim().toLowerCase();
    const estado = String(req.query.estado || '').trim().toUpperCase();
    let filtered = data;
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
    res.json({ data: filtered, meta: { total: filtered.length } });
  } catch (err) { sendLibError(res, err, next); }
});

// POST /api/ccp/consolidaciones
router.post('/consolidaciones', async (req, res, next) => {
  try {
    assertRolCcp(req);
    const { usuario, rol } = actorFromReq(req);
    const data = await crearConsolidacionCcp(req.body || {}, usuario, rol);
    res.status(201).json({ ok: true, data });
  } catch (err) { sendLibError(res, err, next); }
});

// GET /api/ccp/consolidaciones/:id
router.get('/consolidaciones/:id', async (req, res, next) => {
  try {
    assertRolCcp(req);
    const data = await getConsolidacionCcp(req.params.id);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

// PUT /api/ccp/consolidaciones/:id — actualizar observación / enviar OPPM
router.put('/consolidaciones/:id', async (req, res, next) => {
  try {
    assertRolCcp(req);
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
    assertRolCcp(req);
    const { usuario, rol } = actorFromReq(req);
    const rid = req.body?.requerimiento_id;
    const data = await retirarRequerimientoConsolidacion(req.params.id, rid, usuario, rol);
    res.json({ ok: true, data });
  } catch (err) { sendLibError(res, err, next); }
});

// POST /api/ccp/consolidaciones/:id/generar-word
router.post('/consolidaciones/:id/generar-word', async (req, res, next) => {
  try {
    assertRolCcp(req);
    const { usuario, rol } = actorFromReq(req);
    const consolidacion = await getConsolidacionCcp(req.params.id);
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
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).end(payload);
  } catch (err) { sendLibError(res, err, next); }
});

// GET /api/ccp/:id — detalle requerimiento
router.get('/:id', async (req, res, next) => {
  try {
    assertRolCcp(req);
    const data = await getDetalleCcpRequerimiento(req.params.id);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

// POST /api/ccp/:id/codigo
router.post('/:id/codigo', async (req, res, next) => {
  try {
    assertRolCcp(req);
    const { usuario, rol } = actorFromReq(req);
    const result = await registrarCodigoCcp(req.params.id, req.body || {}, usuario, rol);
    res.status(201).json(result);
  } catch (err) { sendLibError(res, err, next); }
});

// PUT /api/ccp/:id/codigo
router.put('/:id/codigo', async (req, res, next) => {
  try {
    assertRolCcp(req);
    const { usuario, rol } = actorFromReq(req);
    const result = await editarCodigoCcp(req.params.id, req.body || {}, usuario, rol);
    res.json(result);
  } catch (err) { sendLibError(res, err, next); }
});

// DELETE /api/ccp/:id/codigo
router.delete('/:id/codigo', async (req, res, next) => {
  try {
    assertRolCcp(req);
    const { usuario, rol } = actorFromReq(req);
    const result = await anularCodigoCcp(req.params.id, req.body || {}, usuario, rol);
    res.json(result);
  } catch (err) { sendLibError(res, err, next); }
});

export default router;

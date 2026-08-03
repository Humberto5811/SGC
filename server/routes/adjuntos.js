// Rutas para gestionar adjuntos de requerimientos
import express from 'express';
import { query } from '../db.js';
import { assertCanAccessRequirement, canAccessRequirementByContractAssignment } from '../lib/userDataScope.js';

const router = express.Router();

/**
 * RC8.2E — Guard central de adjuntos con política completa:
 *   1. Exigir req.user.id (sin fallback a headers).
 *   2. Verificar asignación contractual (created_by / responsable).
 *   3. Si no está asignado, verificar alcance organizacional.
 *   4. Si ninguna autorización aplica → 403.
 */
async function guardAdjuntoByReq(req, requerimientoId) {
  // 1. Autenticación estricta: solo req.user.id
  const userId = req.user?.id;
  if (!userId) {
    const err = new Error('No autenticado');
    err.status = 401;
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  // 2. Verificar asignación contractual (created_by / responsable en solicitudes)
  try {
    const assignment = await canAccessRequirementByContractAssignment(userId, requerimientoId);
    if (assignment.ok) {
      return; // Autorizado por asignación contractual
    }
  } catch (_) {
    // Si falla la consulta de asignación, continuar con alcance organizacional
  }

  // 3. Verificar alcance organizacional
  await assertCanAccessRequirement(userId, requerimientoId, 'VER');
}

// GET /api/adjuntos/descargar/:adjuntoId - Descargar un adjunto (DEBE IR PRIMERO)
router.get('/descargar/:adjuntoId', async (req, res, next) => {
  try {
    const { adjuntoId } = req.params;
    const res2 = await query(
      `SELECT id, requerimiento_id, nombre_archivo, mime_type, contenido_base64
       FROM requerimientos_adjuntos WHERE id = $1`,
      [adjuntoId]
    );
    if (!res2 || res2.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Adjunto no encontrado' });
    }
    try {
      await guardAdjuntoByReq(req, res2.rows[0].requerimiento_id);
    } catch (e) {
      if (e.status === 403) {
        return res.status(403).json({
          code: e.code || 'REQUERIMIENTO_FUERA_DE_ALCANCE',
          error: e.message,
          message: e.message,
        });
      }
      throw e;
    }
    res.json({ success: true, ...res2.rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/adjuntos/solicitud/:solicitudId - Adjuntos de todos los requerimientos vinculados
router.get('/solicitud/:solicitudId', async (req, res, next) => {
  try {
    const { solicitudId } = req.params;
    const res2 = await query(
      `SELECT ra.id, ra.nombre_archivo, ra.mime_type, ra.tamaño_bytes, ra.usuario_carga, ra.created_at,
              r.id AS requerimiento_id, r.codigo AS requerimiento_codigo
       FROM requerimientos_adjuntos ra
       JOIN requerimientos r ON r.id = ra.requerimiento_id
       WHERE ra.requerimiento_id IN (
         SELECT requerimiento_id FROM solicitud_requerimientos WHERE solicitud_id = $1
       )
       ORDER BY r.codigo, ra.created_at DESC`,
      [solicitudId]
    );
    res.json({ success: true, adjuntos: res2.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/adjuntos/listar/:requerimientoId - Obtener adjuntos de un requerimiento
router.get('/listar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    try {
      await guardAdjuntoByReq(req, requerimientoId);
    } catch (e) {
      if (e.status === 403 || e.status === 401) {
        return res.status(e.status).json({
          code: e.code || (e.status === 401 ? 'NO_AUTENTICADO' : 'REQUERIMIENTO_FUERA_DE_ALCANCE'),
          error: e.message,
          message: e.message,
        });
      }
      throw e;
    }
    const res2 = await query(
      `SELECT id, nombre_archivo, mime_type, tamaño_bytes, usuario_carga, created_at
       FROM requerimientos_adjuntos
       WHERE requerimiento_id = $1
       ORDER BY created_at DESC`,
      [requerimientoId]
    );
    res.json({ success: true, adjuntos: res2.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/adjuntos/subir/:requerimientoId - Subir un adjunto
router.post('/subir/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    try {
      await guardAdjuntoByReq(req, requerimientoId);
    } catch (e) {
      if (e.status === 403 || e.status === 401) {
        return res.status(e.status).json({
          code: e.code || (e.status === 401 ? 'NO_AUTENTICADO' : 'REQUERIMIENTO_FUERA_DE_ALCANCE'),
          error: e.message,
          message: e.message,
        });
      }
      throw e;
    }
    const { nombre_archivo, mime_type, contenido_base64, tamaño_bytes } = req.body;
    const usuario_carga = req.headers['x-user-name'] || 'sistema';

    if (!nombre_archivo || !contenido_base64) {
      return res.status(400).json({ success: false, error: 'Datos incompletos' });
    }

    const res2 = await query(
      `INSERT INTO requerimientos_adjuntos (requerimiento_id, nombre_archivo, mime_type, contenido_base64, tamaño_bytes, usuario_carga)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nombre_archivo, created_at`,
      [requerimientoId, nombre_archivo, mime_type, contenido_base64, tamaño_bytes || 0, usuario_carga]
    );

    res.json({ success: true, adjunto: res2.rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/adjuntos/:adjuntoId - Eliminar un adjunto
router.delete('/:adjuntoId', async (req, res, next) => {
  try {
    const { adjuntoId } = req.params;

    // RC8.2E — Resolver requerimiento_id real desde BD antes de autorizar
    const adjRow = await query(
      `SELECT id, requerimiento_id FROM requerimientos_adjuntos WHERE id = $1`,
      [adjuntoId]
    );
    if (!adjRow || adjRow.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Adjunto no encontrado' });
    }

    try {
      await guardAdjuntoByReq(req, adjRow.rows[0].requerimiento_id);
    } catch (e) {
      if (e.status === 403 || e.status === 401) {
        return res.status(e.status).json({
          code: e.code || (e.status === 401 ? 'AUTH_REQUIRED' : 'REQUERIMIENTO_FUERA_DE_ALCANCE'),
          error: e.message,
          message: e.message,
        });
      }
      throw e;
    }

    const res2 = await query(
      `DELETE FROM requerimientos_adjuntos WHERE id = $1 RETURNING id`,
      [adjuntoId]
    );
    if (!res2 || res2.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Adjunto no encontrado' });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;

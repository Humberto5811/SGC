// Rutas para gestionar adjuntos de requerimientos
import express from 'express';
import { query } from '../db.js';

const router = express.Router();

// GET /api/adjuntos/descargar/:adjuntoId - Descargar un adjunto (DEBE IR PRIMERO)
router.get('/descargar/:adjuntoId', async (req, res, next) => {
  try {
    const { adjuntoId } = req.params;
    const res2 = await query(
      `SELECT id, nombre_archivo, mime_type, contenido_base64 FROM requerimientos_adjuntos WHERE id = $1`,
      [adjuntoId]
    );
    if (!res2 || res2.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Adjunto no encontrado' });
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
    const { nombre_archivo, mime_type, contenido_base64, tamaño_bytes } = req.body;
    const usuario_carga = 'sistema'; // TODO: obtener del usuario autenticado

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

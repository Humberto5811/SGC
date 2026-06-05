// Rutas personalizadas para requerimientos (más allá de CRUD básico)
import express from 'express';
import { query } from '../db.js';

const router = express.Router();

// PUT /api/requerimientos/:requerimientoId/solicitar-aprobacion
router.put('/:requerimientoId/solicitar-aprobacion', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;

    // Verificar que el requerimiento existe
    const reqCheck = await query('SELECT id, estado FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck || reqCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Requerimiento no encontrado' });
    }

    // Cambiar estado a "En tramite de aprobación"
    const res2 = await query(
      `UPDATE requerimientos 
       SET estado = 'En tramite de aprobación', updated_at = NOW()
       WHERE id = $1
       RETURNING id, codigo, estado`,
      [requerimientoId]
    );

    res.json({ success: true, requerimiento: res2.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;

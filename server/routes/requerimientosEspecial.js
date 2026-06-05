// Rutas personalizadas para requerimientos (más allá de CRUD básico)
import express from 'express';
import { query } from '../db.js';

const router = express.Router();

// GET /api/requerimientos/listar-con-detalles - Obtener requerimientos con centro y monto total
router.get('/listar-con-detalles', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '100', 10)));
    const offset = (page - 1) * pageSize;
    const search = (req.query.search || '').trim();

    // Construir WHERE con búsqueda (si existe)
    const params = [];
    let where = '';
    if (search) {
      params.push(`%${search}%`);
      params.push(`%${search}%`);
      params.push(`%${search}%`);
      params.push(`%${search}%`);
      where = `WHERE r.codigo ILIKE $1 OR r.denominacion ILIKE $2 OR r.area ILIKE $3 OR r.responsable ILIKE $4`;
    }

    // Obtener requerimientos con información del centro
    const countSql = `
      SELECT COUNT(*)::int AS total 
      FROM requerimientos r
      LEFT JOIN areas a ON r.area = a.nombre
      LEFT JOIN centros c ON a.centro_id = c.id
      ${where}
    `;
    const countParams = where ? params.slice(0, 4) : [];
    const countResult = await query(countSql, countParams);
    const total = countResult.rows[0].total;

    // Agregar paginación
    params.push(pageSize);
    params.push(offset);
    const nextParamNum = params.length - 2;

    const dataSql = `
      SELECT 
        r.id, r.tipo, r.codigo, r.denominacion, r.area, r.responsable, r.estado, 
        r.payload, r.usuario_modificacion, r.created_at, r.updated_at,
        c.nombre as centro_nombre,
        c.codigo as centro_codigo
      FROM requerimientos r
      LEFT JOIN areas a ON r.area = a.nombre
      LEFT JOIN centros c ON a.centro_id = c.id
      ${where}
      ORDER BY r.id DESC
      LIMIT $${nextParamNum} OFFSET $${nextParamNum + 1}
    `;
    
    const result = await query(dataSql, params);
    
    // Procesar cada requerimiento para calcular monto total
    const rows = await Promise.all(result.rows.map(async (req) => {
      let monto_total = 0;
      try {
        const payload = JSON.parse(req.payload || '{}');
        if (payload.items && Array.isArray(payload.items)) {
          // Para cada item, buscar el precio en el catálogo
          for (const item of payload.items) {
            const catalogRes = await query(
              `SELECT precio_unitario FROM catalogo_sigamef WHERE item_bien = $1 LIMIT 1`,
              [item.item_bien]
            );
            if (catalogRes && catalogRes.rows.length > 0) {
              const precio = Number(catalogRes.rows[0].precio_unitario) || 0;
              const cantidad = Number(item.cantidad) || 0;
              monto_total += precio * cantidad;
            }
          }
        }
      } catch (e) {
        console.error(`Error procesando payload del requerimiento ${req.id}:`, e);
      }
      
      return {
        ...req,
        monto_total: Number(monto_total.toFixed(2)),
        centro_nombre: req.centro_nombre || 'N/A'
      };
    }));

    res.json({ 
      data: rows, 
      total, 
      page, 
      pageSize, 
      totalPages: Math.max(1, Math.ceil(total / pageSize)) 
    });
  } catch (err) {
    next(err);
  }
});

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

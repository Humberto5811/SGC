// Actos Preparatorios — bandeja, asignación, observación, aprobación, trazabilidad
import express from 'express';
import { query } from '../db.js';

const router = express.Router();

// GET /api/actos-preparatorios — bandeja de expedientes en Actos Preparatorios
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT r.id, r.tipo, r.codigo, r.cmn, r.denominacion, r.area, r.responsable,
             r.estado, r.payload, r.submodulo_actual, r.responsable_actual,
             r.fecha_estado_actual, r.created_at, r.updated_at,
             COALESCE(c.nombre, '') AS centro_nombre,
             (SELECT COUNT(*)::int FROM requerimiento_pedidos rp WHERE rp.requerimiento_id = r.id) AS pedidos_count
      FROM requerimientos r
      LEFT JOIN areas a ON r.area = a.nombre
      LEFT JOIN centros c ON a.centro_id = c.id
      WHERE r.estado IN ('En Actos Preparatorios', 'Asignado', 'Observado')
        AND (r.submodulo_actual = 'Actos Preparatorios' OR r.submodulo_actual = '' OR r.submodulo_actual IS NULL)
      ORDER BY r.id ASC
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/actos-preparatorios/stats — indicadores
router.get('/stats', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE estado = 'En Actos Preparatorios' AND (responsable_actual = '' OR responsable_actual IS NULL))::int AS pendientes_asignacion,
        COUNT(*) FILTER (WHERE estado = 'Asignado' OR (estado = 'En Actos Preparatorios' AND responsable_actual != '' AND responsable_actual IS NOT NULL))::int AS asignados,
        COUNT(*) FILTER (WHERE estado = 'Observado')::int AS observados,
        COUNT(*) FILTER (WHERE estado IN ('Aprobado AP', 'En Invitaciones'))::int AS finalizados
      FROM requerimientos
      WHERE estado IN ('En Actos Preparatorios', 'Asignado', 'Observado', 'Aprobado AP', 'En Invitaciones')
        AND (submodulo_actual = 'Actos Preparatorios' OR submodulo_actual = '' OR submodulo_actual IS NULL
             OR estado IN ('Aprobado AP', 'En Invitaciones'))
    `);
    // Count retrasados (>5 days since fecha_estado_actual)
    const { rows: retRows } = await query(`
      SELECT COUNT(*)::int AS retrasados
      FROM requerimientos
      WHERE estado IN ('En Actos Preparatorios', 'Asignado')
        AND fecha_estado_actual IS NOT NULL
        AND (NOW() - fecha_estado_actual) > INTERVAL '5 days'
    `);
    const stats = rows[0] || {};
    stats.retrasados = retRows[0]?.retrasados || 0;
    res.json(stats);
  } catch (err) { next(err); }
});

// GET /api/actos-preparatorios/trazabilidad/:requerimientoId — historial
router.get('/trazabilidad/:requerimientoId', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT * FROM trazabilidad_expedientes
      WHERE requerimiento_id = $1
      ORDER BY fecha ASC
    `, [req.params.requerimientoId]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/actos-preparatorios/asignar — asignar analista
router.post('/asignar', async (req, res, next) => {
  try {
    const { requerimiento_id, usuario_destino, usuario_origen } = req.body;
    if (!requerimiento_id || !usuario_destino) {
      return res.status(400).json({ error: 'requerimiento_id y usuario_destino son requeridos.' });
    }
    await query(`
      UPDATE requerimientos
      SET responsable_actual = $2, estado = 'Asignado',
          submodulo_actual = 'Actos Preparatorios', fecha_estado_actual = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [requerimiento_id, usuario_destino]);

    await query(`
      INSERT INTO trazabilidad_expedientes (requerimiento_id, accion, origen, destino, usuario_origen, usuario_destino)
      VALUES ($1, 'ASIGNACION', 'ACTOS PREPARATORIOS', 'ACTOS PREPARATORIOS', $2, $3)
    `, [requerimiento_id, usuario_origen || '', usuario_destino]);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/actos-preparatorios/reasignar — reasignar a otro analista
router.post('/reasignar', async (req, res, next) => {
  try {
    const { requerimiento_id, usuario_destino, usuario_origen } = req.body;
    if (!requerimiento_id || !usuario_destino) {
      return res.status(400).json({ error: 'requerimiento_id y usuario_destino son requeridos.' });
    }
    await query(`
      UPDATE requerimientos
      SET responsable_actual = $2, fecha_estado_actual = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [requerimiento_id, usuario_destino]);

    await query(`
      INSERT INTO trazabilidad_expedientes (requerimiento_id, accion, origen, destino, usuario_origen, usuario_destino)
      VALUES ($1, 'REASIGNACION', 'ACTOS PREPARATORIOS', 'ACTOS PREPARATORIOS', $2, $3)
    `, [requerimiento_id, usuario_origen || '', usuario_destino]);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/actos-preparatorios/aprobar — aprobar y derivar a Invitaciones
router.post('/aprobar', async (req, res, next) => {
  try {
    const { requerimiento_id, usuario_destino, usuario_origen } = req.body;
    if (!requerimiento_id || !usuario_destino) {
      return res.status(400).json({ error: 'requerimiento_id y usuario_destino son requeridos.' });
    }
    await query(`
      UPDATE requerimientos
      SET estado = 'En Invitaciones', submodulo_actual = 'Invitaciones',
          responsable_actual = $2, fecha_estado_actual = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [requerimiento_id, usuario_destino]);

    await query(`
      INSERT INTO trazabilidad_expedientes (requerimiento_id, accion, origen, destino, usuario_origen, usuario_destino)
      VALUES ($1, 'APROBACION', 'ACTOS PREPARATORIOS', 'INVITACIONES', $2, $3)
    `, [requerimiento_id, usuario_origen || '', usuario_destino]);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/actos-preparatorios/observar — observar y devolver a cualquier submódulo
router.post('/observar', async (req, res, next) => {
  try {
    const { requerimiento_id, observacion, submodulo_destino, usuario_destino, usuario_origen } = req.body;
    if (!requerimiento_id || !observacion || !submodulo_destino || !usuario_destino) {
      return res.status(400).json({ error: 'Todos los campos son requeridos.' });
    }
    await query(`
      UPDATE requerimientos
      SET estado = 'Observado', submodulo_actual = $2,
          responsable_actual = $3, fecha_estado_actual = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [requerimiento_id, submodulo_destino, usuario_destino]);

    await query(`
      INSERT INTO trazabilidad_expedientes (requerimiento_id, accion, origen, destino, usuario_origen, usuario_destino, observacion)
      VALUES ($1, 'OBSERVACION', 'ACTOS PREPARATORIOS', $2, $3, $4, $5)
    `, [requerimiento_id, submodulo_destino, usuario_origen || '', usuario_destino, observacion]);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/actos-preparatorios/usuarios-submodulo?submodulo=... — listar usuarios con acceso a un submódulo
router.get('/usuarios-submodulo', async (req, res, next) => {
  try {
    const sub = (req.query.submodulo || '').trim();
    // Map submodulo names to route keys used in ROUTE_ROLES
    const subToRoute = {
      'Registro de Requerimientos': 'au/requerimientos/registro',
      'Evaluación': 'au/requerimientos/evaluacion',
      'Programación': 'au/programacion',
      'DEC': 'dec/actos',
      'Actos Preparatorios': 'dec/actos',
      'Invitaciones': 'dec/invitaciones',
      'Consultas': 'dec/consultas',
      'Cotizaciones': 'dec/cotizaciones',
      'CCP': 'dec/ccp',
      'Cuadro Comparativo': 'dec/cuadro',
      'Registro de Orden': 'ejecucion/registro',
      'Almacén': 'ejecucion/presentacion',
      'Tesorería': 'ejecucion/pago',
    };
    const routeKey = subToRoute[sub] || '';
    // Determine which roles have access
    const routeRoles = {
      'au/requerimientos/registro': ['au', 'admin'],
      'au/requerimientos/evaluacion': ['au', 'admin'],
      'au/programacion': ['au', 'admin'],
      'dec/actos': ['dec', 'admin'],
      'dec/invitaciones': ['dec', 'admin'],
      'dec/consultas': ['dec', 'admin'],
      'dec/cotizaciones': ['dec', 'admin'],
      'dec/ccp': ['dec', 'admin'],
      'dec/cuadro': ['dec', 'admin'],
      'ejecucion/registro': ['dec', 'admin'],
      'ejecucion/presentacion': ['dec', 'admin'],
      'ejecucion/pago': ['dec', 'admin'],
    };
    const roles = routeRoles[routeKey] || ['admin'];
    const placeholders = roles.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await query(`
      SELECT id, dni, nombre, rol, email FROM usuarios
      WHERE activo = true AND rol IN (${placeholders})
      ORDER BY nombre ASC
    `, roles);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

export default router;

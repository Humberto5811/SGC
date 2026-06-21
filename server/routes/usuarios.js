// CRUD Usuarios y Permisos
import express from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db.js';
import { normalizePermisos, permisosFromRol, allPermisos } from '../lib/permissionsCatalog.js';
import { getEstadoPassword, buildCredentialsMessage } from './auth.js';

const router = express.Router();

const USER_FROM = `
  FROM usuarios u
  LEFT JOIN areas a ON u.area_id = a.id
  LEFT JOIN centros c ON a.centro_id = c.id
`;

function mapUser(row) {
  if (!row) return null;
  const permisos = normalizePermisos(row.permisos, row.rol);
  const centro = row.centro || row.area_responsable || row.centro_codigo || '';
  return {
    id: row.id,
    dni: row.dni,
    username: row.username || row.dni,
    apellidos: row.apellidos || '',
    nombres: row.nombres || '',
    nombre: row.nombre || [row.apellidos, row.nombres].filter(Boolean).join(' ').trim(),
    email: row.email || '',
    telefono: row.telefono || '',
    cargo: row.cargo || '',
    rol: row.rol,
    activo: row.activo,
    estado: row.activo ? 'Activo' : 'Inactivo',
    area_id: row.area_id,
    idArea: row.area_id,
    codigo_centro_costo: row.codigo_centro_costo || '',
    centro,
    descripcionArea: row.descripcion_area || '',
    descripcion_area: row.descripcion_area || '',
    permisos,
    debeCambiarPassword: row.debe_cambiar_password !== false,
    estado_password: getEstadoPassword(row),
    ultimo_acceso: row.ultimo_acceso || null,
    fecha_cambio_password: row.fecha_cambio_password || null,
    fecha_reset_password: row.fecha_reset_password || null,
    auditoria: row.auditoria || [],
    usuario_creacion: row.usuario_creacion || '',
    usuario_modificacion: row.usuario_modificacion || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function pushAuditoria(existing, entry) {
  const list = Array.isArray(existing) ? [...existing] : [];
  list.unshift({ ...entry, fecha: new Date().toISOString() });
  return list.slice(0, 100);
}

function auditPermisosDiff(prevRaw, nextRaw, actor) {
  const prev = normalizePermisos(prevRaw);
  const next = normalizePermisos(nextRaw);
  const entries = [];
  const diffList = (key, label) => {
    const pSet = new Set(prev[key] || []);
    const nSet = new Set(next[key] || []);
    nSet.forEach((v) => { if (!pSet.has(v)) entries.push({ usuario: actor, accion: `Agregó ${label} ${v}` }); });
    pSet.forEach((v) => { if (!nSet.has(v)) entries.push({ usuario: actor, accion: `Quitó ${label} ${v}` }); });
  };
  diffList('actividades', 'permiso');
  diffList('submodulos', 'submódulo');
  diffList('modulos', 'módulo');
  return entries;
}

async function requireAdmin(req, res, next) {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const { rows } = await query('SELECT rol FROM usuarios WHERE id = $1 AND activo = TRUE', [userId]);
    if (!rows.length || rows[0].rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
    next();
  } catch (err) { next(err); }
}

router.use(requireAdmin);

// GET /api/usuarios/areas-buscar?q=
router.get('/areas-buscar', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ data: [] });
    const { rows } = await query(`
      SELECT a.id AS id_area,
             a.codigo AS codigo_area,
             a.nombre AS descripcion_area,
             a.responsable,
             COALESCE(c.codigo, a.responsable, '') AS centro,
             COALESCE(a.codigo, '') AS codigo_centro_costo
      FROM areas a
      LEFT JOIN centros c ON a.centro_id = c.id
      WHERE a.codigo ILIKE $1 OR a.nombre ILIKE $1 OR a.responsable ILIKE $1 OR c.codigo ILIKE $1
      ORDER BY a.nombre ASC
      LIMIT 15
    `, [`%${q}%`]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/usuarios
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize || '50', 10)));
    const offset = (page - 1) * pageSize;
    const search = (req.query.search || '').trim();
    const estado = (req.query.estado || '').trim();

    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      where += ` AND (u.dni ILIKE $${i} OR u.apellidos ILIKE $${i} OR u.nombres ILIKE $${i} OR u.nombre ILIKE $${i} OR u.email ILIKE $${i} OR u.descripcion_area ILIKE $${i} OR u.codigo_centro_costo ILIKE $${i} OR u.centro ILIKE $${i} OR a.responsable ILIKE $${i})`;
    }
    if (estado === 'Activo') where += ' AND u.activo = TRUE';
    if (estado === 'Inactivo') where += ' AND u.activo = FALSE';

    const countRes = await query(`SELECT COUNT(*)::int AS total ${USER_FROM} ${where}`, params);
    const total = countRes.rows[0].total;
    params.push(pageSize, offset);
    const { rows } = await query(`
      SELECT u.*, a.responsable AS area_responsable, c.codigo AS centro_codigo
      ${USER_FROM} ${where}
      ORDER BY u.apellidos ASC NULLS LAST, u.nombres ASC NULLS LAST, u.id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({ data: rows.map(mapUser), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (err) { next(err); }
});

// GET /api/usuarios/export — todos los registros para Excel
router.get('/export', async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const estado = (req.query.estado || '').trim();
    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      where += ` AND (u.dni ILIKE $${i} OR u.apellidos ILIKE $${i} OR u.nombres ILIKE $${i} OR u.nombre ILIKE $${i} OR u.email ILIKE $${i} OR u.descripcion_area ILIKE $${i} OR u.codigo_centro_costo ILIKE $${i} OR u.centro ILIKE $${i} OR a.responsable ILIKE $${i})`;
    }
    if (estado === 'Activo') where += ' AND u.activo = TRUE';
    if (estado === 'Inactivo') where += ' AND u.activo = FALSE';
    const { rows } = await query(`
      SELECT u.*, a.responsable AS area_responsable, c.codigo AS centro_codigo
      ${USER_FROM} ${where}
      ORDER BY u.apellidos ASC NULLS LAST, u.nombres ASC NULLS LAST, u.id ASC
    `, params);
    res.json({ data: rows.map(mapUser), total: rows.length });
  } catch (err) { next(err); }
});

async function resolveAreaId(codigoCentro, descripcionArea, centro) {
  if (!codigoCentro && !descripcionArea && !centro) return null;
  const { rows } = await query(`
    SELECT a.id FROM areas a
    LEFT JOIN centros c ON a.centro_id = c.id
    WHERE ($1 <> '' AND (a.codigo ILIKE $1 OR a.nombre ILIKE $1 OR c.codigo ILIKE $1))
       OR ($2 <> '' AND a.nombre ILIKE $2)
       OR ($3 <> '' AND c.codigo ILIKE $3)
    ORDER BY a.id ASC LIMIT 1
  `, [codigoCentro || '', descripcionArea ? `%${descripcionArea}%` : '', centro || '']);
  return rows[0]?.id || null;
}

// POST /api/usuarios/import — importación masiva desde Excel (JSON)
router.post('/import', async (req, res, next) => {
  try {
    const b = req.body || {};
    const actor = b.usuario_operacion || 'admin';
    const items = Array.isArray(b.usuarios) ? b.usuarios : [];
    if (!items.length) return res.status(400).json({ error: 'No hay registros para importar' });

    const result = { creados: 0, actualizados: 0, errores: [] };

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const dni = String(row.dni || '').trim();
      if (!dni) {
        result.errores.push({ fila: i + 1, error: 'DNI vacío' });
        continue;
      }

      try {
        const apellidos = row.apellidos || [row.apellido_paterno, row.apellido_materno].filter(Boolean).join(' ').trim();
        const nombres = row.nombres || '';
        const nombre = [apellidos, nombres].filter(Boolean).join(' ').trim() || dni;
        const activo = row.estado === 'Inactivo' || row.activo === false ? false : true;
        const rol = row.rol || 'usuario';
        const permisos = normalizePermisos(row.permisos, rol);
        const areaId = row.idArea || row.area_id || await resolveAreaId(
          row.codigo_centro_costo || '',
          row.descripcion_area || row.descripcionArea || '',
          row.centro || '',
        );

        const { rows: existing } = await query('SELECT * FROM usuarios WHERE dni = $1', [dni]);

        if (existing.length) {
          const prev = existing[0];
          let auditoria = pushAuditoria(prev.auditoria || [], { usuario: actor, accion: 'Actualizó desde importación Excel' });
          await query(`
            UPDATE usuarios SET
              apellidos = $2, nombres = $3, nombre = $4, email = $5, telefono = $6, cargo = COALESCE($7, cargo),
              activo = $8, area_id = COALESCE($9, area_id),
              codigo_centro_costo = $10, descripcion_area = $11, centro = $12,
              usuario_modificacion = $13, updated_at = NOW(), auditoria = $14
            WHERE id = $1
          `, [
            prev.id, apellidos, nombres, nombre, row.email || prev.email, row.telefono || prev.telefono,
            row.cargo || null, activo, areaId,
            row.codigo_centro_costo || prev.codigo_centro_costo,
            row.descripcion_area || row.descripcionArea || prev.descripcion_area,
            row.centro || prev.centro || '',
            actor, JSON.stringify(auditoria),
          ]);
          result.actualizados++;
        } else {
          const hash = await bcrypt.hash(row.password || dni, 10);
          const loginUser = String(row.username || dni).trim().toLowerCase();
          await query(`
            INSERT INTO usuarios (
              dni, username, apellidos, nombres, nombre, email, telefono, cargo, rol, password_hash, activo,
              debe_cambiar_password, area_id, codigo_centro_costo, descripcion_area, centro, permisos, auditoria,
              usuario_creacion, usuario_modificacion
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12,$13,$14,$15,$16,$17,$18,$18)
          `, [
            dni, loginUser, apellidos, nombres, nombre, row.email || '', row.telefono || '', row.cargo || '',
            rol, hash, activo, areaId,
            row.codigo_centro_costo || '', row.descripcion_area || row.descripcionArea || '', row.centro || '',
            JSON.stringify(permisos),
            JSON.stringify(pushAuditoria([], { usuario: actor, accion: 'Importó desde Excel' })),
            actor,
          ]);
          result.creados++;
        }
      } catch (err) {
        result.errores.push({ fila: i + 1, dni, error: err.message || 'Error al procesar' });
      }
    }

    res.json(result);
  } catch (err) { next(err); }
});

// PATCH /api/usuarios/:id/estado
router.patch('/:id/estado', async (req, res, next) => {
  try {
    const actor = req.body?.usuario_operacion || req.headers['x-user-name'] || 'admin';
    const activo = req.body?.estado === 'Inactivo' ? false
      : (req.body?.estado === 'Activo' ? true : req.body?.activo !== false);
    const { rows: cur } = await query('SELECT * FROM usuarios WHERE id = $1', [req.params.id]);
    if (!cur.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const auditoria = pushAuditoria(cur[0].auditoria, {
      usuario: actor,
      accion: activo ? 'Activó usuario' : 'Desactivó usuario',
    });
    const { rows } = await query(`
      UPDATE usuarios SET activo = $2, auditoria = $3, usuario_modificacion = $4, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id, activo, JSON.stringify(auditoria), actor]);
    res.json(mapUser(rows[0]));
  } catch (err) { next(err); }
});

// POST /api/usuarios/:id/reset-password
router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const b = req.body || {};
    const actor = b.usuario_operacion || 'admin';
    const tempPassword = String(b.password_temporal || b.password || '').trim();
    if (!tempPassword) return res.status(400).json({ error: 'Contraseña temporal requerida' });

    const { rows: cur } = await query('SELECT * FROM usuarios WHERE id = $1', [req.params.id]);
    if (!cur.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const prev = cur[0];

    const hash = await bcrypt.hash(tempPassword, 10);
    let auditoria = pushAuditoria(prev.auditoria || [], {
      usuario: actor,
      accion: 'Restableció contraseña',
    });

    const { rows } = await query(`
      UPDATE usuarios SET
        password_hash = $2,
        debe_cambiar_password = TRUE,
        fecha_reset_password = NOW(),
        usuario_reset_password = $3,
        auditoria = $4,
        usuario_modificacion = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [req.params.id, hash, actor, JSON.stringify(auditoria)]);

    const u = mapUser(rows[0]);
    res.json({
      ok: true,
      user: u,
      credenciales: {
        username: u.username,
        password_temporal: tempPassword,
        mensaje: buildCredentialsMessage(u.username, tempPassword, b.system_url || ''),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/usuarios/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT u.*, a.responsable AS area_responsable, c.codigo AS centro_codigo
      ${USER_FROM}
      WHERE u.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(mapUser(rows[0]));
  } catch (err) { next(err); }
});

// POST /api/usuarios
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const actor = b.usuario_operacion || 'admin';
    const username = String(b.username || '').trim().toLowerCase();
    if (!b.dni) return res.status(400).json({ error: 'DNI requerido' });
    if (!username) return res.status(400).json({ error: 'Usuario (login) requerido' });
    if (!b.email) return res.status(400).json({ error: 'Correo requerido' });
    if (!b.nombres || !b.apellidos) return res.status(400).json({ error: 'Nombres y apellidos requeridos' });
    if (!b.cargo) return res.status(400).json({ error: 'Cargo requerido' });
    if (!b.descripcion_area && !b.descripcionArea && !b.idArea) {
      return res.status(400).json({ error: 'Área usuaria requerida' });
    }
    const tempPassword = String(b.password || b.password_temporal || '').trim();
    if (!tempPassword) return res.status(400).json({ error: 'Contraseña temporal requerida' });

    const permisos = normalizePermisos(b.permisos, b.rol || 'usuario');
    const hash = await bcrypt.hash(tempPassword, 10);
    const nombre = [b.apellidos, b.nombres].filter(Boolean).join(' ').trim() || b.nombre || b.dni;
    const activo = b.estado !== 'Inactivo' && b.activo !== false;

    const { rows } = await query(`
      INSERT INTO usuarios (
        dni, username, apellidos, nombres, nombre, email, telefono, cargo, rol, password_hash, activo,
        debe_cambiar_password, area_id, codigo_centro_costo, descripcion_area, centro, permisos, auditoria,
        usuario_creacion, usuario_modificacion
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12,$13,$14,$15,$16,$17,$18,$18)
      RETURNING *
    `, [
      b.dni, username, b.apellidos || '', b.nombres || '', nombre, b.email || '', b.telefono || '',
      b.cargo || '', b.rol || 'usuario', hash, activo,
      b.idArea || b.area_id || null, b.codigo_centro_costo || '', b.descripcion_area || b.descripcionArea || '', b.centro || '',
      JSON.stringify(permisos),
      JSON.stringify(pushAuditoria([], { usuario: actor, accion: 'Creó usuario' })),
      actor,
    ]);
    const user = mapUser(rows[0]);
    const systemUrl = b.system_url || req.headers.origin || '';
    res.status(201).json({
      user,
      credenciales: {
        username,
        password_temporal: tempPassword,
        mensaje: buildCredentialsMessage(username, tempPassword, systemUrl),
      },
    });
  } catch (err) {
    if (String(err.message || '').includes('duplicate')) {
      if (String(err.message).includes('username')) return res.status(400).json({ error: 'Usuario (login) ya registrado' });
      return res.status(400).json({ error: 'DNI ya registrado' });
    }
    next(err);
  }
});

// PUT /api/usuarios/:id
router.put('/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const actor = b.usuario_operacion || 'admin';
    const { rows: cur } = await query('SELECT * FROM usuarios WHERE id = $1', [req.params.id]);
    if (!cur.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const prev = cur[0];

    const permisos = b.permisos ? normalizePermisos(b.permisos, b.rol || prev.rol) : normalizePermisos(prev.permisos, prev.rol);
    const nombre = [b.apellidos ?? prev.apellidos, b.nombres ?? prev.nombres].filter(Boolean).join(' ').trim() || prev.nombre;
    const activo = b.estado === 'Inactivo' ? false : (b.estado === 'Activo' ? true : (b.activo ?? prev.activo));

    let auditoria = prev.auditoria || [];
    auditoria = pushAuditoria(auditoria, { usuario: actor, accion: 'Actualizó datos del usuario' });
    if (JSON.stringify(prev.permisos) !== JSON.stringify(permisos)) {
      auditPermisosDiff(prev.permisos, permisos, actor).forEach((e) => {
        auditoria = pushAuditoria(auditoria, e);
      });
    }

    const { rows } = await query(`
      UPDATE usuarios SET
        dni = COALESCE($2, dni), username = COALESCE($3, username), apellidos = $4, nombres = $5, nombre = $6,
        email = $7, telefono = $8, cargo = $9, rol = COALESCE($10, rol), activo = $11,
        area_id = $12, codigo_centro_costo = $13, descripcion_area = $14, centro = $15,
        permisos = $16, auditoria = $17, usuario_modificacion = $18, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [
      req.params.id, b.dni, b.username ? String(b.username).trim().toLowerCase() : null,
      b.apellidos ?? prev.apellidos, b.nombres ?? prev.nombres, nombre,
      b.email ?? prev.email, b.telefono ?? prev.telefono, b.cargo ?? prev.cargo, b.rol,
      activo, b.idArea ?? b.area_id ?? prev.area_id, b.codigo_centro_costo ?? prev.codigo_centro_costo,
      b.descripcion_area ?? b.descripcionArea ?? prev.descripcion_area,
      b.centro ?? prev.centro ?? '',
      JSON.stringify(permisos), JSON.stringify(auditoria), actor,
    ]);
    res.json(mapUser(rows[0]));
  } catch (err) { next(err); }
});

// DELETE /api/usuarios/:id (desactivar)
router.delete('/:id', async (req, res, next) => {
  try {
    const actor = req.headers['x-user-name'] || 'admin';
    const { rows: cur } = await query('SELECT auditoria FROM usuarios WHERE id = $1', [req.params.id]);
    if (!cur.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const auditoria = pushAuditoria(cur[0].auditoria, { usuario: actor, accion: 'Desactivó usuario' });
    const { rows } = await query(`
      UPDATE usuarios SET activo = FALSE, updated_at = NOW(),
        auditoria = $2::jsonb, usuario_modificacion = $3
      WHERE id = $1 RETURNING id
    `, [req.params.id, JSON.stringify(auditoria), actor]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export { mapUser, normalizePermisos, permisosFromRol, allPermisos };
export default router;

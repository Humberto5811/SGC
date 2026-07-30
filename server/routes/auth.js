// Autenticación y gestión de contraseñas
import express from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db.js';
import { normalizePermisos } from '../lib/permissionsCatalog.js';

const router = express.Router();

function pushAuditoria(existing, entry) {
  const list = Array.isArray(existing) ? [...existing] : [];
  list.unshift({ ...entry, fecha: new Date().toISOString() });
  return list.slice(0, 100);
}

export function getEstadoPassword(row) {
  if (!row.debe_cambiar_password) return 'Configurada';
  if (row.fecha_reset_password) return 'Restablecida';
  return 'Cambio pendiente';
}

export function buildSafeUser(row) {
  const raw = row.permisos;
  const hasStoredObject = raw != null && typeof raw === 'object';
  const hasExplicitGrants = hasStoredObject && (
    (Array.isArray(raw.modulos) && raw.modulos.length > 0)
    || (Array.isArray(raw.submodulos) && raw.submodulos.length > 0)
  );
  // Con grants guardados: respetar JSON. Sin grants: plantilla por rol (compat au/dec).
  const permisos = normalizePermisos(raw, row.rol, { explicit: hasExplicitGrants });
  const centro = row.centro || row.area_responsable || row.centro_codigo || '';
  return {
    id: row.id,
    dni: row.dni,
    username: row.username || row.dni,
    apellidos: row.apellidos || '',
    nombres: row.nombres || '',
    nombre: row.nombre || [row.apellidos, row.nombres].filter(Boolean).join(' ').trim(),
    rol: row.rol,
    email: row.email || '',
    telefono: row.telefono || '',
    cargo: row.cargo || '',
    area_id: row.area_id,
    codigo_centro_costo: row.codigo_centro_costo || '',
    descripcion_area: row.descripcion_area || '',
    centro,
    permisos,
    debeCambiarPassword: row.debe_cambiar_password !== false,
    estado_password: getEstadoPassword(row),
    ultimo_acceso: row.ultimo_acceso || null,
    fecha_cambio_password: row.fecha_cambio_password || null,
    ultimo_cierre_sesion: row.ultimo_cierre_sesion || null,
  };
}

const USER_LOOKUP = `
  SELECT u.*, a.responsable AS area_responsable, c.codigo AS centro_codigo
  FROM usuarios u
  LEFT JOIN areas a ON u.area_id = a.id
  LEFT JOIN centros c ON a.centro_id = c.id
  WHERE (LOWER(u.username) = LOWER($1) OR u.dni = $1) AND u.activo = TRUE
  LIMIT 1
`;

router.post('/login', async (req, res, next) => {
  try {
    const { username, dni, password } = req.body || {};
    const loginId = String(username || dni || '').trim();
    if (!loginId || !password) {
      return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
    }

    const { rows } = await query(USER_LOOKUP, [loginId]);
    const user = rows[0];
    if (!user) return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    if (!user.password_hash) {
      return res.status(401).json({ success: false, error: 'Cuenta sin contraseña configurada. Contacte al administrador.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, error: 'Credenciales inválidas' });

    const now = new Date();
    const auditoria = pushAuditoria(user.auditoria || [], {
      usuario: user.username || user.dni,
      accion: 'Inició sesión',
    });

    await query(`
      UPDATE usuarios SET ultimo_acceso = $2, auditoria = $3, updated_at = NOW() WHERE id = $1
    `, [user.id, now, JSON.stringify(auditoria)]);

    user.ultimo_acceso = now;
    res.json({ success: true, user: buildSafeUser(user) });
  } catch (err) { next(err); }
});

router.post('/cambio-password', async (req, res, next) => {
  try {
    const { userId, username, password_actual, password_nueva, password_confirmacion } = req.body || {};
    const nueva = String(password_nueva || '').trim();
    const confirm = String(password_confirmacion || '').trim();
    const actual = String(password_actual || '');

    if (!actual) return res.status(400).json({ success: false, error: 'Ingrese la contraseña actual' });
    if (nueva.length < 8) return res.status(400).json({ success: false, error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    if (nueva !== confirm) return res.status(400).json({ success: false, error: 'La confirmación no coincide con la nueva contraseña' });

    let user;
    if (userId) {
      const { rows } = await query(`
        SELECT u.*, a.responsable AS area_responsable, c.codigo AS centro_codigo
        FROM usuarios u
        LEFT JOIN areas a ON u.area_id = a.id
        LEFT JOIN centros c ON a.centro_id = c.id
        WHERE u.id = $1 AND u.activo = TRUE
      `, [userId]);
      user = rows[0];
    } else if (username) {
      const { rows } = await query(USER_LOOKUP, [String(username).trim()]);
      user = rows[0];
    }
    if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const ok = await bcrypt.compare(actual, user.password_hash || '');
    if (!ok) return res.status(401).json({ success: false, error: 'Contraseña actual incorrecta' });

    const hash = await bcrypt.hash(nueva, 10);
    const actor = user.username || user.dni;
    const auditoria = pushAuditoria(user.auditoria || [], { usuario: actor, accion: 'Cambió contraseña' });

    const { rows: updated } = await query(`
      UPDATE usuarios SET
        password_hash = $2,
        debe_cambiar_password = FALSE,
        fecha_cambio_password = NOW(),
        auditoria = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [user.id, hash, JSON.stringify(auditoria)]);

    const u = updated[0];
    const { rows: extra } = await query(`
      SELECT a.responsable AS area_responsable, c.codigo AS centro_codigo
      FROM usuarios u
      LEFT JOIN areas a ON u.area_id = a.id
      LEFT JOIN centros c ON a.centro_id = c.id
      WHERE u.id = $1
    `, [u.id]);
    res.json({ success: true, user: buildSafeUser({ ...u, ...extra[0] }) });
  } catch (err) { next(err); }
});

router.post('/logout', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.json({ ok: true });
    const actor = req.headers['x-user-name'] || 'usuario';
    const { rows: cur } = await query('SELECT auditoria FROM usuarios WHERE id = $1', [userId]);
    if (!cur.length) return res.json({ ok: true });
    const auditoria = pushAuditoria(cur[0].auditoria, { usuario: actor, accion: 'Cerró sesión' });
    await query(`
      UPDATE usuarios SET ultimo_cierre_sesion = NOW(), auditoria = $2, updated_at = NOW() WHERE id = $1
    `, [userId, JSON.stringify(auditoria)]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export function buildCredentialsMessage(username, tempPassword, systemUrl) {
  return [
    'Sistema de Gestión de Contrataciones (SGC)',
    '',
    'Acceso al sistema:',
    systemUrl || 'https://direccion-del-sistema',
    '',
    'Usuario:',
    username,
    '',
    'Contraseña temporal:',
    tempPassword,
    '',
    'Por seguridad deberá cambiar la contraseña en su primer ingreso.',
  ].join('\n');
}

export default router;

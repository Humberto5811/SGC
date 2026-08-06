/** Diagnóstico READ-ONLY RC8.6E — no modifica datos. */
import { query } from '../server/db.js';

const u = await query(`
  SELECT id, username, nombre, activo, rol, permisos
  FROM usuarios
  WHERE username ILIKE 'jcrisostomo' OR id = 260
  LIMIT 5
`);
console.log('USER', u.rows.map((r) => ({
  id: r.id, username: r.username, nombre: r.nombre, activo: r.activo, rol: r.rol,
  permisos: r.permisos,
})));

const uid = u.rows[0]?.id;
const req = await query(`SELECT id, codigo, estado, estado_actual, responsable_actual FROM requerimientos WHERE codigo = 'REQ-00002'`);
console.log('REQ', req.rows);

if (req.rows[0] && uid) {
  const rid = req.rows[0].id;
  const asg = await query(`
    SELECT id, requerimiento_id, etapa_codigo, usuario_id, unidad_codigo, tipo_responsable,
           origen_asignacion, activo, asignado_at, cerrado_at, asignado_por, motivo
    FROM expediente_asignaciones
    WHERE requerimiento_id = $1
    ORDER BY asignado_at DESC NULLS LAST, id DESC
    LIMIT 10
  `, [rid]);
  console.log('ASIGNACIONES', asg.rows);

  const vig = await query(`SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1`, [rid]);
  console.log('VIGENTE', vig.rows);
}

if (uid) {
  // Esquema permisos — explorar tablas
  const tables = await query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name ~* 'permis|rol|submodul|usuario'
    ORDER BY 1
  `);
  console.log('TABLES', tables.rows.map((r) => r.table_name));

  try {
    const perms = await query(`
      SELECT DISTINCT COALESCE(s.codigo, p.codigo, p.nombre) AS key, rp.*
      FROM usuario_roles ur
      JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
      JOIN permisos p ON p.id = rp.permiso_id
      LEFT JOIN submodulos s ON s.id = p.submodulo_id
      WHERE ur.usuario_id = $1
        AND (
          COALESCE(s.codigo,'') ILIKE '%CCP%'
          OR COALESCE(p.codigo,'') ILIKE '%CCP%'
          OR COALESCE(p.nombre,'') ILIKE '%CCP%'
        )
    `, [uid]);
    console.log('PERMS_CCP', perms.rows);
  } catch (e) {
    console.log('PERMS_CCP_ERR', e.message);
  }

  try {
    const roles = await query(`
      SELECT r.id, r.codigo, r.nombre
      FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id
      WHERE ur.usuario_id = $1
    `, [uid]);
    console.log('ROLES', roles.rows);
  } catch (e) {
    console.log('ROLES_ERR', e.message);
    try {
      const u2 = await query(`SELECT * FROM usuarios WHERE id = $1`, [uid]);
      console.log('USER_FULL_KEYS', Object.keys(u2.rows[0] || {}));
    } catch (_) {}
  }

  // Asignaciones activas CCP del usuario
  const myAsg = await query(`
    SELECT a.*, r.codigo AS req_codigo
    FROM expediente_asignaciones a
    JOIN requerimientos r ON r.id = a.requerimiento_id
    WHERE a.usuario_id = $1 AND a.activo = TRUE AND UPPER(a.etapa_codigo) = 'CCP'
  `, [uid]);
  console.log('MY_ASG_CCP', myAsg.rows);
}

process.exit(0);

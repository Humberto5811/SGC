import 'dotenv/config';
import { query } from '../server/db.js';
import { resolveAccesoCcp } from '../server/lib/accesoCcp.js';
import { listarBandejaCcp } from '../server/lib/ccpCertificacion.js';
import { listarBandejaOrdenes } from '../server/lib/ordenesContratacion.js';

const users = await query(`
  SELECT id, username, rol, activo, permisos
  FROM usuarios
  WHERE LOWER(username) IN ('admin','jcrisostomo','au') OR id = 260
`);
console.log('USERS');
for (const u of users.rows) {
  const p = typeof u.permisos === 'string' ? JSON.parse(u.permisos || '{}') : (u.permisos || {});
  console.log({
    id: u.id,
    username: u.username,
    rol: u.rol,
    submodulos: p.submodulos || [],
    actsCcp: p.actividadesPorSubmodulo?.CCP,
    actsRo: p.actividadesPorSubmodulo?.REGISTRO_ORDENES_CONTRATACION,
  });
}

const reqs = await query(`
  SELECT r.id, r.codigo, r.estado_actual, r.tipo,
    v.etapa_codigo, v.estado_codigo, v.responsable_usuario_id, v.responsable_tipo,
    v.responsable_unidad,
    (SELECT codigo_ccp FROM ccp_codigos c WHERE c.requerimiento_id=r.id AND c.estado='ACTIVO' ORDER BY id DESC LIMIT 1) AS codigo_ccp,
    (SELECT cc.estado FROM cuadros_comparativos cc
      JOIN solicitud_requerimientos sr ON sr.solicitud_id=cc.solicitud_id
      WHERE sr.requerimiento_id=r.id ORDER BY cc.id DESC LIMIT 1) AS cuadro_estado,
    (SELECT sc.estado FROM solicitudes_cotizacion sc
      JOIN solicitud_requerimientos sr ON sr.solicitud_id=sc.id
      WHERE sr.requerimiento_id=r.id ORDER BY sc.id DESC LIMIT 1) AS sc_estado
  FROM requerimientos r
  LEFT JOIN expediente_estado_vigente v ON v.requerimiento_id=r.id
  WHERE r.codigo IN ('REQ-00001','REQ-00002')
`);
console.log('REQS', JSON.stringify(reqs.rows, null, 2));

const asg = await query(`
  SELECT a.id, a.requerimiento_id, r.codigo, a.usuario_id, u.username, a.etapa_codigo, a.activo, a.asignado_at
  FROM expediente_asignaciones a
  JOIN requerimientos r ON r.id=a.requerimiento_id
  LEFT JOIN usuarios u ON u.id=a.usuario_id
  WHERE r.codigo IN ('REQ-00001','REQ-00002')
  ORDER BY a.requerimiento_id, a.id
`);
console.log('ASIGNACIONES', JSON.stringify(asg.rows, null, 2));

const ordenes = await query(`
  SELECT o.id, o.requerimiento_id, r.codigo, o.numero_orden, o.estado
  FROM ordenes_contratacion o
  JOIN requerimientos r ON r.id=o.requerimiento_id
  WHERE r.codigo IN ('REQ-00001','REQ-00002')
`);
console.log('ORDENES', JSON.stringify(ordenes.rows, null, 2));

for (const u of users.rows) {
  if (!['admin', 'jcrisostomo', 'au'].includes(String(u.username).toLowerCase())) continue;
  const a = await resolveAccesoCcp({ usuarioId: u.id, actividad: 'VER', userRow: u });
  console.log('ACCESO_CCP', u.username, {
    modo: a.modo,
    permitido: a.permitido,
    motivo: a.motivo,
    ids: a.alcanceRequerimientoIds,
  });
}

const ccp = await listarBandejaCcp();
const ro = await listarBandejaOrdenes();
console.log('CCP_COUNT', ccp.length, 'codes', ccp.map((x) => x.requerimiento_codigo));
console.log('RO_COUNT', ro.length, 'codes', ro.map((x) => x.requerimiento_codigo));
console.log('CCP has 00001', ccp.some((x) => x.requerimiento_codigo === 'REQ-00001'));
console.log('CCP has 00002', ccp.some((x) => x.requerimiento_codigo === 'REQ-00002'));
console.log('RO has 00001', ro.some((x) => x.requerimiento_codigo === 'REQ-00001'));
console.log('RO has 00002', ro.some((x) => x.requerimiento_codigo === 'REQ-00002'));

process.exit(0);

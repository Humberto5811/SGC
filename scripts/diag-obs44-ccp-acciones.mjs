/** Diagnóstico READ-ONLY Observación 44 — REQ-00002 CCP acciones. */
import { query } from '../server/db.js';
import { ccpMenuItems } from '../src/utils/bandejaActions.js';
import { resolveAccesoCcp } from '../server/lib/accesoCcp.js';

const { rows: reqs } = await query(`
  SELECT r.id, r.codigo, r.tipo, r.estado, r.estado_actual
  FROM requerimientos r WHERE r.codigo = 'REQ-00002'
`);
const r = reqs[0];
console.log('REQ', r);

const vig = await query(`SELECT * FROM expediente_estado_vigente WHERE requerimiento_id=$1`, [r.id]);
console.log('VIGENTE', vig.rows[0]);

const cod = await query(`SELECT * FROM ccp_codigos WHERE requerimiento_id=$1 ORDER BY id DESC LIMIT 3`, [r.id]);
console.log('CODIGOS', cod.rows);

const link = await query(`
  SELECT csr.*, sol.codigo_interno, sol.estado AS sol_estado
  FROM ccp_solicitud_requerimientos csr
  JOIN ccp_solicitudes sol ON sol.id = csr.solicitud_id
  WHERE csr.requerimiento_id = $1
  ORDER BY csr.id DESC LIMIT 5
`, [r.id]);
console.log('SOLICITUD_LINK', link.rows);

const jc = await query(`SELECT id, username, rol, permisos FROM usuarios WHERE username ILIKE 'jcrisostomo'`);
const u = jc.rows[0];
const acceso = await resolveAccesoCcp({ usuarioId: u.id, actividad: 'VER', userRow: u });
console.log('ACCESO_JC', { modo: acceso.modo, permitido: acceso.permitido, ids: acceso.alcanceRequerimientoIds });

const rowFake = {
  requerimiento_id: r.id,
  codigo_ccp: cod.rows[0]?.codigo_ccp || '',
  tiene_codigo: !!cod.rows.find((c) => c.estado === 'ACTIVO'),
  consolidacion_id: link.rows.find((x) => x.activo !== false)?.solicitud_id || null,
  origen_ccp: 'RECEPCION_COTIZACION_LOCACION',
};
console.log('MENU_ITEMS', ccpMenuItems(rowFake, { canManage: true }));
console.log('MENU_SIN_CONSOL', ccpMenuItems({ ...rowFake, consolidacion_id: null }, { canManage: true }));

process.exit(0);

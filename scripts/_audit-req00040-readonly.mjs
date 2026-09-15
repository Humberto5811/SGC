/** REQ-00040 — solo lectura. */
import { query } from '../server/db.js';
import pool from '../server/db.js';

const { rows: reqRows } = await query(
  `SELECT id, codigo, estado, estado_actual, payload FROM requerimientos WHERE codigo = $1 LIMIT 1`,
  ['REQ-00040'],
);
const req = reqRows[0];
if (!req) {
  console.log(JSON.stringify({ error: 'REQ-00040 no encontrado' }, null, 2));
  await pool.end();
  process.exit(0);
}
const rid = req.id;

const { rows: erv } = await query(
  `SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
  [rid],
);

const { rows: asig } = await query(
  `SELECT id, etapa_codigo, tipo_responsable, usuario_id, unidad_codigo, activo, asignado_at, cerrado_at, motivo, origen_asignacion
   FROM expediente_asignaciones WHERE requerimiento_id = $1 ORDER BY asignado_at ASC, id ASC`,
  [rid],
);

const { rows: ev } = await query(
  `SELECT id, evento_codigo, etapa_origen, etapa_destino, actor_id, actor_rol, responsable_destino,
          metadata, created_at
   FROM workflow_eventos WHERE expediente_id = $1 ORDER BY id DESC LIMIT 40`,
  [rid],
);

let obs = [];
try {
  const { rows } = await query(
    `SELECT * FROM workflow_observaciones WHERE expediente_id = $1 ORDER BY id ASC`,
    [rid],
  );
  obs = rows;
} catch (e) {
  obs = { error: e.message };
}

let payloadObs = [];
try {
  const p = JSON.parse(req.payload || '{}');
  payloadObs = p.observaciones || [];
} catch (_) {}

console.log(JSON.stringify({
  requerimiento_id: rid,
  codigo: req.codigo,
  legacy_estado: req.estado,
  legacy_estado_actual: req.estado_actual,
  A_expediente_estado_vigente: erv[0] || null,
  B_expediente_asignaciones: asig,
  C_workflow_eventos: ev,
  D_workflow_observaciones_table: obs,
  payload_observaciones_count: Array.isArray(payloadObs) ? payloadObs.length : 0,
  payload_observaciones: payloadObs,
}, null, 2));

await pool.end();

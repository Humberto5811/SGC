/**
 * Descubrimiento y limpieza del fixture RC8156G5 (test G-5).
 * Solo afecta órdenes RC8156G5* y usuarios g5_*.
 */
import { query } from '../../server/db.js';

const ORDEN_PATTERN = '^RC8156G5';
const USER_PATTERN = '^g5_';

export async function discoverRc8156G5Fixture(runQuery = query) {
  const ordenes = (await runQuery(`
    SELECT id, numero_orden, anio_orden, requerimiento_id, estado
    FROM ordenes_contratacion
    WHERE numero_orden ~ $1
    ORDER BY id
  `, [ORDEN_PATTERN])).rows;

  const usuarios = (await runQuery(`
    SELECT id, username, dni
    FROM usuarios
    WHERE username ~ $1
    ORDER BY id
  `, [USER_PATTERN])).rows;

  const ordenIds = ordenes.map((o) => Number(o.id));
  const usuarioIds = usuarios.map((u) => Number(u.id));

  let entregas = [];
  let recepciones = [];
  let recepcionDocumentos = [];
  let eventos = [];
  let asignaciones = [];
  let estados = [];
  let observaciones = [];
  let workflows = [];
  let actas = [];
  let visados = [];
  let penalidadEvaluaciones = [];

  if (ordenIds.length) {
    entregas = (await runQuery(`
      SELECT id, orden_id, numero_entrega, descripcion
      FROM orden_entregas WHERE orden_id = ANY($1::int[]) ORDER BY id
    `, [ordenIds])).rows;

    const entregaIds = entregas.map((e) => Number(e.id));

    recepciones = (await runQuery(`
      SELECT id, orden_id, orden_entrega_id, numero_recepcion, tipo_recepcion
      FROM entregable_recepciones WHERE orden_id = ANY($1::int[]) ORDER BY id
    `, [ordenIds])).rows;

    const recepcionIds = recepciones.map((r) => Number(r.id));
    if (recepcionIds.length) {
      recepcionDocumentos = (await runQuery(`
        SELECT id, recepcion_id, nombre_archivo
        FROM entregable_recepcion_documentos
        WHERE recepcion_id = ANY($1::int[])
        ORDER BY id
      `, [recepcionIds])).rows;
    }

    eventos = (await runQuery(`
      SELECT id, orden_id, orden_entrega_id, evento_codigo
      FROM entregable_eventos WHERE orden_id = ANY($1::int[]) ORDER BY id
    `, [ordenIds])).rows;

    penalidadEvaluaciones = (await runQuery(`
      SELECT id, orden_id, orden_entrega_id, estado_penalidad, usuario_evaluador_id
      FROM entregable_penalidad_evaluacion WHERE orden_id = ANY($1::int[]) ORDER BY id
    `, [ordenIds])).rows;

    if (entregaIds.length) {
      asignaciones = (await runQuery(`
        SELECT id, orden_entrega_id, usuario_id, etapa_codigo, activo
        FROM entregable_asignaciones WHERE orden_entrega_id = ANY($1::int[]) ORDER BY id
      `, [entregaIds])).rows;

      estados = (await runQuery(`
        SELECT orden_entrega_id, etapa_codigo, responsable_usuario_id
        FROM entregable_estado_vigente WHERE orden_entrega_id = ANY($1::int[]) ORDER BY orden_entrega_id
      `, [entregaIds])).rows;
    }

    observaciones = (await runQuery(`
      SELECT id, orden_id, orden_entrega_id, workflow_observacion_id, estado
      FROM entregable_observaciones WHERE orden_id = ANY($1::int[]) ORDER BY id
    `, [ordenIds])).rows;

    const workflowIds = [...new Set(
      observaciones.map((o) => Number(o.workflow_observacion_id)).filter((id) => id > 0),
    )];
    if (workflowIds.length) {
      workflows = (await runQuery(`
        SELECT id, estado, expediente_id, usuario_origen_id, usuario_destino_id, motivo
        FROM workflow_observaciones WHERE id = ANY($1::int[]) ORDER BY id
      `, [workflowIds])).rows;
    }

    actas = (await runQuery(`
      SELECT id, orden_id, orden_entrega_id, recepcion_id, version, numero_acta
      FROM entregable_conformidad_actas WHERE orden_id = ANY($1::int[]) ORDER BY id
    `, [ordenIds])).rows;

    visados = (await runQuery(`
      SELECT id, orden_id, orden_entrega_id, acta_id, version, nombre
      FROM entregable_conformidad_acta_visados WHERE orden_id = ANY($1::int[]) ORDER BY id
    `, [ordenIds])).rows;
  }

  if (usuarioIds.length) {
    const orphanWorkflows = (await runQuery(`
      SELECT id, estado, expediente_id, usuario_origen_id, usuario_destino_id
      FROM workflow_observaciones
      WHERE usuario_origen_id = ANY($1::int[]) OR usuario_destino_id = ANY($1::int[])
      ORDER BY id
    `, [usuarioIds])).rows;
    const known = new Set(workflows.map((w) => Number(w.id)));
    for (const row of orphanWorkflows) {
      if (!known.has(Number(row.id))) workflows.push(row);
    }

    const orphanPenalidad = (await runQuery(`
      SELECT id, orden_id, orden_entrega_id, estado_penalidad, usuario_evaluador_id
      FROM entregable_penalidad_evaluacion
      WHERE usuario_evaluador_id = ANY($1::int[])
      ORDER BY id
    `, [usuarioIds])).rows;
    const knownPen = new Set(penalidadEvaluaciones.map((p) => Number(p.id)));
    for (const row of orphanPenalidad) {
      if (!knownPen.has(Number(row.id))) penalidadEvaluaciones.push(row);
    }
  }

  return {
    ordenes,
    usuarios,
    entregas,
    recepciones,
    recepcionDocumentos,
    eventos,
    asignaciones,
    estados,
    observaciones,
    workflows,
    actas,
    visados,
    penalidadEvaluaciones,
    totals: {
      ordenes: ordenes.length,
      usuarios: usuarios.length,
      entregas: entregas.length,
      recepciones: recepciones.length,
      recepcionDocumentos: recepcionDocumentos.length,
      eventos: eventos.length,
      asignaciones: asignaciones.length,
      estados: estados.length,
      observaciones: observaciones.length,
      workflows: workflows.length,
      actas: actas.length,
      visados: visados.length,
      penalidadEvaluaciones: penalidadEvaluaciones.length,
    },
  };
}

export function hasRc8156G5Residuals(snapshot) {
  return Object.values(snapshot.totals).some((n) => n > 0);
}

export async function cleanupRc8156G5Fixture({
  apply = false,
  tracked = null,
  runQuery = query,
  getClient = null,
} = {}) {
  const snapshot = await discoverRc8156G5Fixture(runQuery);
  if (!hasRc8156G5Residuals(snapshot)) {
    return { snapshot, deleted: {}, skipped: true };
  }

  const ordenIds = tracked?.ordenIds?.length
    ? tracked.ordenIds.map(Number)
    : snapshot.ordenes.map((o) => Number(o.id));
  const entregaIds = tracked?.ordenEntregaIds?.length
    ? tracked.ordenEntregaIds.map(Number)
    : snapshot.entregas.map((e) => Number(e.id));
  const recepcionIds = tracked?.recepcionIds?.length
    ? tracked.recepcionIds.map(Number)
    : snapshot.recepciones.map((r) => Number(r.id));
  const observacionIds = tracked?.observacionIds?.length
    ? tracked.observacionIds.map(Number)
    : snapshot.observaciones.map((o) => Number(o.id));
  const workflowIds = tracked?.workflowIds?.length
    ? tracked.workflowIds.map(Number)
    : snapshot.workflows.map((w) => Number(w.id));
  const usuarioIds = tracked?.usuarioIds?.length
    ? tracked.usuarioIds.map(Number)
    : snapshot.usuarios.map((u) => Number(u.id));

  const plan = {
    penalidadEvaluaciones: snapshot.penalidadEvaluaciones
      .filter((r) => ordenIds.includes(Number(r.orden_id))
        || usuarioIds.includes(Number(r.usuario_evaluador_id)))
      .map((r) => r.id),
    eventos: snapshot.eventos.filter((r) => ordenIds.includes(Number(r.orden_id))).map((r) => r.id),
    observaciones: snapshot.observaciones.filter((r) => ordenIds.includes(Number(r.orden_id))).map((r) => r.id),
    workflows: workflowIds,
    asignaciones: snapshot.asignaciones.filter((r) => entregaIds.includes(Number(r.orden_entrega_id))).map((r) => r.id),
    estados: snapshot.estados.filter((r) => entregaIds.includes(Number(r.orden_entrega_id))).map((r) => r.orden_entrega_id),
    visados: snapshot.visados.filter((r) => ordenIds.includes(Number(r.orden_id))).map((r) => r.id),
    actas: snapshot.actas.filter((r) => ordenIds.includes(Number(r.orden_id))).map((r) => r.id),
    recepcionDocumentos: snapshot.recepcionDocumentos.filter((r) => recepcionIds.includes(Number(r.recepcion_id))).map((r) => r.id),
    recepciones: snapshot.recepciones.filter((r) => ordenIds.includes(Number(r.orden_id))).map((r) => r.id),
    entregas: snapshot.entregas.filter((r) => ordenIds.includes(Number(r.orden_id))).map((r) => r.id),
    ordenes: ordenIds,
    usuarios: usuarioIds,
  };

  if (!apply) {
    return { snapshot, plan, deleted: {}, skipped: false };
  }

  const steps = [
    ['penalidadEvaluaciones', 'DELETE FROM entregable_penalidad_evaluacion WHERE id = ANY($1::int[])', plan.penalidadEvaluaciones],
    ['eventos', 'DELETE FROM entregable_eventos WHERE id = ANY($1::int[])', plan.eventos],
    ['observaciones', 'DELETE FROM entregable_observaciones WHERE id = ANY($1::int[])', plan.observaciones],
    ['workflows', 'DELETE FROM workflow_observaciones WHERE id = ANY($1::int[])', plan.workflows],
    ['asignaciones', 'DELETE FROM entregable_asignaciones WHERE id = ANY($1::int[])', plan.asignaciones],
    ['estados', 'DELETE FROM entregable_estado_vigente WHERE orden_entrega_id = ANY($1::int[])', plan.estados],
    ['visados', 'DELETE FROM entregable_conformidad_acta_visados WHERE id = ANY($1::int[])', plan.visados],
    ['actas', 'DELETE FROM entregable_conformidad_actas WHERE id = ANY($1::int[])', plan.actas],
    ['recepcionDocumentos', 'DELETE FROM entregable_recepcion_documentos WHERE id = ANY($1::int[])', plan.recepcionDocumentos],
    ['recepciones', 'DELETE FROM entregable_recepciones WHERE id = ANY($1::int[])', plan.recepciones],
    ['entregas', 'DELETE FROM orden_entregas WHERE id = ANY($1::int[])', plan.entregas],
    ['ordenes', 'DELETE FROM ordenes_contratacion WHERE id = ANY($1::int[])', plan.ordenes],
    ['usuarios', 'DELETE FROM usuarios WHERE id = ANY($1::int[])', plan.usuarios],
  ];

  const exec = async (q) => {
    const deleted = {};
    for (const [key, sql, ids] of steps) {
      if (!ids.length) {
        deleted[key] = 0;
        continue;
      }
      const result = await q(sql, [ids]);
      deleted[key] = result.rowCount;
    }
    return deleted;
  };

  if (getClient) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const deleted = await exec((sql, params) => client.query(sql, params));
      await client.query('COMMIT');
      return { snapshot, plan, deleted, skipped: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const deleted = await exec((sql, params) => runQuery(sql, params));
  return { snapshot, plan, deleted, skipped: false };
}

export function printRc8156G5Snapshot(snapshot) {
  console.log('--- Candidatos RC8156G5 ---');
  console.log(`  ordenes: ${snapshot.totals.ordenes}`);
  for (const o of snapshot.ordenes) console.log(`    #${o.id} ${o.numero_orden}`);
  console.log(`  usuarios: ${snapshot.totals.usuarios}`);
  for (const u of snapshot.usuarios) console.log(`    #${u.id} ${u.username}`);
  console.log(`  entregas: ${snapshot.totals.entregas}`);
  console.log(`  recepciones: ${snapshot.totals.recepciones}`);
  console.log(`  recepcion_documentos: ${snapshot.totals.recepcionDocumentos}`);
  console.log(`  eventos: ${snapshot.totals.eventos}`);
  console.log(`  penalidad_evaluacion: ${snapshot.totals.penalidadEvaluaciones}`);
  console.log(`  asignaciones: ${snapshot.totals.asignaciones}`);
  console.log(`  estados: ${snapshot.totals.estados}`);
  console.log(`  observaciones: ${snapshot.totals.observaciones}`);
  console.log(`  workflows: ${snapshot.totals.workflows}`);
  console.log(`  actas: ${snapshot.totals.actas}`);
  console.log(`  visados: ${snapshot.totals.visados}`);
}

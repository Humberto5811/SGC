/**
 * RC8.15.6F-2D — Autorización alineada de trazabilidad (bandeja + endpoint).
 */
import pool, { query } from '../server/db.js';
import {
  inicializarEstadoResponsableEntregable,
  listarBandejaEntregablesServicios,
  listarTrazabilidadEntregable,
  observarEntregableDirigido,
  puedeAccederTrazabilidadEntregable,
} from '../server/lib/entregablesServicios.js';

let passed = 0;
let failed = 0;
function ok(c, m) { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.error(`  ✗ ${m}`); } }
async function expectError(work) { try { await work(); return null; } catch (e) { return e; } }

function coincideBandejaEndpoint(fila, endpointOk) {
  return Boolean(fila?.puede_ver_trazabilidad) === Boolean(endpointOk);
}

async function snapshotOs1105() {
  return JSON.stringify((await query(`
    SELECT oc.id, oe.id AS entrega_id, ev.responsable_usuario_id, ev.etapa_codigo,
      (SELECT COUNT(*)::int FROM entregable_observaciones eo WHERE eo.orden_id=oc.id) AS obs,
      (SELECT COUNT(*)::int FROM entregable_eventos ee WHERE ee.orden_id=oc.id) AS eventos
    FROM ordenes_contratacion oc
    LEFT JOIN orden_entregas oe ON oe.orden_id=oc.id AND oe.numero_entrega=1 AND oe.estado='ACTIVO'
    LEFT JOIN entregable_estado_vigente ev ON ev.orden_entrega_id=oe.id
    WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
    ORDER BY oc.id
  `)).rows);
}

async function limpiarFixtureF2d({ ordenId, usuarioIds = [] }) {
  if (ordenId) {
    const woIds = (await query(`
      SELECT DISTINCT workflow_observacion_id AS id
      FROM entregable_observaciones
      WHERE orden_id=$1 AND workflow_observacion_id IS NOT NULL
    `, [ordenId])).rows.map((r) => r.id);

    await query('DELETE FROM entregable_eventos WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_asignaciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_estado_vigente WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_observaciones WHERE orden_id=$1', [ordenId]);
    if (woIds.length) {
      await query('DELETE FROM workflow_observaciones WHERE id = ANY($1::int[])', [woIds]);
    }
    await query(`
      DELETE FROM entregable_recepcion_documentos
      WHERE recepcion_id IN (SELECT id FROM entregable_recepciones WHERE orden_id=$1)
    `, [ordenId]);
    await query('DELETE FROM entregable_recepciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM orden_entregas WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordenId]);
  }
  const ids = usuarioIds.filter(Boolean);
  if (ids.length) {
    await query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [ids]);
  }
}

async function contarResidualesF2d(ordenId, usuarioIds) {
  const orden = ordenId
    ? (await query('SELECT id FROM ordenes_contratacion WHERE id=$1', [ordenId])).rows.length
    : 0;
  const usuarios = usuarioIds.length
    ? (await query('SELECT id FROM usuarios WHERE id = ANY($1::int[])', [usuarioIds])).rows.length
    : 0;
  return { orden, usuarios };
}

console.log('\n=== RC8.15.6F-2D — Trazabilidad autorización ===\n');

ok(typeof puedeAccederTrazabilidadEntregable === 'function', '5. helper común exportado');

const os1105Before = await snapshotOs1105();
const client = await pool.connect();
let ordenId = null;
let e1 = null;
const usuarioIds = [];

try {
  await client.query('BEGIN');
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const permPe = JSON.stringify({
    modulos: ['EJECUCION'],
    submodulos: ['PRESENTACION_ENTREGABLES'],
    actividades: ['VER', 'EDITAR'],
    actividadesPorSubmodulo: { PRESENTACION_ENTREGABLES: ['VER', 'EDITAR'] },
  });
  const permReg = JSON.stringify({
    modulos: ['CONTRATACIONES'],
    submodulos: ['REGISTRO_ORDENES_CONTRATACION'],
    actividades: ['VER'],
    actividadesPorSubmodulo: { REGISTRO_ORDENES_CONTRATACION: ['VER'] },
  });

  async function crearUsuario(sufijo, permisos) {
    return (await client.query(`
      INSERT INTO usuarios (dni, username, nombre, rol, activo, permisos)
      VALUES ($1,$2,$3,'usuario',TRUE,$4::jsonb) RETURNING *
    `, [`F2D${sufijo}${nonce}`.slice(0, 20), `f2d_${nonce}_${sufijo}`, `Fixture F2D ${sufijo}`, permisos])).rows[0];
  }

  const origen = await crearUsuario('origen', permPe);
  const destino = await crearUsuario('destino', permReg);
  const ajeno = await crearUsuario('ajeno', permPe);
  usuarioIds.push(origen.id, destino.id, ajeno.id);

  const origenCtx = { id: Number(origen.id), rol: 'usuario', username: origen.username, permisos: JSON.parse(permPe) };
  const destCtx = { id: Number(destino.id), rol: 'usuario', username: destino.username, permisos: JSON.parse(permReg) };
  const ajenoCtx = { id: Number(ajeno.id), rol: 'usuario', username: ajeno.username, permisos: JSON.parse(permPe) };

  const base = (await client.query(`
    SELECT oc.requerimiento_id, oc.proveedor_id FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL ORDER BY oc.id LIMIT 1
  `)).rows[0];
  ordenId = Number((await client.query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,700,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156F2D${nonce}`])).rows[0].id);

  e1 = Number((await client.query(`
    INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
    VALUES ($1,1,'ENTREGABLE','F2D E1',10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
  `, [ordenId])).rows[0].id);
  await client.query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO','test-f2d')
  `, [e1, ordenId, `SGD-F2D-${nonce}`]);
  await client.query(`
    UPDATE ordenes_contratacion
    SET enviado_proveedor_at=COALESCE(enviado_proveedor_at, NOW())
    WHERE id=$1
  `, [ordenId]);
  await inicializarEstadoResponsableEntregable(e1, { actualizadoPor: 'test-f2d', client });
  await client.query(`
    UPDATE entregable_estado_vigente
    SET responsable_tipo='PERSONA', responsable_usuario_id=$2, version=version+1
    WHERE orden_entrega_id=$1
  `, [e1, origen.id]);
  await client.query(`
    UPDATE entregable_asignaciones SET activo=FALSE, cerrado_at=NOW(), cerrado_por='test-f2d'
    WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [e1]);
  await client.query(`
    INSERT INTO entregable_asignaciones (
      orden_id, orden_entrega_id, requerimiento_id, etapa_codigo,
      usuario_id, tipo_responsable, activo, asignado_por, origen_asignacion
    ) VALUES ($1,$2,$3,'PRESENTACION_ENTREGABLES',$4,'PERSONA',TRUE,'test-f2d','fixture')
  `, [ordenId, e1, base.requerimiento_id, origen.id]);

  await client.query('COMMIT');

  async function fila(ctx) {
    return (await listarBandejaEntregablesServicios(ctx))
      .find((row) => Number(row.orden_entrega_id) === Number(e1));
  }
  async function endpointOk(ctx) {
    try {
      await listarTrazabilidadEntregable(e1, ctx);
      return true;
    } catch (_) {
      return false;
    }
  }

  const filaResp = await fila(origenCtx);
  const epResp = await endpointOk(origenCtx);
  ok(epResp, '1. responsable actual → endpoint permitido');
  ok(filaResp?.puede_ver_trazabilidad === true, '1b. responsable actual → botón visible');
  ok(coincideBandejaEndpoint(filaResp, epResp), '1c. responsable: bandeja y endpoint coinciden');

  await client.query('BEGIN');
  await observarEntregableDirigido(e1, {
    destino_submodulo_codigo: 'REGISTRO_ORDENES_CONTRATACION',
    usuario_destino_id: destino.id,
    motivo: 'Obs dirigida trazabilidad',
  }, origenCtx, origen.username, client);
  await client.query('COMMIT');

  const filaEmisor = await fila(origenCtx);
  const epEmisor = await endpointOk(origenCtx);
  ok(epEmisor, '2. emisor observación → endpoint permitido');
  ok(filaEmisor?.puede_ver_trazabilidad === true, '2b. emisor observación → botón visible');
  ok(coincideBandejaEndpoint(filaEmisor, epEmisor), '2c. emisor: bandeja y endpoint coinciden');

  const filaDest = await fila(destCtx);
  const epDest = await endpointOk(destCtx);
  ok(epDest, '3. destinatario → endpoint permitido');
  ok(filaDest?.puede_ver_trazabilidad === true, '3b. destinatario → botón visible');
  ok(coincideBandejaEndpoint(filaDest, epDest), '3c. destinatario: bandeja y endpoint coinciden');

  const filaAjeno = await fila(ajenoCtx);
  const epAjeno = await endpointOk(ajenoCtx);
  const errAjeno = await expectError(() => listarTrazabilidadEntregable(e1, ajenoCtx));
  ok(!epAjeno && errAjeno?.code === 'TRAZABILIDAD_ENTREGABLE_NO_AUTORIZADA',
    '4. usuario ajeno → endpoint denegado');
  ok(filaAjeno?.puede_ver_trazabilidad !== true, '4b. usuario ajeno → botón oculto');
  ok(coincideBandejaEndpoint(filaAjeno, epAjeno), '4c. ajeno: bandeja y endpoint coinciden');
} catch (error) {
  ok(false, `fixture (${error.message})`);
} finally {
  try { await client.query('ROLLBACK'); } catch (_) { /* commit previo */ }
  client.release();
  try {
    await limpiarFixtureF2d({ ordenId, usuarioIds });
    const residuales = await contarResidualesF2d(ordenId, usuarioIds);
    ok(residuales.orden === 0 && residuales.usuarios === 0,
      '6. fixture F-2D sin registros residuales tras cleanup');
  } catch (cleanupError) {
    ok(false, `cleanup fixture (${cleanupError.message})`);
  }
}

ok(await snapshotOs1105() === os1105Before, '7. OS 1105 permanece intacta');

await pool.end();
console.log(`\n=== Resultado F-2D: ${passed} OK, ${failed} FAIL ===\n`);
if (failed) process.exit(1);

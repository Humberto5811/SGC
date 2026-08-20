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

console.log('\n=== RC8.15.6F-2D — Trazabilidad autorización ===\n');

ok(typeof puedeAccederTrazabilidadEntregable === 'function', '5. helper común exportado');

const client = await pool.connect();
let ordenId = null;
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

  const e1 = Number((await client.query(`
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
  if (ordenId) {
    try { await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordenId]); } catch (_) { /* noop */ }
  }
}

await pool.end();
console.log(`\n=== Resultado F-2D: ${passed} OK, ${failed} FAIL ===\n`);
if (failed) process.exit(1);

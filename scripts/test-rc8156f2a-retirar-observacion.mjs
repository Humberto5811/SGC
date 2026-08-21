/**
 * RC8.15.6F-2A — Retiro de observación legacy/dirigida.
 */
import pool, { query } from '../server/db.js';
import {
  clasificarObservacionEntregable,
  esEmisorObservacionEntregable,
  registrarRoutingObservacionEntregable,
} from '../server/lib/observacionesEntregableRouting.js';
import {
  inicializarEstadoResponsableEntregable,
  observarEntregableDirigido,
  retirarObservacionEntregable,
} from '../server/lib/entregablesServicios.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';

let passed = 0;
let failed = 0;
function ok(c, m) { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.error(`  ✗ ${m}`); } }
async function expectError(work) { try { await work(); return null; } catch (e) { return e; } }
async function snap(sql, params = []) { return JSON.stringify((await query(sql, params)).rows); }

console.log('\n=== RC8.15.6F-2A — Retirar observación ===\n');

const os1105 = (await query(`
  SELECT oe.id AS orden_entrega_id, eo.id AS observacion_id, eo.workflow_observacion_id,
    eo.estado, eo.observado_por
  FROM ordenes_contratacion oc
  JOIN orden_entregas oe ON oe.orden_id=oc.id AND oe.numero_entrega=1 AND oe.estado='ACTIVO'
  LEFT JOIN entregable_observaciones eo ON eo.orden_entrega_id=oe.id
    AND eo.estado IN ('OBS_EMITIDA','OBS_EN_ATENCION')
  WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
  ORDER BY eo.id DESC NULLS LAST LIMIT 1
`)).rows[0];
ok(os1105?.observacion_id && !os1105.workflow_observacion_id,
  '1. OS1105 E1 legacy sin routing detectada (solo lectura)');
if (os1105?.observacion_id) {
  ok(clasificarObservacionEntregable({
    workflow_observacion_id: os1105.workflow_observacion_id,
    usuario_destino_id: null,
  }) === 'LEGACY_SIN_ROUTING', '1b. clasificación LEGACY_SIN_ROUTING');
}

const globalBefore = await snap('SELECT * FROM expediente_estado_vigente ORDER BY requerimiento_id');
const os1105Before = await snap(`
  SELECT oc.*, oe.id AS entrega_id
  FROM ordenes_contratacion oc
  LEFT JOIN orden_entregas oe ON oe.orden_id=oc.id
  WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
  ORDER BY oc.id, oe.id
`);

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const permReg = JSON.stringify({
    modulos: ['CONTRATACIONES'],
    submodulos: ['REGISTRO_ORDENES_CONTRATACION'],
    actividades: ['VER'],
    actividadesPorSubmodulo: { REGISTRO_ORDENES_CONTRATACION: ['VER'] },
  });
  const permPe = JSON.stringify({
    modulos: ['EJECUCION'],
    submodulos: ['PRESENTACION_ENTREGABLES'],
    actividades: ['VER', 'EDITAR'],
    actividadesPorSubmodulo: { PRESENTACION_ENTREGABLES: ['VER', 'EDITAR'] },
  });
  async function crearUsuario(sufijo, permisos) {
    return (await client.query(`
      INSERT INTO usuarios (dni, username, nombre, rol, activo, permisos)
      VALUES ($1,$2,$3,'usuario',TRUE,$4::jsonb) RETURNING *
    `, [`F2A${sufijo}${nonce}`.slice(0, 20), `f2a_${nonce}_${sufijo}`, `Fixture F2A ${sufijo}`, permisos])).rows[0];
  }
  const origen = await crearUsuario('origen', permPe);
  const destino = await crearUsuario('destino', permReg);
  const otro = await crearUsuario('otro', permPe);
  const origenCtx = { id: Number(origen.id), rol: 'usuario', username: origen.username, permisos: JSON.parse(permPe) };
  const otroCtx = { id: Number(otro.id), rol: 'usuario', username: otro.username, permisos: JSON.parse(permPe) };

  const base = (await client.query(`
    SELECT oc.requerimiento_id, oc.proveedor_id FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL ORDER BY oc.id LIMIT 1
  `)).rows[0];
  const ordenId = Number((await client.query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,500,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156F2A${nonce}`])).rows[0].id);
  async function crearEntrega(numero) {
    return Number((await client.query(`
      INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
      VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
    `, [ordenId, numero, `F2A ${numero}`])).rows[0].id);
  }
  async function crearRecepcion(eid, numero) {
    return Number((await client.query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,$3,'INICIAL',CURRENT_DATE,$4,'RECIBIDO','test-f2a') RETURNING id
    `, [eid, ordenId, numero, `SGD-F2A-${nonce}-${numero}`])).rows[0].id);
  }
  const e1 = await crearEntrega(1);
  const e2 = await crearEntrega(2);
  const r1 = await crearRecepcion(e1, 1);
  await crearRecepcion(e2, 1);

  const legacy = (await client.query(`
    INSERT INTO entregable_observaciones (
      orden_id, orden_entrega_id, recepcion_id, motivo, estado, observado_por, observado_at
    ) VALUES ($1,$2,$3,'Legacy sin routing','OBS_EMITIDA',$4,NOW()) RETURNING *
  `, [ordenId, e1, r1, origen.username])).rows[0];
  ok(clasificarObservacionEntregable(legacy) === 'LEGACY_SIN_ROUTING', '1c. fixture legacy clasificada');

  const menuLegacy = entregableMenuItems({
    solo_lectura_legacy_emisor: true,
    puede_ver_observacion_abierta: true,
    puede_retirar_observacion: true,
    puede_ver_trazabilidad: true,
    puede_subsanar: true,
  });
  ok(!menuLegacy.some((item) => item.act === 'subsanarEntregable')
    && menuLegacy.some((item) => item.act === 'retirarObservacion'),
    '2. legacy no muestra Subsanar al emisor; sí Retirar');

  const retiroLegacy = await retirarObservacionEntregable(
    e1, legacy.id, { motivo: 'Retiro legacy' }, origenCtx, origen.username, client,
  );
  ok(retiroLegacy.observacion.estado === 'OBS_CERRADA'
    && retiroLegacy.clasificacion === 'LEGACY_SIN_ROUTING',
    '5. emisor retira legacy emitida');
  ok((await client.query(`
    SELECT estado FROM entregable_observaciones WHERE id=$1
  `, [legacy.id])).rows[0].estado === 'OBS_CERRADA', '8. retiro no borra histórico');

  const legacy2 = (await client.query(`
    INSERT INTO entregable_observaciones (
      orden_id, orden_entrega_id, recepcion_id, motivo, estado, observado_por
    ) VALUES ($1,$2,$3,'Segunda legacy','OBS_EMITIDA',$4) RETURNING id
  `, [ordenId, e1, r1, origen.username])).rows[0].id;
  const bloqueado = await expectError(() => retirarObservacionEntregable(
    e1, legacy2, { motivo: 'Intento ajeno' }, otroCtx, otro.username, client,
  ));
  ok(bloqueado?.code === 'RETIRO_OBSERVACION_NO_AUTORIZADO', '6. otro usuario no puede retirar');
  await retirarObservacionEntregable(e1, legacy2, { motivo: 'Limpieza' }, origenCtx, origen.username, client);

  await inicializarEstadoResponsableEntregable(e1, { actualizadoPor: 'test-f2a', client });
  await inicializarEstadoResponsableEntregable(e2, { actualizadoPor: 'test-f2a', client });
  await client.query(`
    UPDATE entregable_estado_vigente
    SET responsable_tipo='PERSONA', responsable_usuario_id=$2, version=version+1
    WHERE orden_entrega_id=$1
  `, [e1, origen.id]);
  await client.query(`
    UPDATE entregable_estado_vigente
    SET responsable_tipo='PERSONA', responsable_usuario_id=$2, version=version+1
    WHERE orden_entrega_id=$1
  `, [e2, origen.id]);
  await client.query(`
    UPDATE entregable_asignaciones
    SET activo=FALSE, cerrado_at=NOW(), cerrado_por='test-f2a'
    WHERE orden_entrega_id IN ($1,$2) AND activo=TRUE
  `, [e1, e2]);
  for (const eid of [e1, e2]) {
    await client.query(`
      INSERT INTO entregable_asignaciones (
        orden_id, orden_entrega_id, requerimiento_id, etapa_codigo, usuario_id,
        tipo_responsable, activo, asignado_por, origen_asignacion
      ) VALUES ($1,$2,$3,'PRESENTACION_ENTREGABLES',$4,'PERSONA',TRUE,'test-f2a','fixture')
    `, [ordenId, eid, base.requerimiento_id, origen.id]);
  }

  const dirigida = await observarEntregableDirigido(e1, {
    destino_submodulo_codigo: 'REGISTRO_ORDENES_CONTRATACION',
    usuario_destino_id: destino.id,
    motivo: 'Dirigida F2A',
  }, origenCtx, origen.username, client);
  ok(clasificarObservacionEntregable({
    workflow_observacion_id: dirigida.workflow_observacion.id,
    usuario_destino_id: destino.id,
  }) === 'DIRIGIDA_CANONICA', '4. dirigida canónica conserva destino');
  ok(Number((await client.query(`
    SELECT responsable_usuario_id FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [e1])).rows[0]?.responsable_usuario_id) === Number(destino.id),
  '4b. responsable pasa al destino');

  const dirigida2 = await observarEntregableDirigido(e2, {
    destino_submodulo_codigo: 'REGISTRO_ORDENES_CONTRATACION',
    usuario_destino_id: destino.id,
    motivo: 'Dirigida E2 atendida',
  }, origenCtx, origen.username, client);
  await client.query(`
    UPDATE entregable_observaciones SET estado='OBS_EN_ATENCION' WHERE id=$1
  `, [dirigida2.entregable_observacion.id]);
  const atendida = await expectError(() => retirarObservacionEntregable(
    e2, dirigida2.entregable_observacion.id, { motivo: 'Tarde' }, origenCtx, origen.username, client,
  ));
  ok(atendida?.code === 'OBSERVACION_NO_RETIRABLE', '7. atendida no puede retirarse');

  await retirarObservacionEntregable(
    e1,
    dirigida.entregable_observacion.id,
    { motivo: 'Retiro dirigida' },
    origenCtx,
    origen.username,
    client,
  );
  ok(Number((await client.query(`
    SELECT responsable_usuario_id FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [e1])).rows[0]?.responsable_usuario_id) === Number(origen.id),
  '9. responsable restaurado al emisor tras retiro dirigido');

  const menuNormal = entregableMenuItems({
    puede_modificar_entregable: true,
    puede_observar: true,
    puede_gestionar_conformidad: true,
    puede_ver_trazabilidad: true,
    situacion_codigo: 'RECIBIDO',
  });
  ok(menuNormal.some((item) => item.act === 'generarActa'), '11. recibido vuelve a permitir Generar Acta');

  const menuActa = entregableMenuItems({
    puede_ver_acta_generada: true,
    puede_adjuntar_acta_firmada: true,
    puede_regenerar_acta: true,
    puede_observar: true,
    puede_ver_trazabilidad: true,
    acta_generada_version: 1,
    firmada_vigente: false,
    situacion_codigo: 'ACTA_GENERADA',
  });
  ok(menuActa.some((item) => item.act === 'adjuntarActaFirmada'), '12. acta sin firmada permite Adjuntar firmada');
  ok(menuActa.some((item) => item.act === 'generarActa' && item.label === 'Regenerar Acta de Conformidad'),
    '12b. acta sin firmada permite Regenerar Acta');

  const menuConforme = entregableMenuItems({
    puede_ver_acta_generada: true,
    puede_ver_acta_firmada: true,
    puede_derivar_coordinador_cm: true,
    puede_ver_trazabilidad: true,
    acta_generada_version: 1,
    firmada_vigente: true,
    situacion_codigo: 'CONFORME',
  });
  ok(menuConforme.some((item) => item.act === 'derivarCoordinadorCM'), '13. acta+firmada permite Derivar CM');

  const e2Estado = (await client.query(`
    SELECT COUNT(*)::int AS n FROM entregable_observaciones
    WHERE orden_entrega_id=$1 AND estado IN ('OBS_EMITIDA','OBS_EN_ATENCION')
  `, [e2])).rows[0].n;
  ok(Number(e2Estado) === 1, '14. E2 conserva solo la observación atendida de prueba');
} catch (error) {
  ok(false, `fixture (${error.message})`);
} finally {
  await client.query('ROLLBACK');
  client.release();
}

ok(await snap('SELECT * FROM expediente_estado_vigente ORDER BY requerimiento_id') === globalBefore,
  '15. expediente global intacto');
ok(await snap(`
  SELECT oc.*, oe.id AS entrega_id FROM ordenes_contratacion oc
  LEFT JOIN orden_entregas oe ON oe.orden_id=oc.id
  WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105' ORDER BY oc.id, oe.id
`) === os1105Before, '16. OS 1105 solo lectura intacta');

await pool.end();
console.log(`\n=== Resultado F-2A: ${passed} OK, ${failed} FAIL ===\n`);
if (failed) process.exit(1);

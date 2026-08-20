/**
 * RC8.15.6G-1 — Responsable automático por persona asignada en transiciones.
 */
import pool, { query } from '../server/db.js';
import {
  ensureResponsablePersonaEntregable,
  listarEstadosResponsablesEntregables,
  observarEntregableDirigido,
  transicionarEntregable,
} from '../server/lib/entregablesServicios.js';
import { EVENTOS } from '../shared/workflow/eventos.js';

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

async function snapshotOs1105() {
  return JSON.stringify((await query(`
    SELECT oc.id,
      (SELECT COUNT(*)::int FROM entregable_estado_vigente eev WHERE eev.orden_id=oc.id) AS estados,
      (SELECT COUNT(*)::int FROM entregable_asignaciones ea WHERE ea.orden_id=oc.id) AS asignaciones
    FROM ordenes_contratacion oc
    WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
    ORDER BY oc.id
  `)).rows);
}

console.log('\n=== RC8.15.6G-1 — Responsable automático ===\n');

const os1105Before = await snapshotOs1105();
const client = await pool.connect();
let fixture = null;

try {
  await client.query('BEGIN');
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const permisoPresentacion = JSON.stringify({
    modulos: ['EJECUCION'],
    submodulos: ['PRESENTACION_ENTREGABLES'],
    actividades: ['VER', 'EDITAR'],
    actividadesPorSubmodulo: { PRESENTACION_ENTREGABLES: ['VER', 'EDITAR'] },
  });
  const permisoRegistro = JSON.stringify({
    modulos: ['CONTRATACIONES'],
    submodulos: ['REGISTRO_ORDENES_CONTRATACION'],
    actividades: ['VER'],
    actividadesPorSubmodulo: { REGISTRO_ORDENES_CONTRATACION: ['VER'] },
  });
  const permisoCoordinador = JSON.stringify({
    modulos: ['EJECUCION'],
    submodulos: ['REVISION_COORDINADOR_CM'],
    actividades: ['VER', 'EDITAR'],
    actividadesPorSubmodulo: { REVISION_COORDINADOR_CM: ['VER', 'EDITAR'] },
  });

  async function crearUsuario(sufijo, permisos, extra = {}) {
    return (await client.query(`
      INSERT INTO usuarios (dni, username, nombre, rol, activo, permisos, centro, codigo_centro_costo)
      VALUES ($1,$2,$3,'usuario',TRUE,$4::jsonb,$5,$6)
      RETURNING *
    `, [
      `G1${sufijo.slice(0, 4)}${nonce}`.slice(0, 20),
      `g1_${nonce}_${sufijo}`.toLowerCase(),
      `Fixture G1 ${sufijo}`,
      permisos,
      extra.centro || null,
      extra.codigo_centro_costo || extra.centro || null,
    ])).rows[0];
  }

  const wvasquez = await crearUsuario('wvasquez', permisoPresentacion, { centro: 'CMN' });
  const jcrisostomo = await crearUsuario('jcrisostomo', permisoRegistro);
  const coordinador = await crearUsuario('coordcm', permisoCoordinador);

  const wCtx = { id: Number(wvasquez.id), username: wvasquez.username, permisos: JSON.parse(permisoPresentacion), centro: 'CMN', codigo_centro_costo: 'CMN' };
  const jCtx = { id: Number(jcrisostomo.id), username: jcrisostomo.username, permisos: JSON.parse(permisoRegistro) };
  const cCtx = { id: Number(coordinador.id), username: coordinador.username, permisos: JSON.parse(permisoCoordinador) };

  const base = (await client.query(`
    SELECT oc.requerimiento_id, oc.proveedor_id, r.cmn, r.area
    FROM ordenes_contratacion oc
    JOIN requerimientos r ON r.id = oc.requerimiento_id
    WHERE oc.proveedor_id IS NOT NULL
    ORDER BY oc.id LIMIT 1
  `)).rows[0];

  const ordenId = Number((await client.query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion, recibido_proveedor_at
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,500,'ORDEN_RECEPCION_CONFIRMADA','SERVICIO',NOW())
    RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156G1${nonce}`])).rows[0].id);

  const entregaId = Number((await client.query(`
    INSERT INTO orden_entregas (
      orden_id, numero_entrega, tipo_entrega, descripcion,
      dias_plazo, fecha_maxima, importe, estado
    ) VALUES ($1,1,'ENTREGABLE','Fixture G1',10,CURRENT_DATE+10,100,'ACTIVO')
    RETURNING id
  `, [ordenId])).rows[0].id);

  await client.query(`
    INSERT INTO orden_ejecucion_derivaciones (orden_id, requerimiento_id, payload_json, derivado_por)
    VALUES ($1,$2,'{}'::jsonb,'test-g1')
    ON CONFLICT (orden_id) DO NOTHING
  `, [ordenId, base.requerimiento_id]);

  await client.query(`
    UPDATE ordenes_contratacion SET estado='EN_EJECUCION' WHERE id=$1
  `, [ordenId]);

  await ensureResponsablePersonaEntregable({
    ordenEntregaId: entregaId,
    usuarioDestinoId: wvasquez.id,
    ejecutadoPor: wvasquez.username,
    motivo: 'Asignación inicial wvasquez',
    metadata: { via: 'test-g1-derivacion' },
    client,
  });

  const estadoDerivacion = (await client.query(`
    SELECT responsable_tipo, responsable_usuario_id
    FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [entregaId])).rows[0];
  ok(estadoDerivacion?.responsable_tipo === 'PERSONA'
    && Number(estadoDerivacion.responsable_usuario_id) === Number(wvasquez.id),
  '1. ensureResponsablePersona asigna PERSONA wvasquez al entregable');

  await client.query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO',$4)
  `, [entregaId, ordenId, `SGD-G1-${nonce}`, wvasquez.username]);

  await ensureResponsablePersonaEntregable({
    ordenEntregaId: entregaId,
    usuarioDestinoId: wvasquez.id,
    ejecutadoPor: wvasquez.username,
    motivo: 'Fixture recepción',
    client,
  });

  await client.query(`
    UPDATE entregable_estado_vigente
    SET responsable_tipo='PERSONA', responsable_usuario_id=$2, responsable_unidad=NULL,
        responsable_fuente='PERSONA', version=version+1
    WHERE orden_entrega_id=$1
  `, [entregaId, wvasquez.id]);
  await client.query(`
    UPDATE entregable_asignaciones SET activo=FALSE, cerrado_at=NOW(), cerrado_por='test-g1'
    WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [entregaId]);
  await client.query(`
    INSERT INTO entregable_asignaciones (
      orden_id, orden_entrega_id, requerimiento_id, etapa_codigo,
      usuario_id, tipo_responsable, activo, asignado_por, origen_asignacion
    ) VALUES ($1,$2,$3,'PRESENTACION_ENTREGABLES',$4,'PERSONA',TRUE,'test-g1','fixture')
  `, [ordenId, entregaId, base.requerimiento_id, wvasquez.id]);

  await observarEntregableDirigido(entregaId, {
    destino_submodulo_codigo: 'REGISTRO_ORDENES_CONTRATACION',
    usuario_destino_id: jcrisostomo.id,
    motivo: 'Observación G1 hacia jcrisostomo',
  }, wCtx, wvasquez.username, client);

  const estadoObservacion = (await client.query(`
    SELECT responsable_usuario_id, etapa_codigo
    FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [entregaId])).rows[0];
  ok(Number(estadoObservacion.responsable_usuario_id) === Number(jcrisostomo.id),
    '2. observación dirigida asigna responsable jcrisostomo');

  await client.query(`
    UPDATE entregable_estado_vigente
    SET responsable_tipo='PERSONA', responsable_usuario_id=$2, version=version+1
    WHERE orden_entrega_id=$1
  `, [entregaId, wvasquez.id]);
  await client.query(`
    UPDATE entregable_asignaciones SET activo=FALSE, cerrado_at=NOW(), cerrado_por='test-g1'
    WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [entregaId]);
  await client.query(`
    INSERT INTO entregable_asignaciones (
      orden_id, orden_entrega_id, requerimiento_id, etapa_codigo,
      usuario_id, tipo_responsable, activo, asignado_por, origen_asignacion
    ) VALUES ($1,$2,$3,'PRESENTACION_ENTREGABLES',$4,'PERSONA',TRUE,'test-g1','fixture')
  `, [ordenId, entregaId, base.requerimiento_id, wvasquez.id]);

  await transicionarEntregable({
    ordenEntregaId: entregaId,
    evento: EVENTOS.ENTREGABLE_DERIVADO_COORDINADOR_CM,
    usuarioOrigenId: wvasquez.id,
    ejecutadoPor: wvasquez.username,
    usuarioDestinoId: coordinador.id,
    unidadDestino: 'COORDINADOR_CM',
    motivo: 'Derivación G1 a coordinador CM',
    client,
  });

  const estadoCoordinador = (await client.query(`
    SELECT responsable_usuario_id, etapa_codigo
    FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [entregaId])).rows[0];
  ok(Number(estadoCoordinador.responsable_usuario_id) === Number(coordinador.id),
    '3. derivación a coordinador CM asigna responsable coordinador');
  ok(estadoCoordinador.etapa_codigo === 'REVISION_COORDINADOR_CM',
    '4. etapa cambia a REVISION_COORDINADOR_CM');

  fixture = { entregaId, coordinador, wvasquez, jcrisostomo, ordenId };
  await client.query('ROLLBACK');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
  throw error;
} finally {
  client.release();
}

const bandejaClient = await pool.connect();
try {
  await bandejaClient.query('BEGIN');
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const permisoPresentacion = JSON.stringify({
    modulos: ['EJECUCION'],
    submodulos: ['PRESENTACION_ENTREGABLES'],
    actividades: ['VER', 'EDITAR'],
    actividadesPorSubmodulo: { PRESENTACION_ENTREGABLES: ['VER', 'EDITAR'] },
  });
  const permisoCoordinador = JSON.stringify({
    modulos: ['EJECUCION'],
    submodulos: ['REVISION_COORDINADOR_CM'],
    actividades: ['VER', 'EDITAR'],
    actividadesPorSubmodulo: { REVISION_COORDINADOR_CM: ['VER', 'EDITAR'] },
  });

  const wvasquez = (await bandejaClient.query(`
    INSERT INTO usuarios (dni, username, nombre, rol, activo, permisos, centro, codigo_centro_costo)
    VALUES ($1,$2,$3,'usuario',TRUE,$4::jsonb,'CMN','CMN') RETURNING *
  `, [`G1B${nonce}`.slice(0, 20), `g1b_${nonce}`, 'Fixture G1 Bandeja', permisoPresentacion])).rows[0];
  const coordinador = (await bandejaClient.query(`
    INSERT INTO usuarios (dni, username, nombre, rol, activo, permisos)
    VALUES ($1,$2,$3,'usuario',TRUE,$4::jsonb) RETURNING *
  `, [`G1C${nonce}`.slice(0, 20), `g1c_${nonce}`, 'Coord CM G1', permisoCoordinador])).rows[0];

  const base = (await bandejaClient.query(`
    SELECT oc.requerimiento_id, oc.proveedor_id
    FROM ordenes_contratacion oc WHERE oc.proveedor_id IS NOT NULL ORDER BY oc.id LIMIT 1
  `)).rows[0];
  const ordenId = Number((await bandejaClient.query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion, recibido_proveedor_at,
      enviado_proveedor_at
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,500,'EN_EJECUCION','SERVICIO',NOW(),NOW())
    RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156G1B${nonce}`])).rows[0].id);
  const entregaId = Number((await bandejaClient.query(`
    INSERT INTO orden_entregas (
      orden_id, numero_entrega, tipo_entrega, descripcion,
      dias_plazo, fecha_maxima, importe, estado
    ) VALUES ($1,1,'ENTREGABLE','Bandeja G1',10,CURRENT_DATE+10,100,'ACTIVO')
    RETURNING id
  `, [ordenId])).rows[0].id);

  await ensureResponsablePersonaEntregable({
    ordenEntregaId: entregaId,
    usuarioDestinoId: coordinador.id,
    ejecutadoPor: 'test-g1',
    motivo: 'Fixture bandeja',
    client: bandejaClient,
  });
  await bandejaClient.query(`
    UPDATE entregable_estado_vigente
    SET etapa_codigo='REVISION_COORDINADOR_CM', etapa_label='Revisión Coordinador CM'
    WHERE orden_entrega_id=$1
  `, [entregaId]);

  const cCtx = { id: Number(coordinador.id), username: coordinador.username, permisos: JSON.parse(permisoCoordinador) };
  const estados = await listarEstadosResponsablesEntregables([entregaId], { client: bandejaClient });
  const erv = estados.get(entregaId);
  ok(erv?.responsableNombre === coordinador.nombre || erv?.responsableUsername === coordinador.username,
    '5. contrato canónico muestra nombre del coordinador CM como responsable');
  ok(Number(erv?.responsableUsuarioId) === Number(coordinador.id),
    '6. contrato expone responsableUsuarioId del coordinador');

  await bandejaClient.query('ROLLBACK');
} finally {
  bandejaClient.release();
}

const os1105After = await snapshotOs1105();
ok(os1105Before === os1105After, '7. OS 1105 no fue modificada');

console.log(`\nResultado: ${passed} OK, ${failed} FAIL\n`);
await pool.end();
process.exit(failed > 0 ? 1 : 0);

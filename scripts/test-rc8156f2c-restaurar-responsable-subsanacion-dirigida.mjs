/**
 * RC8.15.6F-2C — Restaura responsable AU tras subsanación de observación dirigida.
 */
import pool, { query } from '../server/db.js';
import {
  inicializarEstadoResponsableEntregable,
  observarEntregableDirigido,
  obtenerEstadoResponsableEntregable,
  subsanarEntregable,
} from '../server/lib/entregablesServicios.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';

let passed = 0;
let failed = 0;
function ok(c, m) { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.error(`  ✗ ${m}`); } }

function pdf(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF`).toString('base64');
}

console.log('\n=== RC8.15.6F-2C — Restaurar responsable tras subsanación dirigida ===\n');

const client = await pool.connect();
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
    `, [`F2C${sufijo}${nonce}`.slice(0, 20), `f2c_${nonce}_${sufijo}`, `Fixture F2C ${sufijo}`, permisos])).rows[0];
  }

  const wvasquez = await crearUsuario('origen', permPe);
  const jcrisostomo = await crearUsuario('destino', permReg);
  const origenCtx = { id: Number(wvasquez.id), rol: 'usuario', username: wvasquez.username, permisos: JSON.parse(permPe) };
  const destCtx = { id: Number(jcrisostomo.id), rol: 'usuario', username: jcrisostomo.username, permisos: JSON.parse(permReg) };

  const base = (await client.query(`
    SELECT oc.requerimiento_id, oc.proveedor_id FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL ORDER BY oc.id LIMIT 1
  `)).rows[0];
  const ordenId = Number((await client.query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,600,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156F2C${nonce}`])).rows[0].id);

  const e1 = Number((await client.query(`
    INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
    VALUES ($1,1,'ENTREGABLE','F2C E1',10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
  `, [ordenId])).rows[0].id);
  const r1 = Number((await client.query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO','test-f2c') RETURNING id
  `, [e1, ordenId, `SGD-F2C-${nonce}`])).rows[0].id);

  await inicializarEstadoResponsableEntregable(e1, { actualizadoPor: 'test-f2c', client });
  await client.query(`
    UPDATE entregable_estado_vigente
    SET responsable_tipo='PERSONA', responsable_usuario_id=$2, version=version+1
    WHERE orden_entrega_id=$1
  `, [e1, wvasquez.id]);
  await client.query(`
    UPDATE entregable_asignaciones
    SET activo=FALSE, cerrado_at=NOW(), cerrado_por='test-f2c'
    WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [e1]);
  await client.query(`
    INSERT INTO entregable_asignaciones (
      orden_id, orden_entrega_id, requerimiento_id, etapa_codigo,
      usuario_id, tipo_responsable, activo, asignado_por, origen_asignacion
    ) VALUES ($1,$2,$3,'PRESENTACION_ENTREGABLES',$4,'PERSONA',TRUE,'test-f2c','fixture')
  `, [ordenId, e1, base.requerimiento_id, wvasquez.id]);

  const dirigida = await observarEntregableDirigido(e1, {
    destino_submodulo_codigo: 'REGISTRO_ORDENES_CONTRATACION',
    usuario_destino_id: jcrisostomo.id,
    motivo: 'Observación AU hacia Analista CM',
  }, origenCtx, wvasquez.username, client);

  ok(Number((await client.query(`
    SELECT responsable_usuario_id FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [e1])).rows[0]?.responsable_usuario_id) === Number(jcrisostomo.id),
  '1. observación dirigida transfiere responsable al destinatario');

  const subsanacion = await subsanarEntregable(e1, {
    fecha_recepcion_mesa_partes: '2026-08-20',
    numero_expediente_sgd: `SGD-SUB-${nonce}`,
    observacion: 'Subsanación analista',
    observacion_id: dirigida.entregable_observacion.id,
    documentos: [{
      nombre_archivo: 'subsanacion.pdf',
      mime_type: 'application/pdf',
      contenido_base64: pdf('subsanacion-f2c'),
    }],
  }, destCtx, jcrisostomo.username, client);

  ok(subsanacion.observacion.estado === 'OBS_SUBSANADA', '2. observación pasa a OBS_SUBSANADA');
  ok(Number((await client.query(`
    SELECT responsable_usuario_id FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [e1])).rows[0]?.responsable_usuario_id) === Number(wvasquez.id),
  '3. responsable vuelve al emisor AU tras subsanación');

  const asignActiva = (await client.query(`
    SELECT usuario_id, activo, origen_asignacion FROM entregable_asignaciones
    WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [e1])).rows[0];
  ok(Number(asignActiva.usuario_id) === Number(wvasquez.id), '4. asignación activa del emisor AU');
  ok(Number((await client.query(`
    SELECT COUNT(*)::int AS n FROM entregable_asignaciones
    WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [e1])).rows[0].n) === 1, '5. una sola asignación activa');

  const evento = (await client.query(`
    SELECT evento_codigo, responsable_anterior_usuario, responsable_nuevo_usuario
    FROM entregable_eventos
    WHERE orden_entrega_id=$1 AND evento_codigo='ENTREGABLE_OBSERVACION_SUBSANADA'
    ORDER BY id DESC LIMIT 1
  `, [e1])).rows[0];
  ok(evento
    && Number(evento.responsable_anterior_usuario) === Number(jcrisostomo.id)
    && Number(evento.responsable_nuevo_usuario) === Number(wvasquez.id),
  '6. evento de trazabilidad registra restauración destino→origen');

  const estadoPost = await obtenerEstadoResponsableEntregable(e1, { client });
  const autorizadoAu = Number(origenCtx.id) === Number(estadoPost?.responsableUsuarioId);
  ok(autorizadoAu, '7. emisor AU recupera autorización de gestión');

  const menu = entregableMenuItems({
    puede_modificar_entregable: autorizadoAu,
    puede_gestionar_conformidad: autorizadoAu,
    puede_observar: autorizadoAu,
    puede_ver_trazabilidad: true,
    situacion_codigo: 'SUBSANADO',
  });
  ok(menu.some((item) => item.act === 'generarActa')
    && menu.some((item) => item.act === 'observarEntregable'),
  '8. matriz de acciones AU disponible para el emisor');
} catch (error) {
  ok(false, `fixture (${error.message})`);
} finally {
  await client.query('ROLLBACK');
  client.release();
}

await pool.end();
console.log(`\n=== Resultado F-2C: ${passed} OK, ${failed} FAIL ===\n`);
if (failed) process.exit(1);

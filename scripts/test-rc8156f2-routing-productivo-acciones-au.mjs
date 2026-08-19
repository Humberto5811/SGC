/**
 * RC8.15.6F-2 — Routing productivo AU + matriz de acciones.
 */
import { readFileSync } from 'node:fs';
import pool, { query } from '../server/db.js';
import {
  inicializarEstadoResponsableEntregable,
  observarEntregableDirigido,
} from '../server/lib/entregablesServicios.js';
import { listarMisObservacionesDirigidas } from '../server/lib/observacionesEntregableRouting.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';

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

async function expectError(work) {
  try {
    await work();
    return null;
  } catch (error) {
    return error;
  }
}

async function snapshot(sql, params = []) {
  return JSON.stringify((await query(sql, params)).rows);
}

console.log('\n=== RC8.15.6F-2 — Routing productivo AU ===\n');

const globalBefore = await snapshot('SELECT * FROM expediente_estado_vigente ORDER BY requerimiento_id');
const os1105Before = await snapshot(`
  SELECT oc.*, oe.id AS entrega_id
  FROM ordenes_contratacion oc
  LEFT JOIN orden_entregas oe ON oe.orden_id=oc.id
  WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
  ORDER BY oc.id, oe.id
`);

const client = await pool.connect();
let fixture = null;
try {
  await client.query('BEGIN');
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const permisoRegistro = JSON.stringify({
    modulos: ['CONTRATACIONES'],
    submodulos: ['REGISTRO_ORDENES_CONTRATACION'],
    actividades: ['VER'],
    actividadesPorSubmodulo: { REGISTRO_ORDENES_CONTRATACION: ['VER'] },
  });
  const permisoPresentacion = JSON.stringify({
    modulos: ['EJECUCION'],
    submodulos: ['PRESENTACION_ENTREGABLES'],
    actividades: ['VER', 'EDITAR'],
    actividadesPorSubmodulo: { PRESENTACION_ENTREGABLES: ['VER', 'EDITAR'] },
  });

  async function crearUsuario(sufijo, permisos) {
    return (await client.query(`
      INSERT INTO usuarios (dni, username, nombre, rol, activo, permisos)
      VALUES ($1,$2,$3,'usuario',TRUE,$4::jsonb)
      RETURNING *
    `, [
      `F2${sufijo.slice(0, 4)}${nonce}`.slice(0, 20),
      `f2_${nonce}_${sufijo}`.toLowerCase(),
      `Fixture F2 ${sufijo}`,
      permisos,
    ])).rows[0];
  }

  const origen = await crearUsuario('origen', permisoPresentacion);
  const destinatario = await crearUsuario('destino', permisoRegistro);
  const origenCtx = { id: Number(origen.id), rol: 'usuario', permisos: JSON.parse(permisoPresentacion) };
  const destCtx = { id: Number(destinatario.id), rol: 'usuario', permisos: JSON.parse(permisoRegistro) };

  const base = (await client.query(`
    SELECT oc.requerimiento_id, oc.proveedor_id
    FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL
    ORDER BY oc.id LIMIT 1
  `)).rows[0];
  const ordenId = Number((await client.query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,400,'EN_EJECUCION','SERVICIO')
    RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156F2${nonce}`])).rows[0].id);

  async function crearEntrega(numero) {
    return Number((await client.query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion,
        dias_plazo, fecha_maxima, importe, estado
      ) VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO')
      RETURNING id
    `, [ordenId, numero, `Fixture F2 ${numero}`])).rows[0].id);
  }
  async function crearRecepcion(entregaId, numero) {
    return Number((await client.query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,$3,'INICIAL',CURRENT_DATE,$4,'RECIBIDO','test-f2')
      RETURNING id
    `, [entregaId, ordenId, numero, `SGD-F2-${nonce}-${numero}`])).rows[0].id);
  }

  const e1 = await crearEntrega(1);
  const e2 = await crearEntrega(2);
  const r1 = await crearRecepcion(e1, 1);
  await crearRecepcion(e2, 1);
  await inicializarEstadoResponsableEntregable(e1, { actualizadoPor: 'test-f2', client });
  await inicializarEstadoResponsableEntregable(e2, { actualizadoPor: 'test-f2', client });
  await client.query(`
    UPDATE entregable_estado_vigente
    SET responsable_tipo='PERSONA', responsable_usuario_id=$2, responsable_unidad=NULL,
        responsable_fuente='PERSONA', version=version+1
    WHERE orden_entrega_id=$1
  `, [e1, origen.id]);
  await client.query(`
    UPDATE entregable_asignaciones
    SET activo=FALSE, cerrado_at=NOW(), cerrado_por='test-f2'
    WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [e1]);
  await client.query(`
    INSERT INTO entregable_asignaciones (
      orden_id, orden_entrega_id, requerimiento_id, etapa_codigo,
      usuario_id, tipo_responsable, activo, asignado_por, origen_asignacion
    ) VALUES ($1,$2,$3,'PRESENTACION_ENTREGABLES',$4,'PERSONA',TRUE,'test-f2','fixture')
  `, [ordenId, e1, base.requerimiento_id, origen.id]);

  const etapaAntes = (await client.query(`
    SELECT etapa_codigo, responsable_usuario_id
    FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [e1])).rows[0];

  const sinMotivo = await expectError(() => observarEntregableDirigido(e1, {
    destino_submodulo_codigo: 'REGISTRO_ORDENES_CONTRATACION',
    usuario_destino_id: destinatario.id,
  }, origenCtx, origen.username, client));
  ok(sinMotivo?.code === 'MOTIVO_OBSERVACION_REQUERIDO', '3. motivo obligatorio');

  const sinDestino = await expectError(() => observarEntregableDirigido(e1, {
    destino_submodulo_codigo: 'REGISTRO_ORDENES_CONTRATACION',
    motivo: 'Sin persona destino',
  }, origenCtx, origen.username, client));
  ok(sinDestino?.code === 'USUARIO_DESTINO_ID_INVALIDO', '2. persona destino obligatoria');

  const resultado = await observarEntregableDirigido(e1, {
    destino_submodulo_codigo: 'REGISTRO_ORDENES_CONTRATACION',
    usuario_destino_id: destinatario.id,
    motivo: 'Observación productiva F2',
  }, origenCtx, origen.username, client);
  ok(resultado?.cambio_responsable?.ejecutado === true, '1. routing dirigido válido');

  const estadoDespues = (await client.query(`
    SELECT etapa_codigo, etapa_label, responsable_usuario_id, version
    FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [e1])).rows[0];
  ok(Number(estadoDespues.responsable_usuario_id) === Number(destinatario.id),
    '4. responsable cambia al destino');
  ok(estadoDespues.etapa_codigo === etapaAntes.etapa_codigo, '5. etapa se conserva');
  ok(estadoDespues.etapa_label === 'Registro de Órdenes', '5b. subtexto destino en etapa_label');

  const asignaciones = (await client.query(`
    SELECT activo, usuario_id, origen_asignacion
    FROM entregable_asignaciones
    WHERE orden_entrega_id=$1
    ORDER BY id ASC
  `, [e1])).rows;
  ok(asignaciones.filter((row) => !row.activo).length >= 1, '6. asignación anterior se cierra');
  ok(asignaciones.some((row) => row.activo && Number(row.usuario_id) === Number(destinatario.id)),
    '7. nueva asignación activa');

  const eventos = (await client.query(`
    SELECT evento_codigo
    FROM entregable_eventos
    WHERE orden_entrega_id=$1
    ORDER BY id DESC
  `, [e1])).rows;
  ok(eventos.some((row) => row.evento_codigo === 'ENTREGABLE_OBSERVACION_DIRIGIDA'),
    '8. evento registrado');

  const e2Estado = (await client.query(`
    SELECT responsable_usuario_id FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [e2])).rows[0];
  ok(Number(e2Estado?.responsable_usuario_id) !== Number(destinatario.id), '11. E2 intacto');

  const bandejaDest = await listarMisObservacionesDirigidas({ userCtx: destCtx, client });
  ok(bandejaDest.data.some((row) => Number(row.orden_entrega_id) === e1),
    '10. destino aparece en Observaciones recibidas');

  fixture = {
    origenCtx,
    e1,
    observacion: resultado.entregable_observacion,
  };
} catch (error) {
  ok(false, `fixture transaccional (${error.message})`);
} finally {
  await client.query('ROLLBACK');
  client.release();
}

const menuOrigen = entregableMenuItems({
  orden_entrega_id: 1,
  solo_lectura_routing_origen: true,
  puede_ver_observacion_dirigida: true,
  puede_ver_trazabilidad: true,
});
ok(menuOrigen.some((item) => item.act === 'verExpediente')
  && menuOrigen.some((item) => item.act === 'verObservacionDirigida')
  && menuOrigen.some((item) => item.act === 'verTrazabilidad')
  && !menuOrigen.some((item) => item.act === 'subsanarEntregable')
  && !menuOrigen.some((item) => item.act === 'generarActa')
  && !menuOrigen.some((item) => item.act === 'derivarCoordinadorCM'),
'9. origen pierde mutaciones (solo lectura)');

const menuRecibido = entregableMenuItems({
  puede_registrar_recepcion: false,
  puede_modificar_entregable: true,
  puede_observar: true,
  puede_gestionar_conformidad: true,
  puede_ver_trazabilidad: true,
  ultima_recepcion: { id: 1 },
  situacion_codigo: 'RECIBIDO',
});
ok(menuRecibido.some((item) => item.label === 'Modificar entregable')
  && menuRecibido.some((item) => item.act === 'observarEntregable')
  && menuRecibido.some((item) => item.act === 'generarActa'),
'13a. matriz AU recibida sin observación');

const menuActaSinFirmada = entregableMenuItems({
  puede_ver_acta_generada: true,
  puede_adjuntar_acta_firmada: true,
  puede_observar: true,
  puede_derivar_coordinador_cm: false,
  puede_ver_trazabilidad: true,
  acta_generada_version: 1,
  firmada_vigente: false,
  situacion_codigo: 'ACTA_GENERADA',
});
ok(menuActaSinFirmada.some((item) => item.act === 'verActaGenerada')
  && menuActaSinFirmada.some((item) => item.act === 'adjuntarActaFirmada')
  && menuActaSinFirmada.some((item) => item.act === 'observarEntregable')
  && !menuActaSinFirmada.some((item) => item.act === 'derivarCoordinadorCM'),
'14. acta sin firmada no deriva CM');

const menuConforme = entregableMenuItems({
  puede_ver_acta_generada: true,
  puede_ver_acta_firmada: true,
  puede_observar: true,
  puede_derivar_coordinador_cm: true,
  puede_ver_trazabilidad: true,
  acta_generada_version: 1,
  firmada_vigente: true,
  situacion_codigo: 'CONFORME',
});
ok(menuConforme.some((item) => item.act === 'derivarCoordinadorCM'),
  '15. firmada vigente sí habilita derivar CM');

ok(await snapshot('SELECT * FROM expediente_estado_vigente ORDER BY requerimiento_id') === globalBefore,
  '12. expediente global intacto');
ok(await snapshot(`
  SELECT oc.*, oe.id AS entrega_id
  FROM ordenes_contratacion oc
  LEFT JOIN orden_entregas oe ON oe.orden_id=oc.id
  WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
  ORDER BY oc.id, oe.id
`) === os1105Before,
'S. OS 1105 real intacta');

const routeSrc = readFileSync(new URL('../server/routes/entregablesServicios.js', import.meta.url), 'utf8');
ok(routeSrc.includes("router.post('/:id/observaciones-dirigidas'"),
  'endpoint POST observaciones-dirigidas registrado');

await pool.end();
console.log(`\n=== Resultado RC8.15.6F-2: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);

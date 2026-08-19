/**
 * RC8.15.6F-1 — Modelo canónico de routing institucional por entregable.
 * Los fixtures viven dentro de una transacción que siempre termina en ROLLBACK.
 */
import { existsSync } from 'node:fs';
import pool, { query } from '../server/db.js';
import {
  CATALOGO_DESTINOS_OBSERVACION,
  listarDestinatariosObservacion,
  obtenerDestinoObservacion,
  registrarRoutingObservacionEntregable,
  validarDestinatarioObservacion,
} from '../server/lib/observacionesEntregableRouting.js';

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

console.log('\n=== RC8.15.6F-1 — Modelo routing observaciones ===\n');

const migrationPath = new URL(
  '../server/migrations/052_enrutamiento_observaciones_entregable.js',
  import.meta.url,
);
const migrationApplied = Number((await query(`
  SELECT COUNT(*)::int AS n
  FROM schema_migrations
  WHERE migration='052_enrutamiento_observaciones_entregable.js'
`)).rows[0].n);
ok(existsSync(migrationPath) && migrationApplied === 1, 'A. migración 052 existe y está aplicada');

const workflowColumns = (await query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='workflow_observaciones'
`)).rows.map((row) => row.column_name);
ok([
  'origen_submodulo_codigo',
  'destino_submodulo_codigo',
  'usuario_origen_id',
  'usuario_destino_id',
].every((column) => workflowColumns.includes(column)),
'B. workflow_observaciones contiene los campos estructurados');

const constraints = (await query(`
  SELECT conname
  FROM pg_constraint
  WHERE conrelid IN (
    'workflow_observaciones'::regclass,
    'entregable_observaciones'::regclass
  )
`)).rows.map((row) => row.conname);
ok(constraints.includes('fk_workflow_obs_usuario_origen'), 'C. FK de usuario origen válida');
ok(constraints.includes('fk_workflow_obs_usuario_destino'), 'D. FK de usuario destino válida');
ok(constraints.includes('fk_entregable_obs_workflow'), 'E. observación de entregable enlaza al routing');

const uniqueLink = Number((await query(`
  SELECT COUNT(*)::int AS n
  FROM pg_indexes
  WHERE schemaname='public'
    AND tablename='entregable_observaciones'
    AND indexname='uq_entregable_obs_workflow'
`)).rows[0].n);
ok(uniqueLink === 1, 'cardinalidad 1:1 protegida por índice UNIQUE parcial');

const destinoRegistro = CATALOGO_DESTINOS_OBSERVACION.find(
  (item) => item.submodulo_codigo === 'REGISTRO_ORDENES_CONTRATACION',
);
ok(destinoRegistro?.label === 'Registro de Órdenes'
  && destinoRegistro?.modulo === 'CONTRATACIONES'
  && destinoRegistro?.permiso_requerido === 'VER',
'G. catálogo backend reconoce Registro de Órdenes desde permisos centrales');

const destinoInvalido = await expectError(async () => obtenerDestinoObservacion('DESTINO_INVENTADO'));
ok(destinoInvalido?.code === 'SUBMODULO_DESTINO_INVALIDO',
  'H. destino desconocido es rechazado');

const recepcionesBefore = await snapshot('SELECT * FROM entregable_recepciones ORDER BY id');
const actasBefore = await snapshot('SELECT * FROM entregable_conformidad_actas ORDER BY id');
const estadosBefore = await snapshot('SELECT * FROM entregable_estado_vigente ORDER BY orden_entrega_id');
const globalBefore = await snapshot('SELECT * FROM expediente_estado_vigente ORDER BY requerimiento_id');
const os1105Before = await snapshot(`
  SELECT oc.*, oe.id AS entrega_id, oe.estado AS entrega_estado
  FROM ordenes_contratacion oc
  LEFT JOIN orden_entregas oe ON oe.orden_id=oc.id
  WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
  ORDER BY oc.id, oe.id
`);
const bienesBefore = await snapshot(`
  SELECT
    (SELECT COUNT(*)::int FROM recepcion_bienes_expedientes) AS expedientes,
    (SELECT COUNT(*)::int FROM recepciones_bienes) AS recepciones,
    (SELECT COUNT(*)::int FROM recepcion_bienes_eventos) AS eventos
`);

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const permisoRegistro = JSON.stringify({
    modulos: ['CONTRATACIONES'],
    submodulos: ['REGISTRO_ORDENES_CONTRATACION'],
    actividades: ['VER'],
    actividadesPorSubmodulo: {
      REGISTRO_ORDENES_CONTRATACION: ['VER'],
    },
  });
  const sinPermiso = JSON.stringify({
    modulos: [],
    submodulos: [],
    actividades: [],
    actividadesPorSubmodulo: {},
  });
  async function crearUsuario(sufijo, activo, permisos) {
    return (await client.query(`
      INSERT INTO usuarios (dni, username, nombre, rol, activo, permisos)
      VALUES ($1,$2,$3,'usuario',$4,$5::jsonb)
      RETURNING *
    `, [
      `F1${sufijo.slice(0, 5)}${nonce}`.slice(0, 20),
      `f1_${nonce}_${sufijo}`.toLowerCase(),
      `Fixture F1 ${sufijo}`,
      activo,
      permisos,
    ])).rows[0];
  }
  const origen = await crearUsuario('origen', true, sinPermiso);
  const autorizado = await crearUsuario('autorizado', true, permisoRegistro);
  const inactivo = await crearUsuario('inactivo', false, permisoRegistro);
  const incompatible = await crearUsuario('incompatible', true, sinPermiso);

  const destinatarios = await listarDestinatariosObservacion({
    submoduloDestino: 'REGISTRO_ORDENES_CONTRATACION',
    client,
  });
  ok(!destinatarios.some((item) => item.id === Number(inactivo.id)),
    'I. usuario inactivo queda excluido');
  ok(!destinatarios.some((item) => item.id === Number(incompatible.id)),
    'J. usuario sin permiso queda excluido');
  ok(destinatarios.some((item) => item.id === Number(autorizado.id)),
    'K. usuario autorizado queda incluido');

  const validado = await validarDestinatarioObservacion({
    submoduloDestino: 'REGISTRO_ORDENES_CONTRATACION',
    usuarioDestinoId: autorizado.id,
    client,
  });
  ok(validado.id === Number(autorizado.id), 'L. destinatario válido se acepta por ID');
  const nombreLibre = await expectError(() => validarDestinatarioObservacion({
    submoduloDestino: 'REGISTRO_ORDENES_CONTRATACION',
    usuarioDestinoId: autorizado.nombre,
    client,
  }));
  ok(nombreLibre?.code === 'USUARIO_DESTINO_ID_INVALIDO',
    'M. un nombre libre no es identidad canónica');

  const base = (await client.query(`
    SELECT oc.requerimiento_id, oc.proveedor_id
    FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL
    ORDER BY oc.id
    LIMIT 1
  `)).rows[0];
  if (!base) throw new Error('No existe requerimiento/proveedor base para fixture F1');
  const ordenId = Number((await client.query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,200,'EN_EJECUCION','SERVICIO')
    RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156F1${nonce}`])).rows[0].id);
  async function crearEntrega(numero) {
    return Number((await client.query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion,
        dias_plazo, fecha_maxima, importe, estado
      ) VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO')
      RETURNING id
    `, [ordenId, numero, `Fixture F1 ${numero}`])).rows[0].id);
  }
  async function crearRecepcion(entregaId, numero) {
    return Number((await client.query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,$3,'INICIAL',CURRENT_DATE,$4,'RECIBIDO','test-f1')
      RETURNING id
    `, [entregaId, ordenId, numero, `SGD-F1-${nonce}-${numero}`])).rows[0].id);
  }
  const e1 = await crearEntrega(1);
  const e2 = await crearEntrega(2);
  const r1 = await crearRecepcion(e1, 1);
  const r2 = await crearRecepcion(e2, 1);

  const cruzado = await expectError(() => registrarRoutingObservacionEntregable({
    requerimientoId: base.requerimiento_id,
    ordenId,
    ordenEntregaId: e1,
    recepcionId: r2,
    destinoSubmoduloCodigo: 'REGISTRO_ORDENES_CONTRATACION',
    usuarioOrigenId: origen.id,
    usuarioDestinoId: autorizado.id,
    motivo: 'Contexto cruzado',
    client,
  }));
  ok(cruzado?.code === 'CONTEXTO_OBSERVACION_CRUZADO',
    'F. una relación cruzada entregable/recepción es rechazada');

  const routing = await registrarRoutingObservacionEntregable({
    requerimientoId: base.requerimiento_id,
    ordenId,
    ordenEntregaId: e1,
    recepcionId: r1,
    destinoSubmoduloCodigo: 'REGISTRO_ORDENES_CONTRATACION',
    usuarioOrigenId: origen.id,
    usuarioDestinoId: autorizado.id,
    motivo: 'Observación fixture F1',
    client,
  });
  ok(Number(routing.entregable_observacion.workflow_observacion_id)
    === Number(routing.workflow_observacion.id)
    && Number(routing.workflow_observacion.usuario_origen_id) === Number(origen.id)
    && Number(routing.workflow_observacion.usuario_destino_id) === Number(autorizado.id),
  'routing institucional y observación específica quedan vinculados');
  ok(routing.cambio_responsable.preparado
    && !routing.cambio_responsable.ejecutado
    && routing.cambio_responsable.requiere_etapa_workflow_explicita,
  'contrato prepara el cambio de responsable sin inventar una etapa');

  const legacy = (await client.query(`
    INSERT INTO workflow_observaciones (
      expediente_id, origen, estado, emitida_por, responsable_subsanacion,
      motivo, documentos, dias_plazo
    ) VALUES ($1,'LEGACY','OBS_EMITIDA','legacy','legacy','Histórica','[]'::jsonb,5)
    RETURNING *
  `, [base.requerimiento_id])).rows[0];
  ok(legacy.origen_submodulo_codigo == null
    && legacy.destino_submodulo_codigo == null
    && legacy.usuario_origen_id == null
    && legacy.usuario_destino_id == null,
  'N. histórico con campos NULL continúa siendo consultable');

  await client.query('SAVEPOINT unique_routing');
  const duplicate = await expectError(() => client.query(`
    INSERT INTO entregable_observaciones (
      orden_id, orden_entrega_id, recepcion_id, workflow_observacion_id,
      motivo, estado, observado_por
    ) VALUES ($1,$2,$3,$4,'Duplicada','OBS_EMITIDA','test-f1')
  `, [ordenId, e2, r2, routing.workflow_observacion.id]));
  await client.query('ROLLBACK TO SAVEPOINT unique_routing');
  ok(duplicate?.code === '23505', 'un routing institucional no puede reutilizarse en otra observación');
} catch (error) {
  ok(false, `fixture transaccional completado (${error.message})`);
} finally {
  await client.query('ROLLBACK');
  client.release();
}

ok(await snapshot('SELECT * FROM entregable_recepciones ORDER BY id') === recepcionesBefore,
  'O. entregable_recepciones permanece intacta');
ok(await snapshot('SELECT * FROM entregable_conformidad_actas ORDER BY id') === actasBefore,
  'P. actas permanecen intactas');
ok(await snapshot('SELECT * FROM entregable_estado_vigente ORDER BY orden_entrega_id') === estadosBefore,
  'Q. estado específico de entregables permanece intacto');
ok(await snapshot('SELECT * FROM expediente_estado_vigente ORDER BY requerimiento_id') === globalBefore,
  'R. expediente global permanece intacto');
ok(await snapshot(`
  SELECT oc.*, oe.id AS entrega_id, oe.estado AS entrega_estado
  FROM ordenes_contratacion oc
  LEFT JOIN orden_entregas oe ON oe.orden_id=oc.id
  WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
  ORDER BY oc.id, oe.id
`) === os1105Before,
'S. OS 1105 real permanece intacta');
ok(await snapshot(`
  SELECT
    (SELECT COUNT(*)::int FROM recepcion_bienes_expedientes) AS expedientes,
    (SELECT COUNT(*)::int FROM recepciones_bienes) AS recepciones,
    (SELECT COUNT(*)::int FROM recepcion_bienes_eventos) AS eventos
`) === bienesBefore,
'T. Bienes permanece intacto');

await pool.end();
console.log(`\n=== Resultado RC8.15.6F-1: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);

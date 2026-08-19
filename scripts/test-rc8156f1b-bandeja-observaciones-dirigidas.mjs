/**
 * RC8.15.6F-1B — Bandeja personal de observaciones dirigidas.
 * Fixtures transaccionales con ROLLBACK; lecturas de UI por fuente estática.
 */
import { readFileSync } from 'node:fs';
import pool, { query } from '../server/db.js';
import {
  listarMisObservacionesDirigidas,
  registrarRoutingObservacionEntregable,
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

console.log('\n=== RC8.15.6F-1B — Bandeja observaciones dirigidas ===\n');

const routeSrc = readFileSync(new URL('../server/routes/entregablesServicios.js', import.meta.url), 'utf8');
const routingSrc = readFileSync(new URL('../server/lib/observacionesEntregableRouting.js', import.meta.url), 'utf8');
const entregablesSrc = readFileSync(new URL('../server/lib/entregablesServicios.js', import.meta.url), 'utf8');
const viewSrc = readFileSync(new URL('../src/views/contratacion/registroOrdenesView.js', import.meta.url), 'utf8');

ok(routeSrc.includes("router.get('/observaciones-dirigidas/mias'"),
  'A. endpoint GET /observaciones-dirigidas/mias existe');
ok(!routeSrc.includes('req.query.usuario_id') && !routeSrc.includes('req.query.user_id'),
  'B. endpoint no acepta usuario_id arbitrario desde query');
ok(routingSrc.includes('userCtx?.id') && !routingSrc.includes('usuarioId'),
  'B2. listarMisObservacionesDirigidas resuelve usuario solo desde userCtx');

const sinSesion = await expectError(() => listarMisObservacionesDirigidas({ userCtx: null }));
ok(sinSesion?.code === 'AUTH_REQUIRED', 'A2. bandeja exige sesión autenticada');

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
  const sinPermiso = JSON.stringify({ modulos: [], submodulos: [], actividades: [], actividadesPorSubmodulo: {} });

  async function crearUsuario(sufijo, permisos) {
    return (await client.query(`
      INSERT INTO usuarios (dni, username, nombre, rol, activo, permisos)
      VALUES ($1,$2,$3,'usuario',TRUE,$4::jsonb)
      RETURNING *
    `, [
      `F1B${sufijo.slice(0, 4)}${nonce}`.slice(0, 20),
      `f1b_${nonce}_${sufijo}`.toLowerCase(),
      `Fixture F1B ${sufijo}`,
      permisos,
    ])).rows[0];
  }

  const origen = await crearUsuario('origen', sinPermiso);
  const destinatario = await crearUsuario('destino', permisoRegistro);
  const otro = await crearUsuario('otro', permisoRegistro);
  const adminCtx = { id: 1, rol: 'admin' };

  const base = (await client.query(`
    SELECT oc.requerimiento_id, oc.proveedor_id
    FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL
    ORDER BY oc.id
    LIMIT 1
  `)).rows[0];
  if (!base) throw new Error('No existe requerimiento/proveedor base para fixture F1B');

  const ordenId = Number((await client.query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,300,'EN_EJECUCION','SERVICIO')
    RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156F1B${nonce}`])).rows[0].id);

  async function crearEntrega(numero) {
    return Number((await client.query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion,
        dias_plazo, fecha_maxima, importe, estado
      ) VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO')
      RETURNING id
    `, [ordenId, numero, `Fixture F1B ${numero}`])).rows[0].id);
  }
  async function crearRecepcion(entregaId, numero) {
    return Number((await client.query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,$3,'INICIAL',CURRENT_DATE,$4,'RECIBIDO','test-f1b')
      RETURNING id
    `, [entregaId, ordenId, numero, `SGD-F1B-${nonce}-${numero}`])).rows[0].id);
  }

  const e1 = await crearEntrega(1);
  const e2 = await crearEntrega(2);
  const r1 = await crearRecepcion(e1, 1);
  const r2 = await crearRecepcion(e2, 1);

  const routingE1 = await registrarRoutingObservacionEntregable({
    requerimientoId: base.requerimiento_id,
    ordenId,
    ordenEntregaId: e1,
    recepcionId: r1,
    destinoSubmoduloCodigo: 'REGISTRO_ORDENES_CONTRATACION',
    usuarioOrigenId: origen.id,
    usuarioDestinoId: destinatario.id,
    motivo: 'Observación dirigida E1',
    client,
  });

  await registrarRoutingObservacionEntregable({
    requerimientoId: base.requerimiento_id,
    ordenId,
    ordenEntregaId: e2,
    recepcionId: r2,
    destinoSubmoduloCodigo: 'REGISTRO_ORDENES_CONTRATACION',
    usuarioOrigenId: origen.id,
    usuarioDestinoId: otro.id,
    motivo: 'Observación dirigida E2 a otro usuario',
    client,
  });

  const e3 = await crearEntrega(3);
  const r3 = await crearRecepcion(e3, 1);
  const legacyWo = (await client.query(`
    INSERT INTO workflow_observaciones (
      expediente_id, origen, estado, emitida_por, responsable_subsanacion,
      motivo, documentos, dias_plazo
    ) VALUES ($1,'LEGACY','OBS_EMITIDA','legacy','legacy','Histórica sin destino','[]'::jsonb,5)
    RETURNING id
  `, [base.requerimiento_id])).rows[0];
  await client.query(`
    INSERT INTO entregable_observaciones (
      orden_id, orden_entrega_id, recepcion_id, workflow_observacion_id,
      motivo, estado, observado_por
    ) VALUES ($1,$2,$3,$4,'Histórica sin destino canónico','OBS_EMITIDA','legacy')
  `, [ordenId, e3, r3, legacyWo.id]);

  const destCtx = { id: Number(destinatario.id), rol: 'usuario', permisos: JSON.parse(permisoRegistro) };
  const otroCtx = { id: Number(otro.id), rol: 'usuario', permisos: JSON.parse(permisoRegistro) };

  const abiertasDest = await listarMisObservacionesDirigidas({
    userCtx: destCtx,
    estado: 'ABIERTAS',
    client,
  });
  const fila = abiertasDest.data.find(
    (item) => item.workflow_observacion_id === Number(routingE1.workflow_observacion.id),
  );
  ok(abiertasDest.data.length >= 1 && fila, 'C. usuario destino ve su observación');
  ok(abiertasDest.data.every((item) => ['OBS_EMITIDA', 'OBS_EN_ATENCION'].includes(item.estado_observacion)),
    'F. filtro ABIERTAS solo devuelve estados abiertos');

  const otroBandeja = await listarMisObservacionesDirigidas({ userCtx: otroCtx, client });
  ok(!otroBandeja.data.some(
    (item) => item.workflow_observacion_id === Number(routingE1.workflow_observacion.id),
  ), 'D. otro usuario no ve la observación ajena');
  ok(otroBandeja.data.every(
    (item) => Number(item.usuario_destino_id) === Number(otro.id),
  ), 'G. cada fila pertenece al destinatario consultado');

  const adminBandeja = await listarMisObservacionesDirigidas({ userCtx: adminCtx, client });
  ok(adminBandeja.meta.admin_override === true
    && adminBandeja.data.some((item) => Number(item.usuario_destino_id) === Number(destinatario.id))
    && adminBandeja.data.some((item) => Number(item.usuario_destino_id) === Number(otro.id)),
  'E. admin conserva override institucional');

  const legacyBandeja = await listarMisObservacionesDirigidas({ userCtx: destCtx, estado: 'TODAS', client });
  ok(!legacyBandeja.data.some((item) => item.motivo === 'Histórica sin destino canónico'),
    'H. histórica sin usuario_destino_id no aparece como dirigida');

  ok(fila?.orden_numero === `RC8156F1B${nonce}`, 'I. orden correcta');
  ok(Number(fila?.numero_entregable) === 1, 'J. entregable correcto (E1)');
  ok(Number(fila?.orden_id) === ordenId && Number(fila?.orden_entrega_id) === e1 && ordenId !== e1,
    'K. orden_id y orden_entrega_id permanecen separados');
  ok(fila?.motivo === 'Observación dirigida E1', 'L. motivo correcto');
  ok(fila?.origen_submodulo_codigo === 'PRESENTACION_ENTREGABLES'
    && fila?.destino_submodulo_codigo === 'REGISTRO_ORDENES_CONTRATACION',
  'M. origen/destino institucionales correctos');

  ok(!abiertasDest.data.some((item) => Number(item.orden_entrega_id) === e2),
    'Q. E2 no aparece en bandeja del destinatario de E1');

  const accesoRouting = Number((await client.query(`
    SELECT COUNT(*)::int AS n
    FROM entregable_observaciones eo
    JOIN workflow_observaciones wo ON wo.id=eo.workflow_observacion_id
    WHERE eo.orden_entrega_id=$1 AND eo.orden_id=$2
      AND wo.usuario_destino_id=$3
  `, [e1, ordenId, destinatario.id])).rows[0]?.n || 0);
  const routingEvents = (await client.query(`
    SELECT wo.id AS workflow_observacion_id, 'ENTREGABLE_OBSERVACION_DIRIGIDA' AS evento_codigo
    FROM entregable_observaciones eo
    JOIN workflow_observaciones wo ON wo.id=eo.workflow_observacion_id
    WHERE eo.orden_entrega_id=$1 AND eo.orden_id=$2
  `, [e1, ordenId])).rows;
  ok(accesoRouting > 0
    && routingEvents.some((evento) => evento.evento_codigo === 'ENTREGABLE_OBSERVACION_DIRIGIDA'
      && Number(evento.workflow_observacion_id) === Number(routingE1.workflow_observacion.id)),
  'P. trazabilidad vinculada y accesible para destinatario sin PRESENTACION_ENTREGABLES');
ok(entregablesSrc.includes('ENTREGABLE_OBSERVACION_DIRIGIDA')
  && entregablesSrc.includes('accesoRouting'),
  'P2. listarTrazabilidadEntregable fusiona routing y autoriza destinatario');

  fixture = { fila, ordenId, e1 };
} catch (error) {
  ok(false, `fixture transaccional completado (${error.message})`);
} finally {
  await client.query('ROLLBACK');
  client.release();
}

ok(viewSrc.includes('verExpedienteObservacion')
  && viewSrc.includes('openExpedienteOrdenModal({')
  && viewSrc.includes('numero_orden: row.orden_numero'),
  'N. Ver expediente reutiliza modal con orden_id y numero_orden del contrato');
ok(viewSrc.includes('openObservacionDirigida')
  && viewSrc.includes('showObservacionReadOnlyModal')
  && viewSrc.includes('Observación dirigida'),
  'O. Ver observación abre modal de solo lectura');
ok(viewSrc.includes('Observaciones recibidas')
  && viewSrc.includes('verTrazabilidadObservacion')
  && viewSrc.includes('listarTrazabilidad(row.orden_entrega_id)'),
  'O2. pestaña y acción de trazabilidad integradas en Registro de Órdenes');

ok(await snapshot('SELECT * FROM expediente_estado_vigente ORDER BY requerimiento_id') === globalBefore,
  'R. expediente global no cambia');
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
console.log(`\n=== Resultado RC8.15.6F-1B: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);

/**
 * RC8.15.6E-2 — Acciones productivas del Analista CM.
 * Fixtures aislados; OS 1105, Bienes y expediente global son solo lectura.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import {
  derivarEntregableAnalistaCM,
  derivarEntregableCoordinadorCM,
  derivarEntregablePago,
  listarAnalistasPagoEntregable,
  observarEntregableAnalistaCM,
} from '../server/lib/entregablesServicios.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { EVENTOS } from '../shared/workflow/eventos.js';
import { ETAPAS } from '../shared/workflow/etapas.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
let passed = 0;
let failed = 0;
let ordenId = null;
let requerimientoId = null;
const usuariosOriginales = [];

function ok(condition, message) {
  if (condition) { passed += 1; console.log(`  ✓ ${message}`); }
  else { failed += 1; console.error(`  ✗ ${message}`); }
}

async function reject(work) {
  try { await work(); return null; } catch (error) { return error; }
}

async function snapshotEntregable(id) {
  return JSON.stringify({
    estado: (await query('SELECT * FROM entregable_estado_vigente WHERE orden_entrega_id=$1', [id])).rows,
    asignaciones: (await query('SELECT * FROM entregable_asignaciones WHERE orden_entrega_id=$1 ORDER BY id', [id])).rows,
    eventos: (await query('SELECT * FROM entregable_eventos WHERE orden_entrega_id=$1 ORDER BY id', [id])).rows,
    observaciones: (await query('SELECT * FROM entregable_observaciones WHERE orden_entrega_id=$1 ORDER BY id', [id])).rows,
  });
}

async function snapshotGlobal(id) {
  return JSON.stringify({
    estado: (await query('SELECT * FROM expediente_estado_vigente WHERE requerimiento_id=$1', [id])).rows,
    asignaciones: (await query('SELECT * FROM expediente_asignaciones WHERE requerimiento_id=$1 ORDER BY id', [id])).rows,
    requerimiento: (await query('SELECT estado_actual FROM requerimientos WHERE id=$1', [id])).rows,
  });
}

async function snapshotOs1105() {
  return JSON.stringify((await query(`
    SELECT oc.id,
      (SELECT COUNT(*)::int FROM entregable_estado_vigente e WHERE e.orden_id=oc.id) estados,
      (SELECT COUNT(*)::int FROM entregable_asignaciones a WHERE a.orden_id=oc.id) asignaciones,
      (SELECT COUNT(*)::int FROM entregable_eventos e WHERE e.orden_id=oc.id) eventos,
      (SELECT COUNT(*)::int FROM entregable_observaciones o WHERE o.orden_id=oc.id) observaciones
    FROM ordenes_contratacion oc
    WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
    ORDER BY oc.id
  `)).rows);
}

async function snapshotBienes() {
  const result = {};
  for (const table of ['recepcion_bienes_expedientes', 'recepciones_bienes', 'recepcion_bienes_eventos']) {
    result[table] = Number((await query(`SELECT COUNT(*)::int n FROM ${table}`)).rows[0].n);
  }
  return JSON.stringify(result);
}

async function assertAtomic(id, expectedCode, work, message) {
  const before = await snapshotEntregable(id);
  const error = await reject(work);
  ok(error?.code === expectedCode && await snapshotEntregable(id) === before, message);
  return error;
}

console.log('\n=== RC8.15.6E-2 — Acciones Analista CM ===\n');

const routeSource = read('server/routes/entregablesServicios.js');
const serviceSource = read('src/services/entregablesServiciosService.js');
const backendSource = read('server/lib/entregablesServicios.js');
ok(/observaciones-analista-cm/.test(routeSource)
  && /observarAnalistaCM/.test(serviceSource), 'endpoint de observación Analista CM conectado');
ok(/analistas-pago/.test(routeSource) && /derivar-pago/.test(routeSource)
  && /listarAnalistasPago/.test(serviceSource), 'listado y derivación Pago conectados');
ok(/ENTREGABLE_OBSERVADO_ANALISTA_CM/.test(backendSource)
  && /ENTREGABLE_DERIVADO_PAGO/.test(backendSource)
  && !/evento:\s*EVENTOS\.EXPEDIENTE_DERIVADO_PAGO/.test(backendSource),
'acciones usan eventos específicos del entregable');
const menuAnalista = entregableMenuItems({
  estado_etapa_codigo: ETAPAS.REVISION_ANALISTA_CM,
  puede_observar_analista_cm: true,
  puede_derivar_pago: true,
  puede_ver_trazabilidad: true,
});
ok(menuAnalista.map((item) => item.label).join('|')
  === 'Ver expediente|Observar|Derivar a Pago|Ver trazabilidad',
'matriz de acciones del Analista CM es correcta');

const os1105Before = await snapshotOs1105();
const bienesBefore = await snapshotBienes();
let globalBefore = null;
let workflowGlobalBefore = null;

try {
  const base = (await query(`
    SELECT e.requerimiento_id, oc.proveedor_id
    FROM expediente_estado_vigente e
    JOIN ordenes_contratacion oc ON oc.requerimiento_id=e.requerimiento_id
    WHERE e.etapa_codigo='PRESENTACION_ENTREGABLES' AND oc.proveedor_id IS NOT NULL
    ORDER BY e.requerimiento_id LIMIT 1
  `)).rows[0];
  const usuarios = (await query('SELECT * FROM usuarios ORDER BY activo DESC, id LIMIT 7')).rows;
  if (!base || usuarios.length < 7) throw new Error('No existe base mínima de usuarios para RC8.15.6E-2');
  const [area, coordinador, analista, otroAnalista, pago, sinPerfil, pagoInactivo] = usuarios;
  for (const user of usuarios) {
    usuariosOriginales.push({
      id: user.id, cargo: user.cargo, permisos: user.permisos,
      activo: user.activo, rol: user.rol,
    });
  }
  const configurar = (id, activo, cargo, perfil, rol = 'usuario') => query(`
    UPDATE usuarios SET activo=$2, cargo=$3, permisos=$4::jsonb, rol=$5 WHERE id=$1
  `, [id, activo, cargo, JSON.stringify({ perfil }), rol]);
  await configurar(area.id, true, 'Área Usuaria', 'AREA_USUARIA');
  await configurar(coordinador.id, true, 'Coordinador CM', 'COORDINADOR_CM');
  await configurar(analista.id, true, 'Analista CM', 'ANALISTA_CM');
  await configurar(otroAnalista.id, true, 'Analista CM', 'ANALISTA_CM');
  await configurar(pago.id, true, 'Analista de Pago', 'ANALISTA_PAGO');
  await configurar(sinPerfil.id, true, 'Usuario sin perfil', 'AREA_USUARIA');
  await configurar(pagoInactivo.id, false, 'Analista de Pago', 'ANALISTA_PAGO');

  const centroReq = (await query(`
    SELECT r.cmn, r.area, r.payload FROM requerimientos r WHERE r.id=$1
  `, [base.requerimiento_id])).rows[0];
  const { resolverCentroDesdeRequerimiento } = await import('../server/lib/recepcionBienesAlcance.js');
  const centro = resolverCentroDesdeRequerimiento(centroReq);
  await query(`
    UPDATE usuarios SET centro=$2, codigo_centro_costo=$2 WHERE id=$1
  `, [area.id, centro.centro_codigo]);

  const ctx = (user, perfil, rol = 'usuario') => ({
    id: Number(user.id), username: user.username, nombre: user.nombre,
    permisos: { perfil }, cargo: perfil, rol,
  });
  const areaCtx = ctx(area, 'AREA_USUARIA');
  const coordinadorCtx = ctx(coordinador, 'COORDINADOR_CM');
  const analistaCtx = ctx(analista, 'ANALISTA_CM');
  const otroAnalistaCtx = ctx(otroAnalista, 'ANALISTA_CM');
  const adminCtx = ctx(sinPerfil, 'AREA_USUARIA', 'admin');

  requerimientoId = Number(base.requerimiento_id);
  globalBefore = await snapshotGlobal(requerimientoId);
  workflowGlobalBefore = JSON.stringify((await query(
    'SELECT * FROM workflow_eventos WHERE expediente_id=$1 ORDER BY id',
    [requerimientoId],
  )).rows);
  ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,2000,'EN_EJECUCION','SERVICIO')
    RETURNING id
  `, [requerimientoId, base.proveedor_id, `RC8156E2${Date.now()}`])).rows[0].id);

  async function crearEntrega(numero) {
    const id = Number((await query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion,
        dias_plazo, fecha_maxima, importe, estado
      ) VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO')
      RETURNING id
    `, [ordenId, numero, `Fixture E2 ${numero}`])).rows[0].id);
    await inicializarEstadoResponsableEntregable(id, { actualizadoPor: 'test-e2' });
    await query(`
      UPDATE entregable_estado_vigente SET responsable_tipo='PERSONA',
        responsable_usuario_id=$2, responsable_unidad='AREA_USUARIA',
        responsable_fuente='asignacion_explicita'
      WHERE orden_entrega_id=$1
    `, [id, area.id]);
    await query(`
      UPDATE entregable_asignaciones SET tipo_responsable='PERSONA',
        usuario_id=$2, unidad_codigo='AREA_USUARIA'
      WHERE orden_entrega_id=$1 AND activo=TRUE
    `, [id, area.id]);
    const recepcion = (await query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO','test-e2')
      RETURNING *
    `, [id, ordenId, `SGD-E2-${id}`])).rows[0];
    const acta = (await query(`
      INSERT INTO entregable_conformidad_actas (
        orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
        estado_documental, generado_at, generado_por
      ) VALUES ($1,$2,$3,$4,1,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-e2')
      RETURNING *
    `, [ordenId, id, recepcion.id, `ACTA-E2-${id}`])).rows[0];
    const firmada = (await query(`
      INSERT INTO entregable_conformidad_acta_visados (
        orden_id, orden_entrega_id, acta_id, version, nombre, mime_type,
        contenido_base64, estado_documental, vigente, created_by
      ) VALUES ($1,$2,$3,1,$4,'application/pdf',$5,
        'ACTA_CONFORMIDAD_FIRMADA',TRUE,'test-e2')
      RETURNING *
    `, [ordenId, id, acta.id, `firmada-${id}.pdf`,
      Buffer.from('%PDF-1.4 RC8156E2').toString('base64')])).rows[0];
    return { id, recepcion, acta, firmada };
  }

  async function prepararAnalista(fixture) {
    await derivarEntregableCoordinadorCM(
      fixture.id, { responsable_id: coordinador.id }, areaCtx, area.username,
    );
    await derivarEntregableAnalistaCM(
      fixture.id, { responsable_id: analista.id }, coordinadorCtx, coordinador.username,
    );
  }

  const observar = await crearEntrega(1);
  const pagoOk = await crearEntrega(2);
  const hermano = await crearEntrega(3);
  const adminObs = await crearEntrega(4);
  const sinCoordinador = await crearEntrega(5);
  const coordinadorInvalido = await crearEntrega(6);
  const sinActa = await crearEntrega(7);
  const sinFirmada = await crearEntrega(8);
  const actaHistorica = await crearEntrega(9);
  const firmadaHistorica = await crearEntrega(10);
  const observacionAbierta = await crearEntrega(11);
  for (const fixture of [
    observar, pagoOk, adminObs, sinCoordinador, coordinadorInvalido,
    sinActa, sinFirmada, actaHistorica, firmadaHistorica, observacionAbierta,
  ]) await prepararAnalista(fixture);

  const hermanoBefore = await snapshotEntregable(hermano.id);
  await assertAtomic(
    observar.id, 'ANALISTA_CM_NO_AUTORIZADO',
    () => observarEntregableAnalistaCM(observar.id, { motivo: 'No autorizado' }, otroAnalistaCtx),
    'A/B. solo Analista CM responsable puede mutar (403)',
  );
  await assertAtomic(
    observar.id, 'MOTIVO_OBSERVACION_REQUERIDO',
    () => observarEntregableAnalistaCM(observar.id, { motivo: '   ' }, analistaCtx),
    'D. motivo vacío se rechaza sin escritura parcial',
  );
  await assertAtomic(
    observar.id, 'USUARIO_DESTINO_ID_REQUERIDO',
    () => observarEntregableAnalistaCM(observar.id, { motivo: 'Sin destino' }, analistaCtx),
    'E. destinatario AU es obligatorio',
  );

  const obsAdmin = await observarEntregableAnalistaCM(
    adminObs.id,
    { motivo: 'Override institucional', usuario_destino_id: area.id },
    adminCtx,
    sinPerfil.username,
  );
  ok(obsAdmin.estado.etapaCodigo === ETAPAS.PRESENTACION_ENTREGABLES
    && Number(obsAdmin.estado.responsableUsuarioId) === Number(area.id),
    'C. administrador conserva override y envía a AU seleccionado');
  const resultadoObs = await observarEntregableAnalistaCM(
    observar.id,
    { motivo: 'Observación productiva Analista CM', usuario_destino_id: area.id },
    analistaCtx,
    analista.username,
  );
  const obsDb = (await query(
    'SELECT * FROM entregable_observaciones WHERE orden_entrega_id=$1 ORDER BY id DESC LIMIT 1',
    [observar.id],
  )).rows[0];
  ok(Number(obsDb.recepcion_id) === Number(observar.recepcion.id)
    && obsDb.estado === 'OBS_EMITIDA'
    && obsDb.workflow_observacion_id != null,
  'F. observación se vincula a recepción y workflow canónico');
  ok(resultadoObs.estado.etapaCodigo === ETAPAS.PRESENTACION_ENTREGABLES
    && Number(resultadoObs.estado.responsableUsuarioId) === Number(area.id),
  'G/H. observación pasa temporalmente al AU seleccionado');
  ok(resultadoObs.evento.evento_codigo === EVENTOS.ENTREGABLE_OBSERVADO_ANALISTA_CM,
    'I. evento de observación queda registrado');
  ok(await snapshotEntregable(hermano.id) === hermanoBefore,
    'J. E2 queda intacto tras observar E1');

  const listaPago = await listarAnalistasPagoEntregable(pagoOk.id, analistaCtx);
  ok(listaPago.some((item) => Number(item.id) === Number(pago.id))
    && !listaPago.some((item) => Number(item.id) === Number(sinPerfil.id))
    && !listaPago.some((item) => Number(item.id) === Number(pagoInactivo.id)),
  'M/N. listado incluye solo ANALISTA_PAGO activos');
  await assertAtomic(
    pagoOk.id, 'RESPONSABLE_DESTINO_REQUERIDO',
    () => derivarEntregablePago(pagoOk.id, {}, analistaCtx),
    'O. destino obligatorio se valida atómicamente',
  );
  await assertAtomic(
    pagoOk.id, 'ANALISTA_PAGO_INVALIDO',
    () => derivarEntregablePago(pagoOk.id, { usuarioDestinoId: sinPerfil.id }, analistaCtx),
    'P. destino sin perfil Pago se rechaza atómicamente',
  );
  await assertAtomic(
    hermano.id, 'ETAPA_ENTREGABLE_NO_COMPATIBLE',
    () => derivarEntregablePago(hermano.id, { usuarioDestinoId: pago.id }, adminCtx),
    'Q. etapa incorrecta se rechaza atómicamente',
  );

  await query('DELETE FROM entregable_conformidad_acta_visados WHERE orden_entrega_id=$1', [sinActa.id]);
  await query('DELETE FROM entregable_conformidad_actas WHERE orden_entrega_id=$1', [sinActa.id]);
  await assertAtomic(
    sinActa.id, 'SIN_ACTA_GENERADA',
    () => derivarEntregablePago(sinActa.id, { usuarioDestinoId: pago.id }, analistaCtx),
    'R. ausencia de Acta vigente bloquea Pago',
  );
  await query('DELETE FROM entregable_conformidad_acta_visados WHERE orden_entrega_id=$1', [sinFirmada.id]);
  await assertAtomic(
    sinFirmada.id, 'SIN_ACTA_FIRMADA_VIGENTE',
    () => derivarEntregablePago(sinFirmada.id, { usuarioDestinoId: pago.id }, analistaCtx),
    'S. ausencia de firmada vigente bloquea Pago',
  );

  async function nuevaRecepcion(fixture, conActa) {
    const recepcion = (await query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,2,'SUBSANACION',CURRENT_DATE,$3,'SUBSANADO','test-e2')
      RETURNING *
    `, [fixture.id, ordenId, `SGD-E2-V2-${fixture.id}`])).rows[0];
    if (!conActa) return recepcion;
    return (await query(`
      INSERT INTO entregable_conformidad_actas (
        orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
        estado_documental, generado_at, generado_por
      ) VALUES ($1,$2,$3,$4,2,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-e2')
      RETURNING *
    `, [ordenId, fixture.id, recepcion.id, `ACTA-E2-V2-${fixture.id}`])).rows[0];
  }
  await nuevaRecepcion(actaHistorica, false);
  await assertAtomic(
    actaHistorica.id, 'SIN_ACTA_GENERADA',
    () => derivarEntregablePago(actaHistorica.id, { usuarioDestinoId: pago.id }, analistaCtx),
    'T. Acta vinculada a recepción anterior no sirve',
  );
  await nuevaRecepcion(firmadaHistorica, true);
  await assertAtomic(
    firmadaHistorica.id, 'SIN_ACTA_FIRMADA_VIGENTE',
    () => derivarEntregablePago(firmadaHistorica.id, { usuarioDestinoId: pago.id }, analistaCtx),
    'U. firmada histórica no sirve para el Acta vigente',
  );
  await query(`
    INSERT INTO entregable_observaciones (
      orden_id, orden_entrega_id, recepcion_id, motivo, estado, observado_por
    ) VALUES ($1,$2,$3,'Abierta fixture','OBS_EMITIDA','test-e2')
  `, [ordenId, observacionAbierta.id, observacionAbierta.recepcion.id]);
  await assertAtomic(
    observacionAbierta.id, 'ENTREGABLE_OBSERVADO',
    () => derivarEntregablePago(observacionAbierta.id, { usuarioDestinoId: pago.id }, analistaCtx),
    'V. observación abierta bloquea Pago sin transición parcial',
  );

  const pagoResult = await derivarEntregablePago(
    pagoOk.id, { usuarioDestinoId: pago.id }, analistaCtx, analista.username,
  );
  ok(pagoResult.estado.etapaCodigo === ETAPAS.DERIVACION_PAGO
    && pagoResult.estado.responsableTipo === 'PERSONA'
    && Number(pagoResult.estado.responsableUsuarioId) === Number(pago.id),
  'W/X. derivación deja E1 en Pago con responsable PERSONA seleccionado');
  ok(pagoResult.evento.evento_codigo === EVENTOS.ENTREGABLE_DERIVADO_PAGO,
    'Y. registra ENTREGABLE_DERIVADO_PAGO');
  const workflowGlobalDespues = JSON.stringify((await query(
    'SELECT * FROM workflow_eventos WHERE expediente_id=$1 ORDER BY id',
    [requerimientoId],
  )).rows);
  ok(workflowGlobalDespues === workflowGlobalBefore,
    'Z. no registra EXPEDIENTE_DERIVADO_PAGO ni otro evento global');
  ok(await snapshotEntregable(hermano.id) === hermanoBefore,
    'AA. E2 queda intacto tras derivar E1 a Pago');
  ok(await snapshotGlobal(requerimientoId) === globalBefore,
    'AB/AC/AD. estado, requerimiento y asignaciones globales permanecen intactos');
  ok(await snapshotOs1105() === os1105Before, 'AE. OS 1105 real permanece intacta');
  ok(await snapshotBienes() === bienesBefore, 'AF. Recepción de Bienes permanece intacta');
} catch (error) {
  ok(false, `integración completada sin error inesperado (${error.message})`);
} finally {
  if (ordenId) {
    await query('DELETE FROM entregable_eventos WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_asignaciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_estado_vigente WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_observaciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_conformidad_acta_visados WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_conformidad_actas WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_recepciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM orden_entregas WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordenId]);
  }
  for (const user of usuariosOriginales) {
    await query(`
      UPDATE usuarios SET cargo=$2, permisos=$3, activo=$4, rol=$5 WHERE id=$1
    `, [user.id, user.cargo, user.permisos, user.activo, user.rol]);
  }
  await pool.end();
}

console.log(`\n=== Resultado RC8.15.6E-2: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);

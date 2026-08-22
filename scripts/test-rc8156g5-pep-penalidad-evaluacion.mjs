/**
 * RC8.15.6G-5 — Fase 3A: evaluación de penalidad Analista CM en Pagos (PEP).
 */
import pool, { query } from '../server/db.js';
import {
  derivarEntregableAnalistaCM,
  derivarEntregableCoordinadorCM,
  evaluarPenalidadEntregable,
  listarBandejaEntregablesServicios,
  listarBandejaPreparacionExpedientePago,
  listarTrazabilidadEntregable,
  obtenerEstadoResponsableEntregable,
  obtenerPenalidadEvaluacionEntregable,
  ESTADOS_PENALIDAD_EVALUACION,
} from '../server/lib/entregablesServicios.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { pagoMenuItems } from '../src/views/ejecucion/derivacionPagoView.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';
import { ETAPAS } from '../shared/workflow/etapas.js';
import {
  cleanupRc8156G5Fixture,
  discoverRc8156G5Fixture,
  hasRc8156G5Residuals,
} from './lib/rc8156g5-fixture-cleanup.mjs';

let passed = 0;
let failed = 0;
const cleanupErrors = [];

const fixture = {
  ordenIds: [],
  ordenEntregaIds: [],
  recepcionIds: [],
  actaIds: [],
  usuarioIds: [],
};

function ok(c, m) {
  if (c) { passed++; console.log(`  ✓ ${m}`); }
  else { failed++; console.error(`  ✗ ${m}`); }
}
function pdf(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF`).toString('base64');
}
function trackOrden(id) {
  const n = Number(id);
  if (Number.isFinite(n) && n > 0 && !fixture.ordenIds.includes(n)) fixture.ordenIds.push(n);
}
function trackEntrega(id) {
  const n = Number(id);
  if (Number.isFinite(n) && n > 0 && !fixture.ordenEntregaIds.includes(n)) fixture.ordenEntregaIds.push(n);
}
function trackRecepcion(id) {
  const n = Number(id);
  if (Number.isFinite(n) && n > 0 && !fixture.recepcionIds.includes(n)) fixture.recepcionIds.push(n);
}
function trackActa(id) {
  const n = Number(id);
  if (Number.isFinite(n) && n > 0 && !fixture.actaIds.includes(n)) fixture.actaIds.push(n);
}
function trackUsuario(id) {
  const n = Number(id);
  if (Number.isFinite(n) && n > 0 && !fixture.usuarioIds.includes(n)) fixture.usuarioIds.push(n);
}

async function verificarOs1105Intacta() {
  const row = (await query(`
    SELECT oe.id AS orden_entrega_id, ev.etapa_codigo, ev.responsable_usuario_id,
      u.username AS responsable_username, u.nombre AS responsable_nombre,
      u.rol, u.cargo, u.permisos
    FROM ordenes_contratacion oc
    JOIN orden_entregas oe ON oe.orden_id = oc.id AND oe.numero_entrega = 1 AND oe.estado = 'ACTIVO'
    LEFT JOIN entregable_estado_vigente ev ON ev.orden_entrega_id = oe.id
    LEFT JOIN usuarios u ON u.id = ev.responsable_usuario_id
    WHERE oc.tipo_orden = 'OS' AND oc.numero_orden = '1105'
    ORDER BY oc.id LIMIT 1
  `)).rows[0];
  if (!row?.orden_entrega_id) return { ok: false, motivo: 'OS 1105/E1 no encontrada' };

  const etapa = String(row.etapa_codigo || '').toUpperCase();
  if (etapa !== ETAPAS.PREPARACION_EXPEDIENTE_PAGO) {
    return { ok: false, motivo: `OS 1105/E1 etapa inesperada: ${etapa}` };
  }

  const analistaCtx = {
    id: Number(row.responsable_usuario_id),
    username: row.responsable_username,
    nombre: row.responsable_nombre,
    cargo: row.cargo,
    rol: row.rol,
    permisos: row.permisos,
  };
  if (!analistaCtx.id) {
    return { ok: false, motivo: 'OS 1105/E1 en PEP sin responsable PERSONA' };
  }

  const filaPagos = (await listarBandejaPreparacionExpedientePago(analistaCtx))
    .find((item) => Number(item.orden_entrega_id) === Number(row.orden_entrega_id));
  const filaPe = (await listarBandejaEntregablesServicios(analistaCtx))
    .find((item) => Number(item.orden_entrega_id) === Number(row.orden_entrega_id));
  const checks = {
    etapa_pep: etapa === ETAPAS.PREPARACION_EXPEDIENTE_PAGO,
    en_pagos: Boolean(filaPagos),
    en_presentacion: Boolean(filaPe),
    presentacion_solo_consulta: Boolean(filaPe)
      && !entregableMenuItems(filaPe).some((item) => ['derivarPago', 'observarEntregable'].includes(item.act)),
    analista_operativo: Boolean(filaPagos?.puede_ver_expediente_pago),
  };
  return { ok: Object.values(checks).every(Boolean), checks, fila: filaPagos };
}

console.log('\n=== RC8.15.6G-5 — Evaluación penalidad Pagos (PEP) ===\n');

try {
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;

  async function crearUsuario(sufijo, perfil, centro = null) {
    const row = (await query(`
      INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos, centro, codigo_centro_costo)
      VALUES ($1,$2,$3,'usuario',$4,TRUE,$5::jsonb,$6,$6) RETURNING *
    `, [
      `G5${sufijo}${nonce}`.slice(0, 20),
      `g5_${nonce}_${sufijo}`,
      `Fixture G5 ${sufijo}`,
      perfil === 'COORDINADOR_CM' ? 'Coordinador CM' : 'Analista CM',
      JSON.stringify({ perfil }),
      centro,
    ])).rows[0];
    trackUsuario(row.id);
    return row;
  }

  const base = (await query(`
    SELECT oc.requerimiento_id, oc.proveedor_id FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL ORDER BY oc.id LIMIT 1
  `)).rows[0];
  const centroReq = (await query(
    'SELECT cmn, area, payload FROM requerimientos WHERE id=$1',
    [base.requerimiento_id],
  )).rows[0];
  const { resolverCentroDesdeRequerimiento } = await import('../server/lib/recepcionBienesAlcance.js');
  const centro = resolverCentroDesdeRequerimiento(centroReq);

  const au = (await query(`
    INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos, centro, codigo_centro_costo)
    VALUES ($1,$2,$3,'usuario','Área Usuaria',TRUE,$4::jsonb,$5,$5) RETURNING *
  `, [
    `G5AU${nonce}`.slice(0, 20),
    `g5_au_${nonce}`,
    'Fixture G5 AU',
    JSON.stringify({ perfil: 'AREA_USUARIA' }),
    centro.centro_codigo,
  ])).rows[0];
  trackUsuario(au.id);

  const coordinador = await crearUsuario('coord', 'COORDINADOR_CM', centro.centro_codigo);
  const analista = await crearUsuario('anal', 'ANALISTA_CM', centro.centro_codigo);
  const otroAnalista = await crearUsuario('otro', 'ANALISTA_CM', centro.centro_codigo);

  const ctx = (user, perfil) => ({
    id: Number(user.id),
    username: user.username,
    nombre: user.nombre,
    cargo: user.cargo,
    rol: user.rol,
    permisos: { perfil },
  });
  const ctxAdmin = { id: 1, username: 'admin', rol: 'admin', permisos: {} };

  const ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,800,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156G5${nonce}`])).rows[0].id);
  trackOrden(ordenId);

  async function crearEntrega(numero) {
    const eid = Number((await query(`
      INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
      VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
    `, [ordenId, numero, `G5 E${numero}`])).rows[0].id);
    trackEntrega(eid);
    await inicializarEstadoResponsableEntregable(eid, { actualizadoPor: 'test-g5' });
    await query(`
      UPDATE entregable_estado_vigente SET responsable_tipo='PERSONA', responsable_usuario_id=$2
      WHERE orden_entrega_id=$1
    `, [eid, au.id]);
    await query(`
      UPDATE entregable_asignaciones SET usuario_id=$2, unidad_codigo='AREA_USUARIA', tipo_responsable='PERSONA'
      WHERE orden_entrega_id=$1 AND activo=TRUE
    `, [eid, au.id]);
    const recepcion = (await query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO','test-g5') RETURNING *
    `, [eid, ordenId, `SGD-G5-${numero}-${nonce}`])).rows[0];
    trackRecepcion(recepcion.id);
    const acta = (await query(`
      INSERT INTO entregable_conformidad_actas (
        orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
        estado_documental, generado_at, generado_por
      ) VALUES ($1,$2,$3,$4,1,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-g5') RETURNING *
    `, [ordenId, eid, recepcion.id, `ACTA-G5-${numero}`])).rows[0];
    trackActa(acta.id);
    await query(`
      INSERT INTO entregable_conformidad_acta_visados (
        orden_id, orden_entrega_id, acta_id, version, nombre, mime_type,
        contenido_base64, estado_documental, vigente, created_by
      ) VALUES ($1,$2,$3,1,$4,'application/pdf',$5,'ACTA_CONFORMIDAD_FIRMADA',TRUE,'test-g5')
    `, [ordenId, eid, acta.id, `firmada-${numero}.pdf`, pdf(`g5-${numero}`)]);
    return { id: eid };
  }

  async function prepararPep(entrega) {
    await derivarEntregableCoordinadorCM(
      entrega.id, { responsable_id: coordinador.id }, ctx(au, 'AREA_USUARIA'), au.username,
    );
    await derivarEntregableAnalistaCM(
      entrega.id, { responsable_id: analista.id }, ctx(coordinador, 'COORDINADOR_CM'), coordinador.username,
    );
  }

  const entrega = await crearEntrega(1);
  await prepararPep(entrega);

  const estadoPep = await obtenerEstadoResponsableEntregable(entrega.id);
  ok(estadoPep.etapaCodigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO,
    'fixture en PREPARACION_EXPEDIENTE_PAGO');

  const bandejaInicial = await listarBandejaPreparacionExpedientePago(ctx(analista, 'ANALISTA_CM'));
  const filaInicial = bandejaInicial.find((r) => Number(r.orden_entrega_id) === entrega.id);
  ok(filaInicial?.penalidad_label === 'Pendiente'
    && filaInicial?.estado_penalidad === ESTADOS_PENALIDAD_EVALUACION.PENDIENTE,
  'bandeja muestra Penalidad Pendiente sin evaluación');
  ok(Boolean(filaInicial?.puede_evaluar_penalidad_pago),
    'Analista responsable puede evaluar penalidad');
  ok(pagoMenuItems(filaInicial).some((item) => item.act === 'evaluarPenalidad'),
    'pagoMenuItems incluye Evaluar penalidad');

  let rechazoAjeno = null;
  try {
    await evaluarPenalidadEntregable(
      entrega.id,
      { corresponde_penalidad: false, observacion: 'Intento ajeno' },
      ctx(otroAnalista, 'ANALISTA_CM'),
      otroAnalista.username,
    );
  } catch (error) {
    rechazoAjeno = error;
  }
  ok(rechazoAjeno?.code === 'ANALISTA_CM_NO_AUTORIZADO',
    'usuario ajeno denegado');

  const evalNo = await evaluarPenalidadEntregable(
    entrega.id,
    { corresponde_penalidad: false, observacion: 'Sin retraso imputable' },
    ctx(analista, 'ANALISTA_CM'),
    analista.username,
  );
  ok(evalNo.evaluacion.estado_penalidad === ESTADOS_PENALIDAD_EVALUACION.NO_CORRESPONDE
    && evalNo.evaluacion.corresponde_penalidad === false
    && evalNo.es_modificacion === false,
  'responsable evalúa No → NO_CORRESPONDE');

  const rowDb = (await query(
    'SELECT * FROM entregable_penalidad_evaluacion WHERE orden_entrega_id=$1',
    [entrega.id],
  )).rows[0];
  ok(rowDb
    && Number(rowDb.usuario_evaluador_id) === Number(analista.id)
    && rowDb.observacion === 'Sin retraso imputable',
  'persistencia por entregable completa');

  const bandejaNo = await listarBandejaPreparacionExpedientePago(ctx(analista, 'ANALISTA_CM'));
  const filaNo = bandejaNo.find((r) => Number(r.orden_entrega_id) === entrega.id);
  ok(filaNo?.penalidad_label === 'No corresponde', 'bandeja refleja No corresponde');

  const evalMod = await evaluarPenalidadEntregable(
    entrega.id,
    { corresponde_penalidad: true, observacion: 'Retraso imputable verificado' },
    ctx(analista, 'ANALISTA_CM'),
    analista.username,
  );
  ok(evalMod.evaluacion.estado_penalidad === ESTADOS_PENALIDAD_EVALUACION.CORRESPONDE
    && evalMod.es_modificacion === true,
  'modificación permitida → CORRESPONDE');

  const bandejaSi = await listarBandejaPreparacionExpedientePago(ctx(analista, 'ANALISTA_CM'));
  const filaSi = bandejaSi.find((r) => Number(r.orden_entrega_id) === entrega.id);
  ok(filaSi?.penalidad_label === 'Corresponde', 'bandeja refleja Corresponde');

  const consulta = await obtenerPenalidadEvaluacionEntregable(entrega.id, ctx(analista, 'ANALISTA_CM'));
  ok(consulta.corresponde_penalidad === true
    && consulta.estado_penalidad === ESTADOS_PENALIDAD_EVALUACION.CORRESPONDE,
  'consulta devuelve evaluación vigente');

  const eventos = await listarTrazabilidadEntregable(entrega.id, ctx(analista, 'ANALISTA_CM'));
  const codigos = eventos.map((ev) => ev.evento_codigo);
  ok(codigos.includes('ENTREGABLE_PENALIDAD_EVALUADA')
    && codigos.includes('ENTREGABLE_PENALIDAD_MODIFICADA'),
  'trazabilidad: evaluación inicial y modificación');

  const evalAdmin = await evaluarPenalidadEntregable(
    entrega.id,
    { corresponde_penalidad: false, observacion: 'Override admin' },
    ctxAdmin,
    'admin',
  );
  ok(evalAdmin.es_modificacion === true && evalAdmin.evaluacion.corresponde_penalidad === false,
    'admin conserva override de modificación');
} catch (error) {
  failed++;
  console.error('  ✗ Error fatal:', error.message);
  if (error.stack) console.error(error.stack);
} finally {
  try {
    const cleanup = await cleanupRc8156G5Fixture({
      apply: true,
      tracked: fixture,
      getClient: () => pool.connect(),
    });
    if (cleanup.deleted && Object.values(cleanup.deleted).some((n) => n > 0)) {
      console.log('\nCleanup fixture G-5:');
      for (const [key, count] of Object.entries(cleanup.deleted)) {
        if (count > 0) console.log(`  ${key}: ${count}`);
      }
    }
  } catch (error) {
    cleanupErrors.push(error);
    console.error('  ✗ Cleanup fixture G-5 falló:', error.message);
  }

  try {
    const residual = await discoverRc8156G5Fixture();
    ok(!hasRc8156G5Residuals(residual), 'sin residuos RC8156G5 tras cleanup');
    if (hasRc8156G5Residuals(residual)) {
      cleanupErrors.push(new Error(`Residuos RC8156G5: ${JSON.stringify(residual.totals)}`));
    }
  } catch (error) {
    cleanupErrors.push(error);
    console.error('  ✗ Scan post-cleanup falló:', error.message);
  }

  try {
    const os1105 = await verificarOs1105Intacta();
    ok(os1105.ok, 'OS 1105/E1 intacta en PREPARACION_EXPEDIENTE_PAGO');
    if (!os1105.ok && os1105.checks) {
      console.error('  checks OS1105:', os1105.checks);
    }
  } catch (error) {
    cleanupErrors.push(error);
    console.error('  ✗ Verificación OS 1105 falló:', error.message);
  }

  await pool.end();
  console.log(`\nResultado: ${passed} OK, ${failed} FAIL`);
  if (cleanupErrors.length) {
    console.error(`Cleanup/verificación: ${cleanupErrors.length} error(es)`);
  }
  console.log('');
  process.exit(failed || cleanupErrors.length ? 1 : 0);
}

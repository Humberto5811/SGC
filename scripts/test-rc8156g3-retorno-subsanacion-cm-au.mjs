/**
 * RC8.15.6G-3 — Retorno subsanación CM → AU → CM y recuperación de Derivar a Analista CM.
 */
import pool, { query } from '../server/db.js';
import {
  derivarEntregableAnalistaCM,
  derivarEntregableCoordinadorCM,
  listarBandejaEntregablesServicios,
  listarBandejaPreparacionExpedientePago,
  observarEntregable,
  obtenerRecepcionVigenteEntregable,
  subsanarEntregable,
} from '../server/lib/entregablesServicios.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { ETAPAS } from '../shared/workflow/etapas.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';
import {
  cleanupRc8156G3Fixture,
  discoverRc8156G3Fixture,
  hasRc8156G3Residuals,
} from './lib/rc8156g3-fixture-cleanup.mjs';

let passed = 0;
let failed = 0;
const cleanupErrors = [];

const fixture = {
  ordenIds: [],
  ordenEntregaIds: [],
  recepcionIds: [],
  observacionIds: [],
  workflowIds: [],
  actaIds: [],
  usuarioIds: [],
};

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
function trackObservacion(row) {
  if (!row) return;
  const n = Number(row.id);
  if (Number.isFinite(n) && n > 0 && !fixture.observacionIds.includes(n)) fixture.observacionIds.push(n);
  const wo = Number(row.workflow_observacion_id);
  if (Number.isFinite(wo) && wo > 0 && !fixture.workflowIds.includes(wo)) fixture.workflowIds.push(wo);
}
function trackActa(id) {
  const n = Number(id);
  if (Number.isFinite(n) && n > 0 && !fixture.actaIds.includes(n)) fixture.actaIds.push(n);
}
function trackUsuario(id) {
  const n = Number(id);
  if (Number.isFinite(n) && n > 0 && !fixture.usuarioIds.includes(n)) fixture.usuarioIds.push(n);
}

function ok(c, m) {
  if (c) { passed++; console.log(`  ✓ ${m}`); }
  else { failed++; console.error(`  ✗ ${m}`); }
}
function pdf(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF`).toString('base64');
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

  if (etapa === ETAPAS.PREPARACION_EXPEDIENTE_PAGO) {
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
      conforme: ['CONFORME', 'SUBSANADO'].includes(filaPagos?.situacion_codigo),
      firmada: filaPagos?.firmada_vigente === true,
      sin_obs_abierta: filaPagos?.observacion_abierta == null,
      en_pagos: Boolean(filaPagos),
      en_presentacion: Boolean(filaPe),
      presentacion_solo_consulta: Boolean(filaPe)
        && !entregableMenuItems(filaPe).some((item) => ['derivarPago', 'observarEntregable'].includes(item.act)),
      analista_operativo: Boolean(filaPagos?.puede_ver_expediente_pago),
    };
    return {
      ok: Object.values(checks).every(Boolean),
      checks,
      fila: filaPagos,
      flujo: 'FASE1_PEP',
    };
  }

  const coord = (await query(`
    SELECT id, username, nombre, rol, cargo, permisos
    FROM usuarios WHERE LOWER(username) = 'wrodriguez' AND activo = TRUE LIMIT 1
  `)).rows[0];
  if (!coord) return { ok: false, motivo: 'wrodriguez no encontrado' };

  const fila = (await listarBandejaEntregablesServicios({
    id: Number(coord.id),
    username: coord.username,
    nombre: coord.nombre,
    cargo: coord.cargo,
    rol: coord.rol,
    permisos: coord.permisos,
  })).find((item) => Number(item.orden_entrega_id) === Number(row.orden_entrega_id));

  const checks = {
    etapa: fila?.estado_etapa_codigo === ETAPAS.REVISION_COORDINADOR_CM,
    conforme: fila?.situacion_codigo === 'CONFORME',
    firmada: fila?.firmada_vigente === true,
    derivar: fila?.puede_derivar_analista_cm === true,
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    fila,
    flujo: 'LEGACY_RCM',
  };
}

console.log('\n=== RC8.15.6G-3 — Retorno subsanación CM/AU y Derivar Analista ===\n');

try {
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;

  async function crearUsuario(sufijo, perfil, centro = null) {
    const row = (await query(`
      INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos, centro, codigo_centro_costo)
      VALUES ($1,$2,$3,'usuario',$4,TRUE,$5::jsonb,$6,$6) RETURNING *
    `, [
      `G3${sufijo}${nonce}`.slice(0, 20),
      `g3_${nonce}_${sufijo}`,
      `Fixture G3 ${sufijo}`,
      perfil === 'AREA_USUARIA' ? 'Área Usuaria' : (perfil === 'COORDINADOR_CM' ? 'Coordinador CM' : 'Analista CM'),
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

  const au = await crearUsuario('au', 'AREA_USUARIA', centro.centro_codigo);
  const auOtro = await crearUsuario('auo', 'AREA_USUARIA', centro.centro_codigo);
  const coordinador = await crearUsuario('coord', 'COORDINADOR_CM', centro.centro_codigo);
  const coordinadorOtro = await crearUsuario('c2', 'COORDINADOR_CM', centro.centro_codigo);
  const analista = await crearUsuario('anal', 'ANALISTA_CM', centro.centro_codigo);

  const ctx = (user, perfil) => ({
    id: Number(user.id),
    username: user.username,
    nombre: user.nombre,
    cargo: user.cargo,
    rol: user.rol,
    permisos: { perfil },
  });

  const ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,700,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156G3${nonce}`])).rows[0].id);
  trackOrden(ordenId);

  async function crearEntrega(numero) {
    const eid = Number((await query(`
      INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
      VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
    `, [ordenId, numero, `G3 E${numero}`])).rows[0].id);
    trackEntrega(eid);
    await inicializarEstadoResponsableEntregable(eid, { actualizadoPor: 'test-g3' });
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
      ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO','test-g3') RETURNING *
    `, [eid, ordenId, `SGD-G3-${numero}-${nonce}`])).rows[0];
    trackRecepcion(recepcion.id);
    const acta = (await query(`
      INSERT INTO entregable_conformidad_actas (
        orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
        estado_documental, generado_at, generado_por
      ) VALUES ($1,$2,$3,$4,1,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-g3') RETURNING *
    `, [ordenId, eid, recepcion.id, `ACTA-G3-${numero}`])).rows[0];
    trackActa(acta.id);
    await query(`
      INSERT INTO entregable_conformidad_acta_visados (
        orden_id, orden_entrega_id, acta_id, version, nombre, mime_type,
        contenido_base64, estado_documental, vigente, created_by
      ) VALUES ($1,$2,$3,1,$4,'application/pdf',$5,'ACTA_CONFORMIDAD_FIRMADA',TRUE,'test-g3')
    `, [ordenId, eid, acta.id, `firmada-${numero}.pdf`, pdf(`g3-${numero}`)]);
    return { id: eid, recepcion };
  }

  async function cicloObservacionSubsanacion(entrega, destinoAu, motivo) {
    await derivarEntregableCoordinadorCM(
      entrega.id, { responsable_id: coordinador.id }, ctx(au, 'AREA_USUARIA'), au.username,
    );
    const recepcionVigente = await obtenerRecepcionVigenteEntregable(entrega.id);
    trackRecepcion(recepcionVigente?.id);
    const obs = await observarEntregable(
      entrega.id,
      {
        recepcion_id: recepcionVigente.id,
        motivo,
        usuario_destino_id: destinoAu.id,
      },
      ctx(coordinador, 'COORDINADOR_CM'),
      coordinador.username,
    );
    trackObservacion(obs);
    const sub = await subsanarEntregable(
      entrega.id,
      {
        fecha_recepcion_mesa_partes: '2026-08-20',
        numero_expediente_sgd: `SGD-G3-SUB-${motivo.slice(0, 12)}-${nonce}`,
        observacion_id: obs.id,
        documentos: [{
          nombre_archivo: 'sub-g3.pdf',
          mime_type: 'application/pdf',
          contenido_base64: pdf(`sub-${motivo}`),
        }],
      },
      ctx(destinoAu, 'AREA_USUARIA'),
      destinoAu.username,
    );
    trackRecepcion(sub?.recepcion?.id);
    trackObservacion(sub?.observacion);
    return obs;
  }

  const e1 = await crearEntrega(1);
  await cicloObservacionSubsanacion(e1, au, 'Caso 1');

  const filaCoord = (await listarBandejaEntregablesServicios(ctx(coordinador, 'COORDINADOR_CM')))
    .find((row) => Number(row.orden_entrega_id) === Number(e1.id));
  const menuCoord = entregableMenuItems(filaCoord).map((item) => item.act);
  ok(filaCoord?.situacion_codigo === 'CONFORME'
    && filaCoord?.observacion_abierta == null
    && filaCoord?.firmada_vigente === true
    && filaCoord?.puede_observar_coordinador_cm === true
    && filaCoord?.puede_derivar_analista_cm === true
    && menuCoord.includes('derivarAnalistaCM'),
  'CASO 1. Coordinador emisor recupera CONFORME y Derivar a Analista CM');

  const derivacion = await derivarEntregableAnalistaCM(
    e1.id, { responsable_id: analista.id }, ctx(coordinador, 'COORDINADOR_CM'), coordinador.username,
  );
  ok(derivacion?.estado?.etapaCodigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO,
    'CASO 1b. derivación a Analista CM ejecuta con acta firmada preservada');

  const e2 = await crearEntrega(2);
  await cicloObservacionSubsanacion(e2, au, 'Caso 2');

  const filaAu = (await listarBandejaEntregablesServicios(ctx(au, 'AREA_USUARIA')))
    .find((row) => Number(row.orden_entrega_id) === Number(e2.id));
  ok(filaAu?.puede_subsanar === false
    && filaAu?.puede_derivar_analista_cm === false,
  'CASO 2. AU ya no responsable: no subsanar ni derivar');

  const filaOtroCoord = (await listarBandejaEntregablesServicios(ctx(coordinadorOtro, 'COORDINADOR_CM')))
    .find((row) => Number(row.orden_entrega_id) === Number(e2.id));
  ok(filaOtroCoord?.puede_derivar_analista_cm === false,
    'CASO 3. Coordinador distinto del emisor no puede derivar');

  const e3 = await crearEntrega(3);
  const obs4a = await cicloObservacionSubsanacion(e3, au, 'Ciclo 4a');
  const filaPost1 = (await listarBandejaEntregablesServicios(ctx(coordinador, 'COORDINADOR_CM')))
    .find((row) => Number(row.orden_entrega_id) === Number(e3.id));
  ok(filaPost1?.puede_derivar_analista_cm === true,
    'CASO 4a. primer ciclo subsanado habilita Derivar al emisor');

  const recepcionVigente2 = await obtenerRecepcionVigenteEntregable(e3.id);
  trackRecepcion(recepcionVigente2?.id);
  const obs4b = await observarEntregable(
    e3.id,
    {
      recepcion_id: recepcionVigente2.id,
      motivo: 'Segunda observación G3',
      usuario_destino_id: auOtro.id,
    },
    ctx(coordinador, 'COORDINADOR_CM'),
    coordinador.username,
  );
  trackObservacion(obs4b);
  ok(Number((await query(
    'SELECT responsable_usuario_id FROM entregable_estado_vigente WHERE orden_entrega_id=$1',
    [e3.id],
  )).rows[0]?.responsable_usuario_id) === Number(auOtro.id),
  'CASO 4b. nueva observación inicia otro ciclo dirigido hacia AU elegido');

  const sub4b = await subsanarEntregable(
    e3.id,
    {
      fecha_recepcion_mesa_partes: '2026-08-21',
      numero_expediente_sgd: `SGD-G3-SUB2-${nonce}`,
      observacion_id: obs4b.id,
      documentos: [{
        nombre_archivo: 'sub-g3-2.pdf',
        mime_type: 'application/pdf',
        contenido_base64: pdf('sub-g3-2'),
      }],
    },
    ctx(auOtro, 'AREA_USUARIA'),
    auOtro.username,
  );
  trackRecepcion(sub4b?.recepcion?.id);
  trackObservacion(sub4b?.observacion);

  const filaPost2 = (await listarBandejaEntregablesServicios(ctx(coordinador, 'COORDINADOR_CM')))
    .find((row) => Number(row.orden_entrega_id) === Number(e3.id));
  ok(filaPost2?.puede_derivar_analista_cm === true
    && filaPost2?.puede_observar_coordinador_cm === true,
  'CASO 4c. segundo ciclo subsanado restaura Derivar y Observar al emisor');

  const woEstados = (await query(`
    SELECT wo.estado FROM workflow_observaciones wo
    WHERE wo.id = ANY($1::int[])
  `, [fixture.workflowIds])).rows.map((row) => row.estado);
  ok(fixture.workflowIds.length > 0
    && woEstados.every((estado) => estado === 'OBS_SUBSANADA'),
  'workflow_observaciones queda OBS_SUBSANADA tras cada subsanación');
} catch (error) {
  failed++;
  console.error('  ✗ Error fatal:', error);
} finally {
  try {
    const cleanup = await cleanupRc8156G3Fixture({
      apply: true,
      tracked: fixture,
      getClient: () => pool.connect(),
    });
    if (cleanup.deleted && Object.values(cleanup.deleted).some((n) => n > 0)) {
      console.log('\nCleanup fixture G-3:');
      for (const [key, count] of Object.entries(cleanup.deleted)) {
        if (count > 0) console.log(`  ${key}: ${count}`);
      }
    }
  } catch (error) {
    cleanupErrors.push(error);
    console.error('  ✗ Cleanup fixture G-3 falló:', error.message);
  }

  try {
    const residual = await discoverRc8156G3Fixture();
    ok(!hasRc8156G3Residuals(residual),
      'sin residuos RC8156G3 tras cleanup');
    if (hasRc8156G3Residuals(residual)) {
      cleanupErrors.push(new Error(`Residuos RC8156G3: ${JSON.stringify(residual.totals)}`));
    }
  } catch (error) {
    cleanupErrors.push(error);
    console.error('  ✗ Scan post-cleanup falló:', error.message);
  }

  try {
    const os1105 = await verificarOs1105Intacta();
    const msgOs1105 = os1105.flujo === 'FASE1_PEP'
      ? 'OS 1105/E1 intacta en PREPARACION_EXPEDIENTE_PAGO (flujo Fase 1/2)'
      : 'OS 1105/E1 intacta y puede_derivar_analista_cm para wrodriguez (legacy RCM)';
    ok(os1105.ok, msgOs1105);
    if (!os1105.ok && os1105.checks) {
      console.error(`  checks OS1105 (${os1105.flujo || '—'}):`, os1105.checks);
    }
  } catch (error) {
    cleanupErrors.push(error);
    console.error('  ✗ Verificación OS 1105 falló:', error.message);
  }

  await pool.end();
  console.log(`\nResultado: ${passed} ok, ${failed} fallos`);
  if (cleanupErrors.length) {
    console.error(`Cleanup/verificación: ${cleanupErrors.length} error(es)`);
  }
  console.log('');
  process.exit(failed || cleanupErrors.length ? 1 : 0);
}

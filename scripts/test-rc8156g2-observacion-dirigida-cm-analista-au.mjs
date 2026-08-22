/**
 * RC8.15.6G-2 — Observaciones dirigidas CM/Analista → AU con retorno al emisor.
 */
import pool, { query } from '../server/db.js';
import {
  derivarEntregableAnalistaCM,
  derivarEntregableCoordinadorCM,
  listarDestinatariosAreaUsuariaEntregable,
  observarEntregable,
  observarEntregableAnalistaCM,
  obtenerEstadoResponsableEntregable,
  subsanarEntregable,
} from '../server/lib/entregablesServicios.js';
import { validarDestinatarioAreaUsuariaOrden } from '../server/lib/ordenesContratacion.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { ETAPAS } from '../shared/workflow/etapas.js';
import {
  cleanupRc8156G2Fixture,
  discoverRc8156G2Fixture,
  hasRc8156G2Residuals,
} from './lib/rc8156g2-fixture-cleanup.mjs';

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
function trackWorkflow(id) {
  const n = Number(id);
  if (Number.isFinite(n) && n > 0 && !fixture.workflowIds.includes(n)) fixture.workflowIds.push(n);
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

async function verificarDestinatariosOs1105SinFixture() {
  const row = (await query(`
    SELECT oe.id AS orden_entrega_id, ev.etapa_codigo, u.id AS responsable_id,
      u.username, u.nombre, u.rol, u.cargo, u.permisos
    FROM ordenes_contratacion oc
    JOIN orden_entregas oe ON oe.orden_id = oc.id AND oe.numero_entrega = 1 AND oe.estado = 'ACTIVO'
    LEFT JOIN entregable_estado_vigente ev ON ev.orden_entrega_id = oe.id
    LEFT JOIN usuarios u ON u.id = ev.responsable_usuario_id
    WHERE oc.tipo_orden = 'OS' AND oc.numero_orden = '1105'
    ORDER BY oc.id LIMIT 1
  `)).rows[0];
  if (!row?.responsable_id) return { ok: false, motivo: 'OS 1105/E1 o responsable no encontrado' };

  const dest = await listarDestinatariosAreaUsuariaEntregable(
    row.orden_entrega_id,
    {},
    {
      id: Number(row.responsable_id),
      username: row.username,
      nombre: row.nombre,
      cargo: row.cargo,
      rol: row.rol,
      permisos: row.permisos,
    },
  );
  const list = dest.usuarios || [];
  const fixtures = list.filter((u) => /^Fixture G2 /i.test(u.nombre || '') || /^g2_/i.test(u.username || ''));
  const ids = list.map((u) => Number(u.id));
  const duplicados = ids.filter((id, idx) => ids.indexOf(id) !== idx);
  return {
    ok: fixtures.length === 0 && duplicados.length === 0 && list.length > 0,
    total: list.length,
    fixtures,
    duplicados,
    usuarios: list,
  };
}

console.log('\n=== RC8.15.6G-2 — Observación dirigida CM/Analista → AU ===\n');

try {
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;

  async function crearUsuario(sufijo, perfil, centro = null) {
    const row = (await query(`
      INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos, centro, codigo_centro_costo)
      VALUES ($1,$2,$3,'usuario',$4,TRUE,$5::jsonb,$6,$6) RETURNING *
    `, [
      `G2${sufijo}${nonce}`.slice(0, 20),
      `g2_${nonce}_${sufijo}`,
      `Fixture G2 ${sufijo}`,
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

  const au1 = await crearUsuario('au1', 'AREA_USUARIA', centro.centro_codigo);
  const au2 = await crearUsuario('au2', 'AREA_USUARIA', centro.centro_codigo);
  const auOtroCentro = await crearUsuario('aux', 'AREA_USUARIA', 'OTRO-CENTRO-G2');
  const auInactivo = await crearUsuario('aui', 'AREA_USUARIA', centro.centro_codigo);
  await query('UPDATE usuarios SET activo=FALSE WHERE id=$1', [auInactivo.id]);
  const coordinador = await crearUsuario('coord', 'COORDINADOR_CM', centro.centro_codigo);
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
  `, [base.requerimiento_id, base.proveedor_id, `RC8156G2${nonce}`])).rows[0].id);
  trackOrden(ordenId);

  async function crearEntrega(numero) {
    const eid = Number((await query(`
      INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
      VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
    `, [ordenId, numero, `G2 E${numero}`])).rows[0].id);
    trackEntrega(eid);
    await inicializarEstadoResponsableEntregable(eid, { actualizadoPor: 'test-g2' });
    await query(`
      UPDATE entregable_estado_vigente SET responsable_tipo='PERSONA', responsable_usuario_id=$2
      WHERE orden_entrega_id=$1
    `, [eid, au1.id]);
    await query(`
      UPDATE entregable_asignaciones SET usuario_id=$2, unidad_codigo='AREA_USUARIA', tipo_responsable='PERSONA'
      WHERE orden_entrega_id=$1 AND activo=TRUE
    `, [eid, au1.id]);
    const recepcion = (await query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO','test-g2') RETURNING *
    `, [eid, ordenId, `SGD-G2-${numero}-${nonce}`])).rows[0];
    trackRecepcion(recepcion.id);
    const acta = (await query(`
      INSERT INTO entregable_conformidad_actas (
        orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
        estado_documental, generado_at, generado_por
      ) VALUES ($1,$2,$3,$4,1,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-g2') RETURNING *
    `, [ordenId, eid, recepcion.id, `ACTA-G2-${numero}`])).rows[0];
    trackActa(acta.id);
    await query(`
      INSERT INTO entregable_conformidad_acta_visados (
        orden_id, orden_entrega_id, acta_id, version, nombre, mime_type,
        contenido_base64, estado_documental, vigente, created_by
      ) VALUES ($1,$2,$3,1,$4,'application/pdf',$5,'ACTA_CONFORMIDAD_FIRMADA',TRUE,'test-g2')
    `, [ordenId, eid, acta.id, `firmada-${numero}.pdf`, pdf(`g2-${numero}`)]);
    return { id: eid, recepcion };
  }

  async function prepararCoordinador(entrega) {
    await derivarEntregableCoordinadorCM(
      entrega.id, { responsable_id: coordinador.id }, ctx(au1, 'AREA_USUARIA'), au1.username,
    );
  }

  async function prepararAnalista(entrega) {
    await prepararCoordinador(entrega);
    await derivarEntregableAnalistaCM(
      entrega.id, { responsable_id: analista.id }, ctx(coordinador, 'COORDINADOR_CM'), coordinador.username,
    );
  }

  const eCoord = await crearEntrega(1);
  const eAnal = await crearEntrega(2);
  await prepararCoordinador(eCoord);
  await prepararAnalista(eAnal);

  const candidatosCoord = await listarDestinatariosAreaUsuariaEntregable(
    eCoord.id, {}, ctx(coordinador, 'COORDINADOR_CM'),
  );
  const idsCandidatos = (candidatosCoord.usuarios || []).map((u) => Number(u.id));
  ok(idsCandidatos.includes(Number(au2.id))
    && !idsCandidatos.includes(Number(auInactivo.id))
    && !idsCandidatos.includes(Number(auOtroCentro.id)),
  'C. listado AU incluye activos del centro y excluye inactivo/otro centro');

  let rechazoCentro = null;
  try {
    await validarDestinatarioAreaUsuariaOrden(ordenId, auOtroCentro.id);
  } catch (error) {
    rechazoCentro = error;
  }
  ok(rechazoCentro?.code === 'RESPONSABLE_CENTRO_INVALIDO',
    'C2. usuario de otro centro se rechaza al observar');

  const obsCoord = await observarEntregable(
    eCoord.id,
    {
      recepcion_id: eCoord.recepcion.id,
      motivo: 'Observación Coordinador hacia AU2',
      usuario_destino_id: au2.id,
    },
    ctx(coordinador, 'COORDINADOR_CM'),
    coordinador.username,
  );
  trackObservacion(obsCoord);
  ok(Number((await query(
    'SELECT responsable_usuario_id FROM entregable_estado_vigente WHERE orden_entrega_id=$1',
    [eCoord.id],
  )).rows[0]?.responsable_usuario_id) === Number(au2.id),
  'A1. Coordinador observa y transfiere responsabilidad a AU2');

  const subsCoord = await subsanarEntregable(
    eCoord.id,
    {
      fecha_recepcion_mesa_partes: '2026-08-20',
      numero_expediente_sgd: `SGD-SUB-C-${nonce}`,
      observacion_id: obsCoord.id,
      documentos: [{
        nombre_archivo: 'sub-coord.pdf',
        mime_type: 'application/pdf',
        contenido_base64: pdf('sub-coord'),
      }],
    },
    ctx(au2, 'AREA_USUARIA'),
    au2.username,
  );
  trackRecepcion(subsCoord?.recepcion?.id);
  trackObservacion(subsCoord?.observacion);
  const estadoPostCoord = await obtenerEstadoResponsableEntregable(eCoord.id);
  ok(estadoPostCoord.etapaCodigo === ETAPAS.REVISION_COORDINADOR_CM
    && Number(estadoPostCoord.responsableUsuarioId) === Number(coordinador.id),
  'A2. tras subsanar vuelve al Coordinador emisor en REVISION_COORDINADOR_CM');

  const woCoord = (await query(`
    SELECT wo.* FROM workflow_observaciones wo
    JOIN entregable_observaciones eo ON eo.workflow_observacion_id=wo.id
    WHERE eo.id=$1
  `, [obsCoord.id])).rows[0];
  trackWorkflow(woCoord?.id);
  const routingDocCoord = typeof woCoord?.documentos === 'string'
    ? JSON.parse(woCoord.documentos)
    : woCoord?.documentos;
  ok(woCoord
    && woCoord.motivo.includes('Observación Coordinador')
    && woCoord.origen_submodulo_codigo === ETAPAS.REVISION_COORDINADOR_CM
    && routingDocCoord?.etapa_retorno === ETAPAS.REVISION_COORDINADOR_CM,
  'D1. trazabilidad Coordinador registra emisor, glosa, origen y retorno');

  const obsAnal = await observarEntregableAnalistaCM(
    eAnal.id,
    { motivo: 'Observación Analista hacia AU2', usuario_destino_id: au2.id },
    ctx(analista, 'ANALISTA_CM'),
    analista.username,
  );
  trackObservacion(obsAnal.observacion);
  trackWorkflow(obsAnal.workflow_observacion?.id);
  ok(Number((await query(
    'SELECT responsable_usuario_id FROM entregable_estado_vigente WHERE orden_entrega_id=$1',
    [eAnal.id],
  )).rows[0]?.responsable_usuario_id) === Number(au2.id),
  'B1. Analista observa y transfiere responsabilidad a AU2');

  const subAnal = await subsanarEntregable(
    eAnal.id,
    {
      fecha_recepcion_mesa_partes: '2026-08-20',
      numero_expediente_sgd: `SGD-SUB-A-${nonce}`,
      observacion_id: obsAnal.observacion.id,
      documentos: [{
        nombre_archivo: 'sub-anal.pdf',
        mime_type: 'application/pdf',
        contenido_base64: pdf('sub-anal'),
      }],
    },
    ctx(au2, 'AREA_USUARIA'),
    au2.username,
  );
  trackRecepcion(subAnal?.recepcion?.id);
  trackObservacion(subAnal?.observacion);
  const estadoPostAnal = await obtenerEstadoResponsableEntregable(eAnal.id);
  ok(estadoPostAnal.etapaCodigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO
    && Number(estadoPostAnal.responsableUsuarioId) === Number(analista.id),
  'B2. tras subsanar vuelve al Analista emisor en PREPARACION_EXPEDIENTE_PAGO');

  const woAnal = (await query(`
    SELECT wo.* FROM workflow_observaciones wo WHERE id=$1
  `, [obsAnal.workflow_observacion.id])).rows[0];
  trackWorkflow(woAnal?.id);
  const routingDocAnal = typeof woAnal?.documentos === 'string'
    ? JSON.parse(woAnal.documentos)
    : woAnal?.documentos;
  ok(woAnal
    && Number(woAnal.usuario_origen_id) === Number(analista.id)
    && Number(woAnal.usuario_destino_id) === Number(au2.id)
    && (woAnal.origen_submodulo_codigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO
      || woAnal.origen_submodulo_codigo === ETAPAS.REVISION_ANALISTA_CM)
    && (routingDocAnal?.etapa_retorno === ETAPAS.PREPARACION_EXPEDIENTE_PAGO
      || routingDocAnal?.etapa_retorno === ETAPAS.REVISION_ANALISTA_CM),
  'D2. trazabilidad Analista registra emisor, destinatario, origen y retorno');
  ok(subsCoord.observacion.estado === 'OBS_SUBSANADA', 'subsanación cierra observación Coordinador');
} catch (error) {
  ok(false, `fixture (${error.message})`);
  console.error(error);
} finally {
  try {
    const cleanup = await cleanupRc8156G2Fixture({
      apply: true,
      tracked: fixture,
      getClient: () => pool.connect(),
    });
    if (cleanup.deleted && Object.values(cleanup.deleted).some((n) => n > 0)) {
      console.log('\nCleanup fixture G-2:');
      for (const [key, count] of Object.entries(cleanup.deleted)) {
        if (count > 0) console.log(`  ${key}: ${count}`);
      }
    }
  } catch (error) {
    cleanupErrors.push(error);
    console.error('  ✗ Cleanup fixture G-2 falló:', error.message);
  }

  try {
    const residual = await discoverRc8156G2Fixture();
    ok(!hasRc8156G2Residuals(residual),
      'sin residuos RC8156G2 tras cleanup');
    if (hasRc8156G2Residuals(residual)) {
      cleanupErrors.push(new Error(`Residuos RC8156G2: ${JSON.stringify(residual.totals)}`));
    }
  } catch (error) {
    cleanupErrors.push(error);
    console.error('  ✗ Scan post-cleanup falló:', error.message);
  }

  try {
    const dest = await verificarDestinatariosOs1105SinFixture();
    ok(dest.ok, 'OS 1105/E1 destinatarios sin Fixture G2 y sin duplicados por id');
    if (!dest.ok) {
      console.error('  destinatarios OS1105:', {
        total: dest.total,
        fixtures: dest.fixtures?.map((u) => u.nombre),
        duplicados: dest.duplicados,
        motivo: dest.motivo,
      });
    }
  } catch (error) {
    cleanupErrors.push(error);
    console.error('  ✗ Verificación destinatarios OS 1105 falló:', error.message);
  }

  await pool.end();
  console.log(`\n=== Resultado G-2: ${passed} OK, ${failed} FAIL ===`);
  if (cleanupErrors.length) {
    console.error(`Cleanup/verificación: ${cleanupErrors.length} error(es)`);
  }
  console.log('');
  process.exit(failed || cleanupErrors.length ? 1 : 0);
}

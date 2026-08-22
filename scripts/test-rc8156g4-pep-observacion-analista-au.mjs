/**
 * RC8.15.6G-4 — Observación Analista CM desde Pagos (PREPARACION_EXPEDIENTE_PAGO) → AU → retorno.
 */
import pool, { query } from '../server/db.js';
import {
  derivarEntregableAnalistaCM,
  derivarEntregableCoordinadorCM,
  listarBandejaEntregablesServicios,
  listarBandejaPreparacionExpedientePago,
  listarDestinatariosAreaUsuariaEntregable,
  listarTrazabilidadEntregable,
  observarEntregableAnalistaCM,
  obtenerEstadoResponsableEntregable,
  subsanarEntregable,
} from '../server/lib/entregablesServicios.js';
import { validarDestinatarioAreaUsuariaOrden } from '../server/lib/ordenesContratacion.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { pagoMenuItems } from '../src/views/ejecucion/derivacionPagoView.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';
import { ETAPAS } from '../shared/workflow/etapas.js';

let passed = 0;
let failed = 0;
const fixture = {
  ordenIds: [],
  ordenEntregaIds: [],
  recepcionIds: [],
  observacionIds: [],
  workflowIds: [],
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

async function cleanup() {
  for (const oid of fixture.ordenIds) {
    await query('DELETE FROM entregable_eventos WHERE orden_id=$1', [oid]);
    await query('DELETE FROM entregable_observaciones WHERE orden_id=$1', [oid]);
    await query('DELETE FROM entregable_conformidad_acta_visados WHERE orden_id=$1', [oid]);
    await query('DELETE FROM entregable_conformidad_actas WHERE orden_id=$1', [oid]);
    await query('DELETE FROM entregable_recepcion_documentos WHERE recepcion_id = ANY(SELECT id FROM entregable_recepciones WHERE orden_id=$1)', [oid]);
    await query('DELETE FROM entregable_recepciones WHERE orden_id=$1', [oid]);
    await query('DELETE FROM entregable_asignaciones WHERE orden_id=$1', [oid]);
    await query('DELETE FROM entregable_estado_vigente WHERE orden_id=$1', [oid]);
    await query('DELETE FROM orden_entregas WHERE orden_id=$1', [oid]);
    await query('DELETE FROM ordenes_contratacion WHERE id=$1', [oid]);
  }
  if (fixture.workflowIds.length) {
    await query('DELETE FROM workflow_observaciones WHERE id = ANY($1::int[])', [fixture.workflowIds]);
  }
  if (fixture.usuarioIds.length) {
    await query('DELETE FROM workflow_observaciones WHERE usuario_origen_id = ANY($1::int[]) OR usuario_destino_id = ANY($1::int[])', [fixture.usuarioIds]);
    await query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [fixture.usuarioIds]);
  }
}

console.log('\n=== RC8.15.6G-4 — Observación Pagos (PEP) → AU → retorno ===\n');

try {
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;

  async function crearUsuario(sufijo, perfil, centro = null) {
    const row = (await query(`
      INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos, centro, codigo_centro_costo)
      VALUES ($1,$2,$3,'usuario',$4,TRUE,$5::jsonb,$6,$6) RETURNING *
    `, [
      `G4${sufijo}${nonce}`.slice(0, 20),
      `g4_${nonce}_${sufijo}`,
      `Fixture G4 ${sufijo}`,
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
  const auOtroCentro = await crearUsuario('aux', 'AREA_USUARIA', 'OTRO-CENTRO-G4');
  const auInactivo = await crearUsuario('aui', 'AREA_USUARIA', centro.centro_codigo);
  await query('UPDATE usuarios SET activo=FALSE WHERE id=$1', [auInactivo.id]);
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

  const ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,800,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156G4${nonce}`])).rows[0].id);
  trackOrden(ordenId);

  async function crearEntrega(numero) {
    const eid = Number((await query(`
      INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
      VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
    `, [ordenId, numero, `G4 E${numero}`])).rows[0].id);
    trackEntrega(eid);
    await inicializarEstadoResponsableEntregable(eid, { actualizadoPor: 'test-g4' });
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
      ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO','test-g4') RETURNING *
    `, [eid, ordenId, `SGD-G4-${numero}-${nonce}`])).rows[0];
    trackRecepcion(recepcion.id);
    const acta = (await query(`
      INSERT INTO entregable_conformidad_actas (
        orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
        estado_documental, generado_at, generado_por
      ) VALUES ($1,$2,$3,$4,1,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-g4') RETURNING *
    `, [ordenId, eid, recepcion.id, `ACTA-G4-${numero}`])).rows[0];
    trackActa(acta.id);
    await query(`
      INSERT INTO entregable_conformidad_acta_visados (
        orden_id, orden_entrega_id, acta_id, version, nombre, mime_type,
        contenido_base64, estado_documental, vigente, created_by
      ) VALUES ($1,$2,$3,1,$4,'application/pdf',$5,'ACTA_CONFORMIDAD_FIRMADA',TRUE,'test-g4')
    `, [ordenId, eid, acta.id, `firmada-${numero}.pdf`, pdf(`g4-${numero}`)]);
    return { id: eid, recepcion };
  }

  async function prepararPep(entrega) {
    await derivarEntregableCoordinadorCM(
      entrega.id, { responsable_id: coordinador.id }, ctx(au1, 'AREA_USUARIA'), au1.username,
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

  const bandejaPagosPre = await listarBandejaPreparacionExpedientePago(ctx(analista, 'ANALISTA_CM'));
  const filaPagosPre = bandejaPagosPre.find((r) => Number(r.orden_entrega_id) === entrega.id);
  ok(Boolean(filaPagosPre?.puede_observar_pago),
    'Analista responsable tiene acción Observar en bandeja Pagos');
  ok(pagoMenuItems(filaPagosPre).some((item) => item.act === 'observarEntregable'),
    'pagoMenuItems incluye Observar');

  const candidatos = await listarDestinatariosAreaUsuariaEntregable(
    entrega.id, {}, ctx(analista, 'ANALISTA_CM'),
  );
  const idsCandidatos = (candidatos.usuarios || []).map((u) => Number(u.id));
  ok(idsCandidatos.includes(Number(au2.id))
    && !idsCandidatos.includes(Number(auInactivo.id))
    && !idsCandidatos.includes(Number(auOtroCentro.id)),
  'listado AU incluye activos del centro y excluye inactivo/otro centro');

  let rechazoCentro = null;
  try {
    await validarDestinatarioAreaUsuariaOrden(ordenId, auOtroCentro.id);
  } catch (error) {
    rechazoCentro = error;
  }
  ok(rechazoCentro?.code === 'RESPONSABLE_CENTRO_INVALIDO',
    'AU de otro centro se rechaza al observar');

  const eventosAntes = Number((await query(
    'SELECT COUNT(*)::int AS n FROM entregable_eventos WHERE orden_entrega_id=$1',
    [entrega.id],
  )).rows[0].n);

  const obs = await observarEntregableAnalistaCM(
    entrega.id,
    { motivo: 'Observación Pagos hacia AU2', usuario_destino_id: au2.id },
    ctx(analista, 'ANALISTA_CM'),
    analista.username,
  );
  trackObservacion(obs.observacion);
  trackWorkflow(obs.workflow_observacion?.id);

  const estadoAu = await obtenerEstadoResponsableEntregable(entrega.id);
  ok(estadoAu.etapaCodigo === ETAPAS.PRESENTACION_ENTREGABLES
    && Number(estadoAu.responsableUsuarioId) === Number(au2.id),
  'tras observar pasa temporalmente a PRESENTACION_ENTREGABLES con AU destino');

  const bandejaPeAu = await listarBandejaEntregablesServicios(ctx(au2, 'AREA_USUARIA'));
  const filaPeAu = bandejaPeAu.find((r) => Number(r.orden_entrega_id) === entrega.id);
  ok(Boolean(filaPeAu?.puede_subsanar), 'AU destino puede Subsanar');
  ok(!entregableMenuItems(filaPeAu || {}).some((item) => item.act === 'derivarPago'),
    'AU no ve acciones de Analista CM');

  const bandejaPagosDurante = await listarBandejaPreparacionExpedientePago(ctx(analista, 'ANALISTA_CM'));
  ok(!bandejaPagosDurante.some((r) => Number(r.orden_entrega_id) === entrega.id),
    'expediente desaparece de bandeja Pagos mientras AU subsana');

  const wo = (await query('SELECT * FROM workflow_observaciones WHERE id=$1', [obs.workflow_observacion.id])).rows[0];
  const routingDoc = typeof wo?.documentos === 'string' ? JSON.parse(wo.documentos) : wo?.documentos;
  ok(wo.origen_submodulo_codigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO
    && routingDoc?.etapa_retorno === ETAPAS.PREPARACION_EXPEDIENTE_PAGO,
  'routing guarda origen y etapa_retorno PREPARACION_EXPEDIENTE_PAGO');

  const sub = await subsanarEntregable(
    entrega.id,
    {
      fecha_recepcion_mesa_partes: '2026-08-20',
      numero_expediente_sgd: `SGD-SUB-G4-${nonce}`,
      observacion_id: obs.observacion.id,
      documentos: [{
        nombre_archivo: 'sub-g4.pdf',
        mime_type: 'application/pdf',
        contenido_base64: pdf('sub-g4'),
      }],
    },
    ctx(au2, 'AREA_USUARIA'),
    au2.username,
  );
  trackRecepcion(sub?.recepcion?.id);
  trackObservacion(sub?.observacion);

  const estadoFinal = await obtenerEstadoResponsableEntregable(entrega.id);
  ok(estadoFinal.etapaCodigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO
    && Number(estadoFinal.responsableUsuarioId) === Number(analista.id),
  'tras subsanar retorna al mismo Analista CM en PREPARACION_EXPEDIENTE_PAGO');

  const woPost = (await query('SELECT * FROM workflow_observaciones WHERE id=$1', [obs.workflow_observacion.id])).rows[0];
  ok(sub.observacion.estado === 'OBS_SUBSANADA'
    && woPost.estado === 'OBS_SUBSANADA',
  'observación y workflow quedan OBS_SUBSANADA');

  const bandejaPagosPost = await listarBandejaPreparacionExpedientePago(ctx(analista, 'ANALISTA_CM'));
  const filaPagosPost = bandejaPagosPost.find((r) => Number(r.orden_entrega_id) === entrega.id);
  ok(Boolean(filaPagosPost?.puede_observar_pago),
    'Analista CM vuelve a ver expediente en Pagos con Observar habilitado');

  const bandejaOtro = await listarBandejaPreparacionExpedientePago(ctx(otroAnalista, 'ANALISTA_CM'));
  const filaOtro = bandejaOtro.find((r) => Number(r.orden_entrega_id) === entrega.id);
  ok(!filaOtro?.puede_observar_pago, 'otro Analista CM no obtiene Observar operativo');

  const traza = await listarTrazabilidadEntregable(entrega.id, ctx(analista, 'ANALISTA_CM'));
  ok(traza.length > eventosAntes, 'trazabilidad conserva y extiende eventos');
} catch (error) {
  ok(false, `fixture (${error.message})`);
  console.error(error);
} finally {
  try {
    const orphans = (await query(`
      SELECT id FROM ordenes_contratacion WHERE numero_orden ~ '^RC8156G4'
    `)).rows;
    for (const o of orphans) trackOrden(o.id);
    const orphanUsers = (await query(`
      SELECT id FROM usuarios WHERE username ~ '^g4_'
    `)).rows;
    for (const u of orphanUsers) trackUsuario(u.id);
    await cleanup();
  } catch (error) {
    failed++;
    console.error('  ✗ cleanup falló:', error.message);
  }
  const residuos = Number((await query(`
    SELECT COUNT(*)::int AS n FROM ordenes_contratacion WHERE numero_orden ~ '^RC8156G4'
  `)).rows[0].n);
  ok(residuos === 0, 'sin residuos RC8156G4');
  await pool.end();
}

console.log(`\n=== Resultado G-4: ${passed} OK, ${failed} FAIL ===\n`);
if (failed) process.exit(1);

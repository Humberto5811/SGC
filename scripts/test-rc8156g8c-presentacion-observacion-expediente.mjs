/**
 * RC8.15.6G-8C — Presentación / Observación / Expediente.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import {
  adjuntarDocumentosRecepcionEntregable,
  derivarEntregableAnalistaCM,
  derivarEntregableCoordinadorCM,
  getDetalleEntregableServicio,
  listarBandejaEntregablesServicios,
  observarEntregableAnalistaCM,
  obtenerEstadoResponsableEntregable,
  retirarObservacionEntregable,
  subsanarEntregable,
} from '../server/lib/entregablesServicios.js';
import { classifyPreviewMode } from '../src/utils/documentViewer.js';
import { renderEstadoBadgeHtml } from '../src/ui/workflow/EstadoBadge.js';
import { ETAPAS } from '../shared/workflow/etapas.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
let passed = 0;
let failed = 0;
const ok = (cond, msg) => {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
};
function pdf(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF`).toString('base64');
}

console.log('\n=== RC8.15.6G-8C — Presentación / Observación / Expediente ===\n');

const peView = read('src/views/ejecucion/presentacionEntregableView.js');
const expModal = read('src/utils/registroOrdenExpedienteModal.js');

const estadoCellSrc = peView.split('function renderEntregableEstadoCell')[1]?.split('function labelEtapaRetornoObservacion')[0] || '';
ok(/estadoCodigo: 'OBSERVADO'/.test(estadoCellSrc), 'badge OBSERVADO estandarizado en bandeja');
ok(!/observacion_abierta\?\.motivo|text-danger small mt-1/.test(estadoCellSrc),
  'glosa/motivo fuera del campo Estado');
ok(/VerObservacionModal/.test(peView) && /Subsanar y derivar a Pagos/.test(peView),
  'modal Ver observación permite subsanar');
ok(/Submódulo retorno/.test(peView) && /Analista CM emisor/.test(peView),
  'modal observación muestra retorno Pagos y emisor');
ok(peView.indexOf('renderConformidadHtml(conformidad, id)') < peView.indexOf('Documentos de la orden / expediente'),
  'Conformidad aparece antes de documentos generales de orden');
ok(!/text-uppercase small mb-2">Observaciones</.test(peView),
  'bloque Observaciones ya no aparece en expediente del entregable');
ok(/export async function openExpedienteDocumento/.test(expModal),
  'visor compartido openExpedienteDocumento exportado');
ok(/openExpedienteDocumento\(/.test(peView) && !/Vista no disponible para este tipo de documento/.test(peView),
  'expediente entregable usa visor autenticado compartido');
ok(classifyPreviewMode('application/pdf', 'doc.pdf') === 'pdf', 'preview PDF soportado');

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

try {
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const ctx = (user, perfil) => ({
    id: Number(user.id),
    username: user.username,
    nombre: user.nombre,
    rol: user.rol,
    permisos: { perfil },
  });

  async function crearUsuario(sufijo, perfil, centro = null) {
    const row = (await query(`
      INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos, centro, codigo_centro_costo)
      VALUES ($1,$2,$3,'usuario',$4,TRUE,$5::jsonb,$6,$6) RETURNING *
    `, [
      `G8C${sufijo}${nonce}`.slice(0, 20),
      `g8c_${nonce}_${sufijo}`,
      `Fixture G8C ${sufijo}`,
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
  const coordinador = await crearUsuario('coord', 'COORDINADOR_CM', centro.centro_codigo);
  const analista = await crearUsuario('anal', 'ANALISTA_CM', centro.centro_codigo);

  const ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,950,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156G8C${nonce}`])).rows[0].id);
  trackOrden(ordenId);

  const eid = Number((await query(`
    INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
    VALUES ($1,1,'ENTREGABLE','G8C E1',10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
  `, [ordenId])).rows[0].id);
  trackEntrega(eid);
  const { inicializarEstadoResponsableEntregable } = await import('../server/lib/entregableEstadoPersistido.js');
  await inicializarEstadoResponsableEntregable(eid, { actualizadoPor: 'test-g8c' });
  await query(`UPDATE entregable_estado_vigente SET responsable_usuario_id=$2 WHERE orden_entrega_id=$1`, [eid, au1.id]);
  await query(`UPDATE entregable_asignaciones SET usuario_id=$2, unidad_codigo='AREA_USUARIA', tipo_responsable='PERSONA' WHERE orden_entrega_id=$1 AND activo=TRUE`, [eid, au1.id]);
  const recepcion = (await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO','test-g8c') RETURNING id
  `, [eid, ordenId, `SGD-G8C-${nonce}`])).rows[0];
  trackRecepcion(recepcion.id);
  await query(`
    INSERT INTO entregable_recepcion_documentos (
      recepcion_id, tipo_documento, nombre_archivo, mime_type, contenido_base64, tamanio_bytes, vigente
    ) VALUES ($1,'ENTREGABLE','ent.pdf','application/pdf',$2,120,TRUE)
  `, [recepcion.id, pdf('g8c-ent')]);
  const acta = (await query(`
    INSERT INTO entregable_conformidad_actas (
      orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
      estado_documental, generado_at, generado_por
    ) VALUES ($1,$2,$3,$4,1,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-g8c') RETURNING id
  `, [ordenId, eid, recepcion.id, `ACTA-G8C`])).rows[0];
  trackActa(acta.id);
  await query(`
    INSERT INTO entregable_conformidad_acta_visados (
      orden_id, orden_entrega_id, acta_id, version, nombre, mime_type,
      contenido_base64, estado_documental, vigente, created_by
    ) VALUES ($1,$2,$3,1,$4,'application/pdf',$5,'ACTA_CONFORMIDAD_FIRMADA',TRUE,'test-g8c')
  `, [ordenId, eid, acta.id, 'firmada-g8c.pdf', pdf('g8c-f')]);

  await derivarEntregableCoordinadorCM(eid, { responsable_id: coordinador.id }, ctx(au1, 'AREA_USUARIA'), au1.username);
  await derivarEntregableAnalistaCM(eid, { responsable_id: analista.id }, ctx(coordinador, 'COORDINADOR_CM'), coordinador.username);

  const obs = await observarEntregableAnalistaCM(
    eid,
    { motivo: 'Observación G8C modal', usuario_destino_id: au2.id },
    ctx(analista, 'ANALISTA_CM'),
    analista.username,
  );
  trackObservacion(obs.observacion);

  const bandejaAu = await listarBandejaEntregablesServicios(ctx(au2, 'AREA_USUARIA'));
  const filaAu = bandejaAu.find((r) => Number(r.orden_entrega_id) === eid);
  ok(filaAu?.situacion_codigo === 'OBSERVADO'
    && filaAu?.estado_etapa_label?.includes('Presentación'),
  'bandeja muestra OBSERVADO y etapa/submódulo actual');
  const badge = renderEstadoBadgeHtml({ estadoCodigo: 'OBSERVADO', estadoLabel: 'Observado' });
  ok(/sgc-estado-badge--observed/.test(badge), 'badge OBSERVADO institucional rojo');

  const detalle = await getDetalleEntregableServicio(eid);
  ok(detalle.observacion_abierta?.emisor_nombre || detalle.observacion_abierta?.emisor_username,
    'detalle incluye emisor para modal Ver observación');
  ok(detalle.observacion_abierta?.etapa_retorno === ETAPAS.PREPARACION_EXPEDIENTE_PAGO,
    'detalle incluye etapa retorno Pagos');

  await adjuntarDocumentosRecepcionEntregable(eid, {
    documentos: [{
      tipo_documento: 'COLEGIATURA',
      nombre_archivo: 'col-g8c.pdf',
      mime_type: 'application/pdf',
      contenido_base64: pdf('col-g8c'),
    }],
  }, ctx(au2, 'AREA_USUARIA'), au2.username);
  const docsCol = (await query(`
    SELECT id FROM entregable_recepcion_documentos
    WHERE recepcion_id=$1 AND tipo_documento='COLEGIATURA' AND vigente=TRUE
  `, [recepcion.id])).rows;
  ok(docsCol.length === 1, 'docs G-7I gestionables durante observación');

  const plazoAntes = (await query('SELECT dias_plazo, fecha_maxima FROM orden_entregas WHERE id=$1', [eid])).rows[0];
  const sub = await subsanarEntregable(eid, {
    fecha_recepcion_mesa_partes: '2026-08-25',
    numero_expediente_sgd: `SGD-SUB-G8C-${nonce}`,
    observacion_id: obs.observacion.id,
    observacion: 'Respuesta subsanación G8C',
    documentos: [{ nombre_archivo: 'sub-g8c.pdf', mime_type: 'application/pdf', contenido_base64: pdf('sub-g8c') }],
  }, ctx(au2, 'AREA_USUARIA'), au2.username);
  trackRecepcion(sub?.recepcion?.id);
  const estadoFinal = await obtenerEstadoResponsableEntregable(eid);
  ok(estadoFinal.etapaCodigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO
    && Number(estadoFinal.responsableUsuarioId) === Number(analista.id),
  'subsanación retorna a PEP con mismo Analista CM');
  const plazoPost = (await query('SELECT dias_plazo, fecha_maxima FROM orden_entregas WHERE id=$1', [eid])).rows[0];
  ok(Number(plazoPost.dias_plazo) === Number(plazoAntes.dias_plazo), 'plazo contractual intacto');

  const e2 = Number((await query(`
    INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
    VALUES ($1,2,'ENTREGABLE','G8C E2',10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
  `, [ordenId])).rows[0].id);
  trackEntrega(e2);
  await inicializarEstadoResponsableEntregable(e2, { actualizadoPor: 'test-g8c' });
  await query(`UPDATE entregable_estado_vigente SET responsable_usuario_id=$2 WHERE orden_entrega_id=$1`, [e2, au1.id]);
  await query(`UPDATE entregable_asignaciones SET usuario_id=$2 WHERE orden_entrega_id=$1 AND activo=TRUE`, [e2, au1.id]);
  const recep2 = (await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO','test-g8c') RETURNING id
  `, [e2, ordenId, `SGD-G8C2-${nonce}`])).rows[0];
  trackRecepcion(recep2.id);
  const acta2 = (await query(`
    INSERT INTO entregable_conformidad_actas (
      orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
      estado_documental, generado_at, generado_por
    ) VALUES ($1,$2,$3,$4,1,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-g8c') RETURNING id
  `, [ordenId, e2, recep2.id, `ACTA-G8C2`])).rows[0];
  trackActa(acta2.id);
  await query(`
    INSERT INTO entregable_conformidad_acta_visados (
      orden_id, orden_entrega_id, acta_id, version, nombre, mime_type,
      contenido_base64, estado_documental, vigente, created_by
    ) VALUES ($1,$2,$3,1,$4,'application/pdf',$5,'ACTA_CONFORMIDAD_FIRMADA',TRUE,'test-g8c')
  `, [ordenId, e2, acta2.id, 'firmada-g8c2.pdf', pdf('g8c2-f')]);
  await derivarEntregableCoordinadorCM(e2, { responsable_id: coordinador.id }, ctx(au1, 'AREA_USUARIA'), au1.username);
  await derivarEntregableAnalistaCM(e2, { responsable_id: analista.id }, ctx(coordinador, 'COORDINADOR_CM'), coordinador.username);
  const obsRet = await observarEntregableAnalistaCM(e2, { motivo: 'Retiro G8C', usuario_destino_id: au2.id }, ctx(analista, 'ANALISTA_CM'), analista.username);
  trackObservacion(obsRet.observacion);
  await retirarObservacionEntregable(e2, obsRet.observacion.id, { motivo: 'Retiro operativo G8C' }, ctx(analista, 'ANALISTA_CM'), analista.username);
  const estadoRet = await obtenerEstadoResponsableEntregable(e2);
  ok(estadoRet.etapaCodigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO
    && Number(estadoRet.responsableUsuarioId) === Number(analista.id),
  'Retirar observación sigue operativo');
} catch (error) {
  ok(false, `fixture (${error.message})`);
  console.error(error);
} finally {
  try {
    const orphans = (await query(`SELECT id FROM ordenes_contratacion WHERE numero_orden ~ '^RC8156G8C'`)).rows;
    for (const o of orphans) trackOrden(o.id);
    const orphanUsers = (await query(`SELECT id FROM usuarios WHERE username ~ '^g8c_'`)).rows;
    for (const u of orphanUsers) trackUsuario(u.id);
    await cleanup();
  } catch (cleanupErr) {
    console.error('cleanup:', cleanupErr.message);
  }
}

console.log(`\n=== Resultado RC8.15.6G-8C: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
await pool.end();

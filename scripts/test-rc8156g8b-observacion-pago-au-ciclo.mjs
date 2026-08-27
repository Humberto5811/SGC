/**
 * RC8.15.6G-8B — Ciclo observación Pagos → AU → Pagos.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import {
  adjuntarDocumentosRecepcionEntregable,
  derivarEntregableAnalistaCM,
  derivarEntregableCoordinadorCM,
  esSeguimientoObservadoDesdePep,
  labelSubmoduloDestinoObservacionEntregable,
  listarBandejaEntregablesServicios,
  listarBandejaPreparacionExpedientePago,
  modificarRecepcionEntregable,
  observarEntregableAnalistaCM,
  obtenerEstadoResponsableEntregable,
  retirarObservacionEntregable,
  subsanarEntregable,
} from '../server/lib/entregablesServicios.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { renderEstadoBadgeHtml } from '../src/ui/workflow/EstadoBadge.js';
import { pagoMenuItems } from '../src/views/ejecucion/derivacionPagoView.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';
import { ETAPAS } from '../shared/workflow/etapas.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

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

console.log('\n=== RC8.15.6G-8B — Ciclo observación Pagos → AU → Pagos ===\n');

const pagoView = read('src/views/ejecucion/derivacionPagoView.js');
const peView = read('src/views/ejecucion/presentacionEntregableView.js');
ok(/Submódulo destino/.test(pagoView) && /ObservarSubmodulo/.test(pagoView),
  'modal Pagos muestra submódulo destino informativo');
ok(labelSubmoduloDestinoObservacionEntregable({ tipo_orden: 'OS', tipo_contratacion: 'SERVICIO' })
  === 'Presentación de Entregables de Servicios',
  'submódulo destino servicios/locación');
ok(/observacion_retorno_pep/.test(peView) && /Subsanar y derivar a Pagos/.test(peView),
  'Presentación Entregables etiqueta Subsanar y derivar a Pagos');
ok(/situacion_codigo === 'OBSERVADO'/.test(peView) && /estadoCodigo: 'OBSERVADO'/.test(peView),
  'AU ve badge OBSERVADO rojo en bandeja');

try {
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;

  async function crearUsuario(sufijo, perfil, centro = null) {
    const row = (await query(`
      INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos, centro, codigo_centro_costo)
      VALUES ($1,$2,$3,'usuario',$4,TRUE,$5::jsonb,$6,$6) RETURNING *
    `, [
      `G8B${sufijo}${nonce}`.slice(0, 20),
      `g8b_${nonce}_${sufijo}`,
      `Fixture G8B ${sufijo}`,
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
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,900,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156G8B${nonce}`])).rows[0].id);
  trackOrden(ordenId);

  async function crearEntrega(numero) {
    const plazoAntes = 10;
    const eid = Number((await query(`
      INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
      VALUES ($1,$2,'ENTREGABLE',$3,$4,CURRENT_DATE+$4::int,100,'ACTIVO') RETURNING id, dias_plazo, fecha_maxima
    `, [ordenId, numero, `G8B E${numero}`, plazoAntes])).rows[0].id);
    trackEntrega(eid);
    await inicializarEstadoResponsableEntregable(eid, { actualizadoPor: 'test-g8b' });
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
      ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO','test-g8b') RETURNING *
    `, [eid, ordenId, `SGD-G8B-${numero}-${nonce}`])).rows[0];
    trackRecepcion(recepcion.id);
    await query(`
      INSERT INTO entregable_recepcion_documentos (
        recepcion_id, tipo_documento, nombre_archivo, mime_type, contenido_base64, tamanio_bytes, vigente
      ) VALUES ($1,'ENTREGABLE','entregable.pdf','application/pdf',$2,120,TRUE)
    `, [recepcion.id, pdf(`g8b-${numero}`)]);
    const acta = (await query(`
      INSERT INTO entregable_conformidad_actas (
        orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
        estado_documental, generado_at, generado_por
      ) VALUES ($1,$2,$3,$4,1,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-g8b') RETURNING *
    `, [ordenId, eid, recepcion.id, `ACTA-G8B-${numero}`])).rows[0];
    trackActa(acta.id);
    await query(`
      INSERT INTO entregable_conformidad_acta_visados (
        orden_id, orden_entrega_id, acta_id, version, nombre, mime_type,
        contenido_base64, estado_documental, vigente, created_by
      ) VALUES ($1,$2,$3,1,$4,'application/pdf',$5,'ACTA_CONFORMIDAD_FIRMADA',TRUE,'test-g8b')
    `, [ordenId, eid, acta.id, `firmada-${numero}.pdf`, pdf(`g8b-f-${numero}`)]);
    return { id: eid, recepcion, plazoAntes };
  }

  async function prepararPep(entregaId) {
    await derivarEntregableCoordinadorCM(
      entregaId, { responsable_id: coordinador.id }, ctx(au1, 'AREA_USUARIA'), au1.username,
    );
    await derivarEntregableAnalistaCM(
      entregaId, { responsable_id: analista.id }, ctx(coordinador, 'COORDINADOR_CM'), coordinador.username,
    );
  }

  const entrega = await crearEntrega(1);
  await prepararPep(entrega.id);

  const plazoRowAntes = (await query(
    'SELECT dias_plazo, fecha_maxima FROM orden_entregas WHERE id=$1',
    [entrega.id],
  )).rows[0];

  const obs = await observarEntregableAnalistaCM(
    entrega.id,
    { motivo: 'Observación G8B desde Pagos', usuario_destino_id: au2.id },
    ctx(analista, 'ANALISTA_CM'),
    analista.username,
  );
  trackObservacion(obs.observacion);

  const bandejaPeAu = await listarBandejaEntregablesServicios(ctx(au2, 'AREA_USUARIA'));
  const filaPeAu = bandejaPeAu.find((r) => Number(r.orden_entrega_id) === entrega.id);
  ok(filaPeAu?.situacion_codigo === 'OBSERVADO'
    && Number(filaPeAu?.responsable_usuario_id) === Number(au2.id),
  'AU observado: situación OBSERVADO y responsable AU actual');
  const badgeObs = renderEstadoBadgeHtml({ estadoCodigo: 'OBSERVADO', estadoLabel: 'Observado' });
  ok(/sgc-estado-badge--observed/.test(badgeObs), 'badge institucional OBSERVADO rojo');
  const menuAu = entregableMenuItems(filaPeAu);
  ok(menuAu.some((i) => i.act === 'subsanarEntregable' && i.label === 'Subsanar y derivar a Pagos')
    && menuAu.some((i) => i.act === 'registrarRecepcion'),
  'menú AU incluye Modificar y Subsanar y derivar a Pagos');

  const bandejaPagosDurante = await listarBandejaPreparacionExpedientePago(ctx(analista, 'ANALISTA_CM'));
  const filaPagosDurante = bandejaPagosDurante.find((r) => Number(r.orden_entrega_id) === entrega.id);
  ok(Boolean(filaPagosDurante) && esSeguimientoObservadoDesdePep(filaPagosDurante),
    'observado sigue visible en bandeja Pagos');
  ok(Number(filaPagosDurante?.responsable_usuario_id) === Number(au2.id),
    'Pagos refleja responsable AU durante subsanación');
  ok(!pagoMenuItems(filaPagosDurante).some((i) => ['observarEntregable', 'evaluarPenalidad', 'checklistDocumentos'].includes(i.act)),
    'Pagos sin acciones operativas CM durante observación');

  await adjuntarDocumentosRecepcionEntregable(
    entrega.id,
    {
      documentos: [{
        tipo_documento: 'SEGURO',
        nombre_archivo: 'seguro-g8b.pdf',
        mime_type: 'application/pdf',
        contenido_base64: pdf('seguro-g8b'),
        vigencia_desde: '2026-01-01',
        vigencia_hasta: '2027-01-01',
      }],
    },
    ctx(au2, 'AREA_USUARIA'),
    au2.username,
  );
  const docsSeguro = (await query(`
    SELECT id FROM entregable_recepcion_documentos
    WHERE recepcion_id=$1 AND tipo_documento='SEGURO' AND vigente=TRUE
  `, [entrega.recepcion.id])).rows;
  ok(docsSeguro.length === 1, 'AU gestiona documento tipificado G-7I durante observación');

  await modificarRecepcionEntregable(
    entrega.id,
    {
      fecha_recepcion_mesa_partes: '2026-08-15',
      numero_expediente_sgd: `SGD-MOD-G8B-${nonce}`,
      observacion: 'Corrección metadatos recepción',
    },
    ctx(au2, 'AREA_USUARIA'),
    au2.username,
  );

  const plazoRowDurante = (await query(
    'SELECT dias_plazo, fecha_maxima FROM orden_entregas WHERE id=$1',
    [entrega.id],
  )).rows[0];
  ok(Number(plazoRowDurante.dias_plazo) === Number(plazoRowAntes.dias_plazo)
    && String(plazoRowDurante.fecha_maxima) === String(plazoRowAntes.fecha_maxima),
  'plazo contractual no se altera durante subsanación');

  const sub = await subsanarEntregable(
    entrega.id,
    {
      fecha_recepcion_mesa_partes: '2026-08-22',
      numero_expediente_sgd: `SGD-SUB-G8B-${nonce}`,
      observacion_id: obs.observacion.id,
      documentos: [{
        nombre_archivo: 'sub-g8b.pdf',
        mime_type: 'application/pdf',
        contenido_base64: pdf('sub-g8b'),
      }],
    },
    ctx(au2, 'AREA_USUARIA'),
    au2.username,
  );
  trackRecepcion(sub?.recepcion?.id);

  const estadoFinal = await obtenerEstadoResponsableEntregable(entrega.id);
  ok(estadoFinal.etapaCodigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO
    && Number(estadoFinal.responsableUsuarioId) === Number(analista.id),
  'Subsanar y derivar a Pagos retorna a PEP con mismo Analista CM');

  const woPost = (await query('SELECT estado FROM workflow_observaciones WHERE id=$1', [obs.workflow_observacion.id])).rows[0];
  ok(sub.observacion.estado === 'OBS_SUBSANADA' && woPost.estado === 'OBS_SUBSANADA',
    'workflow queda OBS_SUBSANADA');

  const entregaRetiro = await crearEntrega(2);
  await prepararPep(entregaRetiro.id);
  const obsRet = await observarEntregableAnalistaCM(
    entregaRetiro.id,
    { motivo: 'Retiro G8B', usuario_destino_id: au2.id },
    ctx(analista, 'ANALISTA_CM'),
    analista.username,
  );
  trackObservacion(obsRet.observacion);
  await retirarObservacionEntregable(
    entregaRetiro.id,
    obsRet.observacion.id,
    { motivo: 'Retiro operativo G8B' },
    ctx(analista, 'ANALISTA_CM'),
    analista.username,
  );
  const estadoRet = await obtenerEstadoResponsableEntregable(entregaRetiro.id);
  ok(estadoRet.etapaCodigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO
    && Number(estadoRet.responsableUsuarioId) === Number(analista.id),
  'Retirar observación sigue operativo y restaura PEP/Analista');
} catch (error) {
  ok(false, `fixture (${error.message})`);
  console.error(error);
} finally {
  try {
    const orphans = (await query(`
      SELECT id FROM ordenes_contratacion WHERE numero_orden ~ '^RC8156G8B'
    `)).rows;
    for (const o of orphans) trackOrden(o.id);
    const orphanUsers = (await query(`
      SELECT id FROM usuarios WHERE username ~ '^g8b_'
    `)).rows;
    for (const u of orphanUsers) trackUsuario(u.id);
    await cleanup();
  } catch (cleanupErr) {
    console.error('cleanup:', cleanupErr.message);
  }
}

console.log(`\n=== Resultado RC8.15.6G-8B: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
await pool.end();

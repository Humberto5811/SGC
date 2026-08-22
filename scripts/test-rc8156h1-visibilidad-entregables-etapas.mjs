/**
 * RC8.15.6H-1 — Visibilidad transversal de entregables por etapa en Presentación.
 */
import pool, { query } from '../server/db.js';
import {
  derivarEntregableAnalistaCM,
  derivarEntregableCoordinadorCM,
  listarBandejaEntregablesServicios,
  listarBandejaOrdenesEntregablesServicios,
  listarBandejaPreparacionExpedientePago,
  obtenerEstadoResponsableEntregable,
} from '../server/lib/entregablesServicios.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';
import { pagoMenuItems } from '../src/views/ejecucion/derivacionPagoView.js';
import { ETAPAS } from '../shared/workflow/etapas.js';

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

console.log('\n=== RC8.15.6H-1 — Visibilidad entregables por etapa ===\n');

try {
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;

  async function crearUsuario(sufijo, perfil, centro = null) {
    const row = (await query(`
      INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos, centro, codigo_centro_costo)
      VALUES ($1,$2,$3,'usuario',$4,TRUE,$5::jsonb,$6,$6) RETURNING *
    `, [
      `H1${sufijo}${nonce}`.slice(0, 20),
      `h1_${nonce}_${sufijo}`,
      `Fixture H1 ${sufijo}`,
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
    `H1AU${nonce}`.slice(0, 20),
    `h1_au_${nonce}`,
    'Fixture H1 AU',
    JSON.stringify({ perfil: 'AREA_USUARIA' }),
    centro.centro_codigo,
  ])).rows[0];
  trackUsuario(au.id);
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
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,800,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156H1${nonce}`])).rows[0].id);
  trackOrden(ordenId);

  async function crearEntrega(numero, auResponsable) {
    const eid = Number((await query(`
      INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
      VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
    `, [ordenId, numero, `H1 E${numero}`])).rows[0].id);
    trackEntrega(eid);
    await inicializarEstadoResponsableEntregable(eid, { actualizadoPor: 'test-h1' });
    await query(`
      UPDATE entregable_estado_vigente SET responsable_tipo='PERSONA', responsable_usuario_id=$2
      WHERE orden_entrega_id=$1
    `, [eid, auResponsable.id]);
    await query(`
      UPDATE entregable_asignaciones SET usuario_id=$2, unidad_codigo='AREA_USUARIA', tipo_responsable='PERSONA'
      WHERE orden_entrega_id=$1 AND activo=TRUE
    `, [eid, auResponsable.id]);
    const recepcion = (await query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO','test-h1') RETURNING *
    `, [eid, ordenId, `SGD-H1-${numero}-${nonce}`])).rows[0];
    trackRecepcion(recepcion.id);
    const acta = (await query(`
      INSERT INTO entregable_conformidad_actas (
        orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
        estado_documental, generado_at, generado_por
      ) VALUES ($1,$2,$3,$4,1,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-h1') RETURNING *
    `, [ordenId, eid, recepcion.id, `ACTA-H1-${numero}`])).rows[0];
    trackActa(acta.id);
    await query(`
      INSERT INTO entregable_conformidad_acta_visados (
        orden_id, orden_entrega_id, acta_id, version, nombre, mime_type,
        contenido_base64, estado_documental, vigente, created_by
      ) VALUES ($1,$2,$3,1,$4,'application/pdf',$5,'ACTA_CONFORMIDAD_FIRMADA',TRUE,'test-h1')
    `, [ordenId, eid, acta.id, `firmada-${numero}.pdf`, pdf(`h1-${numero}`)]);
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

  const e1 = await crearEntrega(1, au);
  const e2 = await crearEntrega(2, au);
  await prepararPep(e1);

  const bandejaAu = await listarBandejaEntregablesServicios(ctx(au, 'AREA_USUARIA'));
  const filaE1 = bandejaAu.find((r) => Number(r.orden_entrega_id) === e1.id);
  const filaE2 = bandejaAu.find((r) => Number(r.orden_entrega_id) === e2.id);
  ok(Boolean(filaE1) && Boolean(filaE2),
    'OS con E1 en PEP y E2 en PE: pestaña Entregables muestra E1 + E2');

  ok(filaE1?.estado_etapa_codigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO
    && String(filaE1?.estado_etapa_label || '').includes('Preparación'),
  'E1 en PEP muestra estado Preparación de expediente para Pago');
  ok(Number(filaE1?.responsable_usuario_id) === Number(analista.id),
    'E1 en PEP muestra Analista CM responsable');
  ok(!filaE1?.puede_observar && !filaE1?.puede_subsanar && !filaE1?.puede_derivar_coordinador_cm,
    'E1 en PEP no ofrece acciones operativas AU');
  const menuE1Au = entregableMenuItems(filaE1);
  ok(menuE1Au.some((item) => item.act === 'verExpediente')
    && !menuE1Au.some((item) => ['observarEntregable', 'subsanarEntregable', 'derivarCoordinadorCM'].includes(item.act)),
  'E1 en PEP: menú Presentación solo consulta para AU');

  ok(filaE2?.estado_etapa_codigo === ETAPAS.PRESENTACION_ENTREGABLES
    && Boolean(filaE2?.puede_derivar_coordinador_cm || filaE2?.puede_modificar_entregable),
  'E2 en PE mantiene acciones normales AU');

  const bandejaOrdenes = await listarBandejaOrdenesEntregablesServicios(ctx(au, 'AREA_USUARIA'));
  ok(bandejaOrdenes.some((r) => Number(r.orden_id) === ordenId),
    'pestaña Órdenes sigue mostrando la orden');

  await prepararPep(e2);
  const bandejaPePost = await listarBandejaEntregablesServicios(ctx(analista, 'ANALISTA_CM'));
  const bandejaPagosPost = await listarBandejaPreparacionExpedientePago(ctx(analista, 'ANALISTA_CM'));
  ok(['e1', 'e2'].every((key) => {
    const id = key === 'e1' ? e1.id : e2.id;
    return bandejaPePost.some((r) => Number(r.orden_entrega_id) === id);
  }), 'ambos en PEP siguen visibles en Presentación');
  ok(['e1', 'e2'].every((key) => {
    const id = key === 'e1' ? e1.id : e2.id;
    const fila = bandejaPagosPost.find((r) => Number(r.orden_entrega_id) === id);
    return Boolean(fila) && pagoMenuItems(fila).length >= 2;
  }), 'ambos en PEP aparecen en Pagos con acciones operativas al responsable');

  const estadoE2 = await obtenerEstadoResponsableEntregable(e2.id);
  ok(estadoE2.etapaCodigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO,
    'E2 confirmado en PEP tras segunda derivación');
} catch (error) {
  failed++;
  console.error('  ✗ Error fatal:', error.message);
  if (error.stack) console.error(error.stack);
} finally {
  try {
    await query('DELETE FROM entregable_penalidad_evaluacion WHERE orden_id = ANY($1::int[])', [fixture.ordenIds]);
    await query('DELETE FROM entregable_eventos WHERE orden_id = ANY($1::int[])', [fixture.ordenIds]);
    await query('DELETE FROM entregable_conformidad_acta_visados WHERE orden_id = ANY($1::int[])', [fixture.ordenIds]);
    await query('DELETE FROM entregable_conformidad_actas WHERE orden_id = ANY($1::int[])', [fixture.ordenIds]);
    await query('DELETE FROM entregable_recepciones WHERE orden_id = ANY($1::int[])', [fixture.ordenIds]);
    await query('DELETE FROM entregable_asignaciones WHERE orden_id = ANY($1::int[])', [fixture.ordenIds]);
    await query('DELETE FROM entregable_estado_vigente WHERE orden_id = ANY($1::int[])', [fixture.ordenIds]);
    await query('DELETE FROM orden_entregas WHERE orden_id = ANY($1::int[])', [fixture.ordenIds]);
    await query('DELETE FROM ordenes_contratacion WHERE id = ANY($1::int[])', [fixture.ordenIds]);
    if (fixture.usuarioIds.length) {
      await query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [fixture.usuarioIds]);
    }
  } catch (error) {
    cleanupErrors.push(error);
    console.error('  ✗ Cleanup H1 falló:', error.message);
  }

  try {
    const residuosH1 = Number((await query(`
      SELECT COUNT(*)::int AS n FROM ordenes_contratacion WHERE numero_orden ~ '^RC8156H1'
    `)).rows[0].n);
    ok(residuosH1 === 0, 'sin residuos RC8156H1');
  } catch (error) {
    cleanupErrors.push(error);
  }

  await pool.end();
  console.log(`\nResultado: ${passed} OK, ${failed} FAIL`);
  if (cleanupErrors.length) console.error(`Cleanup: ${cleanupErrors.length} error(es)`);
  console.log('');
  process.exit(failed || cleanupErrors.length ? 1 : 0);
}

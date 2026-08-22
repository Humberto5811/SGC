/**
 * Reparación idempotente — OS 1105 / Entregable 1 (orden_entrega_id=10)
 * Migra etapa histórica REVISION_ANALISTA_CM → PREPARACION_EXPEDIENTE_PAGO (Fase 1 Pagos).
 *
 * Uso:
 *   node scripts/repair-os1105-e1-ram-to-pep.mjs           # dry-run
 *   node scripts/repair-os1105-e1-ram-to-pep.mjs --apply   # aplicar
 */
import pool, { query } from '../server/db.js';
import {
  listarBandejaEntregablesServicios,
  listarBandejaPreparacionExpedientePago,
  listarTrazabilidadEntregable,
} from '../server/lib/entregablesServicios.js';
import { buildEstadoLabels } from '../server/lib/expedienteEstadoPersistido.js';
import { ETAPAS } from '../shared/workflow/etapas.js';
import { PERFILES_FUNCIONALES, resolveFunctionalProfiles } from '../server/utils/userRoleCatalog.js';

const APPLY = process.argv.includes('--apply');
const OS_NUMERO = '1105';
const ENTREGA_NUMERO = 1;
const ORDEN_ENTREGA_ID = 10;
const ETAPA_ORIGEN = ETAPAS.REVISION_ANALISTA_CM;
const ETAPA_ORIGEN_ALTERNATIVA = ETAPAS.DERIVACION_PAGO;
const ETAPA_DESTINO = ETAPAS.PREPARACION_EXPEDIENTE_PAGO;
const REPAIR_SCRIPT = 'repair-os1105-e1-ram-to-pep';

async function cargarContexto(client = null) {
  const run = client ? (sql, p) => client.query(sql, p) : (sql, p) => query(sql, p);

  const { rows: ordenRows } = await run(`
    SELECT oc.id AS orden_id, oc.requerimiento_id, oc.numero_orden,
      oc.tipo_orden, oc.tipo_contratacion, oc.estado AS orden_estado,
      r.tipo AS req_tipo
    FROM ordenes_contratacion oc
    LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
    WHERE oc.tipo_orden = 'OS' AND oc.numero_orden = $1
    ORDER BY oc.id ASC LIMIT 1
  `, [OS_NUMERO]);
  const orden = ordenRows[0];
  if (!orden) throw new Error(`OS ${OS_NUMERO} no encontrada`);

  const { rows: entregaRows } = await run(`
    SELECT oe.id AS orden_entrega_id, oe.numero_entrega, oe.estado, oe.orden_id
    FROM orden_entregas oe
    WHERE oe.orden_id = $1 AND oe.numero_entrega = $2 AND oe.estado = 'ACTIVO'
    ORDER BY oe.id DESC LIMIT 1
  `, [orden.orden_id, ENTREGA_NUMERO]);
  const entrega = entregaRows[0];
  if (!entrega) throw new Error(`Entregable ${ENTREGA_NUMERO} ACTIVO no encontrado en OS ${OS_NUMERO}`);

  const estado = (await run(`
    SELECT ev.*, u.username AS responsable_username, u.nombre AS responsable_nombre,
      u.rol, u.cargo, u.permisos, u.activo AS responsable_activo
    FROM entregable_estado_vigente ev
    LEFT JOIN usuarios u ON u.id = ev.responsable_usuario_id
    WHERE ev.orden_entrega_id = $1
  `, [entrega.orden_entrega_id])).rows[0] || null;

  const asignaciones = (await run(`
    SELECT a.*, u.username
    FROM entregable_asignaciones a
    LEFT JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.orden_entrega_id = $1
    ORDER BY a.activo DESC, a.asignado_at DESC, a.id DESC
  `, [entrega.orden_entrega_id])).rows;

  const obsAbiertas = (await run(`
    SELECT id, estado, observado_por, observado_at
    FROM entregable_observaciones
    WHERE orden_entrega_id = $1 AND estado IN ('OBS_EMITIDA', 'OBS_EN_ATENCION')
    ORDER BY id
  `, [entrega.orden_entrega_id])).rows;

  const conformidad = (await run(`
    SELECT
      (SELECT COUNT(*)::int FROM entregable_recepciones WHERE orden_entrega_id = $1) AS recepciones,
      (SELECT COUNT(*)::int FROM entregable_recepcion_documentos rd
        JOIN entregable_recepciones er ON er.id = rd.recepcion_id
        WHERE er.orden_entrega_id = $1) AS documentos,
      (SELECT COUNT(*)::int FROM entregable_conformidad_actas WHERE orden_entrega_id = $1) AS actas,
      (SELECT COUNT(*)::int FROM entregable_conformidad_acta_visados
        WHERE orden_entrega_id = $1 AND vigente = TRUE AND deleted_at IS NULL
          AND estado_documental = 'ACTA_CONFORMIDAD_FIRMADA') AS firmadas_vigentes,
      (SELECT MAX(version)::int FROM entregable_conformidad_actas WHERE orden_entrega_id = $1) AS acta_version,
      (SELECT COUNT(*)::int FROM entregable_observaciones WHERE orden_entrega_id = $1) AS observaciones,
      (SELECT COUNT(*)::int FROM entregable_eventos WHERE orden_entrega_id = $1) AS eventos
  `, [entrega.orden_entrega_id])).rows[0];

  const e2 = (await run(`
    SELECT oe.id AS orden_entrega_id, ev.etapa_codigo, ev.responsable_usuario_id, u.username
    FROM orden_entregas oe
    LEFT JOIN entregable_estado_vigente ev ON ev.orden_entrega_id = oe.id
    LEFT JOIN usuarios u ON u.id = ev.responsable_usuario_id
    WHERE oe.orden_id = $1 AND oe.numero_entrega = 2 AND oe.estado = 'ACTIVO'
    ORDER BY oe.id DESC LIMIT 1
  `, [orden.orden_id])).rows[0] || null;

  return {
    orden,
    entrega,
    estado,
    asignaciones,
    obsAbiertas,
    conformidad,
    e2,
  };
}

function esAnalistaCMResponsable(estado) {
  if (!estado || estado.responsable_tipo !== 'PERSONA') return false;
  const uid = Number(estado.responsable_usuario_id);
  if (!Number.isInteger(uid) || uid <= 0) return false;
  if (estado.responsable_activo === false) return false;
  const perfiles = resolveFunctionalProfiles({
    rol: estado.rol,
    cargo: estado.cargo,
    permisos: estado.permisos,
  });
  return perfiles.includes(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES);
}

function evaluarPlan(ctx) {
  const bloqueos = [];
  const etapa = String(ctx.estado?.etapa_codigo || '').toUpperCase();
  const activa = ctx.asignaciones.find((a) => a.activo === true) || null;

  if (Number(ctx.entrega.orden_entrega_id) !== ORDEN_ENTREGA_ID) {
    bloqueos.push(
      `orden_entrega_id=${ctx.entrega.orden_entrega_id}; se esperaba ${ORDEN_ENTREGA_ID}`,
    );
  }
  if (String(ctx.entrega.estado || '').toUpperCase() !== 'ACTIVO') {
    bloqueos.push(`Entregable no ACTIVO (${ctx.entrega.estado})`);
  }
  if (ctx.obsAbiertas.length) {
    bloqueos.push(`Observaciones abiertas: ${ctx.obsAbiertas.map((o) => `#${o.id}`).join(', ')}`);
  }
  if (!esAnalistaCMResponsable(ctx.estado)) {
    bloqueos.push(
      `Responsable actual (${ctx.estado?.responsable_username || '—'}) no es Analista CM PERSONA activo`,
    );
  }
  if (!ctx.conformidad?.acta_version || Number(ctx.conformidad.acta_version) <= 0) {
    bloqueos.push('Sin acta de conformidad generada');
  }
  if (Number(ctx.conformidad?.firmadas_vigentes || 0) <= 0) {
    bloqueos.push('Sin acta firmada vigente');
  }
  if (activa && Number(activa.usuario_id) !== Number(ctx.estado?.responsable_usuario_id)) {
    bloqueos.push(
      `Asignación activa (${activa.username || activa.usuario_id}) no coincide con responsable vigente`,
    );
  }
  if (activa && String(activa.etapa_codigo || '').toUpperCase() !== etapa) {
    bloqueos.push(
      `Asignación activa en etapa ${activa.etapa_codigo}; estado vigente en ${etapa}`,
    );
  }

  if (bloqueos.length) return { accion: 'BLOCKED', bloqueos, pasos: [] };

  if (etapa === ETAPA_DESTINO) {
    return {
      accion: 'OK',
      motivo: 'OK — no requiere cambios',
      pasos: [],
      responsableId: Number(ctx.estado.responsable_usuario_id),
    };
  }

  const origenesPermitidos = [ETAPA_ORIGEN, ETAPA_ORIGEN_ALTERNATIVA];
  if (!origenesPermitidos.includes(etapa)) {
    return {
      accion: 'BLOCKED',
      bloqueos: [
        `Etapa actual ${etapa || '—'}; se esperaba ${origenesPermitidos.join(' o ')} o ${ETAPA_DESTINO}`,
      ],
      pasos: [],
    };
  }

  const origenLabel = etapa === ETAPA_ORIGEN_ALTERNATIVA
    ? 'DERIVACION_PAGO (salto histórico pre-F1)'
    : ETAPA_ORIGEN;

  return {
    accion: 'REPAIR',
    pasos: [{
      tipo: 'MIGRAR_ETAPA_PEP',
      motivo: `${origenLabel} → ${ETAPA_DESTINO} conservando Analista CM responsable`,
    }],
    etapaOrigen: etapa,
    responsableId: Number(ctx.estado.responsable_usuario_id),
    responsableUsername: ctx.estado.responsable_username,
  };
}

function imprimirDiagnostico(ctx) {
  const activa = ctx.asignaciones.find((a) => a.activo) || null;
  console.log('--- Diagnóstico ---');
  console.log(`  orden_entrega_id: ${ctx.entrega.orden_entrega_id}`);
  console.log(`  etapa: ${ctx.estado?.etapa_codigo || '—'}`);
  console.log(`  responsable: ${ctx.estado?.responsable_nombre || '—'} (${ctx.estado?.responsable_username || '—'}, id ${ctx.estado?.responsable_usuario_id ?? 'null'})`);
  console.log(`  asignación activa: ${activa?.username || '—'} etapa=${activa?.etapa_codigo || '—'}`);
  console.log(`  observaciones abiertas: ${ctx.obsAbiertas.length}`);
  console.log(`  conformidad: actas=${ctx.conformidad.actas}, firmada_vigente=${ctx.conformidad.firmadas_vigentes}, acta_v=${ctx.conformidad.acta_version}`);
  console.log(`  artefactos: recepciones=${ctx.conformidad.recepciones}, documentos=${ctx.conformidad.documentos}, observaciones=${ctx.conformidad.observaciones}, eventos=${ctx.conformidad.eventos}`);
  if (ctx.e2) {
    console.log(`  E2 (solo lectura): id=${ctx.e2.orden_entrega_id}, etapa=${ctx.e2.etapa_codigo}, responsable=${ctx.e2.username || '—'}`);
  }
}

async function registrarEventoReparacion(client, ctx, previo, nuevo, etapaOrigen) {
  const metadata = JSON.stringify({
    origen: 'REPARACION_HISTORICA_F1_PEP',
    os: OS_NUMERO,
    entrega: ENTREGA_NUMERO,
    orden_entrega_id: ctx.entrega.orden_entrega_id,
    etapa_anterior: etapaOrigen,
    etapa_nueva: ETAPA_DESTINO,
    cambio: 'Migración histórica Presentación → Pagos (Fase 1)',
  });
  await client.query(`
    INSERT INTO entregable_eventos (
      orden_id, orden_entrega_id, requerimiento_id, evento_codigo,
      estado_anterior_codigo, estado_anterior_label,
      estado_nuevo_codigo, estado_nuevo_label,
      etapa_anterior_codigo, etapa_nueva_codigo,
      responsable_anterior_tipo, responsable_anterior_usuario, responsable_anterior_unidad,
      responsable_nuevo_tipo, responsable_nuevo_usuario, responsable_nuevo_unidad,
      ejecutado_por, motivo, metadata_json
    ) VALUES (
      $1,$2,$3,'ENTREGABLE_REPARACION_HISTORICA',
      $4,$5,$6,$7,$8,$9,
      $10,$11,$12,$10,$11,$12,
      $13,$14,$15::jsonb
    )
  `, [
    Number(ctx.orden.orden_id),
    Number(ctx.entrega.orden_entrega_id),
    Number(ctx.orden.requerimiento_id),
    previo.estado_codigo,
    previo.estado_label,
    nuevo.estadoCodigo,
    nuevo.estadoLabel,
    etapaOrigen,
    ETAPA_DESTINO,
    previo.responsable_tipo,
    previo.responsable_usuario_id,
    previo.responsable_unidad,
    REPAIR_SCRIPT,
    `Reparación histórica: ${ETAPA_ORIGEN} → ${ETAPA_DESTINO}`,
    metadata,
  ]);
}

async function aplicarReparacion(ctx, etapaOrigen) {
  const labels = buildEstadoLabels(ETAPA_DESTINO);
  const previo = ctx.estado;
  const responsableId = Number(previo.responsable_usuario_id);
  const snapshotsAntes = { ...ctx.conformidad };
  const origen = String(etapaOrigen || ETAPA_ORIGEN).toUpperCase();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: locked } = await client.query(`
      SELECT * FROM entregable_estado_vigente
      WHERE orden_entrega_id = $1 FOR UPDATE
    `, [ctx.entrega.orden_entrega_id]);
    const vigente = locked[0];
    if (!vigente) throw new Error('Sin entregable_estado_vigente');
    if (String(vigente.etapa_codigo || '').toUpperCase() === ETAPA_DESTINO) {
      await client.query('ROLLBACK');
      return { skipped: true };
    }
    if (String(vigente.etapa_codigo || '').toUpperCase() !== origen) {
      throw new Error(`Etapa concurrente ${vigente.etapa_codigo}; abortando`);
    }

    await client.query(`
      UPDATE entregable_asignaciones
      SET activo = FALSE, cerrado_por = $2, cerrado_at = NOW()
      WHERE orden_entrega_id = $1 AND activo = TRUE
    `, [ctx.entrega.orden_entrega_id, REPAIR_SCRIPT]);

    await client.query(`
      UPDATE entregable_estado_vigente
      SET estado_codigo = $2, estado_label = $3,
          etapa_codigo = $4, etapa_label = $5,
          version = version + 1,
          actualizado_por = $6,
          actualizado_at = NOW(),
          metadata_json = COALESCE(metadata_json, '{}'::jsonb) || $7::jsonb
      WHERE orden_entrega_id = $1
    `, [
      ctx.entrega.orden_entrega_id,
      labels.estadoCodigo,
      labels.estadoLabel,
      labels.etapaCodigo,
      labels.etapaLabel,
      REPAIR_SCRIPT,
      JSON.stringify({ reparacion_historica: 'REPARACION_HISTORICA_F1_PEP' }),
    ]);

    await client.query(`
      INSERT INTO entregable_asignaciones (
        orden_id, orden_entrega_id, requerimiento_id, etapa_codigo,
        usuario_id, unidad_codigo, tipo_responsable, activo,
        asignado_por, motivo, origen_asignacion, metadata_json
      ) VALUES ($1,$2,$3,$4,$5,$6,'PERSONA',TRUE,$7,$8,'reparacion_historica',$9::jsonb)
    `, [
      Number(ctx.orden.orden_id),
      Number(ctx.entrega.orden_entrega_id),
      Number(ctx.orden.requerimiento_id),
      ETAPA_DESTINO,
      responsableId,
      previo.responsable_unidad || 'Analista de Contrataciones',
      REPAIR_SCRIPT,
      `Reparación histórica ${origen} → ${ETAPA_DESTINO}`,
      JSON.stringify({ origen: 'REPARACION_HISTORICA_F1_PEP' }),
    ]);

    await registrarEventoReparacion(client, ctx, previo, labels, origen);

    const { rows: postCounts } = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM entregable_recepciones WHERE orden_entrega_id = $1) AS recepciones,
        (SELECT COUNT(*)::int FROM entregable_recepcion_documentos rd
          JOIN entregable_recepciones er ON er.id = rd.recepcion_id
          WHERE er.orden_entrega_id = $1) AS documentos,
        (SELECT COUNT(*)::int FROM entregable_conformidad_actas WHERE orden_entrega_id = $1) AS actas,
        (SELECT COUNT(*)::int FROM entregable_observaciones WHERE orden_entrega_id = $1) AS observaciones
    `, [ctx.entrega.orden_entrega_id]);

    const post = postCounts[0];
    for (const key of ['recepciones', 'documentos', 'actas', 'observaciones']) {
      if (Number(post[key]) !== Number(snapshotsAntes[key])) {
        throw new Error(`Conteo ${key} cambió (${snapshotsAntes[key]} → ${post[key]}); rollback`);
      }
    }

    await client.query('COMMIT');
    return { skipped: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function verificarPost(ctx, responsableId) {
  const post = await cargarContexto();
  const analistaUser = (await query(`
    SELECT id, username, nombre, rol, cargo, permisos
    FROM usuarios WHERE id = $1 LIMIT 1
  `, [responsableId])).rows[0];

  const analistaCtx = analistaUser ? {
    id: Number(analistaUser.id),
    username: analistaUser.username,
    nombre: analistaUser.nombre,
    cargo: analistaUser.cargo,
    rol: analistaUser.rol,
    permisos: analistaUser.permisos,
  } : null;

  const bandejaPe = analistaCtx
    ? await listarBandejaEntregablesServicios(analistaCtx)
    : [];
  const bandejaPagos = analistaCtx
    ? await listarBandejaPreparacionExpedientePago(analistaCtx)
    : [];
  const filaPe = bandejaPe.find(
    (r) => Number(r.orden_entrega_id) === Number(ctx.entrega.orden_entrega_id),
  );
  const filaPagos = bandejaPagos.find(
    (r) => Number(r.orden_entrega_id) === Number(ctx.entrega.orden_entrega_id),
  );

  let trazabilidad = [];
  if (analistaCtx) {
    try {
      trazabilidad = await listarTrazabilidadEntregable(ctx.entrega.orden_entrega_id, analistaCtx);
    } catch (_) { trazabilidad = []; }
  }

  const e2Before = ctx.e2 ? JSON.stringify(ctx.e2) : null;
  const e2After = post.e2 ? JSON.stringify(post.e2) : null;

  return {
    post,
    filaPe,
    filaPagos,
    trazabilidadCount: trazabilidad.length,
    checks: {
      etapa_pep: String(post.estado?.etapa_codigo || '').toUpperCase() === ETAPA_DESTINO,
      responsable_conservado: Number(post.estado?.responsable_usuario_id) === Number(responsableId),
      en_presentacion: Boolean(filaPe),
      presentacion_solo_consulta: Boolean(filaPe)
        && !(filaPe?.puede_observar_analista_cm || filaPe?.puede_derivar_pago),
      en_pagos: Boolean(filaPagos),
      acciones_pagos: Boolean(filaPagos?.puede_ver_expediente_pago && filaPagos?.puede_ver_trazabilidad_pago),
      trazabilidad_accesible: trazabilidad.length > 0,
      e2_intacto: e2Before === e2After,
      artefactos_intactos: Number(post.conformidad.recepciones) === Number(ctx.conformidad.recepciones)
        && Number(post.conformidad.documentos) === Number(ctx.conformidad.documentos)
        && Number(post.conformidad.actas) === Number(ctx.conformidad.actas)
        && Number(post.conformidad.observaciones) === Number(ctx.conformidad.observaciones),
    },
  };
}

console.log(`\n=== Reparación OS ${OS_NUMERO} E${ENTREGA_NUMERO} — ${ETAPA_ORIGEN} → ${ETAPA_DESTINO} ===`);
console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

const ctx = await cargarContexto();
imprimirDiagnostico(ctx);

const plan = evaluarPlan(ctx);
console.log(`\nEvaluación: ${plan.accion}`);
if (plan.bloqueos?.length) {
  for (const b of plan.bloqueos) console.log(`  ✗ ${b}`);
}
if (plan.pasos?.length) {
  console.log('  Pasos propuestos:');
  for (const p of plan.pasos) console.log(`    - ${p.tipo}: ${p.motivo}`);
}
if (plan.motivo) console.log(`  ${plan.motivo}`);

if (plan.accion === 'REPAIR' && APPLY) {
  const result = await aplicarReparacion(ctx, plan.etapaOrigen || ETAPA_ORIGEN);
  if (result.skipped) {
    console.log('\nConcurrente: ya en destino; no se aplicaron cambios.\n');
  } else {
    console.log('\nReparación aplicada.\n');
  }
}

if (plan.accion === 'REPAIR' && !APPLY) {
  console.log('\nDry-run: se migraría etapa conservando responsable');
  console.log(`  ${plan.etapaOrigen || ETAPA_ORIGEN} → ${ETAPA_DESTINO}`);
  console.log(`  responsable: ${plan.responsableUsername} (id ${plan.responsableId})\n`);
  console.log('Ejecute con --apply para aplicar.\n');
}

if (plan.accion === 'REPAIR' || plan.accion === 'OK') {
  const ver = await verificarPost(ctx, plan.responsableId || Number(ctx.estado?.responsable_usuario_id));
  console.log('Verificación:');
  console.log(`  etapa: ${ver.post.estado?.etapa_codigo || '—'}`);
  console.log(`  responsable: ${ver.post.estado?.responsable_username || '—'}`);
  console.log(`  en bandeja Presentación: ${ver.filaPe ? 'sí' : 'no'}`);
  console.log(`  en bandeja Pagos: ${ver.filaPagos ? 'sí' : 'no'}`);
  console.log(`  eventos trazabilidad: ${ver.trazabilidadCount}`);
  console.log('  checks:');
  for (const [k, v] of Object.entries(ver.checks)) {
    console.log(`    ${v ? '✓' : '✗'} ${k}`);
  }
}

await pool.end();

if (plan.accion === 'BLOCKED') process.exit(1);
if (plan.accion === 'REPAIR' && !APPLY) process.exit(0);

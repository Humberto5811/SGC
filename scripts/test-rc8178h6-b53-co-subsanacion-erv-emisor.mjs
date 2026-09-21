/**
 * RC8.17.8H6-B5.3 — Tras subsanar CO, ERV PERSONA(emisor A), no destinatario B.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { observarConsultasObservaciones } from '../server/lib/consultasObservacionesExpediente.js';
import { SUBMODULO_CONSULTAS_OBSERVACIONES } from '../server/lib/consultasObservacionesBandeja.js';
import { listarCandidatosObservacionDestino } from '../server/lib/candidatosObservacionDestino.js';
import { enrichPayloadForExpediente } from '../server/lib/consultasObservacionLegacyDerivacionEnrich.js';
import { registrarSubsanacionDerivacion } from '../server/lib/trazabilidad.js';
import { registrarSubsanacionObservacion } from '../server/lib/observacionesWorkflow.js';
import { responderConsultaAnalista } from '../server/lib/portalProveedores.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../shared/invitacionesExpedienteCanon.js';
import {
  puedeSubsanar,
  getListaObservaciones,
} from '../shared/observacionesMotor.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };
const fail = (c, m) => { assert.ok(!c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-B5.3 — CO subsanación ERV emisor ===\n');

await runMigrations({ silent: true });

const { rows: uPool } = await query(
  `SELECT id, username FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 6`,
);
const otroId = uPool[2]?.id ?? uPool[1]?.id;

async function erv(rid) {
  const { rows } = await query(
    `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id, responsable_unidad
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [rid],
  );
  return rows[0] || null;
}

async function seedInvitacionesConsulta(ts, analistaId) {
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual,
      sub_modulo_actual, responsable_actual, payload)
    VALUES ('bienes', $1, 'T0001', 'Test H6-B5.3', 'Test', 'CNCC', 'En trámite', 'INVITACIONES',
      'Invitaciones', $2, '{"observaciones":[]}'::jsonb)
    RETURNING id
  `, [`REQ-TEST-H6B53-${ts}`, String(analistaId)]);
  const rid = ins.rows[0].id;

  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, responsable_fuente, version
    ) VALUES ($1, 'INVITACIONES', 'Invitaciones', $2, 'Esperando cotizaciones',
      'PERSONA', $3, 'asignacion_explicita', 1)
  `, [rid, ESTADO_ESPERANDO_COTIZACIONES, analistaId]);

  const prov = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo)
    VALUES ($1, 'Proveedor Test H6-B53', TRUE) RETURNING id
  `, [`20999${String(ts).slice(-6)}`]);
  const proveedorId = prov.rows[0].id;

  const sol = await query(`
    INSERT INTO solicitudes_cotizacion (
      codigo, anio, correlativo, estado, objeto, denominacion,
      consultas_fin, cotizaciones_fin
    ) VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'Sol B5.3',
      NOW() + INTERVAL '7 days', NOW() + INTERVAL '14 days')
    RETURNING id
  `, [`SC-B53-${ts}`, ts % 100000]);
  const sid = sol.rows[0].id;

  await query(
    `INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)`,
    [sid, rid],
  );
  await query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado)
    VALUES ($1, $2, $3, 'ENVIADA')
  `, [sid, rid, proveedorId]);

  const cons = await query(`
    INSERT INTO consultas_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, asunto, consulta, estado, responsable_actual
    ) VALUES ($1, $2, $3, 'Consulta B5.3', 'Texto', 'PENDIENTE', 'Analista')
    RETURNING id
  `, [sid, proveedorId, rid]);
  const consultaId = cons.rows[0].id;

  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'CONSULTA_PROVEEDOR_REGISTRADA',
    usuarioDestinoId: analistaId,
    metadata: {
      client_request_id: `test-h6b53-reg:${rid}:${ts}`,
      via: 'test-h6b53',
      analista_invitaciones_previo_id: analistaId,
      solicitud_id: sid,
    },
    actorRol: 'test-h6b53',
  });

  return { rid, sid, consultaId, proveedorId };
}

async function cleanup(rid, sid, proveedorId) {
  if (!rid) return;
  await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]).catch(() => {});
  await query('DELETE FROM consultas_proveedor WHERE requerimiento_id = $1', [rid]).catch(() => {});
  await query('DELETE FROM invitacion_proveedores WHERE requerimiento_id = $1', [rid]).catch(() => {});
  if (sid) {
    await query('DELETE FROM solicitud_requerimientos WHERE solicitud_id = $1', [sid]).catch(() => {});
    await query('DELETE FROM solicitudes_cotizacion WHERE id = $1', [sid]).catch(() => {});
  }
  if (proveedorId) await query('DELETE FROM proveedores WHERE id = $1', [proveedorId]).catch(() => {});
  await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]).catch(() => {});
  await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]).catch(() => {});
  await query('DELETE FROM requerimientos WHERE id = $1', [rid]).catch(() => {});
}

async function runVariant({ legacy, label }) {
  const ts = Date.now() + (legacy ? 1 : 0);
  console.log(`\n--- Variante ${label} ---\n`);
  const analistaA = uPool[0]?.id || 260;
  const analistaUsername = uPool[0]?.username || 'test-analista-a';
  const { rid, sid, consultaId, proveedorId } = await seedInvitacionesConsulta(ts, analistaA);

  try {
    let cand = await listarCandidatosObservacionDestino({
      requerimientoId: rid,
      destinoSubmodulo: 'Registro de Requerimiento',
    });
    let destSub = 'Registro de Requerimiento';
    let destEtapa = 'REGISTRO';
    if (!cand.recomendado && !(cand.candidatos || []).length) {
      cand = await listarCandidatosObservacionDestino({
        requerimientoId: rid,
        destinoSubmodulo: 'DEC',
      });
      destSub = 'DEC';
      destEtapa = 'DEC';
    }
    const pickB = cand.recomendado || cand.candidatos?.[0];
    ok(pickB?.id != null, `${label} — candidato PERSONA B elegible`);
    const personaB = pickB.id;
    ok(Number(personaB) !== Number(analistaA), `${label} — emisor A distinto de destinatario B`);

    await observarConsultasObservaciones(rid, {
      motivo: `Obs B5.3 ${label}`,
      usuario: analistaUsername,
      origen_submodulo: SUBMODULO_CONSULTAS_OBSERVACIONES,
      destino_submodulo: destSub,
      destino_etapa: destEtapa,
      destino_persona: pickB.nombre,
      usuario_origen_id: analistaA,
      usuario_destino_id: personaB,
      client_request_id: `test-h6b53-obs:${rid}:${ts}`,
    });

    if (legacy) {
      const { rows: pr } = await query('SELECT payload FROM requerimientos WHERE id = $1', [rid]);
      const p = typeof pr[0].payload === 'object'
        ? JSON.parse(JSON.stringify(pr[0].payload))
        : JSON.parse(pr[0].payload || '{}');
      const obs = p.observaciones?.[p.observaciones.length - 1];
      delete obs.usuario_origen_id;
      delete obs.usuarioOrigenId;
      obs.gerente = analistaUsername;
      obs.usuarioOrigen = analistaUsername;
      await query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [rid, JSON.stringify(p)]);
    }

    const pre = await erv(rid);
    ok(pre?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', `${label} — ERV CO pre-subsanar`);
    ok(pre?.estado_codigo === 'OBSERVADO', `${label} — OBSERVADO pre-subsanar`);
    ok(Number(pre?.responsable_usuario_id) === Number(personaB), `${label} — PERSONA(B) pre-subsanar`);

    let payloadRaw = (await query('SELECT payload FROM requerimientos WHERE id = $1', [rid])).rows[0].payload;
    payloadRaw = typeof payloadRaw === 'object' ? JSON.parse(JSON.stringify(payloadRaw)) : JSON.parse(payloadRaw || '{}');
    let payload = await enrichPayloadForExpediente(rid, payloadRaw);
    const obsList = getListaObservaciones({ payload });
    const obs = obsList[obsList.length - 1];

    registrarSubsanacionObservacion(payload, {
      observacion_id: obs.id,
      respuesta: `Subsanación B5.3 ${label}`,
      origen_submodulo: destSub,
      usuario: 'test-b53-b',
      actorUsuarioId: personaB,
    });
    await query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [rid, JSON.stringify(payload)]);

    await registrarSubsanacionDerivacion({
      requerimientoId: rid,
      usuario: 'test-b53-b',
      textoSubsanacion: `Subsanación B5.3 ${label}`,
      origenSubmodulo: destSub,
      destinoSubmodulo: obs.origen_submodulo || SUBMODULO_CONSULTAS_OBSERVACIONES,
      destinoEtapa: 'CONSULTAS_OBSERVACIONES',
      destinoPersona: obs.gerente || analistaUsername,
      observacionId: obs.id,
      usuarioDestinoId: personaB,
    });

    const post = await erv(rid);
    ok(post?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', `${label} — ERV CO post-subsanar`);
    ok(post?.estado_codigo === 'EN_TRAMITE', `${label} — EN_TRAMITE post-subsanar`);
    ok(Number(post?.responsable_usuario_id) === Number(analistaA), `${label} — PERSONA(A) post-subsanar`);
    fail(Number(post?.responsable_usuario_id) === Number(personaB), `${label} — responsable != B`);

    const payloadPost = await enrichPayloadForExpediente(
      rid,
      (await query('SELECT payload FROM requerimientos WHERE id = $1', [rid])).rows[0].payload,
    );
    const obsPost = getListaObservaciones({ payload: payloadPost }).find((o) => String(o.id) === String(obs.id));
    ok(obsPost?.subsanacion && obsPost?.respuesta, `${label} — hilo con subsanación`);
    ok(
      String(obsPost?.subsanacion_destino_submodulo || '').includes('Consultas'),
      `${label} — devuelto a Consultas (emisor)`,
    );

    fail(
      puedeSubsanar(destSub, { payload: payloadPost }, personaB),
      `${label} — B no puede subsanar de nuevo`,
    );
    if (otroId != null) {
      fail(
        puedeSubsanar(destSub, { payload: payloadPost }, otroId),
        `${label} — otro usuario no subsana`,
      );
    }

    const respondida = await responderConsultaAnalista(
      consultaId,
      { respuesta: `Respuesta proveedor ${label}`, publicar: false },
      analistaUsername,
    );
    ok(String(respondida?.estado || '').toUpperCase() === 'RESPONDIDA', `${label} — consulta respondida por A`);

    const fin = await erv(rid);
    ok(fin?.etapa_codigo === 'INVITACIONES', `${label} — retorno INVITACIONES`);
    ok(fin?.estado_codigo === ESTADO_ESPERANDO_COTIZACIONES, `${label} — ESPERANDO_COTIZACIONES`);
    ok(fin?.responsable_tipo === 'UNIDAD', `${label} — UNIDAD Proveedores`);
    ok(fin?.responsable_unidad === UNIDAD_RESPONSABLE_PROVEEDORES, `${label} — Proveedores`);
  } finally {
    await cleanup(rid, sid, proveedorId);
  }
}

await runVariant({ legacy: false, label: 'A (usuario_origen_id)' });
await runVariant({ legacy: true, label: 'B (gerente legacy)' });

console.log('\n✅ RC8.17.8H6-B5.3 OK\n');

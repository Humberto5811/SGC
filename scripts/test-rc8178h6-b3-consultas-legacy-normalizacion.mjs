/**
 * RC8.17.8H6-B3 — Normalización legacy consultas + layout detalle bandeja.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  asegurarExpedienteConsultasCanonico,
  esErvInvitacionesEsperandoProveedores,
} from '../server/lib/consultasLegacyNormalizacion.js';
import { observarConsultasObservaciones } from '../server/lib/consultasObservacionesExpediente.js';
import { SUBMODULO_CONSULTAS_OBSERVACIONES } from '../server/lib/consultasObservacionesBandeja.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../shared/invitacionesExpedienteCanon.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-B3 — Legacy consultas + UX detalle ===\n');

const viewSrc = readFileSync(
  new URL('../src/views/contratacion/consultasObservacionesView.js', import.meta.url),
  'utf8',
);
const flowSrc = readFileSync(
  new URL('../src/utils/consultasObservacionFlow.js', import.meta.url),
  'utf8',
);
ok(!viewSrc.includes('co-exp-modal') || !/co-exp-modal[\s\S]{0,400}modal-dialog-scrollable/.test(viewSrc),
  '7 — detalle co-exp sin modal-dialog-scrollable');
ok(!flowSrc.includes('max-height: min(78vh'), '7 — modal-body sin viewport vertical fijo');
ok(!/\.co-exp-modal \.modal-body[\s\S]*overflow-y:\s*auto/.test(flowSrc),
  '7 — modal-body sin overflow-y interno');
ok(viewSrc.includes('renderActionMenuCell'), '7 — Acciones patrón CM (renderActionMenuCell)');
ok(viewSrc.includes('bindActionMenus'), '7 — bindActionMenus Popper fixed');
ok(!viewSrc.includes('co-exp-table-wrap'), '7 — sin viewport co-exp-table-wrap');

await runMigrations({ silent: true });

const { rows: uPool } = await query(`SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 3`);
const analistaLegacyId = uPool[0]?.id || 260;
const destinoObsId = uPool[1]?.id || analistaLegacyId;
const ts = Date.now();
let ridLegacy = null;
let sidLegacy = null;
let proveedorId = null;
let ridB1 = null;
let ridOtro = null;

async function erv(rid) {
  const { rows } = await query(
    `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id, responsable_unidad
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [rid],
  );
  return rows[0] || null;
}

async function seedLegacyInvitacionesProveedores(analistaAsignadoId) {
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual,
      sub_modulo_actual, responsable_actual, payload)
    VALUES ('bienes', $1, 'T0001', 'Test H6-B3 legacy', 'Test', 'CNCC', $2, 'INVITACIONES',
      'Invitaciones', $3, '{"observaciones":[]}'::jsonb)
    RETURNING id
  `, [`REQ-TEST-H6B3-${ts}`, 'Esperando cotizaciones', UNIDAD_RESPONSABLE_PROVEEDORES]);
  ridLegacy = ins.rows[0].id;

  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version
    ) VALUES ($1, 'INVITACIONES', 'Invitaciones', $2, 'Esperando cotizaciones',
      'UNIDAD', NULL, $3, 'unidad_etapa', 1)
  `, [ridLegacy, ESTADO_ESPERANDO_COTIZACIONES, UNIDAD_RESPONSABLE_PROVEEDORES]);

  await query(`
    INSERT INTO expediente_asignaciones (
      requerimiento_id, usuario_id, etapa_codigo, tipo_responsable, activo, origen_asignacion
    ) VALUES ($1, $2, 'INVITACIONES', 'PERSONA', TRUE, 'test-h6b3-legacy')
  `, [ridLegacy, analistaAsignadoId]);

  const prov = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo)
    VALUES ($1, 'Proveedor H6-B3', TRUE) RETURNING id
  `, [`20998${String(ts).slice(-6)}`]);
  proveedorId = prov.rows[0].id;

  const sol = await query(`
    INSERT INTO solicitudes_cotizacion (codigo, anio, correlativo, estado, objeto, denominacion,
      consultas_fin, cotizaciones_fin)
    VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'Sol H6-B3', NOW() + INTERVAL '7 days', NOW() + INTERVAL '14 days')
    RETURNING id
  `, [`SC-TEST-H6B3-${ts}`, (ts % 100000) + 1]);
  sidLegacy = sol.rows[0].id;

  await query(
    `INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)`,
    [sidLegacy, ridLegacy],
  );
  await query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado)
    VALUES ($1, $2, $3, 'ENVIADA')
  `, [sidLegacy, ridLegacy, proveedorId]);

  await query(`
    INSERT INTO consultas_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, asunto, consulta, estado
    ) VALUES ($1, $2, $3, 'Consulta legacy', 'Texto pre-H6-B1', 'PENDIENTE')
  `, [sidLegacy, proveedorId, ridLegacy]);
}

async function countNormEvents(rid) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM workflow_eventos
     WHERE expediente_id = $1 AND evento_codigo = 'CONSULTA_PROVEEDOR_REGISTRADA'`,
    [rid],
  );
  return rows[0]?.n || 0;
}

try {
  await seedLegacyInvitacionesProveedores(analistaLegacyId);
  const ev0 = await erv(ridLegacy);
  ok(esErvInvitacionesEsperandoProveedores(ev0), '1 — ERV legacy Invitaciones/Proveedores');

  const norm1 = await asegurarExpedienteConsultasCanonico(ridLegacy, { via: 'test-h6b3' });
  ok(norm1.aplicada === true, '1 — normalización aplicada');
  ok(Number(norm1.analista_id) === Number(analistaLegacyId), '1 — analista desde asignación INVITACIONES');
  const ev1 = await erv(ridLegacy);
  ok(ev1?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', '1 — etapa CO');
  ok(ev1?.estado_codigo === 'EN_TRAMITE', '1 — EN_TRAMITE');
  ok(Number(ev1?.responsable_usuario_id) === Number(analistaLegacyId), '1 — PERSONA analista histórico');

  const { rows: wfNorm } = await query(
    `SELECT metadata FROM workflow_eventos
     WHERE expediente_id = $1 AND evento_codigo = 'CONSULTA_PROVEEDOR_REGISTRADA'
     ORDER BY id DESC LIMIT 1`,
    [ridLegacy],
  );
  const wfMeta = wfNorm[0]?.metadata || {};
  ok(wfMeta.normalizacion_legacy === true, '1 — metadata normalizacion_legacy');

  const eventsAfterFirst = await countNormEvents(ridLegacy);
  const norm2 = await asegurarExpedienteConsultasCanonico(ridLegacy, { via: 'test-h6b3-repeat' });
  ok(norm2.aplicada === false && norm2.razon === 'ya_en_consultas', '2 — segunda pasada no reaplica');
  ok(await countNormEvents(ridLegacy) === eventsAfterFirst, '2 — sin evento duplicado');

  const { listarCandidatosObservacionDestino } = await import('../server/lib/candidatosObservacionDestino.js');
  let candObs = await listarCandidatosObservacionDestino({
    requerimientoId: ridLegacy,
    destinoSubmodulo: 'Registro de Requerimiento',
  });
  let obsSub = 'Registro de Requerimiento';
  let pickObs = candObs.recomendado || candObs.candidatos?.[0];
  if (!pickObs?.id) {
    candObs = await listarCandidatosObservacionDestino({
      requerimientoId: ridLegacy,
      destinoSubmodulo: 'DEC',
    });
    pickObs = candObs.recomendado || candObs.candidatos?.[0];
    obsSub = 'DEC';
  }
  ok(pickObs?.id != null, '3 — candidato elegible para observar');
  await observarConsultasObservaciones(ridLegacy, {
    motivo: 'Observación post-normalización legacy',
    usuario: 'test-h6b3',
    destino_submodulo: obsSub,
    destino_persona: pickObs.nombre,
    usuario_destino_id: pickObs.id,
    origen_submodulo: SUBMODULO_CONSULTAS_OBSERVACIONES,
    client_request_id: `test-h6b3-obs:${ridLegacy}:${ts}`,
  });
  const evObs = await erv(ridLegacy);
  ok(evObs?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', '3 — observar permanece CO');
  ok(evObs?.estado_codigo === 'OBSERVADO', '3 — OBSERVADO destinatario');
  ok(Number(evObs?.responsable_usuario_id) === Number(pickObs.id), '3 — PERSONA destino');

  // 4 — flujo B1 (ya en CO) no normaliza
  const insB1 = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual,
      sub_modulo_actual, responsable_actual, payload)
    VALUES ('bienes', $1, 'T0001', 'Test H6-B3 B1', 'Test', 'CNCC', 'En trámite', 'CONSULTAS_OBSERVACIONES',
      'Consultas y Observaciones', $2, '{"observaciones":[]}'::jsonb)
    RETURNING id
  `, [`REQ-TEST-H6B3-B1-${ts}`, String(analistaLegacyId)]);
  ridB1 = insB1.rows[0].id;
  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version
    ) VALUES ($1, 'CONSULTAS_OBSERVACIONES', 'Consultas y Observaciones', 'EN_TRAMITE', 'En trámite',
      'PERSONA', $2, 'Consultas y Observaciones', 'asignacion_explicita', 1)
  `, [ridB1, analistaLegacyId]);
  await query(`
    INSERT INTO consultas_proveedor (solicitud_id, proveedor_id, requerimiento_id, asunto, consulta, estado)
    SELECT $1, $2, $3, 'x', 'y', 'PENDIENTE'
  `, [sidLegacy, proveedorId, ridB1]);
  const normB1 = await asegurarExpedienteConsultasCanonico(ridB1, { via: 'test-h6b3-b1' });
  ok(normB1.aplicada === false && normB1.razon === 'ya_en_consultas', '4 — CO existente no normaliza');

  // 5 — otro ERV (INVITACIONES EN_TRAMITE PERSONA) no normaliza
  const insO = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual,
      sub_modulo_actual, responsable_actual, payload)
    VALUES ('bienes', $1, 'T0001', 'Test H6-B3 otro', 'Test', 'CNCC', 'En trámite', 'INVITACIONES',
      'Invitaciones', $2, '{"observaciones":[]}'::jsonb)
    RETURNING id
  `, [`REQ-TEST-H6B3-OTRO-${ts}`, String(analistaLegacyId)]);
  ridOtro = insO.rows[0].id;
  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version
    ) VALUES ($1, 'INVITACIONES', 'Invitaciones', 'EN_TRAMITE', 'En trámite',
      'PERSONA', $2, NULL, 'asignacion_explicita', 1)
  `, [ridOtro, analistaLegacyId]);
  await query(`
    INSERT INTO consultas_proveedor (solicitud_id, proveedor_id, requerimiento_id, asunto, consulta, estado)
    VALUES ($1, $2, $3, 'x', 'y', 'PENDIENTE')
  `, [sidLegacy, proveedorId, ridOtro]);
  const normOtro = await asegurarExpedienteConsultasCanonico(ridOtro, { via: 'test-h6b3-otro' });
  ok(normOtro.aplicada === false && normOtro.razon === 'erv_no_legacy', '5 — no normaliza otros ERV');

  console.log('\nOK H6-B3\n');
} finally {
  const cleanup = async (rid) => {
    if (!rid) return;
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM consultas_proveedor WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM requerimientos WHERE id = $1', [rid]).catch(() => {});
  };
  await cleanup(ridLegacy);
  await cleanup(ridB1);
  await cleanup(ridOtro);
  if (sidLegacy) {
    await query('DELETE FROM invitacion_proveedores WHERE solicitud_id = $1', [sidLegacy]).catch(() => {});
    await query('DELETE FROM solicitud_requerimientos WHERE solicitud_id = $1', [sidLegacy]).catch(() => {});
    await query('DELETE FROM solicitudes_cotizacion WHERE id = $1', [sidLegacy]).catch(() => {});
  }
  if (proveedorId) {
    await query('DELETE FROM proveedores WHERE id = $1', [proveedorId]).catch(() => {});
  }
}

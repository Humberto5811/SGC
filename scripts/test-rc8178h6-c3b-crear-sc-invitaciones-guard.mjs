/**
 * RC8.17.8H6-C3-B — Guardas crearSolicitudCotizacion + atomicidad + reinvitación canónica.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  crearSolicitudCotizacion,
  validarRequerimientosElegiblesNuevaSolicitudCotizacion,
} from '../server/lib/invitaciones.js';
import { resolverEventoDerivarHaciaInvitaciones } from '../server/lib/actosPreparatorios.js';
import { ESTADO_ESPERANDO_COTIZACIONES } from '../shared/invitacionesExpedienteCanon.js';

const ts = Date.now();
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

function scBody(requerimientoIds) {
  const t0 = Date.now();
  const t1 = t0 + 7 * 86400000;
  const t2 = t0 + 30 * 86400000;
  return {
    requerimiento_ids: requerimientoIds,
    tipo_evaluacion: 'Precio más bajo',
    consultas_inicio: new Date(t0).toISOString(),
    consultas_fin: new Date(t1).toISOString(),
    cotizaciones_inicio: new Date(t0).toISOString(),
    cotizaciones_fin: new Date(t2).toISOString(),
  };
}

async function countScLinks(requerimientoId) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS n FROM solicitud_requerimientos WHERE requerimiento_id = $1',
    [requerimientoId],
  );
  return rows[0]?.n || 0;
}

async function seedReq({ suffix, etapaErv, estadoActual, withSc = false, scEstado = 'PUBLICADA' }) {
  const codigoReq = `REQ-C3B-${ts}-${suffix}`;
  const insReq = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'Test C3-B crear SC', 'Area', 'CNCC', 'Esperando cotizaciones', $2, '{}'::jsonb)
    RETURNING id, codigo
  `, [codigoReq, estadoActual || etapaErv]);
  const rid = insReq.rows[0].id;

  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version, metadata_json
    ) VALUES ($1, $2, $2, $3, 'En trámite',
      'PERSONA', (SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 1),
      'Invitaciones', 'asignacion_explicita', 1, '{}'::jsonb)
  `, [rid, etapaErv, etapaErv === 'RECEPCION_COTIZACIONES' ? 'EN_TRAMITE' : ESTADO_ESPERANDO_COTIZACIONES]);

  let sid = null;
  if (withSc) {
    const insSc = await query(`
      INSERT INTO solicitudes_cotizacion (
        codigo, anio, correlativo, estado, objeto, denominacion, tipo,
        consultas_fin, cotizaciones_fin, tipo_evaluacion
      ) VALUES ($1, 2026, $2, $3, 'Obj', 'SC previa', 'Bienes',
        NOW() + INTERVAL '7 days', NOW() + INTERVAL '30 days', 'Precio más bajo')
      RETURNING id
    `, [`SC-C3B-PREV-${ts}-${suffix}`, (ts + suffix.length) % 100000, scEstado]);
    sid = insSc.rows[0].id;
    await query(
      'INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)',
      [sid, rid],
    );
  }
  return { rid, sid, codigo: insReq.rows[0].codigo };
}

async function run() {
  await runMigrations();
  console.log('\n=== RC8.17.8H6-C3-B — crearSolicitudCotizacion guardas ===\n');

  const reinv = resolverEventoDerivarHaciaInvitaciones('INVITACIONES');
  ok(reinv.evento === 'COORDINACION_CM_ASIGNADA', 'reinvitación/reasignación I→I usa ASIGNADA, no APROBADA');
  ok(reinv.evento !== 'COORDINACION_CM_APROBADA', 'reinvitación canónica no dispara CM_APROBADA');

  const recep = await seedReq({
    suffix: 'recep',
    etapaErv: 'RECEPCION_COTIZACIONES',
    estadoActual: 'RECEPCION_COTIZACIONES',
    withSc: true,
  });
  try {
    await validarRequerimientosElegiblesNuevaSolicitudCotizacion([recep.rid]);
    assert.fail('debe rechazar REQ en RECEPCION');
  } catch (e) {
    ok(e.code === 'REQUERIMIENTO_ETAPA_NO_ELEGIBLE_SC', 'A1 REQ RECEPCION no elegible');
  }
  const linksRecep = await countScLinks(recep.rid);
  ok(linksRecep === 1, 'A2 SC previa intacta (solo una)');

  const cm = await seedReq({
    suffix: 'cm',
    etapaErv: 'COORDINACION_CM',
    estadoActual: 'COORDINACION_CM',
  });
  try {
    await validarRequerimientosElegiblesNuevaSolicitudCotizacion([cm.rid]);
    assert.fail('debe rechazar REQ en COORDINACION_CM');
  } catch (e) {
    ok(e.code === 'REQUERIMIENTO_ETAPA_NO_ELEGIBLE_SC', 'A3 CM debe derivarse vía Actos, no SC directa');
  }

  const invConSc = await seedReq({
    suffix: 'inv-sc',
    etapaErv: 'INVITACIONES',
    estadoActual: 'INVITACIONES',
    withSc: true,
  });
  try {
    await crearSolicitudCotizacion(scBody([invConSc.rid]), 'test-c3b');
    assert.fail('debe rechazar REQ con SC vigente');
  } catch (e) {
    ok(e.code === 'REQUERIMIENTO_SC_VIGENTE', 'B1 REQ con SC existente rechazado');
  }
  ok(await countScLinks(invConSc.rid) === 1, 'B2 no segunda SC parcial');

  const invOk = await seedReq({
    suffix: 'inv-ok',
    etapaErv: 'INVITACIONES',
    estadoActual: 'INVITACIONES',
  });
  const beforeOk = await countScLinks(invOk.rid);
  const solicitud = await crearSolicitudCotizacion(scBody([invOk.rid]), 'test-c3b');
  ok(solicitud?.codigo?.startsWith('SC-'), 'C1 creación válida desde INVITACIONES');
  ok(await countScLinks(invOk.rid) === beforeOk + 1, 'C2 vínculo solicitud_requerimientos creado');
  const { rows: evAfter } = await query(
    'SELECT etapa_codigo FROM expediente_estado_vigente WHERE requerimiento_id = $1',
    [invOk.rid],
  );
  ok(String(evAfter[0]?.etapa_codigo).toUpperCase() === 'INVITACIONES', 'C3 ERV no retrocede tras crear SC');

  const invBatch = await seedReq({ suffix: 'batch-good', etapaErv: 'INVITACIONES', estadoActual: 'INVITACIONES' });
  const beforeBatch = await query('SELECT COUNT(*)::int AS n FROM solicitudes_cotizacion');
  try {
    await crearSolicitudCotizacion(scBody([invBatch.rid, recep.rid]), 'test-c3b');
    assert.fail('batch mixto debe fallar');
  } catch (e) {
    ok(e.code === 'REQUERIMIENTO_ETAPA_NO_ELEGIBLE_SC', 'D1 fallo en batch mixto');
  }
  ok(await countScLinks(invBatch.rid) === 0, 'D2 REQ válido del batch sin vínculo parcial');
  const afterBatch = await query('SELECT COUNT(*)::int AS n FROM solicitudes_cotizacion');
  ok(afterBatch.rows[0].n === beforeBatch.rows[0].n, 'D3 ninguna SC nueva en fallo atómico');

  console.log('\n=== RC8.17.8H6-C3-B OK ===\n');
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

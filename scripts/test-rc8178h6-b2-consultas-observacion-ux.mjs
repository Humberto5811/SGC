/**
 * RC8.17.8H6-B2 — Candidatos Consultas, motor observación, UX modal.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import {
  listarCandidatosObservacionDestino,
  listarCandidatosSubsanacionDestino,
  mapDestinoSubmoduloAEtapaSubsanacion,
} from '../server/lib/candidatosObservacionDestino.js';
import { normalizeModuloKey, puedeSubsanar } from '../shared/observacionesMotor.js';
import { SUBMODULO_CONSULTAS_OBSERVACIONES } from '../server/lib/consultasObservacionesBandeja.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../shared/invitacionesExpedienteCanon.js';
import { listarConsultasBandeja, responderConsultaAnalista } from '../server/lib/portalProveedores.js';
import { observarConsultasObservaciones } from '../server/lib/consultasObservacionesExpediente.js';
import { applyBandejaExpedienteContrato } from '../server/lib/bandejaExpedienteContrato.js';
import { enrichEstadoResponsableForBandeja } from '../server/lib/enrichEstadoResponsable.js';
import { enrichRequerimientoRow } from '../server/lib/trazabilidad.js';
import { consolidarExpedientesConsultas } from '../src/utils/consultasObservacionesUtils.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-B2 — Consultas observación / UX ===\n');

// a) Motor: Consultas no se confunde con Cotizaciones
ok(
  normalizeModuloKey('Consultas y Observaciones') === 'CONSULTAS_OBSERVACIONES',
  'a — normalizeModuloKey Consultas → CONSULTAS_OBSERVACIONES',
);
ok(
  normalizeModuloKey('Recepción de Cotizaciones') === 'COTIZACIONES',
  'a — Recepción de Cotizaciones sigue siendo COTIZACIONES',
);

const viewSrc = readFileSync(
  new URL('../src/views/contratacion/consultasObservacionesView.js', import.meta.url),
  'utf8',
);
const flowSrc = readFileSync(
  new URL('../src/utils/consultasObservacionFlow.js', import.meta.url),
  'utf8',
);
ok(!viewSrc.includes('requerimientos-especial/observacion-destino'), 'a — FE sin ruta 404 legacy');
ok(flowSrc.includes('candidatos-observacion-destino'), 'a — FE usa ruta portal-analista candidatos');
ok(viewSrc.includes('co-exp-modal'), 'h — modal ampliado co-exp-modal');
ok(viewSrc.includes('bindActionMenus'), 'h — bindActionMenus (Popper fixed, patrón CM)');
ok(viewSrc.includes('renderActionMenuCell'), 'h — renderActionMenuCell en detalle SC');

await runMigrations({ silent: true });

const { rows: uPool } = await query(`SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 2`);
const analistaId = uPool[0]?.id || 260;
const destinoId = uPool[1]?.id || analistaId;
const ts = Date.now();
let rid = null;
let sid = null;
let consultaId = null;
let proveedorId = null;

async function erv() {
  const { rows } = await query(
    `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id,
            responsable_unidad, metadata_json
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [rid],
  );
  const row = rows[0] || null;
  if (row?.metadata_json) {
    try {
      row.metadata = typeof row.metadata_json === 'object'
        ? row.metadata_json
        : JSON.parse(row.metadata_json || '{}');
    } catch (_) {
      row.metadata = {};
    }
  }
  return row;
}

async function seedConsultasExpedienteCompleto() {
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual,
      sub_modulo_actual, responsable_actual, payload)
    VALUES ('bienes', $1, 'T0001', 'Test H6-B2', 'Test', 'CNCC', 'En trámite', 'INVITACIONES',
      'Invitaciones', $2, '{"observaciones":[]}'::jsonb)
    RETURNING id
  `, [`REQ-TEST-H6B2-${ts}`, UNIDAD_RESPONSABLE_PROVEEDORES]);
  rid = ins.rows[0].id;

  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version
    ) VALUES ($1, 'INVITACIONES', 'Invitaciones', $2, 'Esperando cotizaciones',
      'PERSONA', $3, NULL, 'asignacion_explicita', 1)
  `, [rid, ESTADO_ESPERANDO_COTIZACIONES, analistaId]);
  await query(`
    INSERT INTO expediente_asignaciones (
      requerimiento_id, usuario_id, etapa_codigo, tipo_responsable, activo, origen_asignacion
    ) VALUES ($1, $2, 'INVITACIONES', 'PERSONA', TRUE, 'test-h6b2')
  `, [rid, analistaId]);

  const prov = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo)
    VALUES ($1, 'Proveedor Test H6-B2', TRUE)
    RETURNING id
  `, [`20999${String(ts).slice(-6)}`]);
  proveedorId = prov.rows[0].id;

  const sol = await query(`
    INSERT INTO solicitudes_cotizacion (
      codigo, anio, correlativo, estado, objeto, denominacion,
      consultas_fin, cotizaciones_fin
    ) VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj test', 'Sol test H6-B2',
      NOW() + INTERVAL '7 days', NOW() + INTERVAL '14 days')
    RETURNING id
  `, [`SC-TEST-H6B2-${ts}`, ts % 100000]);
  sid = sol.rows[0].id;

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
    ) VALUES ($1, $2, $3, 'Consulta test', 'Texto consulta H6-B2', 'PENDIENTE', 'Analista CM')
    RETURNING id
  `, [sid, proveedorId, rid]);
  consultaId = cons.rows[0].id;

  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'CONSULTA_PROVEEDOR_REGISTRADA',
    usuarioDestinoId: analistaId,
    metadata: {
      client_request_id: `test-h6b2-reg:${rid}:${ts}`,
      via: 'test-h6b2',
      analista_invitaciones_previo_id: analistaId,
      solicitud_id: sid,
    },
    actorRol: 'test-h6b2',
  });
}

try {
  await seedConsultasExpedienteCompleto();

  const candObs = await listarCandidatosObservacionDestino({
    requerimientoId: rid,
    destinoSubmodulo: 'Registro de Requerimiento',
    search: '',
  });
  ok(candObs.soportado === true, 'a — candidatos observación Registro soportado');
  ok(Array.isArray(candObs.candidatos) || candObs.recomendado, 'a — candidatos observación responde datos');

  let candReg = await listarCandidatosObservacionDestino({
    requerimientoId: rid,
    destinoSubmodulo: 'Registro de Requerimiento',
  });
  let destSub = 'Registro de Requerimiento';
  let destEtapa = 'REGISTRO';
  let pick = candReg.recomendado || candReg.candidatos?.[0];
  if (!pick?.id) {
    candReg = await listarCandidatosObservacionDestino({
      requerimientoId: rid,
      destinoSubmodulo: 'DEC',
    });
    pick = candReg.recomendado || candReg.candidatos?.[0];
    destSub = 'DEC';
    destEtapa = 'DEC';
  }
  ok(pick?.id != null, 'b0 — candidato elegible con id');
  await observarConsultasObservaciones(rid, {
    motivo: 'Derivación interna test B2',
    usuario: 'test-h6b2',
    destino_submodulo: destSub,
    destino_etapa: destEtapa,
    destino_persona: pick.nombre,
    usuario_destino_id: pick.id,
    origen_submodulo: SUBMODULO_CONSULTAS_OBSERVACIONES,
    client_request_id: `test-h6b2-obs:${rid}:${ts}`,
  });

  const postObs = await erv();
  ok(postObs?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', 'b — observación etapa CO');
  ok(postObs?.estado_codigo === 'OBSERVADO', 'b — observación OBSERVADO');
  ok(Number(postObs?.responsable_usuario_id) === Number(pick.id), 'b — persona destino ERV');

  const bandejaRows = await listarConsultasBandeja({});
  const hit = bandejaRows.find((r) => Number(r.requerimiento_id) === Number(rid));
  ok(hit != null, 'c — REQ visible en listarConsultasBandeja (endpoint bandeja)');
  await enrichEstadoResponsableForBandeja([hit], 'requerimiento_id');
  const contrato = applyBandejaExpedienteContrato(hit);
  ok(
    contrato.bandeja_contrato?.etapa?.codigo === 'CONSULTAS_OBSERVACIONES',
    'c — bandeja etapa CONSULTAS_OBSERVACIONES',
  );
  ok(contrato.bandeja_contrato?.estado?.codigo === 'OBSERVADO', 'c — bandeja estado OBSERVADO');
  ok(
    contrato.bandeja_contrato?.responsable?.tipo === 'PERSONA'
      && Number(contrato.bandeja_contrato?.responsable?.usuarioId) === Number(pick.id),
    'c — bandeja PERSONA(destinatario)',
  );
  const expCons = consolidarExpedientesConsultas([hit])[0];
  ok(expCons?.requerimiento_id === rid, 'c — consolidado mantiene requerimiento_id');

  const { rows: reqRaw } = await query('SELECT * FROM requerimientos WHERE id = $1', [rid]);
  const reqRow = enrichRequerimientoRow(reqRaw[0]);
  ok(
    puedeSubsanar(SUBMODULO_CONSULTAS_OBSERVACIONES, reqRow, pick.id),
    'c — puedeSubsanar=true destinatario',
  );
  ok(
    puedeSubsanar(destSub, reqRow, pick.id),
    'c — destinatario puede subsanar desde submódulo operativo',
  );

  ok(
    mapDestinoSubmoduloAEtapaSubsanacion('Consultas y Observaciones') === 'CONSULTAS_OBSERVACIONES',
    'e — retorno subsanación mapea a etapa CO',
  );

  const payloadObs = typeof reqRow.payload === 'object'
    ? reqRow.payload
    : JSON.parse(reqRow.payload || '{}');
  const obsId = payloadObs.observaciones?.[0]?.id;
  ok(obsId, 'd — observación en payload');

  const candSub = await listarCandidatosSubsanacionDestino({
    requerimientoId: rid,
    destinoSubmodulo: 'Consultas y Observaciones',
    observacionId: obsId,
  });
  ok(candSub.soportado === true, 'e — candidatos subsanación CO soportados');

  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'OBSERVACION_SUBSANADA',
    usuarioDestinoId: analistaId,
    metadata: {
      client_request_id: `test-h6b2-sub:${rid}:${ts}`,
      destino_submodulo: 'Consultas y Observaciones',
      destino_etapa: 'CONSULTAS_OBSERVACIONES',
      observacion_id: obsId,
    },
    actorRol: 'test-h6b2',
  });
  const postSub = await erv();
  ok(postSub?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', 'e — subsanación retorno CO');
  ok(postSub?.estado_codigo === 'EN_TRAMITE', 'e — subsanación EN_TRAMITE');
  ok(Number(postSub?.responsable_usuario_id) === Number(analistaId), 'e — analista emisor');

  const { rows: wfReg } = await query(
    `SELECT metadata FROM workflow_eventos
     WHERE expediente_id = $1 AND evento_codigo = 'CONSULTA_PROVEEDOR_REGISTRADA'
     ORDER BY id DESC LIMIT 1`,
    [rid],
  );
  let wfRegMeta = {};
  try {
    wfRegMeta = typeof wfReg[0]?.metadata === 'object'
      ? wfReg[0].metadata
      : JSON.parse(wfReg[0]?.metadata || '{}');
  } catch (_) { wfRegMeta = {}; }
  ok(
    Number(wfRegMeta.analista_invitaciones_previo_id) === Number(analistaId),
    'f — analista previo trazado al registrar consulta',
  );

  const respondida = await responderConsultaAnalista(
    consultaId,
    { respuesta: 'Respuesta interna test H6-B2', publicar: false },
    'test-h6b2-analista',
  );
  ok(String(respondida?.estado || '').toUpperCase() === 'RESPONDIDA', 'f — consulta respondida');
  const { rows: pend } = await query(
    `SELECT COUNT(*)::int AS n FROM consultas_proveedor
     WHERE solicitud_id = $1 AND UPPER(estado) = 'PENDIENTE'`,
    [sid],
  );
  ok((pend[0]?.n || 0) === 0, 'f — sin consultas pendientes en solicitud');

  const postResp = await erv();
  ok(postResp?.etapa_codigo === 'INVITACIONES', 'f — retorno INVITACIONES');
  ok(postResp?.estado_codigo === ESTADO_ESPERANDO_COTIZACIONES, 'f — ESPERANDO_COTIZACIONES');
  ok(postResp?.responsable_tipo === 'UNIDAD', 'f — UNIDAD Proveedores');
  ok(postResp?.responsable_unidad === UNIDAD_RESPONSABLE_PROVEEDORES, 'f — Proveedores');

  const metaPost = postResp.metadata || {};
  ok(
    Number(metaPost.analista_invitaciones_previo_id) === Number(analistaId),
    'f — analista previo persiste en metadata ERV',
  );

  const { rows: wf } = await query(
    `SELECT metadata FROM workflow_eventos
     WHERE expediente_id = $1 AND evento_codigo = 'CONSULTA_PROVEEDOR_ABSUELTA'
     ORDER BY id DESC LIMIT 1`,
    [rid],
  );
  let wfMeta = {};
  try {
    wfMeta = typeof wf[0]?.metadata === 'object'
      ? wf[0].metadata
      : JSON.parse(wf[0]?.metadata || '{}');
  } catch (_) { wfMeta = {}; }
  ok(
    Number(wfMeta.analista_invitaciones_previo_id) === Number(analistaId),
    'f — analista previo en trazabilidad workflow',
  );
  ok(wfMeta.via === 'responderConsultaAnalista', 'f — absolución vía responderConsultaAnalista');

  console.log('\nOK H6-B2\n');
} finally {
  if (rid) {
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM consultas_proveedor WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM invitacion_proveedores WHERE requerimiento_id = $1', [rid]).catch(() => {});
    if (sid) {
      await query('DELETE FROM solicitud_requerimientos WHERE solicitud_id = $1', [sid]).catch(() => {});
      await query('DELETE FROM solicitudes_cotizacion WHERE id = $1', [sid]).catch(() => {});
    }
    if (proveedorId) {
      await query('DELETE FROM proveedores WHERE id = $1', [proveedorId]).catch(() => {});
    }
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM requerimientos WHERE id = $1', [rid]).catch(() => {});
  }
}

/**
 * RC8.17.8H6-C3-C — REINVITACION_ENVIADA desde RECEPCION_COTIZACIONES (misma SC, ERV preservada).
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { getTransition } from '../shared/workflow/transiciones.js';
import {
  validarRequerimientosElegiblesNuevaSolicitudCotizacion,
} from '../server/lib/invitaciones.js';
import {
  applyErvExpedientePostEnvioInvitacion,
  assertErvRecepcionPreservableForReinvitacion,
} from '../server/lib/invitacionesExpedienteEstado.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../shared/invitacionesExpedienteCanon.js';

const ts = Date.now();
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-C3-C — Reinvitación en Recepción ===\n');

ok(
  getTransition({
    tipoContratacion: 'BIEN',
    etapaOrigen: 'RECEPCION_COTIZACIONES',
    eventoCodigo: 'REINVITACION_ENVIADA',
  })?.etapa_destino === 'RECEPCION_COTIZACIONES',
  'A1 matriz BIEN RC→RC REINVITACION_ENVIADA',
);
ok(
  !getTransition({
    tipoContratacion: 'BIEN',
    etapaOrigen: 'RECEPCION_COTIZACIONES',
    eventoCodigo: 'INVITACION_ENVIADA',
  }),
  'A1b RC→RC solo REINVITACION_ENVIADA (no INVITACION_ENVIADA)',
);

const mockPrev = {
  etapa_codigo: 'RECEPCION_COTIZACIONES',
  etapa_label: 'Recepción de Cotizaciones',
  estado_codigo: 'ESTADO_RC_PRESERVAR',
  estado_label: 'Label RC exacto',
  responsable_tipo: 'PERSONA',
  responsable_usuario_id: 42,
  responsable_unidad: 'Unidad RC exacta',
  responsable_fuente: 'fuente_previa',
};
const applied = applyErvExpedientePostEnvioInvitacion({ estadoVigentePrevio: mockPrev });
ok(applied.labels.etapaCodigo === 'RECEPCION_COTIZACIONES', 'A2 etapa exacta');
ok(applied.labels.estadoCodigo === 'ESTADO_RC_PRESERVAR', 'A3 estado exacto (sin fallback EN_TRAMITE)');
ok(applied.labels.estadoLabel === 'Label RC exacto', 'A4 estado_label exacto');
ok(
  applied.resp.responsableTipo === 'PERSONA' && applied.resp.responsableUsuarioId === 42,
  'A5 PERSONA + usuario exactos',
);
ok(applied.resp.responsableUnidad === 'Unidad RC exacta', 'A6 responsable_unidad exacta');
ok(applied.resp.responsableFuente === 'fuente_previa', 'A7 responsable_fuente exacta');
ok(!applied.metaPatch.sync_legacy_estado_negocio, 'A8 no ESPERANDO_COTIZACIONES legacy');

try {
  applyErvExpedientePostEnvioInvitacion({
    labels: { etapaCodigo: 'RECEPCION_COTIZACIONES' },
    estadoVigentePrevio: {
      etapa_codigo: 'RECEPCION_COTIZACIONES',
      estado_codigo: 'EN_TRAMITE',
      responsable_tipo: 'PERSONA',
    },
  });
  assert.fail('debe fallar sin responsable_usuario_id');
} catch (e) {
  ok(e.code === 'REINVITACION_RECEPCION_ERV_INCOMPLETO' && e.status === 409, 'A9 ERV RC incompleto rechazado');
}

const invApplied = applyErvExpedientePostEnvioInvitacion({
  estadoVigentePrevio: { etapa_codigo: 'INVITACIONES', estado_codigo: 'EN_TRAMITE' },
});
ok(invApplied.labels.etapaCodigo === 'INVITACIONES', 'A10 Invitaciones sin cambio');
ok(invApplied.labels.estadoCodigo === ESTADO_ESPERANDO_COTIZACIONES, 'A11 ESPERANDO_COTIZACIONES en I');
ok(invApplied.resp.responsableUnidad === UNIDAD_RESPONSABLE_PROVEEDORES, 'A12 UNIDAD Proveedores en I');

await runMigrations();

const { rows: uRows } = await query('SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 1');
const analistaId = uRows[0]?.id || 260;

const insReq = await query(`
  INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
  VALUES ('bienes', $1, 'Test C3-C reinv RC', 'Area', 'CNCC', 'Label RC exacto', 'RECEPCION_COTIZACIONES', '{}'::jsonb)
  RETURNING id
`, [`REQ-C3C-${ts}`]);
const rid = insReq.rows[0].id;

await query(`
  INSERT INTO expediente_estado_vigente (
    requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
    responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version, metadata_json
  ) VALUES ($1, 'RECEPCION_COTIZACIONES', 'Recepción de Cotizaciones', 'ESTADO_RC_PRESERVAR', 'Label RC exacto',
    'PERSONA', $2, 'Unidad RC exacta', 'fuente_previa', 1, $3::jsonb)
`, [rid, analistaId, JSON.stringify({ analista_invitaciones_previo_id: analistaId })]);

const insSc = await query(`
  INSERT INTO solicitudes_cotizacion (
    codigo, anio, correlativo, estado, objeto, denominacion, tipo, contador_envios,
    consultas_fin, cotizaciones_fin, tipo_evaluacion
  ) VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'SC C3-C', 'Bienes', 2,
    NOW() + INTERVAL '7 days', NOW() + INTERVAL '30 days', 'Precio más bajo')
  RETURNING id
`, [`SC-C3C-${ts}`, (ts % 100000)]);
const sid = insSc.rows[0].id;
await query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);

try {
  await validarRequerimientosElegiblesNuevaSolicitudCotizacion([rid]);
  assert.fail('B8 debe bloquear segunda SC');
} catch (e) {
  ok(e.code === 'REQUERIMIENTO_ETAPA_NO_ELEGIBLE_SC', 'B1 B8 intacto: no segunda SC en RC');
}

await transicionarExpediente({
  requerimientoId: rid,
  evento: 'REINVITACION_ENVIADA',
  unidadDestino: UNIDAD_RESPONSABLE_PROVEEDORES,
  motivo: 'Reinvitación proveedor pendiente (test C3-C)',
  metadata: {
    client_request_id: `test-c3c-reinv:${rid}:${ts}`,
    solicitud_id: sid,
  },
  actorRol: 'test-c3c',
});

const { rows: evRows } = await query(`
  SELECT etapa_codigo, etapa_label, estado_codigo, estado_label,
         responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente
  FROM expediente_estado_vigente WHERE requerimiento_id = $1
`, [rid]);
const ev = evRows[0];
ok(ev.etapa_codigo === 'RECEPCION_COTIZACIONES', 'C1 etapa RC');
ok(ev.estado_codigo === 'ESTADO_RC_PRESERVAR', 'C2 estado preservado exacto');
ok(ev.estado_label === 'Label RC exacto', 'C3 estado_label preservado');
ok(ev.responsable_tipo === 'PERSONA' && Number(ev.responsable_usuario_id) === Number(analistaId), 'C4 PERSONA analista');
ok(ev.responsable_unidad === 'Unidad RC exacta', 'C5 unidad preservada');
ok(ev.responsable_fuente === 'fuente_previa', 'C6 fuente preservada');

const { rows: wf } = await query(`
  SELECT evento_codigo, etapa_origen, etapa_destino FROM workflow_eventos
  WHERE expediente_id = $1 AND evento_codigo = 'REINVITACION_ENVIADA'
  ORDER BY id DESC LIMIT 1
`, [rid]);
ok(wf[0]?.etapa_origen === 'RECEPCION_COTIZACIONES', 'C7 evento origen RC');
ok(wf[0]?.etapa_destino === 'RECEPCION_COTIZACIONES', 'C8 evento destino RC');

const insReqBad = await query(`
  INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
  VALUES ('bienes', $1, 'Test C3-C bad ERV', 'Area', 'CNCC', 'x', 'RECEPCION_COTIZACIONES', '{}'::jsonb)
  RETURNING id
`, [`REQ-C3C-BAD-${ts}`]);
const ridBad = insReqBad.rows[0].id;
await query(`
  INSERT INTO expediente_estado_vigente (
    requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
    responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version
  ) VALUES ($1, 'RECEPCION_COTIZACIONES', 'Recepción de Cotizaciones', 'EN_TRAMITE', 'En trámite',
    'PERSONA', NULL, 'Recepción de Cotizaciones', 'asignacion_explicita', 1)
`, [ridBad]);

const { rows: wfCountBefore } = await query(
  `SELECT COUNT(*)::int AS n FROM workflow_eventos WHERE expediente_id = $1`,
  [ridBad],
);
const nBefore = wfCountBefore[0].n;

try {
  await transicionarExpediente({
    requerimientoId: ridBad,
    evento: 'REINVITACION_ENVIADA',
    unidadDestino: UNIDAD_RESPONSABLE_PROVEEDORES,
    metadata: { client_request_id: `test-c3c-bad:${ridBad}:${ts}` },
    actorRol: 'test-c3c',
  });
  assert.fail('transición con ERV incompleto debe fallar');
} catch (e) {
  ok(e.code === 'REINVITACION_RECEPCION_ERV_INCOMPLETO', 'D1 error controlado ERV incompleto');
}

const { rows: wfCountAfter } = await query(
  `SELECT COUNT(*)::int AS n FROM workflow_eventos WHERE expediente_id = $1`,
  [ridBad],
);
ok(wfCountAfter[0].n === nBefore, 'D2 sin evento workflow persistido tras fallo');

console.log('\n=== RC8.17.8H6-C3-C OK ===\n');

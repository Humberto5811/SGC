/**
 * RC8.17.8H6-A4 — ERV post envío/re-envío invitaciones (ESPERANDO_COTIZACIONES / Proveedores).
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../shared/invitacionesExpedienteCanon.js';
import { applyBandejaExpedienteContrato } from '../server/lib/bandejaExpedienteContrato.js';
import { enrichEstadoResponsableForBandeja } from '../server/lib/enrichEstadoResponsable.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-A4 — ESPERANDO_COTIZACIONES / Proveedores ===\n');

await runMigrations({ silent: true });

const { rows: uPool } = await query(
  `SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 2`,
);
const analistaId = uPool[0]?.id || 260;
const ts = Date.now();
let rid = null;

async function erv() {
  const { rows } = await query(
    `SELECT etapa_codigo, estado_codigo, estado_label, responsable_tipo,
            responsable_usuario_id, responsable_unidad
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [rid],
  );
  return rows[0] || null;
}

async function legacy() {
  const { rows } = await query(
    `SELECT estado, estado_actual, responsable_actual, sub_modulo_actual FROM requerimientos WHERE id = $1`,
    [rid],
  );
  return rows[0];
}

async function ultimoEvento(codigo) {
  const { rows } = await query(
    `SELECT evento_codigo, actor_id, metadata
     FROM workflow_eventos
     WHERE expediente_id = $1 AND UPPER(evento_codigo) = $2
     ORDER BY id DESC LIMIT 1`,
    [rid, String(codigo).toUpperCase()],
  );
  return rows[0] || null;
}

try {
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual,
      sub_modulo_actual, responsable_actual, payload)
    VALUES ('bienes', $1, 'T0001', 'Test H6-A4', 'Test', 'CNCC', 'Programado', 'INVITACIONES',
      'Invitaciones', $2, '{"observaciones":[]}'::jsonb)
    RETURNING id
  `, [`REQ-TEST-H6A4-${ts}`, String(analistaId)]);
  rid = ins.rows[0].id;

  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, responsable_fuente, version
    ) VALUES ($1, 'INVITACIONES', 'Invitaciones', 'EN_TRAMITE', 'En trámite',
      'PERSONA', $2, 'asignacion_explicita', 1)
  `, [rid, analistaId]);
  await query(`
    INSERT INTO expediente_asignaciones (
      requerimiento_id, usuario_id, etapa_codigo, tipo_responsable, activo, origen_asignacion
    ) VALUES ($1, $2, 'INVITACIONES', 'PERSONA', TRUE, 'test-h6a4-seed')
  `, [rid, analistaId]);

  const trans = async (evento, opts = {}) => {
    await transicionarExpediente({
      requerimientoId: rid,
      evento,
      usuarioDestinoId: opts.usuarioDestinoId ?? null,
      usuarioOrigenId: opts.usuarioOrigenId ?? null,
      unidadDestino: opts.unidadDestino ?? null,
      metadata: {
        client_request_id: `test-h6a4:${evento}:${rid}:${ts}:${opts.suffix || ''}`,
        via: 'test-h6a4',
        ...(opts.metadata || {}),
      },
      actorRol: opts.actorRol || 'test-h6a4',
    });
  };

  const antes = await erv();
  ok(antes?.etapa_codigo === 'INVITACIONES', 'A — etapa INVITACIONES');
  ok(antes?.estado_codigo === 'EN_TRAMITE', 'A — estado EN_TRAMITE');
  ok(antes?.responsable_tipo === 'PERSONA', 'A — responsable PERSONA');
  ok(Number(antes?.responsable_usuario_id) === Number(analistaId), 'A — analista vigente');

  await trans('INVITACION_ENVIADA', {
    usuarioOrigenId: analistaId,
    unidadDestino: UNIDAD_RESPONSABLE_PROVEEDORES,
    suffix: 'env1',
    metadata: { solicitud_id: 1 },
  });

  const post1 = await erv();
  ok(post1?.etapa_codigo === 'INVITACIONES', 'B — etapa INVITACIONES');
  ok(post1?.estado_codigo === ESTADO_ESPERANDO_COTIZACIONES, 'B — estado ESPERANDO_COTIZACIONES');
  ok(post1?.estado_label === 'Esperando cotizaciones', 'B — label estado');
  ok(post1?.responsable_tipo === 'UNIDAD', 'B — responsable UNIDAD');
  ok(post1?.responsable_unidad === UNIDAD_RESPONSABLE_PROVEEDORES, 'B — Proveedores');
  ok(post1?.responsable_usuario_id == null, 'B — sin persona vigente');

  const ev1 = await ultimoEvento('INVITACION_ENVIADA');
  ok(!!ev1, 'B — evento INVITACION_ENVIADA registrado');
  ok(Number(ev1?.actor_id) === Number(analistaId), 'F — actor analista en evento');

  const leg1 = await legacy();
  ok(leg1.estado_actual === 'INVITACIONES', 'legacy — ubicación INVITACIONES');
  ok(String(leg1.estado).includes('Esperando cotizaciones'), 'legacy — situación Esperando cotizaciones');
  ok(leg1.responsable_actual === UNIDAD_RESPONSABLE_PROVEEDORES, 'legacy — responsable Proveedores');

  await trans('REINVITACION_ENVIADA', {
    usuarioOrigenId: analistaId,
    unidadDestino: UNIDAD_RESPONSABLE_PROVEEDORES,
    suffix: 'reinv1',
    metadata: { solicitud_id: 1, ciclo_observacion: 'sc1:c2' },
  });

  const post2 = await erv();
  ok(post2?.estado_codigo === ESTADO_ESPERANDO_COTIZACIONES, 'C — ERV permanece ESPERANDO_COTIZACIONES');
  ok(post2?.responsable_unidad === UNIDAD_RESPONSABLE_PROVEEDORES, 'C — Proveedores');
  const ev2 = await ultimoEvento('REINVITACION_ENVIADA');
  ok(!!ev2, 'C — evento REINVITACION_ENVIADA distinto');

  const { rows: reqRows } = await query('SELECT * FROM requerimientos WHERE id = $1', [rid]);
  await enrichEstadoResponsableForBandeja(reqRows, 'id');
  const rowBandeja = applyBandejaExpedienteContrato(reqRows[0]);
  ok(rowBandeja.bandeja_contrato.etapa.label === 'Invitaciones', 'D — etapa Invitaciones');
  ok(rowBandeja.bandeja_contrato.estado.label === 'Esperando cotizaciones', 'D — estado Esperando cotizaciones');
  ok(rowBandeja.bandeja_contrato.responsable.nombre === UNIDAD_RESPONSABLE_PROVEEDORES, 'D — responsable Proveedores');
  ok(
    rowBandeja.bandeja_contrato.etapa.label !== rowBandeja.bandeja_contrato.estado.label
    && rowBandeja.bandeja_contrato.estado.label !== rowBandeja.bandeja_contrato.responsable.nombre,
    'E — no triple Invitaciones',
  );

  console.log('\nOK H6-A4\n');
} finally {
  if (rid) {
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM requerimientos WHERE id = $1', [rid]).catch(() => {});
  }
}

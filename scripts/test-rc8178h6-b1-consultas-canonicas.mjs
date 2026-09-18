/**
 * RC8.17.8H6-B1 — Consultas/Observaciones canónico (ERV etapa CO, eventos motor).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { getTransition } from '../shared/workflow/transiciones.js';
import { EVENTOS } from '../shared/workflow/eventos.js';
import { ETAPAS } from '../shared/workflow/etapas.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../shared/invitacionesExpedienteCanon.js';
import { applyBandejaExpedienteContrato } from '../server/lib/bandejaExpedienteContrato.js';
import { enrichEstadoResponsableForBandeja } from '../server/lib/enrichEstadoResponsable.js';
import { consolidarExpedientesConsultas } from '../src/utils/consultasObservacionesUtils.js';
import { formatDateTimeLima } from '../src/utils/dateTimeLima.js';
import { applyPilotConsultasObservada } from '../server/lib/consultasExpedienteEstado.js';
import { WHERE_BANDEJA_INVITACIONES } from '../server/lib/invitacionesBandeja.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-B1 — Consultas canónicas ===\n');

await runMigrations({ silent: true });

// Catálogo / matriz
ok(EVENTOS.CONSULTA_PROVEEDOR_REGISTRADA, 'matriz — evento REGISTRADA definido');
ok(getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: ETAPAS.INVITACIONES,
  eventoCodigo: 'CONSULTA_PROVEEDOR_REGISTRADA',
})?.etapa_destino === ETAPAS.CONSULTAS_OBSERVACIONES, 'matriz I→CO consulta');
ok(getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: ETAPAS.CONSULTAS_OBSERVACIONES,
  eventoCodigo: 'CONSULTA_PROVEEDOR_ABSUELTA',
})?.etapa_destino === ETAPAS.INVITACIONES, 'matriz CO→I absuelta');

const { rows: uPool } = await query(
  `SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 2`,
);
const analistaId = uPool[0]?.id || 260;
const destinoObsId = uPool[1]?.id || analistaId;
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

async function seedInvitacionesEsperando() {
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual,
      sub_modulo_actual, responsable_actual, payload)
    VALUES ('bienes', $1, 'T0001', 'Test H6-B1', 'Test', 'CNCC', 'Esperando cotizaciones', 'INVITACIONES',
      'Invitaciones', $2, '{"observaciones":[]}'::jsonb)
    RETURNING id
  `, [`REQ-TEST-H6B1-${ts}`, UNIDAD_RESPONSABLE_PROVEEDORES]);
  rid = ins.rows[0].id;

  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version
    ) VALUES ($1, 'INVITACIONES', 'Invitaciones', $2, 'Esperando cotizaciones',
      'UNIDAD', NULL, $3, 'unidad_etapa', 1)
  `, [rid, ESTADO_ESPERANDO_COTIZACIONES, UNIDAD_RESPONSABLE_PROVEEDORES]);
  await query(`
    INSERT INTO expediente_asignaciones (
      requerimiento_id, usuario_id, etapa_codigo, tipo_responsable, activo, origen_asignacion
    ) VALUES ($1, $2, 'INVITACIONES', 'PERSONA', TRUE, 'test-h6b1-seed')
  `, [rid, analistaId]);
}

try {
  // a) consulta → CO / EN_TRAMITE / PERSONA
  await seedInvitacionesEsperando();
  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'CONSULTA_PROVEEDOR_REGISTRADA',
    usuarioDestinoId: analistaId,
    metadata: {
      client_request_id: `test-h6b1-reg:${rid}:${ts}`,
      via: 'test-h6b1',
      analista_invitaciones_previo_id: analistaId,
    },
    actorRol: 'test-h6b1',
  });
  const postReg = await erv();
  ok(postReg?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', 'a — etapa CONSULTAS_OBSERVACIONES');
  ok(postReg?.estado_codigo === 'EN_TRAMITE', 'a — estado EN_TRAMITE');
  ok(postReg?.responsable_tipo === 'PERSONA', 'a — responsable PERSONA');
  ok(Number(postReg?.responsable_usuario_id) === Number(analistaId), 'a — analista vigente');

  // b) Invitaciones histórico + mismo ERV en enrich
  ok(WHERE_BANDEJA_INVITACIONES.includes('CONSULTAS_OBSERVACIONES'), 'b — histórico incluye etapa CO');
  const { rows: reqRows } = await query('SELECT * FROM requerimientos WHERE id = $1', [rid]);
  await enrichEstadoResponsableForBandeja(reqRows, 'id');
  const rowBandeja = applyBandejaExpedienteContrato(reqRows[0]);
  ok(rowBandeja.bandeja_contrato.etapa.label === 'Consultas y Observaciones', 'b — etapa bandeja CO');
  ok(rowBandeja.bandeja_contrato.estado.label === 'En trámite', 'b — estado En trámite');

  // c) bandeja Consultas consolida contrato
  const fakeConsulta = {
    solicitud_id: 9001,
    solicitud_codigo: 'SC-TEST',
    requerimiento_id: rid,
    bandeja_contrato: rowBandeja.bandeja_contrato,
    estado_responsable_vigente: reqRows[0].estado_responsable_vigente,
  };
  const exp = consolidarExpedientesConsultas([fakeConsulta])[0];
  ok(exp.bandeja_contrato?.etapa?.codigo === 'CONSULTAS_OBSERVACIONES', 'c — consolidar propaga etapa');
  ok(exp.bandeja_contrato?.responsable?.tipo === 'PERSONA', 'c — consolidar propaga responsable');

  // d) fecha/hora Lima (Portal + SGC helper)
  const iso = '2026-08-01T05:13:00.000Z';
  const lima = formatDateTimeLima(iso);
  ok(lima.includes('2026') && lima.includes(':'), 'd — formatDateTimeLima produce fecha Lima');
  const viewSrc = readFileSync(new URL('../src/views/contratacion/consultasObservacionesView.js', import.meta.url), 'utf8');
  const portalSrc = readFileSync(new URL('../src/views/proveedor/misConsultasView.js', import.meta.url), 'utf8');
  ok(viewSrc.includes('formatDateTimeLima'), 'd — SGC consultas usa formatDateTimeLima');
  ok(portalSrc.includes('formatDateTimeLima'), 'd — Portal misConsultas usa formatDateTimeLima');

  // e) observar → OBSERVADO destino; subsanación retorno analista
  const pilotObs = applyPilotConsultasObservada({
    resp: {},
    usuarioDestinoId: destinoObsId,
    metadata: { destino_submodulo: 'Registro de Requerimiento' },
    labels: {},
  });
  ok(pilotObs.etapaEfectiva === 'CONSULTAS_OBSERVACIONES', 'e — observación permanece en CO');
  ok(pilotObs.labels.estadoCodigo === 'OBSERVADO', 'e — estado OBSERVADO');
  ok(Number(pilotObs.resp.responsableUsuarioId) === Number(destinoObsId), 'e — persona destino');

  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'CONSULTAS_OBSERVADA',
    usuarioDestinoId: destinoObsId,
    metadata: {
      client_request_id: `test-h6b1-obs:${rid}:${ts}`,
      via: 'test-h6b1',
      destino_submodulo: 'Registro de Requerimiento',
      etapa_destino: 'REGISTRO',
    },
    actorRol: 'test-h6b1',
  });
  const postObs = await erv();
  ok(postObs?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', 'e — ERV post observar en CO');
  ok(postObs?.estado_codigo === 'OBSERVADO', 'e — ERV OBSERVADO');

  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'OBSERVACION_SUBSANADA',
    usuarioDestinoId: analistaId,
    metadata: {
      client_request_id: `test-h6b1-sub:${rid}:${ts}`,
      via: 'test-h6b1',
      destino_etapa: 'CONSULTAS_OBSERVACIONES',
      destino_submodulo: 'Consultas y Observaciones',
    },
    actorRol: 'test-h6b1',
  });
  const postSub = await erv();
  ok(postSub?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', 'e — subsanación retorno CO');
  ok(postSub?.estado_codigo === 'EN_TRAMITE', 'e — subsanación EN_TRAMITE');
  ok(Number(postSub?.responsable_usuario_id) === Number(analistaId), 'e — retorno analista emisor');

  // f) respuesta final → INVITACIONES / ESPERANDO / Proveedores
  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'CONSULTA_PROVEEDOR_ABSUELTA',
    metadata: {
      client_request_id: `test-h6b1-abs:${rid}:${ts}`,
      via: 'test-h6b1',
      analista_invitaciones_previo_id: analistaId,
    },
    actorRol: 'test-h6b1',
  });
  const postAbs = await erv();
  ok(postAbs?.etapa_codigo === 'INVITACIONES', 'f — retorno INVITACIONES');
  ok(postAbs?.estado_codigo === ESTADO_ESPERANDO_COTIZACIONES, 'f — ESPERANDO_COTIZACIONES');
  ok(postAbs?.responsable_tipo === 'UNIDAD', 'f — UNIDAD Proveedores');
  ok(postAbs?.responsable_unidad === UNIDAD_RESPONSABLE_PROVEEDORES, 'f — Proveedores');

  // g) regresión invitaciones sin consulta (envío invitación)
  await seedInvitacionesEsperando();
  await query(`
    UPDATE expediente_estado_vigente SET
      etapa_codigo = 'INVITACIONES', estado_codigo = 'EN_TRAMITE', estado_label = 'En trámite',
      responsable_tipo = 'PERSONA', responsable_usuario_id = $2, responsable_unidad = NULL
    WHERE requerimiento_id = $1
  `, [rid, analistaId]);
  await transicionarExpediente({
    requerimientoId: rid,
    evento: 'INVITACION_ENVIADA',
    usuarioOrigenId: analistaId,
    metadata: { client_request_id: `test-h6b1-inv:${rid}:${ts}`, via: 'test-h6b1' },
    actorRol: 'test-h6b1',
  });
  const postInv = await erv();
  ok(postInv?.estado_codigo === ESTADO_ESPERANDO_COTIZACIONES, 'g — invitación sin consulta intacta');
  ok(postInv?.responsable_unidad === UNIDAD_RESPONSABLE_PROVEEDORES, 'g — Proveedores post envío');

  console.log('\nOK H6-B1\n');
} finally {
  if (rid) {
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM requerimientos WHERE id = $1', [rid]).catch(() => {});
  }
}

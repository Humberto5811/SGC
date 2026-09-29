/**
 * RC8.17.8H6-C3-D5.2 — Retorno subsanación derivación explícita RC → Registro → RC.
 *
 *   node scripts/test-rc8178h6-c3d52-consulta-derivada-subsanacion-retorno-rc.mjs
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { getTransition } from '../shared/workflow/transiciones.js';
import { EVENTOS } from '../shared/workflow/eventos.js';
import { registrarConsulta } from '../server/lib/portalProveedores.js';
import { observarConsultasObservaciones } from '../server/lib/consultasObservacionesExpediente.js';
import { listarCandidatosObservacionDestino } from '../server/lib/candidatosObservacionDestino.js';
import { registrarSubsanacionObservacion } from '../server/lib/observacionesWorkflow.js';
import { registrarSubsanacionDerivacion } from '../server/lib/trazabilidad.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { getListaObservaciones } from '../shared/observacionesMotor.js';
import { enrichRequerimientoRow } from '../server/lib/trazabilidad.js';
import { SUBMODULO_CONSULTAS_OBSERVACIONES } from '../server/lib/consultasObservacionesBandeja.js';

const ts = Date.now();
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

function rucFor(salt) {
  const s = String(salt).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return String(20000000000 + ((ts + s) % 999999999)).slice(0, 11);
}

console.log('\n=== RC8.17.8H6-C3-D5.2 — Retorno subsanación RC ===\n');

ok(
  EVENTOS.CONSULTA_DERIVACION_EXPLICITA_SUBSANADA === 'CONSULTA_DERIVACION_EXPLICITA_SUBSANADA',
  'evento retorno definido',
);
ok(
  getTransition({
    tipoContratacion: 'BIEN',
    etapaOrigen: 'REGISTRO',
    eventoCodigo: 'CONSULTA_DERIVACION_EXPLICITA_SUBSANADA',
  })?.etapa_destino === 'RECEPCION_COTIZACIONES',
  'matriz REGISTRO→RC',
);

await runMigrations({ silent: true });

const centroTest = `D52${String(ts).slice(-6)}`;
const payloadSeed = JSON.stringify({ observaciones: [], area: { responsable: centroTest } });

const { rows: analistaRows } = await query(`
  INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos, centro, codigo_centro_costo)
  VALUES ($1, $2, 'Analista D52', 'usuario', 'Analista CM', TRUE, '{"perfil":"ANALISTA_CONTRATACIONES"}'::jsonb, $3, $3)
  RETURNING id, username
`, [`D52A${ts}`.slice(0, 20), `d52-anal-${ts}`, centroTest]);
const { rows: destRows } = await query(`
  INSERT INTO usuarios (dni, username, nombre, apellidos, nombres, rol, cargo, activo, permisos, centro, codigo_centro_costo)
  VALUES ($1, $2, 'Destino D52', 'Destino', 'Registro', 'usuario', 'Área Usuaria', TRUE, '{"perfil":"AREA_USUARIA"}'::jsonb, $3, $3)
  RETURNING id, username
`, [`D52D${ts}`.slice(0, 20), `d52-dest-${ts}`, centroTest]);

const analistaRc = analistaRows[0].id;
const destinatario = destRows[0];

async function seedRcWithInv() {
  const tag = `D52-${ts}`;
  const { rows: reqRows } = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'Test D5.2', 'Area', $2, 'En tramite', 'RECEPCION_COTIZACIONES', $3::jsonb)
    RETURNING id
  `, [`REQ-${tag}`, centroTest, payloadSeed]);
  const rid = reqRows[0].id;
  const corr = (ts % 84000) + 8400;
  const { rows: scRows } = await query(`
    INSERT INTO solicitudes_cotizacion (codigo, anio, correlativo, estado, objeto, tipo, detalle_items, consultas_fin)
    VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'Bienes', '[]'::jsonb, NOW() + INTERVAL '30 days')
    RETURNING id
  `, [`SC-${tag}`, corr]);
  const sid = scRows[0].id;
  await query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);
  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version, metadata_json
    ) VALUES ($1, 'RECEPCION_COTIZACIONES', 'Recepción de Cotizaciones', 'EN_TRAMITE', 'En trámite',
      'PERSONA', $2, 'CNCC', 'asignacion_explicita', 1, '{}'::jsonb)
  `, [rid, analistaRc]);
  const { rows: pRows } = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov D52', TRUE) RETURNING id
  `, [rucFor('d52')]);
  const proveedorId = pRows[0].id;
  await query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion, fecha_envio)
    VALUES ($1, $2, $3, 'ENVIADA', 1, NOW() - INTERVAL '10 days')
  `, [sid, rid, proveedorId]);
  const { rows: inv2 } = await query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion, fecha_envio)
    VALUES ($1, $2, $3, 'COTIZACION_PRESENTADA', 2, NOW() - INTERVAL '5 days') RETURNING id
  `, [sid, rid, proveedorId]);
  await query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion, estado,
      propuesta_tecnica, propuesta_economica, anexos, certificados, fecha_presentacion
    ) VALUES ($1, $2, $3, $4, 2, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{"monto":1}'::jsonb, '[]'::jsonb, '[]'::jsonb, NOW())
  `, [sid, proveedorId, rid, inv2[0].id]);
  const { rows: inv7 } = await query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion, fecha_envio)
    VALUES ($1, $2, $3, 'ENVIADA', 7, NOW() - INTERVAL '1 day') RETURNING id
  `, [sid, rid, proveedorId]);
  return { rid, sid, proveedorId, inv7Id: inv7[0].id };
}

async function erv(rid) {
  const { rows } = await query(`
    SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id
    FROM expediente_estado_vigente WHERE requerimiento_id = $1`, [rid]);
  return rows[0];
}

const base = await seedRcWithInv();

const reg = await registrarConsulta(base.proveedorId, {
  solicitud_id: base.sid,
  invitacion_id: base.inv7Id,
  asunto: 'consulta reinvitacion',
  consulta: 'texto consulta plazo',
}, { headers: { 'x-user-name': 'test-d52' } });
const consultaId = reg.id || reg.consulta?.id;
ok(consultaId, 'B — consulta registrada');

const cand = await listarCandidatosObservacionDestino({
  requerimientoId: base.rid,
  destinoSubmodulo: 'Registro de Requerimiento',
});
const destUser = cand.recomendado || cand.candidatos?.find((c) => Number(c.id) === Number(destinatario.id))
  || cand.candidatos?.[0]
  || { id: destinatario.id, nombre: 'Destino Registro' };

await observarConsultasObservaciones(base.rid, {
  motivo: 'Derivar consulta a Registro',
  usuario: analistaRows[0].username,
  origen_submodulo: SUBMODULO_CONSULTAS_OBSERVACIONES,
  destino_submodulo: 'Registro de Requerimiento',
  destino_etapa: 'REGISTRO',
  destino_persona: destUser.nombre,
  usuario_destino_id: destUser.id,
  consulta_id: consultaId,
  client_request_id: `test-d52-deriv:${base.rid}:${consultaId}:${ts}`,
});

const evRegistro = await erv(base.rid);
ok(evRegistro.etapa_codigo === 'REGISTRO', 'C — ERV REGISTRO/OBSERVADO');
ok(evRegistro.estado_codigo === 'OBSERVADO', 'C — OBSERVADO');

const reqRow = enrichRequerimientoRow(
  (await query('SELECT * FROM requerimientos WHERE id = $1', [base.rid])).rows[0],
);
const obs = getListaObservaciones(reqRow).slice(-1)[0];
ok(obs?.derivacion_explicita === true, 'metadata derivacion_explicita');
ok(obs?.etapa_expediente_origen === 'RECEPCION_COTIZACIONES', 'metadata etapa_expediente_origen RC');

let payload = typeof reqRow.payload === 'object' ? { ...reqRow.payload } : JSON.parse(reqRow.payload || '{}');
const subs = registrarSubsanacionObservacion(payload, {
  observacion_id: obs.id,
  respuesta: 'Subsanación desde Registro hacia RC',
  origen_submodulo: 'Registro de Requerimiento',
  usuario: destUser.username || 'd52-dest',
  actorUsuarioId: destUser.id,
});
ok(subs.derivacionExplicitaRetorno === true, 'I — retorno explícito detectado en subsanación');
ok(subs.destinoEtapa === 'RECEPCION_COTIZACIONES', 'I — destino etapa RC (no CO)');
ok(
  !String(subs.destinoSubmodulo || '').toLowerCase().includes('consultas'),
  'J — subsanacion_destino no es Consultas y Observaciones',
);

await query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [base.rid, JSON.stringify(payload)]);

await registrarSubsanacionDerivacion({
  requerimientoId: base.rid,
  usuario: destUser.username || 'd52-dest',
  textoSubsanacion: 'Subsanación desde Registro hacia RC',
  origenSubmodulo: 'Registro de Requerimiento',
  destinoSubmodulo: subs.destinoSubmodulo,
  destinoEtapa: subs.destinoEtapa,
  destinoPersona: subs.destinoPersona,
  observacionId: obs.id,
  usuarioDestinoId: analistaRc,
});

const evRetorno = await erv(base.rid);
ok(evRetorno.etapa_codigo === 'RECEPCION_COTIZACIONES', 'E — retorno RECEPCION_COTIZACIONES');
ok(evRetorno.estado_codigo === 'EN_TRAMITE', 'E — EN_TRAMITE');
ok(evRetorno.responsable_tipo === 'PERSONA', 'E — PERSONA');
ok(Number(evRetorno.responsable_usuario_id) === Number(analistaRc), 'E — operador origen');

const { rows: cpRow } = await query(
  'SELECT estado, invitacion_id FROM consultas_proveedor WHERE id = $1',
  [consultaId],
);
ok(String(cpRow[0]?.estado).toUpperCase() === 'PENDIENTE', 'F — consulta sigue PENDIENTE');
ok(Number(cpRow[0]?.invitacion_id) === Number(base.inv7Id), 'H — invitacion_id intacto');
ok(Number(obs.consulta_id) === Number(consultaId), 'G — consulta_id trazado');

const { rows: wf } = await query(`
  SELECT evento_codigo, etapa_origen, etapa_destino, metadata
  FROM workflow_eventos
  WHERE expediente_id = $1 AND evento_codigo = 'CONSULTA_DERIVACION_EXPLICITA_SUBSANADA'
  ORDER BY id DESC LIMIT 1`, [base.rid]);
ok(wf.length === 1, 'evento CONSULTA_DERIVACION_EXPLICITA_SUBSANADA');
ok(wf[0].etapa_origen === 'REGISTRO', 'traza origen REGISTRO');
ok(wf[0].etapa_destino === 'RECEPCION_COTIZACIONES', 'traza destino RC');

const obsPost = getListaObservaciones(
  enrichRequerimientoRow((await query('SELECT * FROM requerimientos WHERE id = $1', [base.rid])).rows[0]),
).find((o) => String(o.id) === String(obs.id));
ok(
  String(obsPost?.subsanacion_destino_etapa || '').toUpperCase() === 'RECEPCION_COTIZACIONES',
  'I — actuación retorno Registro→RC',
);

// K — fallo transición: ERV no cambia si evento inválido
const evBeforeFail = await erv(base.rid);
ok(evBeforeFail.etapa_codigo === 'RECEPCION_COTIZACIONES', 'K — precondición RC');
let failThrown = false;
try {
  await transicionarExpediente({
    requerimientoId: base.rid,
    evento: 'CONSULTAS_OBSERVADA',
    usuarioDestinoId: analistaRc,
    metadata: { client_request_id: `test-d52-fail:${ts}` },
    actorRol: 'test-d52',
  });
} catch (e) {
  failThrown = /TRANSITION_NOT_FOUND|Transición no permitida/i.test(String(e.message));
}
ok(failThrown, 'K — transición inválida desde RC falla');
const evAfterFail = await erv(base.rid);
ok(evAfterFail.etapa_codigo === evBeforeFail.etapa_codigo, 'K — ERV intacto tras fallo');

// L — observación legacy sin derivacion_explicita → retorno CO
const payloadLegacy = { observaciones: [] };
const { emitirObservacion } = await import('../server/lib/observacionesWorkflow.js');
emitirObservacion(payloadLegacy, {
  motivo: 'Obs legacy CO',
  gerente: analistaRows[0].username,
  origen_submodulo: SUBMODULO_CONSULTAS_OBSERVACIONES,
  destino_submodulo: 'Registro de Requerimiento',
  destino_etapa: 'REGISTRO',
  destino_persona: 'Analista CO',
  usuario_origen_id: analistaRc,
});
const obsLegacy = payloadLegacy.observaciones[0];
ok(obsLegacy?.derivacion_explicita !== true, 'L — obs legacy sin derivacion_explicita');
const subsLegacy = registrarSubsanacionObservacion(payloadLegacy, {
  observacion_id: obsLegacy.id,
  respuesta: 'Subsanación legacy',
  origen_submodulo: 'Registro de Requerimiento',
  usuario: destUser.username || 'dest',
  actorUsuarioId: destUser.id,
});
ok(subsLegacy.destinoEtapa === 'CONSULTAS_OBSERVACIONES', 'L — retorno legacy CO (destino subsanación)');

console.log('\n✅ RC8.17.8H6-C3-D5.2 tests OK\n');

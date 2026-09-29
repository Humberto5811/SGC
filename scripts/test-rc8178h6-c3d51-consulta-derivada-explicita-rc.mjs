/**
 * RC8.17.8H6-C3-D5.1 — Derivación explícita consulta en RC → Registro.
 *
 *   node scripts/test-rc8178h6-c3d51-consulta-derivada-explicita-rc.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { getTransition } from '../shared/workflow/transiciones.js';
import { EVENTOS } from '../shared/workflow/eventos.js';
import { registrarConsulta } from '../server/lib/portalProveedores.js';
import { observarConsultasObservaciones } from '../server/lib/consultasObservacionesExpediente.js';
import {
  resolveEventoObservacionConsultasExpediente,
  EVENTO_CONSULTA_DERIVADA_EXPLICITA,
  esReinvitacionPosteriorEnRecepcion,
} from '../server/lib/consultasExpedienteEstado.js';
import { listarCandidatosObservacionDestino } from '../server/lib/candidatosObservacionDestino.js';
import { applyBandejaExpedienteContrato } from '../server/lib/bandejaExpedienteContrato.js';
import { enrichEstadoResponsableForBandeja } from '../server/lib/enrichEstadoResponsable.js';
import { listarConsultasBandeja } from '../server/lib/portalProveedores.js';
import { SUBMODULO_CONSULTAS_OBSERVACIONES } from '../server/lib/consultasObservacionesBandeja.js';

const ts = Date.now();
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

function rucFor(salt) {
  const s = String(salt).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return String(20000000000 + ((ts + s) % 999999999)).slice(0, 11);
}

console.log('\n=== RC8.17.8H6-C3-D5.1 — Derivación explícita RC ===\n');

ok(EVENTOS.CONSULTA_DERIVADA_EXPLICITA === 'CONSULTA_DERIVADA_EXPLICITA', 'evento definido');
ok(
  getTransition({
    tipoContratacion: 'BIEN',
    etapaOrigen: 'RECEPCION_COTIZACIONES',
    eventoCodigo: 'CONSULTA_DERIVADA_EXPLICITA',
  })?.etapa_destino === 'REGISTRO',
  'matriz RC→REGISTRO',
);

const viewSrc = readFileSync(
  new URL('../src/views/contratacion/consultasObservacionesView.js', import.meta.url),
  'utf8',
);
ok(viewSrc.includes('Estado consulta'), 'K — columna Estado consulta');
ok(viewSrc.includes('<th>Estado</th>'), 'K — columna Estado ERV');
ok(!viewSrc.includes('Estado expediente'), 'K — sin label Estado expediente');

await runMigrations({ silent: true });

const centroTest = `D51${String(ts).slice(-6)}`;
const payloadSeed = JSON.stringify({ observaciones: [], area: { responsable: centroTest } });

const { rows: analistaRows } = await query(`
  INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos, centro, codigo_centro_costo)
  VALUES ($1, $2, 'Analista D51', 'usuario', 'Analista CM', TRUE, '{"perfil":"ANALISTA_CONTRATACIONES"}'::jsonb, $3, $3)
  RETURNING id, username
`, [`D51A${ts}`.slice(0, 20), `d51-anal-${ts}`, centroTest]);
const { rows: destRows } = await query(`
  INSERT INTO usuarios (dni, username, nombre, apellidos, nombres, rol, cargo, activo, permisos, centro, codigo_centro_costo)
  VALUES ($1, $2, 'Destino D51', 'Destino', 'Registro', 'usuario', 'Área Usuaria', TRUE, '{"perfil":"AREA_USUARIA"}'::jsonb, $3, $3)
  RETURNING id, username, nombre, apellidos, nombres
`, [`D51D${ts}`.slice(0, 20), `d51-dest-${ts}`, centroTest]);

const analistaRc = analistaRows[0]?.id;
const destinoFixture = destRows[0];

async function seedRcWithInv7() {
  const tag = `D51-${ts}`;
  const { rows: reqRows } = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'Test D5.1', 'Area', $2, 'En tramite', 'RECEPCION_COTIZACIONES', $3::jsonb)
    RETURNING id
  `, [`REQ-${tag}`, centroTest, payloadSeed]);
  const rid = reqRows[0].id;
  const corr = (ts % 85000) + 8500;
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
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov D51', TRUE) RETURNING id
  `, [rucFor('d51')]);
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
    VALUES ($1, $2, $3, 'ENVIADA', 7, NOW() - INTERVAL '1 day') RETURNING id, nro_invitacion
  `, [sid, rid, proveedorId]);
  return { rid, sid, proveedorId, inv7Id: inv7[0].id, nroInv7: inv7[0].nro_invitacion };
}

const base = await seedRcWithInv7();

async function erv(rid) {
  const { rows } = await query(`
    SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id
    FROM expediente_estado_vigente WHERE requerimiento_id = $1`, [rid]);
  return rows[0];
}

// A / J — registrar consulta no mueve ERV
const reg = await registrarConsulta(base.proveedorId, {
  solicitud_id: base.sid,
  invitacion_id: base.inv7Id,
  asunto: 'consulta reinvitacion',
  consulta: 'texto consulta plazo',
}, { headers: { 'x-user-name': 'test-d51' } });
ok(reg?.id || reg?.consulta?.id, 'A — consulta registrada');
const consultaId = reg.id || reg.consulta?.id;
const evPostReg = await erv(base.rid);
ok(evPostReg.etapa_codigo === 'RECEPCION_COTIZACIONES', 'A/J — ERV sigue RC');
ok(evPostReg.estado_codigo === 'EN_TRAMITE', 'A/J — EN_TRAMITE');
ok(Number(evPostReg.responsable_usuario_id) === Number(analistaRc), 'A/J — responsable analista RC');
ok(
  await esReinvitacionPosteriorEnRecepcion(base.sid, base.inv7Id, 7),
  'J — reinvitación posterior reconocida',
);

// otra consulta mismo SC
const { rows: cp2 } = await query(`
  INSERT INTO consultas_proveedor (solicitud_id, proveedor_id, requerimiento_id, invitacion_id, asunto, consulta, estado)
  VALUES ($1, $2, $3, $4, 'otra', 'x', 'PENDIENTE') RETURNING id
`, [base.sid, base.proveedorId, base.rid, base.inv7Id]);

ok(
  resolveEventoObservacionConsultasExpediente('RECEPCION_COTIZACIONES', {
    consultaId,
    destinoEtapa: 'REGISTRO',
    destinoSubmodulo: 'Registro de Requerimiento',
  }) === EVENTO_CONSULTA_DERIVADA_EXPLICITA,
  'B — evento derivación explícita',
);

const cand = await listarCandidatosObservacionDestino({
  requerimientoId: base.rid,
  destinoSubmodulo: 'Registro de Requerimiento',
});
ok(cand.soportado === true, 'candidatos Registro soportado');
const destinatario = cand.recomendado || cand.candidatos?.find((c) => Number(c.id) === Number(destinoFixture.id))
  || cand.candidatos?.[0];
ok(destinatario?.id, 'candidato Registro');
ok(Number(destinatario.id) === Number(destinoFixture.id), 'candidato = usuario AU fixture');

const obsCountBefore = (await query(`SELECT payload FROM requerimientos WHERE id = $1`, [base.rid])).rows[0];
let nObsBefore = 0;
try {
  const p = typeof obsCountBefore.payload === 'object' ? obsCountBefore.payload : JSON.parse(obsCountBefore.payload || '{}');
  nObsBefore = (p.observaciones || []).length;
} catch (_) { nObsBefore = 0; }

await observarConsultasObservaciones(base.rid, {
  motivo: 'Derivar consulta Inv.7 a Registro',
  usuario: analistaRows[0]?.username || 'test-d51',
  origen_submodulo: SUBMODULO_CONSULTAS_OBSERVACIONES,
  destino_submodulo: 'Registro de Requerimiento',
  destino_etapa: 'REGISTRO',
  destino_persona: destinatario.nombre,
  usuario_destino_id: destinatario.id,
  consulta_id: consultaId,
  client_request_id: `test-d51-deriv:${base.rid}:${consultaId}:${ts}`,
});

const evPostObs = await erv(base.rid);
ok(evPostObs.etapa_codigo === 'REGISTRO', 'C — ERV REGISTRO');
ok(evPostObs.estado_codigo === 'OBSERVADO', 'C — OBSERVADO');
ok(evPostObs.responsable_tipo === 'PERSONA', 'C — PERSONA');
ok(Number(evPostObs.responsable_usuario_id) === Number(destinatario.id), 'C — destino wvasquez-equivalent');

const { rows: cpRow } = await query('SELECT estado, invitacion_id FROM consultas_proveedor WHERE id = $1', [consultaId]);
ok(String(cpRow[0]?.estado).toUpperCase() === 'PENDIENTE', 'D — consulta sigue PENDIENTE');
ok(Number(cpRow[0]?.invitacion_id) === Number(base.inv7Id), 'E — invitacion_id intacto');

const { rows: cpOther } = await query('SELECT estado FROM consultas_proveedor WHERE id = $1', [cp2[0].id]);
ok(String(cpOther[0]?.estado).toUpperCase() === 'PENDIENTE', 'G — otra consulta intacta');

const { rows: wf } = await query(`
  SELECT evento_codigo, metadata FROM workflow_eventos
  WHERE expediente_id = $1 AND evento_codigo = 'CONSULTA_DERIVADA_EXPLICITA'
  ORDER BY id DESC LIMIT 1`, [base.rid]);
ok(wf.length === 1, 'F — evento CONSULTA_DERIVADA_EXPLICITA persistido');
let meta = {};
try {
  meta = typeof wf[0].metadata === 'object' ? wf[0].metadata : JSON.parse(wf[0].metadata || '{}');
} catch (_) { meta = {}; }
ok(Number(meta.consulta_id) === Number(consultaId), 'F — consulta_id en metadata evento');
ok(Number(meta.invitacion_id) === Number(base.inv7Id), 'F — invitacion_id en metadata');

const payloadRow = (await query('SELECT payload FROM requerimientos WHERE id = $1', [base.rid])).rows[0];
let payload = {};
try {
  payload = typeof payloadRow.payload === 'object' ? payloadRow.payload : JSON.parse(payloadRow.payload || '{}');
} catch (_) { payload = {}; }
ok((payload.observaciones || []).length === nObsBefore + 1, 'observación añadida atómicamente');
const lastObs = (payload.observaciones || [])[payload.observaciones.length - 1];
ok(Number(lastObs?.consulta_id) === Number(consultaId), 'F — consulta_id en observación');

// L — bandeja consultas muestra ERV actual
const bandeja = (await listarConsultasBandeja({})).filter((r) => Number(r.id) === Number(consultaId));
await enrichEstadoResponsableForBandeja(bandeja, 'requerimiento_id');
const contrato = applyBandejaExpedienteContrato(bandeja[0]);
ok(contrato.bandeja_contrato?.etapa?.codigo === 'REGISTRO', 'L — fila consulta etapa REGISTRO actual');
ok(contrato.bandeja_contrato?.estado?.codigo === 'OBSERVADO', 'L — fila consulta estado OBSERVADO');

// H — fallo sin consulta_id en RC no persiste observación extra
const nBeforeFail = (payload.observaciones || []).length;
let failThrown = false;
try {
  await observarConsultasObservaciones(base.rid, {
    motivo: 'debe fallar',
    usuario: 'test-d51',
    destino_submodulo: 'Registro de Requerimiento',
    destino_etapa: 'REGISTRO',
    destino_persona: destinatario.nombre,
    usuario_destino_id: destinatario.id,
    client_request_id: `test-d51-fail:${ts}`,
  });
} catch (e) {
  failThrown = /TRANSITION_NOT_FOUND|Transición no permitida/i.test(String(e.message));
}
ok(failThrown, 'H — sin consulta_id en RC falla transición');
const payloadAfterFail = (await query('SELECT payload FROM requerimientos WHERE id = $1', [base.rid])).rows[0];
let pFail = {};
try {
  pFail = typeof payloadAfterFail.payload === 'object' ? payloadAfterFail.payload : JSON.parse(payloadAfterFail.payload || '{}');
} catch (_) { pFail = {}; }
ok((pFail.observaciones || []).length === nBeforeFail, 'H — sin observación huérfana');

// I — legacy CO CONSULTAS_OBSERVADA (seed mínimo)
const tagCo = `D51CO-${ts}`;
const { rows: reqCo } = await query(`
  INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
  VALUES ('bienes', $1, 'CO legacy', 'Area', 'CNCC', 'En tramite', 'CONSULTAS_OBSERVACIONES', '{"observaciones":[]}'::jsonb) RETURNING id
`, [`REQ-${tagCo}`]);
const ridCo = reqCo[0].id;
await query(`
  INSERT INTO expediente_estado_vigente (
    requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
    responsable_tipo, responsable_usuario_id, responsable_fuente, version
  ) VALUES ($1, 'CONSULTAS_OBSERVACIONES', 'Consultas y Observaciones', 'EN_TRAMITE', 'En trámite',
    'PERSONA', $2, 'asignacion_explicita', 1)
`, [ridCo, analistaRc]);
ok(
  resolveEventoObservacionConsultasExpediente('CONSULTAS_OBSERVACIONES', {
    destinoEtapa: 'REGISTRO',
    destinoSubmodulo: 'Registro de Requerimiento',
  }) === 'CONSULTAS_OBSERVADA',
  'I — CO sigue CONSULTAS_OBSERVADA',
);

console.log('\n✅ RC8.17.8H6-C3-D5.1 tests OK\n');

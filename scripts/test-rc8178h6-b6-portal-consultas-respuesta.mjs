/**
 * RC8.17.8H6-B6 — Portal proveedor: ver respuesta individual y nueva consulta relacionada.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  consultaRespuestaAnalistaVisible,
  puedeVolverAConsultar,
  solicitudIdEnOpcionesFormulario,
  MSG_SOLICITUD_NO_DISPONIBLE_CONSULTA,
} from '../src/utils/misConsultasProveedor.js';
import {
  listConsultasProveedor,
  registrarConsulta,
  responderConsultaAnalista,
} from '../server/lib/portalProveedores.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../shared/invitacionesExpedienteCanon.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-B6 — Portal consultas respuesta ===\n');

const viewSrc = readFileSync(
  new URL('../src/views/proveedor/misConsultasView.js', import.meta.url),
  'utf8',
);

ok(!viewSrc.includes('absolucion_publica &&'), 'A — FE ya no exige absolucion_publica para ver respuesta');
ok(viewSrc.includes('Respuesta del analista'), 'A — encabezado Respuesta del analista');
ok(viewSrc.includes('prov-cons-reconsultar'), 'D — acción Volver a consultar en vista');
ok(viewSrc.includes('provBtnNuevaConsulta'), 'G — botón general Nueva consulta presente');
ok(
  viewSrc.includes('abrirFormularioNuevaConsulta({ titulo: \'Registrar consulta\' })'),
  'G — Nueva consulta abre formulario sin preselección obligatoria',
);
ok(!viewSrc.includes('Solicitud #'), 'reconsulta — sin option sintética Solicitud #id');
ok(!viewSrc.includes("createElement('option')"), 'reconsulta — sin createElement option artificial');
ok(viewSrc.includes('alert(MSG_SOLICITUD_NO_DISPONIBLE_CONSULTA)'), 'reconsulta — alert si SC no está en options');
ok(
  MSG_SOLICITUD_NO_DISPONIBLE_CONSULTA
    === 'Esta solicitud ya no está disponible para registrar nuevas consultas.',
  'reconsulta — texto mensaje canónico',
);
ok(viewSrc.includes('solicitudIdEnOpcionesFormulario'), 'reconsulta — valida contra options existentes');
ok(solicitudIdEnOpcionesFormulario(5, ['3', '5', '7']), 'reconsulta — preselección solo si option existe');
ok(!solicitudIdEnOpcionesFormulario(99, ['3', '5']), 'reconsulta — SC ausente no pasa validación FE');
ok(solicitudIdEnOpcionesFormulario(null, []), 'G — Nueva consulta sin solicitudId no exige option');

const sample = {
  estado: 'RESPONDIDA',
  respuesta: 'texto respuesta',
  absolucion_publica: false,
};
ok(consultaRespuestaAnalistaVisible(sample), 'A — RESPONDIDA + respuesta visible al autor');
ok(puedeVolverAConsultar(sample), 'B — absolucion_publica=false no bloquea acciones');

const pendiente = { estado: 'PENDIENTE', respuesta: '', absolucion_publica: false };
ok(!consultaRespuestaAnalistaVisible(pendiente), 'C — PENDIENTE sin Ver respuesta');

await runMigrations({ silent: true });

const { rows: uPool } = await query(`SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 2`);
const analistaId = uPool[0]?.id || 260;
const ts = Date.now();
let rid = null;
let sid = null;
let proveedorId = null;
let consulta1Id = null;

async function erv() {
  const { rows } = await query(
    `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id, responsable_unidad
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [rid],
  );
  return rows[0] || null;
}

async function seedStack() {
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual,
      sub_modulo_actual, responsable_actual, payload)
    VALUES ('bienes', $1, 'T0001', 'Test H6-B6', 'Test', 'CNCC', 'Esperando cotizaciones', 'INVITACIONES',
      'Invitaciones', $2, '{"observaciones":[]}'::jsonb)
    RETURNING id
  `, [`REQ-TEST-H6B6-${ts}`, UNIDAD_RESPONSABLE_PROVEEDORES]);
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
    ) VALUES ($1, $2, 'INVITACIONES', 'PERSONA', TRUE, 'test-h6b6')
  `, [rid, analistaId]);

  const prov = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo)
    VALUES ($1, 'Proveedor H6-B6', TRUE) RETURNING id
  `, [`20997${String(ts).slice(-6)}`]);
  proveedorId = prov.rows[0].id;

  const sol = await query(`
    INSERT INTO solicitudes_cotizacion (codigo, anio, correlativo, estado, objeto, denominacion,
      consultas_fin, cotizaciones_fin)
    VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'Sol H6-B6', NOW() + INTERVAL '7 days', NOW() + INTERVAL '14 days')
    RETURNING id
  `, [`SC-TEST-H6B6-${ts}`, (ts % 100000) + 11]);
  sid = sol.rows[0].id;

  await query(
    `INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)`,
    [sid, rid],
  );
  await query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado)
    VALUES ($1, $2, $3, 'ENVIADA')
  `, [sid, rid, proveedorId]);
}

const fakeReq = { portalProveedor: { id: null, ruc: 'TEST-RUC' } };

try {
  await seedStack();
  fakeReq.portalProveedor.id = proveedorId;

  const c1 = await registrarConsulta(proveedorId, {
    solicitud_id: sid,
    asunto: 'Primera consulta',
    consulta: 'Texto consulta uno',
  }, fakeReq);
  consulta1Id = c1.id;
  ok(Number(c1.requerimiento_id) === Number(rid), 'D — primera consulta ligada al REQ');

  let evCo = await erv();
  ok(evCo?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', 'E — primera consulta → CO');
  ok(evCo?.estado_codigo === 'EN_TRAMITE', 'E — EN_TRAMITE');
  ok(Number(evCo?.responsable_usuario_id) === Number(analistaId), 'E — PERSONA analista previo');

  await responderConsultaAnalista(consulta1Id, {
    respuesta: 'texto respuesta',
    publicar: false,
  }, 'test-h6b6');

  const { rows: c1Post } = await query('SELECT * FROM consultas_proveedor WHERE id = $1', [consulta1Id]);
  ok(c1Post[0]?.estado === 'RESPONDIDA', 'D — primera queda RESPONDIDA');
  ok(c1Post[0]?.respuesta === 'texto respuesta', 'D — respuesta persistida');
  ok(c1Post[0]?.absolucion_publica === false, 'B — absolucion_publica sigue false');

  const listed = await listConsultasProveedor(proveedorId);
  const rowListed = listed.find((r) => Number(r.id) === Number(consulta1Id));
  ok(rowListed && consultaRespuestaAnalistaVisible(rowListed), 'A — listado proveedor expone respuesta al autor');

  const evInv = await erv();
  ok(evInv?.etapa_codigo === 'INVITACIONES', 'F — tras responder → INVITACIONES');
  ok(evInv?.estado_codigo === ESTADO_ESPERANDO_COTIZACIONES, 'F — ESPERANDO_COTIZACIONES');
  ok(evInv?.responsable_unidad === UNIDAD_RESPONSABLE_PROVEEDORES, 'F — Proveedores');

  const c2 = await registrarConsulta(proveedorId, {
    solicitud_id: sid,
    asunto: 'Segunda consulta',
    consulta: 'Texto consulta dos',
  }, fakeReq);
  ok(Number(c2.id) !== Number(consulta1Id), 'D — nueva consulta nuevo id');
  ok(Number(c2.solicitud_id) === Number(sid), 'D — misma solicitud_id');
  ok(c2.estado === 'PENDIENTE', 'D — nueva consulta PENDIENTE');

  const { rows: c1Again } = await query('SELECT estado, respuesta, asunto, consulta FROM consultas_proveedor WHERE id = $1', [consulta1Id]);
  ok(c1Again[0]?.estado === 'RESPONDIDA', 'D — anterior intacta (estado)');
  ok(c1Again[0]?.respuesta === 'texto respuesta', 'D — anterior intacta (respuesta)');
  ok(c1Again[0]?.asunto === 'Primera consulta', 'D — anterior intacta (asunto)');

  const evCo2 = await erv();
  ok(evCo2?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', 'E — segunda consulta → CO');
  ok(Number(evCo2?.responsable_usuario_id) === Number(analistaId), 'E — analista previo en segunda');

  await responderConsultaAnalista(c2.id, {
    respuesta: 'respuesta segunda',
    publicar: false,
  }, 'test-h6b6');
  const evFinal = await erv();
  ok(evFinal?.etapa_codigo === 'INVITACIONES', 'F — segunda respuesta → INVITACIONES');
  ok(evFinal?.responsable_unidad === UNIDAD_RESPONSABLE_PROVEEDORES, 'F — UNIDAD Proveedores');

  console.log('\nOK H6-B6\n');
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

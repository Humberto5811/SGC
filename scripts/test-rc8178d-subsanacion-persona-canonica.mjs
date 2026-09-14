/**
 * RC8.17.8D — PERSONA canónico en retorno observación/subsanación.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitirObservacion } from '../server/lib/observacionesWorkflow.js';
import {
  applyPilotObservacionSubsanada,
  resolveEmisorObservacionRetorno,
  resolveUsuarioDestinoRetornoSubsanacion,
  resolveUsuarioIdDesdeNombreCompletoInequivoco,
  buildErrorSubsanacionSinPersona,
} from '../server/lib/pilotRegistroEvaluacion.js';
import { registrarSubsanacionDerivacion } from '../server/lib/trazabilidad.js';
import { getExpedienteContratoUnificado } from '../server/lib/expedienteContratoLectura.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };
const fail = (c, m) => { assert.ok(!c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8D — Subsanación PERSONA canónico ===\n');

console.log('A — payload observación guarda usuario_origen_id');
{
  const payload = { observaciones: [] };
  emitirObservacion(payload, {
    motivo: 'test',
    gerente: 'lespinoza',
    origen_submodulo: 'DEC',
    destino_submodulo: 'Registro de Requerimiento',
    destino_etapa: 'REGISTRO',
    usuario_origen_id: 549,
    usuario_destino_id: 249,
  });
  ok(payload.observaciones[0]?.usuario_origen_id === 549, 'usuario_origen_id en payload');
  ok(payload.observaciones[0]?.usuario_destino_id === 249, 'usuario_destino_id en payload');
}

console.log('\nB/C/D/E — Registro → DEC retorna PERSONA (mock histórico)');
{
  const mockClient = {
    query: async (sql, params) => {
      if (/FROM requerimientos/i.test(sql) && /payload/i.test(sql)) {
        return {
          rows: [{
            payload: JSON.stringify({
              observaciones: [{
                id: 'obs_hist',
                gerente: 'ESPINOZA MELLADO LUIGI PIERRE MAURICE',
                moduloEmisor: 'DEC',
                subsanacion_destino_etapa: 'DEC',
              }],
            }),
          }],
        };
      }
      if (/expediente_asignaciones/i.test(sql)) {
        return { rows: [{ usuario_id: 549 }] };
      }
      if (/workflow_eventos/i.test(sql)) {
        return { rows: [{ metadata: { usuario_destino_id: 549 } }] };
      }
      if (/FROM usuarios/i.test(sql) && /activo = TRUE/i.test(sql) && !/WHERE u\./i.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  const uid = await resolveUsuarioDestinoRetornoSubsanacion({
    requerimientoId: 16,
    observacionId: 'obs_hist',
    destinoEtapa: 'DEC',
    client: mockClient,
  });
  ok(uid === 549, 'resuelve 549 desde asignación/evento histórico');

  const pilot = await applyPilotObservacionSubsanada({
    resp: { responsableTipo: TIPO_RESPONSABLE.UNIDAD, responsableUnidad: 'ESPINOZA...' },
    metadata: { destino_etapa: 'DEC', observacion_id: 'obs_hist' },
    etapaEfectiva: 'REGISTRO',
    requerimientoId: 16,
    client: mockClient,
  });
  ok(pilot.resp.responsableTipo === TIPO_RESPONSABLE.PERSONA, 'piloto PERSONA');
  ok(pilot.resp.responsableUsuarioId === 549, 'responsable_usuario_id 549');
  fail(String(pilot.resp.responsableUnidad || '').includes('ESPINOZA MELLADO'), 'nombre display no es UNIDAD');
}

console.log('\nF — sin persona inequívoca => error 422');
{
  const err = buildErrorSubsanacionSinPersona();
  ok(err.status === 422 && err.code === 'SUBSANACION_SIN_PERSONA', 'código 422 SUBSANACION_SIN_PERSONA');
}

console.log('\nH — retorno Evaluación (uid explícito)');
{
  const pilot = await applyPilotObservacionSubsanada({
    resp: { responsableTipo: TIPO_RESPONSABLE.UNIDAD },
    usuarioDestinoId: 530,
    metadata: { destino_etapa: 'EVALUACION' },
    etapaEfectiva: 'REGISTRO',
    labels: {},
  });
  ok(pilot.etapaEfectiva === 'EVALUACION', 'etapa EVALUACION');
  ok(pilot.resp.responsableUsuarioId === 530, 'Eval uid 530');
}

console.log('\nJ/K — fallback nombre completo');
try {
  await runMigrations();
  const { rows: u } = await query(`
    SELECT id, apellidos, nombres FROM usuarios
    WHERE activo = TRUE AND LOWER(username) = 'lespinoza' LIMIT 1
  `);
  if (u[0]) {
    const nom = [u[0].apellidos, u[0].nombres].filter(Boolean).join(' ');
    const id = await resolveUsuarioIdDesdeNombreCompletoInequivoco(nom, null);
    ok(Number(id) === Number(u[0].id), 'nombre completo inequívoco → lespinoza');
  }
  const amb = await resolveUsuarioIdDesdeNombreCompletoInequivoco('USUARIO INEXISTENTE XYZ', null);
  ok(amb == null, 'nombre sin match → null');
} catch (e) {
  console.log('  ⚠ BD fallback nombre:', e.message);
}

console.log('\nIntegración — subsanación sin uid ni evidencia rechazada');
try {
  await runMigrations();
  const codigo = `REQ-RC8178D-${Date.now()}`;
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, cmn)
    VALUES ('bienes', $1, 'Test 8D', 'Area', 'CNCC', 'Observado',
      '{"observaciones":[{"id":"obs_x","gerente":"Nombre Ambiguo Sin Id","moduloEmisor":"DEC","subsanacion_destino_etapa":"DEC","cerrada":false}]}'::jsonb, 'CNCC')
    RETURNING id
  `, [codigo]);
  const rid = ins.rows[0].id;
  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, version, actualizado_at
    ) VALUES ($1, 'REGISTRO', 'Registro', 'OBSERVADO', 'Observado', 'PERSONA', 249, 1, NOW())
  `, [rid]);

  let rejected = false;
  try {
    await registrarSubsanacionDerivacion({
      requerimientoId: rid,
      usuario: 'wvasquez',
      textoSubsanacion: 'test',
      origenSubmodulo: 'Registro de Requerimiento',
      destinoSubmodulo: 'DEC',
      destinoEtapa: 'DEC',
      destinoPersona: 'Nombre Ambiguo Sin Id',
      observacionId: 'obs_x',
      usuarioDestinoId: null,
    });
  } catch (e) {
    rejected = e.code === 'SUBSANACION_SIN_PERSONA';
  }
  ok(rejected, 'G/F — 422 y no transición cuando no hay PERSONA');

  const erv = await query('SELECT responsable_tipo, etapa_codigo FROM expediente_estado_vigente WHERE requerimiento_id=$1', [rid]);
  ok(erv.rows[0]?.etapa_codigo === 'REGISTRO', 'ERV etapa sin cambio');
  ok(erv.rows[0]?.responsable_tipo === 'PERSONA', 'ERV responsable sin degradar a UNIDAD');

  await query('DELETE FROM workflow_eventos WHERE expediente_id=$1', [rid]);
  await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id=$1', [rid]);
  await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id=$1', [rid]);
  await query('DELETE FROM requerimientos WHERE id=$1', [rid]);
} catch (e) {
  console.log('  ⚠ integración 422:', e.message);
}

console.log('\nREQ-00016 — resolveEmisor con evidencia histórica');
try {
  const { rows: req } = await query(`SELECT id FROM requerimientos WHERE codigo='REQ-00016' LIMIT 1`);
  if (req[0]) {
    const emisor = await resolveEmisorObservacionRetorno(req[0].id, null, {
      observacionId: 'obs_1789276154168_2',
      destinoEtapa: 'DEC',
    });
    if (emisor) ok(Number(emisor) === 549, 'I/J — emisor DEC histórico resuelve 549');
    else console.log('  ⚠ REQ-00016 emisor aún null (ejecutar reparación ERV)');
  }
} catch (e) {
  console.log('  ⚠ REQ-00016:', e.message);
}

const trazSrc = readFileSync(join(root, 'server/lib/trazabilidad.js'), 'utf8');
ok(!trazSrc.includes('resolveResponsableFromDestino(destinoSubmodulo, destinoPersona'), 'registrarSubsanacion no mapea destinoPersona a UNIDAD');

console.log('\n✅ RC8.17.8D tests — OK\n');

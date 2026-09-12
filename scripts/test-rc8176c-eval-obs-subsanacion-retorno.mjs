/**
 * RC8.17.6C — Eval observa → Registro subsana → retorno a Evaluación (ERV canónico).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { getExpedienteContratoUnificado } from '../server/lib/expedienteContratoLectura.js';
import {
  applyPilotObservacionSubsanada,
  applyPilotObservacionEvaluacionRegistro,
} from '../server/lib/pilotRegistroEvaluacion.js';
import { emitirObservacion, registrarSubsanacionObservacion } from '../server/lib/observacionesWorkflow.js';
import { registrarSubsanacionDerivacion } from '../server/lib/trazabilidad.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';
import { DUENO_PERSISTENCIA_ESTADO } from '../server/lib/expedienteTransicion.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };
const fail = (c, m) => { assert.ok(!c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.6C — Eval obs → Registro subsana → Eval ===\n');

console.log('Piloto unitario subsanación');
const pilotSub = await applyPilotObservacionSubsanada({
  resp: { responsableTipo: TIPO_RESPONSABLE.UNIDAD },
  usuarioDestinoId: 913,
  metadata: {
    destino_etapa: 'EVALUACION',
    destino_persona: 'mgrande',
  },
  etapaEfectiva: 'REGISTRO',
  labels: { etapaCodigo: 'REGISTRO', estadoCodigo: 'OBSERVADO' },
});
ok(pilotSub.etapaEfectiva === 'EVALUACION', 'piloto mueve etapa efectiva a EVALUACION');
ok(pilotSub.labels.estadoCodigo === 'EN_TRAMITE', 'estado EN_TRAMITE (no OBSERVADO legacy)');
ok(pilotSub.resp.responsableTipo === TIPO_RESPONSABLE.PERSONA, 'responsable PERSONA');
ok(pilotSub.resp.responsableUsuarioId === 913, 'persona observador original');
ok(pilotSub.metaExtra.pilot_observacion_subsanada_retorno === true, 'flag piloto retorno');
fail(pilotSub.labels.estadoCodigo === 'CUADRO_EN_COORDINACION_CM', 'no COORDINACION_CM');

const pilotObs = applyPilotObservacionEvaluacionRegistro({
  resp: {},
  usuarioDestinoId: 249,
  metadata: {
    destino_submodulo: 'Registro de Requerimiento',
    destino_etapa: 'REGISTRO',
  },
  etapaEfectiva: 'EVALUACION',
  labels: {},
});
ok(pilotObs.etapaEfectiva === 'REGISTRO', 'observación previa mueve a REGISTRO');
ok(pilotObs.labels.estadoCodigo === 'OBSERVADO', 'observación deja OBSERVADO en Registro');

console.log('\nDueño único de persistencia');
const trazSrc = readFileSync(join(root, 'server/lib/trazabilidad.js'), 'utf8');
ok(trazSrc.includes("via: 'registrarSubsanacionDerivacion'"), 'subsanación vía transicionarExpediente');
ok(!/registrarSubsanacionDerivacion[\s\S]{0,1200}UPDATE requerimientos SET estado_actual/.test(trazSrc),
  'sin writer paralelo en registrarSubsanacionDerivacion');

console.log('\nIntegración Eval → obs → subsana → Eval');
try {
  await runMigrations();

  const { rows: directorRows } = await query(`
    SELECT id, username FROM usuarios
    WHERE activo = TRUE AND LOWER(username) = 'mgrande'
    LIMIT 1
  `);
  const { rows: auRows } = await query(`
    SELECT id, username FROM usuarios
    WHERE activo = TRUE AND username IS NOT NULL
    ORDER BY id LIMIT 3
  `);
  const directorId = directorRows[0]?.id || auRows[0]?.id;
  const auId = auRows.find((u) => Number(u.id) !== Number(directorId))?.id || auRows[0]?.id;
  if (!directorId) throw new Error('Sin usuarios de prueba');

  const codigo = `REQ-RC8176C-${Date.now()}`;
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, cmn)
    VALUES ('bienes', $1, 'Test RC8176C', 'Area', 'CNCC', 'En tramite de aprobación',
      '{"area":{"responsable":"CNCC"}}'::jsonb, 'CNCC')
    RETURNING id
  `, [codigo]);
  const rid = ins.rows[0].id;

  try {
    await query(`
      INSERT INTO expediente_estado_vigente (
        requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
        responsable_tipo, responsable_usuario_id, version, actualizado_at
      ) VALUES ($1, 'EVALUACION', 'Evaluación', 'EN_TRAMITE', 'En trámite', 'PERSONA', $2, 1, NOW())
    `, [rid, directorId]);

    await transicionarExpediente({
      requerimientoId: rid,
      evento: 'EVALUACION_OBSERVADA',
      usuarioDestinoId: auId,
      unidadDestino: 'Usuario AU',
      motivo: 'Observación de prueba RC8176C',
      metadata: {
        client_request_id: `test-rc8176c-obs:${rid}`,
        destino_submodulo: 'Registro de Requerimiento',
        destino_etapa: 'REGISTRO',
        destino_persona: auId,
        usuario_destino_id: auId,
      },
      actorRol: 'mgrande',
    });

    const despuesObs = await getExpedienteContratoUnificado(rid);
    ok(despuesObs.etapa?.codigo === 'REGISTRO', 'tras observación etapa REGISTRO');
    ok(despuesObs.estado?.codigo === 'OBSERVADO', 'tras observación estado OBSERVADO en Registro');

    let payload = { observaciones: [] };
    emitirObservacion(payload, {
      motivo: 'Observación de prueba RC8176C',
      gerente: 'mgrande',
      origen_submodulo: 'Evaluación de Requerimiento',
      destino_submodulo: 'Registro de Requerimiento',
      destino_etapa: 'REGISTRO',
    });
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [rid, JSON.stringify(payload)]);

    const subs = registrarSubsanacionObservacion(payload, {
      respuesta: 'Subsanación RC8176C',
      origen_submodulo: 'Registro de Requerimiento',
      usuario: 'wvasquez',
    });
    ok(subs.destinoEtapa === 'EVALUACION', 'payload subsanación destino EVALUACION');
    ok(subs.destinoPersona === 'mgrande', 'payload subsanación persona observador mgrande');
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [rid, JSON.stringify(payload)]);

    await registrarSubsanacionDerivacion({
      requerimientoId: rid,
      usuario: 'wvasquez',
      textoSubsanacion: 'Subsanación RC8176C',
      origenSubmodulo: 'Registro de Requerimiento',
      destinoSubmodulo: subs.destinoSubmodulo,
      destinoEtapa: subs.destinoEtapa,
      destinoPersona: subs.destinoPersona,
    });

    const c = await getExpedienteContratoUnificado(rid);
    ok(c.etapa?.codigo === 'EVALUACION', 'etapa final EVALUACION');
    ok(c.estado?.codigo === 'EN_TRAMITE', 'estado final EN_TRAMITE');
    ok(c.responsable?.tipo === 'PERSONA', 'responsable final PERSONA');
    ok(Number(c.responsable?.usuario_id || c.responsable?.id) === Number(directorId),
      'responsable final observador original (mgrande)');
    fail(String(c.estado?.codigo || '').includes('COORDINACION'), 'no COORDINACION_CM');
    fail(String(c.estado?.label || '').includes('C.C.'), 'label no C.C. en Coordinación CM');

    const { rows: ev } = await query(`
      SELECT evento_codigo, etapa_origen, etapa_destino, metadata
      FROM workflow_eventos
      WHERE expediente_id = $1 AND evento_codigo = 'OBSERVACION_SUBSANADA'
      ORDER BY id DESC LIMIT 1
    `, [rid]);
    ok(ev.length === 1, 'evento OBSERVACION_SUBSANADA registrado');
    ok(ev[0].etapa_origen === 'REGISTRO', 'evento origen REGISTRO');
    ok(ev[0].etapa_destino === 'EVALUACION', 'evento destino EVALUACION');
    ok(ev[0].metadata?.via === 'registrarSubsanacionDerivacion', 'metadata.via trazabilidad canónica');
    ok(ev[0].metadata?.dueno_persistencia === DUENO_PERSISTENCIA_ESTADO
      || ev[0].metadata?.rc86a === true, 'evento vía transicionarExpediente');
  } finally {
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]);
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]);
    await query('DELETE FROM requerimientos WHERE id = $1', [rid]);
  }
} catch (e) {
  console.log('  ⚠ integración BD:', e.message);
  if (process.env.CI) throw e;
  throw e;
}

console.log('\n✅ RC8.17.6C — OK\n');

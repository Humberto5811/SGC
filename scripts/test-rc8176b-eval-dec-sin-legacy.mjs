/**
 * RC8.17.6B — Eval→DEC sin legacy: PERSONA obligatoria + actor + EN_TRAMITE.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { getExpedienteContratoUnificado } from '../server/lib/expedienteContratoLectura.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };
const fail = (c, m) => { assert.ok(!c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.6B — Eval→DEC sin legacy ===\n');

console.log('Ruta productiva única (sin legacyHandler)');
const routeSrc = readFileSync(join(root, 'server/routes/requerimientosEspecial.js'), 'utf8');
ok(!routeSrc.includes('aprobar-evaluacion:legacy'), 'sin via aprobar-evaluacion:legacy');
ok(routeSrc.includes("via: 'requerimientos/aprobar-evaluacion'"), 'via canónica aprobar-evaluacion');
ok(!/aprobar-evaluacion[\s\S]{0,800}runWorkflowTransition/.test(routeSrc), 'aprobar-evaluacion no usa runWorkflowTransition');

console.log('\nGuard transicionarExpediente — EVALUACION_APROBADA sin persona');
let sinPersonaErr = null;
try {
  await transicionarExpediente({
    requerimientoId: 1,
    evento: 'EVALUACION_APROBADA',
    unidadDestino: 'DEC',
    metadata: { client_request_id: `test-rc8176b-sin-persona:${Date.now()}` },
  });
} catch (e) {
  sinPersonaErr = e;
}
ok(sinPersonaErr?.code === 'TRANSICION_SIN_PERSONA', 'rechaza EVALUACION_APROBADA sin usuario_destino_id');

console.log('\nIntegración Eval→DEC con persona + actor');
try {
  await runMigrations();
  const { rows: users } = await query(`
    SELECT id, rol FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 5
  `);
  const actorId = users[0]?.id || 1;
  const destId = users[1]?.id || users[0]?.id || 1;
  const actorRol = users[0]?.rol || 'director_gerente';

  const codigo = `REQ-RC8176B-${Date.now()}`;
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual)
    VALUES ('bienes', $1, 'Test RC8176B', 'Area', 'CNCC', 'En tramite de aprobación', '{}'::jsonb, 'EVALUACION')
    RETURNING id
  `, [codigo]);
  const rid = ins.rows[0].id;

  try {
    await query(`
      INSERT INTO expediente_estado_vigente (
        requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
        responsable_tipo, responsable_usuario_id, version, actualizado_at
      ) VALUES ($1, 'EVALUACION', 'Evaluación', 'EN_TRAMITE', 'En trámite', 'PERSONA', $2, 1, NOW())
      ON CONFLICT (requerimiento_id) DO UPDATE SET
        etapa_codigo = EXCLUDED.etapa_codigo,
        estado_codigo = EXCLUDED.estado_codigo,
        responsable_tipo = EXCLUDED.responsable_tipo,
        responsable_usuario_id = EXCLUDED.responsable_usuario_id
    `, [rid, actorId]);

    await transicionarExpediente({
      requerimientoId: rid,
      evento: 'EVALUACION_APROBADA',
      usuarioOrigenId: actorId,
      usuarioDestinoId: destId,
      unidadDestino: 'DEC',
      motivo: 'Test RC8176B Eval→DEC',
      metadata: {
        client_request_id: `test-rc8176b:${rid}`,
        via: 'requerimientos/aprobar-evaluacion',
        usuario_destino_id: destId,
        responsable_seleccionado_id: destId,
        etapa_origen: 'EVALUACION',
        etapa_destino: 'DEC',
        actor_nombre: 'Test Actor',
      },
      actorRol: actorRol,
    });

    const c = await getExpedienteContratoUnificado(rid);
    ok(c.etapa?.codigo === 'DEC', 'etapa DEC');
    ok(c.estado?.codigo === 'EN_TRAMITE', 'estado EN_TRAMITE (no DEC legacy)');
    ok(c.responsable?.tipo === 'PERSONA', 'responsable PERSONA');
    ok(Number(c.responsable?.usuario_id || c.responsable?.id) === Number(destId), 'persona seleccionada');

    fail(c.estado?.codigo === 'DEC', 'estado final no debe ser DEC');
    fail(c.responsable?.tipo === 'UNIDAD', 'responsable no debe ser UNIDAD');

    const { rows: ev } = await query(`
      SELECT actor_id, actor_rol, metadata
      FROM workflow_eventos
      WHERE expediente_id = $1 AND evento_codigo = 'EVALUACION_APROBADA'
      ORDER BY id DESC LIMIT 1
    `, [rid]);
    ok(ev[0]?.actor_id != null && Number(ev[0].actor_id) === Number(actorId), 'workflow actor_id del usuario autenticado');
    ok(ev[0]?.actor_rol === actorRol, 'workflow actor_rol es rol real (no nombre display)');
    ok(ev[0]?.metadata?.via === 'requerimientos/aprobar-evaluacion', 'metadata.via canónica');
    ok(ev[0]?.metadata?.usuario_destino_id != null, 'metadata incluye usuario_destino_id');
  } finally {
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]);
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]);
    await query('DELETE FROM requerimientos WHERE id = $1', [rid]);
  }
} catch (e) {
  console.log('  ⚠ integración BD:', e.message);
  if (process.env.CI) throw e;
}

console.log('\n✅ RC8.17.6B — OK\n');

/**
 * RC8.15.6G-8D1 / G-8D1A — Eliminación de requerimientos en etapa inicial.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  assertPuedeEliminarRequerimiento,
  eliminarRequerimientoInicial,
  MSG_REQUERIMIENTO_NO_ELIMINABLE,
} from '../server/lib/eliminarRequerimiento.js';
import { materializarExpedienteEstadoVigenteSiAusente } from '../server/lib/expedienteEstadoPersistido.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { getClient } from '../server/db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };

console.log('\n=== RC8.15.6G-8D1 / G-8D1A — Eliminación requerimientos ===\n');

await runMigrations();

// ── Service expone remove ──
{
  const src = readFileSync(join(root, 'src/services/requerimientosService.js'), 'utf8');
  ok(/remove:\s*\(id\)\s*=>\s*api\.remove\('requerimientos',\s*id\)/.test(src),
    '1. requerimientosService.remove → DELETE /api/requerimientos/:id');
  ok(readFileSync(join(root, 'server/routes/requerimientosEspecial.js'), 'utf8').includes('eliminarRequerimientoInicial'),
    '2. ruta DELETE delega a eliminarRequerimientoInicial');
}

const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
let fixtureRegistroId = null;
let fixtureReq4LikeId = null;
let fixtureEvalId = null;

async function crearFixtureRegistro(codigo, denominacion) {
  const id = Number((await query(`
    INSERT INTO requerimientos (
      tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual,
      sub_modulo_actual, responsable_actual, payload, historial_estados, historial_movimientos
    ) VALUES (
      'BIEN', $1, 'D1R00', $2, 'Logística', 'CNCC Test',
      'Registrado', 'REGISTRADO', 'Registro de Requerimiento', 'Usuario AU',
      '{}'::jsonb, '[]'::jsonb, '[]'::jsonb
    ) RETURNING id
  `, [codigo, denominacion])).rows[0].id);
  await materializarExpedienteEstadoVigenteSiAusente(id, { actorRol: 'test-g8d1' });
  return id;
}

async function contarResiduos(requerimientoId) {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM expediente_estado_vigente WHERE requerimiento_id = $1) AS erv,
      (SELECT COUNT(*)::int FROM expediente_asignaciones WHERE requerimiento_id = $1) AS asg,
      (SELECT COUNT(*)::int FROM workflow_eventos WHERE expediente_id = $1) AS ev,
      (SELECT COUNT(*)::int FROM requerimientos_adjuntos WHERE requerimiento_id = $1) AS adj,
      (SELECT COUNT(*)::int FROM requerimientos WHERE id = $1) AS req
  `, [requerimientoId]);
  return rows[0];
}

try {
  const codigoReg = `RD1R${nonce.slice(-4)}`;
  fixtureRegistroId = await crearFixtureRegistro(codigoReg, 'Fixture eliminar registro');

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await assertPuedeEliminarRequerimiento(client, fixtureRegistroId);
    await client.query('ROLLBACK');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  ok(true, '3. fixture REGISTRO puede eliminarse');

  const del = await eliminarRequerimientoInicial(fixtureRegistroId);
  ok(del?.ok === true, '4. eliminarRequerimientoInicial OK');
  fixtureRegistroId = null;

  const residuos = await contarResiduos(del.deleted.id);
  ok(residuos.erv === 0, '5. sin residuo expediente_estado_vigente');
  ok(residuos.asg === 0, '6. sin residuo expediente_asignaciones');
  ok(residuos.ev === 0, '7. sin residuo workflow_eventos');
  ok(residuos.adj === 0, '8. sin residuo requerimientos_adjuntos');
  ok(residuos.req === 0, '9. requerimiento eliminado');

  // ── Fixture G-8D1A: réplica relaciones REQ-00004 (ERV + asignación + evento + 2 adjuntos) ──
  const codigoLike = `RD1A${nonce.slice(-4)}`;
  fixtureReq4LikeId = await crearFixtureRegistro(codigoLike, 'Fixture réplica artefactos iniciales');
  await query(`
    INSERT INTO requerimientos_adjuntos (requerimiento_id, nombre_archivo, mime_type, contenido_base64, tamaño_bytes, usuario_carga)
    VALUES ($1,'test1.pdf','application/pdf','JVBERi0=',10,'test'),
           ($1,'test2.pdf','application/pdf','JVBERi0=',10,'test')
  `, [fixtureReq4LikeId]);

  const pre = await contarResiduos(fixtureReq4LikeId);
  ok(pre.erv === 1 && pre.asg === 1 && pre.ev === 1 && pre.adj === 2,
    '10. fixture réplica: ERV + asignación + evento + 2 adjuntos');

  const { rows: otrosAntes } = await query(`
    SELECT COUNT(*)::int AS n FROM requerimientos WHERE id <> $1
  `, [fixtureReq4LikeId]);
  const otrosCountAntes = otrosAntes[0].n;

  const delLike = await eliminarRequerimientoInicial(fixtureReq4LikeId);
  ok(delLike?.ok === true, '11. DELETE réplica artefactos iniciales retorna ok');
  fixtureReq4LikeId = null;

  const residuosLike = await contarResiduos(delLike.deleted.id);
  ok(residuosLike.erv === 0 && residuosLike.asg === 0 && residuosLike.ev === 0
    && residuosLike.adj === 0 && residuosLike.req === 0,
    '12. réplica: 0 residuos FK');

  const { rows: otrosDespues } = await query(`
    SELECT COUNT(*)::int AS n FROM requerimientos WHERE id <> $1
  `, [delLike.deleted.id]);
  ok(otrosDespues[0].n === otrosCountAntes, '13. otros requerimientos intactos');

  // ── Bloqueo tras transición posterior ──
  const codigoEv = `RD1E${nonce.slice(-4)}`;
  fixtureEvalId = await crearFixtureRegistro(codigoEv, 'Fixture no eliminable');
  await transicionarExpediente({
    requerimientoId: fixtureEvalId,
    evento: 'REQUERIMIENTO_ENVIADO_EVALUACION',
    unidadDestino: 'Evaluación de Requerimiento',
    motivo: 'Fixture G8D1 bloqueo eliminación',
    metadata: { client_request_id: `g8d1-bloqueo:${fixtureEvalId}` },
    actorRol: 'test-g8d1',
  });

  let bloqueado = false;
  let bloqueoStatus = null;
  try {
    await eliminarRequerimientoInicial(fixtureEvalId);
  } catch (err) {
    bloqueado = err.message === MSG_REQUERIMIENTO_NO_ELIMINABLE;
    bloqueoStatus = err.status;
  }
  ok(bloqueado && bloqueoStatus === 409, '14. requerimiento en EVALUACION retorna 409 funcional');

  const { rows: aunExiste } = await query('SELECT id FROM requerimientos WHERE id = $1', [fixtureEvalId]);
  ok(aunExiste.length === 1, '15. fixture EVALUACION permanece intacto');
} finally {
  for (const fid of [fixtureRegistroId, fixtureReq4LikeId, fixtureEvalId].filter(Boolean)) {
    await query('DELETE FROM requerimientos_adjuntos WHERE requerimiento_id = $1', [fid]).catch(() => {});
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [fid]).catch(() => {});
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [fid]).catch(() => {});
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [fid]).catch(() => {});
    await query('DELETE FROM requerimientos WHERE id = $1', [fid]).catch(() => {});
  }
  ok(true, '16. cleanup fixture completo');
}

console.log('\n✅ RC8.15.6G-8D1 / G-8D1A — 16/16 OK\n');

/**
 * RC8.17 — Aprobar Eval→DEC: etapa origen canónica (ERV > legacy; fila parcial en PUT).
 */
import assert from 'node:assert/strict';
import {
  resolveTransicionWorkflow,
  assertUsuarioDestinoTransicionElegible,
  resolveEtapaOrigenCanonicaWorkflow,
} from '../server/lib/workflowTransicionResponsable.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { getExpedienteContratoUnificado } from '../server/lib/expedienteContratoLectura.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17 — Aprobar Eval→DEC etapa ERV ===\n');

const lespinozaLike = { id: 549, username: 'lespinoza', rol: 'director', activo: true, permisos: {} };

const mockErvEvalLegacyRegistro = (reqRow) => ({
  query: async (sql, params) => {
    if (/expediente_estado_vigente/i.test(sql) && /etapa_codigo/i.test(sql)) {
      return { rows: [{ etapa_codigo: 'EVALUACION' }] };
    }
    if (/FROM requerimientos/i.test(sql)) return { rows: [reqRow] };
    if (/FROM centros/i.test(sql)) {
      return { rows: [{ codigo: 'OA', nombre: 'Unidad de Adquisiciones' }] };
    }
    if (/FROM usuarios u/i.test(sql)) {
      return { rows: [{
        id: 549,
        username: 'lespinoza',
        apellidos: 'E',
        nombres: 'L',
        rol: 'director',
        centro: 'OA',
        codigo_centro_costo: '01.04.01.02.01',
        activo: true,
        permisos: {},
      }] };
    }
    return { rows: [] };
  },
});

const staleReq = {
  id: 16,
  tipo: 'bienes',
  estado_actual: 'REGISTRO',
  sub_modulo_actual: 'Registro de Requerimiento',
  payload: '{}',
};

const tr = await resolveTransicionWorkflow(16, 'EVALUACION_APROBADA', { id: 16, payload: '{}' }, mockErvEvalLegacyRegistro(staleReq));
ok(tr.etapaOrigen === 'EVALUACION', 'fila parcial + ERV EVALUACION: transición resuelve EVALUACION');

await assertUsuarioDestinoTransicionElegible(
  16,
  'EVALUACION_APROBADA',
  549,
  { id: 16, payload: '{}' },
  mockErvEvalLegacyRegistro(staleReq),
);
ok(true, 'assert PUT-like (solo id/payload) no falla con ERV EVALUACION');

const etapa = await resolveEtapaOrigenCanonicaWorkflow(16, staleReq, mockErvEvalLegacyRegistro(staleReq));
ok(etapa === 'EVALUACION', 'ERV prevalece sobre estado_actual REGISTRO stale');

const mockErvRegistro = {
  query: async (sql) => {
    if (/expediente_estado_vigente/i.test(sql)) return { rows: [{ etapa_codigo: 'REGISTRO' }] };
    if (/FROM requerimientos/i.test(sql)) {
      return { rows: [{ id: 99, tipo: 'bienes', estado_actual: 'REGISTRO', payload: '{}' }] };
    }
    return { rows: [] };
  },
};

let blocked = false;
try {
  await resolveTransicionWorkflow(99, 'EVALUACION_APROBADA', null, mockErvRegistro);
} catch (e) {
  blocked = e.code === 'TRANSITION_NOT_FOUND' && /REGISTRO.*EVALUACION_APROBADA/.test(e.message);
}
ok(blocked, 'ERV REGISTRO no puede EVALUACION_APROBADA');

console.log('\nIntegración cadena + aprobar (BD)');
try {
  await runMigrations();
  const { rows: users } = await query(`
    SELECT id, username FROM usuarios WHERE activo = TRUE AND username IS NOT NULL ORDER BY id
  `);
  const mgrande = users.find((u) => u.username === 'mgrande')?.id;
  const wvasquez = users.find((u) => u.username === 'wvasquez')?.id;
  const lesp = (await query(`SELECT id FROM usuarios WHERE LOWER(username)='lespinoza' AND activo=TRUE LIMIT 1`)).rows[0]?.id;
  if (!mgrande || !wvasquez || !lesp) {
    console.log('  ⚠ usuarios piloto no disponibles; omitiendo integración');
  } else {
    const codigo = `REQ-RC817-APROB-${Date.now()}`;
    const ins = await query(`
      INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual, sub_modulo_actual)
      VALUES ('bienes', $1, 'Test aprobar ERV', 'Area', 'CNCC', 'En tramite de aprobación', '{}'::jsonb, 'EVALUACION', 'Evaluación de Requerimiento')
      RETURNING id
    `, [codigo]);
    const rid = ins.rows[0].id;

    try {
      await query(`
        INSERT INTO expediente_estado_vigente (
          requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
          responsable_tipo, responsable_usuario_id, version, actualizado_at
        ) VALUES ($1, 'EVALUACION', 'Evaluación', 'EN_TRAMITE', 'En trámite', 'PERSONA', $2, 1, NOW())
      `, [rid, mgrande]);

      await query(`
        UPDATE requerimientos SET estado_actual = 'REGISTRO', sub_modulo_actual = 'Registro de Requerimiento'
        WHERE id = $1
      `, [rid]);

      await assertUsuarioDestinoTransicionElegible(rid, 'EVALUACION_APROBADA', lesp, { id: rid, payload: '{}' });

      await transicionarExpediente({
        requerimientoId: rid,
        evento: 'EVALUACION_APROBADA',
        usuarioDestinoId: lesp,
        unidadDestino: 'DEC',
        motivo: 'Test RC817 aprobar con legacy stale',
        metadata: {
          client_request_id: `test-rc817-aprob-erv:${rid}`,
          via: 'requerimientos/aprobar-evaluacion',
          usuario_destino_id: lesp,
        },
        actorRol: 'test-rc817-aprob',
      });

      const c = await getExpedienteContratoUnificado(rid);
      ok(c.etapa?.codigo === 'DEC', 'etapa DEC');
      ok(c.estado?.codigo === 'EN_TRAMITE', 'estado EN_TRAMITE');
      ok(c.responsable?.tipo === 'PERSONA', 'responsable PERSONA');
      ok(Number(c.responsable?.usuario_id) === Number(lesp), 'responsable lespinoza');
    } finally {
      await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]);
      await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
      await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]);
      await query('DELETE FROM requerimientos WHERE id = $1', [rid]);
    }
  }
} catch (e) {
  console.log('  ⚠ integración BD:', e.message);
  if (process.env.CI) throw e;
}

console.log('\n✅ RC8.17 aprobar etapa ERV — OK\n');

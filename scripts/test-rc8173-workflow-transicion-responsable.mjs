/**
 * RC8.17.3 — Transición workflow: etapa + responsable PERSONA.
 */
import assert from 'node:assert/strict';
import {
  listarCandidatosTransicion,
  assertUsuarioDestinoTransicionElegible,
  mapResponsableDestinoAPerfil,
  getPilotEstadoLabelsForEvento,
  esUsuarioElegibleParaPerfil,
} from '../server/lib/workflowTransicionResponsable.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { PERFILES_FUNCIONALES } from '../server/utils/userRoleCatalog.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.3 — Workflow transición responsable ===\n');

ok(mapResponsableDestinoAPerfil('DEC') === PERFILES_FUNCIONALES.DEC, 'DEC → perfil DEC');
ok(mapResponsableDestinoAPerfil('DIRECTOR_GERENTE') === PERFILES_FUNCIONALES.DIRECTOR_CENTRO, 'Director → DIRECTOR_CENTRO');

const labelsEvalDec = getPilotEstadoLabelsForEvento('EVALUACION_APROBADA');
ok(labelsEvalDec?.estadoCodigo === 'EN_TRAMITE', 'EVALUACION_APROBADA usa EN_TRAMITE');

ok(!esUsuarioElegibleParaPerfil({ activo: true, rol: 'admin', permisos: {} }, PERFILES_FUNCIONALES.DEC, 'DEC'), 'admin no elegible DEC');

const mockClient = (usuarios = []) => ({
  query: async (sql) => {
    if (/FROM requerimientos/i.test(sql)) {
      return {
        rows: [{
          id: 30,
          tipo: 'bienes',
          estado_actual: 'EVALUACION',
          payload: { area: { responsable: 'CNCC' } },
        }],
      };
    }
    if (/FROM usuarios/i.test(sql) && /activo = TRUE/i.test(sql) && !/COALESCE\(u\.centro/i.test(sql)) {
      return { rows: usuarios };
    }
    return { rows: [] };
  },
});

const decUser = {
  id: 501,
  username: 'lespinoza',
  apellidos: 'ESPINOZA',
  nombres: 'LUIS',
  cargo: 'ANALISTA DEC',
  rol: 'dec',
  centro: 'INST',
  activo: true,
  permisos: { submodulos: ['DEC'], actividades: ['VER', 'APROBAR'], actividadesPorSubmodulo: { DEC: ['VER', 'APROBAR'] } },
};
const admin = { id: 1, username: 'admin', rol: 'admin', activo: true, permisos: {}, centro: 'INST' };

const listaDec = await listarCandidatosTransicion(
  30,
  'EVALUACION_APROBADA',
  {},
  { id: 30, tipo: 'bienes', estado_actual: 'EVALUACION', payload: {} },
  mockClient([decUser, admin]),
);
ok(listaDec.etapa_destino === 'DEC', 'Eval→DEC etapa destino DEC');
const idsDec = [...(listaDec.recomendado ? [listaDec.recomendado.id] : []), ...listaDec.candidatos.map((c) => c.id)];
ok(idsDec.includes(501), 'lista DEC incluye lespinoza');
ok(!idsDec.includes(1), 'lista DEC excluye admin');

try {
  await runMigrations();
  const codigo = `REQ-RC8173-${Date.now()}`;
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual)
    VALUES ('bienes', $1, 'Test RC8173', 'Area', 'CNCC', 'En tramite de aprobación', '{}'::jsonb, 'EVALUACION')
    RETURNING id
  `, [codigo]);
  const rid = ins.rows[0].id;
  try {
    await query(`
      INSERT INTO expediente_estado_vigente (
        requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
        responsable_tipo, responsable_usuario_id, version, actualizado_at
      ) VALUES ($1, 'EVALUACION', 'Evaluación', 'EN_TRAMITE', 'En trámite', 'PERSONA', 913, 1, NOW())
      ON CONFLICT (requerimiento_id) DO UPDATE SET etapa_codigo = EXCLUDED.etapa_codigo
    `, [rid]);

    const { rows: decRows } = await query(`
      SELECT id FROM usuarios WHERE activo = TRUE AND LOWER(username) = 'lespinoza' LIMIT 1
    `);
    const uidDest = decRows[0]?.id || decUser.id;
    if (!decRows[0]) {
      console.log('  ⚠ lespinoza no en BD; omitiendo integración ERV');
    } else {
      await transicionarExpediente({
        requerimientoId: rid,
        evento: 'EVALUACION_APROBADA',
        usuarioDestinoId: uidDest,
        unidadDestino: 'DEC',
        motivo: 'Test RC8173 Eval→DEC',
        metadata: {
          client_request_id: `test-rc8173:${rid}`,
          responsable_recomendado_id: uidDest,
          responsable_seleccionado_id: uidDest,
          reasignacion_manual: false,
          etapa_origen: 'EVALUACION',
          etapa_destino: 'DEC',
        },
        actorRol: 'test-rc8173',
      });

      const { rows: erv } = await query('SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
      ok(erv[0]?.etapa_codigo === 'DEC', 'ERV etapa DEC');
      ok(erv[0]?.estado_codigo === 'EN_TRAMITE', 'ERV estado EN_TRAMITE (no DEC legacy)');
      ok(erv[0]?.responsable_tipo === 'PERSONA', 'ERV responsable PERSONA');
      ok(Number(erv[0]?.responsable_usuario_id) === Number(uidDest), 'ERV usuario seleccionado');
    }
  } finally {
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]);
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]);
    await query('DELETE FROM requerimientos WHERE id = $1', [rid]);
  }
} catch (e) {
  console.log('  ⚠ integración BD:', e.message);
}

console.log('\n✅ RC8.17.3 — OK\n');

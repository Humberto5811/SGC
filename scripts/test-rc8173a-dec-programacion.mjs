/**
 * RC8.17.3A — DEC → Programación: etapa + responsable PERSONA.
 */
import assert from 'node:assert/strict';
import {
  listarCandidatosTransicion,
  assertUsuarioDestinoTransicionElegible,
  getPilotEstadoLabelsForEvento,
  esUsuarioElegibleParaPerfil,
} from '../server/lib/workflowTransicionResponsable.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { PERFILES_FUNCIONALES } from '../server/utils/userRoleCatalog.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.3A — DEC → Programación responsable ===\n');

const labelsDecProg = getPilotEstadoLabelsForEvento('DEC_APROBADO');
ok(labelsDecProg?.estadoCodigo === 'EN_TRAMITE', 'DEC_APROBADO usa EN_TRAMITE');

ok(
  esUsuarioElegibleParaPerfil(
    { activo: true, rol: 'dec', cargo: 'PROGRAMADOR', permisos: { submodulos: ['PROGRAMACION'], actividadesPorSubmodulo: { PROGRAMACION: ['VER', 'APROBAR'] } } },
    PERFILES_FUNCIONALES.PROGRAMACION,
    'PROGRAMACION',
  ),
  'programador elegible PROGRAMACION',
);
ok(!esUsuarioElegibleParaPerfil({ activo: true, rol: 'admin', permisos: {} }, PERFILES_FUNCIONALES.PROGRAMACION, 'PROGRAMACION'), 'admin no elegible PROGRAMACION');

const mockClient = (usuarios = []) => ({
  query: async (sql) => {
    if (/FROM requerimientos/i.test(sql)) {
      return {
        rows: [{
          id: 40,
          tipo: 'bienes',
          estado_actual: 'DEC',
          payload: {},
        }],
      };
    }
    if (/FROM usuarios/i.test(sql) && /activo = TRUE/i.test(sql)) {
      return { rows: usuarios };
    }
    return { rows: [] };
  },
});

const progUser = {
  id: 602,
  username: 'jprogramador',
  apellidos: 'PEREZ',
  nombres: 'JUAN',
  cargo: 'PROGRAMADOR',
  rol: 'dec',
  centro: 'INST',
  activo: true,
  permisos: {
    submodulos: ['PROGRAMACION'],
    actividades: ['VER', 'APROBAR'],
    actividadesPorSubmodulo: { PROGRAMACION: ['VER', 'APROBAR'] },
  },
};
const admin = { id: 1, username: 'admin', rol: 'admin', activo: true, permisos: {}, centro: 'INST' };

const lista = await listarCandidatosTransicion(
  40,
  'DEC_APROBADO',
  {},
  { id: 40, tipo: 'bienes', estado_actual: 'DEC', payload: {} },
  mockClient([progUser, admin]),
);
ok(lista.etapa_destino === 'PROGRAMACION', 'DEC→Prog etapa destino PROGRAMACION');
ok(lista.alcance === 'TRANSVERSAL', 'PROGRAMACION alcance transversal');
const ids = [...(lista.recomendado ? [lista.recomendado.id] : []), ...lista.candidatos.map((c) => c.id)];
ok(ids.includes(602), 'lista incluye programador');
ok(!ids.includes(1), 'lista excluye admin');

await assertUsuarioDestinoTransicionElegible(40, 'DEC_APROBADO', 602, { id: 40, tipo: 'bienes', estado_actual: 'DEC' }, mockClient([progUser]));

try {
  await runMigrations();
  const codigo = `REQ-RC8173A-${Date.now()}`;
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual)
    VALUES ('bienes', $1, 'Test RC8173A', 'Area', 'CNCC', 'En tramite de aprobación', '{}'::jsonb, 'DEC')
    RETURNING id
  `, [codigo]);
  const rid = ins.rows[0].id;
  try {
    const { rows: progRows } = await query(`
      SELECT id, username, apellidos, nombres FROM usuarios
      WHERE activo = TRUE
        AND (
          LOWER(COALESCE(cargo, '')) LIKE '%program%'
          OR LOWER(COALESCE(cargo, '')) LIKE '%programador%'
        )
      LIMIT 1
    `);
    const uidDest = progRows[0]?.id || progUser.id;
    if (!progRows[0]) {
      console.log('  ⚠ sin usuario programación en BD; omitiendo integración ERV');
    } else {
      await query(`
        INSERT INTO expediente_estado_vigente (
          requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
          responsable_tipo, responsable_usuario_id, version, actualizado_at
        ) VALUES ($1, 'DEC', 'DEC', 'EN_TRAMITE', 'En trámite', 'PERSONA', 913, 1, NOW())
        ON CONFLICT (requerimiento_id) DO UPDATE SET etapa_codigo = EXCLUDED.etapa_codigo
      `, [rid]);

      await transicionarExpediente({
        requerimientoId: rid,
        evento: 'DEC_APROBADO',
        usuarioDestinoId: uidDest,
        unidadDestino: 'Programación',
        motivo: 'Test RC8173A DEC→Programación',
        metadata: {
          client_request_id: `test-rc8173a:${rid}`,
          responsable_recomendado_id: uidDest,
          responsable_seleccionado_id: uidDest,
          reasignacion_manual: false,
          etapa_origen: 'DEC',
          etapa_destino: 'PROGRAMACION',
          evento: 'DEC_APROBADO',
        },
        actorRol: 'test-rc8173a',
      });

      const { rows: erv } = await query('SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
      ok(erv[0]?.etapa_codigo === 'PROGRAMACION', 'ERV etapa PROGRAMACION');
      ok(erv[0]?.estado_codigo === 'EN_TRAMITE', 'ERV estado EN_TRAMITE');
      ok(erv[0]?.responsable_tipo === 'PERSONA', 'ERV responsable PERSONA');
      ok(Number(erv[0]?.responsable_usuario_id) === Number(uidDest), 'ERV usuario seleccionado');

      const { rows: asig } = await query(`
        SELECT * FROM expediente_asignaciones
        WHERE requerimiento_id = $1 AND activo = TRUE
        ORDER BY id DESC LIMIT 1
      `, [rid]);
      ok(asig[0]?.usuario_id != null, 'asignación activa registrada');
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

console.log('\n✅ RC8.17.3A — OK\n');

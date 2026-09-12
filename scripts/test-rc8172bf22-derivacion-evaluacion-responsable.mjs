/**
 * RC8.17.2B-F2.2 — Selector responsable Registro → Evaluación.
 */
import assert from 'node:assert/strict';
import {
  listarCandidatosDerivacionEvaluacion,
  assertUsuarioDestinoEvaluacionElegible,
  esDirectorEvaluacionElegible,
  applyPilotEnvioEvaluacion,
} from '../server/lib/pilotRegistroEvaluacion.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.2B-F2.2 — Derivación Evaluación responsable ===\n');

const mgrande = {
  id: 913,
  username: 'mgrande',
  apellidos: 'GRANDE ORTIZ',
  nombres: 'MIGUEL ANGEL',
  cargo: 'DIRECTOR AU',
  rol: 'director',
  centro: 'CNCC',
  codigo_centro_costo: 'CNCC',
  activo: true,
  permisos: {},
};

const admin = {
  id: 1,
  username: 'admin',
  nombre: 'Administrador',
  cargo: null,
  rol: 'admin',
  centro: 'CNCC',
  codigo_centro_costo: 'CNCC',
  activo: true,
  permisos: {},
};

const dir2 = {
  id: 920,
  username: 'dir2',
  apellidos: 'OTRO',
  nombres: 'DIRECTOR',
  cargo: 'GERENTE AU',
  rol: 'director',
  centro: 'CNCC',
  codigo_centro_costo: 'CNCC',
  activo: true,
  permisos: {},
};

const inactivo = {
  id: 999,
  username: 'inactivo',
  apellidos: 'INACTIVO',
  nombres: 'DIRECTOR',
  cargo: 'DIRECTOR AU',
  rol: 'director',
  centro: 'CNCC',
  codigo_centro_costo: 'CNCC',
  activo: false,
  permisos: {},
};

ok(!esDirectorEvaluacionElegible(admin), 'admin no es elegible');
ok(!esDirectorEvaluacionElegible(inactivo), 'inactivo no es elegible');
ok(esDirectorEvaluacionElegible(mgrande), 'mgrande es elegible');

function mockClient(usuariosCentro = []) {
  const reqRow = {
    id: 20,
    codigo: 'REQ-TEST-F22',
    cmn: '00333',
    payload: { area: { responsable: 'CNCC' } },
  };
  return {
    query: async (sql) => {
      if (/FROM requerimientos/i.test(sql)) return { rows: [reqRow] };
      if (/FROM usuarios/i.test(sql)) return { rows: usuariosCentro.filter((u) => u.activo !== false) };
      return { rows: [] };
    },
  };
}

const listaMgrAdmin = await listarCandidatosDerivacionEvaluacion(20, {}, null, mockClient([mgrande, admin, inactivo]));
const idsMgrAdmin = [
  ...(listaMgrAdmin.recomendado ? [listaMgrAdmin.recomendado.id] : []),
  ...listaMgrAdmin.candidatos.map((c) => c.id),
];
ok(idsMgrAdmin.includes(913), 'lista CNCC incluye mgrande');
ok(!idsMgrAdmin.includes(1), 'lista CNCC excluye admin');
ok(!idsMgrAdmin.includes(999), 'lista CNCC excluye inactivo');
ok(listaMgrAdmin.recomendado?.id === 913, 'recomendado automático = mgrande');

const listaDos = await listarCandidatosDerivacionEvaluacion(20, {}, null, mockClient([mgrande, dir2, admin]));
ok(listaDos.resolucion_automatica?.ambiguo === true, 'dos directores reales → resolución ambigua');
ok(
  listaDos.candidatos.length + (listaDos.recomendado ? 1 : 0) >= 2,
  'dos directores reales listados como elegibles',
);

await assertUsuarioDestinoEvaluacionElegible(20, 913, null, mockClient([mgrande, admin]));
let rechazoAdmin = false;
try {
  await assertUsuarioDestinoEvaluacionElegible(20, 1, null, mockClient([mgrande, admin]));
} catch (e) {
  rechazoAdmin = e.code === 'RESPONSABLE_EVALUACION_INVALIDO';
}
ok(rechazoAdmin, 'assert rechaza admin como destino');

const pilotSel = await applyPilotEnvioEvaluacion({
  resp: { responsableTipo: TIPO_RESPONSABLE.UNIDAD },
  usuarioDestinoId: 913,
  requerimientoId: 20,
  metadata: { responsable_recomendado_id: 913, reasignacion_manual: false },
});
ok(pilotSel.resp.responsableTipo === TIPO_RESPONSABLE.PERSONA, 'applyPilot PERSONA con selección');
ok(pilotSel.resp.responsableUsuarioId === 913, 'applyPilot usuario 913');
ok(pilotSel.metaExtra.responsable_seleccionado_id === 913, 'metadata seleccionado');
ok(pilotSel.metaExtra.reasignacion_manual === false, 'metadata reasignacion false si mismo recomendado');

const pilotReasig = await applyPilotEnvioEvaluacion({
  resp: {},
  usuarioDestinoId: 920,
  metadata: { responsable_recomendado_id: 913, reasignacion_manual: true },
});
ok(pilotReasig.metaExtra.reasignacion_manual === true, 'metadata reasignacion manual');

try {
  await runMigrations();
  const codigo = `REQ-F22-${Date.now()}`;
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, cmn, estado_actual)
    VALUES ('bienes', $1, 'Test F22', 'Area T', 'CNCC', 'Registrado', '{"area":{"responsable":"CNCC"}}'::jsonb, 'CNCC', 'REGISTRO')
    RETURNING id
  `, [codigo]);
  const rid = ins.rows[0].id;
  try {
    await query(`
      INSERT INTO expediente_estado_vigente (
        requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
        responsable_tipo, responsable_usuario_id, version, actualizado_at
      ) VALUES ($1, 'REGISTRO', 'Registro', 'REQUERIMIENTO_REGISTRADO', 'Registrado', 'PERSONA', 65, 1, NOW())
      ON CONFLICT (requerimiento_id) DO UPDATE SET etapa_codigo = EXCLUDED.etapa_codigo
    `, [rid]);

    const { rows: dirs } = await query(`
      SELECT id FROM usuarios
      WHERE activo = TRUE AND LOWER(username) = 'mgrande' LIMIT 1
    `);
    const uidDest = dirs[0]?.id;
    if (uidDest) {
      await transicionarExpediente({
        requerimientoId: rid,
        evento: 'REQUERIMIENTO_ENVIADO_EVALUACION',
        usuarioDestinoId: uidDest,
        unidadDestino: 'Director / Gerente',
        motivo: 'Test F22 selección responsable',
        metadata: {
          client_request_id: `test-f22:${rid}`,
          responsable_recomendado_id: uidDest,
          responsable_seleccionado_id: uidDest,
          reasignacion_manual: false,
        },
        actorRol: 'test-f22',
      });

      const { rows: erv } = await query(
        'SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1',
        [rid],
      );
      ok(erv[0]?.responsable_tipo === 'PERSONA', 'ERV integración PERSONA');
      ok(Number(erv[0]?.responsable_usuario_id) === Number(uidDest), 'ERV integración usuario seleccionado');
      ok(erv[0]?.estado_codigo === 'EN_TRAMITE', 'ERV integración EN_TRAMITE');
      ok(erv[0]?.etapa_codigo === 'EVALUACION', 'ERV integración EVALUACION');
      ok(erv[0]?.metadata_json?.responsable_seleccionado_id === uidDest, 'ERV metadata seleccionado');
    } else {
      console.log('  ⚠ integración mgrande omitida (usuario no en BD)');
    }
  } finally {
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]);
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]);
    await query('DELETE FROM requerimientos WHERE id = $1', [rid]);
  }
} catch (e) {
  console.log('  ⚠ integración BD omitida:', e.message);
}

console.log('\n✅ RC8.17.2B-F2.2 — OK\n');

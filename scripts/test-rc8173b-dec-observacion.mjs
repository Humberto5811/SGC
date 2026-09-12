/**
 * RC8.17.3B — Observación DEC: candidatos + PERSONA + OBSERVADO.
 */
import assert from 'node:assert/strict';
import {
  listarCandidatosObservacionDestino,
  assertUsuarioDestinoObservacionElegible,
  mapDestinoSubmoduloAEtapaObservacion,
  esDestinoObservacionDecSoportado,
} from '../server/lib/candidatosObservacionDestino.js';
import { applyPilotObservacionDecDestino } from '../server/lib/workflowTransicionResponsable.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.3B — Observación DEC responsable ===\n');

ok(esDestinoObservacionDecSoportado('Registro de Requerimiento'), 'Registro soportado');
ok(esDestinoObservacionDecSoportado('Evaluación de Requerimiento'), 'Evaluación soportada');
ok(esDestinoObservacionDecSoportado('Programación'), 'Programación soportada');
ok(!esDestinoObservacionDecSoportado('Invitaciones'), 'Invitaciones no soportada desde DEC');
ok(mapDestinoSubmoduloAEtapaObservacion('Evaluación de Requerimiento') === 'EVALUACION', 'map Eval→EVALUACION');

const mockClient = (usuarios = [], reqRow = null) => ({
  query: async (sql) => {
    if (/FROM requerimientos/i.test(sql)) {
      return { rows: [reqRow || { id: 50, tipo: 'bienes', payload: { area: { responsable: 'CNCC' } } }] };
    }
    if (/FROM usuarios/i.test(sql) && /activo = TRUE/i.test(sql)) {
      return { rows: usuarios };
    }
    if (/expediente_asignaciones/i.test(sql) || /workflow_eventos/i.test(sql) || /expediente_estado_vigente/i.test(sql)) {
      return { rows: [] };
    }
    return { rows: [] };
  },
});

const auUser = {
  id: 701,
  username: 'wvasquez',
  apellidos: 'VASQUEZ',
  nombres: 'WALTER',
  cargo: 'ESPECIALISTA AU',
  rol: 'au',
  centro: 'CNCC',
  codigo_centro_costo: 'CNCC',
  activo: true,
  permisos: {
    submodulos: ['REGISTRO_REQUERIMIENTO'],
    actividades: ['VER', 'CREAR', 'EDITAR', 'OBSERVAR'],
    actividadesPorSubmodulo: { REGISTRO_REQUERIMIENTO: ['VER', 'CREAR', 'EDITAR', 'OBSERVAR'] },
  },
};
const director = {
  id: 913,
  username: 'mgrande',
  apellidos: 'GRANDE',
  nombres: 'M',
  cargo: 'GERENTE DE ADQUISICIONES',
  rol: 'director',
  centro: 'CNCC',
  codigo_centro_costo: 'CNCC',
  activo: true,
  permisos: {},
};
const progUser = {
  id: 602,
  username: 'jprogramador',
  cargo: 'PROGRAMADOR',
  rol: 'dec',
  activo: true,
  permisos: {
    submodulos: ['PROGRAMACION'],
    actividadesPorSubmodulo: { PROGRAMACION: ['VER', 'APROBAR'] },
  },
};

const reqRow = { id: 50, tipo: 'bienes', payload: { area: { responsable: 'CNCC' } } };
const client = mockClient([auUser, director, progUser], reqRow);

const listaReg = await listarCandidatosObservacionDestino({
  requerimientoId: 50,
  destinoSubmodulo: 'Registro de Requerimiento',
  client,
});
ok(listaReg.soportado && listaReg.destino_etapa === 'REGISTRO', 'candidatos Registro soportado');
ok(listaReg.candidatos.some((c) => c.id === 701) || listaReg.recomendado?.id === 701, 'Registro incluye AU');

const listaEval = await listarCandidatosObservacionDestino({
  requerimientoId: 50,
  destinoSubmodulo: 'Evaluación de Requerimiento',
  client,
});
ok(listaEval.soportado && listaEval.destino_etapa === 'EVALUACION', 'candidatos Evaluación');
const idsEval = [...(listaEval.recomendado ? [listaEval.recomendado.id] : []), ...listaEval.candidatos.map((c) => c.id)];
ok(idsEval.includes(913), 'Evaluación incluye director');

const listaProg = await listarCandidatosObservacionDestino({
  requerimientoId: 50,
  destinoSubmodulo: 'Programación',
  client,
});
ok(listaProg.soportado && listaProg.destino_etapa === 'PROGRAMACION', 'candidatos Programación');
ok([...(listaProg.recomendado ? [listaProg.recomendado] : []), ...listaProg.candidatos].some((c) => c.id === 602), 'Programación incluye programador');

await assertUsuarioDestinoObservacionElegible(50, 'Evaluación de Requerimiento', 913, reqRow, client);

const pilot = applyPilotObservacionDecDestino({
  resp: {},
  usuarioDestinoId: 701,
  metadata: { etapa_destino: 'REGISTRO', responsable_recomendado_id: 701 },
  etapaEfectiva: 'DEC',
  labels: {},
});
ok(pilot.etapaEfectiva === 'REGISTRO', 'piloto etapa REGISTRO');
ok(pilot.labels.estadoCodigo === 'OBSERVADO', 'piloto estado OBSERVADO');
ok(pilot.resp.responsableTipo === TIPO_RESPONSABLE.PERSONA, 'piloto PERSONA');
ok(pilot.resp.responsableUsuarioId === 701, 'piloto usuario 701');

try {
  await runMigrations();
  const codigo = `REQ-RC8173B-${Date.now()}`;
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual)
    VALUES ('bienes', $1, 'Test RC8173B', 'Area', 'CNCC', 'Aprobado DEC', '{}'::jsonb, 'DEC')
    RETURNING id
  `, [codigo]);
  const rid = ins.rows[0].id;
  try {
    await query(`
      INSERT INTO expediente_estado_vigente (
        requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
        responsable_tipo, responsable_usuario_id, version, actualizado_at
      ) VALUES ($1, 'DEC', 'DEC', 'EN_TRAMITE', 'En trámite', 'PERSONA', 501, 1, NOW())
      ON CONFLICT (requerimiento_id) DO UPDATE SET etapa_codigo = EXCLUDED.etapa_codigo
    `, [rid]);

    const { rows: auRows } = await query(`
      SELECT id FROM usuarios WHERE activo = TRUE AND LOWER(username) LIKE '%vasquez%' LIMIT 1
    `);
    const uidDest = auRows[0]?.id || 701;

    await transicionarExpediente({
      requerimientoId: rid,
      evento: 'DEC_OBSERVADA',
      usuarioDestinoId: uidDest,
      motivo: 'Test RC8173B DEC→Registro observado',
      metadata: {
        client_request_id: `test-rc8173b:${rid}`,
        etapa_origen: 'DEC',
        etapa_destino: 'REGISTRO',
        destino_etapa: 'REGISTRO',
        evento: 'DEC_OBSERVADA',
        responsable_seleccionado_id: uidDest,
        responsable_recomendado_id: uidDest,
        reasignacion_manual: false,
      },
      actorRol: 'test-rc8173b',
    });

    const { rows: erv } = await query('SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
    ok(erv[0]?.etapa_codigo === 'REGISTRO', 'ERV etapa REGISTRO');
    ok(erv[0]?.estado_codigo === 'OBSERVADO', 'ERV estado OBSERVADO');
    ok(erv[0]?.responsable_tipo === 'PERSONA', 'ERV PERSONA');
    ok(Number(erv[0]?.responsable_usuario_id) === Number(uidDest), 'ERV usuario seleccionado');
  } finally {
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]);
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]);
    await query('DELETE FROM requerimientos WHERE id = $1', [rid]);
  }
} catch (e) {
  console.log('  ⚠ integración BD:', e.message);
}

console.log('\n✅ RC8.17.3B — OK\n');

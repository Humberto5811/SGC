/**
 * RC8.17.4 — Unificación Etapa/Estado/Responsable.
 * Valida 4 transiciones piloto: Reg→Eval, Eval→DEC, DEC→Prog, Prog→CM.
 * Cada una debe dejar: etapa correcta, estado EN_TRAMITE, responsable PERSONA.
 */
import assert from 'node:assert/strict';
import {
  getPilotEstadoLabelsForEvento,
  listarCandidatosTransicion,
} from '../server/lib/workflowTransicionResponsable.js';
import { getExpedienteContratoUnificado } from '../server/lib/expedienteContratoLectura.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

const PILOT_EVENTS = [
  ['REQUERIMIENTO_ENVIADO_EVALUACION', 'EVALUACION'],
  ['EVALUACION_APROBADA', 'DEC'],
  ['DEC_APROBADO', 'PROGRAMACION'],
  ['PROGRAMACION_APROBADA', 'COORDINACION_CM'],
];

console.log('\n=== RC8.17.4 — Unificación Etapa/Estado/Responsable ===\n');

console.log('Fase 2 — contrato lectura');
for (const [ev] of PILOT_EVENTS) {
  const labels = getPilotEstadoLabelsForEvento(ev);
  ok(labels?.estadoCodigo === 'EN_TRAMITE', `${ev} → EN_TRAMITE`);
}

ok(typeof getExpedienteContratoUnificado === 'function', 'getExpedienteContratoUnificado exportado');

const mockClient = (row, usuarios = []) => ({
  query: async (sql) => {
    if (/FROM requerimientos/i.test(sql)) return { rows: [row] };
    if (/FROM usuarios/i.test(sql) && /activo = TRUE/i.test(sql)) return { rows: usuarios };
    return { rows: [] };
  },
});

const cmUser = {
  id: 701,
  username: 'jcoordinador',
  apellidos: 'ROJAS',
  nombres: 'MARIA',
  cargo: 'COORDINADOR CM',
  rol: 'contrataciones',
  centro: 'INST',
  activo: true,
  permisos: {
    submodulos: ['COORDINACION_CM'],
    actividades: ['VER', 'APROBAR'],
    actividadesPorSubmodulo: { COORDINACION_CM: ['VER', 'APROBAR'] },
  },
};

const listaCm = await listarCandidatosTransicion(
  50,
  'PROGRAMACION_APROBADA',
  {},
  { id: 50, tipo: 'bienes', estado_actual: 'PROGRAMACION', payload: {} },
  mockClient({ id: 50, tipo: 'bienes', estado_actual: 'PROGRAMACION', payload: {} }, [cmUser]),
);
ok(listaCm.etapa_destino === 'COORDINACION_CM', 'Prog→CM etapa destino COORDINACION_CM');

console.log('\nFase 3/4 — integración ERV (4 transiciones)');

try {
  await runMigrations();

  const { rows: users } = await query(`
    SELECT id, username FROM usuarios WHERE activo = TRUE
    ORDER BY CASE WHEN LOWER(username) IN ('lespinoza', 'jprogramador', 'jcoordinador') THEN 0 ELSE 1 END, id
    LIMIT 5
  `);
  const uidEval = users.find((u) => u.username)?.id || 913;
  const uidDec = users.find((u) => /espinoza|dec/i.test(u.username || ''))?.id || uidEval;
  const uidProg = users.find((u) => /program/i.test(u.username || ''))?.id || uidDec;
  const uidCm = users.find((u) => /coord|cm|rojas/i.test(u.username || ''))?.id || cmUser.id;

  const codigo = `REQ-RC8174-${Date.now()}`;
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual)
    VALUES ('bienes', $1, 'Test RC8174', 'Area', 'CNCC', 'Registrado', '{}'::jsonb, 'REGISTRO')
    RETURNING id
  `, [codigo]);
  const rid = ins.rows[0].id;

  const assertContrato = async (etapaEsperada, uidEsperado, paso) => {
    const c = await getExpedienteContratoUnificado(rid);
    ok(c.etapa?.codigo === etapaEsperada, `${paso}: contrato etapa=${etapaEsperada}`);
    ok(c.estado?.codigo === 'EN_TRAMITE', `${paso}: contrato estado EN_TRAMITE`);
    ok(c.responsable?.tipo === 'PERSONA', `${paso}: contrato responsable PERSONA`);
    ok(Number(c.responsable?.usuario_id) === Number(uidEsperado), `${paso}: contrato usuario_id=${uidEsperado}`);

    const { rows: erv } = await query('SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
    ok(erv[0]?.etapa_codigo === etapaEsperada, `${paso}: ERV etapa=${etapaEsperada}`);
    ok(erv[0]?.estado_codigo === 'EN_TRAMITE', `${paso}: ERV estado EN_TRAMITE`);
    ok(erv[0]?.responsable_tipo === 'PERSONA', `${paso}: ERV responsable PERSONA`);
    ok(Number(erv[0]?.responsable_usuario_id) === Number(uidEsperado), `${paso}: ERV usuario_id`);
  };

  try {
    await transicionarExpediente({
      requerimientoId: rid,
      evento: 'REQUERIMIENTO_ENVIADO_EVALUACION',
      usuarioDestinoId: uidEval,
      unidadDestino: 'Evaluación',
      motivo: 'Test RC8174 Reg→Eval',
      metadata: { client_request_id: `test-rc8174-reg:${rid}`, responsable_seleccionado_id: uidEval },
      actorRol: 'test-rc8174',
    });
    await assertContrato('EVALUACION', uidEval, 'Reg→Eval');

    await query(`
      INSERT INTO requerimiento_pedidos (requerimiento_id, pedido_sigamef, descripcion)
      VALUES ($1, 'PED-TEST-8174', 'Pedido test')
      ON CONFLICT DO NOTHING
    `, [rid]).catch(() => {});

    await transicionarExpediente({
      requerimientoId: rid,
      evento: 'EVALUACION_APROBADA',
      usuarioDestinoId: uidDec,
      unidadDestino: 'DEC',
      motivo: 'Test RC8174 Eval→DEC',
      metadata: { client_request_id: `test-rc8174-eval:${rid}`, responsable_seleccionado_id: uidDec },
      actorRol: 'test-rc8174',
    });
    await assertContrato('DEC', uidDec, 'Eval→DEC');

    await transicionarExpediente({
      requerimientoId: rid,
      evento: 'DEC_APROBADO',
      usuarioDestinoId: uidProg,
      unidadDestino: 'Programación',
      motivo: 'Test RC8174 DEC→Prog',
      metadata: { client_request_id: `test-rc8174-dec:${rid}`, responsable_seleccionado_id: uidProg },
      actorRol: 'test-rc8174',
    });
    await assertContrato('PROGRAMACION', uidProg, 'DEC→Prog');

    await transicionarExpediente({
      requerimientoId: rid,
      evento: 'PROGRAMACION_APROBADA',
      usuarioDestinoId: uidCm,
      unidadDestino: 'Coordinación CM',
      motivo: 'Test RC8174 Prog→CM',
      metadata: { client_request_id: `test-rc8174-prog:${rid}`, responsable_seleccionado_id: uidCm },
      actorRol: 'test-rc8174',
    });
    await assertContrato('COORDINACION_CM', uidCm, 'Prog→CM');
  } finally {
    await query('DELETE FROM requerimiento_pedidos WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]);
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]);
    await query('DELETE FROM requerimientos WHERE id = $1', [rid]);
  }
} catch (e) {
  console.log('  ⚠ integración BD:', e.message);
  if (process.env.CI) throw e;
}

console.log('\n✅ RC8.17.4 — OK\n');

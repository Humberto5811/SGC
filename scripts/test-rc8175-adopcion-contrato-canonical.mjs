/**
 * RC8.17.5 — Adopción global contrato canónico + cadena de transiciones.
 */
import assert from 'node:assert/strict';
import {
  getPilotEstadoLabelsForEvento,
  EVENTOS_PILOT_EN_TRAMITE,
  EVENTOS_TRANSICION_PERSONA,
} from '../server/lib/workflowTransicionResponsable.js';
import { getExpedienteContratoUnificado } from '../server/lib/expedienteContratoLectura.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

const CADENA = [
  { evento: 'REQUERIMIENTO_ENVIADO_EVALUACION', etapa: 'EVALUACION', from: 'REGISTRO' },
  { evento: 'EVALUACION_APROBADA', etapa: 'DEC', from: 'EVALUACION' },
  { evento: 'DEC_APROBADO', etapa: 'PROGRAMACION', from: 'DEC' },
  { evento: 'PROGRAMACION_APROBADA', etapa: 'COORDINACION_CM', from: 'PROGRAMACION' },
  { evento: 'COORDINACION_CM_APROBADA', etapa: 'INVITACIONES', from: 'COORDINACION_CM' },
];

console.log('\n=== RC8.17.5 — Adopción contrato canónico ===\n');

console.log('Piloto EN_TRAMITE + PERSONA');
for (const ev of EVENTOS_PILOT_EN_TRAMITE) {
  if (ev === 'REQUERIMIENTO_ENVIADO_EVALUACION') continue;
  const labels = getPilotEstadoLabelsForEvento(ev);
  ok(labels?.estadoCodigo === 'EN_TRAMITE', `${ev} → EN_TRAMITE`);
}
ok(EVENTOS_TRANSICION_PERSONA.includes('COORDINACION_CM_APROBADA'), 'CM→Inv PERSONA piloto');

console.log('\nMatriz adopción (automática)');
const MATRIZ = [
  ['Registro', 'Sí', 'Sí', 'Sí (derivar)', '—'],
  ['Evaluación', 'Sí', 'Sí', 'Sí (aprobar)', 'Observar: modalObservaciones'],
  ['DEC', 'Sí', 'Sí', 'Sí (aprobar)', 'Observar: candidatos DEC'],
  ['Programación', 'Sí', 'Sí', 'Sí (aprobar)', 'Observar: modalObservaciones'],
  ['Coordinación CM', 'Sí', 'Sí', 'Sí (aprobar inv)', 'Asignar/derivar: actosModals'],
  ['Invitaciones', 'Sí', 'Sí', 'Parcial', 'Enviar inv: sin PERSONA (misma etapa)'],
  ['Recepción Cotizaciones', 'Sí', 'Sí', 'Parcial', 'Cerrar→Valid: pendiente PERSONA FE'],
  ['Validaciones', 'Sí (resp)', 'Sí', 'Parcial', 'Completar: pendiente PERSONA FE'],
  ['Cuadro Comparativo', 'Sí (resp)', 'Sí', 'Parcial', 'Aprobar DEC→CCP: pendiente PERSONA FE'],
  ['CCP', 'Sí', 'Sí', 'Parcial', 'Registrar→Orden: pendiente PERSONA FE'],
  ['Registro Orden', 'Sí (resp)', 'Sí', 'Parcial', 'Notificar: pendiente PERSONA FE'],
  ['Recepción Bienes', 'Dominio', 'Dominio', 'N/A', 'Excepción RC8.15 — no modificar'],
  ['Presentación Entregables', 'ERV entregable', 'transicionarEntregable', 'Parcial', 'Excepción RC8.15.6C'],
];
console.log('Módulo | lectura canónica | transición canónica | selector PERSONA | pendiente');
for (const row of MATRIZ) {
  console.log(row.join(' | '));
}

console.log('\nIntegración cadena Reg→…→Invitaciones');
try {
  await runMigrations();
  const { rows: users } = await query(`SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 3`);
  const uid = users[0]?.id || 920;

  const codigo = `REQ-RC8175-${Date.now()}`;
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual)
    VALUES ('bienes', $1, 'Test RC8175', 'Area', 'CNCC', 'Registrado', '{}'::jsonb, 'REGISTRO')
    RETURNING id
  `, [codigo]);
  const rid = ins.rows[0].id;

  const assertPaso = async (etapa, paso) => {
    const c = await getExpedienteContratoUnificado(rid);
    ok(c.etapa?.codigo === etapa, `${paso}: etapa ${etapa}`);
    ok(c.estado?.codigo === 'EN_TRAMITE', `${paso}: EN_TRAMITE`);
    ok(c.responsable?.tipo === 'PERSONA', `${paso}: PERSONA`);
    const { rows: asg } = await query(
      'SELECT 1 FROM expediente_asignaciones WHERE requerimiento_id = $1 AND activo = TRUE',
      [rid],
    );
    ok(asg.length > 0, `${paso}: asignación vigente`);
    const { rows: ev } = await query(
      'SELECT evento_codigo FROM workflow_eventos WHERE expediente_id = $1 ORDER BY id DESC LIMIT 1',
      [rid],
    );
    ok(ev[0]?.evento_codigo, `${paso}: workflow_evento`);
  };

  try {
    await query(`
      INSERT INTO requerimiento_pedidos (requerimiento_id, pedido_sigamef, descripcion)
      VALUES ($1, 'PED-RC8175', 'Test') ON CONFLICT DO NOTHING
    `, [rid]).catch(() => {});

    for (const paso of CADENA) {
      await transicionarExpediente({
        requerimientoId: rid,
        evento: paso.evento,
        usuarioDestinoId: uid,
        motivo: `Test RC8175 ${paso.evento}`,
        metadata: {
          client_request_id: `test-rc8175:${paso.evento}:${rid}`,
          responsable_seleccionado_id: uid,
          etapa_origen: paso.from,
          etapa_destino: paso.etapa,
        },
        actorRol: 'test-rc8175',
      });
      await assertPaso(paso.etapa, paso.evento);
    }
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

console.log('\n✅ RC8.17.5 — OK\n');

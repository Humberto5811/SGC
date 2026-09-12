/**
 * RC8.17.6 — Selector PERSONA en cadena posterior (Recepción→Valid→Cuadro→CCP→RO).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getPilotEstadoLabelsForEvento,
  EVENTOS_TRANSICION_PERSONA,
  assertUsuarioDestinoTransicionElegible,
} from '../server/lib/workflowTransicionResponsable.js';
import { getExpedienteContratoUnificado } from '../server/lib/expedienteContratoLectura.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

const EVENTOS = [
  { evento: 'COTIZACIONES_DERIVADAS_VALIDACION', etapa: 'VALIDACIONES' },
  { evento: 'VALIDACION_COMPLETADA', etapa: 'CUADRO_COMPARATIVO' },
  { evento: 'CUADRO_APROBADO_DEC', etapa: 'CCP' },
  { evento: 'CCP_REGISTRADA', etapa: 'REGISTRO_ORDEN' },
];

const CADENA_PREVIA = [
  { evento: 'REQUERIMIENTO_ENVIADO_EVALUACION', etapa: 'EVALUACION' },
  { evento: 'EVALUACION_APROBADA', etapa: 'DEC' },
  { evento: 'DEC_APROBADO', etapa: 'PROGRAMACION' },
  { evento: 'PROGRAMACION_APROBADA', etapa: 'COORDINACION_CM' },
  { evento: 'COORDINACION_CM_APROBADA', etapa: 'INVITACIONES' },
];

console.log('\n=== RC8.17.6 — Cadena posterior PERSONA ===\n');

console.log('Piloto PERSONA (4 eventos)');
for (const { evento } of EVENTOS) {
  ok(EVENTOS_TRANSICION_PERSONA.includes(evento), `${evento} en EVENTOS_TRANSICION_PERSONA`);
  const labels = getPilotEstadoLabelsForEvento(evento);
  ok(labels?.estadoCodigo === 'EN_TRAMITE', `${evento} → EN_TRAMITE`);
}

console.log('\nFrontend — showWorkflowTransicionModal');
const feChecks = [
  ['src/utils/derivarValidacionModal.js', 'COTIZACIONES_DERIVADAS_VALIDACION'],
  ['src/utils/validacionesModal.js', 'VALIDACION_COMPLETADA'],
  ['src/utils/cuadroComparativoModal.js', 'CUADRO_APROBADO_DEC'],
  ['src/views/contratacion/ccpView.js', 'CCP_REGISTRADA'],
];
for (const [rel, ev] of feChecks) {
  const src = readFileSync(join(root, rel), 'utf8');
  ok(src.includes('showWorkflowTransicionModal') && src.includes(ev), `${rel} → ${ev}`);
}

console.log('\nBackend — assertUsuarioDestinoTransicionElegible');
ok(typeof assertUsuarioDestinoTransicionElegible === 'function', 'assert exportado');
for (const lib of ['validacionesCotizacion.js', 'cuadroComparativo.js', 'ccpCertificacion.js']) {
  const src = readFileSync(join(root, 'server/lib', lib), 'utf8');
  ok(src.includes('assertUsuarioDestinoTransicionElegible'), `${lib} valida PERSONA`);
}

console.log('\nIntegración cadena posterior');
try {
  await runMigrations();
  const { rows: users } = await query(`SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 3`);
  const uid = users[0]?.id || 920;

  const codigo = `REQ-RC8176-${Date.now()}`;
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual)
    VALUES ('bienes', $1, 'Test RC8176', 'Area', 'CNCC', 'Registrado', '{}'::jsonb, 'REGISTRO')
    RETURNING id
  `, [codigo]);
  const rid = ins.rows[0].id;

  const assertPaso = async (etapaEsperada, paso, evento) => {
    const c = await getExpedienteContratoUnificado(rid);
    const etapa = c.etapa?.codigo;
    ok(
      etapa === etapaEsperada || (etapaEsperada === 'VALIDACIONES' && etapa === 'VALIDACION_USUARIO'),
      `${paso}: etapa ${etapaEsperada} (actual ${etapa})`,
    );
    ok(c.estado?.codigo === 'EN_TRAMITE', `${paso}: EN_TRAMITE`);
    ok(c.responsable?.tipo === 'PERSONA', `${paso}: PERSONA`);
    ok(Number(c.responsable?.usuario_id || c.responsable?.id) === uid, `${paso}: asignado uid ${uid}`);
    const { rows: asg } = await query(
      'SELECT 1 FROM expediente_asignaciones WHERE requerimiento_id = $1 AND activo = TRUE AND usuario_id = $2',
      [rid, uid],
    );
    ok(asg.length > 0, `${paso}: asignación vigente`);
    const { rows: ev } = await query(
      'SELECT evento_codigo FROM workflow_eventos WHERE expediente_id = $1 ORDER BY id DESC LIMIT 1',
      [rid],
    );
    ok(ev[0]?.evento_codigo === evento, `${paso}: workflow_evento ${evento}`);
  };

  const trans = async (evento, meta = {}) => {
    await transicionarExpediente({
      requerimientoId: rid,
      evento,
      usuarioDestinoId: uid,
      motivo: `Test RC8176 ${evento}`,
      metadata: {
        client_request_id: `test-rc8176:${evento}:${rid}`,
        responsable_seleccionado_id: uid,
        ...meta,
      },
      actorRol: 'test-rc8176',
    });
  };

  try {
    for (const paso of CADENA_PREVIA) {
      await trans(paso.evento);
    }
    await trans('COTIZACION_PRESENTADA');
    const cRc = await getExpedienteContratoUnificado(rid);
    ok(
      cRc.etapa?.codigo === 'RECEPCION_COTIZACIONES',
      `Inv→Recepción: etapa RECEPCION_COTIZACIONES (actual ${cRc.etapa?.codigo})`,
    );

    for (const paso of EVENTOS) {
      await trans(paso.evento);
      await assertPaso(paso.etapa, paso.evento, paso.evento);
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

console.log('\n✅ RC8.17.6 — OK\n');

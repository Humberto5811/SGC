/**
 * RC8.17.8F — Reparación idempotente REQ-00016 post observación Programación→Registro.
 *
 * Objetivo ERV: REGISTRO / OBSERVADO / PERSONA 249 (wvasquez)
 * Preserva evento #57, asignación 69 histórica, fecha_ingreso_programacion.
 *
 *   node scripts/repair-req00016-rc8178f-programacion-observada.mjs
 *   node scripts/repair-req00016-rc8178f-programacion-observada.mjs --execute
 */
import { query } from '../server/db.js';
import { withTransaction } from '../server/lib/workflow/workflowTransaction.js';
import {
  cerrarAsignacionActiva,
  crearAsignacion,
  upsertEstadoVigente,
  FUENTE_RESPONSABLE,
  ORIGEN_ESCRITURA_VIGENTE,
} from '../server/lib/expedienteEstadoPersistido.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';
import { insertWorkflowEvento } from '../server/lib/workflow/workflowHistory.js';
import { getEtapaMeta } from '../shared/workflow/etapas.js';
import { runMigrations } from '../server/migrate.js';

const CODIGO = 'REQ-00016';
const PERSONA_ID = 249;
const EVENTO_OBS_ID = 57;
const EXECUTE = process.argv.includes('--execute');

function log(msg) {
  console.log(msg);
}

await runMigrations();

const { rows: reqRows } = await query(
  `SELECT id, codigo FROM requerimientos WHERE codigo = $1 LIMIT 1`,
  [CODIGO],
);
if (!reqRows.length) {
  console.error(`No se encontró ${CODIGO}`);
  process.exit(1);
}
const rid = reqRows[0].id;

const { rows: ev57 } = await query(
  `SELECT id, evento_codigo, metadata FROM workflow_eventos WHERE id = $1 AND expediente_id = $2`,
  [EVENTO_OBS_ID, rid],
);
if (!ev57.length || ev57[0].evento_codigo !== 'PROGRAMACION_OBSERVADA') {
  console.error(`Evento #${EVENTO_OBS_ID} PROGRAMACION_OBSERVADA no encontrado para ${CODIGO}. Abortando.`);
  process.exit(1);
}

const meta = ev57[0].metadata || {};
const destMeta = String(meta.etapa_destino || '').toUpperCase().replace(/^REGISTRADO$/, 'REGISTRO');
if (destMeta !== 'REGISTRO') {
  console.error(`Evento #57 etapa_destino metadata=${destMeta}; se esperaba REGISTRO. Abortando.`);
  process.exit(1);
}

const { rows: ervRows } = await query(
  `SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
  [rid],
);
const erv = ervRows[0];

const { rows: asigAct } = await query(`
  SELECT id, etapa_codigo, usuario_id, tipo_responsable, activo FROM expediente_asignaciones
  WHERE requerimiento_id = $1 AND activo = TRUE LIMIT 1
`, [rid]);

const metaReg = getEtapaMeta('REGISTRO') || { label: 'Registro de Requerimientos' };

log('\n=== Plan reparación REQ-00016 (RC8.17.8F) ===\n');
log(`Expediente id: ${rid}`);
log(`Evento #57: PROGRAMACION_OBSERVADA metadata.etapa_destino=${destMeta}`);
log(`ERV vigente: etapa=${erv?.etapa_codigo} estado=${erv?.estado_codigo} tipo=${erv?.responsable_tipo} uid=${erv?.responsable_usuario_id ?? 'NULL'}`);
log(`Asignación activa: id=${asigAct[0]?.id ?? '—'} etapa=${asigAct[0]?.etapa_codigo} tipo=${asigAct[0]?.tipo_responsable} uid=${asigAct[0]?.usuario_id ?? 'NULL'}`);

const yaOk = erv?.etapa_codigo === 'REGISTRO'
  && erv?.estado_codigo === 'OBSERVADO'
  && erv?.responsable_tipo === 'PERSONA'
  && Number(erv?.responsable_usuario_id) === PERSONA_ID
  && asigAct[0]?.etapa_codigo === 'REGISTRO'
  && asigAct[0]?.tipo_responsable === 'PERSONA'
  && Number(asigAct[0]?.usuario_id) === PERSONA_ID;

if (yaOk) {
  log('\nEstado ya correcto (REGISTRO/OBSERVADO/PERSONA 249). Idempotente.\n');
  process.exit(0);
}

log('\nOperaciones previstas:');
log('  1. Cerrar asignación activa incorrecta (id 69 u otra) — conservar histórico.');
log('  2. Crear asignación REGISTRO activa PERSONA 249.');
log('  3. Actualizar ERV: REGISTRO / OBSERVADO / PERSONA 249.');
log('  4. syncLegacy requerimientos (Observado / REGISTRO).');
log('  5. Insertar evento REPARACION_RC8178F_PROGRAMACION_OBSERVADA (auditoría).');
log('  6. NO modificar evento #57 ni fecha_ingreso_programacion.');
log(`\nModo: ${EXECUTE ? 'EJECUTAR' : 'DRY-RUN (añadir --execute)'}\n`);

if (!EXECUTE) process.exit(0);

await withTransaction(async (tx) => {
  await cerrarAsignacionActiva(tx, rid, { origenEscritura: ORIGEN_ESCRITURA_VIGENTE.RECONCILIACION });
  await crearAsignacion(tx, {
    requerimientoId: rid,
    etapaCodigo: 'REGISTRO',
    usuarioId: PERSONA_ID,
    unidadCodigo: metaReg.responsableLabel || 'Usuario AU',
    tipoResponsable: TIPO_RESPONSABLE.PERSONA,
    origenAsignacion: 'repair-rc8178f',
    asignadoPor: 'repair-rc8178f',
    motivo: 'Reparación RC8.17.8F observación Programación→Registro',
    origenEscritura: ORIGEN_ESCRITURA_VIGENTE.RECONCILIACION,
  });

  await upsertEstadoVigente(tx, {
    requerimientoId: rid,
    estadoCodigo: 'OBSERVADO',
    estadoLabel: 'Observado',
    etapaCodigo: 'REGISTRO',
    etapaLabel: metaReg.label || 'Registro de Requerimientos',
    responsableTipo: TIPO_RESPONSABLE.PERSONA,
    responsableUsuarioId: PERSONA_ID,
    responsableUnidad: metaReg.responsableLabel || null,
    responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
    actualizadoPor: 'repair-rc8178f',
    origenEscritura: ORIGEN_ESCRITURA_VIGENTE.RECONCILIACION,
  });

  await tx.query(`
    UPDATE requerimientos SET
      estado_actual = 'REGISTRO',
      sub_modulo_actual = $2,
      estado = 'Observado',
      responsable_actual = (SELECT TRIM(CONCAT(COALESCE(apellidos,''), ' ', COALESCE(nombres,''))) FROM usuarios WHERE id = $3),
      updated_at = NOW()
    WHERE id = $1
  `, [rid, metaReg.submoduloLabel || 'Registro de Requerimientos', PERSONA_ID]);

  await insertWorkflowEvento(tx, {
    expediente_id: rid,
    tipo_contratacion: 'BIEN',
    evento_codigo: 'REPARACION_RC8178F_PROGRAMACION_OBSERVADA',
    etapa_origen: 'PROGRAMACION',
    etapa_destino: 'REGISTRO',
    actor_rol: 'repair-rc8178f',
    responsable_destino: String(PERSONA_ID),
    metadata: {
      reparacion: true,
      referencia_evento_id: EVENTO_OBS_ID,
      objetivo: 'REGISTRO/OBSERVADO/PERSONA_249',
      dueno_persistencia: 'repair-rc8178f',
    },
    idempotency_key: `repair-rc8178f:req${rid}:prog-obs-registro`,
  });
});

log('\nReparación aplicada.\n');

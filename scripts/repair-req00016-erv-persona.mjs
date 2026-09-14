/**
 * RC8.17.8D — Reparación idempotente ERV/asignación REQ-00016 → PERSONA 549 (lespinoza).
 *
 * Uso:
 *   node scripts/repair-req00016-erv-persona.mjs           # dry-run (plan)
 *   node scripts/repair-req00016-erv-persona.mjs --execute # aplicar
 *
 * No borra eventos ni asignaciones históricas.
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
import { runMigrations } from '../server/migrate.js';

const CODIGO = 'REQ-00016';
const PERSONA_ID = 549;
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

const { rows: evRows } = await query(`
  SELECT metadata->>'usuario_destino_id' AS uid
  FROM workflow_eventos
  WHERE expediente_id = $1 AND evento_codigo = 'EVALUACION_APROBADA'
  ORDER BY id DESC LIMIT 1
`, [rid]);
const evidenciaEvento = evRows[0]?.uid ? Number(evRows[0].uid) : null;

const { rows: asigHist } = await query(`
  SELECT id, usuario_id, tipo_responsable, activo
  FROM expediente_asignaciones
  WHERE requerimiento_id = $1 AND etapa_codigo = 'DEC' AND tipo_responsable = 'PERSONA' AND usuario_id = $2
  ORDER BY id DESC LIMIT 1
`, [rid, PERSONA_ID]);

const { rows: ervRows } = await query(
  `SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
  [rid],
);
const erv = ervRows[0];

const { rows: asigAct } = await query(`
  SELECT id, usuario_id, tipo_responsable, activo FROM expediente_asignaciones
  WHERE requerimiento_id = $1 AND activo = TRUE LIMIT 1
`, [rid]);

const targetUid = evidenciaEvento === PERSONA_ID ? PERSONA_ID
  : (asigHist[0]?.usuario_id ? Number(asigHist[0].usuario_id) : null);

log('\n=== Plan reparación REQ-00016 (RC8.17.8D) ===\n');
log(`Expediente id: ${rid}`);
log(`Evidencia evento EVALUACION_APROBADA usuario_destino_id: ${evidenciaEvento ?? '—'}`);
log(`Asignación histórica DEC PERSONA ${PERSONA_ID}: ${asigHist[0] ? `id ${asigHist[0].id}` : '—'}`);
log(`ERV vigente: etapa=${erv?.etapa_codigo} estado=${erv?.estado_codigo} tipo=${erv?.responsable_tipo} uid=${erv?.responsable_usuario_id ?? 'NULL'}`);
log(`Asignación activa: id=${asigAct[0]?.id ?? '—'} tipo=${asigAct[0]?.tipo_responsable} uid=${asigAct[0]?.usuario_id ?? 'NULL'}`);

if (!targetUid || targetUid !== PERSONA_ID) {
  console.error('Evidencia inequívoca insuficiente para PERSONA 549. Abortando.');
  process.exit(1);
}

const yaOk = erv?.responsable_tipo === 'PERSONA'
  && Number(erv?.responsable_usuario_id) === PERSONA_ID
  && asigAct[0]?.tipo_responsable === 'PERSONA'
  && Number(asigAct[0]?.usuario_id) === PERSONA_ID;

if (yaOk) {
  log('\nEstado ya correcto (PERSONA 549). Nada que hacer (idempotente).\n');
  process.exit(0);
}

log('\nOperaciones que se ejecutarán:');
log('  1. Cerrar asignación activa incorrecta (inactivar; conservar fila histórica).');
log('  2. Crear nueva asignación DEC activa PERSONA 549 (origen: repair-rc8178d).');
log('  3. Actualizar expediente_estado_vigente: PERSONA 549, fuente asignacion_explicita, version+1.');
log('  4. Insertar workflow_evento REPARACION_RC8178D_ERV (auditoría; no borra evento 38).');
log('  5. NO modificar etapa_codigo ni estado_codigo (DEC / EN_TRAMITE).');
log(`\nModo: ${EXECUTE ? 'EJECUTAR' : 'DRY-RUN (añadir --execute)'}\n`);

if (!EXECUTE) {
  process.exit(0);
}

await withTransaction(async (tx) => {
  await tx.query('SELECT * FROM requerimientos WHERE id = $1 FOR UPDATE', [rid]);

  await cerrarAsignacionActiva(tx, rid, {
    origenEscritura: ORIGEN_ESCRITURA_VIGENTE.RECONCILIACION,
  });

  await crearAsignacion(tx, {
    requerimientoId: rid,
    etapaCodigo: 'DEC',
    usuarioId: PERSONA_ID,
    unidadCodigo: 'DEC',
    tipoResponsable: TIPO_RESPONSABLE.PERSONA,
    origenAsignacion: 'repair-rc8178d-req00016',
    asignadoPor: 'repair-rc8178d',
    motivo: 'Reconciliación RC8.17.8D: PERSONA canónico lespinoza (549)',
    origenEscritura: ORIGEN_ESCRITURA_VIGENTE.RECONCILIACION,
  });

  await upsertEstadoVigente(tx, {
    requerimientoId: rid,
    estadoCodigo: erv?.estado_codigo || 'EN_TRAMITE',
    estadoLabel: erv?.estado_label || 'En trámite',
    etapaCodigo: 'DEC',
    etapaLabel: erv?.etapa_label || 'DEC',
    responsableTipo: TIPO_RESPONSABLE.PERSONA,
    responsableUsuarioId: PERSONA_ID,
    responsableUnidad: 'DEC',
    responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
    actualizadoPor: 'repair-rc8178d',
    metadata: {
      ...(typeof erv?.metadata_json === 'object' ? erv.metadata_json : {}),
      repair_rc8178d: true,
      repair_motivo: 'OBSERVACION_SUBSANADA UNIDAD → PERSONA 549',
      evidencia_evento_eval_aprobada: evidenciaEvento,
      asignacion_historica_ref: asigHist[0]?.id ?? null,
    },
    origenEscritura: ORIGEN_ESCRITURA_VIGENTE.RECONCILIACION,
  });

  await insertWorkflowEvento(tx, {
    expediente_id: rid,
    tipo_contratacion: 'BIEN',
    evento_codigo: 'REPARACION_RC8178D_ERV',
    etapa_origen: 'DEC',
    etapa_destino: 'DEC',
    actor_id: null,
    actor_rol: 'repair-rc8178d',
    metadata: {
      repair: true,
      codigo: CODIGO,
      responsable_usuario_id: PERSONA_ID,
      motivo: 'Reconciliación ERV PERSONA tras subsanación UNIDAD incorrecta',
      evidencia: { evento_eval_aprobada_uid: evidenciaEvento, asignacion_id: asigHist[0]?.id },
    },
    idempotency_key: `repair-rc8178d:${rid}:persona-549`,
  });
});

const { rows: ervFinal } = await query(
  `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id, version
   FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
  [rid],
);
const { rows: asigFinal } = await query(`
  SELECT tipo_responsable, usuario_id, activo FROM expediente_asignaciones
  WHERE requerimiento_id = $1 AND activo = TRUE LIMIT 1
`, [rid]);

log('Reparación aplicada.');
log(`ERV final: ${JSON.stringify(ervFinal[0])}`);
log(`Asignación activa: ${JSON.stringify(asigFinal[0])}\n`);

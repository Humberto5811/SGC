/**
 * Propuesta de reparación REQ-00040 (y casos similares): ERV desalineada tras subobservación
 * persistida sin transición (RC8.17.8G pre-fix).
 *
 * Uso:
 *   node scripts/repair-req00040-erv-subobs.mjs              # dry-run (default)
 *   node scripts/repair-req00040-erv-subobs.mjs --apply      # ejecuta transición canónica
 *
 * NO borra eventos históricos ni reescribe observaciones en payload.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import {
  buildClientRequestIdEvalObservacion,
  buildEvalObservacionPayloadDomainMutator,
} from '../server/lib/observacionEvaluacionSubobs.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';

const codigoArg = process.argv.find((a) => a.startsWith('--codigo='))?.split('=')[1] || 'REQ-00040';
const apply = process.argv.includes('--apply');

const { rows: reqRows } = await query(
  'SELECT id, codigo, payload FROM requerimientos WHERE codigo = $1 LIMIT 1',
  [codigoArg],
);
if (!reqRows.length) {
  console.error(`No se encontró ${codigoArg}`);
  process.exit(1);
}
const rid = reqRows[0].id;
let payload = {};
try { payload = JSON.parse(reqRows[0].payload || '{}'); } catch (_) {}

const hilos = Array.isArray(payload.observaciones) ? payload.observaciones : [];
const hijasAbiertas = hilos.filter(
  (o) => (o.observacion_padre_id || o.observacionPadreId)
    && o.cerrada !== true
    && String(o.estado || '').toUpperCase() !== 'CERRADA',
);

const { rows: ervRows } = await query(
  'SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1',
  [rid],
);
const erv = ervRows[0];

console.log(JSON.stringify({
  modo: apply ? 'apply' : 'dry-run',
  requerimiento_id: rid,
  codigo: codigoArg,
  erv_actual: erv ? {
    etapa: erv.etapa_codigo,
    estado: erv.estado_codigo,
    responsable_usuario_id: erv.responsable_usuario_id,
  } : null,
  hijas_abiertas: hijasAbiertas.map((h) => ({
    id: h.id,
    padre: h.observacion_padre_id || h.observacionPadreId,
    destino_usuario_id: h.usuario_destino_id,
    destino_submodulo: h.destino_submodulo || h.moduloDestino,
  })),
}, null, 2));

if (!hijasAbiertas.length) {
  console.log('Sin subobservación abierta; no hay reparación ERV propuesta.');
  process.exit(0);
}

const hija = hijasAbiertas.find((h) => {
  const dest = String(h.destino_submodulo || h.moduloDestino || '').toLowerCase();
  return dest.includes('registro');
}) || hijasAbiertas[0];

const uidDest = hija.usuario_destino_id;
if (!uidDest) {
  console.error('Subobservación sin usuario_destino_id; reparación manual requerida.');
  process.exit(2);
}

const crq = buildClientRequestIdEvalObservacion({
  requerimientoId: rid,
  observacionPadreId: hija.observacion_padre_id || hija.observacionPadreId,
  observacionHijaId: hija.id,
});

console.log('\nAcción propuesta: transicionarExpediente EVALUACION_OBSERVADA (idempotente por nodo)');
console.log(`  client_request_id: ${crq}`);
console.log(`  destino PERSONA: ${uidDest}`);
console.log('  (payload ya contiene la hija; domainMutator no duplica si la hija ya existe — revisar antes de --apply)');

if (!apply) {
  console.log('\nDry-run: no se modificó BD. Use --apply para ejecutar.');
  process.exit(0);
}

assert.ok(false, 'Reparación --apply: emitirObservacion con hija existente puede duplicar; '
  + 'preferir transición solo-ERV con domainMutator que no re-emite, o ajuste manual auditado.');

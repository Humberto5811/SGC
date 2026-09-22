/**
 * RC8.17.8H6-C3-A1 — parseErvMetadata + resolveAnalistaInvitacionesPrevio (metadata_json).
 */
import assert from 'node:assert/strict';
import {
  parseErvMetadata,
  resolveAnalistaInvitacionesPrevio,
} from '../server/lib/consultasExpedienteEstado.js';

const uid = 5551;

assert.equal(
  parseErvMetadata({ metadata_json: { responsable_operativo_id: uid } }).responsable_operativo_id,
  uid,
  'metadata_json objeto',
);
assert.equal(
  parseErvMetadata({ metadata: { analista_invitaciones_previo_id: uid } }).analista_invitaciones_previo_id,
  uid,
  'metadata normalizada',
);
assert.equal(
  parseErvMetadata({ metadata_json: JSON.stringify({ responsable_operativo_id: uid }) }).responsable_operativo_id,
  uid,
  'metadata_json string',
);

const mockClient = {
  query: async (sql) => {
    if (/expediente_asignaciones/i.test(sql)) return { rows: [] };
    if (/FROM requerimientos/i.test(sql)) return { rows: [{ payload: '{}' }] };
    return { rows: [] };
  },
};

const fromJson = await resolveAnalistaInvitacionesPrevio(99, {
  etapa_codigo: 'INVITACIONES',
  responsable_tipo: 'UNIDAD',
  metadata_json: { responsable_operativo_id: uid },
}, mockClient);
assert.equal(fromJson, uid, 'resolve desde metadata_json sin asignaciones');

const fromMeta = await resolveAnalistaInvitacionesPrevio(99, {
  etapa_codigo: 'INVITACIONES',
  metadata: { responsable_operativo_id: uid },
}, mockClient);
assert.equal(fromMeta, uid, 'resolve desde metadata normalizada');

console.log('OK test-rc8178h6-c3a1-resolve-analista-metadata');

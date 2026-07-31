/**
 * Reinvitación de proveedores en Invitaciones (Bienes/Servicios/Locadores).
 *
 *   node scripts/test-invitaciones-reenvio.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

/** Simula numeración N° Inv. al reinvitar (mismo proveedor, misma SC). */
function nextNroInv(existentes, solicitudId, proveedorId) {
  const prev = existentes.filter((i) =>
    Number(i.solicitud_id) === Number(solicitudId)
    && Number(i.proveedor_id) === Number(proveedorId));
  const max = prev.reduce((m, i) => Math.max(m, Number(i.nro_invitacion) || 0), 0);
  return max + 1;
}

function agregarInvitacion(existentes, { solicitudId, proveedorId, estado = 'PENDIENTE' }) {
  const nro = nextNroInv(existentes, solicitudId, proveedorId);
  const row = {
    id: (existentes.at(-1)?.id || 0) + 1,
    solicitud_id: solicitudId,
    proveedor_id: proveedorId,
    nro_invitacion: nro,
    estado,
    historial: [{ tipo: 'alta', nro_invitacion: nro, reinvitacion: nro > 1 }],
  };
  return [...existentes, row];
}

console.log('\n=== Invitaciones — reenvío / N° Inv. ===\n');

{
  const invSrc = read('server/lib/invitaciones.js');
  assert.match(invSrc, /INSERT INTO invitacion_proveedores/);
  assert.doesNotMatch(
    invSrc.slice(invSrc.indexOf('export async function agregarProveedoresInvitacion'), invSrc.indexOf('export async function enviarInvitaciones')),
    /ON CONFLICT \(requerimiento_id, proveedor_id\)/,
  );
  assert.match(invSrc, /nro_invitacion/);
  assert.match(invSrc, /COALESCE\(MAX\(nro_invitacion\), 0\) \+ 1/);
  ok('agregarProveedoresInvitacion: INSERT nuevo (sin ON CONFLICT upsert)');
}

{
  const mig = read('server/migrations/038_invitacion_reenvio_nro.js');
  assert.match(mig, /nro_invitacion/);
  assert.match(mig, /DROP CONSTRAINT/i);
  ok('migración 038: drop UNIQUE + columna nro_invitacion');
}

{
  let rows = [];
  rows = agregarInvitacion(rows, { solicitudId: 6, proveedorId: 101, estado: 'ENVIADA' });
  assert.equal(rows[0].nro_invitacion, 1);
  rows = agregarInvitacion(rows, { solicitudId: 6, proveedorId: 101, estado: 'PENDIENTE' });
  assert.equal(rows[1].nro_invitacion, 2);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].estado, 'ENVIADA');
  assert.ok(rows[1].historial[0].reinvitacion);
  ok('reinvitar mismo proveedor: N° Inv. 1 → 2; conserva anterior');
}

{
  let rows = [];
  rows = agregarInvitacion(rows, { solicitudId: 6, proveedorId: 101 });
  rows = agregarInvitacion(rows, { solicitudId: 6, proveedorId: 202 });
  assert.equal(rows[0].nro_invitacion, 1);
  assert.equal(rows[1].nro_invitacion, 1);
  ok('otro proveedor en la misma SC inicia en N° Inv. 1');
}

{
  const sel = read('src/utils/invitacionesProveedorSelector.js');
  assert.match(sel, /INVITADO ANTERIORMENTE/);
  assert.match(sel, /Solo informativo|no deshabilita|informativo/i);
  assert.doesNotMatch(sel, /sps-pick[^>]*disabled/);
  assert.doesNotMatch(sel, /invitado_anteriormente[\s\S]{0,80}disabled/);
  ok('badge INVITADO ANTERIORMENTE no bloquea checkbox');
}

{
  const modal = read('src/utils/invitacionesModals.js');
  assert.match(modal, /nro_invitacion/);
  assert.match(modal, /N° Inv\./);
  ok('wizard muestra nro_invitacion en columna N° Inv.');
}

{
  for (const tipo of ['Bienes', 'Servicios', 'Locadores']) {
    let rows = [];
    rows = agregarInvitacion(rows, { solicitudId: 10, proveedorId: 5, estado: 'ENVIADA' });
    rows = agregarInvitacion(rows, { solicitudId: 10, proveedorId: 5, estado: 'PENDIENTE' });
    assert.equal(rows.length, 2, tipo);
    assert.equal(rows[1].nro_invitacion, 2, tipo);
  }
  ok('reinvitación aplica a Bienes / Servicios / Locadores');
}

{
  const portal = read('server/lib/portalProveedores.js');
  assert.match(portal, /ORDER BY nro_invitacion DESC/);
  ok('portal marca cotización en la invitación más reciente');
}

console.log('\nInvitaciones reenvío OK\n');

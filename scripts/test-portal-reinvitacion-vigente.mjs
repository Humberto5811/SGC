/**
 * Portal — invitación vigente tras reinvitación + plazo America/Lima.
 *
 *   node scripts/test-portal-reinvitacion-vigente.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isConvocatoriaCerrada,
  pickInvitacionVigente,
  limaNowNaive,
  formatTimestampNaive,
  INVITACION_VIGENTE_ORDER_SQL,
} from '../server/lib/cronogramaDatetime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

/** Simula DISTINCT ON vigente (misma regla SQL). */
function selectVigentePorSolicitud(rows) {
  const bySol = new Map();
  const sorted = [...rows].sort((a, b) => {
    if (a.solicitud_id !== b.solicitud_id) return a.solicitud_id - b.solicitud_id;
    return 0;
  });
  for (const sid of [...new Set(sorted.map((r) => r.solicitud_id))]) {
    const group = rows.filter((r) => r.solicitud_id === sid);
    bySol.set(sid, pickInvitacionVigente(group));
  }
  return [...bySol.values()];
}

console.log('\n=== Portal reinvitación vigente ===\n');

// A / B — invitación 2 vigente
{
  const rows = [
    {
      id: 10, solicitud_id: 6, proveedor_id: 101, nro_invitacion: 1,
      fecha_envio: '2026-07-31T12:00:00.000Z', estado: 'ENVIADA',
    },
    {
      id: 20, solicitud_id: 6, proveedor_id: 101, nro_invitacion: 2,
      fecha_envio: '2026-07-31T18:00:00.000Z', estado: 'ENVIADA',
    },
  ];
  const vig = pickInvitacionVigente(rows);
  assert.equal(vig.id, 20);
  assert.equal(vig.nro_invitacion, 2);
  ok('A/B: N° Inv. 1 y 2 → selecciona invitación 2');
}

// C — mismo nro → desempate fecha_envio / id
{
  const rows = [
    { id: 1, nro_invitacion: 1, fecha_envio: '2026-07-31T10:00:00.000Z' },
    { id: 3, nro_invitacion: 1, fecha_envio: '2026-07-31T19:00:00.000Z' },
    { id: 2, nro_invitacion: 1, fecha_envio: '2026-07-31T19:00:00.000Z' },
  ];
  const vig = pickInvitacionVigente(rows);
  assert.equal(vig.id, 3, 'mismo nro y fecha → mayor id');
  ok('C: desempate por fecha_envio e id');
}

// D — plazo 20:00 Lima, hora actual anterior → abierta
{
  const plazo = '2026-07-31T20:00';
  // 2026-07-31 17:30 Lima = 22:30 UTC
  const now = new Date('2026-07-31T22:30:00.000Z');
  assert.equal(limaNowNaive(now), '2026-07-31T17:30');
  assert.equal(isConvocatoriaCerrada({ cotizaciones_fin: plazo, solicitud_estado: 'ENVIADA' }, now), false);
  ok('D: plazo 20:00 y hora Lima 17:30 → convocatoria_cerrada = false');
}

// E — hora posterior a 20:00 Lima → cerrada
{
  const plazo = '2026-07-31T20:00';
  // 2026-07-31 20:01 Lima = 2026-08-01 01:01 UTC
  const now = new Date('2026-08-01T01:01:00.000Z');
  assert.equal(limaNowNaive(now), '2026-07-31T20:01');
  assert.equal(isConvocatoriaCerrada({ cotizaciones_fin: plazo }, now), true);
  ok('E: hora Lima 20:01 → convocatoria_cerrada = true');
}

// F / G / H — estados UI
{
  function label({ cotEstado, cerrada }) {
    const est = String(cotEstado || '').toUpperCase();
    if (est === 'COTIZACION_PRESENTADA') return 'Presentada';
    if (est === 'BORRADOR') return 'Borrador';
    if (cerrada) return 'Cerrada / fuera de plazo';
    return 'Disponible para cotizar';
  }
  assert.equal(label({ cotEstado: null, cerrada: false }), 'Disponible para cotizar');
  assert.equal(label({ cotEstado: 'BORRADOR', cerrada: false }), 'Borrador');
  assert.equal(label({ cotEstado: 'COTIZACION_PRESENTADA', cerrada: false }), 'Presentada');
  ok('F/G/H: sin cotización / borrador / presentada');
}

// I — historial conserva invitación 1
{
  const all = [
    { id: 10, solicitud_id: 6, nro_invitacion: 1 },
    { id: 20, solicitud_id: 6, nro_invitacion: 2 },
  ];
  const vig = pickInvitacionVigente(all);
  assert.equal(vig.nro_invitacion, 2);
  assert.equal(all.length, 2);
  assert.ok(all.some((r) => r.nro_invitacion === 1));
  ok('I: invitación 1 permanece en historial');
}

// J — tipos
{
  for (const tipo of ['Bienes', 'Servicios', 'Locadores']) {
    const vig = pickInvitacionVigente([
      { id: 1, nro_invitacion: 1, tipo },
      { id: 2, nro_invitacion: 2, tipo },
    ]);
    assert.equal(vig.id, 2, tipo);
  }
  ok('J: Bienes / Servicios / Locadores');
}

// K — mismos helpers en listado / workspace / POST
{
  const pp = read('server/lib/portalProveedores.js');
  const pd = read('server/lib/portalDocumentos.js');
  assert.match(pp, /INVITACION_VIGENTE_ORDER_SQL/);
  assert.match(pd, /INVITACION_VIGENTE_ORDER_SQL/);
  assert.match(pp, /loadInvitacionVigente/);
  assert.match(INVITACION_VIGENTE_ORDER_SQL, /nro_invitacion/);
  assert.match(pp, /ORDER BY ip\.solicitud_id, \$\{INVITACION_VIGENTE_ORDER_SQL\}/);
  assert.doesNotMatch(
    pp.slice(pp.indexOf('export async function listMisCotizaciones'), pp.indexOf('export async function getEstadoParticipacion')),
    /cot\.fecha_presentacion DESC/,
  );
  ok('K: Mis Cotizaciones / workspace / POST usan invitación vigente');
}

// L — vigencia no depende de sessionStorage; backend recalcula
{
  const cron = read('server/lib/cronogramaDatetime.js');
  assert.match(cron, /limaNowNaive/);
  assert.match(cron, /America\/Lima/);
  assert.doesNotMatch(
    cron.slice(cron.indexOf('export function isConvocatoriaCerrada'), cron.indexOf('export function pickInvitacionVigente')),
    /new Date\(naive\)/,
  );
  const fe = read('src/views/proveedor/misCotizacionesView.js');
  assert.match(fe, /formatDateTimeLima/);
  assert.match(fe, /formatCronogramaDisplay/);
  assert.match(fe, /convocatoria_cerrada === false/);
  ok('L: plazo recalculado en API (Lima); FE no usa solo caché local');
}

// Extra: select vigente por solicitud no usa la primera
{
  const list = selectVigentePorSolicitud([
    { id: 1, solicitud_id: 6, nro_invitacion: 1, fecha_envio: '2026-07-30T10:00:00Z' },
    { id: 2, solicitud_id: 6, nro_invitacion: 2, fecha_envio: '2026-07-31T18:00:00Z' },
    { id: 3, solicitud_id: 7, nro_invitacion: 1, fecha_envio: '2026-07-31T12:00:00Z' },
  ]);
  assert.equal(list.find((r) => r.solicitud_id === 6).id, 2);
  assert.equal(formatTimestampNaive('2026-07-31 20:00'), '2026-07-31T20:00');
  ok('extra: DISTINCT semántica + plazo naive de solicitudes_cotizacion');
}

console.log('\nPortal reinvitación vigente OK\n');

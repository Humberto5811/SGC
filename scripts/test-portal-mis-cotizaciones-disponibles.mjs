/**
 * Portal — Mis Cotizaciones disponibles + centro en ítems convocados.
 *
 *   node scripts/test-portal-mis-cotizaciones-disponibles.mjs
 *
 * Prueba estática / unitaria (sin BD ni servidor).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCentroDisplay, enrichDetalleItemsCentro } from '../server/lib/centroDisplay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

/** Réplica de labelEstadoCotizacionPortal (portalProveedores). */
function labelEstado({ cotEstado, validacionEstado, convocatoriaCerrada }) {
  const est = String(cotEstado || '').toUpperCase();
  const val = String(validacionEstado || '').toUpperCase();
  if (val === 'OBSERVADO') return 'Observada';
  if (val === 'SUBSANADO' || val === 'SUBSANADA') return 'Subsanada';
  if (est === 'COTIZACION_PRESENTADA') return 'Presentada';
  if (est === 'BORRADOR') return 'Borrador';
  if (convocatoriaCerrada) return 'Cerrada / fuera de plazo';
  return 'Disponible para cotizar';
}

/**
 * Simula listMisCotizaciones: invitaciones + LEFT JOIN cotizaciones.
 */
function buildMisCotizaciones(invitaciones, cotizaciones, proveedorId) {
  const bySol = new Map();
  for (const inv of invitaciones) {
    if (Number(inv.proveedor_id) !== Number(proveedorId)) continue;
    if (!['ENVIADA', 'ENVIADO', 'ABIERTA', 'PARTICIPANDO', 'COTIZACION_PRESENTADA']
      .includes(String(inv.estado || '').toUpperCase())) continue;
    if (['ANULADA', 'ANULADO'].includes(String(inv.solicitud_estado || '').toUpperCase())) continue;
    const key = inv.solicitud_id;
    if (bySol.has(key)) continue; // no duplicar reenvíos
    const cot = cotizaciones.find((c) =>
      Number(c.solicitud_id) === Number(inv.solicitud_id)
      && Number(c.proveedor_id) === Number(proveedorId));
    const cerrada = !!inv.convocatoria_cerrada;
    bySol.set(key, {
      solicitud_id: inv.solicitud_id,
      solicitud_codigo: inv.codigo,
      tipo: inv.tipo,
      cotizacion_estado: cot?.estado || null,
      estado_participacion: labelEstado({
        cotEstado: cot?.estado,
        validacionEstado: cot?.validacion_estado,
        convocatoriaCerrada: cerrada,
      }),
      convocatoria_cerrada: cerrada,
      puede_crear_borrador: !cerrada,
    });
  }
  return [...bySol.values()];
}

console.log('\n=== Portal Mis Cotizaciones / Centro ===\n');

// Caso A — CNCC
{
  const centro = resolveCentroDisplay({
    codigo: 'REQ-00002',
    responsable: 'CNCC',
    cmn: '05277',
    payload: { centro_nombre: 'CNCC', area: { centro: 'CNCC' } },
  });
  assert.equal(centro, 'CNCC');
  const items = enrichDetalleItemsCentro(
    [{ requerimiento_id: 2, requerimiento_codigo: 'REQ-00002', paquete: '', descripcion: 'Item' }],
    new Map([[2, { id: 2, responsable: 'CNCC', payload: { centro_nombre: 'CNCC' } }]]),
  );
  assert.equal(items[0].centro, 'CNCC');
  ok('Caso A: REQ-00002 → centro CNCC (no usa paquete vacío)');
}

// Casos B–D, E, J, K — selector desde invitaciones
{
  const proveedorId = 101;
  const otro = 999;
  const invitaciones = [
    { solicitud_id: 6, codigo: 'SC-00002-2026-INS', proveedor_id: proveedorId, estado: 'ENVIADA', tipo: 'Bienes', convocatoria_cerrada: false },
    { solicitud_id: 6, codigo: 'SC-00002-2026-INS', proveedor_id: proveedorId, estado: 'ENVIADA', tipo: 'Bienes', convocatoria_cerrada: false }, // reenvío
    { solicitud_id: 7, codigo: 'SC-BORRADOR', proveedor_id: proveedorId, estado: 'ABIERTA', tipo: 'Servicios', convocatoria_cerrada: false },
    { solicitud_id: 8, codigo: 'SC-PRESENTADA', proveedor_id: proveedorId, estado: 'COTIZACION_PRESENTADA', tipo: 'Locadores', convocatoria_cerrada: false },
    { solicitud_id: 9, codigo: 'SC-OTRO', proveedor_id: otro, estado: 'ENVIADA', tipo: 'Bienes', convocatoria_cerrada: false },
    { solicitud_id: 10, codigo: 'SC-ANULADA', proveedor_id: proveedorId, estado: 'ENVIADA', solicitud_estado: 'ANULADA', tipo: 'Bienes', convocatoria_cerrada: false },
    { solicitud_id: 11, codigo: 'SC-CERRADA', proveedor_id: proveedorId, estado: 'ENVIADA', tipo: 'Bienes', convocatoria_cerrada: true },
  ];
  const cotizaciones = [
    { solicitud_id: 7, proveedor_id: proveedorId, estado: 'BORRADOR' },
    { solicitud_id: 8, proveedor_id: proveedorId, estado: 'COTIZACION_PRESENTADA' },
  ];
  const list = buildMisCotizaciones(invitaciones, cotizaciones, proveedorId);
  const byCode = Object.fromEntries(list.map((r) => [r.solicitud_codigo, r]));

  assert.ok(byCode['SC-00002-2026-INS'], 'SC-00002 debe aparecer');
  assert.equal(byCode['SC-00002-2026-INS'].estado_participacion, 'Disponible para cotizar');
  assert.equal(byCode['SC-00002-2026-INS'].puede_crear_borrador, true);
  ok('Caso B: invitado sin cotización → Disponible para cotizar');

  assert.equal(byCode['SC-BORRADOR'].estado_participacion, 'Borrador');
  ok('Caso C: con borrador → Borrador');

  assert.equal(byCode['SC-PRESENTADA'].estado_participacion, 'Presentada');
  ok('Caso D: presentada → Presentada');

  assert.ok(!byCode['SC-OTRO']);
  ok('Caso E: solicitud de otro proveedor → no aparece');

  assert.ok(!byCode['SC-ANULADA']);
  assert.equal(byCode['SC-CERRADA']?.estado_participacion, 'Cerrada / fuera de plazo');
  assert.equal(byCode['SC-CERRADA']?.puede_crear_borrador, false);
  ok('Caso J: anulada excluida; cerrada solo consulta (sin crear)');

  assert.equal(list.filter((r) => r.solicitud_codigo === 'SC-00002-2026-INS').length, 1);
  ok('Caso K: no duplica por reenvíos');

  // G–I tipos
  assert.equal(byCode['SC-00002-2026-INS'].tipo, 'Bienes');
  assert.equal(byCode['SC-BORRADOR'].tipo, 'Servicios');
  assert.equal(byCode['SC-PRESENTADA'].tipo, 'Locadores');
  ok('Casos G–I: Bienes / Servicios / Locadores aparecen');
}

// Caso F — preselección por solicitud_id
{
  const invSrc = read('src/views/proveedor/misInvitacionesView.js');
  const cotSrc = read('src/views/proveedor/misCotizacionesView.js');
  const routerSrc = read('src/router.js');
  assert.match(invSrc, /solicitud_id=\$\{encodeURIComponent\(solicitudId\)\}/);
  assert.match(cotSrc, /readSolicitudIdFromHash|solicitud_id/);
  assert.match(cotSrc, /openWizardFor\(parseInt\(target/);
  assert.match(routerSrc, /hash\.includes\('\?'\)/);
  assert.match(cotSrc, /listMisCotizaciones/);
  assert.doesNotMatch(
    cotSrc.slice(cotSrc.indexOf('loadConvocatoriasSelect'), cotSrc.indexOf('async function openWizard')),
    /filter\(\(i\) =>\s*\n?\s*!i\.convocatoria_cerrada/,
  );
  ok('Caso F: Ir a presentar → hash ?solicitud_id= + preselección / auto-open');
}

// SQL / endpoints
{
  const pp = read('server/lib/portalProveedores.js');
  assert.match(pp, /FROM invitacion_proveedores ip/);
  assert.match(pp, /LEFT JOIN cotizaciones_proveedor cot/);
  assert.doesNotMatch(
    pp.slice(pp.indexOf('export async function listMisCotizaciones'), pp.indexOf('export async function getEstadoParticipacion')),
    /FROM cotizaciones_proveedor cot\s+JOIN solicitudes_cotizacion/,
  );
  const invView = read('src/views/proveedor/misInvitacionesView.js');
  assert.match(invView, /it\.centro \|\| it\.centro_nombre/);
  assert.doesNotMatch(invView, /it\.paquete \|\| '—'/);
  ok('SQL corregido (invitación + LEFT JOIN) y UI Centro sin paquete');
}

// No parche exclusivo REQ-00002
{
  const centroSrc = read('server/lib/centroDisplay.js');
  assert.doesNotMatch(centroSrc, /REQ-00002|SC-00002/);
  ok('Sin parche exclusivo a REQ-00002 / SC-00002');
}

console.log('\nPortal Mis Cotizaciones OK\n');

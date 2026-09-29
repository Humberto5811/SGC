/**
 * RC8.17.8H6-C3-D5 — Bandeja Consultas (1 fila = 1 consulta) + consistencia Invitaciones.
 *
 *   node scripts/test-rc8178h6-c3d5-bandeja-consultas-invitaciones.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { listarConsultasBandeja, responderConsultaAnalista } from '../server/lib/portalProveedores.js';
import { listarSolicitudesBandeja } from '../server/lib/invitaciones.js';
import {
  resolveNroInvitacionConsultaBandeja,
  computeConsultasBandejaStats,
} from '../server/lib/consultasObservacionesBandeja.js';
import { enrichEstadoResponsableForBandeja } from '../server/lib/enrichEstadoResponsable.js';

const ts = Date.now();
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

function rucFor(suffix) {
  const salt = String(suffix).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return String(20000000000 + ((ts + salt) % 999999999)).slice(0, 11);
}

async function seedSc(tag, etapa = 'RECEPCION_COTIZACIONES') {
  const { rows: reqRows } = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'Test D5', 'Area', 'CNCC', 'En tramite', $2, '{}'::jsonb)
    RETURNING id
  `, [`REQ-D5-${tag}-${ts}`, etapa === 'RECEPCION_COTIZACIONES' ? 'RECEPCION_COTIZACIONES' : 'INVITACIONES']);
  const rid = reqRows[0].id;
  const corr = (ts % 80000) + 8000 + Math.abs(String(tag).split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 400);
  const { rows: scRows } = await query(`
    INSERT INTO solicitudes_cotizacion (codigo, anio, correlativo, estado, objeto, tipo, detalle_items)
    VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'Bienes', '[]'::jsonb) RETURNING id, codigo
  `, [`SC-D5-${tag}-${ts}`, corr]);
  const sid = scRows[0].id;
  await query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);
  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version, metadata_json
    ) VALUES ($1, $2, $2, 'EN_TRAMITE', 'En trámite', 'PERSONA', 1, 'CNCC', 'asignacion_explicita', 1, '{}'::jsonb)
  `, [rid, etapa]);
  return { rid, sid, codigo: scRows[0].codigo };
}

async function mkProv(suffix) {
  const { rows } = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, $2, TRUE) RETURNING id, ruc, razon_social
  `, [rucFor(suffix), `Prov D5 ${suffix}`]);
  return rows[0];
}

async function mkInv(sid, rid, proveedorId, nro) {
  const { rows } = await query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, 'ENVIADA', $4) RETURNING id, nro_invitacion, proveedor_id
  `, [sid, rid, proveedorId, nro]);
  return rows[0];
}

async function mkConsulta({ sid, rid, proveedorId, invitacionId, asunto, estado = 'PENDIENTE' }) {
  const { rows } = await query(`
    INSERT INTO consultas_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, asunto, consulta, estado
    ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, [sid, proveedorId, rid, invitacionId ?? null, asunto, `Texto ${asunto}`, estado]);
  return rows[0].id;
}

console.log('\n=== RC8.17.8H6-C3-D5 — Bandeja consultas + invitaciones ===\n');
await runMigrations({ silent: true });

const viewSrc = readFileSync(
  new URL('../src/views/contratacion/consultasObservacionesView.js', import.meta.url),
  'utf8',
);
ok(viewSrc.includes('data-consulta-id'), 'I — Ver usa consulta.id en bandeja');
ok(viewSrc.includes('showConsultaDetalleModal'), 'I — detalle directo por consulta');
ok(!viewSrc.includes('cantidad_consultas'), 'A — FE sin columna Cantidad agrupada');
ok(viewSrc.includes('Estado consulta'), 'G — columnas estado consulta vs expediente');
ok(viewSrc.includes('Estado expediente'), 'G — columna estado expediente');

// A, B, C, F — misma SC: legacy respondida + Inv.7 pendiente
const base = await seedSc('main');
const prov = await mkProv('main');
const inv7 = await mkInv(base.sid, base.rid, prov.id, 7);
const idLegacy = await mkConsulta({
  sid: base.sid, rid: base.rid, proveedorId: prov.id, invitacionId: null,
  asunto: 'consulta histórica', estado: 'RESPONDIDA',
});
const idInv7 = await mkConsulta({
  sid: base.sid, rid: base.rid, proveedorId: prov.id, invitacionId: inv7.id,
  asunto: 'consulta plazo', estado: 'PENDIENTE',
});

let rows = (await listarConsultasBandeja({})).filter((r) => Number(r.solicitud_id) === Number(base.sid));
ok(rows.length === 2, 'A — 2 consultas ⇒ 2 filas bandeja');
ok(rows.every((r) => r.id != null), 'A — identidad fila = consulta.id');

const rowInv7 = rows.find((r) => Number(r.id) === Number(idInv7));
const rowLegacy = rows.find((r) => Number(r.id) === Number(idLegacy));
ok(resolveNroInvitacionConsultaBandeja(rowInv7).display === '7', 'B — N° Inv. = 7 exacto');
ok(resolveNroInvitacionConsultaBandeja(rowLegacy).display === 'Legacy', 'C — invitacion_id NULL ⇒ Legacy');
ok(
  rows.some((r) => String(r.estado).toUpperCase() === 'PENDIENTE')
    && rows.some((r) => String(r.estado).toUpperCase() === 'RESPONDIDA'),
  'F — pendiente y respondida visibles juntas',
);

// D — misma Inv.7, 3 proveedores
const baseD = await seedSc('multi-prov');
const p1 = await mkProv('d1');
const inv7d = await mkInv(baseD.sid, baseD.rid, p1.id, 7);
const p2 = await mkProv('d2');
const p3 = await mkProv('d3');
const invP2 = await mkInv(baseD.sid, baseD.rid, p2.id, 7);
const invP3 = await mkInv(baseD.sid, baseD.rid, p3.id, 7);
await mkConsulta({ sid: baseD.sid, rid: baseD.rid, proveedorId: p1.id, invitacionId: inv7d.id, asunto: 'A' });
await mkConsulta({ sid: baseD.sid, rid: baseD.rid, proveedorId: p2.id, invitacionId: invP2.id, asunto: 'B' });
await mkConsulta({ sid: baseD.sid, rid: baseD.rid, proveedorId: p3.id, invitacionId: invP3.id, asunto: 'C' });
const rowsD = (await listarConsultasBandeja({})).filter((r) => Number(r.solicitud_id) === Number(baseD.sid));
ok(rowsD.length === 3, 'D — 3 proveedores ⇒ 3 filas');
ok(new Set(rowsD.map((r) => r.proveedor_id)).size === 3, 'N — proveedores no mezclados');

// E — mismo proveedor, 3 consultas Inv.7
const baseE = await seedSc('same-prov');
const pe = await mkProv('same');
const inve = await mkInv(baseE.sid, baseE.rid, pe.id, 7);
await mkConsulta({ sid: baseE.sid, rid: baseE.rid, proveedorId: pe.id, invitacionId: inve.id, asunto: 'c1' });
await mkConsulta({ sid: baseE.sid, rid: baseE.rid, proveedorId: pe.id, invitacionId: inve.id, asunto: 'c2' });
await mkConsulta({ sid: baseE.sid, rid: baseE.rid, proveedorId: pe.id, invitacionId: inve.id, asunto: 'c3', estado: 'RESPONDIDA' });
const rowsE = (await listarConsultasBandeja({})).filter((r) => Number(r.solicitud_id) === Number(baseE.sid));
ok(rowsE.length === 3, 'E — mismo proveedor 3 consultas ⇒ 3 filas');

// G/H — ERV en filas enriquecidas
const sampleRows = (await listarConsultasBandeja({})).filter((r) => Number(r.id) === Number(idInv7));
await enrichEstadoResponsableForBandeja(sampleRows, 'requerimiento_id');
const ervRow = sampleRows[0];
ok(
  ervRow?.bandeja_contrato?.etapa?.codigo === 'RECEPCION_COTIZACIONES'
    || ervRow?.estado_responsable_vigente?.etapa_codigo === 'RECEPCION_COTIZACIONES',
  'H — etapa ERV Recepción en fila consulta',
);
ok(String(ervRow?.estado || ervRow?.bandeja_contrato?.estado?.codigo || '').includes('TRAMITE')
  || String(ervRow?.bandeja_contrato?.estado?.label || '').includes('trámite'), 'G/H — estado expediente independiente de estado consulta');

// J — responder una no toca otra
const baseJ = await seedSc('resp');
const pj = await mkProv('j');
const inj = await mkInv(baseJ.sid, baseJ.rid, pj.id, 2);
const cJ1 = await mkConsulta({ sid: baseJ.sid, rid: baseJ.rid, proveedorId: pj.id, invitacionId: inj.id, asunto: 'pend1' });
const cJ2 = await mkConsulta({ sid: baseJ.sid, rid: baseJ.rid, proveedorId: pj.id, invitacionId: inj.id, asunto: 'pend2' });
await responderConsultaAnalista(cJ1, { respuesta: 'Ok D5', publicar: false }, 'test-d5');
const { rows: postJ } = await query('SELECT id, estado FROM consultas_proveedor WHERE id = ANY($1::int[])', [[cJ1, cJ2]]);
const st1 = postJ.find((r) => Number(r.id) === Number(cJ1))?.estado;
const st2 = postJ.find((r) => Number(r.id) === Number(cJ2))?.estado;
ok(String(st1).toUpperCase() === 'RESPONDIDA', 'J — consulta respondida cambia solo esa');
ok(String(st2).toUpperCase() === 'PENDIENTE', 'J — otra consulta sigue pendiente');

// K, L
const stats = computeConsultasBandejaStats(rows);
ok(stats.total === 2 && stats.pendientes === 1 && stats.respondidas === 1, 'K — KPI por consultas individuales');
const pendOnly = await listarConsultasBandeja({ estado: 'PENDIENTE' });
ok(pendOnly.every((r) => String(r.estado).toUpperCase() === 'PENDIENTE'), 'L — filtro pendiente');
ok(pendOnly.some((r) => Number(r.id) === Number(idInv7)), 'L — incluye pendiente Inv.7');

// M
const baseM2 = await seedSc('otra-sc');
const pm = await mkProv('m');
const im = await mkInv(baseM2.sid, baseM2.rid, pm.id, 1);
await mkConsulta({ sid: baseM2.sid, rid: baseM2.rid, proveedorId: pm.id, invitacionId: im.id, asunto: 'otra' });
const rowsMain = (await listarConsultasBandeja({})).filter((r) => Number(r.solicitud_id) === Number(base.sid));
const rowsOther = (await listarConsultasBandeja({})).filter((r) => Number(r.solicitud_id) === Number(baseM2.sid));
ok(rowsMain.length === 2 && rowsOther.length === 1, 'M — SC distintas no se mezclan en conteo por SC');

// O — invitaciones: una fila por invitacion_proveedores
const baseO = await seedSc('inv-o');
const po1 = await mkProv('o1');
const po2 = await mkProv('o2');
await mkInv(baseO.sid, baseO.rid, po1.id, 1);
await mkInv(baseO.sid, baseO.rid, po2.id, 2);
const invBandeja = await listarSolicitudesBandeja(1, 100, { search: baseO.codigo });
const invRows = (invBandeja.data || []).filter((r) => r.codigo === baseO.codigo);
ok(invRows.length === 2, 'O — bandeja invitaciones: 2 invitaciones ⇒ 2 filas');
ok(invRows.map((r) => Number(r.nro_invitacion)).sort((a, b) => a - b).join(',') === '1,2', 'O — N° Inv. exacto por fila');

console.log('\n✅ RC8.17.8H6-C3-D5 tests OK\n');

/**
 * RC4.3 — Auditoría del contador del ícono bajo columna Ítem.
 * Ejecutar: node scripts/audit-obs-contador-rc43.mjs [--codigo 051] [--id 51]
 */
import pg from 'pg';
import {
  obtenerEstadoObservaciones,
  countPendientesModulo,
  getListaObservaciones,
  getObservacionesAbiertas,
} from '../shared/observacionesMotor.js';
import { countObservacionesPendientes } from '../src/utils/bandejaUi.js';
import { enrichReqRow } from '../src/utils/trazabilidad.js';
import { buildEstadoVisual } from '../src/utils/estadoVisualPresenter.js';

const { Pool } = pg;
const MODULO_EVAL = 'Evaluación de Requerimiento';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { codigo: '051', id: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--codigo') out.codigo = args[++i];
    if (args[i] === '--id') out.id = Number(args[++i]);
  }
  return out;
}

function parsePayload(row) {
  let p = row?.payload;
  if (typeof p === 'string') {
    try { p = JSON.parse(p || '{}'); } catch (_) { p = {}; }
  }
  return p || {};
}

function auditRow(row, label) {
  const payload = parsePayload(row);
  const payloadObs = Array.isArray(payload.observaciones) ? payload.observaciones : [];
  const motorEval = obtenerEstadoObservaciones(row, MODULO_EVAL);
  const motorGlobal = obtenerEstadoObservaciones(row);
  const countBandeja = countObservacionesPendientes(row, MODULO_EVAL);
  const countPendientes = countPendientesModulo(row, MODULO_EVAL);
  const enriched = enrichReqRow(row);
  const visual = buildEstadoVisual(enriched, { moduloContext: MODULO_EVAL });
  const obsMotorCached = enriched.obsMotor || {};

  const report = {
    label,
    id: row.id,
    codigo: row.codigo,
    moduloBandeja: MODULO_EVAL,
    A_motor: {
      pendientesModuloCount: motorEval.pendientesModuloCount,
      pendientesCount: motorEval.pendientesCount,
      abiertasCount: motorEval.abiertasCount,
      total: motorEval.total,
      requiereBadge: motorEval.requiereBadge,
    },
    B_icono_render_inicial: {
      contadorIcono: countBandeja,
      fuente: 'countObservacionesPendientes → countPendientesModulo',
    },
    B_icono_sync_post_accion: {
      contadorIcono: visual.motor?.pendientesModuloCount ?? 0,
      fuente: 'syncFilaBandejaObservaciones → visual.motor.pendientesModuloCount',
    },
    comparacion: {
      payloadObservacionesLength: payloadObs.length,
      rowObservacionesLength: Array.isArray(row.observaciones) ? row.observaciones.length : null,
      hilosMotorLength: getListaObservaciones(row).length,
      abiertasMotorLength: getObservacionesAbiertas(row).length,
      countPendientesModuloDirecto: countPendientes,
      visualPendientesCount: visual.pendientesCount,
      obsMotorCachedPendientesModuloCount: obsMotorCached.pendientesModuloCount,
      obsMotorCachedPendientesCount: obsMotorCached.pendientesCount,
      obsMotorCachedAbiertasCount: obsMotorCached.abiertasCount,
      obsMotorCachedTotal: obsMotorCached.total,
      motorGlobalPendientesCount: motorGlobal.pendientesCount,
      motorGlobalAbiertasCount: motorGlobal.abiertasCount,
    },
    discrepancia: {
      motorVsIconoRender: motorEval.pendientesModuloCount !== countBandeja,
      motorVsIconoSync: motorEval.pendientesModuloCount !== (visual.motor?.pendientesModuloCount ?? 0),
      iconoVsPayloadLength: countBandeja === payloadObs.length,
      iconoVsHistorialTotal: countBandeja === motorEval.total,
      iconoVsAbiertas: countBandeja === motorEval.abiertasCount,
      iconoVsGlobalPendientes: countBandeja === motorGlobal.pendientesCount,
      iconoVsVisualPendientesCount: countBandeja === visual.pendientesCount,
      iconoVsObsMotorCachedPendientes: countBandeja === obsMotorCached.pendientesCount,
    },
    estadosObservaciones: payloadObs.map((o) => ({
      id: o.id,
      estado: o.estado,
      cerrada: o.cerrada,
      origen: o.origen_submodulo || o.moduloOrigen,
      destino: o.destino_submodulo || o.moduloReceptor,
    })),
  };

  console.log('\n[OBS-CONTADOR-AUDIT]', JSON.stringify(report, null, 2));
  return report;
}

async function fetchFromDb({ codigo, id }) {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'sgc_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });
  try {
    let res;
    if (id) {
      res = await pool.query(
        'SELECT id, codigo, estado, estado_actual, sub_modulo_actual, payload FROM requerimientos WHERE id = $1',
        [id],
      );
    } else {
      res = await pool.query(
        `SELECT id, codigo, estado, estado_actual, sub_modulo_actual, payload
         FROM requerimientos
         WHERE codigo ILIKE $1 OR codigo ILIKE $2 OR id::text = $3
         ORDER BY id DESC LIMIT 5`,
        [`%${codigo}%`, `REQ-${codigo}`, codigo],
      );
    }
    return res.rows;
  } finally {
    await pool.end();
  }
}

async function main() {
  const args = parseArgs();
  console.log('RC4.3 — Auditoría contador ícono observaciones');
  console.log(`Buscando requerimiento codigo=${args.codigo} id=${args.id ?? 'auto'}…`);

  let rows = [];
  try {
    rows = await fetchFromDb(args);
  } catch (e) {
    console.warn('No se pudo conectar a PostgreSQL:', e.message);
    console.warn('Continuando con payload simulado de 4 observaciones cerradas…');
    const payload = {
      observaciones: [
        { id: 'o1', estado: 'CERRADA', cerrada: true, origen_submodulo: 'Evaluación de Requerimiento', destino_submodulo: 'Registro de Requerimiento', motivo: 'Obs 1' },
        { id: 'o2', estado: 'CERRADA', cerrada: true, origen_submodulo: 'DEC', destino_submodulo: 'Evaluación de Requerimiento', motivo: 'Obs 2' },
        { id: 'o3', estado: 'CERRADA', cerrada: true, origen_submodulo: 'Evaluación de Requerimiento', destino_submodulo: 'DEC', motivo: 'Obs 3' },
        { id: 'o4', estado: 'CERRADA', cerrada: true, origen_submodulo: 'Programación', destino_submodulo: 'Evaluación de Requerimiento', motivo: 'Obs 4' },
      ],
      workflowSnapshot: { etapaActual: 'INVITACIONES', subModuloActual: 'Invitaciones' },
    };
    rows = [{
      id: 51,
      codigo: 'REQ-051',
      estado: 'En Invitaciones',
      estado_actual: 'INVITACIONES',
      sub_modulo_actual: 'Invitaciones',
      payload: JSON.stringify(payload),
    }];
  }

  if (!rows.length) {
    console.error('No se encontró requerimiento.');
    process.exit(1);
  }

  const reports = rows.map((r, i) => auditRow(r, `row-${i}`));

  console.log('\n=== RESUMEN RC4.3 ===');
  for (const r of reports) {
    const icono = r.B_icono_render_inicial.contadorIcono;
    const motor = r.A_motor.pendientesModuloCount;
    console.log(`\n${r.codigo} (id=${r.id})`);
    console.log(`  A) Motor pendientesModuloCount (Eval): ${motor}`);
    console.log(`  B) Icono render inicial: ${icono}`);
    console.log(`  B) Icono sync post-acción: ${r.B_icono_sync_post_accion.contadorIcono}`);
    if (icono !== motor) {
      const d = r.discrepancia;
      const candidatos = [];
      if (d.iconoVsPayloadLength) candidatos.push(`payload.observaciones.length=${r.comparacion.payloadObservacionesLength}`);
      if (d.iconoVsHistorialTotal) candidatos.push(`motor.total=${r.A_motor.total}`);
      if (d.iconoVsAbiertas) candidatos.push(`motor.abiertasCount=${r.A_motor.abiertasCount}`);
      if (d.iconoVsGlobalPendientes) candidatos.push(`motorGlobal.pendientesCount=${r.comparacion.motorGlobalPendientesCount}`);
      if (d.iconoVsVisualPendientesCount) candidatos.push(`visual.pendientesCount=${r.comparacion.visualPendientesCount}`);
      if (d.iconoVsObsMotorCachedPendientes) candidatos.push(`row.obsMotor.pendientesCount=${r.comparacion.obsMotorCachedPendientesCount}`);
      console.log(`  C) Variable que coincide con icono (${icono}): ${candidatos.join(' | ') || 'ninguna colección local — revisar DOM/sync'}`);
      console.log('  D) Componente: revisar render inicial (bandejaUi) vs sync (observacionesUi) vs recarga bandeja');
    } else if (icono > 0 && motor === 0) {
      console.log('  ⚠ Motor=0 pero icono>0 — imposible en render estático; causa probable: DOM desincronizado (sync)');
    } else {
      console.log('  ✓ Motor y contador coinciden en render estático.');
      if (icono > 0) console.log('  ℹ Si UI muestra otro valor, la causa es DOM/sync sin recarga.');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

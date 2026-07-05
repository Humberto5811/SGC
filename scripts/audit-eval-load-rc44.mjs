/**
 * RC4.4 — Simulación estática del pipeline de carga bandeja Evaluación.
 * Ejecutar: node scripts/audit-eval-load-rc44.mjs
 */
import {
  obtenerEstadoObservaciones,
  countPendientesModulo,
} from '../shared/observacionesMotor.js';
import { enrichReqRow } from '../src/utils/trazabilidad.js';
import { countObservacionesPendientes } from '../src/utils/bandejaUi.js';
import {
  requerimientoVisibleEnEvaluacion,
} from '../src/utils/bandejaRequerimientos.js';

const EVAL = 'Evaluación de Requerimiento';
const REG = 'Registro de Requerimiento';

function serverEnrich(row) {
  const obsMotor = obtenerEstadoObservaciones(row);
  return { ...row, obsMotor };
}

function stage(label, row, extra = {}) {
  const motorEval = obtenerEstadoObservaciones(row, EVAL);
  const countEval = countPendientesModulo(row, EVAL);
  const countReg = countPendientesModulo(row, REG);
  let payloadLen = 0;
  try {
    const p = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {});
    payloadLen = (p.observaciones || []).length;
  } catch (_) {}
  return {
    label,
    id: row.id,
    codigo: row.codigo,
    pendientesModuloCountEval: motorEval.pendientesModuloCount,
    countPendientesEval: countEval,
    countPendientesReg: countReg,
    abiertasCount: motorEval.abiertasCount,
    obsMotorTotal: row.obsMotor?.total,
    obsMotorPendientes: row.obsMotor?.pendientesCount,
    payloadObs: payloadLen,
    visibleEnEval: requerimientoVisibleEnEvaluacion(row),
    iconoEvalRender: countObservacionesPendientes(row, EVAL),
    iconoRegRender: countObservacionesPendientes(row, REG),
    ...extra,
  };
}

function runPipeline(name, baseRow) {
  console.log(`\n========== ${name} ==========`);
  const stages = [];
  stages.push(stage('A-api-raw', baseRow));
  const server = serverEnrich(baseRow);
  stages.push(stage('A-server-enrichRequerimientoRow', server));
  const client1 = enrichReqRow(server);
  stages.push(stage('B-after-enrichReqRow-1', client1));
  const client2 = enrichReqRow(client1);
  stages.push(stage('C-enrichReqRow-2-render', client2));
  stages.push(stage('C-renderCompactRowCells', client2, {
    icono: countObservacionesPendientes(client2, EVAL),
  }));

  for (let i = 1; i < stages.length; i += 1) {
    const prev = stages[i - 1];
    const cur = stages[i];
    const prevC = prev.countPendientesEval;
    const curC = cur.countPendientesEval;
    if (prevC !== curC) {
      console.warn('[EVAL-LOAD-SHIFT-STATIC]', {
        pipeline: name,
        from: prev.label,
        to: cur.label,
        fromCount: prevC,
        toCount: curC,
      });
    }
  }
  console.table(stages);
  return stages;
}

// Escenario 1: 4 cerradas — motor 0, historial 4
const payloadCerradas = {
  observaciones: Array.from({ length: 4 }, (_, i) => ({
    id: `c${i}`,
    estado: 'CERRADA',
    cerrada: true,
    origen_submodulo: 'Evaluación de Requerimiento',
    destino_submodulo: 'Registro de Requerimiento',
  })),
  historial_evaluacion: [{ tipo: 'derivacion', fecha: '2026-01-01' }],
  workflowSnapshot: { etapaActual: 'INVITACIONES', subModuloActual: 'Invitaciones' },
};
runPipeline('REQ-051 — 4 CERRADAS', {
  id: 51,
  codigo: 'REQ-051',
  estado: 'En Invitaciones',
  estado_actual: 'INVITACIONES',
  sub_modulo_actual: 'Invitaciones',
  payload: JSON.stringify(payloadCerradas),
});

// Escenario 2: 4 subsanadas — emisor Eval pendiente (icono 4 solo en Eval)
const payloadSubsanadas = {
  observaciones: Array.from({ length: 4 }, (_, i) => ({
    id: `s${i}`,
    estado: 'SUBSANADA',
    origen_submodulo: 'Evaluación de Requerimiento',
    destino_submodulo: 'Registro de Requerimiento',
    subsanacion: { texto: 'ok' },
  })),
  historial_evaluacion: [{ tipo: 'derivacion', fecha: '2026-01-01' }],
  workflowSnapshot: { etapaActual: 'INVITACIONES' },
};
const s2 = runPipeline('REQ-051 — 4 SUBSANADAS emisor Eval', {
  id: 51,
  codigo: 'REQ-051',
  estado: 'En Invitaciones',
  estado_actual: 'INVITACIONES',
  payload: JSON.stringify(payloadSubsanadas),
});

console.log('\n--- Comparación Eval vs Registro (escenario subsanadas) ---');
console.log({
  evalIcono: s2.at(-1).iconoEvalRender,
  regIcono: s2.at(-1).iconoRegRender,
  evalPendientes: s2.at(-1).countPendientesEval,
  regPendientes: s2.at(-1).countPendientesReg,
});

// Escenario 3: obsMotor server con total=4 pero payload vacío (cache corrupto)
runPipeline('Cache obsMotor stale', {
  id: 51,
  codigo: 'REQ-051',
  payload: JSON.stringify({ observaciones: [], historial_evaluacion: [{ tipo: 'derivacion' }] }),
  obsMotor: {
    total: 4,
    pendientesCount: 4,
    abiertasCount: 4,
    pendientesModuloCount: 0,
  },
});

console.log('\n✓ Auditoría estática RC4.4 completada.\n');

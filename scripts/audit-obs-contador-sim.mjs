/**
 * RC4.3 — Simulaciones de discrepancia contador vs motor.
 */
import {
  obtenerEstadoObservaciones,
  countPendientesModulo,
} from '../shared/observacionesMotor.js';
import { buildEstadoVisual } from '../src/utils/estadoVisualPresenter.js';
import { enrichReqRow } from '../src/utils/trazabilidad.js';
import { countObservacionesPendientes } from '../src/utils/bandejaUi.js';

const MOD = 'Evaluación de Requerimiento';

function row(payload, extra = {}) {
  return {
    id: 51,
    codigo: 'REQ-051',
    estado: 'En Invitaciones',
    estado_actual: 'INVITACIONES',
    sub_modulo_actual: 'Invitaciones',
    payload: JSON.stringify(payload),
    ...extra,
  };
}

function report(scenario, r) {
  const motor = obtenerEstadoObservaciones(r, MOD);
  const icono = countObservacionesPendientes(r, MOD);
  const visual = buildEstadoVisual(enrichReqRow(r), { moduloContext: MOD });
  console.log(`\n--- ${scenario} ---`);
  console.log({
    pendientesModuloCount: motor.pendientesModuloCount,
    abiertasCount: motor.abiertasCount,
    total: motor.total,
    iconoRender: icono,
    visualPendientesCount: visual.pendientesCount,
    visualMotorPendientes: visual.motor?.pendientesModuloCount,
    payloadLen: JSON.parse(r.payload).observaciones?.length,
  });
}

// S1: 4 cerradas — historial total = 4
report('S1: 4 observaciones CERRADAS', row({
  observaciones: Array.from({ length: 4 }, (_, i) => ({
    id: `c${i}`,
    estado: 'CERRADA',
    cerrada: true,
    origen_submodulo: 'Evaluación de Requerimiento',
    destino_submodulo: 'Registro de Requerimiento',
  })),
  workflowSnapshot: { etapaActual: 'INVITACIONES' },
}));

// S2: 4 subsanadas — emisor Eval debe cerrar
report('S2: 4 SUBSANADAS (emisor Eval pendiente cierre)', row({
  observaciones: Array.from({ length: 4 }, (_, i) => ({
    id: `s${i}`,
    estado: 'SUBSANADA',
    origen_submodulo: 'Evaluación de Requerimiento',
    destino_submodulo: 'Registro de Requerimiento',
    subsanacion: { texto: 'ok' },
  })),
  workflowSnapshot: { etapaActual: 'INVITACIONES' },
}));

// S3: visual.pendientesCount con pendientes globales en otro módulo
const payload3 = {
  observaciones: [
    { id: 'a', estado: 'EMITIDA', origen_submodulo: 'Invitaciones', destino_submodulo: 'Coordinación CM' },
    { id: 'b', estado: 'EMITIDA', origen_submodulo: 'Invitaciones', destino_submodulo: 'Coordinación CM' },
    { id: 'c', estado: 'EMITIDA', origen_submodulo: 'Invitaciones', destino_submodulo: 'Coordinación CM' },
    { id: 'd', estado: 'EMITIDA', origen_submodulo: 'Invitaciones', destino_submodulo: 'Coordinación CM' },
  ],
  workflowSnapshot: { etapaActual: 'INVITACIONES' },
};
report('S3: 4 abiertas hacia CM (Eval sin pendientes)', row(payload3));

// S4: stale obsMotor cache on row
const r4 = row({ observaciones: [] });
const staleMotor = obtenerEstadoObservaciones({
  payload: { observaciones: Array.from({ length: 4 }, (_, i) => ({ id: `x${i}`, estado: 'EMITIDA', destino_submodulo: 'Evaluación de Requerimiento', origen_submodulo: 'DEC' })) },
}, MOD);
r4.obsMotor = staleMotor;
report('S4: payload vacío + obsMotor cache stale', r4);

console.log('\n✓ Simulaciones RC4.3 completadas.\n');

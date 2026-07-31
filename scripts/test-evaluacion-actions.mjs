/**
 * Acciones Aprobar / Observaciones en bandeja Evaluación.
 */
import { estaEnEvaluacion, evalMenuItems } from '../src/utils/bandejaActions.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function flags(r) {
  const items = evalMenuItems(r);
  const approve = items.find((m) => m.act === 'approve');
  const obs = items.find((m) => m.act === 'obs');
  return {
    enEvaluacion: estaEnEvaluacion(r),
    aprobarDisabled: !!approve?.disabled,
    obsDisabled: !!obs?.disabled,
  };
}

// Caso A — canónico (REQ-00002)
const a = flags({
  estado: 'REQUERIMIENTO_EN_EVALUACION',
  estado_actual: 'EVALUACION',
  estadoActual: 'EVALUACION',
});
assert(a.enEvaluacion === true, 'A: estaEnEvaluacion');
assert(a.aprobarDisabled === false, 'A: Aprobar habilitado');
assert(a.obsDisabled === false, 'A: Observaciones habilitado');

// Caso B — legado
const b = flags({ estado: 'En trámite de aprobación' });
assert(b.enEvaluacion === true, 'B: estaEnEvaluacion legado');
assert(b.aprobarDisabled === false, 'B: Aprobar habilitado');
assert(b.obsDisabled === false, 'B: Observaciones habilitado');

// Caso B2 — legado sin tilde
const b2 = flags({ estado: 'En tramite de aprobación' });
assert(b2.aprobarDisabled === false, 'B2: Aprobar habilitado (sin tilde)');

// Caso C — aprobado
const c = flags({ estado: 'REQUERIMIENTO_APROBADO' });
assert(c.aprobarDisabled === true, 'C: Aprobar deshabilitado');

// Caso D — aún en registro
const d = flags({
  estado: 'REQUERIMIENTO_REGISTRADO',
  estado_actual: 'REGISTRADO',
});
assert(d.enEvaluacion === false, 'D: no en evaluación');
assert(d.aprobarDisabled === true, 'D: Aprobar deshabilitado');

// estado_codigo / estado_vigente
assert(estaEnEvaluacion({ estado_codigo: 'REQUERIMIENTO_EN_EVALUACION' }) === true, 'codigo');
assert(estaEnEvaluacion({ estado_vigente: 'REQUERIMIENTO_EN_EVALUACION' }) === true, 'vigente');

console.log('OK test-evaluacion-actions');

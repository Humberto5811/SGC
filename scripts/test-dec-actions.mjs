/**
 * Acciones “Aprobar DEC” / Observaciones en bandeja DEC.
 */
import { estaEnDecAccionable, decMenuItems } from '../src/utils/bandejaActions.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function flags(r) {
  const items = decMenuItems(r);
  const approve = items.find((m) => m.act === 'approve');
  const obs = items.find((m) => m.act === 'obs');
  return {
    accionable: estaEnDecAccionable(r),
    aprobarDisabled: !!approve?.disabled,
    obsDisabled: !!obs?.disabled,
  };
}

// A — canónico (REQ-00002)
const a = flags({
  estado_actual: 'DEC',
  estado: 'REQUERIMIENTO_EN_DEC',
});
assert(a.accionable === true, 'A: accionable');
assert(a.aprobarDisabled === false, 'A: Aprobar DEC habilitado');

// B — via estado_codigo / estadoActual
const b = flags({
  estadoActual: 'DEC',
  estado_codigo: 'REQUERIMIENTO_EN_DEC',
});
assert(b.accionable === true, 'B: accionable');
assert(b.aprobarDisabled === false, 'B: Aprobar DEC habilitado');

// C — legado exacto "Aprobado"
const c = flags({
  estado_actual: 'DEC',
  estado: 'Aprobado',
});
assert(c.accionable === true, 'C: legado Aprobado');
assert(c.aprobarDisabled === false, 'C: Aprobar DEC habilitado');

// D — ya aprobado por DEC
const d = flags({
  estado_actual: 'DEC',
  estado: 'REQUERIMIENTO_APROBADO_DEC',
});
assert(d.accionable === false, 'D: no accionable');
assert(d.aprobarDisabled === true, 'D: Aprobar DEC deshabilitado');

// E — ya en Programación
const e = flags({
  estado_actual: 'PROGRAMACION',
  estado: 'REQUERIMIENTO_EN_PROGRAMACION',
});
assert(e.accionable === false, 'E: no accionable');
assert(e.aprobarDisabled === true, 'E: Aprobar DEC deshabilitado');

// F — Observaciones sigue habilitado en DEC accionable
const f = flags({
  estado_actual: 'DEC',
  estado: 'REQUERIMIENTO_EN_DEC',
});
assert(f.obsDisabled === false, 'F: Observaciones habilitado');

// Extra: legado "Aprobado DEC" no debe re-aprobar
assert(estaEnDecAccionable({
  estado_actual: 'DEC',
  estado: 'Aprobado DEC',
}) === false, 'legado Aprobado DEC bloqueado');

console.log('OK test-dec-actions');

/**
 * Validación estática: columna Responsable (Registro) = persona creadora, nunca centro.
 */
import { resolveResponsablePersonaDisplay, isIdentificadorGenerico } from '../server/lib/usuarioDisplay.js';

const ETAPA_ROLES = [
  'Usuario AU', 'Director / Gerente', 'DEC', 'Programador',
  'Coordinador de Contratos Menores', 'Especialista Contrataciones',
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(isIdentificadorGenerico('Usuario AU'), 'Usuario AU debe ser genérico');
assert(!isIdentificadorGenerico('WVASQUEZ'), 'WVASQUEZ no es genérico');

// Caso reportado: historial contaminado con centro (CNCC) + creador real en CREADO / usuario_modificacion
const r1 = resolveResponsablePersonaDisplay({
  responsable: 'CNCC',
  centro_nombre: 'CNCC',
  responsable_actual: 'Usuario AU',
  usuario_modificacion: 'WVASQUEZ',
  historial_estados: [{ usuario: 'CNCC', accion: 'creacion' }],
  historial_movimientos: [{ accion: 'CREADO', usuario: 'WVASQUEZ' }],
}, ETAPA_ROLES);
assert(r1 === 'WVASQUEZ', `CREADO gana sobre historial/centro: esperado WVASQUEZ, got ${r1}`);

// Sin movimiento: saltar centro en historial y usar usuario_modificacion
const r2 = resolveResponsablePersonaDisplay({
  responsable: 'CNCC',
  responsable_actual: 'Usuario AU',
  usuario_modificacion: 'Juan Pérez',
  historial_estados: [{ usuario: 'CNCC', accion: 'creacion' }],
}, ETAPA_ROLES);
assert(r2 === 'Juan Pérez', `saltar centro en historial: esperado Juan Pérez, got ${r2}`);

// historial persona válida
const r3 = resolveResponsablePersonaDisplay({
  responsable: 'CNCC',
  responsable_actual: 'Usuario AU',
  usuario_modificacion: '',
  historial_estados: [{ usuario: 'María López', accion: 'creacion' }],
}, ETAPA_ROLES);
assert(r3 === 'María López', `historial persona: esperado María López, got ${r3}`);

// responsable_actual = centro → no usarlo
const r4 = resolveResponsablePersonaDisplay({
  responsable: 'CNCC',
  responsable_actual: 'CNCC',
  usuario_modificacion: 'WVASQUEZ',
}, ETAPA_ROLES);
assert(r4 === 'WVASQUEZ', `no usar centro en responsable_actual: esperado WVASQUEZ, got ${r4}`);

// Sin persona real
const r5 = resolveResponsablePersonaDisplay({
  responsable: 'CNCC',
  responsable_actual: 'Usuario AU',
  usuario_modificacion: '',
  historial_estados: [{ usuario: 'CNCC', accion: 'creacion' }],
}, ETAPA_ROLES);
assert(r5 === 'Usuario AU', `sin persona: esperado Usuario AU, got ${r5}`);

console.log('OK test-responsable-registro-display');

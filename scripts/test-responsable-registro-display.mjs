/**
 * Validación estática: columna Responsable (Registro) muestra persona, no rol genérico.
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

const r1 = resolveResponsablePersonaDisplay({
  responsable_actual: 'Usuario AU',
  usuario_modificacion: 'WVASQUEZ',
}, ETAPA_ROLES);
assert(r1 === 'WVASQUEZ', `esperado WVASQUEZ, got ${r1}`);

const r2 = resolveResponsablePersonaDisplay({
  responsable_actual: 'Usuario AU',
  usuario_modificacion: '',
  historial_estados: [{ usuario: 'WVASQUEZ', accion: 'creacion' }],
}, ETAPA_ROLES);
assert(r2 === 'WVASQUEZ', `historial: esperado WVASQUEZ, got ${r2}`);

const r3 = resolveResponsablePersonaDisplay({
  responsable_actual: 'Usuario AU',
  usuario_modificacion: '',
}, ETAPA_ROLES);
assert(r3 === 'Usuario AU', `sin persona: esperado Usuario AU, got ${r3}`);

const r4 = resolveResponsablePersonaDisplay({
  responsable_actual: 'Usuario AU',
  usuario_modificacion: 'EditorX',
  historial_estados: [{ usuario: 'WVASQUEZ', accion: 'creacion' }],
}, ETAPA_ROLES);
assert(r4 === 'WVASQUEZ', `preferir creador historial: esperado WVASQUEZ, got ${r4}`);

console.log('OK test-responsable-registro-display');

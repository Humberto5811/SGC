/**
 * Validación: creador real en alta + display Responsable (nunca centro).
 */
import {
  resolveResponsablePersonaDisplay,
  resolveUsuarioCreadorRequerimiento,
  isIdentificadorGenerico,
  isUsuarioCreadorInvalido,
} from '../server/lib/usuarioDisplay.js';
import { initHistorialFromRow, ETAPAS } from '../server/lib/trazabilidad.js';
import { buildMovimientoEntry } from '../server/lib/movimientos.js';
import { getUserAuditName } from '../src/utils/userDisplay.js';

const ETAPA_ROLES = Object.values(ETAPAS).map((v) => v.responsable);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(isIdentificadorGenerico('Usuario AU'), 'Usuario AU debe ser genérico');
assert(!isIdentificadorGenerico('WVASQUEZ'), 'WVASQUEZ no es genérico');
assert(isUsuarioCreadorInvalido('CNCC', { responsable: 'CNCC' }), 'CNCC inválido como creador');
assert(!isUsuarioCreadorInvalido('WVASQUEZ', { responsable: 'CNCC' }), 'WVASQUEZ válido');

// --- Caso realista de ALTA (origen del dato) ---
const rowAlta = {
  responsable: 'CNCC', // centro en columna mal nombrada
  area: 'Área X',
  usuario_modificacion: 'WVASQUEZ',
  estado: 'Registrado',
  created_at: '2026-07-30T12:00:00.000Z',
};
const authUser = { username: 'WVASQUEZ', nombre: 'CNCC', centro: 'CNCC', dni: '123' };
const auditName = getUserAuditName(authUser);
assert(auditName === 'WVASQUEZ', `getUserAuditName: esperado WVASQUEZ, got ${auditName}`);

// Simula candidato contaminado (centro) + auth correcto
const creador = resolveUsuarioCreadorRequerimiento(
  rowAlta,
  'CNCC', // body erróneo / contaminado
  auditName,
  rowAlta.usuario_modificacion,
);
assert(creador === 'WVASQUEZ', `resolveUsuarioCreador: esperado WVASQUEZ, got ${creador}`);

const historial = initHistorialFromRow(rowAlta, 'CNCC'); // candidato centro → debe caer a usuario_modificacion
assert(historial[0].usuario === 'WVASQUEZ', `historial[0]: esperado WVASQUEZ, got ${historial[0].usuario}`);

const mov = buildMovimientoEntry({
  fecha: rowAlta.created_at,
  accion: 'CREADO',
  etapa: 'REGISTRADO',
  usuario: creador,
  responsable: ETAPAS.REGISTRADO.responsable,
  observacion: 'Registro inicial del requerimiento',
});
assert(mov.usuario === 'WVASQUEZ', `CREADO.usuario: esperado WVASQUEZ, got ${mov.usuario}`);
assert(mov.responsable === 'Usuario AU', `CREADO.responsable rol: esperado Usuario AU, got ${mov.responsable}`);
assert(rowAlta.responsable === 'CNCC', 'centro se conserva en row.responsable');

// initHistorial con solo centro como candidatos → Sistema (nunca CNCC)
const histSoloCentro = initHistorialFromRow({ responsable: 'CNCC', usuario_modificacion: '' }, 'CNCC');
assert(histSoloCentro[0].usuario === 'Sistema', `sin persona: esperado Sistema, got ${histSoloCentro[0].usuario}`);

// --- Display (compatibilidad antiguos) ---
const r1 = resolveResponsablePersonaDisplay({
  responsable: 'CNCC',
  centro_nombre: 'CNCC',
  responsable_actual: 'Usuario AU',
  usuario_modificacion: 'WVASQUEZ',
  historial_estados: [{ usuario: 'CNCC', accion: 'creacion' }],
  historial_movimientos: [{ accion: 'CREADO', usuario: 'WVASQUEZ' }],
}, ETAPA_ROLES);
assert(r1 === 'WVASQUEZ', `display CREADO: esperado WVASQUEZ, got ${r1}`);

const r2 = resolveResponsablePersonaDisplay({
  responsable: 'CNCC',
  responsable_actual: 'Usuario AU',
  usuario_modificacion: 'Juan Pérez',
  historial_estados: [{ usuario: 'CNCC', accion: 'creacion' }],
}, ETAPA_ROLES);
assert(r2 === 'Juan Pérez', `display um: esperado Juan Pérez, got ${r2}`);

const r3 = resolveResponsablePersonaDisplay({
  responsable: 'CNCC',
  responsable_actual: 'Usuario AU',
  usuario_modificacion: '',
  historial_estados: [{ usuario: 'CNCC', accion: 'creacion' }],
}, ETAPA_ROLES);
assert(r3 === 'Usuario AU', `display sin persona: esperado Usuario AU, got ${r3}`);

console.log('OK test-responsable-registro-display');

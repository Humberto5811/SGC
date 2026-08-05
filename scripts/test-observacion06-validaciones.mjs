import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canUserValidateExpediente,
  getSubmodulosValidacion,
} from '../server/lib/validacionesCotizacion.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

console.log('Observación 06 — derivación, visibilidad y estándar\n');

assert.deepEqual(getSubmodulosValidacion(), [
  { code: 'VALIDACIONES', label: 'Validaciones' },
]);
console.log('  ✓ Único destino permitido: Validaciones');

const cot = {
  validacion_estado: 'DERIVADA',
  validacion_responsable: 'VASQUEZ ANCHELIA WILLIAM GILDER',
  validacion_informe: {
    derivacion: {
      responsable_id: 20,
      responsable_nombre: 'VASQUEZ ANCHELIA WILLIAM GILDER',
      derivado_por: 'jcrisostomo',
    },
  },
};
const responsable = canUserValidateExpediente(cot, 'wvasquez', 20);
assert.equal(responsable.puedeVer, true);
assert.equal(responsable.puedeValidar, true);
const derivador = canUserValidateExpediente(cot, 'jcrisostomo', 99);
assert.equal(derivador.puedeVer, true);
assert.equal(derivador.puedeValidar, false);
const ajeno = canUserValidateExpediente(cot, 'otro.usuario', 88);
assert.equal(ajeno.puedeVer, false);
console.log('  ✓ Responsable valida; analista derivador conserva seguimiento');

const modal = read('src/utils/derivarValidacionModal.js');
assert.match(modal, /filter\(\(s\) => s\.code === 'VALIDACIONES'\)/);
assert.match(modal, /preview\.responsable_sugerido/);
assert.match(modal, /await selSub\.onchange\(\)/);
console.log('  ✓ Modal preselecciona destino y creador sugerido');

const portal = read('server/lib/portalProveedores.js');
const validaciones = read('server/lib/validacionesCotizacion.js');
const recepcionUtils = read('src/utils/recepcionCotizacionUtils.js');
const validacionesUtils = read('src/utils/validacionesUtils.js');
assert.match(portal, /requerimiento_id: r\.requerimiento_id/);
assert.match(validaciones, /requerimiento_id: r\.requerimiento_id/);
assert.match(validaciones, /único submódulo permitido/);
assert.match(recepcionUtils, /estado_responsable_vigente:/);
assert.match(validacionesUtils, /estado_responsable_vigente:/);
console.log('  ✓ Recepción y Validaciones preservan contrato Estado/Responsable');

const recepcionView = read('src/views/contratacion/recepcionCotizacionesView.js');
const validacionesView = read('src/views/contratacion/validacionesView.js');
assert.doesNotMatch(recepcionView, /<th>Responsable actual<\/th>/);
assert.match(recepcionView, /estadoActualBadge\(exp\)/);
assert.match(validacionesView, /estadoActualBadge\(exp\)/);
assert.match(validacionesView, /Revisar y validar/);
console.log('  ✓ Bandejas usan el estándar visual y acciones correctas');

console.log('\nOK — Observación 06\n');

/**
 * Observación 05_02 — Acciones / destino / Estado-Responsable en Recepción.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  labelAccionDerivacionRecepcion,
  resolveDestinoDesdeRecepcionCotizaciones,
  DESTINOS_RECEPCION,
} from '../shared/workflow/destinoRecepcion.js';
import {
  recepcionExpedienteMenuItems,
  recepcionCotizacionesMenuItems,
} from '../src/utils/bandejaActions.js';
import { consolidarExpedientesRecepcion } from '../src/utils/recepcionCotizacionUtils.js';
import { getSubmodulosValidacion } from '../server/lib/validacionesCotizacion.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// 1. Etiquetas Enviar a (no "Enviar a validar" genérico)
assert.equal(labelAccionDerivacionRecepcion('SERVICIOS'), 'Enviar a Validaciones');
assert.equal(labelAccionDerivacionRecepcion('locacion'), 'Enviar a CCP');
assert.equal(resolveDestinoDesdeRecepcionCotizaciones('BIENES'), DESTINOS_RECEPCION.VALIDACIONES);
assert.equal(resolveDestinoDesdeRecepcionCotizaciones('LOCADORES'), DESTINOS_RECEPCION.CCP);

// 2. Menú expediente: Bienes → Validaciones; Locación → CCP
const expBien = {
  solicitud_id: 1,
  tipo: 'BIENES',
  cotizaciones: [{
    id: 10,
    estado: 'COTIZACION_PRESENTADA',
    tipo: 'BIENES',
    validacion_estado: 'PENDIENTE',
  }],
};
const expLoc = {
  solicitud_id: 2,
  tipo: 'locacion',
  cotizaciones: [{
    id: 20,
    estado: 'COTIZACION_PRESENTADA',
    tipo: 'locacion',
    validacion_estado: 'PENDIENTE',
  }],
};
const menuBien = recepcionExpedienteMenuItems(expBien);
assert.ok(menuBien.some((i) => i.act === 'ver'));
assert.ok(menuBien.some((i) => i.act === 'enviarValidar' && /Enviar a Validaciones/i.test(i.label)));
assert.ok(!menuBien.some((i) => i.act === 'enviarCcp'));

const menuLoc = recepcionExpedienteMenuItems(expLoc);
assert.ok(menuLoc.some((i) => i.act === 'enviarCcp' && /Enviar a CCP/i.test(i.label)));
assert.ok(!menuLoc.some((i) => i.act === 'enviarValidar'));

const menuCot = recepcionCotizacionesMenuItems(expBien.cotizaciones[0]);
assert.ok(menuCot.some((i) => /Enviar a Validaciones/i.test(i.label)));

// 3. Submódulos destino solo Validaciones
const subs = getSubmodulosValidacion();
assert.deepEqual(subs.map((s) => s.code), ['VALIDACIONES']);
assert.ok(!subs.some((s) => /REGISTRO|EVALUACION/i.test(s.code)));

const valSrc = read('server/lib/validacionesCotizacion.js');
assert.match(valSrc, /solo se puede derivar al submódulo Validaciones/);

const modalSrc = read('src/utils/derivarValidacionModal.js');
assert.match(modalSrc, /Enviar a Validaciones/);
assert.match(modalSrc, /filter\(\(s\) => String\(s\.code/);
assert.doesNotMatch(modalSrc, /Enviar a validar/);

// 4. Bandeja: Acciones + Responsable (sin "Responsable actual" / solo Ver)
const viewSrc = read('src/views/contratacion/recepcionCotizacionesView.js');
assert.match(viewSrc, /recepcionExpedienteMenuItems/);
assert.match(viewSrc, /renderActionMenuCell/);
assert.match(viewSrc, /bindActionMenus/);
assert.match(viewSrc, />Responsable</);
assert.doesNotMatch(viewSrc, /Responsable actual/);
assert.match(viewSrc, /estadoActualBadge|badgeEstadoBandejaRecepcion/);
assert.match(viewSrc, /getResponsableVigenteLabel/);
assert.match(viewSrc, /enviarCcp/);
assert.match(viewSrc, /Enviar a CCP/);

// 5. BE propaga requerimiento_id para enrichment responsable
const portalSrc = read('server/lib/portalProveedores.js');
assert.match(portalSrc, /requerimiento_id: r\.requerimiento_id/);
assert.match(portalSrc, /COALESCE\(\s*cot\.requerimiento_id/);

// 6. Consolidación preserva requerimiento_id / estado_responsable_vigente
const flat = consolidarExpedientesRecepcion([{
  solicitud_id: 9,
  solicitud_codigo: 'SC-9',
  tipo: 'SERVICIOS',
  requerimiento_id: 77,
  estado: 'COTIZACION_PRESENTADA',
  validacion_estado: 'PENDIENTE',
  estado_responsable_vigente: {
    responsableTipo: 'PERSONA',
    responsableNombre: 'Analista Demo',
    estadoLabel: 'En recepción',
  },
}]);
assert.equal(flat.length, 1);
assert.equal(flat[0].requerimiento_id, 77);
assert.equal(flat[0].estado_responsable_vigente?.responsableNombre, 'Analista Demo');

console.log('OK test-observacion05-02-acciones-recepcion');

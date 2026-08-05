/**
 * Observación 05 — Locadores → CCP sin cuadro comparativo ficticio.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  resolveDestinoDesdeRecepcionCotizaciones,
  DESTINOS_RECEPCION,
  labelAccionDerivacionRecepcion,
} from '../shared/workflow/destinoRecepcion.js';
import { normalizarTipo } from '../shared/workflow/tiposContratacion.js';
import {
  puedeEnviarValidarRecepcion,
  puedeDerivarACcpRecepcion,
} from '../src/utils/recepcionCotizacionUtils.js';
import { recepcionCotizacionesMenuItems, ccpMenuItems } from '../src/utils/bandejaActions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// 1-2. Bien / Servicio → Validaciones
assert.equal(resolveDestinoDesdeRecepcionCotizaciones('BIEN'), DESTINOS_RECEPCION.VALIDACIONES);
assert.equal(resolveDestinoDesdeRecepcionCotizaciones('SERVICIO'), DESTINOS_RECEPCION.VALIDACIONES);
assert.equal(labelAccionDerivacionRecepcion('bienes'), 'Derivar a Validaciones');

// 3. Locación → CCP
assert.equal(resolveDestinoDesdeRecepcionCotizaciones('locadores'), DESTINOS_RECEPCION.CCP);
assert.equal(normalizarTipo('LOCACION'), 'LOCACION');

const bien = { estado: 'COTIZACION_PRESENTADA', tipo: 'BIENES', validacion_estado: 'PENDIENTE' };
const serv = { estado: 'COTIZACION_PRESENTADA', tipo: 'SERVICIOS', validacion_estado: '' };
const loc = { estado: 'COTIZACION_PRESENTADA', tipo: 'locacion', validacion_estado: 'PENDIENTE' };
assert.equal(puedeEnviarValidarRecepcion(bien), true);
assert.equal(puedeEnviarValidarRecepcion(serv), true);
assert.equal(puedeEnviarValidarRecepcion(loc), false);
assert.equal(puedeDerivarACcpRecepcion(loc), true);

const menuLoc = recepcionCotizacionesMenuItems(loc);
assert.ok(menuLoc.some((i) => i.act === 'derivarCcp'));
assert.ok(!menuLoc.some((i) => /Validaciones/i.test(i.label)));

// 4-6. Stub eliminado: no INSERT/UPDATE cuadros_comparativos en derivación locación
const derSrc = read('server/lib/derivarRecepcionCcp.js');
assert.match(derSrc, /export async function derivarRecepcionACcp/);
assert.doesNotMatch(derSrc, /INSERT INTO cuadros_comparativos/);
assert.doesNotMatch(derSrc, /UPDATE cuadros_comparativos/);
assert.doesNotMatch(derSrc, /historial_revision/);
assert.doesNotMatch(derSrc, /TIPO_CUADRO_LOCADOR|tipo:\s*'LOCADORES'|tipo = 'LOCADORES'/);
assert.match(derSrc, /cuadro_id: null/);
assert.match(derSrc, /idempotente/);
assert.match(derSrc, /LOCACION_APROBADA_RECEPCION|etapaDestino: 'CCP'/);

// 7. Locación no entra a bandeja Cuadro (sigue exigiendo APTO + tipos BIENES/SERVICIOS)
const cuadroSrc = read('server/lib/cuadroComparativo.js');
assert.match(cuadroSrc, /assertTipoCuadroHabilitado/);
assert.match(cuadroSrc, /proveedores_aptos/);
assert.match(cuadroSrc, /TIPO_BIENES, TIPO_SERVICIOS/);

// 8-12. CCP dual source
const ccpSrc = read('server/lib/ccpCertificacion.js');
assert.match(ccpSrc, /export async function resolveFuenteDatosCcp/);
assert.match(ccpSrc, /ORIGEN_CCP/);
assert.match(ccpSrc, /RECEPCION_COTIZACION_LOCACION/);
assert.match(ccpSrc, /CUADRO_COMPARATIVO/);
assert.match(ccpSrc, /origen_ccp/);
assert.match(ccpSrc, /cuadro_id: origenCcp === ORIGEN_CCP\.RECEPCION_COTIZACION_LOCACION \? null/);
assert.match(ccpSrc, /montoDesdePropuestaEconomica/);
assert.match(ccpSrc, /UPPER\(COALESCE\(cc\.tipo, ''\)\) IN \('BIENES', 'SERVICIOS'\)/);
assert.match(ccpSrc, /estado_actual.*CCP|UPPER\(COALESCE\(r\.estado_actual/);

// 13. Registrar sin cuadro (assertReqEnCcp → resolveFuenteDatosCcp)
assert.match(ccpSrc, /async function assertReqEnCcp[\s\S]*resolveFuenteDatosCcp/);

// 15. Forzar Validaciones rechazado
const valSrc = read('server/lib/validacionesCotizacion.js');
assert.match(valSrc, /Locadores no se derivan a Validaciones|no se derivan a Validaciones/);

// 16. Bien/Servicio menú
const menuBien = recepcionCotizacionesMenuItems(bien);
assert.ok(menuBien.some((i) => /Validaciones/i.test(i.label)));

// FE CCP muestra origen locación
const viewSrc = read('src/views/contratacion/ccpView.js');
assert.match(viewSrc, /RECEPCION_COTIZACION_LOCACION/);
assert.match(viewSrc, /No aplica/);
assert.match(viewSrc, /Recepción de Cotización/);

const menuCcpLoc = ccpMenuItems({
  origen_ccp: 'RECEPCION_COTIZACION_LOCACION',
  tiene_codigo: false,
});
assert.ok(menuCcpLoc.some((i) => i.act === 'registrarCcp'));
assert.ok(!menuCcpLoc.some((i) => /cuadro/i.test(i.label)));

// 17-18. PDF / Anexo 11 / SERVICIO
const pdfSrc = read('src/utils/proveedorPdfCotizacion.js');
assert.match(pdfSrc, /buildAnexo11EntregablesRows/);
assert.match(pdfSrc, /um: e\.um \|\| e\.unidad_medida \|\| 'Servicio'/);

const portalRoute = read('server/routes/portal.js');
assert.match(portalRoute, /derivar-ccp/);
assert.match(portalRoute, /derivarRecepcionACcp/);

console.log('OK test-observacion05-locadores-ccp');

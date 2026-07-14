import { normalizeFilasPropuesta, buildFilasEconomicas, normalizeTipoRecepcion } from '../src/utils/recepcionPropuestaRows.js';
import { getCotizacionRecepcionDetalle } from '../server/lib/portalDocumentos.js';

const tests = [];
function assert(cond, msg) { tests.push({ ok: !!cond, msg }); }

const bienes = await getCotizacionRecepcionDetalle(26);
const filasB = normalizeFilasPropuesta(bienes);
assert(filasB[0]?.requerimiento_codigo === 'REQ-00052', 'Bienes REQ code');
assert(filasB[0]?.descripcion?.includes('AGAR'), 'Bienes descripción');
assert(!/^\d+-\d+$/.test(String(filasB[0]?.requerimiento_codigo || '')), 'Bienes sin item_key como REQ');
const ecoB = buildFilasEconomicas(bienes);
assert(ecoB[0]?.precio_unitario === 150, 'Bienes precio unitario');
assert(ecoB[0]?.precio_total === 1500, 'Bienes precio total');

const serv = await getCotizacionRecepcionDetalle(30);
assert(normalizeTipoRecepcion(serv.tipo) === 'Servicios', 'Tipo servicios');
const filasS = normalizeFilasPropuesta(serv);
assert(filasS[0]?.requerimiento_codigo === 'REQ-00016', 'Servicios REQ');
assert(filasS[0]?.cantidad === 1, 'Servicios cantidad 1');
assert(serv.propuesta_tecnica?.plazo_ejecucion, 'Plazo ejecución');
assert(serv.propuesta_tecnica?.forma_pago, 'Forma pago');
const ecoS = buildFilasEconomicas(serv);
assert(ecoS[0]?.precio_total === 10000, 'Servicios total fila');

const failed = tests.filter((t) => !t.ok);
tests.forEach((t) => console.log(t.ok ? 'OK' : 'FAIL', t.msg));
console.log(failed.length ? `\n${failed.length} fallos` : '\nTodos los tests pasaron');
process.exit(failed.length ? 1 : 0);

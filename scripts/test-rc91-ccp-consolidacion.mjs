/**
 * RC91 — CCP consolidación: filas presupuestales, monto adjudicado, correlativo, asunto.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildFilasPresupuestales,
  buildAsuntoCcp,
} from '../server/lib/ccpCertificacion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC91 / CCP consolidación ===\n');

const libSrc = fs.readFileSync(path.join(root, 'server/lib/ccpCertificacion.js'), 'utf8');
assert(libSrc.includes('CCP-SOL-'), 'correlativo CCP-SOL-####');
assert(libSrc.includes('CCP_YA_CONSOLIDADO'), 'bloquea duplicado en consolidación activa');
assert(libSrc.includes('uq_ccp_sol_req_activo') || libSrc.includes('activo = TRUE'), 'índice/activo único');
assert(libSrc.includes('valor_adjudicado'), 'monto desde valor adjudicado');
assert(libSrc.includes('sec_func'), 'meta desde sec_func pedido');
assert(libSrc.includes('fuente_fto'), 'fuente desde fuente_fto');
assert(libSrc.includes('especifica'), 'específica desde pedido');

const mig = fs.readFileSync(path.join(root, 'server/migrations/025_ccp_certificacion.js'), 'utf8');
assert(mig.includes('ccp_solicitudes'), 'tabla ccp_solicitudes');
assert(mig.includes('ccp_solicitud_requerimientos'), 'tabla ccp_solicitud_requerimientos');
assert(mig.includes('ccp_codigos'), 'tabla ccp_codigos');
assert(mig.includes('ccp_eventos'), 'tabla ccp_eventos');
assert(mig.includes('uq_ccp_sol_req_activo'), 'unique parcial requerimiento activo');

// Filas: varios pedidos → una fila por combinación; monto distribuido (no duplicado)
const filas = buildFilasPresupuestales({
  requerimiento: { id: 1, codigo: 'REQ-00001', denominacion: 'Materiales laboratorio' },
  codigoCcp: 'CCP-X-1',
  montoTotal: 320,
  pedidos: [
    {
      centro: 'CNSP', sec_func: '0030', fuente_fto: '00', especifica: '2.3.1.1',
      descripcion: 'Item A', total_item: 200,
    },
    {
      centro: 'CNSP', sec_func: '0031', fuente_fto: '00', especifica: '2.3.1.2',
      descripcion: 'Item B', total_item: 120,
    },
  ],
});
assert(filas.length === 2, 'dos filas presupuestales (meta/específica distintas)');
assert(filas[0].meta === '0030' && filas[1].meta === '0031', 'metas desde pedidos SIGAMEF');
assert(filas[0].fuente_fto === '00', 'fuente_fto desde pedido');
assert(filas[0].especifica === '2.3.1.1', 'específica desde pedido');
assert(filas[0].centro === 'CNSP', 'centro textual');
assert(filas.every((f) => f.requerimiento === 'REQ-00001'), 'requerimiento en cada fila');
const sum = Number(filas.reduce((a, f) => a + Number(f.monto), 0).toFixed(2));
assert(sum === 320, `suma montos = adjudicado 320 (got ${sum})`);
assert(filas[0].monto === 200 && filas[1].monto === 120, 'distribución proporcional a total_item');
assert(!filas.every((f) => f.monto === 320), 'no repite monto adjudicado completo en cada fila');

// Bienes / servicios: misma función (tipo no altera cálculo)
const filasServ = buildFilasPresupuestales({
  requerimiento: { codigo: 'REQ-S-1', denominacion: 'Servicio limpieza' },
  montoTotal: 100,
  pedidos: [{
    centro: 'CNSP', sec_func: '0010', fuente_fto: '19', especifica: '2.3.2.1',
    descripcion: 'Servicio', total_item: 100,
  }],
});
assert(filasServ[0].monto === 100, 'servicios: monto adjudicado');

// Asunto
assert(
  buildAsuntoCcp({ reqCodes: ['REQ-00001'] }).includes('REQ-00001'),
  'asunto un requerimiento lista REQ',
);
assert(
  buildAsuntoCcp({ reqCodes: ['REQ-1', 'REQ-2'] }).includes('REQ-1')
    && buildAsuntoCcp({ reqCodes: ['REQ-1', 'REQ-2'] }).includes('REQ-2'),
  'asunto múltiples lista requerimientos',
);
assert(
  buildAsuntoCcp({ codigosCcp: ['ABC-99'] }).includes('N.° ABC-99'),
  'asunto con CCP oficial',
);
assert(
  buildAsuntoCcp({ codigosCcp: ['A-1', 'B-2'] }).includes('A-1')
    && buildAsuntoCcp({ codigosCcp: ['A-1', 'B-2'] }).includes('B-2'),
  'asunto varios CCP detalla códigos',
);

// Eventos de trazabilidad presentes en lib
['CONSOLIDACION_CREADA', 'REQUERIMIENTO_AGREGADO', 'REQUERIMIENTO_RETIRADO', 'CCP_REGISTRADO', 'CCP_EDITADO', 'CCP_ANULADO']
  .forEach((ev) => assert(libSrc.includes(ev), `evento ${ev}`));

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC91: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLAS:', failed.map((f) => f.msg));
  process.exit(1);
}

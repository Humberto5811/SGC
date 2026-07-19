/**
 * Persistencia de «Se dedica al objeto» + PDF sin marca BORRADOR.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeFuentesCuadro } from '../server/lib/cuadroComparativoSchema.js';
import { buildCuadroComparativoReportData } from '../src/utils/cuadroComparativoReportData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== dedicado_objeto + PDF limpio ===\n');

const fresh = {
  items: [{
    item_key: 'i1',
    ofertas: [{ proveedor_id: 10, cotizacion_id: 5, precio_unitario: 1, precio_total: 1, razon_social: 'P' }],
  }],
  resumen_proveedores: [{ proveedor_id: 10, cotizacion_id: 5, razon_social: 'P', validacion_estado: 'APTO' }],
  primera_fuente: [{
    id: 'cot-5',
    proveedor_id: 10,
    cotizacion_id: 5,
    acciones_administrativas: { dedicado_objeto: null, au_participo_rtm: true },
  }],
};

const saved = {
  primera_fuente: [{
    id: 'cot-5',
    proveedor_id: 10,
    cotizacion_id: 5,
    acciones_administrativas: { dedicado_objeto: true },
  }],
};

const merged = mergeFuentesCuadro(fresh, saved);
const aa = merged.primera_fuente?.[0]?.acciones_administrativas;
assert(aa?.dedicado_objeto === true, 'mergeFuentes conserva dedicado_objeto=true');

const libSrc = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
assert(/overlayDedicadoObjeto/.test(libSrc), 'server tiene overlayDedicadoObjeto');
assert(/primera_fuente:\s*incoming\.primera_fuente/.test(libSrc), 'borrador/adjudicación envían primera_fuente');

const report = buildCuadroComparativoReportData({
  cuadro: { id: 1, estado: 'ADJUDICADO', version: 1 },
  borrador_no_oficial: true,
  meta: { pdf_modo: 'BORRADOR' },
  datos_json: {
    meta: { anexo_codigo: '8B', pdf_modo: 'BORRADOR' },
    solicitud: { codigo: 'SC-1', denominacion: 'Servicio', tipo: 'S' },
    items: [{
      item_key: 'i1',
      descripcion: 'X',
      cantidad: 1,
      proveedor_adjudicado_id: 10,
      valor_adjudicado_unitario: 100,
      valor_adjudicado_item: 100,
      ofertas: [{ proveedor_id: 10, precio_unitario: 100, precio_total: 100, cumple_tecnicamente: true }],
    }],
    primera_fuente: [{
      tipo: 'COTIZACION', nro: 1, proveedor_id: 10, razon_social: 'P', ruc: '20',
      cumple_tecnicamente: true,
      informacion_adicional: {},
      precios_por_item: { i1: { precio_unitario: 100, precio_total: 100 } },
      acciones_administrativas: { dedicado_objeto: true },
      datos_proveedor: { razon_social: 'P', ruc: '20' },
    }],
    adjudicacion: {
      proveedor_ganador_id: 10,
      valor_adjudicado: 100,
      criterio_seleccion: 'VALOR_POR_DINERO',
      sustento_decision: 'ok',
      resumen_proveedores: [{ proveedor_id: 10, razon_social: 'P', ruc: '20' }],
    },
  },
  entidad: { nombre: 'INS' },
});

assert(!/BORRADOR/.test(report.anexo.subtitulo), 'subtitulo PDF sin BORRADOR');
assert(!/NO OFICIAL/.test(report.anexo.subtitulo), 'subtitulo PDF sin NO OFICIAL');
assert(/Servicios/.test(report.anexo.subtitulo), 'subtitulo conserva Servicios');

const failed = tests.filter((t) => !t.ok);
console.log(`\nResultado: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('PASS\n');

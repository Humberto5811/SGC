/**
 * RC8.3.2-D — Cuadro Comparativo Servicios (Anexo 08-B).
 * Info adicional reducida a plazo + forma de pago; PDF 08-B.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ANEXO_8A,
  ANEXO_8B,
  INFO_ADICIONAL_ROWS_SERVICIOS,
  resolveAnexoCuadro,
  buildCuadroComparativoReportData,
} from '../src/utils/cuadroComparativoReportData.js';
import { isCuadroServicios } from '../src/utils/cuadroComparativoMatriz.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.3.2-D Anexo 08-B Servicios ===\n');

assert(ANEXO_8B.codigo === '8B' && /08-B/.test(ANEXO_8B.titulo), 'constante ANEXO_8B');
assert(ANEXO_8B.subtitulo.includes('Servicios'), 'subtitulo Servicios');
assert(INFO_ADICIONAL_ROWS_SERVICIOS.length === 2, 'info adicional 08-B = 2 campos');
assert(
  INFO_ADICIONAL_ROWS_SERVICIOS.every(([k]) => k === 'plazo_entrega' || k === 'forma_pago'),
  'solo plazo_entrega y forma_pago',
);

const persistidoServ = {
  cuadro: { id: 1, tipo: 'SERVICIOS', estado: 'ADJUDICADO', version: 1 },
  datos_json: {
    meta: { anexo_codigo: '8B', tipo_contratacion: 'Servicio' },
    solicitud: { codigo: 'SC-SERV-1', denominacion: 'Servicio prueba', tipo: 'S', tipo_contratacion: 'Servicio' },
    items: [{
      item_key: 'i1',
      descripcion: 'Servicio X',
      cantidad: 1,
      unidad_medida: 'SERVICIO',
      proveedor_adjudicado_id: 10,
      valor_adjudicado_unitario: 100,
      valor_adjudicado_item: 100,
      ofertas: [{
        proveedor_id: 10,
        razon_social: 'Prov Serv',
        ruc: '20111111111',
        precio_unitario: 100,
        precio_total: 100,
        plazo_entrega: '30 días',
        forma_pago: 'Contado',
        cumple_tecnicamente: true,
      }],
    }],
    primera_fuente: [{
      tipo: 'COTIZACION',
      nro: 1,
      proveedor_id: 10,
      razon_social: 'Prov Serv',
      ruc: '20111111111',
      cumple_tecnicamente: true,
      informacion_adicional: { plazo_entrega: '30 días', forma_pago: 'Contado' },
      precios_por_item: { i1: { precio_unitario: 100, precio_total: 100 } },
      acciones_administrativas: {},
      datos_proveedor: { razon_social: 'Prov Serv', ruc: '20111111111' },
    }],
    adjudicacion: {
      proveedor_ganador_id: 10,
      valor_adjudicado: 100,
      criterio_seleccion: 'MENOR_PRECIO',
      sustento_decision: 'Menor precio',
      resumen_proveedores: [{ proveedor_id: 10, razon_social: 'Prov Serv', ruc: '20111111111' }],
    },
  },
  entidad: { nombre: 'Entidad Test' },
};

assert(resolveAnexoCuadro(persistidoServ).codigo === '8B', 'resolveAnexoCuadro → 8B');
assert(resolveAnexoCuadro({ datos_json: { meta: { anexo_codigo: '8A' } } }).codigo === '8A', 'resolveAnexoCuadro → 8A');
assert(isCuadroServicios(persistidoServ.datos_json) === true, 'isCuadroServicios true');
assert(isCuadroServicios({ meta: { anexo_codigo: '8A' } }) === false, 'isCuadroServicios false bienes');

const report = buildCuadroComparativoReportData(persistidoServ);
assert(report.anexo.codigo === '8B', 'report anexo 8B');
assert(report.cabecera.tipo === 'Servicios', 'cabecera tipo Servicios');
assert(report.info_adicional.length === 2, 'report info_adicional 2 filas');
assert(report.info_adicional[0].key === 'plazo_entrega', 'primera fila plazo');
assert(report.info_adicional[1].key === 'forma_pago', 'segunda fila forma pago');
assert(!report.info_adicional.some((r) => r.key === 'marca'), 'sin marca en 08-B');

const viewSrc = fs.readFileSync(path.join(root, 'src/views/contratacion/cuadroComparativoView.js'), 'utf8');
assert(!/elabora solo Bienes/.test(viewSrc), 'UI ya no bloquea solo Bienes');
assert(/esServicio|08-B/.test(viewSrc), 'UI contempla servicios / 08-B');

const reportBien = buildCuadroComparativoReportData({
  ...persistidoServ,
  cuadro: { ...persistidoServ.cuadro, tipo: 'BIENES' },
  datos_json: {
    ...persistidoServ.datos_json,
    meta: { anexo_codigo: '8A', tipo_contratacion: 'Bien' },
    solicitud: { ...persistidoServ.datos_json.solicitud, tipo: 'B', tipo_contratacion: 'Bien' },
  },
});
assert(reportBien.anexo.codigo === ANEXO_8A.codigo, 'bienes sigue 8A');
assert(reportBien.info_adicional.length >= 7, 'bienes mantiene filas amplias');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC8.3.2-D: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.3.2-D: PASS\n');

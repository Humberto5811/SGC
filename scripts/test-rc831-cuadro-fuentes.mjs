/**
 * RC8.3.1 — Matriz Anexo 8A: primera/segunda fuente, columnas verticales, schema v2.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  migrateCuadroSchemaV1ToV2,
  buildPrimeraFuenteFromMatriz,
  normalizeSegundaFuente,
  calcPrecioActualizado,
  VERSION_SCHEMA_V2,
  TIPOS_SEGUNDA_FUENTE,
} from '../server/lib/cuadroComparativoSchema.js';
import { buildMatrizComparativaBienes } from '../server/lib/cuadroComparativoMapper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

const mtxSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoMatriz.js'), 'utf8');
const modalSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoModal.js'), 'utf8');
const mapSrc = readFileSync(path.join(__dirname, '../server/lib/cuadroComparativoMapper.js'), 'utf8');
const portalSrc = readFileSync(path.join(__dirname, '../server/lib/portalProveedores.js'), 'utf8');
const valSrc = readFileSync(path.join(__dirname, '../server/lib/validacionesCotizacion.js'), 'utf8');
const wfSrc = readFileSync(path.join(__dirname, '../core/workflowEngine/WorkflowTransitions.js'), 'utf8');

console.log('\n=== RC8.3.1 Cuadro fuentes Anexo 8A ===\n');

function makeCot(id, pu, opts = {}) {
  return {
    id,
    proveedor_id: id,
    ruc: `20${String(id).padStart(9, '0')}`,
    razon_social: `PROV ${id}`,
    validacion_estado: opts.apto === false ? 'NO_APTO' : 'APTO',
    telefono: `99900000${id}`,
    correo: `p${id}@test.pe`,
    persona_contacto: `Contacto ${id}`,
    fecha_presentacion: '2026-07-01',
    propuesta_economica: {
      precios: {
        'r1-0': { unitario: pu, total: pu * 10 },
        'r1-1': { unitario: pu + 1, total: (pu + 1) * 5 },
      },
      moneda: 'PEN',
    },
    propuesta_tecnica: {
      items: [
        { item_key: 'r1-0', marca: `M${id}`, modelo: `X${id}`, garantia: '12m', plazo_entrega: '30d' },
        { item_key: 'r1-1', marca: `M${id}`, modelo: `Y${id}` },
      ],
    },
  };
}

const detalle = [
  {
    item_key: 'r1-0', requerimiento_id: 1, requerimiento_codigo: 'REQ-1',
    codigo_sigamef: 'C-1', descripcion: 'Bien A', unidad_medida: 'UND', cantidad: 10, item_index: 0,
  },
  {
    item_key: 'r1-1', requerimiento_id: 1, requerimiento_codigo: 'REQ-1',
    codigo_sigamef: 'C-2', descripcion: 'Bien B', unidad_medida: 'UND', cantidad: 5, item_index: 1,
  },
];

// Factor
assert(calcPrecioActualizado(100, 1.1) === 110, '9. factor 100×1.1=110');
assert(calcPrecioActualizado(null, 1.1) == null, '9. factor sin precio → null');

// Build matriz + primera fuente
const matriz1 = buildMatrizComparativaBienes({
  solicitud: { id: 1, codigo: 'SC-1', denominacion: 'Test', tipo: 'BIENES' },
  detalleItems: detalle,
  cotizaciones: [makeCot(1, 10)],
  requerimientos: [{ id: 1, codigo: 'REQ-1' }],
});
assert(matriz1.version_schema === VERSION_SCHEMA_V2, 'schema v2 en build');
assert(Array.isArray(matriz1.primera_fuente) && matriz1.primera_fuente.length === 1, '1. una cotización');
assert(matriz1.primera_fuente[0].datos_proveedor.correo === 'p1@test.pe', '1. correo automático');
assert(matriz1.primera_fuente[0].precios_por_item['r1-0'].precio_unitario === 10, '1. PU alineado');

const sf1 = normalizeSegundaFuente({
  tipo_fuente: 'ORDEN_COMPRA_ANTERIOR',
  denominacion: 'OC-2024-01',
  entidad: 'Proveedor Histórico',
  ruc: '20111111111',
  anio: '2024',
  factor_ajuste: 1.05,
  precios_por_item: {
    'r1-0': { precio_unitario: 12, factor_ajuste: 1.05 },
    'r1-1': { precio_unitario: 8, factor_ajuste: 1.05 },
  },
}, 0);
assert(sf1.precios_por_item['r1-0'].precio_actualizado === 12.6, '9. precio actualizado OC');
assert(sf1.informacion_adicional.marca === 'NO APLICA', '7. info adicional NA segunda fuente');

// Caso 1: 1 cot + 1 SF
{
  const m = migrateCuadroSchemaV1ToV2({ ...matriz1, segunda_fuente: [sf1] });
  assert(m.primera_fuente.length === 1 && m.segunda_fuente.length === 1, '1. 1 cot + 1 segunda fuente');
  assert(m.primera_fuente[0].tipo === 'COTIZACION' && m.segunda_fuente[0].tipo === 'SEGUNDA_FUENTE', '13. no se mezclan tipos');
}

// Caso 2: 3 cot + 1 SF
{
  const m3 = buildMatrizComparativaBienes({
    solicitud: { id: 2, codigo: 'SC-2', tipo: 'BIENES' },
    detalleItems: detalle,
    cotizaciones: [makeCot(1, 10), makeCot(2, 11), makeCot(3, 12)],
  });
  const mig = migrateCuadroSchemaV1ToV2({ ...m3, segunda_fuente: [sf1] });
  assert(mig.primera_fuente.length === 3 && mig.segunda_fuente.length === 1, '2. tres cot + una SF');
}

// Caso 3: 2 cot + 2 SF
{
  const m2 = buildMatrizComparativaBienes({
    solicitud: { id: 3, codigo: 'SC-3', tipo: 'BIENES' },
    detalleItems: detalle,
    cotizaciones: [makeCot(1, 10), makeCot(2, 15)],
  });
  const sf2 = normalizeSegundaFuente({
    tipo_fuente: 'PAGINA_WEB', denominacion: 'Web X', url: 'https://x.test',
    precios_por_item: { 'r1-0': { precio_unitario: 9, factor_ajuste: 1 } },
  }, 1);
  const mig = migrateCuadroSchemaV1ToV2({ ...m2, segunda_fuente: [sf1, sf2] });
  assert(mig.primera_fuente.length === 2 && mig.segunda_fuente.length === 2, '3. dos cot + dos fuentes');
}

// Caso 4: 4 cot sin SF
{
  const m4 = buildMatrizComparativaBienes({
    solicitud: { id: 4, codigo: 'SC-4', tipo: 'BIENES' },
    detalleItems: detalle,
    cotizaciones: [1, 2, 3, 4].map((i) => makeCot(i, 10 + i)),
  });
  assert(m4.primera_fuente.length === 4 && (m4.segunda_fuente || []).length === 0, '4. cuatro cotizaciones');
}

// UI columnas verticales
assert(/Cotización N\.°|colspan/.test(mtxSrc), '5. proveedores en columnas (cabecera Cotización)');
assert(/P\. unit\.|P\. total/.test(mtxSrc), '6. PU/PT en subcabecera');
assert(/Información adicional de la fuente/.test(mtxSrc), '7. info adicional');
assert(/Acciones administrativas/.test(mtxSrc), '8. acciones administrativas');
assert(/cc-adj-fuente|VALOR ADJUDICADO/.test(mtxSrc), '10. fuente adjudicada en matriz');
assert(/Agregar segunda fuente/.test(mtxSrc), 'UI botón segunda fuente');

// Compatibilidad v1
{
  const v1 = {
    version_schema: 1,
    items: matriz1.items,
    resumen_proveedores: matriz1.resumen_proveedores,
  };
  const mig = migrateCuadroSchemaV1ToV2(v1);
  assert(mig.version_schema === 2 && mig.primera_fuente.length >= 1, '11. migrate v1→v2');
  assert(Array.isArray(mig.items) && mig.items[0].ofertas, '11. conserva items/ofertas legacy');
}

// Guardado conceptual: strip no borra segunda_fuente
assert(/segunda_fuente/.test(mapSrc), '12. mapper conoce segunda_fuente');
assert(/migrateCuadroSchemaV1ToV2|mergeFuentesCuadro/.test(mapSrc), '12. merge/migrate cableado');

// PDF bloqueado
assert(/PDF oficial bloqueado|Generación oficial bloqueada|puede_pdf_oficial:\s*false/.test(modalSrc + mapSrc),
  'PDF oficial bloqueado RC8.3.1');
assert(/Previsualizar \(borrador\)|BORRADOR/.test(modalSrc), 'preview borrador');

// Tipos
assert(TIPOS_SEGUNDA_FUENTE.length >= 6, 'tipos segunda fuente');

// No tocar módulos
assert(!/migrateCuadroSchemaV1ToV2/.test(portalSrc), '14. Portal intacto');
assert(!/segunda_fuente/.test(valSrc), '14. Validaciones intactas');
assert(/CUADRO_COMPARATIVO[\s\S]*CCP/.test(wfSrc), '14. Workflow intacto');
assert(!/UPDATE\s+cotizaciones_proveedor|propuesta_economica\s*=/.test(mapSrc),
  '14. mapper no altera cotizaciones originales en BD');
assert(!/derivarCuadroACcp/.test(mapSrc), '14. mapper no deriva CCP');

const failed = tests.filter((t) => !t.ok);
console.log(`\n=== Resultado RC8.3.1: ${tests.length - failed.length}/${tests.length} OK ===`);
if (failed.length) {
  failed.forEach((f) => console.error('FAIL:', f.msg));
  process.exit(1);
}
process.exit(0);

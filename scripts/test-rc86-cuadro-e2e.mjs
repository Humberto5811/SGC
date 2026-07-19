/**
 * RC8.6 — Auditoría final y estabilización Cuadro Comparativo.
 * Consolida arquitectura, ciclo de vida, datos y no-regresión de módulos vecinos.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TRANSICIONES_POR_ACCION } from '../core/workflowEngine/WorkflowTransitions.js';
import { ETAPAS } from '../core/workflowEngine/WorkflowState.js';
import { EVENTOS } from '../core/eventEngine/EventCatalog.js';
import {
  recomendarOfertaItem,
  aplicarRecomendacionesMatriz,
  validarAdjudicacionCuadro,
  aplicarAdjudicacionMatriz,
} from '../server/lib/cuadroComparativoAdjudicacion.js';
import {
  buildCuadroComparativoReportData,
  validateCuadroParaAnexo8A,
} from '../src/utils/cuadroComparativoReportData.js';
import {
  normalizeCuadroEstado,
  ESTADOS_CUADRO,
  cuadroComparativoMenuItems,
  buildCuadroStats,
  filterCuadroExpedientes,
} from '../src/utils/cuadroComparativoUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}
function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

const libSrc = read('server/lib/cuadroComparativo.js');
const modalSrc = read('src/utils/cuadroComparativoModal.js');
const appSrc = read('src/app.js');
const routerSrc = read('src/router.js');
const menuSrc = read('src/services/menuService.js');
const permSrc = read('src/utils/permissionsCatalog.js');
const portalSrc = read('server/lib/portalProveedores.js');
const valSrc = read('server/lib/validacionesCotizacion.js');
const wfSrc = read('core/workflowEngine/WorkflowTransitions.js');
const routeSrc = read('server/routes/portal.js');
const mig020 = read('server/migrations/020_cuadro_comparativo.js');
const mig021 = read('server/migrations/021_cuadro_adjudicacion.js');
const mig022 = read('server/migrations/022_cuadro_firma_ccp.js');

console.log('\n=== RC8.6 Auditoría final Cuadro Comparativo ===\n');

// —— Arquitectura ——
assert(/dec\/cuadro/.test(appSrc) && /dec\/cuadro/.test(routerSrc), 'A1. app.js + router.js cablean dec/cuadro');
assert(/CUADRO_COMPARATIVO/.test(menuSrc) && /dec\/cuadro/.test(menuSrc), 'A2. menú Cuadro Comparativo');
assert(/id: 'CUADRO_COMPARATIVO'[\s\S]*route: 'dec\/cuadro'/.test(permSrc), 'A3. permiso CUADRO_COMPARATIVO');
assert(/cuadro\/:cuadroId/.test(routeSrc) && /:solicitudId\/detalle/.test(routeSrc), 'A4. rutas solicitud vs cuadro');
assert(
  routeSrc.indexOf('/cuadro-comparativo/expedientes')
    < routeSrc.indexOf('/cuadro-comparativo/:solicitudId/detalle')
    && routeSrc.indexOf('/cuadro-comparativo/:solicitudId/detalle')
      < routeSrc.indexOf('/cuadro-comparativo/cuadro/:cuadroId'),
  'A5. orden de rutas sin shadowing',
);
assert(!/from '\.\/cuadroComparativo\.js'|from "\.\/cuadroComparativo\.js"/.test(
  read('server/lib/cotizacionWorkflowSync.js'),
), 'A6. sin dependencia circular sync→cuadro');

// —— Ciclo de vida / correcciones RC8.6 ——
assert(/GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO', 'DERIVADO_CCP', 'ANULADO'/.test(libSrc)
  && /no admite edición de borrador/.test(libSrc), 'L1. borrador bloqueado tras GENERADO/FIRMADO/CCP');
assert(/GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO'/.test(libSrc)
  && /no admite adjudicación/.test(libSrc), 'L2. adjudicación bloqueada tras GENERADO');
assert(/estadoCur === 'ADJUDICADO'/.test(libSrc) && /nextEstado/.test(libSrc),
  'L3. ADJUDICADO se conserva al guardar borrador');
assert(/adjuntarPdfFirmadoCuadro/.test(libSrc) && /derivarCuadroACcp/.test(libSrc), 'L4. firma + derivar');
assert(/idempotente:\s*true/.test(libSrc), 'L5. derivación idempotente');
assert(/estado = 'DERIVADO_CCP'/.test(libSrc), 'L6. estado final DERIVADO_CCP');

// —— Migraciones ——
assert(/cuadros_comparativos/.test(mig020) && /firmado_nombre/.test(mig020), 'M1. migración 020 base');
assert(/ADJUDICADO/.test(mig021) && /valor_adjudicado/.test(mig021), 'M2. migración 021 adjudicación');
assert(/firmado_por/.test(mig022) && /responsable_ccp/.test(mig022), 'M3. migración 022 firma/CCP');

// —— Workflow ——
assert(TRANSICIONES_POR_ACCION.APROBAR[ETAPAS.VALIDACION_USUARIO] === ETAPAS.CUADRO_COMPARATIVO,
  'W1. APTO/Validación → Cuadro Comparativo (catálogo)');
assert(TRANSICIONES_POR_ACCION.APROBAR[ETAPAS.CUADRO_COMPARATIVO] === ETAPAS.CCP,
  'W2. Cuadro → CCP (catálogo)');
assert(/syncRequerimientosSolicitudWorkflow/.test(libSrc), 'W3. sync Workflow en derivación');
assert(/CUADRO_COMPARATIVO[\s\S]*CCP/.test(wfSrc), 'W4. WorkflowTransitions intacto');
assert(EVENTOS.CUADRO_COMPARATIVO_FIRMADO && EVENTOS.CUADRO_COMPARATIVO_DERIVADO, 'W5. eventos firma/derivación');

// —— Frontend ciclo ——
assert(/Adjuntar Anexo 8A firmado/.test(modalSrc) && /Derivar a CCP/.test(modalSrc), 'F1. acciones firma/derivar');
assert(/Ver cuadro/.test(read('src/utils/cuadroComparativoUtils.js')), 'F2. menú Ver post-cierre');
assert(/puede_derivar_ccp/.test(modalSrc), 'F3. UI respeta puede_derivar_ccp');
assert(
  /Previsualizar Anexo/.test(modalSrc)
  && /Generar Anexo/.test(modalSrc)
  && /anexoLbl\.short|Anexo 8A|Anexo 8B/.test(modalSrc),
  'F4. PDF acciones',
);

// —— Bandeja ——
const stats = buildCuadroStats([
  { estado_cuadro: 'PENDIENTE_ELABORAR' },
  { estado_cuadro: 'EN_ELABORACION' },
  { estado_cuadro: 'GENERADO' },
  { estado_cuadro: 'FIRMADO' },
  { estado_cuadro: 'DERIVADO_CCP' },
]);
assert(stats.total === 5 && stats.pendientes === 1 && stats.elaboracion === 1 && stats.generados === 3,
  'B1. contadores bandeja');
const filtered = filterCuadroExpedientes([
  { solicitud_codigo: 'SC-100', denominacion: 'Papel', search_text: 'sc-100 papel', estado_cuadro: 'ADJUDICADO', tipo: 'Bien' },
  { solicitud_codigo: 'SC-200', denominacion: 'Toner', search_text: 'sc-200 toner', estado_cuadro: 'PENDIENTE_ELABORAR', tipo: 'Servicio' },
], { q: 'papel', tipo: 'bien' });
assert(filtered.length === 1 && filtered[0].solicitud_codigo === 'SC-100', 'B2. filtros SC');
const menuDer = cuadroComparativoMenuItems({ estado_cuadro: 'DERIVADO_CCP' });
assert(menuDer.some((m) => m.label === 'Ver cuadro'), 'B3. acción Ver tras derivar');

// —— Datos / escenarios ——
function makeItem(ofertas) {
  return {
    item_key: 'r1-0',
    requerimiento_codigo: 'REQ-1',
    cantidad: 10,
    unidad_medida: 'UND',
    descripcion: 'Ítem prueba',
    ofertas,
  };
}
function oferta(id, total, opts = {}) {
  return {
    proveedor_id: id,
    ruc: `20${String(id).padStart(9, '0')}`,
    razon_social: `PROV ${id}`,
    cumple_tecnicamente: opts.apto !== false,
    validacion_estado: opts.apto === false ? 'NO_APTO' : 'APTO',
    incompleto: !!opts.incompleto,
    precio_unitario: opts.incompleto ? null : total / 10,
    precio_total: opts.incompleto ? null : total,
    marca: opts.marca || 'M',
    modelo: 'X',
  };
}

// 1 proveedor
{
  const item = makeItem([oferta(1, 100)]);
  const rec = recomendarOfertaItem(item);
  assert(rec.recomendado_proveedor_id === 1 && !rec.empate, 'D1. un proveedor → recomendado');
}
// 2 / menos de 3
{
  const resumen = [
    { id: 1, proveedor_id: 1, cumple_tecnicamente: true, validacion_estado: 'APTO' },
    { id: 2, proveedor_id: 2, cumple_tecnicamente: true, validacion_estado: 'APTO' },
  ];
  const matriz = aplicarRecomendacionesMatriz({
    items: [makeItem([oferta(1, 100), oferta(2, 120)])],
    resumen_proveedores: resumen,
  });
  assert(matriz.advertencias?.menos_de_tres_presentadas === true, 'D2. flag menos de tres');
  const val = validarAdjudicacionCuadro(matriz, {
    selecciones: [{ item_key: 'r1-0', proveedor_adjudicado_id: 1 }],
    criterio_seleccion: 'MENOS_DE_TRES_COTIZACIONES',
    sustento_decision: 'Solo dos cotizaciones válidas',
  });
  assert(val.ok, `D2. menos de tres con sustento${val.ok ? '' : `: ${val.errors.join('; ')}`}`);
}
// 3 proveedores
{
  const item = makeItem([oferta(1, 100), oferta(2, 110), oferta(3, 105)]);
  assert(recomendarOfertaItem(item).recomendado_proveedor_id === 1, 'D3. tres proveedores → menor precio');
}
// 5 proveedores
{
  const ofs = [1, 2, 3, 4, 5].map((i) => oferta(i, 90 + i * 5));
  assert(recomendarOfertaItem(makeItem(ofs)).recomendado_proveedor_id === 1, 'D4. cinco proveedores');
}
// empate
{
  const rec = recomendarOfertaItem(makeItem([oferta(1, 100), oferta(2, 100)]));
  assert(rec.empate && rec.recomendado_proveedor_id == null, 'D5. empate sin auto-selección');
}
// NO_APTO con menor precio
{
  const item = makeItem([
    oferta(1, 50, { apto: false }),
    oferta(2, 100),
  ]);
  const rec = recomendarOfertaItem(item);
  assert(rec.recomendado_proveedor_id === 2, 'D6. NO_APTO no gana por precio');
  const resumen = [
    { id: 1, cumple_tecnicamente: false, validacion_estado: 'NO_APTO' },
    { id: 2, cumple_tecnicamente: true, validacion_estado: 'APTO' },
  ];
  const matriz = aplicarRecomendacionesMatriz({ items: [item], resumen_proveedores: resumen });
  const bad = validarAdjudicacionCuadro(matriz, {
    selecciones: [{ item_key: 'r1-0', proveedor_adjudicado_id: 1 }],
    criterio_seleccion: 'MENOR_PRECIO_VALIDO',
    sustento_decision: 'x',
  });
  assert(!bad.ok, 'D6b. no adjudicar NO_APTO');
}
// precio incompleto
{
  const item = makeItem([oferta(1, 100, { incompleto: true }), oferta(2, 120)]);
  const rec = recomendarOfertaItem(item);
  assert(rec.recomendado_proveedor_id === 2, 'D7. incompleto excluido de recomendación');
}
// distinto al recomendado
{
  const item = makeItem([oferta(1, 100), oferta(2, 150)]);
  const resumen = [
    { id: 1, cumple_tecnicamente: true, validacion_estado: 'APTO' },
    { id: 2, cumple_tecnicamente: true, validacion_estado: 'APTO' },
  ];
  const matriz = aplicarRecomendacionesMatriz({ items: [item], resumen_proveedores: resumen });
  const sinSustento = validarAdjudicacionCuadro(matriz, {
    selecciones: [{ item_key: 'r1-0', proveedor_adjudicado_id: 2 }],
    criterio_seleccion: 'VALOR_POR_DINERO',
    sustento_decision: '',
  });
  assert(!sinSustento.ok, 'D8. distinto al recomendado / valor por dinero exige sustento');
  const conSustento = validarAdjudicacionCuadro(matriz, {
    selecciones: [{ item_key: 'r1-0', proveedor_adjudicado_id: 2 }],
    criterio_seleccion: 'VALOR_POR_DINERO',
    sustento_decision: 'Mejor marca / garantía',
  });
  assert(conSustento.ok, `D8b. con sustento ok${conSustento.ok ? '' : `: ${conSustento.errors.join('; ')}`}`);
  let appliedOk = false;
  try {
    const applied = aplicarAdjudicacionMatriz(matriz, {
      selecciones: [{ item_key: 'r1-0', proveedor_adjudicado_id: 2 }],
      criterio_seleccion: 'VALOR_POR_DINERO',
      sustento_decision: 'Mejor marca / garantía',
    }, 'analista');
    appliedOk = applied.items[0].proveedor_adjudicado_id === 2;
  } catch (err) {
    appliedOk = false;
    console.log('D8c detail:', err.message);
  }
  assert(appliedOk, 'D8c. selección persistida en matriz');
}
// varios ítems + Anexo 8A
{
  const proveedores = [1, 2, 3].map((i) => ({
    proveedor_id: i, ruc: `20${i}`, razon_social: `P${i}`, validacion_estado: 'APTO', cumple_tecnicamente: true,
  }));
  const items = [0, 1].map((j) => ({
    item_key: `r1-${j}`,
    item_index: j + 1,
    requerimiento_codigo: 'REQ-1',
    pedido_sigamef: 'P-1',
    codigo_sigamef: 'C-1',
    descripcion: `Bien ${j}`,
    unidad_medida: 'UND',
    cantidad: 2,
    proveedor_adjudicado_id: 1,
    ofertas: proveedores.map((p) => ({
      ...p,
      precio_unitario: 10 + p.proveedor_id,
      precio_total: (10 + p.proveedor_id) * 2,
      incompleto: false,
      marca: 'M',
      modelo: 'X',
    })),
  }));
  const persistido = {
    cuadro: { estado: 'ADJUDICADO', version: 1 },
    datos_json: {
      solicitud: { codigo: 'SC-E2E' },
      items,
      resumen_proveedores: proveedores,
      adjudicacion: {
        valor_adjudicado: 44,
        criterio_seleccion: 'MENOR_PRECIO_VALIDO',
        sustento_decision: 'Menor precio',
      },
    },
    entidad: { nombre: 'ENTIDAD TEST' },
  };
  const val = validateCuadroParaAnexo8A(persistido);
  assert(val.ok, 'D9. Anexo 8A válido con varios ítems');
  const report = buildCuadroComparativoReportData(persistido);
  assert(
    Array.isArray(report.filas) && report.filas.length === 2
      && Array.isArray(report.proveedores) && report.proveedores.length === 3,
    'D9b. report data multi-ítem/prov',
  );
}

// —— No regresión módulos vecinos ——
assert(!/derivarCuadroACcp|adjuntarPdfFirmadoCuadro/.test(portalSrc), 'R1. Portal no toca firma/derivación cuadro');
assert(!/derivarCuadroACcp/.test(valSrc), 'R2. Validaciones sin lógica derivación cuadro');
assert(/DESTINOS_SALIDA_VALIDACION|CUADRO_COMPARATIVO/.test(valSrc), 'R3. puente APTO→Cuadro se mantiene');
assert(/dec\/ccp/.test(appSrc) || /ccpView/.test(appSrc), 'R4. CCP ruta UI intacta (módulo receptor)');
assert(existsSync(path.join(root, 'src/views/contratacion/ccpView.js')), 'R4b. vista CCP existe (no desarrollada aquí)');
assert(/dec\/cuadro/.test(appSrc), 'R5. Cuadro no rompe cableado app');

// —— Seguridad (estática) ——
assert(/ROUTE_TO_SUBMODULO|CUADRO_COMPARATIVO/.test(permSrc), 'S1. permiso ligado a ruta');
assert(/solo_lectura|puede_derivar_ccp|FIRMADO/.test(libSrc), 'S2. flags de acción restringida');
assert(/Solo se aceptan archivos PDF|10 MB|MAX_PDF_FIRMADO/.test(libSrc), 'S3. validación archivo firmado');

// —— Scripts RC8 presentes ——
[
  'scripts/test-rc81-cuadro-bandeja.mjs',
  'scripts/test-rc82-cuadro-matriz.mjs',
  'scripts/test-rc83-cuadro-adjudicacion.mjs',
  'scripts/test-rc84-anexo8a.mjs',
  'scripts/test-rc85-cuadro-ccp.mjs',
].forEach((rel) => assert(existsSync(path.join(root, rel)), `T. ${rel}`));

assert(normalizeCuadroEstado('DERIVADO_A_CCP') === ESTADOS_CUADRO.DERIVADO_CCP, 'X1. alias estado CCP');

const failed = tests.filter((t) => !t.ok);
console.log(`\n=== Resultado RC8.6: ${tests.length - failed.length}/${tests.length} OK ===`);
if (failed.length) {
  failed.forEach((f) => console.error('FAIL:', f.msg));
  process.exit(1);
}
console.log('\nEtiqueta estable: SÍ (con riesgos documentados en reporte).\n');
process.exit(0);

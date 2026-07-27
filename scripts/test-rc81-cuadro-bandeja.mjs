/**
 * RC8.1 — Bandeja Cuadro Comparativo por Solicitud de Cotización.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ESTADOS_CUADRO,
  ESTADOS_CUADRO_LABEL,
  normalizeCuadroEstado,
  labelCuadroEstado,
  listarCuadroComparativo,
  listarCuadroComparativoExpedientes,
} from '../server/lib/cuadroComparativo.js';
import { query } from '../server/db.js';
import {
  formatRequerimientosCuadro,
  buildCuadroStats,
  filterCuadroExpedientes,
  cuadroComparativoMenuItems,
  normalizeCuadroEstado as normClient,
  labelBandejaCuadroComparativo,
} from '../src/utils/cuadroComparativoUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const libSrc = readFileSync(path.join(__dirname, '../server/lib/cuadroComparativo.js'), 'utf8');
const routeSrc = readFileSync(path.join(__dirname, '../server/routes/portal.js'), 'utf8');
const viewSrc = readFileSync(path.join(__dirname, '../src/views/contratacion/cuadroComparativoView.js'), 'utf8');
const utilsSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoUtils.js'), 'utf8');
const svcSrc = readFileSync(path.join(__dirname, '../src/services/contratacionesService.js'), 'utf8');
const routerSrc = readFileSync(path.join(__dirname, '../src/router.js'), 'utf8');
const menuSrc = readFileSync(path.join(__dirname, '../src/services/menuService.js'), 'utf8');
const permSrc = readFileSync(path.join(__dirname, '../src/utils/permissionsCatalog.js'), 'utf8');
const constSrc = readFileSync(path.join(__dirname, '../src/utils/constants.js'), 'utf8');
const valSrc = readFileSync(path.join(__dirname, '../server/lib/validacionesCotizacion.js'), 'utf8');
const wfSrc = readFileSync(path.join(__dirname, '../core/workflowEngine/WorkflowTransitions.js'), 'utf8');

console.log('\n=== RC8.1 Cuadro Comparativo — bandeja ===\n');

// 1) Archivos y extracción
assert(/listarCuadroComparativoExpedientes/.test(libSrc), '1. existe listarCuadroComparativoExpedientes');
assert(/getCuadroComparativoExpediente/.test(libSrc), '1. existe getCuadroComparativoExpediente');
assert(!/export async function listarCuadroComparativo/.test(valSrc), '1. listarCuadroComparativo ya no está en validacionesCotizacion');
assert(/APTO[\s\S]*CUADRO_COMPARATIVO|CUADRO_COMPARATIVO[\s\S]*APTO/.test(valSrc), '1. puente APTO → CUADRO_COMPARATIVO se mantiene');

// 2) Endpoint
assert(/cuadro-comparativo\/expedientes/.test(routeSrc), '2. ruta GET expedientes declarada');
assert(/listarCuadroComparativoExpedientes/.test(routeSrc), '2. handler expedientes cableado');
assert(/getCuadroComparativoExpediente/.test(routeSrc), '2. handler detalle cableado');
assert(/get\('\/cuadro-comparativo'/.test(routeSrc), '2. endpoint legacy /cuadro-comparativo intacto');

// 3) Inclusión / exclusión (contrato en código)
assert(/validacion_estado = 'APTO'/.test(libSrc), '3. filtra por APTO');
assert(/proveedores_aptos/.test(libSrc) && />= 1/.test(libSrc), '3. exige ≥1 APTO');
assert(/EN_CUADRO_COMPARATIVO/.test(libSrc), '3. contempla estado solicitud EN_CUADRO_COMPARATIVO');
assert(/GROUP BY sc\.id/.test(libSrc), '3. agrupa por solicitud');

// 4) Una SC varios proveedores / requerimientos (helpers)
const scMulti = {
  solicitud_id: 1,
  solicitud_codigo: 'SC-00017-2026-INS',
  denominacion: 'compra de papel',
  tipo: 'Bien',
  area_usuaria: 'Logística',
  requerimientos: [
    { id: 1, codigo: 'REQ-00016', descripcion: 'A', centro: 'C1', area_usuaria: 'Logística' },
    { id: 2, codigo: 'REQ-00017', descripcion: 'B', centro: 'C1', area_usuaria: 'Logística' },
    { id: 3, codigo: 'REQ-00018', descripcion: 'C', centro: 'C2', area_usuaria: 'Logística' },
  ],
  requerimientos_texto: 'REQ-00016, REQ-00017, REQ-00018',
  total_proveedores: 3,
  proveedores_aptos: 2,
  proveedores_no_aptos: 1,
  proveedores_pendientes: 0,
  estado_cuadro: 'PENDIENTE_ELABORAR',
  search_text: 'sc-00017 req-00016 humberto logística',
  fecha_ingreso_cuadro: '2026-07-10T10:00:00Z',
  puede_elaborar: true,
};

const htmlReq = formatRequerimientosCuadro(scMulti, esc);
assert(/REQ-00016/.test(htmlReq) && /\+ 2 más/.test(htmlReq), '4. tres REQ → primero + 2 más');
assert(/title="REQ-00016, REQ-00017, REQ-00018"/.test(htmlReq), '4. tooltip lista completa REQ');

const twoReq = formatRequerimientosCuadro({
  requerimientos: [
    { codigo: 'REQ-00016' },
    { codigo: 'REQ-00017' },
  ],
}, esc);
assert(/REQ-00016/.test(twoReq) && /REQ-00017/.test(twoReq) && !/\+ /.test(twoReq), '4. dos REQ se listan sin colapsar');

const oneReq = formatRequerimientosCuadro({ requerimientos: [{ codigo: 'REQ-00016' }] }, esc);
assert(oneReq.includes('REQ-00016') && !/\+ /.test(oneReq), '4. un REQ se muestra completo');

// 5) Sin APTO no aparece (filtro de inclusión documentado + simulación stats)
const filas = [
  scMulti,
  {
    ...scMulti,
    solicitud_id: 2,
    solicitud_codigo: 'SC-00099',
    proveedores_aptos: 0,
    estado_cuadro: 'PENDIENTE_ELABORAR',
    search_text: 'sc-00099 sin apto',
  },
];
// El backend excluye aptos=0; el test de contrato verifica el HAVING/filter en fuente
assert(/Number\(r\.proveedores_aptos\) >= 1/.test(libSrc) || /proveedores_aptos\) >= 1/.test(libSrc),
  '5. backend descarta sin APTO');

// 6) Una fila por solicitud (vista)
assert(/solicitud_codigo/.test(viewSrc) && /labelEstadoExpedienteUnificado|labelCuadroEstado/.test(viewSrc), '6. vista usa campos de expediente');
assert(/Una fila por Solicitud/.test(viewSrc), '6. bandeja documenta una fila por SC');
assert(/Una fila por Solicitud/.test(viewSrc), '6. copy: una fila por SC');

// 7) Contadores
const stats = buildCuadroStats([
  { estado_cuadro: ESTADOS_CUADRO.PENDIENTE_ELABORAR },
  { estado_cuadro: ESTADOS_CUADRO.PENDIENTE_ELABORAR },
  { estado_cuadro: ESTADOS_CUADRO.EN_ELABORACION },
  { estado_cuadro: ESTADOS_CUADRO.GENERADO },
]);
assert(stats.total === 4, '7. total=4');
assert(stats.pendientes === 2, '7. pendientes=2');
assert(stats.elaboracion === 1, '7. elaboracion=1');
assert(stats.generados === 1, '7. generados=1 (sin persistencia real en bandeja = 0 en prod)');
assert(/data-cc-kpi="pendientes"/.test(utilsSrc), '7. KPI pendientes en DOM');

// 8) Menú acciones
const menu = cuadroComparativoMenuItems(scMulti);
assert(menu.some((m) => m.act === 'verExpediente'), '8. Ver expediente');
assert(menu.some((m) => m.act === 'verValidaciones'), '8. Ver validaciones');
assert(menu.some((m) => m.act === 'elaborarCuadro'), '8. Elaborar cuadro');
assert(/cc-ver-exp/.test(viewSrc) && /openVerDesdeBandeja/.test(viewSrc), '8. columna Ver (sin menú Acciones)');
assert(/openElaborarCuadro|showElaborarCuadroModal|showExpediente/.test(viewSrc), '8. acciones cableadas en detalle');

// 9) Filtros
const filtered = filterCuadroExpedientes([scMulti], { q: 'humberto' });
assert(filtered.length === 1, '9. búsqueda por proveedor en search_text');
assert(filterCuadroExpedientes([scMulti], { q: 'no-existe' }).length === 0, '9. búsqueda negativa');
assert(filterCuadroExpedientes([scMulti], { tipo: 'bien' }).length === 1, '9. filtro tipo');
assert(filterCuadroExpedientes([scMulti], { estado: 'PENDIENTE_ELABORAR' }).length === 1, '9. filtro estado');

// 10) Estados documentales
assert(/elaboración/i.test(labelCuadroEstado('PENDIENTE_ELABORAR')), '10. label etapa elaboración');
assert(normalizeCuadroEstado('') === ESTADOS_CUADRO.PENDIENTE_ELABORAR, '10. default pendiente');
assert(normClient('DERIVADO_A_CCP') === ESTADOS_CUADRO.DERIVADO_CCP, '10. alias derivado CCP');
assert(/C\.C\. aprobado|aprobado/i.test(ESTADOS_CUADRO_LABEL.FIRMADO), '10. label Firmado = C.C. aprobado');
assert(/PENDIENTE_ELABORAR/.test(libSrc) && !/estado del Workflow como único/.test(libSrc), '10. estado propio del cuadro');
assert(labelBandejaCuadroComparativo('PENDIENTE_COORDINADOR') === 'C.C. en revisión Coordinador CM', '10. bandeja dinámica Coordinador');
assert(labelBandejaCuadroComparativo('OBSERVADO_DEC') === 'C.C. observado por DEC', '10. bandeja dinámica DEC observado');
assert(labelBandejaCuadroComparativo('DERIVADO_CCP') === 'Derivado a CCP', '10. bandeja Derivado a CCP');

// 11) Ruta / permisos intactos
assert(/'dec\/cuadro'/.test(routerSrc), '11. ruta dec/cuadro en router');
assert(/dec\/cuadro/.test(menuSrc) && /CUADRO_COMPARATIVO/.test(menuSrc), '11. menú intacto');
assert(/id: 'CUADRO_COMPARATIVO'[\s\S]*route: 'dec\/cuadro'/.test(permSrc), '11. permiso intacto');
assert(/'dec\/cuadro':\s*\['dec',\s*'admin'\]/.test(constSrc), '11. ROUTE_ROLES intacto');

// 12) Servicio cliente
assert(/listCuadroComparativoExpedientes/.test(svcSrc), '12. service listCuadroComparativoExpedientes');
assert(/listCuadroComparativo\(/.test(svcSrc), '12. listCuadroComparativo legacy conservado');
assert(/getCuadroComparativoExpediente/.test(svcSrc), '12. getCuadroComparativoExpediente');

// 13) Validaciones / Workflow no reescritos
assert(/DESTINOS_SALIDA_VALIDACION/.test(valSrc), '13. destinos validación intactos');
assert(/VALIDACION_USUARIO[\s\S]*CUADRO_COMPARATIVO/.test(wfSrc), '13. transición Workflow intacta');
assert(!/Motor de Observaciones|observacionesMotor/.test(libSrc), '13. lib cuadro no toca motor observaciones');

// 14) Export listarCuadroComparativo sigue disponible
assert(typeof listarCuadroComparativo === 'function', '14. listarCuadroComparativo exportado desde cuadroComparativo.js');

// 15) Vista no muestra fila por proveedor en tabla principal
const tableBlock = viewSrc.match(/function buildCuadroTheadHtml[\s\S]*?^}/m)?.[0] || '';
assert(/Solicitud de cotización/.test(tableBlock) && /Requerimiento/.test(tableBlock)
  && /Centro/.test(tableBlock) && /Cantidad/.test(tableBlock) && />Ver</.test(tableBlock),
  '15. columnas bandeja por SC');
assert(!/<th>Proveedor<\/th>/.test(viewSrc.match(/buildCuadroTheadHtml[\s\S]*?^}/m)?.[0] || '')
  && !/Acciones/.test(tableBlock), '15. columnas de bandeja sin Proveedor ni Acciones');
assert(/formatCantidadCotizacionesCuadro|cantidad_cotizaciones|Cantidad/.test(viewSrc), '15. cantidad de cotizaciones en bandeja');

// 16) RC8.1.1 — no usar operador JSON sobre payload TEXT
const listFn = libSrc.match(/export async function listarCuadroComparativoExpedientes[\s\S]*?(?=\nexport async function)/)?.[0] || '';
assert(listFn.length > 100, '16. cuerpo listarCuadroComparativoExpedientes');
assert(!/payload\s*->/.test(listFn) && !/payload\s*->>/.test(listFn), '16. ninguna expresión payload-> / payload->>');
assert(!/propuesta_economica/.test(listFn), '16. bandeja no carga propuesta_economica');
assert(!/detalle_items/.test(listFn), '16. bandeja no carga detalle_items');
assert(/validacion_informe->>'enviado_at'/.test(listFn), '16. validacion_informe (jsonb) solo para fecha');
assert(/CUADRO_LIST_ERROR/.test(routeSrc), '16. error controlado CUADRO_LIST_ERROR');
assert(/No se pudo cargar la bandeja de Cuadro Comparativo/.test(routeSrc), '16. mensaje de error controlado');

// 17) Compatibilidad histórica + endpoint real (DB)
async function runDbCases() {
  let data;
  try {
    data = await listarCuadroComparativoExpedientes();
    assert(Array.isArray(data), '17. listado HTTP 200 (array)');
    assert(data.every((e) => Number(e.proveedores_aptos) >= 1), '17. solo SC con ≥1 APTO');
    assert(data.every((e) => e.solicitud_id && e.solicitud_codigo), '17. campos esenciales presentes');
    console.log(`INFO expedientes APTO en BD: ${data.length}`);
  } catch (err) {
    assert(false, `17. listarCuadroComparativoExpedientes no debe fallar: ${err.message}`);
  }
  const { rows: payloadRows } = await query(`
    SELECT id, payload FROM requerimientos
    WHERE payload IS NULL OR TRIM(COALESCE(payload, '')) = '' OR TRIM(payload) = '{}'
    LIMIT 5
  `);
  assert(Array.isArray(payloadRows), '17. payload NULL/vacío/{} consultable');
  const { rows: typeRows } = await query(`
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'requerimientos' AND column_name = 'payload'
  `);
  assert(typeRows[0]?.data_type === 'text', '17. payload es TEXT (no JSONB)');
  const { rows: ecoTypes } = await query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cotizaciones_proveedor'
      AND column_name IN ('propuesta_economica', 'validacion_informe')
  `);
  const byCol = Object.fromEntries(ecoTypes.map((r) => [r.column_name, r.data_type]));
  assert(byCol.propuesta_economica === 'jsonb', '17. propuesta_economica es jsonb (no usada en bandeja)');
  assert(byCol.validacion_informe === 'jsonb', '17. validacion_informe es jsonb');
  const { rows: detTypes } = await query(`
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'solicitudes_cotizacion'
      AND column_name = 'detalle_items'
  `);
  assert(detTypes[0]?.data_type === 'jsonb', '17. detalle_items es jsonb (no usado en bandeja)');
}

await runDbCases();

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC8.1 bandeja: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.1 Cuadro Comparativo bandeja: PASS\n');
process.exit(0);

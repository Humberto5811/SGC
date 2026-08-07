/**
 * RC8.8.3 — Compatibilidad exportaciones / claves técnicas
 * Labels visibles: Estado / Responsable
 * Keys BD/filtro: estado_actual / responsable_actual (inmutables)
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log(`  OK  ${msg}`); }
  else { failed += 1; console.error(`  FAIL ${msg}`); }
}

console.log('\n=== RC8.8.3 Compatibilidad exportaciones ===\n');

// ── 1. Módulo bandejaUi: headers institucionales + alias lectura ──
{
  const {
    EXPORT_HEADERS,
    EXPORT_HEADER_ALIASES,
    FILTER_QUERY_KEYS,
    resolveExportHeader,
    readExportCell,
    buildExportRowData,
    buildExportRowDataWithLegacyAliases,
  } = await import('../src/utils/bandejaUi.js');

  ok(EXPORT_HEADERS.ESTADO === 'Estado', 'EXPORT_HEADERS.ESTADO = Estado');
  ok(EXPORT_HEADERS.RESPONSABLE === 'Responsable', 'EXPORT_HEADERS.RESPONSABLE = Responsable');
  ok(FILTER_QUERY_KEYS.estado === 'estado_actual', 'filtro key estado_actual preservada');
  ok(FILTER_QUERY_KEYS.responsable === 'responsable_actual', 'filtro key responsable_actual preservada');

  ok(resolveExportHeader('Estado Actual') === 'Estado', 'alias Estado Actual → Estado');
  ok(resolveExportHeader('Responsable vigente') === 'Responsable', 'alias Responsable vigente → Responsable');
  ok(resolveExportHeader('Estado') === 'Estado', 'header institucional intacto');

  const sample = {
    id: 1,
    codigo: 'REQ-TEST',
    tipo: 'bienes',
    area: 'Facultad',
    monto_total: 100,
    estado: 'EN_PROCESO',
    estado_actual: 'REGISTRO_ORDEN',
    estadoActualTexto: 'Registro de órdenes',
    responsableActual: 'jcrisostomo',
    dias_en_estado: 2,
    estado_responsable_vigente: {
      estadoLabel: 'Registro de órdenes',
      responsableUsername: 'jcrisostomo',
    },
  };
  const row = buildExportRowData(sample);
  ok(Object.prototype.hasOwnProperty.call(row, 'Estado'), 'export tiene columna Estado');
  ok(Object.prototype.hasOwnProperty.call(row, 'Responsable'), 'export tiene columna Responsable');
  ok(!Object.prototype.hasOwnProperty.call(row, 'Estado Actual'), 'export UI sin columna Estado Actual');
  ok(!Object.prototype.hasOwnProperty.call(row, 'Responsable Actual'), 'export UI sin columna Responsable Actual');
  ok(row.Estado === 'Registro de órdenes', 'Estado prioriza ERV label');
  ok(row.Responsable === 'jcrisostomo', 'Responsable valor correcto');
  ok(row.Estado !== undefined && row.Responsable !== undefined, 'sin undefined en Estado/Responsable');
  ok(String(row.Estado).length > 0 && String(row.Responsable).length > 0, 'Estado/Responsable no vacíos');

  const sinErv = buildExportRowData({
    id: 2,
    codigo: 'REQ-2',
    estado_actual: 'EVALUACION',
    responsable_actual: 'au',
  });
  ok(typeof sinErv.Estado === 'string' && sinErv.Estado !== 'undefined', 'sin ERV Estado es string');
  ok(sinErv.Responsable === 'au', 'sin ERV usa responsable_actual');

  const withAlias = buildExportRowDataWithLegacyAliases(sample);
  ok(withAlias['Estado Actual'] === withAlias.Estado, 'alias programático Estado Actual');
  ok(withAlias['Responsable Actual'] === withAlias.Responsable, 'alias programático Responsable Actual');

  ok(readExportCell({ 'Estado Actual': 'X' }, 'Estado') === 'X', 'readExportCell lee legacy');
  ok(readExportCell({ Estado: 'Y' }, 'Estado') === 'Y', 'readExportCell lee institucional');
  ok(Object.keys(EXPORT_HEADER_ALIASES).length >= 4, 'mapa de alias presente');
}

// ── 2. Filtros bandeja: labels UI vs keys técnicas ──
{
  const ui = read('src/utils/bandejaUi.js');
  ok(/form-label small mb-0">Estado</.test(ui), 'filtro label visible Estado');
  ok(/form-label small mb-0">Responsable</.test(ui), 'filtro label visible Responsable');
  ok(/estado_actual:\s*document\.getElementById/.test(ui), 'readFilterParams usa estado_actual');
  ok(/responsable_actual:\s*document\.getElementById/.test(ui), 'readFilterParams usa responsable_actual');
  ok(/case 'estado':/.test(ui) && /case 'responsable':/.test(ui), 'sortBandejaRows casos estado/responsable');
}

// ── 3. Excel paquetes / pedidos: headers institucionales ──
{
  const paq = read('src/utils/paquetesConsolidacion.js');
  const ped = read('src/utils/pedidosConsolidacion.js');
  ok(/'Estado', 'Responsable'/.test(paq), 'paquetes Excel headers Estado/Responsable');
  ok(!/'Estado Actual'/.test(paq) && !/'Responsable Actual'/.test(paq), 'paquetes sin headers legacy');
  ok(/estado_actual_texto \?\? ''/.test(paq) || /f\.estado_actual_texto \?\? ''/.test(paq),
    'paquetes evita undefined en Estado');
  ok(/EXPORT_COLUMNS/.test(ped) && /'Estado', 'Responsable'/.test(ped), 'pedidos Excel headers');
  ok(!/'Estado Actual'/.test(ped), 'pedidos sin header Estado Actual');
}

// ── 4. Mensaje cuadro: sin "Estado vigente" visible ──
{
  const cc = read('server/lib/cuadroComparativo.js');
  ok(!/Estado vigente: Derivado a CCP/.test(cc), 'cuadro sin label Estado vigente');
  ok(/Estado: Derivado a CCP/.test(cc), 'cuadro usa Estado:');
}

// ── 5. Inventario keys técnicas (deben existir — no renombrar) ──
{
  const ui = read('src/utils/bandejaUi.js');
  const traz = read('src/utils/trazabilidad.js');
  ok(/estado_actual/.test(ui) && /responsable_actual/.test(ui), 'keys técnicas en bandejaUi');
  ok(/estado_actual/.test(traz) && /responsable_actual/.test(traz), 'keys técnicas en trazabilidad');
}

console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===\n`);
if (failed > 0) process.exit(1);
assert.ok(passed > 0);
console.log('RC8.8.3 PASS');

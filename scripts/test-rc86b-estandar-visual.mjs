/**
 * RC8.6B — Estándar visual institucional Estado / Responsable.
 *
 *   node scripts/test-rc86b-estandar-visual.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { execSync } from 'node:child_process';

import {
  getEstadoCatalogEntry,
  assertUniqueLabels,
  CATEGORIAS_VISUALES,
  getCategoriaCssClass,
} from '../src/ui/workflow/estadoCatalogo.js';
import { adaptEstadoResponsable, TIPO_RESPONSABLE_UI } from '../src/ui/workflow/adaptEstadoResponsable.js';
import { renderEstadoBadgeHtml } from '../src/ui/workflow/EstadoBadge.js';
import { renderResponsableBadgeHtml } from '../src/ui/workflow/ResponsableBadge.js';
import { renderEstadoResponsableCellHtml } from '../src/ui/workflow/EstadoResponsableCell.js';
import {
  normalizeSubmoduloLabel,
  resolveTesoreriaCode,
  isTesoreriaAlias,
  getSubmoduloByLabel,
  SUBMODULO_CODE_TESORERIA,
  SUBMODULO_LABEL_PAGOS,
} from '../src/utils/observacionDestino.js';
import { filterRowsClient } from '../src/utils/trazabilidad.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function ok(c, m) { assert.ok(c, m); }
function eq(a, b, m) { assert.strictEqual(a, b, m); }
function read(rel) { return readFileSync(join(root, rel), 'utf8'); }
function exists(rel) { return existsSync(join(root, rel)); }

const MIGRATED_VIEWS = [
  'src/utils/bandejaUi.js',
  'src/utils/estadoVisualPresenter.js',
  'src/utils/estadoExpedientePresenter.js',
  'src/utils/validacionesUtils.js',
  'src/utils/cuadroComparativoUtils.js',
  'src/utils/recepcionCotizacionUtils.js',
  'src/views/contratacion/ccpView.js',
  'src/views/contratacion/registroOrdenesView.js',
  'src/views/ejecucion/recepcionBienesView.js',
  'src/views/requerimiento/reqShared.js',
];

const BANDEJA_FUNCS = [
  'src/views/requerimiento', // registro/evaluación via bandejaUi
  'src/views/contratacion/ccpView.js',
  'src/views/contratacion/registroOrdenesView.js',
  'src/views/contratacion/recepcionCotizacionesView.js',
  'src/views/contratacion/validacionesView.js',
  'src/views/contratacion/cuadroComparativoView.js',
  'src/views/ejecucion/recepcionBienesView.js',
  'src/utils/bandejaUi.js',
];

console.log('\n🔬 RC8.6B — Estándar visual Estado/Responsable\n');

// 1–2 Unique label + category
test('1. Un estadoCodigo tiene una sola etiqueta', () => {
  const r = assertUniqueLabels();
  ok(r.ok, r.ok ? '' : `duplicado ${r.codigo}: ${r.a} vs ${r.b}`);
  const a = getEstadoCatalogEntry('OBSERVADO');
  const b = getEstadoCatalogEntry('OBSERVADO', 'Otro');
  eq(a.label, b.label);
});

test('2. Un estadoCodigo tiene una sola categoría', () => {
  const a = getEstadoCatalogEntry('REQUERIMIENTO_APROBADO');
  const b = getEstadoCatalogEntry('REQUERIMIENTO_APROBADO', 'x');
  eq(a.categoria, b.categoria);
  eq(a.categoria, 'APROBADO');
});

test('3. No existen colores inline de estado en vistas migradas', () => {
  const bad = /badge-estado-mod[^>]*style\s*=\s*["'][^"']*background/i;
  for (const rel of MIGRATED_VIEWS) {
    if (!exists(rel)) continue;
    const src = read(rel);
    ok(!bad.test(src), `${rel} aún tiene style background en badge-estado`);
    ok(!/renderBadgeEstadoVigenteHtml[^;]*style\s*=/.test(src), `${rel} style en badge vigente`);
  }
});

test('4. No existen badges locales de workflow en vistas migradas (import shared badge)', () => {
  for (const rel of [
    'src/views/contratacion/ccpView.js',
    'src/views/contratacion/registroOrdenesView.js',
    'src/views/ejecucion/recepcionBienesView.js',
    'src/views/requerimiento/reqShared.js',
    'src/utils/validacionesUtils.js',
    'src/utils/cuadroComparativoUtils.js',
    'src/utils/recepcionCotizacionUtils.js',
  ]) {
    const src = read(rel);
    const importLines = src.split('\n').filter((l) => /import\s*\{[^}]*renderBadgeEstadoVigenteHtml/.test(l)
      || (l.includes('renderBadgeEstadoVigenteHtml') && l.includes('from')));
    for (const line of importLines) {
      ok(
        /ui\/workflow/.test(line),
        `${rel}: renderBadgeEstadoVigenteHtml debe venir de ui/workflow → ${line.trim()}`,
      );
    }
    ok(src.includes('ui/workflow'), `${rel}: sin ui/workflow`);
  }
});

test('5. Bandejas funcionales usan componentes centrales', () => {
  const bandejaUi = read('src/utils/bandejaUi.js');
  ok(bandejaUi.includes('renderEstadoVisualHtml') || bandejaUi.includes('EstadoBadge'), 'bandejaUi estado');
  ok(bandejaUi.includes('renderResponsableBadgeFromRow') || bandejaUi.includes('ResponsableBadge'), 'bandejaUi resp');
  ok(read('src/views/contratacion/recepcionCotizacionesView.js').includes('renderResponsableCellHtml'));
  ok(read('src/views/contratacion/validacionesView.js').includes('renderResponsableCellHtml'));
  ok(read('src/views/contratacion/cuadroComparativoView.js').includes('renderResponsableCellHtml'));
  ok(read('src/views/contratacion/ccpView.js').includes('ui/workflow'));
  ok(read('src/views/contratacion/registroOrdenesView.js').includes('ui/workflow'));
  ok(read('src/views/ejecucion/recepcionBienesView.js').includes('ui/workflow'));
});

test('6. Fallbacks viven solo en adaptEstadoResponsable.js', () => {
  const adapter = read('src/ui/workflow/adaptEstadoResponsable.js');
  ok(adapter.includes('fallbackLegacy') || adapter.includes('legacy_fallback'));
  for (const rel of MIGRATED_VIEWS) {
    if (!exists(rel) || rel.includes('adaptEstadoResponsable')) continue;
    const src = read(rel);
    ok(!/created_by\s*\|\|.*responsable/i.test(src), `${rel}: fallback created_by`);
    ok(!/usuario_modificacion\s*\|\|.*responsable/i.test(src), `${rel}: fallback usuario_modificacion`);
  }
});

test('7. created_by no se usa como responsable vigente', () => {
  const a = adaptEstadoResponsable({
    created_by: 'admin',
    estado_responsable_vigente: {
      estadoCodigo: 'EN_PROGRAMACION',
      estadoLabel: 'En programación',
      responsableTipo: 'PENDIENTE',
    },
  });
  eq(a.responsableTipo, TIPO_RESPONSABLE_UI.PENDIENTE);
  ok(!String(a.responsableDisplay).includes('admin'));
});

test('8. usuario_modificacion no se usa como responsable vigente', () => {
  const a = adaptEstadoResponsable({
    usuario_modificacion: 'editor',
    estado: 'DEC',
  });
  ok(a.responsableDisplay !== 'editor');
  ok(!String(a.responsableNombre).includes('editor'));
});

test('9. centro no se presenta como persona', () => {
  const a = adaptEstadoResponsable({
    responsable: 'CNCC Lima',
    centro: 'CNCC Lima',
    estado_responsable_vigente: {
      estadoCodigo: 'REQUERIMIENTO_REGISTRADO',
      responsableTipo: 'PERSONA',
      responsableNombre: 'CNCC Lima',
    },
  });
  eq(a.responsableTipo, TIPO_RESPONSABLE_UI.PENDIENTE);
});

test('10. submódulo no se presenta como persona', () => {
  const a = adaptEstadoResponsable({
    sub_modulo_actual: 'Programación',
    estado_responsable_vigente: {
      estadoCodigo: 'EN_PROGRAMACION',
      responsableTipo: 'PENDIENTE',
      etapaLabel: 'Programación',
    },
  });
  eq(a.responsableTipo, TIPO_RESPONSABLE_UI.PENDIENTE);
  eq(a.responsableDisplay, 'Pendiente de asignación');
  ok(a.etapaLabel === 'Programación' || a.etapaCodigo);
});

test('11. PENDIENTE muestra “Pendiente de asignación”', () => {
  const html = renderResponsableBadgeHtml({ responsableTipo: 'PENDIENTE' });
  ok(html.includes('Pendiente de asignación'));
});

test('12. PERSONA prioriza nombre completo', () => {
  const a = adaptEstadoResponsable({
    estado_responsable_vigente: {
      estadoCodigo: 'INVITACION_ENVIADA',
      responsableTipo: 'PERSONA',
      responsableNombre: 'Javier Crisóstomo',
      responsableUsername: 'jcrisostomo',
    },
  });
  eq(a.responsableDisplay, 'Javier Crisóstomo');
  ok(renderResponsableBadgeHtml(a).includes('Javier Crisóstomo'));
});

test('13. UNIDAD muestra unidad', () => {
  const a = adaptEstadoResponsable({
    estado_responsable_vigente: {
      estadoCodigo: 'EXPEDIENTE_DERIVADO_PAGO',
      responsableTipo: 'UNIDAD',
      responsableUnidad: 'Pagos',
    },
  });
  eq(a.responsableDisplay, 'Pagos');
});

test('14. Recepción Cotizaciones usa el mismo estándar que Registro', () => {
  const recep = read('src/utils/recepcionCotizacionUtils.js');
  const bandeja = read('src/utils/bandejaUi.js');
  ok(recep.includes('ui/workflow'));
  ok(bandeja.includes('ui/workflow') || bandeja.includes('estadoVisualPresenter'));
  ok(read('src/views/contratacion/recepcionCotizacionesView.js').includes('renderResponsableCellHtml'));
});

test('15. Validaciones usa el mismo estándar que CCP', () => {
  ok(read('src/utils/validacionesUtils.js').includes('ui/workflow'));
  ok(read('src/views/contratacion/ccpView.js').includes('ui/workflow'));
});

test('16. Cuadro Comparativo usa el mismo catálogo', () => {
  ok(read('src/utils/cuadroComparativoUtils.js').includes('ui/workflow'));
  const html = renderEstadoBadgeHtml(adaptEstadoResponsable({
    estado_responsable_vigente: { estadoCodigo: 'CUADRO_EN_DEC', estadoLabel: 'C.C. en DEC' },
  }));
  ok(html.includes('sgc-estado-badge'));
});

test('17. Registro de Órdenes usa el mismo catálogo', () => {
  ok(read('src/views/contratacion/registroOrdenesView.js').includes('ui/workflow'));
});

test('18. Recepción de Bienes usa el mismo catálogo', () => {
  const src = read('src/views/ejecucion/recepcionBienesView.js');
  ok(src.includes('ui/workflow'));
  ok(src.includes('renderResponsableCellHtml'));
});

test('19. Conformidad Servicios: stub declarado', () => {
  const src = read('src/views/ejecucion/presentacionEntregableView.js');
  ok(/NO IMPLEMENTADO/i.test(src));
});

test('20. Ampliaciones/Resolución: stub declarado', () => {
  const src = read('src/views/ejecucion/ampliacionResolucionView.js');
  ok(/NO IMPLEMENTADO/i.test(src));
});

test('21. Menú visible muestra “Pagos”', () => {
  const menu = read('src/services/menuService.js');
  ok(menu.includes("label: 'Pagos'"));
  ok(menu.includes("submoduloId: 'TESORERIA'"));
});

test('22. Código interno TESORERIA continúa funcionando', () => {
  const menu = read('src/services/menuService.js');
  ok(menu.includes("'TESORERIA'"));
  ok(read('src/utils/permissionsCatalog.js').includes("id: 'TESORERIA'"));
  ok(read('src/views/ejecucion/derivacionPagoView.js').includes('TESORERIA'));
});

test('23. Permisos TESORERIA no se modifican (id/route)', () => {
  const p = read('src/utils/permissionsCatalog.js');
  ok(p.includes("id: 'TESORERIA'"));
  ok(p.includes("route: 'ejecucion/pago'"));
  const sp = read('server/lib/permissionsCatalog.js');
  ok(sp.includes("id: 'TESORERIA'"));
  ok(sp.includes("route: 'ejecucion/pago'"));
});

test('24. OBSERVADO tiene el mismo estilo en todos los módulos', () => {
  const e = getEstadoCatalogEntry('OBSERVADO');
  eq(e.categoria, 'OBSERVADO');
  eq(getCategoriaCssClass(e.categoria), 'observed');
  const h1 = renderEstadoBadgeHtml({ estadoCodigo: 'OBSERVADO', estadoLabel: e.label });
  const h2 = renderEstadoBadgeHtml({ estadoCodigo: 'RECEPCION_BIENES_OBSERVADA' });
  ok(h1.includes('sgc-estado-badge--observed'));
  ok(h2.includes('sgc-estado-badge--observed'));
});

test('25. APROBADO tiene el mismo estilo en todos los módulos', () => {
  const codes = ['REQUERIMIENTO_APROBADO', 'REQUERIMIENTO_APROBADO_DEC', 'PROGRAMACION_APROBADA', 'CUADRO_COMPARATIVO_APROBADO'];
  for (const c of codes) {
    eq(getEstadoCatalogEntry(c).categoria, 'APROBADO');
    ok(renderEstadoBadgeHtml({ estadoCodigo: c }).includes('sgc-estado-badge--approved'));
  }
});

test('26. Estado desconocido tiene fallback seguro', () => {
  const e = getEstadoCatalogEntry('XYZ_NO_EXISTE');
  eq(e.categoria, 'DESCONOCIDO');
  ok(e.label);
  ok(!/undefined/i.test(e.label));
});

test('27. No aparece “undefined” en renders', () => {
  const cell = renderEstadoResponsableCellHtml({}, 'detailed');
  ok(!/undefined/i.test(cell));
  const badge = renderEstadoBadgeHtml({});
  ok(!/undefined/i.test(badge));
});

test('28. No aparece “Invalid Date”', () => {
  const cell = renderEstadoResponsableCellHtml({
    estado_responsable_vigente: {
      estadoCodigo: 'DEC',
      actualizadoAt: 'not-a-date',
    },
  }, 'detailed');
  ok(!/Invalid Date/i.test(cell));
});

test('29. Artefactos core RC8.6B existen', () => {
  for (const rel of [
    'src/ui/workflow/adaptEstadoResponsable.js',
    'src/ui/workflow/estadoCatalogo.js',
    'src/ui/workflow/EstadoBadge.js',
    'src/ui/workflow/ResponsableBadge.js',
    'src/ui/workflow/EstadoResponsableCell.js',
    'src/styles/workflow-status.css',
    'docs/RC8.6B-estandar-visual-estado-responsable.md',
  ]) {
    ok(exists(rel), `falta ${rel}`);
  }
  ok(CATEGORIAS_VISUALES.includes('DESCONOCIDO'));
  ok(read('src/styles.css').includes('workflow-status.css'));
});

test('30. git diff --check limpio (si hay cambios)', () => {
  try {
    execSync('git diff --check', { cwd: root, stdio: 'pipe' });
  } catch (e) {
    assert.fail(`git diff --check falló: ${e.stderr?.toString?.() || e.message}`);
  }
});

test('Pagos stub documentado', () => {
  ok(/NO IMPLEMENTADO/i.test(read('src/views/ejecucion/derivacionPagoView.js')));
  ok(/Pagos/.test(read('src/views/ejecucion/derivacionPagoView.js')));
});

// ── RC8.6B.1 — compatibilidad etiquetas Tesorería / Pagos ──
console.log('\n🔬 RC8.6B.1 — Compatibilidad Tesorería / Pagos\n');

const TESORERIA_ALIASES_CASES = [
  'Tesorería',
  'TESORERIA',
  'Derivación de Pago',
  'Pago',
  'Pagos',
];

test('B1. Alias legacy resuelven a código TESORERIA', () => {
  for (const alias of TESORERIA_ALIASES_CASES) {
    eq(resolveTesoreriaCode(alias), 'TESORERIA', `resolveTesoreriaCode(${alias})`);
    eq(getSubmoduloByLabel(alias)?.code, 'TESORERIA', `getSubmoduloByLabel(${alias})`);
    ok(isTesoreriaAlias(alias), `isTesoreriaAlias(${alias})`);
  }
});

test('B2. Etiqueta visible final siempre es Pagos', () => {
  for (const alias of TESORERIA_ALIASES_CASES) {
    eq(normalizeSubmoduloLabel(alias), 'Pagos', `normalizeSubmoduloLabel(${alias})`);
  }
  eq(SUBMODULO_LABEL_PAGOS, 'Pagos');
  eq(SUBMODULO_CODE_TESORERIA, 'TESORERIA');
});

test('B3. Permisos TESORERIA permanecen intactos', () => {
  const p = read('src/utils/permissionsCatalog.js');
  ok(p.includes("id: 'TESORERIA'"));
  ok(p.includes("label: 'Pagos'"));
  ok(p.includes("route: 'ejecucion/pago'"));
  const sp = read('server/lib/permissionsCatalog.js');
  ok(sp.includes("id: 'TESORERIA'"));
  ok(sp.includes("label: 'Pagos'"));
  ok(sp.includes("route: 'ejecucion/pago'"));
});

test('B4. Ruta ejecucion/pago permanece intacta', () => {
  ok(read('src/services/menuService.js').includes("path: 'ejecucion/pago'"));
  ok(read('src/utils/permissionsCatalog.js').includes("route: 'ejecucion/pago'"));
  ok(read('server/lib/permissionsCatalog.js').includes("route: 'ejecucion/pago'"));
});

test('B5. Menú muestra únicamente Pagos (no Tesorería como label)', () => {
  const menu = read('src/services/menuService.js');
  ok(menu.includes("label: 'Pagos'"));
  ok(menu.includes("submoduloId: 'TESORERIA'"));
  ok(!/label:\s*'Tesorería'/.test(menu));
  ok(!/label:\s*'Derivación de Pago'/.test(menu));
});

test('B6. Alias centralizados (sin arrays duplicados en vistas)', () => {
  const od = read('src/utils/observacionDestino.js');
  ok(od.includes('TESORERIA_LABEL_ALIASES'));
  ok(od.includes('normalizeSubmoduloLabel'));
  ok(od.includes('isTesoreriaAlias'));
  const tr = read('src/utils/trazabilidad.js');
  ok(tr.includes('isTesoreriaAlias'));
  ok(tr.includes('normalizeSubmoduloLabel'));
  ok(!tr.includes('TESORERIA_LABEL_ALIASES'), 'trazabilidad no debe duplicar el array de alias');
});

test('B7. Filtro Pagos reconoce filas legacy Tesorería', () => {
  const rows = [
    { id: 1, sub_modulo_actual: 'Tesorería' },
    { id: 2, sub_modulo_actual: 'Almacén' },
    { id: 3, sub_modulo_actual: 'Pagos' },
  ];
  const filtered = filterRowsClient(rows, { sub_modulo_actual: 'Pagos' });
  eq(filtered.length, 2);
  ok(filtered.every((r) => r.id === 1 || r.id === 3));
});

console.log(`\nResultado: ${passed} OK, ${failed} FAIL\n`);
if (failed > 0) process.exit(1);

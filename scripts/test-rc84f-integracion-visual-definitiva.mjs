/**
 * RC8.4F — Integración visual definitiva estado/responsable (18 bandejas).
 *
 *   node scripts/test-rc84f-integracion-visual-definitiva.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  enrichReqRow,
  getResponsableVigenteLabel,
  getEstadoVigenteLabel,
} from '../src/utils/trazabilidad.js';

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

function assertNoLegacyFirst(rel, label) {
  const src = read(rel);
  // Patrón prohibido: responsable_actual || responsableActual (legacy primero)
  const bad = /responsable_actual\s*\|\|\s*(?:r\.)?responsableActual/;
  ok(!bad.test(src), `${label}: todavía prioriza responsable_actual`);
}

console.log('\n🔬 RC8.4F — Integración visual definitiva\n');

const jcrisostomoRow = {
  id: 3,
  codigo: 'REQ-00003',
  estado: 'INVITACION_ENVIADA',
  responsable_actual: 'wvasquez',
  responsable: 'CNCC',
  estado_responsable_vigente: {
    estadoCodigo: 'INVITACION_ENVIADA',
    estadoLabel: 'Invitación enviada',
    etapaCodigo: 'INVITACIONES',
    etapaLabel: 'Invitaciones',
    responsableTipo: 'PERSONA',
    responsableUsername: 'jcrisostomo',
    responsableNombre: 'Javier Crisóstomo',
    responsableUnidad: 'Invitaciones',
    responsableFuente: 'asignacion_explicita_db',
  },
};

// 1–3. Prioridad responsableActual en vistas parciales
test('1. Programación prioriza responsableActual', () => {
  assertNoLegacyFirst('src/views/programacion/programacionView2.js', 'Programación');
  ok(read('src/views/programacion/programacionView2.js').includes('responsableActual ||'));
});

test('2. Coordinación CM prioriza responsableActual', () => {
  assertNoLegacyFirst('src/views/contratacion/actosPreparativosView.js', 'Actos');
});

test('3. Invitaciones prioriza responsableActual', () => {
  assertNoLegacyFirst('src/views/contratacion/invitacionesView.js', 'Invitaciones');
});

// 4–6. Registro / Evaluación / DEC vía enrichReqRow
test('4. Registro/enrichReqRow muestra jcrisostomo (no wvasquez/CNCC)', () => {
  const e = enrichReqRow(jcrisostomoRow);
  eq(e.estado, 'Invitación enviada');
  ok(/jcrisostomo|Javier Crisóstomo/i.test(e.responsableActual), e.responsableActual);
  ok(!/wvasquez/i.test(e.responsableActual));
  ok(!/^CNCC$/i.test(e.responsableActual));
});

test('5. Evaluación usa mismo contrato (getResponsableVigenteLabel)', () => {
  eq(getResponsableVigenteLabel(jcrisostomoRow), 'Javier Crisóstomo');
});

test('6. DEC / getEstadoVigenteLabel = Invitación enviada', () => {
  eq(getEstadoVigenteLabel(jcrisostomoRow), 'Invitación enviada');
});

// 7–12. Vistas parciales consumen helper
const viewsWithHelper = [
  ['7. Consultas', 'src/views/contratacion/consultasObservacionesView.js'],
  ['8. Recepción Cotizaciones', 'src/views/contratacion/recepcionCotizacionesView.js'],
  ['9. Validaciones', 'src/views/contratacion/validacionesView.js'],
  ['10. Cuadro', 'src/views/contratacion/cuadroComparativoView.js'],
  ['11. CCP', 'src/views/contratacion/ccpView.js'],
  ['12. Órdenes', 'src/views/contratacion/registroOrdenesView.js'],
];
for (const [name, file] of viewsWithHelper) {
  test(`${name} muestra responsable vía getResponsableVigenteLabel`, () => {
    const src = read(file);
    ok(src.includes('getResponsableVigenteLabel'), `${file} sin helper`);
    ok(/Responsable/i.test(src), `${file} sin columna Responsable`);
  });
}

// 13–15. Recepción Bienes
test('13. Recepción Bienes backend enriquece listado', () => {
  const src = read('server/lib/recepcionBienes.js');
  ok(src.includes('enrichEstadoResponsableForBandeja'));
  ok(src.includes('enrichBandejaRecepcionRows'));
  ok(src.includes("await enrichEstadoResponsableForBandeja(list, 'requerimiento_id')")
    || src.includes('enrichEstadoResponsableForBandeja(list'));
});

test('14. Recepción Bienes FE no usa row.responsable como primera fuente', () => {
  const src = read('src/views/ejecucion/recepcionBienesView.js');
  ok(src.includes('getResponsableVigenteLabel'));
  ok(!/esc\(row\.responsable\s*\|\|/.test(src), 'aún usa row.responsable como display');
});

test('15. Bug variable data indefinida corregido', () => {
  const src = read('server/lib/recepcionBienes.js');
  ok(!/enrichEstadoResponsableForBandeja\(data\)/.test(src));
  ok(/enrichEstadoResponsableForBandeja\(\[row\]/.test(src));
});

// 16. Conformidad AU (misma bandeja recepción)
test('16. Conformidad AU usa mismo listado enriquecido (Recepción Bienes)', () => {
  const src = read('server/lib/recepcionBienes.js');
  ok(src.includes("bandeja_actual = 'AREA_USUARIA'") || src.includes('AREA_USUARIA'));
  ok(src.includes('enrichBandejaRecepcionRows'));
});

// 17–20. Stubs / NO IMPLEMENTADA
function assertStubOrMissing(rel, label) {
  if (!existsSync(join(root, rel))) {
    ok(true, `${label}: NO IMPLEMENTADA (sin archivo)`);
    return 'NO_IMPLEMENTADA';
  }
  const src = read(rel);
  const stub = /en construcción|Vista en construcción|TODO|stub/i.test(src)
    && src.length < 800;
  ok(stub || src.includes('getResponsableVigenteLabel'),
    `${label}: ni stub corto ni cobertura visual`);
  return stub ? 'NO_IMPLEMENTADA' : 'CUBIERTA';
}

test('17. Ampliaciones: cobertura real o NO IMPLEMENTADA', () => {
  const r = assertStubOrMissing('src/views/ejecucion/ampliacionResolucionView.js', 'Ampliaciones');
  eq(r, 'NO_IMPLEMENTADA');
});

test('18. Reducciones: NO IMPLEMENTADA en el sistema', () => {
  const views = [
    'src/views/ejecucion/reduccionView.js',
    'src/views/ejecucion/reduccionesView.js',
  ];
  ok(views.every((v) => !existsSync(join(root, v))), 'apareció vista de reducciones');
});

test('19. Servicios (presentación entregable): NO IMPLEMENTADA', () => {
  const r = assertStubOrMissing('src/views/ejecucion/presentacionEntregableView.js', 'Servicios');
  eq(r, 'NO_IMPLEMENTADA');
});

test('20. Pago/Tesorería: NO IMPLEMENTADA', () => {
  const r = assertStubOrMissing('src/views/ejecucion/derivacionPagoView.js', 'Pago');
  eq(r, 'NO_IMPLEMENTADA');
});

// 21–24. Reglas globales FE
test('21. Ninguna vista de bandeja prioriza responsable_actual sobre responsableActual', () => {
  const files = [
    'src/views/programacion/programacionView2.js',
    'src/views/contratacion/actosPreparativosView.js',
    'src/views/contratacion/invitacionesView.js',
    'src/utils/bandejaUi.js',
    'src/views/dashboard/traceabilityDashboard.js',
    'src/utils/actosModals.js',
    'src/utils/bandejaRequerimientos.js',
  ];
  files.forEach((f) => assertNoLegacyFirst(f, f));
});

test('22. enrichReqRow no usa submódulo como persona cuando hay erv PERSONA', () => {
  const e = enrichReqRow(jcrisostomoRow);
  ok(e.responsableActual !== 'Invitaciones');
  ok(e.responsableActual !== e.subModuloActual || e.responsableActual === 'Javier Crisóstomo');
});

test('23. CNCC (centro) no se muestra como persona', () => {
  const e = enrichReqRow(jcrisostomoRow);
  ok(e.responsableActual !== 'CNCC');
});

test('24. created_by no es fuente de display en enrichReqRow', () => {
  const e = enrichReqRow({
    ...jcrisostomoRow,
    created_by: 'otro.usuario',
  });
  ok(!/otro\.usuario/i.test(e.responsableActual));
});

// 25. Batch sin N+1
test('25. enrichEstadoResponsableForBandeja usa un solo resolveEstadoResponsableBatch', () => {
  const src = read('server/lib/enrichEstadoResponsable.js');
  const calls = src.match(/resolveEstadoResponsableBatch\(/g) || [];
  eq(calls.length, 1);
});

test('26–28. Suites RC8.4B/D/E existen', () => {
  ok(existsSync(join(root, 'scripts/test-rc84b-resolvedor-estado-responsable.mjs')));
  ok(existsSync(join(root, 'scripts/test-rc84d-integracion-global-estado-responsable.mjs')));
  ok(existsSync(join(root, 'scripts/test-rc84e-bandejas-independientes-estado-responsable.mjs')));
});

test('29. Helpers getResponsableVigenteLabel / getEstadoVigenteLabel exportados', () => {
  ok(typeof getResponsableVigenteLabel === 'function');
  ok(typeof getEstadoVigenteLabel === 'function');
});

test('30. UNIDAD / PENDIENTE respetan regla visual', () => {
  eq(getResponsableVigenteLabel({
    estado_responsable_vigente: {
      responsableTipo: 'UNIDAD',
      responsableUnidad: 'Almacén',
      estadoLabel: 'X',
    },
  }), 'Almacén');
  eq(getResponsableVigenteLabel({
    estado_responsable_vigente: {
      responsableTipo: 'PENDIENTE',
      estadoLabel: 'X',
    },
  }), 'Pendiente de asignación');
});

console.log(`\nResultado: ${passed} ok, ${failed} fail\n`);
if (failed) process.exit(1);
console.log('OK — test-rc84f-integracion-visual-definitiva\n');

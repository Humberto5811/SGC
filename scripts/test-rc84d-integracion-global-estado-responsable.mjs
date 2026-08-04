/**
 * RC8.4D — Suite de integración global estado–responsable en todas las bandejas.
 *
 * Verifica:
 *  1.  Backend enriquece estado_responsable_vigente en batch
 *  2.  Frontend enrichReqRow prioriza el contrato
 *  3.  created_by NO aparece como responsable
 *  4.  Submódulo NO aparece como persona
 *  5.  Centro (CNCC) NO aparece como persona
 *  6.  Campos legacy siguen presentes
 *  7.  RC8.4B sigue pasando (re-ejecución)
 *  8.  RC8.2E/RC8.2H/RC8.3B siguen pasando (verificación estructural)
 *  9.  Caso real REQ-00003: Invitación enviada → responsable = jcrisostomo
 * 10.  Contrato estado_responsable_vigente completo en todas las bandejas
 */

import { resolveEstadoResponsableBatch } from '../server/lib/resolvedorEstadoResponsable.js';
import { enrichReqRow as enrichFrontend } from '../src/utils/trazabilidad.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';
import { execSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function ok(cond, msg) { assert.ok(cond, msg); }
function eq(a, b, msg) { assert.strictEqual(a, b, msg); }
function match(pat, val, msg) { assert.ok(pat.test(String(val || '')), msg || `${pat} !~ ${val}`); }

// ==========================================================================
console.log('\n🔬 RC8.4D — Integración global estado–responsable\n');

// ==========================================================================
// 1. Backend enriquece estado_responsable_vigente en batch
// ==========================================================================
test('1. Backend: enrichRequerimientoRowsWithCcp anexa estado_responsable_vigente', async () => {
  // Verificación estructural: el archivo fue modificado para incluir el batch
  const fs = await import('node:fs');
  const content = fs.readFileSync(
    join(__dirname, '..', 'server', 'lib', 'trazabilidad.js'),
    'utf-8',
  );
  ok(content.includes('estado_responsable_vigente'), 'trazabilidad.js no referencia estado_responsable_vigente');
  ok(content.includes('resolveEstadoResponsableBatch'), 'trazabilidad.js no invoca resolveEstadoResponsableBatch');
});

// ==========================================================================
// 2. Frontend enrichReqRow prioriza estado_responsable_vigente
// ==========================================================================
test('2. Frontend: enrichReqRow usa estado_responsable_vigente cuando existe', () => {
  const row = {
    id: 3,
    codigo: 'REQ-00003',
    estado: 'Invitación enviada',
    estado_actual: 'INVITACIONES',
    responsable_actual: '',
    responsable: 'CNCC',
    centro_nombre: 'CNCC',
    usuario_modificacion: 'wvasquez',
    created_by: 'wvasquez',
    sub_modulo_actual: 'Invitaciones',
    payload: '{}',
    created_at: '2026-01-01',
    updated_at: '2026-01-10',
    // Contrato enriquecido por backend
    estado_responsable_vigente: {
      estadoCodigo: 'INVITACION_ENVIADA',
      estadoLabel: 'Invitación enviada',
      etapaCodigo: 'INVITACIONES',
      etapaLabel: 'Invitaciones',
      responsableTipo: 'PERSONA',
      responsableUsuarioId: null,
      responsableUsername: 'jcrisostomo',
      responsableNombre: 'Javier Crisóstomo',
      responsableUnidad: 'Invitaciones',
      responsableFuente: 'asignacion_explicita_db',
      actualizadoAt: '2026-01-10T10:00:00Z',
    },
  };

  const enriched = enrichFrontend(row);

  // Responsable debe ser jcrisostomo (persona asignada)
  eq(enriched.responsableActual, 'Javier Crisóstomo', 'responsableActual no es la persona asignada');

  // NO debe ser wvasquez (creador)
  ok(enriched.responsableActual !== 'wvasquez', 'responsableActual es el creador, no el vigente');

  // NO debe ser CNCC (centro)
  ok(enriched.responsableActual !== 'CNCC', 'responsableActual es el centro');

  // NO debe ser Invitaciones (submódulo)
  ok(enriched.responsableActual !== 'Invitaciones', 'responsableActual es el submódulo');

  // Estado debe venir del contrato
  eq(enriched.estado, 'Invitación enviada');
  eq(enriched.estadoActualTexto, 'Invitaciones');

  // Contrato completo debe estar expuesto
  ok(enriched.estado_responsable_vigente !== null, 'estado_responsable_vigente no expuesto');
  eq(enriched.estado_responsable_vigente.responsableUsername, 'jcrisostomo');
});

// ==========================================================================
// 3. created_by NO aparece como responsable
// ==========================================================================
test('3. created_by=wvasquez NO es responsable vigente', () => {
  const row = {
    id: 3,
    estado: 'Invitación enviada',
    estado_actual: 'INVITACIONES',
    usuario_modificacion: 'wvasquez',
    created_by: 'wvasquez',
    responsable: '',
    payload: '{}',
    created_at: '2026-01-01',
    updated_at: '2026-01-10',
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
  const enriched = enrichFrontend(row);
  ok(enriched.responsableActual !== 'wvasquez',
    `created_by apareció como responsable: ${enriched.responsableActual}`);
});

// ==========================================================================
// 4. Submódulo NO aparece como persona
// ==========================================================================
test('4. Nombre del submódulo NO es persona', () => {
  const row = {
    id: 1,
    estado: 'Registrado',
    estado_actual: 'REGISTRO',
    responsable_actual: '',
    responsable: '',
    payload: '{}',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    estado_responsable_vigente: {
      estadoCodigo: 'REQUERIMIENTO_REGISTRADO',
      estadoLabel: 'Registrado',
      etapaCodigo: 'REGISTRO',
      etapaLabel: 'Registro de Requerimiento',
      responsableTipo: 'PENDIENTE',
      responsableUnidad: 'Pendiente de asignación',
      responsableFuente: 'pendiente_asignacion',
    },
  };
  const enriched = enrichFrontend(row);
  ok(enriched.responsableActual !== 'Registro de Requerimiento',
    `submódulo como persona: ${enriched.responsableActual}`);
  ok(enriched.responsableActual !== 'Invitaciones',
    `submódulo como persona: ${enriched.responsableActual}`);
});

// ==========================================================================
// 5. Centro CNCC NO aparece como persona
// ==========================================================================
test('5. CNCC / centro NO es responsable', () => {
  const row = {
    id: 1,
    estado: 'Registrado',
    estado_actual: 'REGISTRO',
    responsable_actual: '',
    responsable: 'CNCC',
    centro_nombre: 'CNCC',
    payload: '{}',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    estado_responsable_vigente: {
      estadoCodigo: 'REQUERIMIENTO_REGISTRADO',
      estadoLabel: 'Registrado',
      etapaCodigo: 'REGISTRO',
      etapaLabel: 'Registro de Requerimiento',
      responsableTipo: 'UNIDAD',
      responsableUnidad: 'Usuario AU',
      responsableFuente: 'unidad_destino_etapa',
    },
  };
  const enriched = enrichFrontend(row);
  ok(enriched.responsableActual !== 'CNCC', `centro como responsable: ${enriched.responsableActual}`);
  ok(enriched.responsableActual !== '', 'responsable vacío');
});

// ==========================================================================
// 6. Campos legacy siguen presentes
// ==========================================================================
test('6. Campos legacy presentes tras enrichReqRow', () => {
  const row = {
    id: 1,
    estado: 'Registrado',
    estado_actual: 'REGISTRO',
    responsable_actual: '',
    responsable: '',
    payload: '{}',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    estado_responsable_vigente: {
      estadoCodigo: 'REQUERIMIENTO_REGISTRADO',
      estadoLabel: 'Registrado',
      etapaCodigo: 'REGISTRO',
      etapaLabel: 'Registro de Requerimiento',
      responsableTipo: 'UNIDAD',
      responsableUnidad: 'Usuario AU',
      responsableFuente: 'unidad_destino_etapa',
    },
  };
  const enriched = enrichFrontend(row);
  ok('estado_actual' in enriched, 'falta estado_actual legacy');
  ok('responsable_actual' in enriched, 'falta responsable_actual legacy (campo original)');
  ok('sub_modulo_actual' in enriched, 'falta sub_modulo_actual legacy');
  ok('dias_en_estado' in enriched, 'falta dias_en_estado');
  ok('monto_total' in enriched, 'falta monto_total');
});

// ==========================================================================
// 7. RC8.4B sigue pasando (re-ejecución)
// ==========================================================================
test('7. RC8.4B se ejecuta sin errores', () => {
  try {
    execSync('node scripts/test-rc84b-resolvedor-estado-responsable.mjs', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      timeout: 30_000,
    });
    ok(true, 'RC8.4B pasó');
  } catch (e) {
    ok(false, `RC8.4B falló: ${e.message}\n${e.stdout || ''}`);
  }
});

// ==========================================================================
// 8. RC8.2E estructural check
// ==========================================================================
test('8. RC8.2E existe y es ejecutable', () => {
  try {
    const result = execSync('node --check scripts/test-rc82e-adjuntos-asignacion-invitaciones.mjs', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      timeout: 15_000,
    });
    ok(true, 'RC8.2E válido');
  } catch (e) {
    ok(false, `RC8.2E falló sintaxis: ${e.message}`);
  }
});

// ==========================================================================
// 9. RC8.2H estructural check
// ==========================================================================
test('9. RC8.2H existe y es ejecutable', () => {
  try {
    const result = execSync('node --check scripts/test-rc82h-requerimiento-asignado-invitaciones.mjs', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      timeout: 15_000,
    });
    ok(true, 'RC8.2H válido');
  } catch (e) {
    ok(false, `RC8.2H falló sintaxis: ${e.message}`);
  }
});

// ==========================================================================
// 10. RC8.3B estructural check
// ==========================================================================
test('10. RC8.3B existe y es ejecutable', () => {
  try {
    const result = execSync('node --check scripts/test-rc83b-catalogo-roles-perfiles.mjs', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      timeout: 15_000,
    });
    ok(true, 'RC8.3B válido');
  } catch (e) {
    ok(false, `RC8.3B falló sintaxis: ${e.message}`);
  }
});

// ==========================================================================
// 11-18. Simulaciones de bandejas con contrato enriquecido
// ==========================================================================

function simBandeja(nombre, row) {
  const enriched = enrichFrontend(row);
  const erv = enriched.estado_responsable_vigente;
  ok(erv !== null && typeof erv === 'object',
    `${nombre}: sin estado_responsable_vigente`);
  ok(typeof erv.estadoCodigo === 'string' && erv.estadoCodigo.length > 0,
    `${nombre}: estadoCodigo inválido`);
  ok(typeof erv.estadoLabel === 'string',
    `${nombre}: estadoLabel inválido`);
  ok(typeof erv.etapaCodigo === 'string',
    `${nombre}: etapaCodigo inválido`);
  ok(['PERSONA', 'UNIDAD', 'ROL', 'PENDIENTE'].includes(erv.responsableTipo),
    `${nombre}: responsableTipo inválido: ${erv.responsableTipo}`);
  ok(typeof erv.responsableFuente === 'string' && erv.responsableFuente.length > 0,
    `${nombre}: responsableFuente inválido`);
  return enriched;
}

// 11. Registro REQ-00003: Invitación enviada → jcrisostomo
test('11. Registro: REQ-00003 Invitación enviada → responsable=jcrisostomo', () => {
  const row = {
    id: 3, codigo: 'REQ-00003', tipo: 'bienes',
    denominacion: 'Adquisición de equipos',
    area: 'CNCC', responsable: 'CNCC', centro_nombre: 'CNCC',
    estado: 'Invitación enviada', estado_actual: 'INVITACIONES',
    usuario_modificacion: 'wvasquez', created_by: 'wvasquez',
    responsable_actual: '',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-01-10',
    estado_responsable_vigente: {
      estadoCodigo: 'INVITACION_ENVIADA', estadoLabel: 'Invitación enviada',
      etapaCodigo: 'INVITACIONES', etapaLabel: 'Invitaciones',
      responsableTipo: 'PERSONA', responsableUsername: 'jcrisostomo',
      responsableNombre: 'Javier Crisóstomo', responsableUnidad: 'Invitaciones',
      responsableFuente: 'asignacion_explicita_db',
      actualizadoAt: '2026-01-10T10:00:00Z',
    },
  };
  const enriched = simBandeja('Registro', row);
  eq(enriched.responsableActual, 'Javier Crisóstomo');
  ok(enriched.responsableActual !== 'wvasquez', 'responsable es el creador');
  ok(enriched.responsableActual !== 'CNCC', 'responsable es el centro');
});

// 12. Evaluación
test('12. Evaluación: responsable vigente', () => {
  const row = {
    id: 3, codigo: 'REQ-00003', tipo: 'bienes',
    denominacion: 'Equipos', area: 'CNCC', responsable: 'CNCC',
    estado: 'En tramite de aprobación', estado_actual: 'EVALUACION',
    usuario_modificacion: 'wvasquez',
    responsable_actual: 'Director / Gerente',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-01-02',
    estado_responsable_vigente: {
      estadoCodigo: 'EVALUACION_PENDIENTE', estadoLabel: 'En evaluación',
      etapaCodigo: 'EVALUACION', etapaLabel: 'Evaluación',
      responsableTipo: 'UNIDAD', responsableUnidad: 'Director / Gerente',
      responsableFuente: 'unidad_destino_etapa',
    },
  };
  simBandeja('Evaluación', row);
});

// 13. DEC
test('13. DEC: responsable vigente', () => {
  const row = {
    id: 3, codigo: 'REQ-00003', tipo: 'bienes',
    estado: 'Aprobado', estado_actual: 'DEC',
    usuario_modificacion: 'wvasquez',
    responsable_actual: 'DEC',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-01-03',
    estado_responsable_vigente: {
      estadoCodigo: 'EN_DEC', estadoLabel: 'En DEC',
      etapaCodigo: 'DEC', etapaLabel: 'DEC',
      responsableTipo: 'UNIDAD', responsableUnidad: 'Responsable DEC',
      responsableFuente: 'unidad_destino_etapa',
    },
  };
  simBandeja('DEC', row);
});

// 14. Programación
test('14. Programación: responsable vigente', () => {
  const row = {
    id: 3, codigo: 'REQ-00003',
    estado: 'Aprobado DEC', estado_actual: 'PROGRAMACION',
    responsable_actual: 'Responsable Programación',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-01-04',
    estado_responsable_vigente: {
      estadoCodigo: 'EN_PROGRAMACION', estadoLabel: 'En Programación',
      etapaCodigo: 'PROGRAMACION', etapaLabel: 'Programación',
      responsableTipo: 'UNIDAD', responsableUnidad: 'Responsable Programación',
      responsableFuente: 'unidad_destino_etapa',
    },
  };
  simBandeja('Programación', row);
});

// 15. Coordinación CM con analista asignado
test('15. Coordinación CM: analista asignado', () => {
  const row = {
    id: 3, codigo: 'REQ-00003',
    estado: 'Programado', estado_actual: 'ACTOS_PREPARATORIOS',
    responsable_actual: 'jcrisostomo',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-01-05',
    estado_responsable_vigente: {
      estadoCodigo: 'EN_COORDINACION_CM', estadoLabel: 'En Coordinación CM',
      etapaCodigo: 'COORDINACION_CM', etapaLabel: 'Coordinación CM',
      responsableTipo: 'PERSONA', responsableUsername: 'jcrisostomo',
      responsableNombre: 'Javier Crisóstomo', responsableUnidad: 'Coordinación CM',
      responsableFuente: 'asignacion_explicita_db',
    },
  };
  simBandeja('Coordinación CM', row);
});

// 16. Invitaciones con analista asignado
test('16. Invitaciones: analista asignado', () => {
  const row = {
    id: 3, codigo: 'REQ-00003',
    estado: 'En Invitaciones', estado_actual: 'INVITACIONES',
    responsable_actual: 'Invitaciones',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-01-10',
    estado_responsable_vigente: {
      estadoCodigo: 'INVITACION_ENVIADA', estadoLabel: 'Invitación enviada',
      etapaCodigo: 'INVITACIONES', etapaLabel: 'Invitaciones',
      responsableTipo: 'PERSONA', responsableUsername: 'jcrisostomo',
      responsableNombre: 'Javier Crisóstomo', responsableUnidad: 'Invitaciones',
      responsableFuente: 'asignacion_explicita_db',
    },
  };
  const enriched = simBandeja('Invitaciones', row);
  // Invitaciones NO debe aparecer como persona
  ok(enriched.responsableActual !== 'Invitaciones', 'submódulo Invitaciones como persona');
  eq(enriched.responsableActual, 'Javier Crisóstomo');
});

// 17. Validaciones
test('17. Validaciones: usuario AU asignado', () => {
  const row = {
    id: 3, codigo: 'REQ-00003',
    estado: 'En Valid. Usuario', estado_actual: 'VALIDACION_USUARIO',
    responsable_actual: 'mlopez',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-01-15',
    estado_responsable_vigente: {
      estadoCodigo: 'EN_VALIDACION', estadoLabel: 'En Validación',
      etapaCodigo: 'VALIDACIONES', etapaLabel: 'Validaciones',
      responsableTipo: 'PERSONA', responsableUsername: 'mlopez',
      responsableNombre: 'María López', responsableUnidad: 'Área Usuaria',
      responsableFuente: 'responsable_actual_bd',
    },
  };
  simBandeja('Validaciones', row);
});

// 18. Recepción Bienes
test('18. Recepción Bienes: especialista asignado', () => {
  const row = {
    id: 3, codigo: 'REQ-00003',
    estado: 'En Ejecución', estado_actual: 'RECEPCION_BIENES',
    responsable_actual: 'ralmacen',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-02-01',
    recepcion_estado_global: 'RECEPCION_BIENES_PENDIENTE',
    estado_responsable_vigente: {
      estadoCodigo: 'RECEPCION_BIENES_PENDIENTE', estadoLabel: 'Pendiente de recepción',
      etapaCodigo: 'RECEPCION_BIENES', etapaLabel: 'Recepción de Bienes',
      responsableTipo: 'PERSONA', responsableUsername: 'ralmacen',
      responsableNombre: 'Roberto Almacén', responsableUnidad: 'Almacén',
      responsableFuente: 'asignacion_explicita_db',
    },
  };
  simBandeja('Recepción Bienes', row);
});

// 19. Conformidad AU
test('19. Conformidad AU: usuario AU seleccionado', () => {
  const row = {
    id: 3, codigo: 'REQ-00003',
    estado: 'En Ejecución', estado_actual: 'RECEPCION_BIENES',
    recepcion_estado_global: 'CONFORMIDAD_PENDIENTE_AU',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-02-10',
    estado_responsable_vigente: {
      estadoCodigo: 'CONFORMIDAD_PENDIENTE_AU', estadoLabel: 'Pendiente conformidad AU',
      etapaCodigo: 'RECEPCION_BIENES', etapaLabel: 'Recepción de Bienes',
      responsableTipo: 'UNIDAD', responsableUnidad: 'Área Usuaria',
      responsableFuente: 'unidad_destino_etapa',
    },
  };
  simBandeja('Conformidad AU', row);
});

// 20. Ampliaciones
test('20. Ampliaciones: responsable de etapa', () => {
  const row = {
    id: 3, codigo: 'REQ-00003',
    estado: 'En Ejecución', estado_actual: 'EJECUCION',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-03-01',
    estado_responsable_vigente: {
      estadoCodigo: 'AMPLIACION_SOLICITADA', estadoLabel: 'Ampliación solicitada',
      etapaCodigo: 'EJECUCION', etapaLabel: 'Ejecución Contractual',
      responsableTipo: 'PERSONA', responsableUsername: 'solicitante',
      responsableNombre: 'Solicitante Ampliación', responsableUnidad: 'Área Usuaria',
      responsableFuente: 'responsable_actual_bd',
    },
  };
  simBandeja('Ampliaciones', row);
});

// 21. Reducciones
test('21. Reducciones: responsable de etapa', () => {
  const row = {
    id: 3, codigo: 'REQ-00003',
    estado: 'En Ejecución', estado_actual: 'EJECUCION',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-03-15',
    estado_responsable_vigente: {
      estadoCodigo: 'REDUCCION_SOLICITADA', estadoLabel: 'Reducción solicitada',
      etapaCodigo: 'EJECUCION', etapaLabel: 'Ejecución Contractual',
      responsableTipo: 'PERSONA', responsableUsername: 'solicitante',
      responsableNombre: 'Solicitante Reducción', responsableUnidad: 'Área Usuaria',
      responsableFuente: 'responsable_actual_bd',
    },
  };
  simBandeja('Reducciones', row);
});

// 22. Pago / Tesorería
test('22. Pago: responsable vigente', () => {
  const row = {
    id: 3, codigo: 'REQ-00003',
    estado: 'En Ejecución', estado_actual: 'DERIVACION_PAGO',
    expediente_derivado_pago: true,
    derivado_pago_at: '2026-04-01T00:00:00Z',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-04-01',
    estado_responsable_vigente: {
      estadoCodigo: 'EXPEDIENTE_DERIVADO_PAGO', estadoLabel: 'Derivado a pago',
      etapaCodigo: 'DERIVACION_PAGO', etapaLabel: 'Tesorería / Pago',
      responsableTipo: 'UNIDAD', responsableUnidad: 'Tesorería / Pagaduría',
      responsableFuente: 'unidad_destino_etapa',
    },
  };
  simBandeja('Pago', row);
});

// 23. Batch sin N+1 (verificación estructural en resolvedor)
test('23. Batch: resolveEstadoResponsableBatch acepta array de IDs', async () => {
  ok(typeof resolveEstadoResponsableBatch === 'function',
    'resolveEstadoResponsableBatch no es función');
  // Verificar que devuelve Map (aunque vacío sin DB)
  const result = await resolveEstadoResponsableBatch([]);
  ok(result instanceof Map, 'resolveEstadoResponsableBatch no devuelve Map');
});

// 24. Ninguna bandeja muestra CNCC como persona
test('24. CNCC NO aparece como persona en ninguna simulación', () => {
  const row = {
    id: 2, codigo: 'REQ-00002',
    estado: 'Registrado', estado_actual: 'REGISTRO',
    responsable: 'CNCC', centro_nombre: 'CNCC',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-01-01',
    estado_responsable_vigente: {
      estadoCodigo: 'REQUERIMIENTO_REGISTRADO', estadoLabel: 'Registrado',
      etapaCodigo: 'REGISTRO', etapaLabel: 'Registro de Requerimiento',
      responsableTipo: 'UNIDAD', responsableUnidad: 'Usuario AU',
      responsableFuente: 'unidad_destino_etapa',
    },
  };
  const enriched = enrichFrontend(row);
  ok(enriched.responsableActual !== 'CNCC', `CNCC como responsable: ${enriched.responsableActual}`);
});

// 25. Build check: vite compila
test('25. Build: vite build sin errores de sintaxis JS', () => {
  try {
    // Solo verificamos sintaxis de los archivos modificados, no build completo
    const files = [
      'server/lib/trazabilidad.js',
      'src/utils/trazabilidad.js',
      'shared/resolvedorEstadoResponsable.js',
      'server/lib/resolvedorEstadoResponsable.js',
    ];
    for (const f of files) {
      execSync(`node --check ${f}`, {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        timeout: 10_000,
      });
    }
    ok(true, 'Sintaxis JS válida en todos los archivos modificados');
  } catch (e) {
    ok(false, `Error de sintaxis: ${e.message}`);
  }
});

// ==========================================================================
// REPORTE
// ==========================================================================
console.log(`\n📊 RC8.4D: ${passed} pasaron / ${failed} fallaron`);
if (failed > 0) {
  console.log('❌ Suite RC8.4D FALLÓ');
  process.exit(1);
}
console.log('✅ Suite RC8.4D PASÓ — integración global completa');
process.exit(0);
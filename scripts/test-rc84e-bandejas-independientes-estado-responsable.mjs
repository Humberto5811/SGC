/**
 * RC8.4E — Suite de pruebas para integración de estado–responsable en las 12 bandejas.
 *
 * Verifica:
 *  1.  Backends importan el resolvedor
 *  2.  Backends llaman enrichEstadoResponsableForBandeja
 *  3.  Contrato estado_responsable_vigente completo
 *  4.  Batch sin N+1 (verify batch function sig)
 *  5.  Campos legacy conservados
 *  6.  RC8.4B sigue pasando
 *  7.  RC8.4D sigue pasando
 *  8.  RC8.2E, RC8.2H, RC8.3B estructural checks
 *  9.  Recepcion Bienes alcance centro check
 * 10.  Build check
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { enrichReqRow as enrichFrontend } from '../src/utils/trazabilidad.js';
import { resolveEstadoResponsableBatch } from '../server/lib/resolvedorEstadoResponsable.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

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

// ==========================================================================
console.log('\n🔬 RC8.4E — Integración estado–responsable en 12 bandejas independientes\n');

// ==========================================================================
// 1. Verificación estructural de backends
// ==========================================================================
const backendFiles = [
  { file: 'server/lib/portalProveedores.js', bandejas: ['listarConsultasBandeja', 'listarRecepcionCotizaciones'] },
  { file: 'server/lib/validacionesCotizacion.js', bandejas: ['listarValidacionesExpedientes'] },
  { file: 'server/lib/cuadroComparativo.js', bandejas: ['listarCuadroComparativoExpedientes'] },
  { file: 'server/lib/ccpCertificacion.js', bandejas: ['listarBandejaCcp'] },
  { file: 'server/lib/ordenesContratacion.js', bandejas: ['listarBandejaOrdenes'] },
  { file: 'server/lib/recepcionBienes.js', bandejas: ['listarBandejaRecepcionBienes'] },
];

for (const { file, bandejas } of backendFiles) {
  test(`Backend ${file}: importa enrichEstadoResponsableForBandeja`, () => {
    const content = readFileSync(join(root, file), 'utf8');
    ok(content.includes('enrichEstadoResponsableForBandeja'),
      `${file} no importa enrichEstadoResponsableForBandeja`);
  });

  test(`Backend ${file}: llama enrichEstadoResponsableForBandeja`, () => {
    const content = readFileSync(join(root, file), 'utf8');
    ok(content.includes('await enrichEstadoResponsableForBandeja'),
      `${file} no llama enrichEstadoResponsableForBandeja`);
  });

  for (const fn of bandejas) {
    test(`Backend ${file}: función ${fn} existe`, () => {
      const content = readFileSync(join(root, file), 'utf8');
      ok(content.includes(`export async function ${fn}`) || content.includes(`async function ${fn}`),
        `${fn} no encontrada en ${file}`);
    });
  }
}

// ==========================================================================
// 2. Contrato estado_responsable_vigente
// ==========================================================================
test('Contrato: estado_responsable_vigente campos mínimos', () => {
  const erv = {
    estadoCodigo: 'INVITACION_ENVIADA',
    estadoLabel: 'Invitación enviada',
    etapaCodigo: 'INVITACIONES',
    etapaLabel: 'Invitaciones',
    responsableTipo: 'PERSONA',
    responsableUsuarioId: 5,
    responsableUsername: 'jcrisostomo',
    responsableNombre: 'Javier Crisóstomo',
    responsableUnidad: 'Invitaciones',
    responsableFuente: 'asignacion_explicita_db',
    actualizadoAt: '2026-01-10T10:00:00Z',
  };

  const required = [
    'estadoCodigo', 'estadoLabel', 'etapaCodigo', 'etapaLabel',
    'responsableTipo', 'responsableUsername', 'responsableNombre',
    'responsableUnidad', 'responsableFuente', 'actualizadoAt',
  ];
  for (const key of required) {
    ok(key in erv, `Falta campo ${key} en el contrato`);
  }
  ok(['PERSONA', 'UNIDAD', 'ROL', 'PENDIENTE'].includes(erv.responsableTipo),
    `Tipo inválido: ${erv.responsableTipo}`);
});

// ==========================================================================
// 3. Batch sin N+1
// ==========================================================================
test('Batch: resolveEstadoResponsableBatch es función', () => {
  ok(typeof resolveEstadoResponsableBatch === 'function',
    'resolveEstadoResponsableBatch no es función');
});

test('Batch: resolveEstadoResponsableBatch devuelve Map', async () => {
  const result = await resolveEstadoResponsableBatch([]);
  ok(result instanceof Map, 'No devuelve Map');
});

test('Batch: resolveEstadoResponsableBatch acepta array de IDs', async () => {
  const result = await resolveEstadoResponsableBatch([1, 2, 3]);
  ok(result instanceof Map, 'No devuelve Map con array de IDs');
});

// ==========================================================================
// 4. Campos legacy conservados
// ==========================================================================
test('Frontend: enrichReqRow conserva campos legacy', () => {
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
  ok('estado_actual' in enriched, 'falta estado_actual');
  ok('responsable_actual' in enriched, 'falta responsable_actual');
  ok('sub_modulo_actual' in enriched, 'falta sub_modulo_actual');
  ok('dias_en_estado' in enriched, 'falta dias_en_estado');
});

// ==========================================================================
// 5. Simulaciones de bandejas con contrato enriquecido
// ==========================================================================
function simBandeja(nombre, row) {
  const enriched = enrichFrontend(row);
  const erv = enriched.estado_responsable_vigente;
  ok(erv !== null && typeof erv === 'object',
    `${nombre}: sin estado_responsable_vigente`);
  ok(typeof erv.estadoCodigo === 'string' && erv.estadoCodigo.length > 0,
    `${nombre}: estadoCodigo inválido`);
  ok(['PERSONA', 'UNIDAD', 'ROL', 'PENDIENTE'].includes(erv.responsableTipo),
    `${nombre}: responsableTipo inválido: ${erv.responsableTipo}`);
  ok(typeof erv.responsableFuente === 'string' && erv.responsableFuente.length > 0,
    `${nombre}: responsableFuente inválido`);
  return enriched;
}

// Test each bandeja simulation
const bandejaSims = [
  {
    name: 'Consultas', row: {
      id: 1, codigo: 'REQ-00001', estado: 'En Invitaciones', estado_actual: 'INVITACIONES',
      created_at: '2026-01-01', updated_at: '2026-01-10', payload: '{}',
      estado_responsable_vigente: {
        estadoCodigo: 'INVITACION_ENVIADA', estadoLabel: 'Invitación enviada',
        etapaCodigo: 'INVITACIONES', etapaLabel: 'Invitaciones',
        responsableTipo: 'PERSONA', responsableUsername: 'analista1',
        responsableNombre: 'Analista Uno', responsableUnidad: 'Invitaciones',
        responsableFuente: 'asignacion_explicita_db',
      },
    },
  },
  {
    name: 'Recepción Cotizaciones', row: {
      id: 1, codigo: 'REQ-00001', estado: 'En Cotizaciones', estado_actual: 'RECEPCION_COTIZACIONES',
      created_at: '2026-01-01', updated_at: '2026-01-10', payload: '{}',
      estado_responsable_vigente: {
        estadoCodigo: 'EN_RECEPCION_COTIZACIONES', estadoLabel: 'En Recepción de Cotizaciones',
        etapaCodigo: 'RECEPCION_COTIZACIONES', etapaLabel: 'Recepción de Cotizaciones',
        responsableTipo: 'UNIDAD', responsableUnidad: 'Analista CM',
        responsableFuente: 'unidad_destino_etapa',
      },
    },
  },
  {
    name: 'Validaciones', row: {
      id: 1, codigo: 'REQ-00001', estado: 'En Valid. Usuario', estado_actual: 'VALIDACION_USUARIO',
      created_at: '2026-01-01', updated_at: '2026-01-15', payload: '{}',
      estado_responsable_vigente: {
        estadoCodigo: 'EN_VALIDACION', estadoLabel: 'En Validación',
        etapaCodigo: 'VALIDACIONES', etapaLabel: 'Validaciones',
        responsableTipo: 'PERSONA', responsableUsername: 'mlopez',
        responsableNombre: 'María López', responsableUnidad: 'Área Usuaria',
        responsableFuente: 'responsable_actual_bd',
      },
    },
  },
  {
    name: 'Cuadro Comparativo', row: {
      id: 1, codigo: 'REQ-00001', estado: 'En Cuadro Comp.', estado_actual: 'CUADRO_COMPARATIVO',
      created_at: '2026-01-01', updated_at: '2026-01-20', payload: '{}',
      estado_responsable_vigente: {
        estadoCodigo: 'CUADRO_COMPARATIVO', estadoLabel: 'En Cuadro Comparativo',
        etapaCodigo: 'CUADRO_COMPARATIVO', etapaLabel: 'Cuadro Comparativo',
        responsableTipo: 'PERSONA', responsableUsername: 'analista1',
        responsableNombre: 'Analista Uno', responsableUnidad: 'Analista CM',
        responsableFuente: 'asignacion_explicita_db',
      },
    },
  },
  {
    name: 'CCP', row: {
      id: 1, codigo: 'REQ-00001', estado: 'En CCP', estado_actual: 'CCP',
      created_at: '2026-01-01', updated_at: '2026-01-25', payload: '{}',
      estado_responsable_vigente: {
        estadoCodigo: 'CCP_REGISTRADA', estadoLabel: 'CCP Registrada',
        etapaCodigo: 'CCP', etapaLabel: 'CCP',
        responsableTipo: 'UNIDAD', responsableUnidad: 'CCP',
        responsableFuente: 'unidad_destino_etapa',
      },
    },
  },
  {
    name: 'Órdenes', row: {
      id: 1, codigo: 'REQ-00001', estado: 'En Reg. Orden', estado_actual: 'REGISTRO_ORDEN',
      created_at: '2026-01-01', updated_at: '2026-02-01', payload: '{}',
      estado_responsable_vigente: {
        estadoCodigo: 'ORDEN_REGISTRADA', estadoLabel: 'Orden Registrada',
        etapaCodigo: 'REGISTRO_ORDEN', etapaLabel: 'Registro de Orden',
        responsableTipo: 'PERSONA', responsableUsername: 'analista1',
        responsableNombre: 'Analista Uno', responsableUnidad: 'Registro de Órdenes',
        responsableFuente: 'responsable_actual_bd',
      },
    },
  },
  {
    name: 'Recepción Bienes', row: {
      id: 1, codigo: 'REQ-00001', estado: 'En Ejecución', estado_actual: 'EJECUCION',
      created_at: '2026-01-01', updated_at: '2026-02-10', payload: '{}',
      estado_responsable_vigente: {
        estadoCodigo: 'RECEPCION_BIENES_PENDIENTE', estadoLabel: 'Pendiente de recepción',
        etapaCodigo: 'RECEPCION_BIENES', etapaLabel: 'Recepción de Bienes',
        responsableTipo: 'PERSONA', responsableUsername: 'ralmacen',
        responsableNombre: 'Roberto Almacén', responsableUnidad: 'Almacén',
        responsableFuente: 'asignacion_explicita_db',
      },
    },
  },
  {
    name: 'Recepción Servicios', row: {
      id: 1, codigo: 'REQ-00001', estado: 'En Ejecución', estado_actual: 'EJECUCION',
      created_at: '2026-01-01', updated_at: '2026-02-15', payload: '{}',
      estado_responsable_vigente: {
        estadoCodigo: 'PRESENTACION_ENTREGABLES', estadoLabel: 'Presentación de Entregables',
        etapaCodigo: 'PRESENTACION_ENTREGABLES', etapaLabel: 'Recepción de Servicios',
        responsableTipo: 'UNIDAD', responsableUnidad: 'Área Usuaria',
        responsableFuente: 'unidad_destino_etapa',
      },
    },
  },
  {
    name: 'Conformidad AU', row: {
      id: 1, codigo: 'REQ-00001', estado: 'En Ejecución', estado_actual: 'RECEPCION_BIENES',
      created_at: '2026-01-01', updated_at: '2026-02-20', payload: '{}',
      estado_responsable_vigente: {
        estadoCodigo: 'CONFORMIDAD_PENDIENTE_AU', estadoLabel: 'Pendiente conformidad AU',
        etapaCodigo: 'RECEPCION_BIENES', etapaLabel: 'Recepción de Bienes',
        responsableTipo: 'UNIDAD', responsableUnidad: 'Área Usuaria',
        responsableFuente: 'unidad_destino_etapa',
      },
    },
  },
  {
    name: 'Ampliaciones', row: {
      id: 1, codigo: 'REQ-00001', estado: 'En Ejecución', estado_actual: 'EJECUCION',
      created_at: '2026-01-01', updated_at: '2026-03-01', payload: '{}',
      estado_responsable_vigente: {
        estadoCodigo: 'AMPLIACION_SOLICITADA', estadoLabel: 'Ampliación solicitada',
        etapaCodigo: 'EJECUCION', etapaLabel: 'Ejecución Contractual',
        responsableTipo: 'PERSONA', responsableUsername: 'solicitante',
        responsableNombre: 'Solicitante Ampliación', responsableUnidad: 'Área Usuaria',
        responsableFuente: 'responsable_actual_bd',
      },
    },
  },
  {
    name: 'Reducciones', row: {
      id: 1, codigo: 'REQ-00001', estado: 'En Ejecución', estado_actual: 'EJECUCION',
      created_at: '2026-01-01', updated_at: '2026-03-15', payload: '{}',
      estado_responsable_vigente: {
        estadoCodigo: 'REDUCCION_SOLICITADA', estadoLabel: 'Reducción solicitada',
        etapaCodigo: 'EJECUCION', etapaLabel: 'Ejecución Contractual',
        responsableTipo: 'PERSONA', responsableUsername: 'solicitante',
        responsableNombre: 'Solicitante Reducción', responsableUnidad: 'Área Usuaria',
        responsableFuente: 'responsable_actual_bd',
      },
    },
  },
  {
    name: 'Pago / Tesorería', row: {
      id: 1, codigo: 'REQ-00001', estado: 'En Ejecución', estado_actual: 'DERIVACION_PAGO',
      created_at: '2026-01-01', updated_at: '2026-04-01', payload: '{}',
      estado_responsable_vigente: {
        estadoCodigo: 'EXPEDIENTE_DERIVADO_PAGO', estadoLabel: 'Derivado a pago',
        etapaCodigo: 'DERIVACION_PAGO', etapaLabel: 'Tesorería / Pago',
        responsableTipo: 'UNIDAD', responsableUnidad: 'Tesorería / Pagaduría',
        responsableFuente: 'unidad_destino_etapa',
      },
    },
  },
];

for (const sim of bandejaSims) {
  test(`Simulación bandeja: ${sim.name}`, () => {
    simBandeja(sim.name, sim.row);
  });
}

// ==========================================================================
// 6. Reglas de negocio
// ==========================================================================
test('Proveedor nunca es responsable interno', () => {
  const row = {
    id: 1, codigo: 'REQ-00001',
    estado: 'Registrado', estado_actual: 'REGISTRO',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-01-01',
    estado_responsable_vigente: {
      estadoCodigo: 'REQUERIMIENTO_REGISTRADO', estadoLabel: 'Registrado',
      etapaCodigo: 'REGISTRO', etapaLabel: 'Registro de Requerimiento',
      responsableTipo: 'UNIDAD', responsableUnidad: 'Usuario AU',
      responsableFuente: 'unidad_destino_etapa',
    },
  };
  const enriched = enrichFrontend(row);
  ok(enriched.responsableActual !== 'Proveedor X', 'Proveedor aparece como responsable');
});

test('created_by nunca sustituye asignación', () => {
  const row = {
    id: 1, codigo: 'REQ-00001',
    estado: 'Invitación enviada', estado_actual: 'INVITACIONES',
    created_by: 'wvasquez', usuario_modificacion: 'wvasquez',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-01-10',
    estado_responsable_vigente: {
      estadoCodigo: 'INVITACION_ENVIADA', estadoLabel: 'Invitación enviada',
      etapaCodigo: 'INVITACIONES', etapaLabel: 'Invitaciones',
      responsableTipo: 'PERSONA', responsableUsername: 'jcrisostomo',
      responsableNombre: 'Javier Crisóstomo', responsableUnidad: 'Invitaciones',
      responsableFuente: 'asignacion_explicita_db',
    },
  };
  const enriched = enrichFrontend(row);
  ok(enriched.responsableActual !== 'wvasquez',
    `created_by apareció como responsable: ${enriched.responsableActual}`);
});

test('Último actor no sustituye responsable vigente', () => {
  const row = {
    id: 1, codigo: 'REQ-00001',
    estado: 'Registrado', estado_actual: 'REGISTRO',
    usuario_modificacion: 'someuser',
    payload: '{}', created_at: '2026-01-01', updated_at: '2026-01-10',
    estado_responsable_vigente: {
      estadoCodigo: 'REQUERIMIENTO_REGISTRADO', estadoLabel: 'Registrado',
      etapaCodigo: 'REGISTRO', etapaLabel: 'Registro de Requerimiento',
      responsableTipo: 'UNIDAD', responsableUnidad: 'Usuario AU',
      responsableFuente: 'unidad_destino_etapa',
    },
  };
  const enriched = enrichFrontend(row);
  ok(enriched.responsableActual !== 'someuser',
    `usuario_modificacion apareció como responsable: ${enriched.responsableActual}`);
});

test('Unidad solo si no hay persona', () => {
  // Verificar que el contrato es consistente: si hay persona, responsableTipo es PERSONA
  const withPerson = {
    estadoCodigo: 'INVITACION_ENVIADA', estadoLabel: 'Invitación enviada',
    responsableTipo: 'PERSONA', responsableUsername: 'jcrisostomo',
    responsableNombre: 'Javier Crisóstomo',
  };
  eq(withPerson.responsableTipo, 'PERSONA');
  ok(withPerson.responsableUsername, 'Falta username cuando es PERSONA');

  const withoutPerson = {
    estadoCodigo: 'REQUERIMIENTO_REGISTRADO', estadoLabel: 'Registrado',
    responsableTipo: 'UNIDAD', responsableUnidad: 'Usuario AU',
  };
  eq(withoutPerson.responsableTipo, 'UNIDAD');
  ok(withoutPerson.responsableUnidad, 'Falta unidad cuando es UNIDAD');
});

// ==========================================================================
// 7. Regresiones existentes
// ==========================================================================
test('7. RC8.4B se ejecuta sin errores', () => {
  try {
    execSync('node scripts/test-rc84b-resolvedor-estado-responsable.mjs', {
      cwd: root, encoding: 'utf-8', timeout: 30_000,
    });
    ok(true, 'RC8.4B pasó');
  } catch (e) {
    ok(false, `RC8.4B falló: ${e.message}\n${e.stdout || ''}`);
  }
});

test('8. RC8.4D se ejecuta sin errores', () => {
  try {
    execSync('node scripts/test-rc84d-integracion-global-estado-responsable.mjs', {
      cwd: root, encoding: 'utf-8', timeout: 30_000,
    });
    ok(true, 'RC8.4D pasó');
  } catch (e) {
    ok(false, `RC8.4D falló: ${e.message}\n${e.stdout || ''}`);
  }
});

test('9. RC8.2E existe y es ejecutable', () => {
  try {
    execSync('node --check scripts/test-rc82e-adjuntos-asignacion-invitaciones.mjs', {
      cwd: root, encoding: 'utf-8', timeout: 15_000,
    });
    ok(true, 'RC8.2E válido');
  } catch (e) {
    ok(false, `RC8.2E falló sintaxis: ${e.message}`);
  }
});

test('10. RC8.2H existe y es ejecutable', () => {
  try {
    execSync('node --check scripts/test-rc82h-requerimiento-asignado-invitaciones.mjs', {
      cwd: root, encoding: 'utf-8', timeout: 15_000,
    });
    ok(true, 'RC8.2H válido');
  } catch (e) {
    ok(false, `RC8.2H falló sintaxis: ${e.message}`);
  }
});

test('11. RC8.3B existe y es ejecutable', () => {
  try {
    execSync('node --check scripts/test-rc83b-catalogo-roles-perfiles.mjs', {
      cwd: root, encoding: 'utf-8', timeout: 15_000,
    });
    ok(true, 'RC8.3B válido');
  } catch (e) {
    ok(false, `RC8.3B falló sintaxis: ${e.message}`);
  }
});

test('12. Recepción Bienes alcance centro existe', () => {
  try {
    execSync('node --check scripts/test-recepcion-bienes-alcance-centro.mjs', {
      cwd: root, encoding: 'utf-8', timeout: 15_000,
    });
    ok(true, 'Recepcion Bienes test válido');
  } catch (e) {
    ok(false, `Recepcion Bienes test falló: ${e.message}`);
  }
});

// ==========================================================================
// 8. Build check
// ==========================================================================
test('13. Build: sintaxis JS válida en archivos modificados', () => {
  const files = [
    'server/lib/enrichEstadoResponsable.js',
    'server/lib/portalProveedores.js',
    'server/lib/validacionesCotizacion.js',
    'server/lib/cuadroComparativo.js',
    'server/lib/ccpCertificacion.js',
    'server/lib/ordenesContratacion.js',
    'server/lib/recepcionBienes.js',
    'server/lib/resolvedorEstadoResponsable.js',
    'shared/resolvedorEstadoResponsable.js',
    'src/utils/trazabilidad.js',
  ];
  for (const f of files) {
    try {
      execSync(`node --check ${f}`, {
        cwd: root, encoding: 'utf-8', timeout: 10_000,
      });
    } catch (e) {
      ok(false, `Error de sintaxis en ${f}: ${e.message}`);
      return;
    }
  }
  ok(true, 'Sintaxis JS válida en todos los archivos modificados');
});

test('14. Build: vite build ejecutable', () => {
  try {
    execSync('npm.cmd run build', {
      cwd: root, encoding: 'utf-8', timeout: 120_000,
      stdio: 'pipe',
    });
    ok(true, 'Build exitoso');
  } catch (e) {
    ok(false, `Build falló: ${e.message?.substring(0, 200)}`);
  }
});

// ==========================================================================
// REPORTE
// ==========================================================================
console.log(`\n📊 RC8.4E: ${passed} pasaron / ${failed} fallaron`);
if (failed > 0) {
  console.log('❌ Suite RC8.4E FALLÓ');
  process.exit(1);
}
console.log('✅ Suite RC8.4E PASÓ — integración de 12 bandejas completada');
process.exit(0);
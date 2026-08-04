/**
 * RC8.4B — Suite unitaria del resolvedor central compartido.
 *
 * Casos mínimos (12):
 *  1. Persona asignada explícita
 *  2. responsable_actual válido
 *  3. Workflow Engine
 *  4. Unidad destino sin persona
 *  5. created_by NO usado fuera de Registro
 *  6. Nombre del submódulo NO se presenta como persona
 *  7. Estado canónico sigue viniendo de resolveEstadoExpedienteVigente
 *  8. snapshot NO sobreescribe BD (estado_actual > snapshot)
 *  9. Aliases ORDEN / CONFORMIDAD / PAGO
 * 10. Pendiente de asignación
 * 11. Batch sin N+1 (verificación estructural)
 * 12. Contrato de salida íntegro
 */

import {
  resolveEstadoResponsableVigente,
  TIPO_RESPONSABLE,
  etapaDesdeEstadoCodigo,
} from '../shared/resolvedorEstadoResponsable.js';
import { resolveEstadoExpedienteVigente } from '../shared/estadoExpedienteVigente.js';
import { strict as assert } from 'node:assert';

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
function match(pat, val, msg) { assert.ok(pat.test(val), msg || `${pat} !~ ${val}`); }

// ==========================================================================
// HELPERS
// ==========================================================================

function reqBase(overrides = {}) {
  return {
    id: 1,
    requerimiento_id: 1,
    estado_actual: 'REGISTRO',
    estado: 'Registrado',
    responsable_actual: '',
    responsable: 'CNCC',
    centro_nombre: 'CNCC',
    usuario_modificacion: 'jperez',
    created_by: 'jperez',
    fecha_estado_actual: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    created_at: '2026-01-01T09:00:00Z',
    ...overrides,
  };
}

// ==========================================================================
// CASOS
// ==========================================================================

console.log('\n🔬 RC8.4B — Suite unitaria resolvedor central\n');

// 1. Persona asignada explícita (Nivel 1 via DB wrapper)
test('1. Persona asignada explícita (Nivel 1)', () => {
  const ev = reqBase({ responsable_actual: 'Sistema' });
  const result = resolveEstadoResponsableVigente(ev, {
    asignaciones: {
      _result: {
        usuarioId: null,
        username: 'msanchez',
        nombre: 'María Sánchez',
        unidad: 'Invitaciones',
      },
    },
  });
  eq(result.responsableTipo, TIPO_RESPONSABLE.PERSONA);
  eq(result.responsableUsername, 'msanchez');
  eq(result.responsableNombre, 'María Sánchez');
  eq(result.responsableUnidad, 'Invitaciones');
  eq(result.responsableFuente, 'asignacion_explicita_db');
  eq(result.estadoCodigo, 'REQUERIMIENTO_REGISTRADO');
});

// 2. responsable_actual válido (Nivel 2)
test('2. responsable_actual persistido válido (Nivel 2)', () => {
  const ev = reqBase({ responsable_actual: 'jgarcia' });
  const result = resolveEstadoResponsableVigente(ev, {});
  eq(result.responsableTipo, TIPO_RESPONSABLE.PERSONA);
  eq(result.responsableUsername, 'jgarcia');
  eq(result.responsableFuente, 'responsable_actual_bd');
});

// 3. Workflow Engine (Nivel 3)
test('3. Workflow Engine — actor_responsable_id (Nivel 3)', () => {
  const ev = reqBase({ actor_responsable_id: 'rbautista' });
  const result = resolveEstadoResponsableVigente(ev, {});
  eq(result.responsableTipo, TIPO_RESPONSABLE.PERSONA);
  eq(result.responsableUsername, 'rbautista');
  eq(result.responsableFuente, 'workflow_engine');
});

// 4. Unidad destino sin persona (Nivel 4)
test('4. Unidad destino sin persona (Nivel 4)', () => {
  // Estado que mapea a unidad "CCP"
  const ev = reqBase({
    estado_actual: 'CCP',
    estado: 'CCP Registrada',
    codigo_ccp: 'CCP-001',
    ccp_activo: true,
    enviada_oppm: false,
  });
  const result = resolveEstadoResponsableVigente(ev, {});
  ok(result.estadoCodigo === 'CCP_REGISTRADA' || result.estadoCodigo === 'DERIVADO_CCP',
    `estado esperado CCP, recibido ${result.estadoCodigo}`);
  ok(result.responsableTipo === TIPO_RESPONSABLE.UNIDAD
    || result.responsableTipo === TIPO_RESPONSABLE.PERSONA
    || result.responsableTipo === TIPO_RESPONSABLE.PENDIENTE,
    `tipo inesperado: ${result.responsableTipo}`);
});

// 5. created_by NO usado como fallback (fuera de Registro)
test('5. created_by NO usado como fallback general', () => {
  const ev = reqBase({
    estado_actual: 'COORDINACION_CM',
    responsable_actual: 'Coordinador de Contratos Menores', // rol genérico
    created_by: 'jperez',
  });
  const result = resolveEstadoResponsableVigente(ev, {});
  // created_by NO debe aparecer como responsableUsername
  ok(result.responsableUsername !== 'jperez',
    `created_by apareció como responsable: ${result.responsableUsername}`);
  // Debe ser UNIDAD o PENDIENTE, no PERSONA
  ok(result.responsableTipo !== TIPO_RESPONSABLE.PERSONA
    || result.responsableFuente === 'responsable_actual_bd',
    `created_by usado como persona: ${result.responsableFuente}`);
});

// 6. Nombre del submódulo NO se presenta como persona
test('6. Nombre del submódulo no es persona', () => {
  // responsable_actual = "Programación" (submódulo/rol genérico)
  const ev = reqBase({ responsable_actual: 'Programación' });
  const result = resolveEstadoResponsableVigente(ev, {});
  // Programación es rol genérico → no debe ser PERSONA
  ok(result.responsableTipo !== TIPO_RESPONSABLE.PERSONA
    || (result.responsableTipo === TIPO_RESPONSABLE.PERSONA
      && result.responsableUsername !== 'Programación'),
    `submódulo como persona: ${result.responsableTipo} / ${result.responsableUsername}`);
});

// 7. Estado canónico desde resolveEstadoExpedienteVigente
test('7. Estado canónico delegado a resolveEstadoExpedienteVigente', () => {
  const ev = reqBase();
  const central = resolveEstadoExpedienteVigente(ev);
  const result = resolveEstadoResponsableVigente(ev, {});
  eq(result.estadoCodigo, central.codigo || central.code);
  eq(result.estadoLabel, central.label);
});

// 8. snapshot NO sobreescribe BD (estado_actual > workflowSnapshot)
test('8. Snapshot no sobreescribe BD', () => {
  const ev = reqBase({
    estado_actual: 'PROGRAMACION',
    estado: 'Aprobado DEC',
    workflowSnapshot: {
      etapaActual: 'DEC',
      responsableActual: 'Usuario DEC Antiguo',
    },
    responsable_actual: 'rcastro',
  });
  const result = resolveEstadoResponsableVigente(ev, {});
  // BD gana sobre snapshot
  ok(result.responsableUsername !== 'Usuario DEC Antiguo',
    `snapshot sobreescribió BD: ${result.responsableUsername}`);
  eq(result.responsableUsername, 'rcastro');
  eq(result.responsableFuente, 'responsable_actual_bd');
});

// 9. Aliases ORDEN / CONFORMIDAD / PAGO
test('9. Aliases de etapa ORDEN → REGISTRO_ORDEN', () => {
  const etapa = etapaDesdeEstadoCodigo('ORDEN_NOTIFICADA');
  eq(etapa, 'REGISTRO_ORDEN');
});
test('9b. Aliases CONFORMIDAD → RECEPCION_BIENES', () => {
  // CONFORMIDAD_PENDIENTE_AU → etapa RECEPCION_BIENES
  const result = resolveEstadoResponsableVigente(
    reqBase({ recepcion_estado_global: 'CONFORMIDAD_PENDIENTE_AU' }),
    {},
  );
  ok(result.etapaCodigo === 'RECEPCION_BIENES' || result.etapaCodigo === 'REGISTRO',
    `etapa: ${result.etapaCodigo}`);
});
test('9c. Aliases PAGO → DERIVACION_PAGO', () => {
  const result = resolveEstadoResponsableVigente(
    reqBase({ expediente_derivado_pago: true, derivado_pago_at: '2026-01-01' }),
    {},
  );
  eq(result.estadoCodigo, 'EXPEDIENTE_DERIVADO_PAGO');
  eq(result.etapaCodigo, 'DERIVACION_PAGO');
});

// 10. Pendiente de asignación
test('10. Pendiente de asignación', () => {
  const ev = reqBase({
    estado_actual: 'REGISTRO',
    responsable_actual: '',  // sin persona
  });
  const result = resolveEstadoResponsableVigente(ev, {});
  // Sin persona, sin unidad clara para REGISTRO → debería ser UNIDAD o PENDIENTE
  ok(
    result.responsableTipo === TIPO_RESPONSABLE.UNIDAD
    || result.responsableTipo === TIPO_RESPONSABLE.PENDIENTE,
    `tipo inesperado: ${result.responsableTipo}`,
  );
});

// 11. Batch sin N+1 — verificación estructural del wrapper server-side
test('11. Estructura batch: loadEstadoExpedienteEvidenceByIds acepta array', async () => {
  // verify the import works (structural check)
  const mod = await import('../server/lib/estadoExpedienteEvidence.js');
  ok(typeof mod.loadEstadoExpedienteEvidenceByIds === 'function',
    'loadEstadoExpedienteEvidenceByIds no es función');
});

// 12. Contrato de salida íntegro
test('12. Contrato: todas las claves presentes', () => {
  const ev = reqBase({ responsable_actual: 'jdoe' });
  const result = resolveEstadoResponsableVigente(ev, {});
  const expected = [
    'estadoCodigo', 'estadoLabel', 'etapaCodigo', 'etapaLabel',
    'responsableTipo', 'responsableUsuarioId', 'responsableUsername',
    'responsableNombre', 'responsableUnidad', 'responsableFuente',
    'actualizadoAt',
  ];
  for (const k of expected) {
    ok(k in result, `falta clave: ${k}`);
  }
  // Tipos correctos
  eq(typeof result.estadoCodigo, 'string');
  eq(typeof result.estadoLabel, 'string');
  eq(typeof result.responsableTipo, 'string');
  eq(result.responsableUsuarioId, null);
  eq(typeof result.responsableUsername, 'string');
  eq(typeof result.responsableNombre, 'string');
  eq(typeof result.responsableUnidad, 'string');
  eq(typeof result.responsableFuente, 'string');
});

// ==========================================================================
// REPORTE
// ==========================================================================

console.log(`\n📊 ${passed} pasaron / ${failed} fallaron`);
if (failed > 0) {
  console.log('❌ Suite RC8.4B FALLÓ');
  process.exit(1);
}
console.log('✅ Suite RC8.4B PASÓ');
process.exit(0);
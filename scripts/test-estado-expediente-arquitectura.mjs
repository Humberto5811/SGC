/**
 * Pruebas unitarias — arquitectura central de estados del expediente.
 */
import assert from 'node:assert/strict';
import {
  normalizeEstadoCode,
  getPrioridad,
  getLabelEstado,
  clearUnknownEstadoCodes,
  getUnknownEstadoCodes,
} from '../shared/estadoExpedienteCatalog.js';
import {
  resolveEstadoExpedienteVigente,
  normalizeEstadoFlags,
} from '../shared/estadoExpedienteVigente.js';
import { presentEstadoExpediente } from '../src/utils/estadoExpedientePresenter.js';
import { validateEstadoTransition } from '../shared/validateEstadoTransition.js';

function ok(name) {
  console.log(`  ✓ ${name}`);
}

clearUnknownEstadoCodes();

console.log('1. Catálogo / aliases');
assert.equal(normalizeEstadoCode('ORDEN_ENVIADA'), 'ORDEN_NOTIFICADA');
assert.equal(normalizeEstadoCode('ORDEN_ENVIADA_PROVEEDOR'), 'ORDEN_NOTIFICADA');
assert.equal(normalizeEstadoCode('ENVIADO_PROVEEDOR'), 'ORDEN_NOTIFICADA');
assert.equal(normalizeEstadoCode('ORDEN_NOTIFICADA_PROVEEDOR'), 'ORDEN_NOTIFICADA');
assert.equal(normalizeEstadoCode('CCP_REGISTRADO'), 'CCP_REGISTRADA');
assert.equal(normalizeEstadoCode('CCP_CARGADO'), 'CCP_REGISTRADA');
assert.equal(getLabelEstado('CCP_REGISTRADA'), 'CCP registrada');
assert.equal(getLabelEstado('ORDEN_NOTIFICADA'), 'Orden notificada');
ok('aliases canónicos');

console.log('2. Solo CCP_REGISTRADA');
{
  const v = resolveEstadoExpedienteVigente({ codigo_ccp: 'CCP-001', ccp_activo: true });
  assert.equal(v.codigo, 'CCP_REGISTRADA');
  assert.equal(v.label, 'CCP registrada');
  ok('solo CCP');
}

console.log('3. CCP + ORDEN_REGISTRADA');
{
  const v = resolveEstadoExpedienteVigente({
    codigo_ccp: 'CCP-001',
    ccp_activo: true,
    orden_id: 10,
    orden_estado: 'ORDEN_REGISTRADA',
  });
  assert.equal(v.codigo, 'ORDEN_REGISTRADA');
  assert.notEqual(v.codigo, 'CCP_REGISTRADA');
  ok('orden registrada supera CCP');
}

console.log('4. CCP + ORDEN_NOTIFICADA');
{
  const v = resolveEstadoExpedienteVigente({
    codigo_ccp: 'CCP-001',
    ccp_activo: true,
    orden_id: 10,
    orden_estado: 'ORDEN_NOTIFICADA',
    enviado_proveedor_at: '2026-07-20T12:00:00Z',
  });
  assert.equal(v.codigo, 'ORDEN_NOTIFICADA');
  assert.equal(v.label, 'Orden notificada');
  ok('orden notificada supera CCP');
}

console.log('5. Código histórico ORDEN_ENVIADA');
{
  const v = resolveEstadoExpedienteVigente({
    codigo_ccp: 'X',
    orden_estado: 'ORDEN_ENVIADA',
  });
  assert.equal(v.codigo, 'ORDEN_NOTIFICADA');
  ok('alias ORDEN_ENVIADA');
}

console.log('6. Timestamp notificación sin código');
{
  const v = resolveEstadoExpedienteVigente({
    codigo_ccp: 'X',
    ccp_activo: true,
    enviado_proveedor_at: '2026-07-20T12:00:00Z',
  });
  assert.equal(v.codigo, 'ORDEN_NOTIFICADA');
  ok('timestamp → ORDEN_NOTIFICADA');
}

console.log('7. ORDEN_RESUELTA terminal');
{
  const v = resolveEstadoExpedienteVigente({
    codigo_ccp: 'X',
    orden_estado: 'ORDEN_NOTIFICADA',
    enviado_proveedor_at: '2026-07-20',
    orden_resuelta: true,
  });
  assert.equal(v.codigo, 'ORDEN_RESUELTA');
  assert.equal(v.label, 'Orden resuelta');
  assert.ok(getPrioridad('ORDEN_RESUELTA') > getPrioridad('ORDEN_NOTIFICADA'));
  ok('ORDEN_RESUELTA terminal');
}

console.log('8. EXPEDIENTE_DERIVADO_PAGO');
{
  const v = resolveEstadoExpedienteVigente({
    codigo_ccp: 'X',
    enviado_proveedor_at: '2026-07-20',
    expediente_derivado_pago: true,
  });
  assert.equal(v.codigo, 'EXPEDIENTE_DERIVADO_PAGO');
  assert.equal(v.label, 'Expediente derivado a pago');
  ok('derivado a pago');
}

console.log('9. Observado en Coordinación CM');
{
  const v = resolveEstadoExpedienteVigente({
    estado_cuadro: 'OBSERVADO_COORDINADOR',
  });
  assert.equal(v.codigo, 'CUADRO_EN_COORDINACION_CM');
  assert.equal(v.situacion?.codigo, 'OBSERVADO');
  assert.match(v.label, /Observado/i);
  ok('situación OBSERVADO en CM');
}

console.log('10. Observado en DEC');
{
  const v = resolveEstadoExpedienteVigente({
    estado_cuadro: 'OBSERVADO_DEC',
  });
  assert.equal(v.codigo, 'CUADRO_EN_DEC');
  assert.equal(v.situacion?.codigo, 'OBSERVADO');
  assert.match(v.label, /DEC.*Observado|Observado/i);
  ok('situación OBSERVADO en DEC');
}

console.log('11. Estado interno no reemplaza global');
{
  const v = resolveEstadoExpedienteVigente({
    codigo_ccp: 'X',
    ccp_activo: true,
    estado_interno: 'CRONOGRAMA_INCOMPLETO',
  });
  assert.equal(v.codigo, 'CCP_REGISTRADA');
  ok('interno no gana');
}

console.log('12. Código desconocido');
{
  clearUnknownEstadoCodes();
  const n = normalizeEstadoCode('ESTADO_XYZ_INEXISTENTE');
  assert.equal(n, 'ESTADO_XYZ_INEXISTENTE');
  assert.ok(getUnknownEstadoCodes().includes('ESTADO_XYZ_INEXISTENTE'));
  ok('desconocido registrado');
}

console.log('13. Flags contradictorios → gana el más avanzado');
{
  const flags = normalizeEstadoFlags({
    ccp_activo: true,
    codigo_ccp: 'C1',
    orden_estado: 'ORDEN_NOTIFICADA',
    enviado_proveedor_at: null,
  });
  assert.equal(flags.ccpRegistrada, true);
  assert.equal(flags.ordenNotificada, true);
  const v = resolveEstadoExpedienteVigente({
    ccp_activo: true,
    codigo_ccp: 'C1',
    orden_estado: 'ORDEN_NOTIFICADA',
  });
  assert.equal(v.codigo, 'ORDEN_NOTIFICADA');
  ok('contradictorios resueltos por prioridad');
}

console.log('14. Acción idempotente');
{
  const t = validateEstadoTransition({
    estadoActual: 'ORDEN_NOTIFICADA',
    estadoDestino: 'ORDEN_NOTIFICADA',
    accion: 'NOTIFICAR',
  });
  assert.equal(t.ok, true);
  assert.equal(t.idempotent, true);
  ok('idempotencia');
}

console.log('15. Terminal con evidencia anterior');
{
  const v = resolveEstadoExpedienteVigente({
    orden_resuelta: true,
    codigo_ccp: 'C',
    enviado_proveedor_at: '2026-01-01',
    estado_cuadro: 'APROBADO_DEC',
  });
  assert.equal(v.codigo, 'ORDEN_RESUELTA');
  const t = validateEstadoTransition({
    estadoActual: 'ORDEN_RESUELTA',
    estadoDestino: 'ORDEN_NOTIFICADA',
  });
  assert.equal(t.ok, false);
  ok('terminal bloquea retroceso');
}

console.log('16. Presentador no fuerza CCP');
{
  const v = resolveEstadoExpedienteVigente({
    ccp_activo: true,
    codigo_ccp: 'C',
    enviado_proveedor_at: '2026-07-20',
  });
  const p = presentEstadoExpediente(v.estadoVigente, v.situacion);
  assert.equal(p.label, 'Orden notificada');
  assert.equal(p.dataEstado, 'ORDEN_NOTIFICADA');
  ok('presentador usa contrato');
}

console.log('17. Prioridades obligatorias');
assert.ok(getPrioridad('ORDEN_RESUELTA') > getPrioridad('EXPEDIENTE_DERIVADO_PAGO'));
assert.ok(getPrioridad('EXPEDIENTE_DERIVADO_PAGO') > getPrioridad('ORDEN_NOTIFICADA'));
assert.ok(getPrioridad('ORDEN_NOTIFICADA') > getPrioridad('ORDEN_REGISTRADA'));
assert.ok(getPrioridad('ORDEN_REGISTRADA') > getPrioridad('CCP_REGISTRADA'));
assert.ok(getPrioridad('CCP_REGISTRADA') > getPrioridad('CUADRO_COMPARATIVO_APROBADO'));
ok('cadena de prioridades');

console.log('\nOK — test-estado-expediente-arquitectura');

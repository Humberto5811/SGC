/**
 * RC104 — Propagación del estado global del expediente en todas las bandejas.
 * Simula evidencias y verifica que el resolvedor central produce el mismo
 * estadoVigente independientemente del módulo consumidor.
 */
import assert from 'node:assert/strict';
import { resolveEstadoExpedienteVigente } from '../shared/estadoExpedienteVigente.js';
import { presentEstadoExpediente } from '../src/utils/estadoExpedientePresenter.js';
import { buildEstadoVisual } from '../src/utils/estadoVisualPresenter.js';
import { estadoExpedienteRecepcion } from '../src/utils/recepcionCotizacionUtils.js';
import { estadoExpedienteValidacion } from '../src/utils/validacionesUtils.js';

const MODULOS = [
  'Registro de Requerimiento',
  'Evaluación',
  'DEC',
  'Programación',
  'Coordinación CM',
  'Invitaciones',
  'Consultas',
  'Recepción de Cotizaciones',
  'Validaciones',
  'Cuadro Comparativo',
  'CCP',
  'Registro de Órdenes',
];

function assertSameInAllModules(evidence, expectedCodigo, expectedLabel, caso) {
  const results = [];
  for (const modulo of MODULOS) {
    const v = resolveEstadoExpedienteVigente({ ...evidence, _modulo: modulo });
    results.push({ modulo, codigo: v.codigo, label: v.label, prioridad: v.prioridad });
    assert.equal(
      v.codigo,
      expectedCodigo,
      `${caso} / ${modulo}: esperado ${expectedCodigo}, obtuvo ${v.codigo}`,
    );
    assert.equal(
      v.label,
      expectedLabel,
      `${caso} / ${modulo}: label esperado "${expectedLabel}", obtuvo "${v.label}"`,
    );
  }
  // Presentadores FE no deben divergir
  const v = resolveEstadoExpedienteVigente(evidence);
  const p = presentEstadoExpediente(v.estadoVigente, v.situacion);
  assert.equal(p.label, expectedLabel, `${caso}: presentador`);

  const visual = buildEstadoVisual({
    id: 1,
    estado_actual: 'CCP',
    ...evidence,
  });
  assert.equal(visual.textoPrincipal, expectedLabel, `${caso}: estadoVisualPresenter`);

  const rec = estadoExpedienteRecepcion([], evidence);
  if (rec.estadoVigente || rec.validacion_estado === expectedCodigo) {
    assert.equal(rec.label, expectedLabel, `${caso}: recepción`);
  }

  const val = estadoExpedienteValidacion([], evidence);
  if (val.estadoVigente || val.validacion_estado === expectedCodigo) {
    assert.equal(val.label, expectedLabel, `${caso}: validaciones`);
  }

  console.log(`  ✓ ${caso}: ${expectedCodigo} en ${MODULOS.length} módulos`);
  return results;
}

console.log('RC104 — Estado global uniforme\n');

// CASO A — Cuadro aprobado + CCP + orden registrada + orden notificada
assertSameInAllModules({
  estado_cuadro: 'APROBADO_DEC',
  codigo_ccp: 'CCP-A-001',
  ccp_activo: true,
  orden_id: 101,
  orden_estado: 'ORDEN_NOTIFICADA',
  enviado_proveedor_at: '2026-07-22T10:00:00Z',
}, 'ORDEN_NOTIFICADA', 'Orden notificada', 'CASO A');

// CASO B — Solo hasta CCP
assertSameInAllModules({
  estado_cuadro: 'APROBADO_DEC',
  codigo_ccp: 'CCP-B-001',
  ccp_activo: true,
}, 'CCP_REGISTRADA', 'CCP registrada', 'CASO B');

// CASO C — Orden resuelta
assertSameInAllModules({
  codigo_ccp: 'CCP-C-001',
  ccp_activo: true,
  orden_id: 202,
  orden_estado: 'ORDEN_NOTIFICADA',
  enviado_proveedor_at: '2026-07-01',
  orden_resuelta: true,
}, 'ORDEN_RESUELTA', 'Orden resuelta', 'CASO C');

// CASO D — Expediente derivado a pago
assertSameInAllModules({
  codigo_ccp: 'CCP-D-001',
  ccp_activo: true,
  orden_id: 303,
  enviado_proveedor_at: '2026-07-01',
  expediente_derivado_pago: true,
  derivado_pago_at: '2026-07-15',
}, 'EXPEDIENTE_DERIVADO_PAGO', 'Expediente derivado a pago', 'CASO D');

// Extra: nunca CCP si hay orden
{
  const v = resolveEstadoExpedienteVigente({
    ccp_activo: true,
    codigo_ccp: 'X',
    orden_id: 1,
    orden_estado: 'ORDEN_REGISTRADA',
  });
  assert.notEqual(v.codigo, 'CCP_REGISTRADA');
  assert.equal(v.codigo, 'ORDEN_REGISTRADA');
  console.log('  ✓ Extra: CCP no gana a ORDEN_REGISTRADA');
}

// CASO E — Recepción de bienes pendiente supera ORDEN_NOTIFICADA
assertSameInAllModules({
  codigo_ccp: 'CCP-E-001',
  ccp_activo: true,
  orden_id: 404,
  orden_estado: 'ORDEN_NOTIFICADA',
  enviado_proveedor_at: '2026-07-20',
  recepcion_estado_global: 'RECEPCION_BIENES_PENDIENTE',
  recepcion_bienes_expediente_id: 1,
}, 'RECEPCION_BIENES_PENDIENTE', 'OC pendiente de recepción', 'CASO E');

// CASO F — Recibido por almacén
assertSameInAllModules({
  codigo_ccp: 'CCP-F-001',
  ccp_activo: true,
  orden_id: 405,
  enviado_proveedor_at: '2026-07-20',
  recepcion_estado_global: 'BIEN_RECIBIDO_ALMACEN',
  recepcion_bienes_expediente_id: 2,
}, 'BIEN_RECIBIDO_ALMACEN', 'Recibido por almacén', 'CASO F');

// CASO G — Conformidad pendiente AU
assertSameInAllModules({
  codigo_ccp: 'CCP-G-001',
  ccp_activo: true,
  orden_id: 406,
  enviado_proveedor_at: '2026-07-20',
  recepcion_estado_global: 'CONFORMIDAD_PENDIENTE_AU',
  recepcion_bienes_expediente_id: 3,
}, 'CONFORMIDAD_PENDIENTE_AU', 'Conformidad pendiente AU', 'CASO G');

// CASO H — Conformidad en Coordinación CM
assertSameInAllModules({
  codigo_ccp: 'CCP-H-001',
  ccp_activo: true,
  orden_id: 407,
  enviado_proveedor_at: '2026-07-20',
  recepcion_estado_global: 'CONFORMIDAD_EN_COORDINACION_CM',
  recepcion_bienes_expediente_id: 4,
}, 'CONFORMIDAD_EN_COORDINACION_CM', 'Conformidad en Coordinación CM', 'CASO H');

console.log('\nRC104 OK\n');

console.log('\nOK — test-rc104-estado-global-expediente');

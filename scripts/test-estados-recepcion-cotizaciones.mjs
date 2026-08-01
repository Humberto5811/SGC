/**
 * Dominio Recepción de Cotizaciones — estados agregados y por cotización.
 */
import assert from 'assert';
import {
  resolveEstadoRecepcion,
  resolveEstadoCotizacion,
  buildEstadoRecepcionContract,
  ESTADOS_RECEPCION,
  ESTADOS_COTIZACION,
} from '../shared/estadoRecepcionCotizaciones.js';
import { consolidarExpedientesRecepcion, labelEstadoCotizacion, labelEstadoRecepcionAgregado } from '../src/utils/recepcionCotizacionUtils.js';

function ok(msg) { console.log('OK', msg); }

console.log('\n=== test-estados-recepcion-cotizaciones ===\n');

// A. Sin cotizaciones + plazo abierto
{
  const r = resolveEstadoRecepcion([], { plazo_abierto: true });
  assert.equal(r.codigo, 'EN_COTIZACION');
  assert.equal(r.label, 'En cotización');
  ok('A: En cotización');
}

// B. Una cotización presentada
{
  const cots = [{ estado: 'COTIZACION_PRESENTADA', validacion_estado: '', fecha_presentacion: '2026-07-31T00:13:00Z' }];
  const r = resolveEstadoRecepcion(cots);
  assert.equal(r.codigo, 'COTIZACIONES_RECIBIDAS');
  assert.equal(r.label, 'Cotizaciones recibidas');
  ok('B: Cotizaciones recibidas (1)');
}

// C. Varias presentadas
{
  const cots = [
    { estado: 'COTIZACION_PRESENTADA', validacion_estado: 'PENDIENTE' },
    { estado: 'COTIZACION_PRESENTADA', validacion_estado: '' },
  ];
  assert.equal(resolveEstadoRecepcion(cots).codigo, 'COTIZACIONES_RECIBIDAS');
  ok('C: Cotizaciones recibidas (N)');
}

// D. Enviadas a validar
{
  const cots = [
    { estado: 'COTIZACION_PRESENTADA', validacion_estado: 'DERIVADA' },
    { estado: 'COTIZACION_PRESENTADA', validacion_estado: 'PENDIENTE' },
  ];
  assert.equal(resolveEstadoRecepcion(cots).codigo, 'ENVIADAS_A_VALIDAR');
  assert.equal(resolveEstadoRecepcion(cots).label, 'Enviadas a validar');
  ok('D: Enviadas a validar');
}

// E. Validadas por usuario
{
  const cots = [
    { estado: 'COTIZACION_PRESENTADA', validacion_estado: 'APTO' },
    { estado: 'COTIZACION_PRESENTADA', validacion_estado: 'NO_APTO' },
  ];
  assert.equal(resolveEstadoRecepcion(cots).codigo, 'VALIDADAS_POR_USUARIO');
  ok('E: Validadas por usuario');
}

// F. Modal proveedores → Cotización presentada
{
  const cot = resolveEstadoCotizacion({ estado: 'COTIZACION_PRESENTADA', validacion_estado: '' });
  assert.equal(cot.codigo, 'COTIZACION_PRESENTADA');
  assert.equal(cot.label, 'Cotización presentada');
  assert.equal(labelEstadoCotizacion({ estado: 'COTIZACION_PRESENTADA' }), 'Cotización presentada');
  ok('F: modal Cotización presentada');
}

// G. Detalle individual
{
  const contract = buildEstadoRecepcionContract({
    cotizacion: { estado: 'COTIZACION_PRESENTADA', validacion_estado: 'PENDIENTE' },
  });
  assert.equal(contract.estado_cotizacion_label, 'Cotización presentada');
  ok('G: detalle Cotización presentada');
}

// H. No mostrar Requerimiento registrado si hay cotización presentada
{
  const rows = consolidarExpedientesRecepcion([{
    id: 1,
    solicitud_id: 2,
    solicitud_codigo: 'SC-00002-2026-INS',
    estado: 'COTIZACION_PRESENTADA',
    validacion_estado: '',
    fecha_presentacion: '2026-08-01T00:13:00.000Z',
    estado_recepcion_codigo: 'COTIZACIONES_RECIBIDAS',
    estado_recepcion_label: 'Cotizaciones recibidas',
    estado_cotizacion_codigo: 'COTIZACION_PRESENTADA',
    estado_cotizacion_label: 'Cotización presentada',
  }]);
  assert.equal(rows.length, 1);
  assert.equal(labelEstadoRecepcionAgregado(rows[0]), 'Cotizaciones recibidas');
  assert.notEqual(rows[0].estado_recepcion_label, 'Requerimiento registrado');
  assert.notEqual(rows[0].estado_recepcion, 'Requerimiento registrado');
  ok('H: bandeja no muestra Requerimiento registrado');
}

// I. Bienes / Servicios / Locación — mismo contrato
{
  for (const tipo of ['Bienes', 'Servicios', 'Locación']) {
    const c = buildEstadoRecepcionContract({
      cotizacion: { estado: 'COTIZACION_PRESENTADA', tipo },
      cotizaciones: [{ estado: 'COTIZACION_PRESENTADA' }],
    });
    assert.equal(c.estado_recepcion_codigo, 'COTIZACIONES_RECIBIDAS', tipo);
    assert.equal(c.estado_cotizacion_codigo, 'COTIZACION_PRESENTADA', tipo);
  }
  ok('I: Bienes/Servicios/Locación mismo contrato');
}

// J. Actualización al presentar → recepción (contrato + sync destino)
{
  const c = buildEstadoRecepcionContract({
    cotizacion: { estado: 'COTIZACION_PRESENTADA', fecha_presentacion: new Date().toISOString() },
    meta: { estado_actual: 'RECEPCION_COTIZACIONES' },
  });
  assert.equal(c.estado_recepcion_codigo, 'COTIZACIONES_RECIBIDAS');
  assert.equal(c.estado_expediente_codigo, 'COTIZACIONES_RECIBIDAS');
  ok('J: expediente en Recepción de Cotizaciones');
}

// Contrato API campos
{
  const c = buildEstadoRecepcionContract({
    cotizacion: { estado: 'COTIZACION_PRESENTADA' },
  });
  for (const k of [
    'estado_expediente_codigo', 'estado_expediente_label',
    'estado_recepcion_codigo', 'estado_recepcion_label',
    'estado_cotizacion_codigo', 'estado_cotizacion_label',
  ]) {
    assert.ok(k in c, `campo ${k}`);
  }
  ok('contrato API explícito');
}

assert.equal(ESTADOS_RECEPCION.COTIZACIONES_RECIBIDAS.label, 'Cotizaciones recibidas');
assert.equal(ESTADOS_COTIZACION.COTIZACION_PRESENTADA.label, 'Cotización presentada');

console.log('\nOK test-estados-recepcion-cotizaciones');

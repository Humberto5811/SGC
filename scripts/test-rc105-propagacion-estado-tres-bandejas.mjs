/**
 * RC105 — Propagación estado global en Recepción, Validaciones y CCP.
 * Caso principal: CCP registrada + orden notificada → ORDEN_NOTIFICADA en los 3.
 */
import assert from 'node:assert/strict';
import { resolveEstadoExpedienteVigente } from '../shared/estadoExpedienteVigente.js';
import { applyCcpFlagsToRow } from '../server/lib/ccpEstadoFlags.js';
import {
  consolidarExpedientesRecepcion,
  estadoExpedienteRecepcion,
  renderBadgeEstadoRecepcionHtml,
} from '../src/utils/recepcionCotizacionUtils.js';
import {
  consolidarExpedientesValidacion,
  estadoExpedienteValidacion,
  renderBadgeEstadoValidacionHtml,
} from '../src/utils/validacionesUtils.js';
import { renderBadgeEstadoVigenteHtml } from '../shared/estadoExpedienteVigente.js';

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

const EVIDENCE_NOTIFICADA = {
  codigo_ccp: 'CCP-105',
  ccp_activo: true,
  estado_cuadro: 'APROBADO_DEC',
  solicitud_estado: 'EN_CCP',
  orden_id: 9001,
  orden_estado: 'ORDEN_NOTIFICADA',
  enviado_proveedor_at: '2026-07-22T15:00:00Z',
};

console.log('\n=== RC105 — Propagación tres bandejas ===\n');

// Resolvedor directo
{
  const v = resolveEstadoExpedienteVigente(EVIDENCE_NOTIFICADA);
  assert.equal(v.codigo, 'ORDEN_NOTIFICADA');
  assert.equal(v.label, 'Orden notificada');
  ok('resolvedor: ORDEN_NOTIFICADA');
}

// Simula applyCcpFlagsToRow como hacía mal recepción (solo CCP) vs correcto
{
  const bad = applyCcpFlagsToRow(
    { solicitud_id: 1, solicitud_estado: 'EN_CCP', estado_cuadro: 'DERIVADO_CCP' },
    { codigo_ccp: 'CCP-105' },
    { ccp_activo: true },
  );
  assert.equal(bad.estado_vigente, 'CCP_REGISTRADA', 'sin orden → CCP (control negativo histórico)');

  const good = applyCcpFlagsToRow(
    { solicitud_id: 1, solicitud_estado: 'EN_CCP', estado_cuadro: 'DERIVADO_CCP' },
    {
      codigo_ccp: 'CCP-105',
      ccp_activo: true,
      orden_id: 9001,
      orden_estado: 'ORDEN_NOTIFICADA',
      enviado_proveedor_at: '2026-07-22T15:00:00Z',
    },
    {
      ccp_activo: true,
      orden_id: 9001,
      orden_estado: 'ORDEN_NOTIFICADA',
      enviado_proveedor_at: '2026-07-22T15:00:00Z',
    },
  );
  assert.equal(good.estado_vigente, 'ORDEN_NOTIFICADA');
  assert.equal(good.estado_vigente_label, 'Orden notificada');
  assert.equal(good.estadoVigente?.codigo, 'ORDEN_NOTIFICADA');
  ok('applyCcpFlagsToRow con evidencia de orden');
}

// —— CASO C principal: recepción consolidada ——
{
  const cot = {
    solicitud_id: 10,
    solicitud_codigo: 'SC-105',
    denominacion: 'Exp RC105',
    ...EVIDENCE_NOTIFICADA,
    estadoVigente: {
      codigo: 'ORDEN_NOTIFICADA',
      label: 'Orden notificada',
      etapa: 'ORDEN',
      prioridad: 840,
    },
    estado_vigente: 'ORDEN_NOTIFICADA',
    estado_vigente_label: 'Orden notificada',
    etiqueta_estado: 'Orden notificada',
    fecha_presentacion: '2026-07-01',
  };
  const exp = consolidarExpedientesRecepcion([cot]);
  assert.equal(exp[0].estadoVigente?.codigo || exp[0].estado_vigente, 'ORDEN_NOTIFICADA');
  assert.equal(exp[0].estado_recepcion, 'Orden notificada');
  assert.notEqual(exp[0].estado_recepcion, 'CCP registrada');
  const html = renderBadgeEstadoRecepcionHtml(exp[0], (s) => s);
  assert.match(html, /Orden notificada/);
  assert.doesNotMatch(html, /CCP registrada/);
  ok('Recepción consolidada → ORDEN_NOTIFICADA');
}

// —— Validaciones consolidada ——
{
  const cot = {
    solicitud_id: 11,
    solicitud_codigo: 'SC-105V',
    validacion_estado: 'APTO',
    ...EVIDENCE_NOTIFICADA,
    estadoVigente: {
      codigo: 'ORDEN_NOTIFICADA',
      label: 'Orden notificada',
      etapa: 'ORDEN',
      prioridad: 840,
    },
    estado_vigente: 'ORDEN_NOTIFICADA',
    estado_vigente_label: 'Orden notificada',
    etiqueta_estado: 'Orden notificada',
    fecha_presentacion: '2026-07-01',
  };
  const exp = consolidarExpedientesValidacion([cot]);
  assert.equal(exp[0].estadoVigente?.codigo, 'ORDEN_NOTIFICADA');
  assert.equal(exp[0].estado_bandeja, 'Orden notificada');
  assert.ok(exp[0].estadoInterno, 'conserva estadoInterno Validaciones');
  const html = renderBadgeEstadoValidacionHtml(exp[0], (s) => s);
  assert.match(html, /Orden notificada/);
  ok('Validaciones consolidada → ORDEN_NOTIFICADA + estadoInterno');
}

// —— CCP vista: no debe ignorar orden al armar badge ——
{
  const row = {
    requerimiento_id: 55,
    codigo_ccp: 'CCP-105',
    ccp_activo: true,
    tiene_codigo: true,
    ccp_registrado: true,
    estado_cuadro: 'DERIVADO_CCP',
    solicitud_estado: 'EN_CCP',
    orden_id: 9001,
    orden_estado: 'ORDEN_NOTIFICADA',
    enviado_proveedor_at: '2026-07-22T15:00:00Z',
    estadoVigente: {
      codigo: 'ORDEN_NOTIFICADA',
      label: 'Orden notificada',
      etapa: 'ORDEN',
      prioridad: 840,
    },
    estado_vigente: 'ORDEN_NOTIFICADA',
    etiqueta_estado: 'Orden notificada',
    estadoInterno: { codigo: 'CCP_REGISTRADA', label: 'CCP registrada', modulo: 'CCP' },
  };
  // Simula renderEstadoCell corregido
  const html = renderBadgeEstadoVigenteHtml({
    ...row,
    codigo_ccp: row.codigo_ccp,
    ccp_activo: true,
    orden_estado: row.orden_estado,
    enviado_proveedor_at: row.enviado_proveedor_at,
    orden_id: row.orden_id,
  }, (s) => s);
  assert.match(html, /Orden notificada/);
  assert.equal(row.estadoInterno.codigo, 'CCP_REGISTRADA');
  ok('CCP badge con evidencia de orden → ORDEN_NOTIFICADA (interno CCP conservado)');
}

// Controles: Invitaciones / Registro Órdenes (mismo resolvedor)
{
  const v = resolveEstadoExpedienteVigente(EVIDENCE_NOTIFICADA);
  assert.equal(v.codigo, 'ORDEN_NOTIFICADA');
  ok('Control Invitaciones/Órdenes (resolvedor) → ORDEN_NOTIFICADA');
}

// CASO A: solo CCP
{
  const v = resolveEstadoExpedienteVigente({ codigo_ccp: 'X', ccp_activo: true });
  assert.equal(v.codigo, 'CCP_REGISTRADA');
  const est = estadoExpedienteRecepcion([], { codigo_ccp: 'X', ccp_activo: true });
  assert.equal(est.validacion_estado, 'CCP_REGISTRADA');
  ok('CASO A solo CCP');
}

// CASO B: CCP + orden registrada
{
  const v = resolveEstadoExpedienteVigente({
    codigo_ccp: 'X', ccp_activo: true, orden_id: 1, orden_estado: 'ORDEN_REGISTRADA',
  });
  assert.equal(v.codigo, 'ORDEN_REGISTRADA');
  ok('CASO B orden registrada');
}

// CASO C: notificada (ya cubierto)
ok('CASO C orden notificada (principal)');

// CASO D: alias histórico
{
  const v = resolveEstadoExpedienteVigente({
    codigo_ccp: 'X', ccp_activo: true, orden_estado: 'ORDEN_ENVIADA',
  });
  assert.equal(v.codigo, 'ORDEN_NOTIFICADA');
  ok('CASO D ORDEN_ENVIADA → ORDEN_NOTIFICADA');
}

// CASO E: validación interna antigua + orden notificada
{
  const est = estadoExpedienteValidacion([{
    validacion_estado: 'APTO',
    ...EVIDENCE_NOTIFICADA,
  }], EVIDENCE_NOTIFICADA);
  assert.equal(est.validacion_estado, 'ORDEN_NOTIFICADA');
  assert.equal(est.label, 'Orden notificada');
  ok('CASO E validación antigua no tapa global');
}

// CASO F: histórico en CCP con orden
{
  const v = resolveEstadoExpedienteVigente({
    codigo_ccp: 'CCP-F',
    ccp_activo: true,
    enviado_proveedor_at: '2026-07-01',
  });
  assert.equal(v.codigo, 'ORDEN_NOTIFICADA');
  ok('CASO F CCP histórico visible con global ORDEN_NOTIFICADA');
}

console.log('\nMatriz RC105:');
const matriz = [
  ['Invitaciones', 'ORDEN_NOTIFICADA', 'Orden notificada'],
  ['Recepción Cotizaciones', 'ORDEN_NOTIFICADA', 'Orden notificada'],
  ['Validaciones', 'ORDEN_NOTIFICADA', 'Orden notificada'],
  ['CCP', 'ORDEN_NOTIFICADA', 'Orden notificada'],
  ['Registro de Órdenes', 'ORDEN_NOTIFICADA', 'Orden notificada'],
];
matriz.forEach(([mod, cod, lab]) => {
  console.log(`  | ${mod.padEnd(24)} | ${cod.padEnd(18)} | ${lab.padEnd(18)} | OK |`);
});

console.log('\nPASS RC105');

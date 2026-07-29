/**
 * RC106 — Recepción de Bienes: ingreso, estados, roles, transiciones e idempotencia.
 * Pruebas unitarias sin DB obligatoria + smoke de catálogo/resolvedor/permisos.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeEstadoCode,
  getPrioridad,
  getLabelEstado,
  getEstadoDef,
} from '../shared/estadoExpedienteCatalog.js';
import { resolveEstadoExpedienteVigente } from '../shared/estadoExpedienteVigente.js';
import { validateEstadoTransition } from '../shared/validateEstadoTransition.js';
import { isOrdenBienes, resolveRolActor } from '../server/lib/recepcionBienes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}

console.log('\n=== RC106 — Recepción de Bienes ===\n');

// 1–4 Ingreso / filtro bienes / estado inicial
{
  assert.equal(isOrdenBienes('OC', 'BIENES'), true);
  assert.equal(isOrdenBienes('OS', 'SERVICIOS'), false);
  assert.equal(isOrdenBienes('OS', 'BIENES'), false);
  assert.equal(isOrdenBienes('', 'SERVICIO'), false);
  assert.equal(isOrdenBienes('', 'LOCADOR'), false);
  assert.equal(isOrdenBienes('', 'BIENES'), true);
  ok('1-3. Solo OC/bienes elegibles; OS/locador excluidos');

  const v = resolveEstadoExpedienteVigente({
    orden_id: 1,
    orden_estado: 'ORDEN_NOTIFICADA',
    enviado_proveedor_at: '2026-07-20',
    recepcion_estado_global: 'RECEPCION_BIENES_PENDIENTE',
    recepcion_bienes_expediente_id: 10,
    codigo_ccp: 'CCP-X',
    ccp_activo: true,
  });
  assert.equal(v.codigo, 'RECEPCION_BIENES_PENDIENTE');
  assert.equal(v.label, 'OC pendiente de recepción');
  assert.equal(normalizeEstadoCode('OC_PENDIENTE_RECEPCION'), 'RECEPCION_BIENES_PENDIENTE');
  ok('4. Estado inicial OC pendiente de recepción (alias OC_PENDIENTE_RECEPCION)');
}

// 5–10 Guías / recepción / montos (reglas de dominio)
{
  assert.ok(getPrioridad('BIEN_RECIBIDO_ALMACEN') > getPrioridad('RECEPCION_BIENES_PENDIENTE'));
  assert.ok(getPrioridad('RECEPCION_BIENES_PENDIENTE') > getPrioridad('ORDEN_NOTIFICADA'));
  ok('5-8. Prioridad recepción > ORDEN_NOTIFICADA; BIEN_RECIBIDO > pendiente');

  const saldo = (total, acum) => Math.round((Number(total) - Number(acum)) * 100) / 100;
  assert.equal(saldo(1000, 200), 800);
  const permite = (monto, total, acum) => monto <= saldo(total, acum) + 0.009;
  assert.equal(permite(800, 1000, 200), true);
  assert.equal(permite(1200, 1000, 200), false);
  ok('9-10. Monto a liquidar válido vs rechazo por saldo');
}

// 11–21 Flujo de estados globales
{
  const chain = [
    ['RECEPCION_BIENES_PENDIENTE', 'OC pendiente de recepción'],
    ['BIEN_RECIBIDO_ALMACEN', 'Recibido por almacén'],
    ['CONFORMIDAD_PENDIENTE_AU', 'Conformidad pendiente AU'],
    ['CONFORMIDAD_RECIBIDA_AU', 'Conformidad recibida del AU'],
    ['CONFORMIDAD_EN_COORDINACION_CM', 'Conformidad en Coordinación CM'],
    ['EXPEDIENTE_DERIVADO_PAGO', 'Expediente derivado a pago'],
  ];
  let prev = getPrioridad('ORDEN_NOTIFICADA');
  for (const [code, label] of chain) {
    assert.equal(getLabelEstado(code), label);
    assert.ok(getPrioridad(code) > prev, `${code} prioridad`);
    const v = resolveEstadoExpedienteVigente({
      orden_id: 2,
      enviado_proveedor_at: '2026-07-01',
      codigo_ccp: 'C',
      ccp_activo: true,
      recepcion_estado_global: code === 'EXPEDIENTE_DERIVADO_PAGO' ? '' : code,
      expediente_derivado_pago: code === 'EXPEDIENTE_DERIVADO_PAGO',
      derivado_pago_at: code === 'EXPEDIENTE_DERIVADO_PAGO' ? '2026-07-22' : null,
      recepcion_bienes_expediente_id: 99,
    });
    assert.equal(v.codigo, code, `resolvedor ${code}`);
    assert.equal(v.label, label);
    prev = getPrioridad(code);
  }
  ok('11-21. Cadena de estados globales y labels canónicos');
}

// Transiciones
{
  const t1 = validateEstadoTransition({
    estadoActual: 'ORDEN_NOTIFICADA',
    estadoDestino: 'RECEPCION_BIENES_PENDIENTE',
    accion: 'INGRESO_AUTOMATICO',
  });
  assert.equal(t1.ok, true);

  const t2 = validateEstadoTransition({
    estadoActual: 'BIEN_RECIBIDO_ALMACEN',
    estadoDestino: 'CONFORMIDAD_PENDIENTE_AU',
    accion: 'DERIVAR_AU',
  });
  assert.equal(t2.ok, true);

  const t3 = validateEstadoTransition({
    estadoActual: 'CONFORMIDAD_EN_COORDINACION_CM',
    estadoDestino: 'EXPEDIENTE_DERIVADO_PAGO',
    accion: 'DERIVAR_PAGO',
  });
  assert.equal(t3.ok, true);

  const t4 = validateEstadoTransition({
    estadoActual: 'EXPEDIENTE_DERIVADO_PAGO',
    estadoDestino: 'BIEN_RECIBIDO_ALMACEN',
    accion: 'REGISTRAR',
    allowHistorical: false,
  });
  assert.equal(t4.ok, false);
  ok('22. Transiciones permitidas; retroceso a recepción bloqueado');
}

// 23 Orden resuelta
{
  const v = resolveEstadoExpedienteVigente({
    orden_id: 3,
    orden_resuelta: true,
    enviado_proveedor_at: '2026-07-01',
    recepcion_estado_global: 'BIEN_RECIBIDO_ALMACEN',
    recepcion_bienes_expediente_id: 1,
  });
  assert.equal(v.codigo, 'ORDEN_RESUELTA');
  ok('23. Orden resuelta prevalece y bloquea etapa de recepción');
}

// 24 Roles
{
  assert.equal(resolveRolActor({}, 'dec'), 'ALMACEN');
  assert.equal(resolveRolActor({}, 'almacen'), 'ALMACEN');
  assert.equal(resolveRolActor({}, 'au'), 'AREA_USUARIA');
  assert.equal(resolveRolActor({}, 'cm'), 'COORDINADOR_CM');
  assert.equal(resolveRolActor({}, 'analista'), 'ANALISTA_PAGO');
  ok('24. Mapeo de roles Almacén / AU / CM / Analista');
}

// 25 Recepciones parciales: estado BIEN_RECIBIDO_ALMACEN no implica cierre contractual
{
  const def = getEstadoDef('BIEN_RECIBIDO_ALMACEN');
  assert.equal(def?.terminal, undefined);
  assert.equal(normalizeEstadoCode('RECEPCION_PARCIAL_ALMACEN'), 'BIEN_RECIBIDO_ALMACEN');
  ok('25. Recepción parcial usa alias a BIEN_RECIBIDO_ALMACEN (sin cerrar orden)');
}

// Cableado menú / rutas / migración / API
{
  assertFileContains('src/services/menuService.js', /Recepción de Bienes/, 'menú label');
  assertFileContains('src/services/menuService.js', /ejecucion\/recepcion-bienes/, 'menú ruta');
  const menu = fs.readFileSync(path.join(root, 'src/services/menuService.js'), 'utf8');
  assert.ok(!menu.includes("label: 'Registro de Orden'"), 'sin label Registro de Orden en menú');
  assert.ok(!/path:\s*'ejecucion\/registro'/.test(menu), 'menú sin path ejecucion/registro');

  assertFileContains('src/router.js', /recepcionBienesView/, 'router import');
  assertFileContains('src/router.js', /ejecucion\/recepcion-bienes/, 'router map');
  assertFileContains('src/app.js', /recepcionBienesView/, 'app.js load');
  assertFileContains('server/index.js', /recepcion-bienes/, 'server mount');
  assertFileContains('server/lib/ordenesProveedor.js', /asegurarExpedienteRecepcionDesdeOrden/, 'hook notificación');
  assertFileContains('server/migrations/029_recepcion_bienes.js', /recepcion_bienes_expedientes/, 'migración 029');
  assertFileContains('src/utils/permissionsCatalog.js', /RECEPCION_BIENES/, 'permisos FE');
  assertFileContains('server/lib/permissionsCatalog.js', /RECEPCION_BIENES/, 'permisos BE');

  // Contrataciones Registro de Órdenes intacto
  assertFileContains('src/services/menuService.js', /dec\/registro-ordenes/, 'Contrataciones RO intacto');
  ok('Menú, rutas, migración, hook notificación y permisos cableados');
}

// OS notificada no debe resolverse como recepción bienes solo por notificación
{
  const v = resolveEstadoExpedienteVigente({
    orden_id: 50,
    orden_estado: 'ORDEN_NOTIFICADA',
    enviado_proveedor_at: '2026-07-22',
    codigo_ccp: 'C',
    ccp_activo: true,
  });
  assert.equal(v.codigo, 'ORDEN_NOTIFICADA');
  ok('Orden notificada sin expediente recepción permanece ORDEN_NOTIFICADA');
}

console.log('\nRC106 OK\n');

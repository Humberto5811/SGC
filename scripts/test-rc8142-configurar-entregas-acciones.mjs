/**
 * RC8.14.2 — Corrección de regresión: "Configurar entregas" desaparecía de la
 * bandeja de Registro de Órdenes en cuanto checklist.completo se volvía true
 * (ORDEN_LISTA_NOTIFICACION), aunque la orden siguiera siendo un estado de
 * preparación editable. NO se tocó la validación económica de RC8.14.1 ni el
 * checklist de Notificar proveedor — solo la habilitación/visibilidad de
 * "Configurar entregas" en registroOrdenesMenuItems.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registroOrdenesMenuItems, splitMenuItemsPorBandeja } from '../src/utils/ordenesUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== RC8.14.2 — Corrección de regresión: acción "Configurar entregas" ===\n');

const srcUtils = read('src/utils/ordenesUtils.js');

function actsFor(estado, extra = {}) {
  return registroOrdenesMenuItems({ estado, orden_id: 99, tipo_contratacion: 'Locación', ...extra }, { canManage: true })
    .map((i) => i.act);
}

// ---------------------------------------------------------------------------
console.log('-- 1. checklist completo NO deshabilita/oculta Configurar entregas --');
const conChecklistCompleto = actsFor('ORDEN_LISTA_NOTIFICACION', { checklist_completo: true });
ok(conChecklistCompleto.includes('adminEntregas'),
  '1.1: ORDEN_LISTA_NOTIFICACION con checklist_completo=true → "adminEntregas" SIGUE presente (causa exacta de la regresión, corregida)');
const itemAdminEnt = registroOrdenesMenuItems(
  { estado: 'ORDEN_LISTA_NOTIFICACION', orden_id: 99, checklist_completo: true, tipo_contratacion: 'Locación' },
  { canManage: true },
).find((i) => i.act === 'adminEntregas');
ok(itemAdminEnt && itemAdminEnt.disabled !== true,
  '1.2: "adminEntregas" no queda deshabilitado (disabled !== true) cuando el checklist está completo');

// ---------------------------------------------------------------------------
console.log('\n-- 2/3/4. Estados de preparación configurables → disponible --');
['REGISTRO_ORDENES', 'ORDEN_REGISTRADA'].forEach((estado) => {
  ok(actsFor(estado, { checklist_completo: false }).includes('adminEntregas'),
    `2/3.${estado}: disponible con checklist incompleto`);
  ok(actsFor(estado, { checklist_completo: true }).includes('adminEntregas'),
    `2/3.${estado}: disponible con checklist completo`);
});
ok(actsFor('ORDEN_LISTA_NOTIFICACION', { checklist_completo: false }).includes('adminEntregas'),
  '4.1: ORDEN_LISTA_NOTIFICACION con checklist incompleto → disponible');
ok(actsFor('ORDEN_LISTA_NOTIFICACION', { checklist_completo: true }).includes('adminEntregas'),
  '4.2: ORDEN_LISTA_NOTIFICACION con checklist completo → disponible (caso de la regresión)');

// ---------------------------------------------------------------------------
console.log('\n-- 5/6. Estados cerrados/históricos → bloqueado (según reglas vigentes, sin cambios) --');
ok(!actsFor('ORDEN_NOTIFICADA').includes('adminEntregas'),
  '5.1: ORDEN_NOTIFICADA → "adminEntregas" sigue sin aparecer (regla preexistente, no tocada)');
['ORDEN_RECEPCION_CONFIRMADA', 'EN_EJECUCION'].forEach((estado) => {
  ok(!actsFor(estado).includes('adminEntregas'), `6.${estado}: estado histórico → sin "adminEntregas"`);
});

// ---------------------------------------------------------------------------
console.log('\n-- 7. No depende del número de orden --');
const rowSinNumero = registroOrdenesMenuItems(
  { estado: 'ORDEN_LISTA_NOTIFICACION', orden_id: 2, checklist_completo: true, tipo_contratacion: 'Locación' },
  { canManage: true },
);
const rowConNumeroDistinto = registroOrdenesMenuItems(
  { estado: 'ORDEN_LISTA_NOTIFICACION', orden_id: 999, numero_orden: '9999', checklist_completo: true, tipo_contratacion: 'Bien' },
  { canManage: true },
);
ok(rowSinNumero.some((i) => i.act === 'adminEntregas') === rowConNumeroDistinto.some((i) => i.act === 'adminEntregas'),
  '7.1: la disponibilidad de "adminEntregas" es idéntica sin importar orden_id/numero_orden (depende solo del estado)');
ok(!/numero_orden ===?/.test(srcUtils.split('registroOrdenesMenuItems')[1]?.split('export function')[0] || ''),
  '7.2: registroOrdenesMenuItems no condiciona ninguna acción por numero_orden (verificado por código)');

// ---------------------------------------------------------------------------
console.log('\n-- 8. No modifica Notificar proveedor --');
const conChecklistFalso = registroOrdenesMenuItems(
  { estado: 'ORDEN_LISTA_NOTIFICACION', orden_id: 2, checklist_completo: false, tipo_contratacion: 'Locación' },
  { canManage: true },
).find((i) => i.act === 'notificarProveedor');
ok(conChecklistFalso && conChecklistFalso.disabled === true,
  '8.1: "Notificar proveedor" sigue bloqueado cuando checklist_completo=false (regla RC8.14.1 intacta)');
const conChecklistVerdadero = registroOrdenesMenuItems(
  { estado: 'ORDEN_LISTA_NOTIFICACION', orden_id: 2, checklist_completo: true, tipo_contratacion: 'Locación' },
  { canManage: true },
).find((i) => i.act === 'notificarProveedor');
ok(conChecklistVerdadero && conChecklistVerdadero.disabled !== true,
  '8.2: "Notificar proveedor" se habilita normalmente cuando checklist_completo=true (sin cambios)');
ok(/disabled: row\.checklist_completo === false,/.test(srcUtils),
  '8.3: la condición de habilitación de Notificar proveedor no fue alterada en el código');

// ---------------------------------------------------------------------------
console.log('\n-- Regresión: modo CCP/Orden (tabs), BIEN/SERVICIO/LOCACIÓN --');
['Bien', 'Servicio', 'Locación'].forEach((tipo) => {
  const items = registroOrdenesMenuItems(
    { estado: 'ORDEN_LISTA_NOTIFICACION', orden_id: 2, checklist_completo: true, tipo_contratacion: tipo },
    { canManage: true },
  );
  const { orden } = splitMenuItemsPorBandeja(items);
  ok(orden.some((i) => i.act === 'adminEntregas'),
    `regresión: tipo_contratacion=${tipo} → "adminEntregas" presente en el tab Registro de Orden`);
});

console.log('\n=== RC8.14.2 — pruebas OK ===\n');

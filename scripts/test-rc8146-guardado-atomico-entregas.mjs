/**
 * RC8.14.6 — Guardado atómico de entregas/entregables.
 * Mock transaccional: no usa ni modifica BD real.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardarEntregas } from '../server/lib/ordenesEntregas.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'server/lib/ordenesEntregas.js'), 'utf8');

function ok(condition, message) {
  assert.ok(condition, message);
  console.log(`  ✓ ${message}`);
}

function clone(value) {
  return structuredClone(value);
}

function createStore({ failDeliveryNumber = null, failItems = false } = {}) {
  const state = {
    entregas: [
      { id: 1, orden_id: 1, numero_entrega: 1, estado: 'ACTIVO', descripcion: 'Anterior 1' },
      { id: 2, orden_id: 1, numero_entrega: 2, estado: 'ACTIVO', descripcion: 'Anterior 2' },
    ],
    items: [],
    cronogramaVersion: 3,
    eventos: [],
    nextId: 10,
  };
  let before = null;
  let deliveryInsertCount = 0;
  const calls = [];

  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim().toUpperCase();
      calls.push(normalized);

      if (normalized === 'BEGIN') {
        before = clone(state);
        return { rows: [] };
      }
      if (normalized === 'COMMIT') {
        before = null;
        return { rows: [] };
      }
      if (normalized === 'ROLLBACK') {
        if (before) Object.assign(state, clone(before));
        before = null;
        return { rows: [] };
      }
      if (normalized.includes('SELECT ID FROM ORDENES_CONTRATACION')
        && normalized.includes('FOR UPDATE')) {
        return { rows: [{ id: 1 }] };
      }
      if (normalized.startsWith('UPDATE ORDEN_ENTREGAS SET ESTADO = \'ANULADO\'')) {
        state.entregas.forEach((e) => {
          if (e.orden_id === Number(params[0])) e.estado = 'ANULADO';
        });
        return { rows: [] };
      }
      if (normalized.startsWith('INSERT INTO ORDEN_ENTREGAS')) {
        deliveryInsertCount += 1;
        if (failDeliveryNumber === deliveryInsertCount) {
          throw new Error(`fallo intencional entrega ${deliveryInsertCount}`);
        }
        const id = state.nextId++;
        state.entregas.push({
          id,
          orden_id: Number(params[0]),
          numero_entrega: Number(params[1]),
          estado: 'ACTIVO',
          descripcion: params[3],
        });
        return { rows: [{ id }] };
      }
      if (normalized.startsWith('INSERT INTO ORDEN_ENTREGA_ITEMS')) {
        if (failItems) throw new Error('fallo intencional orden_entrega_items');
        state.items.push({
          orden_entrega_id: Number(params[0]),
          orden_item_id: Number(params[1]),
          cantidad: Number(params[2]),
          precio_total: Number(params[4]),
        });
        return { rows: [] };
      }
      if (normalized.startsWith('UPDATE ORDENES_CONTRATACION SET')
        && normalized.includes('CRONOGRAMA_VERSION')) {
        state.cronogramaVersion += 1;
        return { rows: [] };
      }
      if (normalized.startsWith('INSERT INTO ORDEN_EVENTOS')) {
        state.eventos.push({ tipo: 'CRONOGRAMA_ACTUALIZADO' });
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() {},
  };

  const orden = {
    id: 1,
    requerimiento_id: 99,
    estado: 'ORDEN_REGISTRADA',
    tipo_contratacion: 'BIEN',
    monto_total: 100,
    fecha_orden: '2026-08-01',
    condicion_inicio: 'EMISION_ORDEN',
  };
  const items = [{
    id: 100,
    descripcion: 'Bien contractual',
    cantidad: 10,
    precio_unitario: 10,
    precio_total: 100,
  }];
  const deps = {
    getOrdenById: async () => ({ ...orden }),
    sincronizarPreciosItemsDesdeCuadro: async () => items.map((x) => ({ ...x })),
    reconciliarItemsContractuales: async (_orden, fisicos) => ({
      items: fisicos,
      reconciliado: false,
    }),
    guardarInicioActividad: async () => null,
    sincronizarEstadoSegunChecklist: async () => ({
      estado: 'ORDEN_REGISTRADA',
      checklist: { completo: true },
      sincronizado: false,
    }),
    registrarEventoOrden: async ({ client: tx }) => tx.query(
      'INSERT INTO orden_eventos (tipo_evento) VALUES ($1)',
      ['CRONOGRAMA_ACTUALIZADO'],
    ),
    listarEntregas: async () => state.entregas.filter((e) => e.estado === 'ACTIVO'),
  };

  return { state, client, deps, calls };
}

const payload = [
  {
    numero_entrega: 1,
    tipo_entrega: 'ENTREGA',
    dias_plazo: 10,
    items: [{ orden_item_id: 100, cantidad: 5, precio_unitario: 10, precio_total: 50 }],
  },
  {
    numero_entrega: 2,
    tipo_entrega: 'ENTREGA',
    dias_plazo: 20,
    items: [{ orden_item_id: 100, cantidad: 5, precio_unitario: 10, precio_total: 50 }],
  },
];

async function execute(store) {
  return guardarEntregas(1, clone(payload), 'tester', 'ADMIN', {
    getClient: async () => store.client,
    deps: store.deps,
  });
}

console.log('\n=== RC8.14.6 — Guardado atómico de entregas ===\n');

ok(/await client\.query\('BEGIN'\)/.test(source)
  && /await client\.query\('COMMIT'\)/.test(source)
  && /await client\.query\('ROLLBACK'\)/.test(source),
'1. guardarEntregas usa BEGIN / COMMIT / ROLLBACK');
ok(/SELECT id FROM ordenes_contratacion WHERE id = \$1 FOR UPDATE/.test(source),
  '2. bloquea la orden para serializar reemplazos concurrentes');
ok(/guardarEntregasConClient/.test(source),
  '3. todo el bloque crítico reutiliza un único client');

{
  const store = createStore();
  const result = await execute(store);
  const anteriores = store.state.entregas.filter((e) => e.id < 10);
  const nuevas = store.state.entregas.filter((e) => e.id >= 10);
  ok(result.length === 2, 'A1. guardado exitoso devuelve dos entregas nuevas');
  ok(anteriores.every((e) => e.estado === 'ANULADO'),
    'A2. guardado exitoso anula las anteriores');
  ok(nuevas.length === 2 && nuevas.every((e) => e.estado === 'ACTIVO'),
    'A3. guardado exitoso deja las nuevas ACTIVAS');
  ok(store.state.cronogramaVersion === 4 && store.state.eventos.length === 1,
    'A4. versión y evento se confirman en la misma transacción');
}

{
  const store = createStore({ failDeliveryNumber: 2 });
  await assert.rejects(() => execute(store), /fallo intencional entrega 2/);
  ok(store.state.entregas.length === 2
    && store.state.entregas.every((e) => e.estado === 'ACTIVO'),
  'B1. fallo durante segundo INSERT restaura entregas anteriores ACTIVAS');
  ok(store.state.items.length === 0
    && store.state.cronogramaVersion === 3
    && store.state.eventos.length === 0,
  'B2. fallo durante segundo INSERT no deja cronograma parcial');
  ok(store.calls.includes('ROLLBACK'), 'B3. ejecuta ROLLBACK');
}

{
  const store = createStore({ failItems: true });
  await assert.rejects(() => execute(store), /fallo intencional orden_entrega_items/);
  ok(store.state.entregas.length === 2
    && store.state.entregas.every((e) => e.estado === 'ACTIVO'),
  'C1. fallo en orden_entrega_items restaura entregas anteriores ACTIVAS');
  ok(store.state.items.length === 0
    && store.state.cronogramaVersion === 3
    && store.state.eventos.length === 0,
  'C2. fallo en items no deja cronograma parcial');
}

ok(/esCronogramaPorHitos/.test(source)
  && /normalizarLineasEntregableItemUnico/.test(source)
  && /normalizarLineasEntrega/.test(source),
'D1. conserva reglas RC8.14.3 de hitos vs cantidades físicas');

console.log('\n=== RC8.14.6 — pruebas OK ===\n');

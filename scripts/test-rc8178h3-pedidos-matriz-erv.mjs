/**
 * RC8.17.8H3 — Matriz Pedidos Programación: Etapa/Estado/Responsable ERV alineados con bandeja.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { buildMatrizSeguimientoPedidos } from '../server/lib/pedidosMatriz.js';
import { listarBandejaProgramacion } from '../server/lib/programacionBandeja.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H3 — Pedidos matriz ERV ===\n');

await runMigrations();

const matriz = await buildMatrizSeguimientoPedidos();
ok(Array.isArray(matriz.filas), 'matriz devuelve filas');

const sample = matriz.filas.find((f) => f.bandeja_contrato?.etapa?.codigo) || matriz.filas[0];
if (!sample) {
  console.log('  (sin pedidos asociados — omitiendo comparación REQ)');
} else {
  ok(sample.bandeja_contrato?.etapa?.label, 'fila pedido incluye bandeja_contrato.etapa');
  ok(sample.bandeja_contrato?.estado?.label, 'fila pedido incluye bandeja_contrato.estado');
  ok(sample.bandeja_contrato?.responsable?.nombre, 'fila pedido incluye responsable display');
  ok(
    sample.bandeja_contrato.estado.label !== 'Estado no disponible'
      || sample.estado_responsable_vigente?.canonicalMissing === true,
    'no "Estado no disponible" salvo canonicalMissing',
  );
  const respNombre = sample.bandeja_contrato.responsable.nombre;
  ok(!/^\d+\s*\/\s*/.test(respNombre), 'responsable no es patrón legacy "ID / ETAPA"');

  const rid = sample.requerimiento_id;
  const codigo = sample.requerimiento_codigo;
  const lista = await listarBandejaProgramacion(1, 200, codigo ? { q: codigo } : {});
  const bandeja = (lista.data || []).find((r) => Number(r.id) === Number(rid));
  ok(!!bandeja, `${codigo || rid} presente en bandeja Programación`);
  if (bandeja?.bandeja_contrato) {
    ok(
      bandeja.bandeja_contrato.etapa?.codigo === sample.bandeja_contrato.etapa?.codigo,
      `Etapa coincide bandeja vs pedidos (${bandeja.bandeja_contrato.etapa?.codigo})`,
    );
    ok(
      bandeja.bandeja_contrato.estado?.codigo === sample.bandeja_contrato.estado?.codigo,
      `Estado coincide bandeja vs pedidos (${bandeja.bandeja_contrato.estado?.codigo})`,
    );
    ok(
      bandeja.bandeja_contrato.responsable?.nombre === sample.bandeja_contrato.responsable?.nombre,
      `Responsable coincide: ${sample.bandeja_contrato.responsable?.nombre}`,
    );
  }
}

const { rows: req47 } = await query(`SELECT id FROM requerimientos WHERE codigo = 'REQ-00047' LIMIT 1`);
if (req47[0]) {
  const rid = req47[0].id;
  const filas47 = matriz.filas.filter((f) => Number(f.requerimiento_id) === Number(rid));
  if (filas47.length) {
    const f = filas47[0];
    ok(f.bandeja_contrato?.etapa?.label, 'REQ-00047 pedido tiene Etapa ERV');
    console.log(`  REQ-00047 pedidos: Etapa=${f.bandeja_contrato.etapa.label} Estado=${f.bandeja_contrato.estado.label} Resp=${f.bandeja_contrato.responsable.nombre}`);
  }
}

console.log('\n✅ RC8.17.8H3 — OK\n');

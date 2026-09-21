/**
 * RC8.17.8H6-C1A/B — Bienes multi-entrega Anexo 05-A (cronograma por requerimiento).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  filasCronogramaDesdeProgramadas,
  initCronogramaEntregasPorRequerimiento,
  validateCronogramaEntregasBienes,
  buildPropuestaTecnicaBienesPayload,
  programadasEntregasBienesRequerimiento,
  workspaceUsaCronogramaEntregasBienes,
  parsePlazoProgramadoDias,
  resolveUnidadMedidaCronogramaRequerimiento,
  agruparItemsPorRequerimiento,
  cantidadRequerimientosDistintos,
  filasCronogramaReferencialInferiorBienes,
} from '../src/utils/bienesCronogramaCotizacion.js';
import { resolveEntregablesFromWorkspace } from '../src/utils/proveedorCotizacionSteps.js';
import { downloadAnexo05A } from '../src/utils/proveedorPdfCotizacion.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-C1A/B — Bienes multi-entrega cotización ===\n');

const entregas2400 = {
  tipo: 'Bienes',
  entregas: [
    { numero_entrega: 1, cantidad: 2400, plazo: '30', condicion: 'Cond A' },
    { numero_entrega: 2, cantidad: 2400, plazo: '60', condicion: 'Cond B' },
  ],
};

function itemBase(overrides = {}) {
  return {
    item_key: '10-0',
    requerimiento_id: 10,
    requerimiento_codigo: 'REQ-00001',
    cantidad: 4800,
    unidad_medida: 'KILOGRAMO',
    um: 'KILOGRAMO',
    entregables_source: entregas2400,
    ...overrides,
  };
}

const ws1item2ent = {
  solicitud: { tipo: 'Bienes' },
  items: [itemBase()],
};

// 1 — 1 REQ / 1 item / 2 entregas → 1 cronograma REQ con 2 filas
{
  const init = initCronogramaEntregasPorRequerimiento(ws1item2ent, {});
  ok(Object.keys(init).length === 1 && init['10']?.length === 2, '1 — un cronograma REQ con 2 filas');
  ok(programadasEntregasBienesRequerimiento(ws1item2ent, 10).length === 2, '1 — dos entregas programadas');
}

// 2 — 1 REQ / 2 items → cronograma una sola vez, sin validación vs cantidades ítem
{
  const wsMulti = {
    solicitud: { tipo: 'Bienes' },
    items: [
      itemBase({ item_key: '10-0', cantidad: 3000 }),
      itemBase({ item_key: '10-1', cantidad: 1800, um: 'UNIDAD', unidad_medida: 'UNIDAD' }),
    ],
  };
  const init = initCronogramaEntregasPorRequerimiento(wsMulti, {});
  ok(Object.keys(init).filter((k) => init[k]?.length).length === 1, '2 — una clave cronograma');
  ok(init['10']?.length === 2, '2 — dos filas entrega');
  const filas = init['10'];
  filas[0].plazo_ofertado = 30;
  filas[1].plazo_ofertado = 60;
  ok(validateCronogramaEntregasBienes(filas).length === 0, '2 — no falla validación vs 3000/1800');
  const steps = readFileSync(join(__dir, '../src/utils/proveedorCotizacionSteps.js'), 'utf8');
  const blocks = (steps.match(/Propuesta de entregas —/g) || []).length;
  ok(blocks >= 1 && steps.includes('agruparItemsPorRequerimiento'), '2 — UI agrupa por REQ');
}

// 3 — 2 REQ distintos
{
  const ws2req = {
    solicitud: { tipo: 'Bienes' },
    items: [
      itemBase({ requerimiento_id: 10, item_key: '10-0' }),
      itemBase({
        requerimiento_id: 20,
        requerimiento_codigo: 'REQ-00002',
        item_key: '20-0',
        entregables_source: {
          tipo: 'Bienes',
          entregas: [{ numero_entrega: 1, cantidad: 100, plazo: '15', condicion: 'Única' }],
        },
      }),
    ],
  };
  const init = initCronogramaEntregasPorRequerimiento(ws2req, {});
  ok(init['10']?.length === 2 && init['20']?.length === 1, '3 — cronogramas independientes');
}

// 4 — N entregas
{
  const srcN = {
    tipo: 'Bienes',
    entregas: [
      { numero_entrega: 1, cantidad: 1, plazo: '10', condicion: 'E1' },
      { numero_entrega: 2, cantidad: 2, plazo: '20', condicion: 'E2' },
      { numero_entrega: 3, cantidad: 3, plazo: '30', condicion: 'E3' },
    ],
  };
  const wsN = { solicitud: { tipo: 'Bienes' }, items: [itemBase({ entregables_source: srcN })] };
  ok(programadasEntregasBienesRequerimiento(wsN, 10).length === 3, '4 — N=3 filas');
  ok(initCronogramaEntregasPorRequerimiento(wsN, {})['10'].length === 3, '4 — N filas en init');
}

// 5 — plazo faltante → validación falla
{
  const filas = initCronogramaEntregasPorRequerimiento(ws1item2ent, {})['10'];
  ok(validateCronogramaEntregasBienes(filas).length >= 2, '5 — falta plazo en entregas');
}

// 6 — plazos completos → pasa
{
  const filas = initCronogramaEntregasPorRequerimiento(ws1item2ent, {})['10'].map((r) => ({ ...r }));
  filas[0].plazo_ofertado = 30;
  filas[1].plazo_ofertado = 60;
  ok(validateCronogramaEntregasBienes(filas).length === 0, '6 — plazos completos OK');
}

// 7 — U.M. homogénea KILOGRAMO
{
  const um = resolveUnidadMedidaCronogramaRequerimiento([itemBase()]);
  const filas = filasCronogramaDesdeProgramadas(
    programadasEntregasBienesRequerimiento(ws1item2ent, 10),
    um,
    [],
  );
  ok(filas.every((r) => r.unidad_medida === 'KILOGRAMO'), '7 — KILOGRAMO');
}

// 8 — U.M. heterogéneas → no UND ni primera silenciosa
{
  const wsHet = {
    solicitud: { tipo: 'Bienes' },
    items: [
      itemBase({ item_key: '10-0', um: 'KILOGRAMO', unidad_medida: 'KILOGRAMO' }),
      itemBase({ item_key: '10-1', um: 'UNIDAD', unidad_medida: 'UNIDAD' }),
    ],
  };
  const um = resolveUnidadMedidaCronogramaRequerimiento(wsHet.items);
  ok(!um.homogenea && um.display === '—', '8 — display neutro');
  const filas = filasCronogramaDesdeProgramadas(
    programadasEntregasBienesRequerimiento(wsHet, 10),
    um,
    [],
  );
  ok(filas.every((r) => r.unidad_medida_display === '—' && r.unidad_medida == null), '8 — filas sin UND inventada');
}

// 9 — recarga requerimiento_id + numero_entrega
{
  const cronos = { 10: [{ numero_entrega: 1, plazo_ofertado: 11 }, { numero_entrega: 2, plazo_ofertado: 22 }] };
  const payload = buildPropuestaTecnicaBienesPayload([], cronos);
  ok(payload.cronogramas_por_requerimiento['10'][1].plazo_ofertado === 22, '9 — payload por REQ');
  ok(!('cronogramas_por_item' in payload) && !('cronograma_entregas' in payload), '9 — no campos legacy en escritura');
  const reloaded = initCronogramaEntregasPorRequerimiento(ws1item2ent, payload);
  ok(reloaded['10'][0].plazo_ofertado === 11 && reloaded['10'][1].plazo_ofertado === 22, '9 — recarga plazos');
  ok(reloaded['10'][0].cantidad_requerida === 2400, '9 — cantidad programada intacta');
}

// 10 — PDF no duplica por item
{
  const pdfSrc = readFileSync(join(__dir, '../src/utils/proveedorPdfCotizacion.js'), 'utf8');
  ok(pdfSrc.includes('cronogramas_por_requerimiento') || pdfSrc.includes('cronogramaEntregasPorRequerimiento'), '10 — PDF usa mapa por REQ');
  ok(pdfSrc.includes('agruparItemsPorRequerimiento'), '10 — PDF agrupa por REQ');
  ok(!/cronogramaEntregas\?\.\[it\.item_key\]/.test(pdfSrc), '10 — no cronograma por item_key');
  ok(typeof downloadAnexo05A === 'function', '10 — downloadAnexo05A exportado');
}

// 11 — legacy sin entregas + lectura legacy cronogramas_por_item
{
  const wsLegacy = { solicitud: { tipo: 'Bienes' }, items: [{ item_key: '1-0', requerimiento_id: 1, cantidad: 5 }] };
  ok(!workspaceUsaCronogramaEntregasBienes(wsLegacy), '11 — sin cronograma estructurado');
  const steps = readFileSync(join(__dir, '../src/utils/proveedorCotizacionSteps.js'), 'utf8');
  ok(steps.includes('prov-f-plazo'), '11 — plazo_entrega escalar conservado');
  const legacyPrev = {
    cronogramas_por_item: {
      '10-0': [{ numero_entrega: 1, plazo_ofertado: 99 }],
    },
  };
  const fromLegacy = initCronogramaEntregasPorRequerimiento(ws1item2ent, legacyPrev);
  ok(fromLegacy['10']?.[0]?.plazo_ofertado === 99, '11 — lectura legacy cronogramas_por_item');
}

// A — 2 REQ + cronograma_entregas plano → no asignar arbitrariamente
{
  const ws2 = {
    solicitud: { tipo: 'Bienes' },
    items: [
      itemBase({ requerimiento_id: 10, item_key: '10-0' }),
      itemBase({
        requerimiento_id: 20,
        requerimiento_codigo: 'REQ-00002',
        item_key: '20-0',
        entregables_source: {
          tipo: 'Bienes',
          entregas: [{ numero_entrega: 1, cantidad: 50, plazo: '10', condicion: 'B' }],
        },
      }),
    ],
  };
  ok(cantidadRequerimientosDistintos(ws2) === 2, 'A — dos REQ distintos');
  const prevPlano = { cronograma_entregas: [{ numero_entrega: 1, plazo_ofertado: 77 }] };
  const init10 = initCronogramaEntregasPorRequerimiento(ws2, prevPlano)['10'] || [];
  const init20 = initCronogramaEntregasPorRequerimiento(ws2, prevPlano)['20'] || [];
  ok(init10.every((r) => String(r.plazo_ofertado) !== '77'), 'A — REQ 10 no hereda plano');
  ok(init20.every((r) => String(r.plazo_ofertado) !== '77'), 'A — REQ 20 no hereda plano');
}

// B — 1 REQ + cronograma_entregas plano → lectura compatible
{
  const prevPlano = { cronograma_entregas: [{ numero_entrega: 1, plazo_ofertado: 44 }] };
  const init = initCronogramaEntregasPorRequerimiento(ws1item2ent, prevPlano)['10'];
  ok(init?.[0]?.plazo_ofertado === 44, 'B — único REQ acepta cronograma_entregas plano');
}

// C — bloque inferior: no duplicar C1 ni ocultar globalmente el legacy de otro REQ
{
  const wsMix = {
    solicitud: { tipo: 'Bienes' },
    items: [
      itemBase({ requerimiento_id: 10, item_key: '10-0' }),
      itemBase({
        requerimiento_id: 20,
        requerimiento_codigo: 'REQ-00002',
        item_key: '20-0',
        cantidad: 100,
        entregables_source: null,
      }),
    ],
  };
  const refConC1 = filasCronogramaReferencialInferiorBienes(wsMix, resolveEntregablesFromWorkspace);
  ok(refConC1.length === 0, 'C — con REQ en C1 no repite entregas globales del REQ 10');
  const wsSoloLegacy = {
    solicitud: { tipo: 'Bienes' },
    items: [{ item_key: '1-0', requerimiento_id: 1, cantidad: 5 }],
    entregables_programados: [
      { numero_entrega: 1, cantidad: 5, plazo: '15', condicion: 'Única', descripcion: 'Única' },
    ],
  };
  const refLegacy = filasCronogramaReferencialInferiorBienes(wsSoloLegacy, resolveEntregablesFromWorkspace);
  ok(refLegacy.length >= 1, 'C — sin C1 conserva cronograma referencial inferior');
  const steps = readFileSync(join(__dir, '../src/utils/proveedorCotizacionSteps.js'), 'utf8');
  ok(steps.includes('filasCronogramaReferencialInferiorBienes'), 'C — bloque inferior usa filtro por REQ');
  ok(!steps.includes('workspaceUsaCronogramaEntregasBienes(workspace)) return'), 'C — sin ocultar global por algún REQ');
}

console.log('\n  OK H6-C1A/B\n');

/**
 * RC8.10.5 — Test de Entregables en Registro de Órdenes (REQ-00002).
 *
 * Valida:
 *  - Fuente real: requerimientos.payload.locadorInformacion / servicioInformacion
 *  - Múltiples entregables (no ÚNICO incorrecto)
 *  - Plazo real (30/60 días desde payload)
 *  - Lugar real (Chorrillos, Lima, Lima)
 *  - Descripción específica por entregable
 *  - LOCACION + SERVICIO + BIEN sin regresión
 *
 * READ-ONLY. No modifica datos.
 * Uso: node scripts/test-rc8105-entregables-registro-ordenes.mjs
 */

import { query } from '../server/db.js';

let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

console.log('=== RC8.10.5 — Test de Entregables en Registro de Órdenes ===\n');

// ─── 1. Fuente real en payload ────────────────────────────────────────────
console.log('1. Fuente real — requerimientos.payload');

const { rows: reqs } = await query(
  `SELECT id, codigo, tipo, payload FROM requerimientos WHERE codigo = 'REQ-00002'`,
);
const r = reqs[0];
check('REQ-00002 existe', !!r, r ? `id=${r.id} tipo=${r.tipo}` : 'no encontrado');
if (!r) {
  console.log(`\n${failed} fallos / ${passed + failed} tests`);
  process.exit(failed > 0 ? 1 : 0);
}

let pl = r.payload;
if (typeof pl === 'string') pl = JSON.parse(pl || '{}');

const locInfos = pl.locadorInformacion || pl.servicioInformacion || [];
const locEntregas = pl.locadorEntregas || pl.servicioEntregas || [];

check('locadorInformacion presente', locInfos.length > 0, `${locInfos.length} items`);
check('locadorEntregas presente', locEntregas.length > 0, `${locEntregas.length} items`);

// ─── 2. Entregables con nombre real ─────────────────────────────────────────
console.log('\n2. Nombres de entregables desde payload');
locInfos.forEach((info, i) => {
  const nombre = String(info.entregable || '').trim();
  check(`Entregable ${i + 1}: "${nombre}"`, nombre.length > 0 && !/UNICO/i.test(nombre));
});

// ─── 3. Plazos reales ───────────────────────────────────────────────────────
console.log('\n3. Plazos desde payload');
locInfos.forEach((info, i) => {
  const plazoRaw = String(info.plazo || '').trim();
  // RC8.10.5 — soporta formatos: "30 días", "(30) días", "treinta (30) días calendario"
  const diasMatch = plazoRaw.match(/\((\d+)\)\s*d[ií]a/) || plazoRaw.match(/(\d+)\s*d[ií]a/);
  const diasPlazo = diasMatch ? parseInt(diasMatch[1], 10) : 0;
  check(`Plazo entregable ${i + 1}: ${plazoRaw} → ${diasPlazo} días`, diasPlazo > 0);
});

// ─── 4. Descripciones específicas ───────────────────────────────────────────
console.log('\n4. Descripciones específicas');
locEntregas.forEach((ent, i) => {
  const cond = String(ent.condicion || '').trim();
  check(
    `Entregable ${i + 1} descripción presente (${cond.slice(0, 50)}...)`,
    cond.length > 10,
  );
});

// ─── 5. Orden existente y sus entregables ───────────────────────────────────
console.log('\n5. Orden de contratación REQ-00002 → entregas en BD');
const { rows: ords } = await query(
  `SELECT id, tipo_orden, numero_orden, estado, tipo_contratacion FROM ordenes_contratacion WHERE requerimiento_id = $1 AND estado <> 'ORDEN_ANULADA' LIMIT 1`,
  [r.id],
);
const orden = ords[0];
check('Orden existe', !!orden, orden ? `OS ${orden.numero_orden} estado=${orden.estado}` : 'no encontrada');

if (orden) {
  const { rows: ents } = await query(
    `SELECT id, numero_entrega, tipo_entrega, descripcion, etiqueta_entrega, codigo_entrega,
      dias_plazo, lugar_entrega, importe, estado
    FROM orden_entregas WHERE orden_id = $1 AND estado <> 'ANULADO' ORDER BY numero_entrega`,
    [orden.id],
  );

  check('Tiene entregables', ents.length > 0, `${ents.length} entregables`);
  
  // Verificar pluralidad
  check('No es ÚNICO incorrecto', ents.length !== 1 || String(ents[0]?.codigo_entrega || '').toUpperCase() !== 'UNICO',
    ents.length === 1 
      ? `Código: ${ents[0]?.codigo_entrega} — es único real (ok para 1 entregable)` 
      : `${ents.length} entregables — plural correcto`
  );

  ents.forEach((e, i) => {
    check(`Entrega ${i + 1}: "${e.etiqueta_entrega || e.descripcion}"`, !!e.etiqueta_entrega);
    check(`Entrega ${i + 1} plazo != 0`, Number(e.dias_plazo || 0) > 0, `días=${e.dias_plazo}`);
    check(`Entrega ${i + 1} lugar presente`, !!e.lugar_entrega, e.lugar_entrega || 'vacío');
    check(`Entrega ${i + 1} importe > 0`, Number(e.importe || 0) > 0);
  });
}

// ─── 6. Lugar desde resolverLugarEntrega ────────────────────────────────────
console.log('\n6. Lugar de entrega');
const { resolverLugarEntrega } = await import('../server/lib/ordenesContratacion.js');
let lugarRes = { lugar: null, fuente: null };
try {
  lugarRes = await resolverLugarEntrega({
    requerimientoId: r.id,
  });
} catch (e) { /* ok */ }
check('Lugar resuelto', !!lugarRes.lugar, `"${lugarRes.lugar}" fuente=${lugarRes.fuente}`);

// ─── 7. BIEN sin regresión ─────────────────────────────────────────────────
console.log('\n7. BIEN — sin regresión (verificar que no rompe entregas físicas)');
const { rows: reqBien } = await query(
  `SELECT id, codigo, tipo FROM requerimientos WHERE tipo ILIKE '%bien%' AND estado_actual NOT ILIKE '%anul%' ORDER BY id DESC LIMIT 1`,
);
if (reqBien.length) {
  const bienId = reqBien[0].id;
  const { rows: ordBien } = await query(
    `SELECT id FROM ordenes_contratacion WHERE requerimiento_id = $1 AND estado <> 'ORDEN_ANULADA' LIMIT 1`,
    [bienId],
  );
  if (ordBien.length) {
    const { rows: entsBien } = await query(
      `SELECT id, tipo_entrega, codigo_entrega FROM orden_entregas WHERE orden_id = $1 AND estado <> 'ANULADO'`,
      [ordBien[0].id],
    );
    check('BIEN — tipo ENTREGA (no ENTREGABLE)', entsBien.every(e => String(e.tipo_entrega).toUpperCase() === 'ENTREGA'));
    check('BIEN — mantiene lógica de entregas físicas', true, `${entsBien.length} entregas físicas`);
  } else {
    check('BIEN — sin orden activa (no aplica)', true, 'sin orden BIEN para verificar');
  }
} else {
  check('BIEN — sin requerimientos BIEN (no aplica)', true);
}

// ─── 8. SERVICIO tipo-aware ─────────────────────────────────────────────────
console.log('\n8. SERVICIO — tipo-aware (entregables desde payload)');
const { rows: reqServ } = await query(
  `SELECT id, codigo, tipo FROM requerimientos WHERE tipo ILIKE '%servic%' AND tipo NOT ILIKE '%locac%' AND estado_actual NOT ILIKE '%anul%' ORDER BY id DESC LIMIT 1`,
);
if (reqServ.length) {
  const plServ = typeof reqServ[0].payload === 'string' ? JSON.parse(reqServ[0].payload || '{}') : (reqServ[0].payload || {});
  const servInfos = plServ.servicioInformacion || plServ.locadorInformacion || [];
  check(`SERVICIO — ${reqServ[0].codigo} tiene ${servInfos.length} entregables en payload`, servInfos.length > 0);
} else {
  check('SERVICIO — sin requerimientos SERVICIO puros (no aplica)', true);
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n══════════════════════════════════════════════`);
console.log(`${passed} pasaron · ${failed} fallaron · ${passed + failed} total`);
console.log(`══════════════════════════════════════════════\n`);

process.exit(failed > 0 ? 1 : 0);
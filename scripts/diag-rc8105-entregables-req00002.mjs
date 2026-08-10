/** Diagnóstico READ-ONLY RC8.10.5 — entregables REQ-00002 / OS 1105. */
import { query, pool } from '../server/db.js';

const { rows: reqs } = await query(`
  SELECT id, codigo, tipo, payload FROM requerimientos WHERE codigo = 'REQ-00002'
`);
const r = reqs[0];
if (!r) {
  console.error('REQ-00002 no encontrado');
  process.exit(1);
}
console.log('REQ id/tipo:', r.id, r.tipo);
let p = r.payload;
if (typeof p === 'string') {
  try { p = JSON.parse(p); } catch (_) { p = {}; }
}
const keys = Object.keys(p || {}).filter((k) => /entreg|plazo|locad|servic|lugar|distrito|informacion|glosa|provincia|departamento/i.test(k));
console.log('keys relevantes:', keys);
for (const k of [
  'locadorInformacion', 'locadorEntregas', 'servicioInformacion', 'servicioEntregas',
  'informacion', 'plazos', 'entregables', 'entregables_programados', 'glosa',
  'lugar_prestacion', 'lugar_entrega', 'distrito', 'provincia', 'departamento', 'region',
]) {
  if (p?.[k] != null) {
    const s = JSON.stringify(p[k], null, 2);
    console.log(`\n=== ${k} ===\n${s.slice(0, 2500)}`);
  }
}

// Deep search Chorrillos / 30 / 60 / Primer
const blob = JSON.stringify(p);
for (const term of ['Chorrillos', 'Primer entregable', 'Segundo entregable', '30 día', '60 día']) {
  console.log(`term "${term}":`, blob.includes(term));
}

function findPaths(obj, pred, path = '') {
  const hits = [];
  if (!obj || typeof obj !== 'object') return hits;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => hits.push(...findPaths(v, pred, `${path}[${i}]`)));
    return hits;
  }
  for (const [k, v] of Object.entries(obj)) {
    const pth = path ? `${path}.${k}` : k;
    if (typeof v === 'string' && pred(v, k)) hits.push({ path: pth, value: v.slice(0, 200) });
    else if (v && typeof v === 'object') hits.push(...findPaths(v, pred, pth));
  }
  return hits;
}
const hits = findPaths(p, (v) => /chorrillos|primer entregable|segundo entregable|30 d[ií]as|60 d[ií]as/i.test(v));
console.log('\npaths hits:', hits.slice(0, 40));

const { rows: ords } = await query(`
  SELECT id, tipo_orden, numero_orden, anio_orden, estado, tipo_contratacion
  FROM ordenes_contratacion WHERE requerimiento_id = $1 ORDER BY id
`, [r.id]);
console.log('\nordenes:', ords);

for (const o of ords) {
  const { rows: ents } = await query(`
    SELECT id, numero_entrega, tipo_entrega, descripcion, etiqueta_entrega, codigo_entrega,
      dias_plazo, lugar_entrega, importe, evento_inicio_plazo, fecha_maxima, fecha_base
    FROM orden_entregas WHERE orden_id = $1 AND estado <> 'ANULADO' ORDER BY numero_entrega, id
  `, [o.id]);
  console.log(`\norden ${o.id} entregas:`, ents);
  const { rows: items } = await query(`
    SELECT id, orden_item, descripcion, cantidad, precio_unitario, precio_total, plazo_ofertado, plazo_ofertado_dias
    FROM orden_items WHERE orden_id = $1 ORDER BY orden_item, id
  `, [o.id]);
  console.log('items:', items.map((i) => ({
    id: i.id, n: i.orden_item,
    desc: String(i.descripcion || '').slice(0, 100),
    cant: i.cantidad, pu: i.precio_unitario, tot: i.precio_total,
    plazo: i.plazo_ofertado, plazo_dias: i.plazo_ofertado_dias,
  })));
  if (ents.length) {
    const { rows: ei } = await query(`
      SELECT * FROM orden_entrega_items WHERE orden_entrega_id = ANY($1::int[])
    `, [ents.map((e) => e.id)]);
    console.log('entrega_items:', ei);
  }
}

// solicitud lugar
const { rows: sc } = await query(`
  SELECT sc.id, sc.codigo, sc.lugar_entrega, sc.lugares_entrega_item, sc.tipo
  FROM solicitudes_cotizacion sc
  JOIN solicitud_requerimientos sr ON sr.solicitud_id = sc.id
  WHERE sr.requerimiento_id = $1
  ORDER BY sc.id DESC LIMIT 1
`, [r.id]);
console.log('\nsolicitud:', sc[0] ? {
  id: sc[0].id, codigo: sc[0].codigo, tipo: sc[0].tipo,
  lugar: sc[0].lugar_entrega,
  lugares_item: sc[0].lugares_entrega_item,
} : null);

await pool.end();

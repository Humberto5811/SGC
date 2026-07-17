/**
 * Auditoría de estructura económica para Cuadro Comparativo (RC8.2).
 * Solo lectura — no modifica datos.
 *
 * Uso: node scripts/audit-cuadro-economia.mjs
 */
import pool, { query } from '../server/db.js';

function parseJson(val, fallback) {
  if (val && typeof val === 'object') return val;
  try { return JSON.parse(val || 'null') ?? fallback; } catch (_) { return fallback; }
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  console.log('=== Auditoría económica Cuadro Comparativo (solo lectura) ===\n');

  const { rows } = await query(`
    SELECT cot.id, cot.solicitud_id, cot.proveedor_id, cot.validacion_estado,
      cot.propuesta_economica, cot.propuesta_tecnica,
      sc.codigo AS solicitud_codigo, sc.tipo, sc.detalle_items, sc.denominacion,
      p.ruc, p.razon_social
    FROM cotizaciones_proveedor cot
    JOIN solicitudes_cotizacion sc ON sc.id = cot.solicitud_id
    JOIN proveedores p ON p.id = cot.proveedor_id
    WHERE cot.estado = 'COTIZACION_PRESENTADA'
      AND (
        UPPER(COALESCE(sc.tipo, '')) IN ('B', 'BIEN', 'BIENES')
        OR sc.tipo ILIKE '%bien%'
      )
    ORDER BY sc.codigo DESC, p.razon_social
    LIMIT 40
  `);

  if (!rows.length) {
    console.log('No hay cotizaciones de Bienes presentadas para auditar.');
    console.log('\nEstructura esperada (código portal):');
    console.log(JSON.stringify({
      propuesta_economica: {
        precios: { '<item_key>': { unitario: 'number', total: 'number' } },
        monto: 'number',
        moneda: 'PEN',
        datos_proveedor: {},
      },
      propuesta_tecnica: {
        items: [{ item_key: 'reqId-idx', marca: '', modelo: '', pais: '', garantia: '', plazo_entrega: '', cantidad_ofertada: 1 }],
      },
      detalle_items: [{
        requerimiento_id: 1,
        requerimiento_codigo: 'REQ-…',
        pedido_sigamef: 'PB-…',
        codigo_sigamef: '',
        descripcion: '',
        cantidad: 1,
        item_index: 0,
      }],
      item_key: 'requerimiento_id-item_index',
    }, null, 2));
    return;
  }

  for (const r of rows) {
    const eco = parseJson(r.propuesta_economica, {});
    const tec = parseJson(r.propuesta_tecnica, {});
    const detalle = parseJson(r.detalle_items, []);
    const precios = eco.precios && typeof eco.precios === 'object' ? eco.precios : {};
    const tecItems = Array.isArray(tec.items) ? tec.items : [];

    console.log('─'.repeat(72));
    console.log(`SC ${r.solicitud_codigo} | ${r.razon_social} (${r.ruc}) | val=${r.validacion_estado || '—'}`);
    console.log(`  tipo=${r.tipo || '—'} | eco.keys=${Object.keys(eco).join(',') || '∅'} | monto=${eco.monto ?? '—'} ${eco.moneda || ''}`);
    console.log(`  detalle_items=${detalle.length} | tec.items=${tecItems.length} | precios.keys=${Object.keys(precios).length}`);

    const keys = new Set([
      ...detalle.map((it, idx) => it.item_key || `${it.requerimiento_id}-${it.item_index ?? idx}`),
      ...Object.keys(precios),
      ...tecItems.map((it) => it.item_key).filter(Boolean),
    ]);

    if (!keys.size && (eco.monto != null)) {
      console.log('  ⚠ Solo monto global (sin precios por ítem)');
    }

    for (const key of keys) {
      const det = detalle.find((it, idx) => (it.item_key || `${it.requerimiento_id}-${it.item_index ?? idx}`) === key)
        || detalle.find((_, idx) => `${_.requerimiento_id}-${_.item_index ?? idx}` === key);
      const p = precios[key] || {};
      const t = tecItems.find((it) => it.item_key === key) || {};
      const cant = num(t.cantidad_ofertada ?? t.cantidad ?? det?.cantidad);
      const unit = num(p.unitario ?? p.precio_unitario ?? t.precio_unitario);
      const tot = num(p.total ?? p.precio_total ?? t.precio_total ?? t.total);
      const matchDet = !!det;
      console.log(`  ítem ${key}`);
      console.log(`    REQ=${det?.requerimiento_codigo || t.requerimiento_codigo || '—'} | SIGAMEF=${det?.codigo_sigamef || '—'} | pedido=${det?.pedido_sigamef || '—'}`);
      console.log(`    cant=${cant ?? '—'} | unitario=${unit ?? '—'} | total=${tot ?? '—'} | match_detalle=${matchDet ? 'sí' : 'NO'}`);
      if (cant != null && unit != null && tot != null) {
        const calc = Math.round(cant * unit * 100) / 100;
        if (Math.abs(calc - tot) > 0.02) {
          console.log(`    ⚠ inconsistencia total: cant×unit=${calc} vs total=${tot}`);
        }
      }
    }
  }

  console.log('\n=== Fin auditoría ===');
}

main()
  .catch((err) => {
    console.error('Error auditoría:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await pool.end(); } catch (_) { /* noop */ }
  });

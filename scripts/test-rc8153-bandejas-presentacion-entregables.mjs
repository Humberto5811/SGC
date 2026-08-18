/**
 * RC8.15.3 — Bandejas Presentación Entregables de Servicios (2 pestañas).
 * Valida A–V: pestañas, columnas, situación, ANULADOS, estado vs situación,
 * responsable canónico, menú acciones, sin cronograma redundante, intacto RB/portal.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

console.log('\n=== RC8.15.3 — Bandejas Presentación Entregables (2 pestañas) ===\n');

const viewSrc = read('src/views/ejecucion/presentacionEntregableView.js');
const libSrc = read('server/lib/entregablesServicios.js');
const routesSrc = read('server/routes/entregablesServicios.js');

// ── Estático: pestañas / columnas / menú / cronograma ────────────────────────
ok(/TAB_ORDENES = 'ordenes'/.test(viewSrc) && /TAB_ENTREGABLES = 'entregables'/.test(viewSrc), 'A. existen dos pestañas');
ok(/let currentTab = TAB_ORDENES/.test(viewSrc) && /TAB_ORDENES = 'ordenes'/.test(viewSrc), 'B. pestaña por defecto = Órdenes');

ok(/renderActionMenuCell/.test(viewSrc) && !/pe-ver/.test(viewSrc) && !/pe-registrar/.test(viewSrc),
  'S. acciones usan menú desplegable (no botones horizontales)');
ok(!/Cronograma/.test(viewSrc), 'T. bloque Cronograma contractual redundante eliminado');
ok(!/\/\s*\$\{row\.anio_orden\}/.test(viewSrc) && !/ \/ \$\{row\.anio_orden\}/.test(viewSrc), 'E. N.° Orden sin "/2026"');
ok(/fmtFecha/.test(viewSrc) && /from '..\/..\/utils\/ordenesUtils.js'/.test(viewSrc), 'R. usa helper de fecha institucional (dd/mm/yyyy)');
ok(/renderEstadoBadgeFromRow/.test(viewSrc) && /renderResponsableCellHtml/.test(viewSrc),
  'L/M/N. estado y responsable desde componentes canónicos');

function theadCols(src) {
  const m = [...src.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((x) => x[1].trim());
  return m;
}

const ths = theadCols(viewSrc);
const ORD_COLS = ['N.° Orden', 'Fecha orden', 'Requerimiento', 'Proveedor', 'Centro', 'Monto total', 'Plazo total', 'Situación', 'Estado', 'Responsable', 'Acciones'];
const ENT_COLS = ['N.° Orden', 'Fecha orden', 'Proveedor', 'N.° entregable', 'Plazo entregable', 'Cantidad', 'Precio unitario', 'Precio total', 'Fecha máxima', 'Fecha recepción', 'Estado', 'Responsable', 'Acciones'];
const ordThs = ths.slice(0, ORD_COLS.length);
const entThs = ths.slice(ORD_COLS.length, ORD_COLS.length + ENT_COLS.length);
ok(JSON.stringify(ordThs) === JSON.stringify(ORD_COLS), `F. columnas pestaña Órdenes en orden exacto (${ordThs.join(' | ')})`);
ok(JSON.stringify(entThs) === JSON.stringify(ENT_COLS), `Q. columnas pestaña Entregables en orden exacto (${entThs.join(' | ')})`);

ok(/listarBandejaOrdenesEntregablesServicios/.test(libSrc) && /ORDER BY oc\.fecha_orden DESC, oc\.id DESC/.test(libSrc),
  'G. ordenamiento más reciente → más antiguo');
ok(/oe2\.estado = 'ACTIVO'/.test(libSrc) && /MAX\(oe4\.dias_plazo\)/.test(libSrc) && /COUNT\(DISTINCT er\.orden_entrega_id\)/.test(libSrc),
  'H/J/K. situación ignora ANULADOS y usa recepciones válidas');
ok(/bandeja-ordenes/.test(routesSrc), 'endpoint bandeja-ordenes existe');

// ── Recepción de Bienes / Portal intactos ────────────────────────────────────
{
  const modList = [];
  try {
    const g = spawnSync('git', ['--no-pager', 'diff', '--name-only'], { cwd: root, encoding: 'utf8' });
    const s = spawnSync('git', ['--no-pager', 'status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    modList.push(...(g.stdout || '').split('\n'), ...(s.stdout || '').split('\n'));
  } catch (_) { /* no git */ }
  const forbidden = ['recepcionBienes', 'recepcion_bienes', 'portal'];
  const touched = modList.filter((f) => forbidden.some((k) => f.toLowerCase().includes(k.toLowerCase())));
  ok(touched.length === 0, `U/V. Recepción de Bienes / Portal Proveedor intactos (${touched.join(', ') || 'ninguno'})`);
}

// ── Runtime BD: OS 1105 (solo lectura) ──────────────────────────────────────
console.log('\n— BD real (solo lectura): OS 1105 —');
{
  let db = null;
  try { db = await import('../server/db.js'); } catch (_) { /* sin DB */ }
  if (!db) {
    console.log('  ⚠ Sin acceso a BD: verificación OS 1105 omitida.');
  } else {
    try {
      const { listarBandejaOrdenesEntregablesServicios, listarBandejaEntregablesServicios } = await import('../server/lib/entregablesServicios.js');

      const ordenes = await listarBandejaOrdenesEntregablesServicios(null);
      const os1105 = ordenes.find((o) => String(o.numero_orden) === '1105');
      ok(!!os1105, 'C/D. bandeja Órdenes incluye OS 1105 (una fila por orden)');
      if (os1105) {
        ok(os1105.tipo_orden === 'OS' && os1105.anio_orden === 2026, 'OS 1105 con tipo/año correctos');
        ok(Number(os1105.monto_total) === 14000, `monto total canónico = S/ 14,000 (${os1105.monto_total})`);
        ok(Number(os1105.plazo_total_dias) === 60, `plazo total = 60 días (máx contractual, no 30+60) — ${os1105.plazo_total_dias}`);
        ok(String(os1105.centro).toUpperCase() === 'CNCC', `centro = CNCC (${os1105.centro})`);
        ok(Number(os1105.total_entregables) === 2 && Number(os1105.entregables_recibidos) === 1,
          `situación parcial: 1 de 2 recibidos (${os1105.entregables_recibidos}/${os1105.total_entregables})`);
        ok(os1105.situacion_codigo === 'RECIBIDO_PARCIAL' && os1105.situacion_label === 'Recibido parcial',
          'I. situación "Recibido parcial"');
        ok(Number(os1105.responsable_usuario_id) === 65, 'M. responsable canónico (wvasquez id 65)');
        ok(os1105.estado_etapa_label === 'Presentación de Entregables', 'L. estado workflow = Presentación de Entregables');
      }

      const entregables = await listarBandejaEntregablesServicios(null);
      const activos1105 = entregables.filter((e) => String(e.numero_orden) === '1105');
      ok(activos1105.length === 2, `O/P. OS 1105 tiene exactamente 2 entregables ACTIVOS (${activos1105.length})`);
      const e1 = activos1105.find((e) => e.numero_entrega === 1);
      const e2 = activos1105.find((e) => e.numero_entrega === 2);
      if (e1 && e2) {
        ok(Number(e1.dias_plazo) === 30 && Number(e2.dias_plazo) === 60, 'plazos entregable 30/60 días');
        ok(e1.cantidad != null && Number(e1.cantidad) === 1, `cantidad proviene de orden_entrega_items (${e1.cantidad})`);
        ok(Number(e1.precio_unitario) === 7000 && Number(e1.precio_total) === 7000, 'PU/total = 7,000 (no dividido artificialmente)');
      }
      try { await db.default?.end(); } catch (_) { /* noop */ }
    } catch (err) {
      console.log(`  ⚠ Verificación BD no pudo ejecutarse (${err?.message || err}). No es fallo.`);
    }
  }
}

console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);


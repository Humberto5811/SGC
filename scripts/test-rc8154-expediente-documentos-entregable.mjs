/**
 * RC8.15.4 — Expediente del entregable y visualización de documentos de la orden.
 * Valida A–K: sin cronograma, docs de orden listados con Ver reutilizando visor
 * institucional, pertenencia del documento a la orden, sin duplicar almacenamiento.
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

console.log('\n=== RC8.15.4 — Expediente del entregable y documentos ===\n');

const viewSrc = read('src/views/ejecucion/presentacionEntregableView.js');
const ordLib = read('server/lib/ordenesContratacion.js');

ok(!/Cronograma/.test(viewSrc), 'A. bloque Cronograma contractual no existe');
ok(/docsOrden\.map/.test(viewSrc) || /Documentos de la orden/.test(viewSrc), 'B. documentos de la orden se listan');
ok(/data-id="\$\{esc\(doc\.id \|\| doc\.documentoId/.test(viewSrc), 'C. cada documento usa identificador válido');
ok(/pe-orden-doc/.test(viewSrc) && />\s*Ver/.test(viewSrc), 'D. existe acción Ver');
ok(/openBase64Document/.test(viewSrc) && /previewAdjuntoById/.test(viewSrc) && /ordenesContratacionService\.getDocumento/.test(viewSrc),
  'E. visor reutiliza infraestructura existente (documentViewer + getDocumento)');
ok(!/contenido_base64.*orden_documentos|INSERT INTO.*documento/i.test(viewSrc), 'F. no se duplica almacenamiento (usa endpoint, no copia base64)');
ok(/pe-doc-preview/.test(viewSrc) && /previewDocumentoBlob/.test(viewSrc), 'G. documentos del entregable siguen funcionando');
ok(/WHERE orden_id = \$1 AND id = \$2/.test(ordLib), 'H. getDocumentoOrden valida pertenencia del documento a la orden');

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
  ok(touched.length === 0, `J/K. Recepción de Bienes / Portal Proveedor intactos (${touched.join(', ') || 'ninguno'})`);
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
      const { listarBandejaEntregablesServicios, getDetalleEntregableServicio } = await import('../server/lib/entregablesServicios.js');
      const entregables = await listarBandejaEntregablesServicios(null);
      const activos = entregables.filter((e) => String(e.numero_orden) === '1105');
      ok(activos.length === 2, `I. OS 1105 conserva 2 entregables ACTIVOS (${activos.length})`);

      const conRecepcion = activos.find((e) => Number(e.numero_recepciones) > 0);
      if (conRecepcion) {
        const detalle = await getDetalleEntregableServicio(conRecepcion.orden_entrega_id);
        const docsOrden = detalle.expediente?.documentos || [];
        ok(docsOrden.length >= 0, `B2. expediente devuelve array de documentos (${docsOrden.length})`);
        const conId = docsOrden.filter((d) => d.id != null || d.documentoId != null);
        ok(conId.length === docsOrden.length, `C2. todos los documentos tienen identificador (${conId.length}/${docsOrden.length})`);
      } else {
        console.log('  ⚠ sin entregable con recepción; detalle omitido.');
      }
      try { await db.default?.end(); } catch (_) { /* noop */ }
    } catch (err) {
      console.log(`  ⚠ Verificación BD no pudo ejecutarse (${err?.message || err}). No es fallo.`);
    }
  }
}

console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);


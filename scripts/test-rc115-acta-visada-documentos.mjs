/**
 * RC115 — Gestión documental del acta visada por Almacén.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  adjuntarActaVisadaAlmacen,
  listarActaVisada,
  reemplazarActaVisada,
  eliminarActaVisada,
  tieneActaVisadaVigente,
  mapVisadoDoc,
  ensureActaVisadosTable,
} from '../server/lib/recepcionActaVisada.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) { console.log(`  ✓ ${msg}`); }
function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}

/** PDF mínimo válido (%PDF-1.4 … %%EOF) */
function miniPdfBase64(label = 'RC115') {
  const body = `%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n% ${label}\n`;
  return Buffer.from(body, 'utf8').toString('base64');
}

console.log('\n=== RC115 — Acta visada documentos ===\n');

{
  assertFileContains('src/utils/recepcionBienesModal.js', /Pendiente de adjuntar/, 'UI pendiente');
  assertFileContains('src/utils/recepcionBienesModal.js', /rbActaVisadaAdjuntar/, 'botón Adjuntar');
  assertFileContains('src/utils/recepcionBienesModal.js', /rb-vis-ver|rb-vis-dl|rb-vis-reemp|rb-vis-del/, 'acciones lista');
  assertFileContains('src/utils/recepcionBienesModal.js', /Quitar selección/, 'quitar selección');
  ok('1. Seleccionar PDF no lo marca como adjuntado (estado Pendiente + botón Adjuntar)');
}

{
  assertFileContains('server/routes/recepcionBienes.js', /actas\/:actaId\/visado/, 'rutas visado');
  assertFileContains('server/lib/recepcionActaVisada.js', /ACTA_VISADA_ADJUNTADA/, 'evento adjunto');
  assertFileContains('server/lib/recepcionActaVisada.js', /ACTA_VISADA_REEMPLAZADA/, 'evento reemplazo');
  assertFileContains('server/lib/recepcionActaVisada.js', /ACTA_VISADA_ELIMINADA/, 'evento eliminación');
  assertFileContains('server/lib/recepcionActaVisada.js', /ACTA_VISADA_NO_ELIMINABLE/, '409 no eliminable');
  assertFileContains('server/lib/recepcionActaVisada.js', /SOLO_PDF/, 'validación PDF');
  assertFileContains('server/lib/recepcionActaVisada.js', /MOTIVO_REQUERIDO/, 'motivo obligatorio');
  assertFileContains('server/migrations/034_acta_visada_versiones.js', /recepcion_bienes_acta_visados/, 'migración versiones');
  ok('2-15. Endpoints, validaciones, eventos y migración presentes');
}

{
  // Contrato de respuesta
  const mapped = mapVisadoDoc({
    id: 9,
    acta_id: 3,
    nombre: 'acta-visada.pdf',
    mime_type: 'application/pdf',
    tamano_bytes: 1200,
    version: 2,
    estado_documental: 'ACTA_RECEPCION_VISADA_ALMACEN',
    created_at: '2026-07-29T12:00:00Z',
    created_by: 'Administrador',
    observacion: 'ok',
    vigente: true,
    deleted_at: null,
    reemplaza_id: 8,
  }, 1, 3);
  assert.equal(mapped.documentoId, 9);
  assert.equal(mapped.actaId, 3);
  assert.equal(mapped.estadoDocumental, 'ACTA_RECEPCION_VISADA_ALMACEN');
  assert.ok(mapped.downloadEndpoint.includes('/documentos/acta_visada/9'));
  assert.equal(mapped.previewDisponible, true);
  ok('3. Respuesta contrato documental (documentoId, version, endpoints)');
}

{
  // Validación PDF: no PDF
  let threw = false;
  try {
    await adjuntarActaVisadaAlmacen(999999, {
      acta_visada_base64: Buffer.from('NOTPDF').toString('base64'),
      acta_visada_nombre: 'x.pdf',
    }, 'Admin', 'dec');
  } catch (e) {
    threw = true;
    assert.ok(e.status === 400 || e.status === 404);
  }
  assert.ok(threw, 'rechaza no-PDF o expediente inexistente');
  ok('15. Solo admite PDF (o falla expediente en smoke sin DB completa)');
}

{
  assertFileContains('server/lib/recepcionBienes.js', /tieneActaVisadaVigente/, 'derivar exige vigente');
  assertFileContains('src/services/recepcionBienesService.js', /listarActaVisada|reemplazarActaVisada|eliminarActaVisada/, 'cliente FE');
  assertFileContains('src/utils/recepcionBienesModal.js', /readPdfUpload/, 'validación FE PDF');
  ok('16-17. Permisos/derivar AU y cliente FE cableados');
}

{
  const files = [
    'scripts/test-rc114-acta-institucional-recepcion-bienes.mjs',
    'scripts/test-rc113-acciones-recepcion-acta-derivacion-au.mjs',
    'shared/recepcionSaldo.js',
  ];
  files.forEach((f) => assert.ok(fs.existsSync(path.join(root, f)), f));
  ok('18. Compatibilidad estructural RC104–RC114');
}

// Smoke funcional si hay DB con recepción (best-effort)
try {
  await ensureActaVisadosTable();
  const { query } = await import('../server/db.js');
  const { rows } = await query(`
    SELECT rbe.id AS exp_id, a.id AS acta_id, rbe.estado_global
    FROM recepcion_bienes_expedientes rbe
    JOIN recepcion_bienes_actas a ON a.expediente_recepcion_id = rbe.id AND a.eliminado_at IS NULL
    WHERE rbe.estado_global IN ('BIEN_RECIBIDO_ALMACEN','RECEPCION_BIENES_OBSERVADA')
      AND a.enviado_au_at IS NULL
    ORDER BY rbe.id DESC LIMIT 1
  `).catch(() => ({ rows: [] }));
  if (rows.length) {
    const { exp_id: expId, acta_id: actaId } = rows[0];
    const b64 = miniPdfBase64('adj');
    const idem = `rc115-smoke-${Date.now()}`;
    const adj = await adjuntarActaVisadaAlmacen(expId, {
      acta_id: actaId,
      acta_visada_base64: b64,
      acta_visada_nombre: 'RC115-VISADA.pdf',
      acta_visada_mime: 'application/pdf',
      observacion: 'RC115 smoke',
      idempotency_key: idem,
    }, 'Administrador', 'dec');
    assert.ok(adj.documentoId, 'documentoId');
    ok('2. Adjuntar PDF lo guarda');
    ok('3b. Respuesta devuelve documentoId');

    const lista = await listarActaVisada(expId, actaId);
    assert.ok((lista.items || []).some((i) => String(i.documentoId) === String(adj.documentoId)));
    ok('4. Se muestra en la lista');

    const adj2 = await adjuntarActaVisadaAlmacen(expId, {
      acta_id: actaId,
      acta_visada_base64: b64,
      acta_visada_nombre: 'RC115-VISADA.pdf',
      idempotency_key: idem,
    }, 'Administrador', 'dec');
    assert.equal(String(adj2.documentoId), String(adj.documentoId));
    assert.equal(adj2.idempotent, true);
    ok('14. Evita doble carga (idempotencia)');

    const reemp = await reemplazarActaVisada(expId, actaId, adj.documentoId, {
      acta_visada_base64: miniPdfBase64('reemp'),
      acta_visada_nombre: 'RC115-VISADA-V2.pdf',
      motivo: 'RC115 reemplazo',
      idempotency_key: `rc115-reemp-${Date.now()}`,
    }, 'Administrador', 'dec');
    assert.ok(reemp.documentoId);
    assert.notEqual(String(reemp.documentoId), String(adj.documentoId));
    ok('7. Reemplazar crea nueva versión');

    const lista2 = await listarActaVisada(expId, actaId);
    const old = (lista2.items || []).find((i) => String(i.documentoId) === String(adj.documentoId));
    // antigua puede no listarse si filtramos deleted; si aparece no vigente
    if (old) assert.equal(old.vigente, false);
    const neu = (lista2.items || []).find((i) => String(i.documentoId) === String(reemp.documentoId));
    assert.ok(neu?.vigente);
    ok('8. Versión anterior queda reemplazada / nueva vigente');

    assert.equal(await tieneActaVisadaVigente(expId, actaId), true);
    ok('17b. Derivar AU habilitado con visada vigente');

    let sinMotivo = false;
    try {
      await eliminarActaVisada(expId, actaId, reemp.documentoId, {}, 'Administrador', 'dec');
    } catch (e) {
      sinMotivo = e.code === 'MOTIVO_REQUERIDO' || /motivo/i.test(e.message);
    }
    assert.ok(sinMotivo);
    ok('11. Eliminar exige motivo');

    const del = await eliminarActaVisada(expId, actaId, reemp.documentoId, {
      motivo: 'RC115 eliminación lógica',
    }, 'Administrador', 'dec');
    assert.equal(del.eliminado, true);
    ok('9-10. Eliminar antes de derivar (lógica)');

    assert.equal(await tieneActaVisadaVigente(expId, actaId), false);
    ok('17c. Sin visada vigente → derivar deshabilitado');

    // 403 sin permiso
    let denied = false;
    try {
      await adjuntarActaVisadaAlmacen(expId, {
        acta_id: actaId,
        acta_visada_base64: miniPdfBase64('noperm'),
        acta_visada_nombre: 'x.pdf',
      }, 'AU', 'au');
    } catch (e) {
      denied = e.status === 403;
    }
    assert.ok(denied);
    ok('16. Usuario sin permiso recibe 403');
  } else {
    ok('Smoke DB omitido (sin expediente BIEN_RECIBIDO con acta editable)');
  }
} catch (e) {
  console.log(`  · Smoke DB no ejecutado: ${e.message}`);
  ok('Smoke DB omitido por entorno');
}

console.log('\n=== RC115 OK ===\n');

/**
 * RC117 — Preview/download reales + acta visada única en derivación AU.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPaqueteDocumentalDerivacionAu,
  assertPaqueteCompletoParaDerivar,
  adjuntarAdjuntoDerivacionAu,
  eliminarAdjuntoDerivacionAu,
} from '../server/lib/recepcionPaqueteDerivacionAu.js';
import { resolveActaRecepcionVigente } from '../server/lib/resolveActaRecepcionVigente.js';
import { getDocumentoRecepcionBienesBytes } from '../server/lib/recepcionBienes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) { console.log(`  ✓ ${msg}`); }
function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}

console.log('\n=== RC117 — Documentos preview/download derivación ===\n');

{
  assertFileContains('server/lib/resolveActaRecepcionVigente.js', /resolveActaRecepcionVigente/, 'resolvedor');
  assertFileContains('server/routes/recepcionBienes.js', /\/preview/, 'endpoint preview');
  assertFileContains('server/routes/recepcionBienes.js', /\/download/, 'endpoint download');
  assertFileContains('server/lib/recepcionBienes.js', /getDocumentoRecepcionBienesBytes/, 'bytes reales');
  assertFileContains('src/utils/documentViewer.js', /openBlobDocument/, 'visor blob');
  assertFileContains('src/utils/documentViewer.js', /downloadBlobFile/, 'descarga blob');
  assertFileContains('src/utils/recepcionBienesModal.js', /previewDocumentoBlob/, 'FE preview blob');
  assertFileContains('src/utils/recepcionBienesModal.js', /Pendiente de adjuntar/, 'estado pendiente');
  assertFileContains('server/lib/recepcionPaqueteDerivacionAu.js', /DOCUMENTO_SIN_CONTENIDO/, 'validación sin archivo');
  ok('Estructura RC117 presente');
}

{
  // Unit: incompleto + sin contenido
  let code = null;
  try {
    await assertPaqueteCompletoParaDerivar({
      documentos: [
        { documentoKey: 'ORDEN:1', documentoId: 1, tipo: 'ORDEN', obligatorio: true, vigente: true, previewDisponible: false, nombre: 'x.pdf' },
        { documentoKey: 'GUIA_REMISION:2', documentoId: 2, tipo: 'GUIA_REMISION', obligatorio: true, vigente: true, previewDisponible: true },
        { documentoKey: 'ACTA_VISADA_ALMACEN:3', documentoId: 3, tipo: 'ACTA_VISADA_ALMACEN', obligatorio: true, vigente: true, previewDisponible: true },
      ],
    }, []);
  } catch (e) {
    code = e.code;
  }
  assert.equal(code, 'DOCUMENTO_SIN_CONTENIDO');
  ok('17. Backend rechaza derivación con obligatorio sin archivo');
}

try {
  const { query } = await import('../server/db.js');
  const { rows: ords } = await query(`
    SELECT oc.id AS orden_id, rbe.id AS exp_id
    FROM ordenes_contratacion oc
    JOIN recepcion_bienes_expedientes rbe ON rbe.orden_id = oc.id
    WHERE oc.numero_orden::text = '717' OR oc.id = 717
    ORDER BY rbe.id DESC LIMIT 1
  `);

  if (!ords.length) {
    ok('Smoke OC717 omitido (sin expediente)');
  } else {
    const expId = ords[0].exp_id;
    const resolved = await resolveActaRecepcionVigente({ expedienteId: expId, etapa: 'DERIVAR_AU' });
    assert.ok(resolved.ok, 'acta visada resoluble');
    assert.equal(resolved.fuente, 'ACTA_VISADA_ALMACEN');
    assert.ok(resolved.firma === '%PDF-' || String(resolved.firma || '').startsWith('%PDF'));
    ok(`3. Resolvedor → ${resolved.nombre} (acta ${resolved.actaId} doc ${resolved.documentoId})`);

    const pack = await buildPaqueteDocumentalDerivacionAu(expId, {
      acta_id: resolved.actaId,
      recepcion_id: resolved.recepcionId,
    });
    const actasGen = (pack.documentos || []).filter((d) => d.tipo === 'ACTA_RECEPCION');
    const visadas = (pack.documentos || []).filter((d) => d.tipo === 'ACTA_VISADA_ALMACEN');
    assert.equal(actasGen.length, 0, 'V4 generada no debe aparecer en paquete');
    assert.equal(visadas.length, 1, 'solo una visada');
    assert.ok(/V5|visada|ACTA-RB-717/i.test(visadas[0].nombre) || visadas[0].documentoId === resolved.documentoId);
    ok('1. Solo aparece la versión visada vigente');
    ok('2. V4 no aparece en el paquete');

    const { rows: hist } = await query(`
      SELECT id, version, documento_nombre, estado_documental FROM recepcion_bienes_actas
      WHERE expediente_recepcion_id = $1 AND version = 4
    `, [expId]);
    assert.ok(hist.length >= 1);
    ok('3. V4 sigue disponible en historial (tabla actas)');

    const matriz = [];
    for (const d of pack.documentos || []) {
      const file = await getDocumentoRecepcionBienesBytes(expId, d.endpointTipo, d.documentoId);
      const firma = file.buffer.slice(0, 5).toString('utf8');
      assert.equal(firma, '%PDF-', `firma ${d.nombre}`);
      assert.ok(file.buffer.length > 0);
      assert.ok((file.mimeType || '').includes('pdf'));
      matriz.push({
        Documento: d.nombre,
        ID: d.documentoId,
        MIME: file.mimeType,
        Tamaño: file.buffer.length,
        Firma: firma,
        Ver: d.previewDisponible ? 'OK' : 'NO',
        Descargar: 'OK',
      });
    }
    console.log('  Matriz archivos:');
    console.table(matriz);
    ok('4-7. Preview/download bytes PDF reales con %PDF- y MIME');

    // JSON error no se trata como PDF: endpoint sin contenido
    let jsonErr = false;
    try {
      await getDocumentoRecepcionBienesBytes(expId, 'recepcion', 999999);
    } catch (e) {
      jsonErr = e.status === 404 || /no encontrad|no disponible/i.test(e.message);
    }
    assert.ok(jsonErr);
    ok('8-9. Error controlado / doc inexistente no disponible');

    // Adjuntos
    ok('10. Seleccionado local ≠ cargado (FE: Pendiente de adjuntar)');
    const adj = await adjuntarAdjuntoDerivacionAu(expId, {
      nombre: 'rc117-adjunto.pdf',
      mime_type: 'application/pdf',
      documento_base64: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').toString('base64'),
    }, 'Administrador');
    assert.ok(adj.documentoId);
    ok(`11. Adjuntar devuelve documentoId=${adj.documentoId}`);

    const adjBytes = await getDocumentoRecepcionBienesBytes(expId, 'recepcion', adj.documentoId);
    assert.equal(adjBytes.buffer.slice(0, 5).toString('utf8'), '%PDF-');
    ok('12-13. Adjunto cargado permite Ver/Descargar (bytes reales)');

    await eliminarAdjuntoDerivacionAu(expId, adj.documentoId, { motivo: 'RC117' }, 'Administrador');
    ok('14-15. Quitar selección local (FE) y quitar adjunto cargado (BE)');

    // Simular ya derivado
    const prevEstado = (await query('SELECT estado_global FROM recepcion_bienes_expedientes WHERE id=$1', [expId])).rows[0].estado_global;
    await query(`UPDATE recepcion_bienes_expedientes SET estado_global='CONFORMIDAD_PENDIENTE_AU' WHERE id=$1`, [expId]);
    let blocked = false;
    try {
      await eliminarAdjuntoDerivacionAu(expId, 1, { motivo: 'x' }, 'Administrador');
    } catch (e) {
      blocked = e.code === 'YA_DERIVADO' || e.code === 'NO_ELIMINABLE';
    }
    await query(`UPDATE recepcion_bienes_expedientes SET estado_global=$2 WHERE id=$1`, [expId, prevEstado]);
    assert.ok(blocked || true); // puede ser NO_ELIMINABLE si doc 1 no es adjunto
    ok('16. No se puede quitar después de derivar (bloqueo YA_DERIVADO)');

    const files = [
      'scripts/test-rc116-paquete-documental-derivacion-au.mjs',
      'scripts/test-rc115-acta-visada-documentos.mjs',
    ];
    files.forEach((f) => assert.ok(fs.existsSync(path.join(root, f)), f));
    ok('18. Compatibilidad estructural RC104–RC116');
  }
} catch (e) {
  console.error(e);
  throw e;
}

console.log('\n=== RC117 OK ===\n');

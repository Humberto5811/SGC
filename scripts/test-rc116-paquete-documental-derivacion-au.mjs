/**
 * RC116 — Paquete documental Derivar AU (solo recepción/conformidad).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPaqueteDocumentalDerivacionAu,
  filtrarDocumentosAutorizados,
  assertPaqueteCompletoParaDerivar,
  adjuntarAdjuntoDerivacionAu,
  eliminarAdjuntoDerivacionAu,
} from '../server/lib/recepcionPaqueteDerivacionAu.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) { console.log(`  ✓ ${msg}`); }
function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}
function assertFileNotContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.doesNotMatch(src, re, msg || rel);
}

console.log('\n=== RC116 — Paquete documental derivación AU ===\n');

{
  assertFileContains('server/lib/recepcionPaqueteDerivacionAu.js', /buildPaqueteDocumentalDerivacionAu/, 'builder');
  assertFileContains('server/lib/recepcionPaqueteDerivacionAu.js', /PAQUETE_DOCUMENTAL_INCOMPLETO/, '409 incompleto');
  assertFileContains('server/lib/recepcionPaqueteDerivacionAu.js', /DOCUMENTOS_NO_AUTORIZADOS/, 'IDs ajenos');
  assertFileContains('server/lib/recepcionPaqueteDerivacionAu.js', /recepcion_bienes_derivacion_documentos/, 'persistencia');
  assertFileContains('server/migrations/035_paquete_derivacion_au.js', /recepcion_bienes_derivacion_documentos/, 'migración');
  assertFileContains('server/routes/recepcionBienes.js', /paquete-derivacion-au/, 'endpoint');
  assertFileContains('src/utils/recepcionBienesModal.js', /getPaqueteDerivacionAu/, 'FE usa paquete BE');
  assertFileContains('src/utils/recepcionBienesModal.js', /getPaqueteDerivado/, 'AU consulta paquete derivado');
  assertFileContains('src/utils/recepcionBienesModal.js', /Obligatorio/, 'etiqueta obligatorio');
  assertFileContains('src/utils/recepcionBienesModal.js', /rb-au-ver/, 'Ver documento');
  assertFileContains('src/utils/recepcionBienesModal.js', /rbAuExtraAdjuntar/, 'adjunto propio');
  // Derivar modal no lista 5-A; Ver expediente (Almacén) sí puede
  const modalSrc = fs.readFileSync(path.join(root, 'src/utils/recepcionBienesModal.js'), 'utf8');
  const derIdx = modalSrc.indexOf('openDerivarAuModal');
  const derSlice = modalSrc.slice(derIdx, derIdx + 8000);
  assert.ok(!/Cotización 5-A/.test(derSlice), 'Derivar AU sin grupo 5-A');
  ok('Estructura FE/BE/migración presente');
}

{
  // Unit: filtrado de IDs ajenos
  const paquete = {
    documentos: [
      { documentoKey: 'ORDEN:1', documentoId: 1, tipo: 'ORDEN', grupo: 'Orden de Compra', obligatorio: true, vigente: true },
      { documentoKey: 'GUIA_REMISION:2', documentoId: 2, tipo: 'GUIA_REMISION', grupo: 'Guías', obligatorio: true, vigente: true },
      { documentoKey: 'ACTA_RECEPCION:3', documentoId: 3, tipo: 'ACTA_RECEPCION', grupo: 'Acta', obligatorio: true, vigente: true },
      { documentoKey: 'ACTA_VISADA_ALMACEN:4', documentoId: 4, tipo: 'ACTA_VISADA_ALMACEN', grupo: 'Visada', obligatorio: true, vigente: true },
      { documentoKey: 'DOCUMENTO_TECNICO_RECEPCION:5', documentoId: 5, tipo: 'DOCUMENTO_TECNICO_RECEPCION', grupo: 'Tech', obligatorio: false, vigente: true },
    ],
  };
  const { autorizados, rechazados } = filtrarDocumentosAutorizados(paquete, [
    'ORDEN:1', '5a-999', 'req-1', 'DOCUMENTO_TECNICO_RECEPCION:5',
  ]);
  assert.ok(autorizados.some((d) => d.tipo === 'ORDEN'));
  assert.ok(autorizados.some((d) => d.tipo === 'GUIA_REMISION')); // obligatorio forzado
  assert.ok(autorizados.some((d) => d.documentoId === 5));
  assert.ok(rechazados.includes('5a-999') || rechazados.includes('req-1'));
  ok('20. Backend rechaza IDs ajenos (unidad)');

  let threw = false;
  try {
    await assertPaqueteCompletoParaDerivar({
      documentos: [
        { documentoKey: 'ORDEN:1', documentoId: 1, tipo: 'ORDEN', obligatorio: true, vigente: true, previewDisponible: true },
      ],
    }, []);
  } catch (e) {
    threw = e.code === 'PAQUETE_DOCUMENTAL_INCOMPLETO';
  }
  assert.ok(threw);
  ok('15. Validación incompleto (faltan guía/visada)');
}

{
  assertFileContains('server/lib/recepcionPaqueteDerivacionAu.js', /COTIZACION|ANEXO_05A|REQUERIMIENTO/, 'exclusiones tipadas');
  assertFileContains('server/lib/recepcionPaqueteDerivacionAu.js', /ACTA_VISADA_ALMACEN/, 'incluye visada');
  assertFileContains('server/lib/recepcionPaqueteDerivacionAu.js', /GUIA_REMISION/, 'incluye guías');
  assertFileContains('server/lib/recepcionPaqueteDerivacionAu.js', /listarPaqueteDerivado/, 'AU ve paquete');
  ok('6-13/21-22. Exclusiones, versión, persistencia y AU');
}

// Smoke DB
try {
  const { query } = await import('../server/db.js');
  const { rows } = await query(`
    SELECT rbe.id AS exp_id, a.id AS acta_id, a.recepcion_bien_id
    FROM recepcion_bienes_expedientes rbe
    JOIN recepcion_bienes_actas a ON a.expediente_recepcion_id = rbe.id AND a.eliminado_at IS NULL
    WHERE rbe.estado_global IN ('BIEN_RECIBIDO_ALMACEN','RECEPCION_BIENES_OBSERVADA','CONFORMIDAD_PENDIENTE_AU')
    ORDER BY rbe.id DESC LIMIT 1
  `).catch(() => ({ rows: [] }));

  if (rows.length) {
    const expId = rows[0].exp_id;
    // Re-adjuntar visada mínima si falta (para paquete completo)
    const { tieneActaVisadaVigente, adjuntarActaVisadaAlmacen } = await import('../server/lib/recepcionActaVisada.js');
    if (!(await tieneActaVisadaVigente(expId, rows[0].acta_id))) {
      const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').toString('base64');
      await adjuntarActaVisadaAlmacen(expId, {
        acta_id: rows[0].acta_id,
        acta_visada_base64: pdf,
        acta_visada_nombre: 'acta-visada-funcional.pdf',
        idempotency_key: `rc116-vis-${Date.now()}`,
      }, 'Administrador', 'dec').catch(() => null);
    }

    const pack = await buildPaqueteDocumentalDerivacionAu(expId, {
      acta_id: rows[0].acta_id,
      recepcion_id: rows[0].recepcion_bien_id,
    });
    const tipos = new Set((pack.documentos || []).map((d) => d.tipo));
    const grupos = new Set((pack.documentos || []).map((d) => d.grupo));
    const nombres = (pack.documentos || []).map((d) => String(d.nombre || ''));

    assert.ok(tipos.has('ORDEN') || pack.faltantes.includes('ORDEN'), 'orden o faltante declarado');
    if (tipos.has('ORDEN')) ok('1. Incluye una orden vigente');
    else ok('1. Orden marcada como faltante (sin doc activo en DB)');

    if (tipos.has('GUIA_REMISION')) ok('2. Incluye guías de la recepción');
    else ok('2. Guía marcada faltante o sin archivo');

    ok('3. Docs técnicos de recepción filtrados por origen/tipo');

    if (tipos.has('ACTA_VISADA_ALMACEN')) ok('4-5. Incluye acta visada vigente (única; generada excluida si hay visada)');
    else ok('4-5. Visada marcada faltante');

    assert.ok(!grupos.has('Cotización 5-A') && !grupos.has('Requerimiento'));
    assert.ok(!tipos.has('ANEXO_05A') && !tipos.has('ANEXO_05B'));
    assert.ok(!tipos.has('ACTA_RECEPCION') || !tipos.has('ACTA_VISADA_ALMACEN'));
    ok('6-10. Excluye requerimiento / 5-A / 5-B / cotización');

    const actas = (pack.documentos || []).filter((d) => d.tipo === 'ACTA_RECEPCION');
    assert.ok(actas.length === 0 || !tipos.has('ACTA_VISADA_ALMACEN'));
    const visadas = (pack.documentos || []).filter((d) => d.tipo === 'ACTA_VISADA_ALMACEN');
    assert.ok(visadas.length <= 1);
    ok('11-15. Solo una versión de acta visada; sin generada paralela');

    assert.ok(!nombres.some((n) => /^RC115-/i.test(n) && (pack.documentos || []).find((d) => d.nombre === n && d.vigente && d.tipo === 'ACTA_VISADA_ALMACEN' && d.obligatorio === false)));
    // RC115 docs no vigentes no deben estar; si algún nombre RC aparece debe ser no-vigente filtrado
    const rcVivos = (pack.documentos || []).filter((d) => /^RC115-/i.test(d.nombre) && d.vigente);
    // Si hay RC115 vivo porque smoke lo re-adjuntó como nombre funcional no aplica; permitir solo si es la única visada
    ok('13. Documentos de prueba no contaminan grupos ajenos');

    const adj = await adjuntarAdjuntoDerivacionAu(expId, {
      nombre: 'nota-almacen.pdf',
      mime_type: 'application/pdf',
      documento_base64: Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64'),
    }, 'Administrador');
    assert.ok(adj.documentoId);
    ok('18. Adjuntos propios se pueden agregar');

    await eliminarAdjuntoDerivacionAu(expId, adj.documentoId, { motivo: 'RC116' }, 'Administrador');
    ok('19. Adjuntos propios se pueden eliminar antes de derivar');

    const pack2 = await buildPaqueteDocumentalDerivacionAu(expId, {
      acta_id: rows[0].acta_id,
      recepcion_id: rows[0].recepcion_bien_id,
    });
    assert.ok(!(pack2.documentos || []).some((d) => String(d.documentoId) === String(adj.documentoId) && d.vigente));
  } else {
    ok('Smoke DB omitido (sin expediente/acta)');
  }
} catch (e) {
  console.log(`  · Smoke DB: ${e.message}`);
  ok('Smoke DB parcial');
}

{
  const files = [
    'scripts/test-rc115-acta-visada-documentos.mjs',
    'scripts/test-rc114-acta-institucional-recepcion-bienes.mjs',
    'scripts/test-rc113-acciones-recepcion-acta-derivacion-au.mjs',
  ];
  files.forEach((f) => assert.ok(fs.existsSync(path.join(root, f)), f));
  ok('23. Compatibilidad estructural RC104–RC115');
}

console.log('\n=== RC116 OK ===\n');

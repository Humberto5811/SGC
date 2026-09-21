/**
 * RC8.17.8H6-C2 — Descargar requerimiento original (Invitaciones).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  RESOLUCION_DOC_REQ,
  resolveDocumentoRequerimientoCanonicoFromList,
  hasMarcadorExplicitoDocumentoRequerimiento,
  isAdjuntoExcluidoComoDocumentoRequerimiento,
} from '../shared/requerimientoDocumentoCanonico.js';
import {
  ACCION_DESCARGA,
  resolveAccionDescargaDocumento,
} from '../src/utils/descargarRequerimientoOriginal.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-C2 — Documento requerimiento canónico ===\n');

const ctx = { requerimientoCodigo: 'REQ-00099' };

// 1 — PDF requerimiento vs pedido vs plano/ficha
{
  const adjuntos = [
    { id: 10, nombre_archivo: 'Requerimiento 099— BIEN.pdf', mime_type: 'application/pdf', created_at: '2026-01-01' },
    { id: 11, nombre_archivo: 'PEDIDO 3487 F .pdf', mime_type: 'application/pdf', created_at: '2026-01-02' },
    { id: 12, nombre_archivo: 'plano_instalacion.pdf', mime_type: 'application/pdf', created_at: '2026-01-03' },
    { id: 13, nombre_archivo: 'ficha_tecnica_item.pdf', mime_type: 'application/pdf', created_at: '2026-01-04' },
  ];
  const r = resolveDocumentoRequerimientoCanonicoFromList(adjuntos, ctx);
  ok(r.status === RESOLUCION_DOC_REQ.FOUND, '1 — resuelve PDF requerimiento');
  ok(Number(r.adjunto?.id) === 10, '1 — id adjunto requerimiento');
}

// 2 — Varios PDFs: no confundir pedido/plano
{
  const adjuntos = [
    { id: 21, nombre_archivo: 'PB-3487 pedido sigamef.pdf', mime_type: 'application/pdf' },
    { id: 22, nombre_archivo: 'Requerimiento REQ-00099.pdf', mime_type: 'application/pdf' },
  ];
  const r = resolveDocumentoRequerimientoCanonicoFromList(adjuntos, ctx);
  ok(r.status === RESOLUCION_DOC_REQ.FOUND && r.adjunto.id === 22, '2 — elige requerimiento, no pedido');
  ok(isAdjuntoExcluidoComoDocumentoRequerimiento(adjuntos[0], ctx), '2 — pedido excluido');
}

// 3 — Metadata explícita gana sobre heurística de nombre
{
  const adjuntos = [
    {
      id: 31,
      nombre_archivo: 'copia_pedido.pdf',
      mime_type: 'application/pdf',
      categoria: 'Requerimiento',
    },
    {
      id: 32,
      nombre_archivo: 'Requerimiento REQ-00099.pdf',
      mime_type: 'application/pdf',
    },
  ];
  const r = resolveDocumentoRequerimientoCanonicoFromList(adjuntos, ctx);
  ok(r.status === RESOLUCION_DOC_REQ.FOUND && r.adjunto.id === 31, '3 — categoria explícita gana');
  ok(hasMarcadorExplicitoDocumentoRequerimiento(adjuntos[0]), '3 — marcador explícito detectado');
}

// 4 — Legacy sin canónico → none (FE usa printRequerimiento)
{
  const r = resolveDocumentoRequerimientoCanonicoFromList(
    [{ id: 41, nombre_archivo: 'PEDIDO 99.pdf', mime_type: 'application/pdf' }],
    ctx,
  );
  ok(r.status === RESOLUCION_DOC_REQ.NONE, '4 — sin candidato requerimiento');
}

// 5 — Ambiguo: dos marcadores explícitos
{
  const adjuntos = [
    { id: 51, nombre_archivo: 'a.pdf', mime_type: 'application/pdf', tipo_documento: 'DOCUMENTO_REQUERIMIENTO' },
    { id: 52, nombre_archivo: 'b.pdf', mime_type: 'application/pdf', es_documento_requerimiento: true },
  ];
  const r = resolveDocumentoRequerimientoCanonicoFromList(adjuntos, ctx);
  ok(r.status === RESOLUCION_DOC_REQ.AMBIGUOUS, '5 — no elige arbitrariamente con dos explícitos');
  ok((r.candidatos || []).length === 2, '5 — reporta candidatos');
}

// 5b — Empate heurístico
{
  const adjuntos = [
    { id: 61, nombre_archivo: 'Requerimiento REQ-00099 v1.pdf', mime_type: 'application/pdf' },
    { id: 62, nombre_archivo: 'Requerimiento REQ-00099 v2.pdf', mime_type: 'application/pdf' },
  ];
  const r = resolveDocumentoRequerimientoCanonicoFromList(adjuntos, ctx);
  ok(r.status === RESOLUCION_DOC_REQ.AMBIGUOUS, '5b — empate heurístico → ambiguo');
}

// Contrato resolveAccionDescargaDocumento
{
  ok(resolveAccionDescargaDocumento(RESOLUCION_DOC_REQ.FOUND) === ACCION_DESCARGA.ADJUNTO, 'acción — found → adjunto');
  ok(resolveAccionDescargaDocumento(RESOLUCION_DOC_REQ.NONE) === ACCION_DESCARGA.FALLBACK_PRINT, 'acción — none → único fallback print');
  ok(resolveAccionDescargaDocumento(RESOLUCION_DOC_REQ.AMBIGUOUS) === ACCION_DESCARGA.AMBIGUOUS, 'acción — ambiguous → sin fallback');
  ok(resolveAccionDescargaDocumento('invalid') === ACCION_DESCARGA.ERROR, 'acción — status inválido → error');
  ok(resolveAccionDescargaDocumento(undefined) === ACCION_DESCARGA.ERROR, 'acción — status ausente → error');
}

// 6 — Invitaciones usa flujo almacenado
{
  const invSrc = readFileSync(join(__dir, '../src/views/contratacion/invitacionesView.js'), 'utf8');
  const utilSrc = readFileSync(join(__dir, '../src/utils/descargarRequerimientoOriginal.js'), 'utf8');
  ok(invSrc.includes('descargarRequerimientoDesdeInvitaciones'), '6 — Invitaciones delega descarga C2');
  ok(!invSrc.includes('printRequerimiento(id)'), '6 — Invitaciones ya no llama printRequerimiento directo');
  ok(utilSrc.includes('getDocumentoRequerimientoCanonico'), '6 — consulta documento canónico vía API');
  ok(utilSrc.includes('descargarAdjunto'), '6 — descarga adjunto almacenado');
  ok(utilSrc.includes('printRequerimiento'), '6 — fallback printRequerimiento conservado');
  ok(utilSrc.includes('resolveAccionDescargaDocumento'), '6 — contrato acción por status');
  ok(!/catch\s*\([^)]*\)\s*\{[\s\S]*printRequerimiento/.test(utilSrc), '6 — error API no dispara printRequerimiento');
  ok(!/getDocumentoRequerimientoCanonico[\s\S]*catch/.test(utilSrc), '6 — sin try/catch en consulta canónica');
}

// Backend route
{
  const adjRoutes = readFileSync(join(__dir, '../server/routes/adjuntos.js'), 'utf8');
  ok(adjRoutes.includes('documento-canonico'), 'API — ruta documento-canonico');
  ok(adjRoutes.includes('guardAdjuntoByReq'), 'API — guard de autorización reutilizado');
}

console.log('\n  OK RC8.17.8H6-C2\n');

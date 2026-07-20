/**
 * RC8.5-C1 — Consolidación documental: causa de duplicados + dedupe + origen/categoría.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  documentIdentityKey,
  dedupeDocumentos,
  mergeDocumentosCronologicos,
  buildExpedienteDocumental,
  splitDocumentosSolicitudEnviados,
  classifyCategoria,
  classifyOrigen,
  CATEGORIA_DOC,
  ORIGEN_DOC,
} from '../src/utils/cuadroComparativoExpedienteDocs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.5-C1 Consolidación documental ===\n');

// Causa: misma fila física vía solicitud + por requerimiento
const ficha = {
  id: 7117,
  nombre_archivo: 'FICHANET7117.pdf',
  mime_type: 'application/pdf',
  tamaño_bytes: 12000,
  created_at: '2026-03-01T10:00:00Z',
};
const reqPdf = {
  id: 16,
  nombre_archivo: 'REQ 0016 v1.pdf',
  mime_type: 'application/pdf',
  tamaño_bytes: 8000,
  created_at: '2026-03-01T09:00:00Z',
};

const dupMerge = mergeDocumentosCronologicos([
  [ficha, reqPdf], // simula getAdjuntosSolicitud
  [ficha, reqPdf], // simula getAdjuntos(req)
]);
assert(dupMerge.length === 2, 'merge dedupe: 4 entradas → 2 archivos físicos');
assert(dupMerge.filter((d) => d.nombre_archivo === 'FICHANET7117.pdf').length === 1, 'FICHANET7117 sin duplicar');
assert(dupMerge.filter((d) => d.nombre_archivo === 'REQ 0016 v1.pdf').length === 1, 'REQ 0016 v1 sin duplicar');

assert(documentIdentityKey(ficha) === 'id:7117', 'identidad por document/attachment id');
assert(documentIdentityKey({ nombre_archivo: 'a.pdf', tamaño_bytes: 1, created_at: '2026-01-01T00:00:00Z', mime_type: 'application/pdf' })
  .startsWith('meta:'), 'fallback meta nombre+tamaño+fecha+tipo');

assert(classifyCategoria(ficha) === CATEGORIA_DOC.FICHA, 'FICHANET → Ficha Técnica');
assert(classifyCategoria(reqPdf) === CATEGORIA_DOC.REQUERIMIENTO, 'REQ → Requerimiento');
assert(classifyOrigen(ficha, 'requerimiento') === ORIGEN_DOC.REQUERIMIENTO, 'origen Requerimiento');

const built = buildExpedienteDocumental({
  adjuntosPorReq: { 1: [ficha, reqPdf] },
  solicitud: {
    docs_solicitados: [{ documento: 'Anexo 09', archivo: 'REQ 0016 v1.pdf' }],
    requisitos_tecnicos: [{ requisito: 'RTM 1', archivo: 'FICHANET7117.pdf' }],
  },
  docsPorCot: {},
  cuadro: { pdf_nombre: 'Cuadro.pdf', tiene_pdf: true, firmado_nombre: 'Firmado.pdf', tiene_pdf_firmado: true },
});
assert(built.every((d) => d.origen && d.categoria), 'todos tienen origen y categoría');
assert(built.filter((d) => d.nombre_archivo === 'FICHANET7117.pdf').length === 1, 'build sin dup FICHANET');
assert(built.filter((d) => d.nombre_archivo === 'REQ 0016 v1.pdf').length === 1, 'build sin dup REQ');
assert(built.some((d) => d.origen === ORIGEN_DOC.FIRMA_COORD), 'incluye Firma Coordinador');
assert(built.some((d) => d.origen === ORIGEN_DOC.CUADRO), 'incluye Cuadro Comparativo');

const split = splitDocumentosSolicitudEnviados({
  solicitud: {
    docs_solicitados: [{ documento: 'Anexo 10', archivo: 'formato.pdf' }],
    requisitos_tecnicos: [{ requisito: 'Experiencia', archivo: 'FICHANET7117.pdf' }],
  },
  adjuntosPorReq: { 1: [ficha, reqPdf, { id: 99, nombre_archivo: 'formato.pdf', mime_type: 'application/pdf', tamaño_bytes: 100, created_at: '2026-03-02T10:00:00Z' }] },
});
assert(split.tecnicos.length >= 1, 'Solicitud: sección técnicos');
assert(split.administrativos.length >= 1, 'Solicitud: sección administrativos');
assert(split.tecnicos.every((d) => d.categoria && d.origen), 'técnicos con categoría/origen');
assert(split.administrativos.every((d) => d.categoria && d.origen), 'admin con categoría/origen');

const deduped = dedupeDocumentos([
  { id: 1, nombre_archivo: 'a.pdf', tamaño_bytes: 1, created_at: '2026-01-01' },
  { id: 1, nombre_archivo: 'a.pdf', tamaño_bytes: 1, created_at: '2026-01-01' },
]);
assert(deduped.length === 1, 'dedupe por id');

const tabs = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoExpedienteTabs.js'), 'utf8');
assert(/Documentos solicitados al proveedor/.test(tabs) && /Requerimientos técnicos mínimos/.test(tabs),
  'pestaña SC con bloques A/B (RC8.5-C3)');
assert(/listDocsSolicitadosConfig|renderDocsSolicitadosConfigTable/.test(tabs), 'usa config SC almacenada');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordModal.js'), 'utf8');
assert(/listDocsSolicitadosConfig/.test(modal), 'modal carga config docs SC');
assert(/rawSol\?\.solicitud|solicitud = rawSol\?\.solicitud/.test(modal), 'unwrap solicitud real del API');
assert(!/ccExpPane_documentos/.test(modal), 'sin pestaña Documentos en modal');
assert(/bindExpedienteDocsTable|bindAdjuntosTable/.test(modal), 'visor institucional');

const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO/.test(wf), 'Workflow intacto');

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.5-C1: PASS\n');

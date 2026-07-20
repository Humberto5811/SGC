/**
 * RC8.5-C3 — Integración documental SC + Cotizaciones (sin pestaña Documentos).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  EXPEDIENTE_TABS,
  renderSolicitudTab,
  renderProveedoresTab,
} from '../src/utils/cuadroComparativoExpedienteTabs.js';
import {
  listDocsSolicitadosConfig,
  listRequisitosTecnicosConfig,
  groupDocsCotizacionPresentada,
  renderDocsSolicitadosConfigTable,
  renderRequisitosTecnicosConfigTable,
} from '../src/utils/cuadroComparativoExpedienteDocs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.5-C3 Integración expediente documental ===\n');

assert(EXPEDIENTE_TABS.length === 9, '9 pestañas');
assert(EXPEDIENTE_TABS.some((t) => t.label === 'Cotizaciones presentadas por proveedores'),
  'renombre Proveedores → Cotizaciones presentadas');
assert(!EXPEDIENTE_TABS.some((t) => t.id === 'documentos' || t.label === 'Documentos'),
  'pestaña Documentos eliminada');

const solicitud = {
  codigo: 'SC-TEST',
  docs_solicitados: [
    { documento: 'Anexo 09', archivo: 'anexo09.pdf', fecha_registro: '2026-03-01T10:00:00Z', contenido_base64: 'AAA' },
    { documento: 'Anexo 10', archivo: 'anexo10.pdf', fecha_registro: '2026-03-01T11:00:00Z' },
    { documento: 'Otros documentos', archivo: 'otros.docx', comentario: 'Adicional' },
  ],
  docs_convocatoria: [
    { documento: 'Documento adicional', archivo: 'extra.pdf', fecha_registro: '2026-03-02' },
  ],
  requisitos_tecnicos: [
    { requisito: 'Experiencia de ventas', obligatorio: true, observacion: 'Mínimo 2 años' },
    { requisito: 'RNP vigente', obligatorio: true },
    { requisito: 'Consulta RUC activo', obligatorio: true },
    { requisito: 'Seguros', obligatorio: false, observacion: '' },
    { requisito: 'Certificaciones', obligatorio: true },
    { requisito: 'Curriculum Vitae del personal', obligatorio: true },
    { requisito: 'Permisos', obligatorio: false },
    { requisito: 'Otros documentos', obligatorio: false, observacion: 'Si aplica' },
  ],
};

const docsCfg = listDocsSolicitadosConfig(solicitud);
assert(docsCfg.length === 4, 'docs_solicitados + docs_convocatoria desde config');
assert(docsCfg.some((d) => d.documento === 'Anexo 09'), 'incluye Anexo 09');
assert(docsCfg.some((d) => d.documento === 'Anexo 10'), 'incluye Anexo 10');
assert(docsCfg.some((d) => /adicional|Otros/i.test(d.documento)), 'incluye adicionales/otros');

const reqCfg = listRequisitosTecnicosConfig(solicitud);
assert(reqCfg.length === 8, 'requisitos técnicos desde config (no inferidos)');
assert(reqCfg.every((r) => r.requisito), 'cada fila tiene requisito');
assert(reqCfg.find((r) => r.requisito === 'Experiencia de ventas')?.observacion === 'Mínimo 2 años',
  'observaciones del requisito');
assert(reqCfg.find((r) => r.requisito === 'Seguros')?.obligatorio === false, 'obligatorio=false respetado');

const htmlSol = renderSolicitudTab({ solicitud, invitados: [] });
assert(/Documentos solicitados al proveedor/.test(htmlSol), 'bloque A visible');
assert(/Requerimientos técnicos mínimos/.test(htmlSol), 'bloque B visible');
assert(/Anexo 09/.test(htmlSol) && /Anexo 10/.test(htmlSol), 'anexos en HTML');
assert(/Experiencia de ventas/.test(htmlSol) && /RNP vigente/.test(htmlSol), 'requisitos en HTML');
assert(!/Documentos técnicos/.test(htmlSol) || /Documentos solicitados/.test(htmlSol),
  'ya no usa solo clasificación técnico/admin como contenido principal');

const tblA = renderDocsSolicitadosConfigTable(docsCfg);
assert(/sgc-exp-doc-b64|sgc-adj-ver|Sin archivo/.test(tblA), 'acciones Ver/Descargar o sin archivo');
assert(/Descargar/.test(tblA), 'Descargar en documentos solicitados');

const tblB = renderRequisitosTecnicosConfigTable(reqCfg);
assert(/Obligatorio/.test(tblB) && /Observaciones/.test(tblB), 'columnas requisito/obligatorio/obs');
assert(!/infer/.test(tblB.toLowerCase()), 'no texto de inferencia');

const docsCot = [
  { ref: 'anexo05a', nombre: 'Propuesta_tecnica.pdf', grupo: 'Anexos firmados', fecha: '2026-04-01' },
  { ref: 'anexo05b', nombre: 'Propuesta_economica.pdf', grupo: 'Propuesta económica', fecha: '2026-04-01' },
  { ref: 'docs-0', nombre: 'Anexo_09_firmado.pdf', grupo: 'Documentos solicitados', fecha: '2026-04-01' },
  { ref: 'docs-1', nombre: 'Declaracion_canje.pdf', grupo: 'Documentos solicitados', fecha: '2026-04-01' },
  { ref: 'req-0', nombre: 'RNP.pdf', grupo: 'Requisitos técnicos', fecha: '2026-04-01' },
  { ref: 'cert-0', nombre: 'Certificado.pdf', grupo: 'Certificados', fecha: '2026-04-01' },
];
const grupos = groupDocsCotizacionPresentada(docsCot);
assert(grupos.some(([t]) => t === 'Propuesta técnica'), 'grupo propuesta técnica');
assert(grupos.some(([t]) => t === 'Propuesta económica'), 'grupo propuesta económica');
assert(grupos.some(([t, list]) => t === 'Documentos técnicos' && list.length), 'grupo docs técnicos');
assert(grupos.some(([t, list]) => t === 'Declaraciones' && list.length), 'grupo declaraciones');

const htmlProv = renderProveedoresTab({
  proveedores: [{
    cotizacion_id: 99,
    razon_social: 'PROVEEDOR DEMO SAC',
    ruc: '20100000000',
    fecha_presentacion: '2026-04-01T12:00:00Z',
    validacion_estado: 'APTO',
  }],
  docsPorCot: { 99: docsCot },
});
assert(/PROVEEDOR DEMO SAC/.test(htmlProv) && /20100000000/.test(htmlProv), 'razón social y RUC');
assert(/Presentación|Fecha de presentación/.test(htmlProv), 'fecha presentación');
assert(/cc-exp-cot-doc/.test(htmlProv) && /data-mode="dl"/.test(htmlProv), 'Ver y Descargar cotización');
assert(/Propuesta técnica|Propuesta económica|Documentación presentada/.test(htmlProv),
  'documentación presentada agrupada');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordModal.js'), 'utf8');
assert(!/renderDocumentosTab/.test(modal), 'modal no renderiza pestaña Documentos');
assert(!/ccExpPane_documentos/.test(modal), 'sin pane documentos');
assert(/listDocsSolicitadosConfig/.test(modal), 'carga config SC');
assert(/rawSol\?\.solicitud/.test(modal), 'usa solicitud.solicitud del API');
assert(/download:\s*btn\.dataset\.mode === 'dl'/.test(modal), 'descarga docs cotización');

const docsJs = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoExpedienteDocs.js'), 'utf8');
assert(/listDocsSolicitadosConfig/.test(docsJs) && /listRequisitosTecnicosConfig/.test(docsJs),
  'helpers config SC');
assert(/groupDocsCotizacionPresentada/.test(docsJs), 'agrupa docs cotización');

const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO/.test(wf), 'Workflow intacto');

const failed = tests.filter((t) => !t.ok);
console.log(`\n=== Resultado: ${tests.length - failed.length}/${tests.length} ===\n`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}

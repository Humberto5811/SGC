/**
 * RC8.5-C4 — Cotizaciones presentadas (fuente recepción) + sticky expediente.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildVistaCotizacionPresentada,
  countDocsPresentados,
  dedupeDocsPresentados,
  groupByManifiestoGrupo,
  docKeySolicitud,
  reqKeySolicitud,
  normalizeDocsFromRecepcionDetalle,
} from '../src/utils/cotizacionDocumentosPresentados.js';
import { buildManifiestoCotizacion } from '../server/lib/portalDocumentos.js';
import { EXPEDIENTE_TABS } from '../src/utils/cuadroComparativoExpedienteTabs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.5-C4 Cotizaciones documentos + sticky ===\n');

// Manifiesto con keys (misma fuente recepción)
const cotFake = {
  anexos: {
    docs_solicitados: [
      { key: 'doc-0-Anexo 09', nombre: 'a09.pdf', base64: 'QQ==', mime_type: 'application/pdf' },
      { key: 'doc-1-Anexo 10', nombre: 'a10.pdf', base64: 'QQ==', mime_type: 'application/pdf' },
    ],
    requisitos: [
      { key: 'req-0-RNP vigente', nombre: 'rnp.pdf', base64: 'QQ==', mime_type: 'application/pdf' },
    ],
    anexo05a_firmado: { nombre: 'tec.pdf', base64: 'QQ==', mime_type: 'application/pdf' },
    anexo05b_firmado: { nombre: 'eco.pdf', base64: 'QQ==', mime_type: 'application/pdf' },
  },
  certificados: [{ nombre: 'cert.pdf', base64: 'QQ==', mime_type: 'application/pdf' }],
};
const manif = buildManifiestoCotizacion(cotFake);
// 2 docs + 1 req + anexo05a + anexo05b + 1 cert = 6
assert(manif.length === 6, `manifiesto completo (6 archivos), got ${manif.length}`);
assert(manif.every((d) => d.disponible === true), 'manifiesto marca disponible');
assert(manif.find((d) => d.ref === 'docs-0')?.key === 'doc-0-Anexo 09', 'key docs en manifiesto');
assert(groupByManifiestoGrupo(manif).some(([g]) => g === 'Documentos solicitados'), 'grupo Documentos solicitados');
assert(groupByManifiestoGrupo(manif).some(([g]) => g === 'Requisitos técnicos'), 'grupo Requisitos técnicos');
assert(groupByManifiestoGrupo(manif).some(([g]) => g === 'Anexos firmados'), 'grupo Anexos firmados');
assert(groupByManifiestoGrupo(manif).some(([g]) => g === 'Propuesta económica'), 'grupo Propuesta económica');
assert(groupByManifiestoGrupo(manif).some(([g]) => g === 'Certificados'), 'grupo Certificados');

const detalle = {
  id: 21,
  solicitud_id: 7,
  proveedor_id: 3,
  razon_social: 'PROVEEDOR DEMO',
  ruc: '20100000000',
  fecha_presentacion: '2026-04-01T10:00:00Z',
  monto: 1500,
  moneda: 'PEN',
  estado: 'COTIZACION_PRESENTADA',
  validacion_estado: 'APTO',
  documentos: manif,
  docs_solicitados_sc: [
    { documento: 'Anexo 09' },
    { documento: 'Anexo 10' },
    { documento: 'Otros documentos' },
  ],
  requisitos_tecnicos_sc: [
    { requisito: 'RNP vigente', obligatorio: true },
    { requisito: 'Seguros', obligatorio: false, observacion: 'Si aplica' },
  ],
};

assert(docKeySolicitud(detalle.docs_solicitados_sc[0], 0) === 'doc-0-Anexo 09', 'docKey estable');
assert(reqKeySolicitud(detalle.requisitos_tecnicos_sc[0], 0) === 'req-0-RNP vigente', 'reqKey estable');

const vista = buildVistaCotizacionPresentada(detalle);
assert(vista.total_archivos === 6, `conteo archivos = manifiesto (${vista.total_archivos})`);
assert(vista.docs_solicitados[0].disponible === true && vista.docs_solicitados[0].ref === 'docs-0',
  'Anexo 09 emparejado por key');
assert(vista.docs_solicitados[2].estado === 'Sin documento asociado', 'Otros sin archivo asociado');
assert(vista.requisitos[0].disponible === true, 'RNP emparejado por key');
assert(vista.requisitos[1].estado === 'Sin documento asociado', 'Seguros sin inventar asociación');
assert(vista.propuesta_tecnica.some((d) => d.ref === 'anexo05a'), 'propuesta técnica = anexo05a');
assert(vista.propuesta_economica.some((d) => d.ref === 'anexo05b'), 'propuesta económica = anexo05b');
assert(vista.adicionales.some((d) => d.ref === 'cert-0'), 'certificados en adicionales');

const dup = dedupeDocsPresentados([...manif, manif[0]]);
assert(dup.length === manif.length, 'dedupe por ref no pierde archivos distintos');
assert(countDocsPresentados(normalizeDocsFromRecepcionDetalle({ documentos: manif })) === 6,
  'normalize + count');

const html = (await import('../src/utils/cotizacionDocumentosPresentados.js'))
  .renderBloqueCotizacionPresentada(vista);
assert(/Documentos solicitados/.test(html) && /Requerimientos técnicos mínimos/.test(html), 'secciones 1-2');
assert(/Propuesta técnica/.test(html) && /Propuesta económica/.test(html), 'secciones 3-4');
assert(/Anexos firmados/.test(html) && /Documentos adicionales/.test(html), 'secciones 5-6');
assert(/cc-exp-cot-doc/.test(html) && /Ver/.test(html) && /Descargar/.test(html), 'acciones Ver/Descargar');
assert(!/bi-trash|Eliminar|eliminar/.test(html), 'solo lectura: sin eliminar');
assert(/Archivo no disponible|Sin documento asociado/.test(html), 'referencia sin archivo clara');

assert(EXPEDIENTE_TABS.some((t) => t.label === 'Cotizaciones presentadas por proveedores'),
  'nombre de pestaña');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordModal.js'), 'utf8');
assert(/cc-exp-shell/.test(modal) && /#ccExpTabBar/.test(modal), 'shell sticky header/tabs');
assert(/ccExpTabBar/.test(modal) && /renderTabNav/.test(modal), 'tabs fuera del scroll body');
assert(/detallePorCot/.test(modal), 'conserva detalle completo recepción');
assert(/descargar/.test(modal), 'usa endpoint descargar como Recepción');
assert(/cc-exp-table-sticky/.test(modal), 'CSS thead sticky');

const tabs = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoExpedienteTabs.js'), 'utf8');
assert(/buildVistaCotizacionPresentada|renderBloqueCotizacionPresentada/.test(tabs),
  'pestaña usa helper C4');
assert(/getRecepcionCotizacionDetalle|Cotización recibida/.test(tabs)
  || /Misma fuente documental/.test(tabs), 'documenta fuente recepción');

const portal = fs.readFileSync(path.join(root, 'server/lib/portalDocumentos.js'), 'utf8');
assert(/docs_solicitados_sc/.test(portal) && /anexos_meta/.test(portal), 'detalle enriquece SC + meta');
assert(/key: f\?\.key/.test(portal), 'manifiesto expone key');

const recep = fs.readFileSync(path.join(root, 'src/views/contratacion/recepcionCotizacionesView.js'), 'utf8');
assert(/renderDocumentosList/.test(recep) && /showCotizacionDetalleModal/.test(recep),
  'Recepción intacta (modal propio)');

const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO/.test(wf), 'Workflow intacto');

const failed = tests.filter((t) => !t.ok);
console.log(`\n=== Resultado: ${tests.length - failed.length}/${tests.length} ===\n`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}

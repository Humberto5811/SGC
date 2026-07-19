/**
 * RC8.8 — Generación del CCP solo con cuadro plenamente aprobado.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EVENTOS } from '../core/eventEngine/EventCatalog.js';
import { EVENTOS_FUNCIONALES } from '../core/common/CatalogoEventos.js';
import { TRANSICIONES_POR_ACCION } from '../core/workflowEngine/WorkflowTransitions.js';
import { ETAPAS } from '../core/workflowEngine/WorkflowState.js';
import {
  findTransicionRevision,
  EVENTOS_TRAZA_CUADRO_CCP,
} from '../server/lib/cuadroComparativoRevision.js';
import { evaluarListoParaCcp } from '../server/lib/cuadroComparativo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.8 Generación CCP ===\n');

// Gates unitarios
const listo = evaluarListoParaCcp({
  estado: 'APROBADO_DEC',
  pdf_nombre: 'a.pdf',
  firmado_nombre: 'f.pdf',
  firmado_dec_nombre: 'fd.pdf',
  datos_json: {
    revision_coordinador: { conformidad: true },
    revision_dec: { conformidad: true },
  },
});
assert(listo.ok === true, 'gates OK con aprobaciones + firmas');

const incompleto = evaluarListoParaCcp({
  estado: 'APROBADO_DEC',
  pdf_nombre: 'a.pdf',
  firmado_nombre: 'f.pdf',
  datos_json: { revision_coordinador: { conformidad: true } },
});
assert(incompleto.ok === false && incompleto.faltantes.some((f) => /DEC|firmado DEC/i.test(f)), 'bloquea sin aprobación/firma DEC');

const gen = findTransicionRevision('GENERAR_CCP', 'APROBADO_DEC');
assert(!!gen && gen.to === 'PENDIENTE_CCP', 'GENERAR_CCP → PENDIENTE_CCP');
assert(gen.requireConformidad && gen.requireConformidadDec, 'GENERAR_CCP exige conformidades');
assert(gen.requireFirmado && gen.requireFirmadoDec, 'GENERAR_CCP exige firmas');
assert(!findTransicionRevision('GENERAR_CCP', 'FIRMADO'), 'ya no genera CCP desde FIRMADO legado');

assert(EVENTOS.CUADRO_APROBADO_DEC === 'CUADRO_APROBADO_DEC', 'EventCatalog CUADRO_APROBADO_DEC');
assert(EVENTOS.CCP_GENERADO === 'CCP_GENERADO', 'EventCatalog CCP_GENERADO');
assert(EVENTOS.CCP_DERIVADO === 'CCP_DERIVADO', 'EventCatalog CCP_DERIVADO');
assert(!!EVENTOS_FUNCIONALES.CUADRO_APROBADO_DEC, 'CatalogoEventos CUADRO_APROBADO_DEC');
assert(!!EVENTOS_FUNCIONALES.CCP_GENERADO, 'CatalogoEventos CCP_GENERADO');
assert(!!EVENTOS_FUNCIONALES.CCP_DERIVADO, 'CatalogoEventos CCP_DERIVADO');
assert(EVENTOS_TRAZA_CUADRO_CCP.CCP_GENERADO === 'CCP_GENERADO', 'constante traza CCP_GENERADO');

const lib = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
assert(/assertCuadroListoParaCcp/.test(lib), 'assert gates en lib');
assert(/registrarEventoCuadroCcp/.test(lib), 'usa registrarEventoCuadroCcp');
assert(/CUADRO_APROBADO_DEC/.test(lib) && /CCP_GENERADO/.test(lib) && /CCP_DERIVADO/.test(lib), 'emite 3 eventos');
assert(/registrarMovimiento/.test(fs.readFileSync(path.join(root, 'server/lib/cuadroComparativoRevision.js'), 'utf8')), 'vía registrarMovimiento');

const ui = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCcp.js'), 'utf8');
assert(/Descargar Cuadro Final/.test(ui) && /Ver Firmas/.test(ui), 'acciones Descargar/Ver Firmas');
assert(/Generar CCP/.test(ui) && /Derivar CCP/.test(ui), 'acciones Generar/Derivar');
assert(/No se puede Generar CCP/.test(ui), 'bloqueo UI sin aprobaciones');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoModal.js'), 'utf8');
assert(/bindCcpActions|generarCcpAction|derivarCcpAction/.test(modal), 'modal cablea CCP');
assert(/ccBtnGenerarCcp|ccBtnDerivarCcp/.test(modal), 'botones Generar y Derivar');

// No tocar Workflow central
assert(TRANSICIONES_POR_ACCION.APROBAR[ETAPAS.CUADRO_COMPARATIVO] === ETAPAS.CCP, 'Workflow CUADRO→CCP intacto');
const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/\[ETAPAS\.CUADRO_COMPARATIVO\]:\s*ETAPAS\.CCP/.test(wf), 'catálogo Workflow no reescrito');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC8.8: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.8: PASS\n');

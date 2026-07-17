/**
 * RC8.5 — Firma, cierre y derivación del Cuadro Comparativo a CCP.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EVENTOS } from '../core/eventEngine/EventCatalog.js';
import { EVENTOS_FUNCIONALES } from '../core/common/CatalogoEventos.js';
import { TRANSICIONES_POR_ACCION } from '../core/workflowEngine/WorkflowTransitions.js';
import { ETAPAS } from '../core/workflowEngine/WorkflowState.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

const libSrc = readFileSync(path.join(__dirname, '../server/lib/cuadroComparativo.js'), 'utf8');
const routeSrc = readFileSync(path.join(__dirname, '../server/routes/portal.js'), 'utf8');
const modalSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoModal.js'), 'utf8');
const utilsSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoUtils.js'), 'utf8');
const svcSrc = readFileSync(path.join(__dirname, '../src/services/contratacionesService.js'), 'utf8');
const syncSrc = readFileSync(path.join(__dirname, '../server/lib/cotizacionWorkflowSync.js'), 'utf8');
const migSrc = readFileSync(path.join(__dirname, '../server/migrations/022_cuadro_firma_ccp.js'), 'utf8');
const portalSrc = readFileSync(path.join(__dirname, '../server/lib/portalProveedores.js'), 'utf8');
const valSrc = readFileSync(path.join(__dirname, '../server/lib/validacionesCotizacion.js'), 'utf8');
const wfSrc = readFileSync(path.join(__dirname, '../core/workflowEngine/WorkflowTransitions.js'), 'utf8');
const obsSrc = readFileSync(path.join(__dirname, '../core/workflowEngine/WorkflowState.js'), 'utf8');

console.log('\n=== RC8.5 Firma + Derivación CCP ===\n');

// 1) Sin PDF firmado no deriva
assert(/firmado_contenido[\s\S]*Adjunte el PDF firmado|Adjunte el PDF firmado/.test(libSrc), '1. sin firmado no deriva');
assert(/estado !== 'FIRMADO'|estado !== \"FIRMADO\"|debe estar FIRMADO/.test(libSrc), '1. requiere FIRMADO');

// 2) Firmado cambia estado
assert(/estado = 'FIRMADO'/.test(libSrc) && /adjuntarPdfFirmadoCuadro/.test(libSrc), '2. adjuntar → FIRMADO');
assert(/firmado_por|firmado_at/.test(libSrc) && /firmado_por/.test(migSrc), '2. fecha/usuario firma');

// 3) Responsable obligatorio
assert(/Seleccione el usuario responsable de CCP|responsable CCP es obligatorio/.test(libSrc), '3. responsable obligatorio');

// 4) Derivación válida
assert(/export async function derivarCuadroACcp/.test(libSrc), '4. derivarCuadroACcp');
assert(/derivar-ccp/.test(routeSrc) && /derivarCuadroACcp/.test(svcSrc), '4. endpoint + service');

// 5) Workflow pasa a CCP
assert(TRANSICIONES_POR_ACCION.APROBAR[ETAPAS.CUADRO_COMPARATIVO] === ETAPAS.CCP, '5. catálogo APROBAR CUADRO→CCP');
assert(/syncRequerimientosSolicitudWorkflow/.test(libSrc), '5. usa sync Workflow');
assert(/etapaDestino:\s*DESTINO_SALIDA_CUADRO\.code|etapaDestino:.*CCP/.test(libSrc)
  || /etapaDestino: DESTINO_SALIDA_CUADRO/.test(libSrc), '5. destino CCP');
assert(/CUADRO_COMPARATIVO[\s\S]*CCP/.test(wfSrc), '5. transición no reescrita (catálogo intacto)');
assert(!/TRANSICIONES_POR_ACCION\s*=/.test(libSrc), '5. no redefine WorkflowTransitions');

// 6) Estado transversal
assert(/CCP:\s*'En CCP'/.test(syncSrc), '6. estado negocio En CCP');
assert(/registrarMovimiento/.test(syncSrc), '6. vía registrarMovimiento');
assert(!/UPDATE\s+requerimientos\s+SET\s+estado/i.test(libSrc), '6. no hardcodea bandejas');

// 7) Idempotencia
assert(/idempotente:\s*true/.test(libSrc) && /DERIVADO_CCP/.test(libSrc), '7. idempotencia DERIVADO_CCP');

// 8) Bloqueo post-derivación
assert(/no se puede reemplazar el PDF firmado|no se puede eliminar el PDF firmado/.test(libSrc), '8. bloqueo PDF post-CCP');
assert(/solo_lectura|Ver cuadro/.test(utilsSrc) && /Ver cuadro/.test(modalSrc), '8. UI Ver / solo lectura');
assert(/disabled/.test(modalSrc) && /Derivar a CCP/.test(modalSrc), '8. acciones bloqueables');

// 9) Evento de firma
assert(EVENTOS.CUADRO_COMPARATIVO_FIRMADO === 'CUADRO_COMPARATIVO_FIRMADO', '9. EventCatalog firma');
assert(!!EVENTOS_FUNCIONALES.CUADRO_COMPARATIVO_FIRMADO, '9. CatalogoEventos firma');
assert(/CUADRO_COMPARATIVO_FIRMADO/.test(libSrc), '9. traza firma');

// 10) Evento de derivación
assert(EVENTOS.CUADRO_COMPARATIVO_DERIVADO === 'CUADRO_COMPARATIVO_DERIVADO', '10. EventCatalog derivación');
assert(!!EVENTOS_FUNCIONALES.CUADRO_COMPARATIVO_DERIVADO, '10. CatalogoEventos derivación');
assert(/CUADRO_COMPARATIVO_DERIVADO/.test(libSrc) && /DERIVADO_A_CCP/.test(libSrc), '10. traza derivación');

// Extras UI / API
assert(/Adjuntar Anexo 8A firmado/.test(modalSrc), 'UI adjuntar firmado');
assert(/\/firmado/.test(routeSrc) && /adjuntarCuadroPdfFirmado/.test(svcSrc), 'API firmado');
assert(/eliminarCuadroPdfFirmado|DELETE.*firmado/i.test(routeSrc + svcSrc), 'API eliminar firmado');
assert(/DESTINO_SALIDA_CUADRO/.test(libSrc), 'constante destino CCP');

// No tocar módulos prohibidos
assert(!/Motor de Observaciones|observacionEngine/.test(libSrc), 'no Motor Observaciones');
assert(/\[ETAPAS\.CUADRO_COMPARATIVO\]:\s*ETAPAS\.CCP/.test(wfSrc), 'Workflow central intacto');
assert(obsSrc.includes('CCP:'), 'WorkflowState CCP presente');
assert(!portalSrc.includes('derivarCuadroACcp'), 'Portal proveedores no alterado con derivación');
assert(!/derivarCuadroACcp/.test(valSrc), 'Validaciones no alteradas con derivación cuadro');

const failed = tests.filter((t) => !t.ok);
console.log(`\n=== Resultado: ${tests.length - failed.length}/${tests.length} OK ===`);
if (failed.length) {
  failed.forEach((f) => console.error('FAIL:', f.msg));
  process.exit(1);
}
process.exit(0);

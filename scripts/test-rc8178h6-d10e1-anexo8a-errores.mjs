/**
 * RC8.17.8H6-C3-D10-E1 — Anexo 8-A: errores de negocio (borrador), no HTTP 500 genérico.
 * Prueba estática (sin PostgreSQL).
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

const libSrc = readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
const indexSrc = readFileSync(path.join(root, 'server/index.js'), 'utf8');
const apiSrc = readFileSync(path.join(root, 'src/services/apiService.js'), 'utf8');
const modalSrc = readFileSync(path.join(root, 'src/utils/cuadroComparativoModal.js'), 'utf8');

console.log('\n=== RC8.17.8H6 D10-E1 Anexo 8-A errores ===\n');

const fnObtener = libSrc.match(
  /export async function obtenerDatosPdfCuadro[\s\S]*?(?=\nexport async function)/,
)?.[0] || '';
const fnGuardar = libSrc.match(
  /export async function guardarPdfCuadro[\s\S]*?(?=\nexport async function)/,
)?.[0] || '';

assert(/throwPdfCuadroBusinessError/.test(libSrc), 'helper throwPdfCuadroBusinessError definido');
assert(/ESTADOS_ANEXO8A_PDF_DATOS/.test(libSrc), 'lista estados pdf-data');
assert(/ESTADOS_ANEXO8A_PDF_GUARDAR/.test(libSrc), 'lista estados guardar pdf');

assert(/err\.status = status/.test(libSrc) && /PDF_ESTADO_NO_PERMITIDO/.test(libSrc),
  'código PDF_ESTADO_NO_PERMITIDO con status HTTP');
assert(/function mensajeEstadoNoPermitePdfOficial/.test(libSrc)
  && /CUADRO_BORRADOR/.test(libSrc) && /borrador/.test(libSrc),
  'mensaje claro cuando cuadro en borrador (pdf-data)');
assert(!/throw new Error\('El Anexo 8A\/8B requiere cuadro ADJUDICADO/.test(fnObtener),
  'obtenerDatosPdfCuadro ya no lanza Error sin status');
assert(/throwPdfCuadroBusinessError\(mensajeEstadoNoPermitePdfOficial/.test(fnObtener),
  'obtenerDatosPdfCuadro usa business error por estado');

assert(/throwPdfCuadroBusinessError[\s\S]*CUADRO_BORRADOR/.test(fnGuardar),
  'guardarPdfCuadro rechaza borrador con business error');
assert(!/throw new Error\('Debe adjudicar el cuadro antes de generar el Anexo 8A'\)/.test(fnGuardar),
  'guardarPdfCuadro ya no lanza Error plano por estado');

assert(/status < 500/.test(indexSrc) && /err\.message/.test(indexSrc),
  'index.js expone message en errores 4xx');

assert(/res\.status >= 400 && res\.status < 500/.test(apiSrc),
  'apiService prioriza mensaje en 4xx');
assert(/Error interno del servidor/.test(apiSrc),
  'apiService mantiene mensaje genérico solo en 5xx');

assert(/cuadroPermiteGenerarAnexo8AOficial/.test(modalSrc),
  'modal helper cuadroPermiteGenerarAnexo8AOficial');
assert(/ESTADOS_PERMITE_GENERAR_ANEXO8A/.test(modalSrc),
  'modal lista estados generar');
assert(/!cuadroPermiteGenerarAnexo8AOficial\(cuadro\)/.test(modalSrc),
  'syncUiLocks deshabilita Generar si estado no autorizado');
assert(/setDis\('#ccBtnPreview8a', derivado \|\| sinDinamica\)/.test(modalSrc),
  'Previsualizar no se deshabilita por estado borrador (solo derivado/sinDinamica)');
const previewSetDis = modalSrc.match(/setDis\('#ccBtnPreview8a',[^\n]+\)/)?.[0] || '';
assert(!/cuadroPermiteGenerar/.test(previewSetDis),
  'Previsualizar independiente de cuadroPermiteGenerarAnexo8AOficial');

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((t) => console.error('FAIL:', t.msg));
  process.exit(1);
}

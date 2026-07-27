/**
 * RC92 — Generación Word CCP (.docx).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generarWordSolicitudCcp } from '../server/lib/ccpWord.js';
import { buildAsuntoCcp } from '../server/lib/ccpCertificacion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC92 / CCP Word ===\n');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert(!!pkg.dependencies?.docx, 'dependencia docx instalada');

const wordSrc = fs.readFileSync(path.join(root, 'server/lib/ccpWord.js'), 'utf8');
assert(wordSrc.includes('Tengo a bien dirigirme'), 'texto introductorio');
assert(wordSrc.includes('A la espera de su gentil atención'), 'texto de cierre');
assert(wordSrc.includes('landscape') || wordSrc.includes('orientation'), 'orientación horizontal');
assert(wordSrc.includes('N.° CCP') || wordSrc.includes('N.° CCP'), 'columna N.° CCP');
assert(wordSrc.includes('TOTAL GENERAL'), 'total general');

const consolidacion = {
  id: 1,
  codigo_interno: 'CCP-SOL-0001',
  total_monto: 320,
  moneda: 'PEN',
  requerimientos: [
    { requerimiento_codigo: 'REQ-00001', codigo_ccp: 'CCP-A-1' },
    { requerimiento_codigo: 'REQ-00002', codigo_ccp: 'CCP-B-2' },
  ],
  filas: [
    {
      codigo_ccp: 'CCP-A-1', centro: 'CNSP', descripcion: 'Item A',
      meta: '0030', fuente_fto: '00', especifica: '2.3.1.1',
      requerimiento: 'REQ-00001', monto: 200,
    },
    {
      codigo_ccp: 'CCP-B-2', centro: 'CNSP', descripcion: 'Item B',
      meta: '0031', fuente_fto: '00', especifica: '2.3.1.2',
      requerimiento: 'REQ-00002', monto: 120,
    },
  ],
};

const asunto = buildAsuntoCcp({
  reqCodes: consolidacion.requerimientos.map((r) => r.requerimiento_codigo),
  codigosCcp: consolidacion.requerimientos.map((r) => r.codigo_ccp),
});
assert(asunto.includes('CCP-A-1') && asunto.includes('CCP-B-2'), 'asunto lista CCP seleccionados');

const { buffer, filename, total } = await generarWordSolicitudCcp(consolidacion);
assert(Buffer.isBuffer(buffer) && buffer.length > 1000, `buffer docx válido (${buffer.length} bytes)`);
assert(filename.endsWith('.docx'), 'filename .docx');
assert(total === 320, 'total general 320');
// Firma ZIP/OOXML
assert(buffer[0] === 0x50 && buffer[1] === 0x4b, 'firma ZIP (docx abre correctamente)');

const outDir = path.join(root, 'tmp');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'test-rc92-ccp-sol.docx');
fs.writeFileSync(outFile, buffer);
assert(fs.existsSync(outFile) && fs.statSync(outFile).size > 1000, 'archivo Word escrito en tmp/');

// Ruta API
const routes = fs.readFileSync(path.join(root, 'server/routes/ccp.js'), 'utf8');
assert(routes.includes('generar-word'), 'endpoint generar-word');
assert(routes.includes('WORD_GENERADO') || fs.readFileSync(path.join(root, 'server/lib/ccpCertificacion.js'), 'utf8').includes('WORD_GENERADO'), 'evento WORD_GENERADO');

const apiSrc = fs.readFileSync(path.join(root, 'src/services/apiService.js'), 'utf8');
assert(apiSrc.includes('const { headers: optHeaders, ...rest }'), 'requestBlob no pierde auth headers');
assert(apiSrc.includes('postBlob'), 'existe postBlob');

const viewSrc = fs.readFileSync(path.join(root, 'src/views/contratacion/ccpView.js'), 'utf8');
assert(viewSrc.includes('downloadBlobFile'), 'descarga Word adjunta al DOM');
assert(viewSrc.includes('generarWordCcp'), 'usa servicio generarWordCcp');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC92: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLAS:', failed.map((f) => f.msg));
  process.exit(1);
}

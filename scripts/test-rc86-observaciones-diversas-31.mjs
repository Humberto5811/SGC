/**
 * OBSERVACIONES DIVERSAS 31 — estados, CCP, PDF, createObjectURL.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ESTADOS_CUADRO_LABEL,
  labelCuadroEstado,
} from '../server/lib/cuadroComparativo.js';
import {
  labelBandejaCuadroComparativo,
  labelEstadoExpedienteUnificado,
  labelCuadroEstado as labelClient,
} from '../src/utils/cuadroComparativoUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== OD31 estados / PDF / CCP ===\n');

assert(labelCuadroEstado('PENDIENTE_ELABORAR') === 'C.C. en elaboración', 'estado elaboración');
assert(labelCuadroEstado('PENDIENTE_COORDINADOR') === 'C.C. en revisión Coordinador CM', 'estado revisión CM');
assert(labelCuadroEstado('OBSERVADO_COORDINADOR') === 'C.C. observado por Coordinador CM', 'estado obs CM');
assert(labelCuadroEstado('OBSERVADO_COORDINADOR', { respuesta_observaciones: 'ok' }) === 'C.C. subsanado', 'estado subsanado');
assert(labelCuadroEstado('PENDIENTE_DEC') === 'C.C. en revisión DEC', 'estado revisión DEC');
assert(labelCuadroEstado('OBSERVADO_DEC') === 'C.C. observado por DEC', 'estado obs DEC');
assert(labelCuadroEstado('APROBADO_DEC') === 'C.C. aprobado', 'estado aprobado');
assert(labelCuadroEstado('DERIVADO_CCP') === 'Derivado a CCP', 'estado derivado CCP');
assert(labelClient('FIRMADO_COORDINADOR') === ESTADOS_CUADRO_LABEL.FIRMADO_COORDINADOR
  || labelClient('FIRMADO_COORDINADOR') === 'C.C. en revisión Coordinador CM', 'FE/BE labels alineados');
assert(labelBandejaCuadroComparativo('PENDIENTE_DEC') === 'C.C. en revisión DEC', 'bandeja = detalle');
assert(labelEstadoExpedienteUnificado({ estado_cuadro: 'OBSERVADO_DEC' }) === 'C.C. observado por DEC', 'unificado');

const pdf = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoPdf.js'), 'utf8');
assert(/TOTAL GENERAL/.test(pdf), 'PDF TOTAL GENERAL');
assert(/Resumen por Centro/.test(pdf), 'PDF resumen centro/clasificador');
assert(!/emptyAdj/.test(pdf), 'PDF sin emptyAdj bajo adjudicado');

const ccp = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCcp.js'), 'utf8');
assert(!/ccBtnCcpGenerar/.test(ccp), 'sin Generar CCP');
assert(/Derivar a? ?CCP/.test(ccp), 'conserva Derivar a CCP');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoModal.js'), 'utf8');
assert(/Observación[\s\S]*obligatoria|La observación es obligatoria/.test(modal), 'obs obligatoria derivar CCP');
assert(/rol_derivacion/.test(modal), 'envía rol en derivación CCP');

const be = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
assert(/observación es obligatoria para derivar a CCP/i.test(be), 'BE exige observación CCP');
assert(/historial_revision/.test(be) && /derivacion_ccp/.test(be), 'persiste obs/usuario/rol/fecha');

const coord = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordModal.js'), 'utf8');
assert(/getCuadroPdfUrl/.test(coord), 'Coord descarga PDF persistido');
assert(/assertBlobForObjectUrl/.test(coord), 'guard createObjectURL');

const viewer = fs.readFileSync(path.join(root, 'src/utils/documentViewer.js'), 'utf8');
assert(/Documento sin contenido/.test(viewer), 'viewer no createObjectURL vacío');

const failed = tests.filter((t) => !t.ok);
console.log(failed.length ? `\n${failed.length} fallos` : '\nPASS OD31');
process.exit(failed.length ? 1 : 0);

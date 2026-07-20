/**
 * RC8.7 — Versionado del Cuadro Comparativo al observar.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  copiarDatosParaNuevaVersion,
  metaVersionDesdeRow,
} from '../server/lib/cuadroComparativoVersionado.js';
import { findTransicionRevision } from '../server/lib/cuadroComparativoRevision.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.7 Versionado Cuadro ===\n');

const prev = {
  items: [{ item_key: '1' }],
  primera_fuente: [{ id: 1 }],
  segunda_fuente: [{ id: 'sf1' }],
  adjudicacion: { proveedor_ganador_id: 9 },
  revision_coordinador: { conformidad: true },
  revision_dec: { conformidad: true },
  historial_versiones: [],
};
const obs = {
  version_origen: 1,
  version_nueva: 2,
  cuadro_origen_id: 10,
  accion: 'OBSERVAR_COORDINADOR',
  motivo: 'Error en precios',
  descripcion: 'Revise ítem 1',
  observacion: 'No coincide con cotización',
  usuario: 'Coord',
  fecha: '2026-07-18T00:00:00.000Z',
  estado: 'OBSERVADO_COORDINADOR',
};
const copy = copiarDatosParaNuevaVersion(prev, obs);
assert(copy.items?.length === 1, 'copia matriz/items');
assert(copy.primera_fuente?.length === 1, 'copia primera fuente');
assert(copy.segunda_fuente?.length === 1, 'copia segunda fuente');
assert(!!copy.adjudicacion, 'copia adjudicación/sustento');
assert(copy.revision_coordinador == null, 'limpia conformidad coordinador');
assert(copy.revision_dec == null, 'limpia conformidad DEC');
assert(copy.respuesta_observaciones === '', 'respuesta vacía en nueva versión');
assert(copy.observacion_pendiente?.motivo === 'Error en precios', 'observa pendiente con motivo');
assert(copy.historial_versiones.length === 1, 'historial versiones');

const meta = metaVersionDesdeRow({
  estado: 'ANULADO',
  version: 1,
  actualizado_por: 'Coord',
  datos_json: { version_meta: { observado: obs } },
});
assert(meta.vigente === false, 'archivada no vigente');
assert(meta.motivo === 'Error en precios', 'motivo en listado');

assert(
  findTransicionRevision('DERIVAR_COORDINADOR', 'OBSERVADO_COORDINADOR')?.to === 'PENDIENTE_COORDINADOR',
  'desde observado → Coordinador',
);
assert(
  findTransicionRevision('DERIVAR_COORDINADOR', 'OBSERVADO_DEC')?.to === 'PENDIENTE_COORDINADOR',
  'desde observado DEC → Coordinador (nunca DEC directo)',
);
assert(
  !findTransicionRevision('DERIVAR_DEC', 'OBSERVADO_COORDINADOR'),
  'no existe DERIVAR_DEC desde observado',
);
assert(
  !findTransicionRevision('DERIVAR_DEC', 'OBSERVADO_DEC'),
  'no existe DERIVAR_DEC desde observado DEC',
);

const lib = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
assert(/crearNuevaVersionPorObservacion/.test(lib), 'transitar usa versionado');
assert(/versionado:\s*true|versionado: true/.test(lib), 'respuesta versionado');
assert(/respuesta_observaciones/.test(lib), 'exige/guarda respuesta');
assert(/nunca|no directamente al DEC|Coordinador CM/.test(lib), 'bloquea salto a DEC');

const verLib = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativoVersionado.js'), 'utf8');
assert(/estado = 'ANULADO'/.test(verLib), 'archiva versión anterior');
assert(/INSERT INTO cuadros_comparativos/.test(verLib), 'inserta versión nueva');
assert(/firmado_nombre, firmado_contenido/.test(verLib) && /NULL, NULL/.test(verLib), 'sin firmas en nueva versión');

const ui = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoVersionado.js'), 'utf8');
assert(/Versión vigente/.test(ui) && /Historial|Motivo/.test(ui), 'UI historial');
assert(/Respuesta a observaciones/.test(ui), 'UI respuesta analista');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoModal.js'), 'utf8');
assert(/renderPanelVersionado|refreshVersiones|ccVersionHost/.test(modal), 'modal cablea versionado');
assert(/respuesta_observaciones/.test(modal), 'modal envía respuesta al derivar');

// PDF ya no bumpéa versión documental
assert(!/bumpVersion/.test(lib) || /RC8\.7/.test(lib), 'PDF no redefine versionado documental');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC8.7: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.7: PASS\n');

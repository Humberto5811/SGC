/**
 * RC8.5-C2 — Validación flujo operativo Coordinador CM (no Admin).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveRolRevision, ROLES_REVISION } from '../shared/cuadroComparativoRol.js';
import {
  evaluarAccionesCoordinador,
  renderPanelCoordinador,
  enRevisionCoordinador,
  isModoCoordinadorCm,
} from '../src/utils/cuadroComparativoCoordinador.js';
import { findTransicionRevision, RESPONSABLES_REVISION } from '../server/lib/cuadroComparativoRevision.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.5-C2 Flujo operativo Coordinador CM ===\n');

// Rol real Coordinador (no Admin)
const userCoord = { cargo: 'Coordinador CM', rol: 'dec' };
const userAdmin = { rol: 'admin', cargo: 'Administrador' };
assert(resolveRolRevision(userCoord) === ROLES_REVISION.COORDINADOR_CM, 'cargo Coordinador CM → rol operativo');
assert(resolveRolRevision(userAdmin) === ROLES_REVISION.ADMINISTRADOR, 'Admin no se usa como Coord');
assert(resolveRolRevision({ rol: 'dec', cargo: 'Analista de Contrataciones' }) === ROLES_REVISION.ANALISTA,
  'rol sistema dec ≠ Coordinador');

// Caso sin firma — acciones base + Derivar oculto con motivo
const sinFirma = evaluarAccionesCoordinador({
  id: 1,
  estado: 'PENDIENTE_COORDINADOR',
  tiene_pdf: true,
  pdf_nombre: 'Anexo.pdf',
  vigente: true,
});
assert(sinFirma.enCoord && sinFirma.puedeDescargar && sinFirma.puedeAdjuntar && sinFirma.puedeObservar,
  'sin firma: Descargar/Adjuntar/Observar habilitados');
assert(!sinFirma.puedeVerFirmado && !sinFirma.puedeConformidad && !sinFirma.puedeDerivar,
  'sin firma: Ver/Conformidad/Derivar no');
assert(sinFirma.faltantesDerivar.some((f) => /Firma vigente/i.test(f)), 'sin firma: informa falta firma');
assert(sinFirma.faltantesDerivar.some((f) => /Conformidad/i.test(f)), 'sin firma: informa falta conformidad');

const htmlSinFirma = renderPanelCoordinador(sinFirma.cuadro || {
  id: 1, estado: 'PENDIENTE_COORDINADOR', tiene_pdf: true, pdf_nombre: 'Anexo.pdf', vigente: true,
});
// render needs full cuadro object
const htmlSF = renderPanelCoordinador({
  id: 1, estado: 'PENDIENTE_COORDINADOR', tiene_pdf: true, pdf_nombre: 'Anexo.pdf', vigente: true,
});
assert(/Descargar Cuadro/.test(htmlSF) && /Adjuntar Cuadro Firmado/.test(htmlSF), 'labels operativos');
assert(/Observar/.test(htmlSF) && /Dar Conformidad/.test(htmlSF), 'Observar y Conformidad presentes');
assert(!/id="ccBtnCoordDerivarDec"/.test(htmlSF), 'sin firma: botón Derivar NO aparece');
assert(/ccCoordDerivarBlocked/.test(htmlSF) && /Firma vigente/i.test(htmlSF), 'sin firma: mensaje de bloqueo');

// Caso con firma
const conFirma = evaluarAccionesCoordinador({
  id: 1,
  estado: 'PENDIENTE_COORDINADOR',
  tiene_pdf: true,
  tiene_pdf_firmado: true,
  firmado_nombre: 'firmado.pdf',
  vigente: true,
});
assert(conFirma.puedeVerFirmado && conFirma.puedeConformidad && !conFirma.puedeDerivar,
  'con firma: Ver+Conformidad; Derivar aún no');
assert(conFirma.faltantesDerivar.every((f) => !/Firma vigente/i.test(f)), 'con firma: firma ya no falta');
assert(conFirma.faltantesDerivar.some((f) => /Conformidad/i.test(f)), 'con firma: falta conformidad');

// Caso con conformidad → Derivar aparece
const conforme = evaluarAccionesCoordinador({
  id: 1,
  estado: 'FIRMADO_COORDINADOR',
  tiene_pdf: true,
  tiene_pdf_firmado: true,
  conformidad_coordinador: true,
  vigente: true,
});
assert(conforme.puedeDerivar && !conforme.puedeConformidad, 'conforme: Derivar sí, Conformidad ya hecha');
const htmlConf = renderPanelCoordinador({
  id: 1,
  estado: 'FIRMADO_COORDINADOR',
  tiene_pdf: true,
  tiene_pdf_firmado: true,
  conformidad_coordinador: true,
  vigente: true,
});
assert(/id="ccBtnCoordDerivarDec"/.test(htmlConf), 'conforme: botón Derivar aparece');
assert(!/ccCoordDerivarBlocked/.test(htmlConf), 'conforme: sin mensaje de bloqueo');

// Caso observado (obs pendientes)
const observado = evaluarAccionesCoordinador({
  id: 1,
  estado: 'FIRMADO_COORDINADOR',
  tiene_pdf_firmado: true,
  conformidad_coordinador: true,
  vigente: true,
  observacion_pendiente: { motivo: 'Corregir matriz' },
});
assert(!observado.puedeDerivar, 'observado: Derivar bloqueado');
assert(observado.faltantesDerivar.some((f) => /observaciones/i.test(f)), 'observado: informa obs pendientes');
const htmlObs = renderPanelCoordinador({
  id: 1,
  estado: 'FIRMADO_COORDINADOR',
  tiene_pdf_firmado: true,
  conformidad_coordinador: true,
  vigente: true,
  observacion_pendiente: { motivo: 'Corregir matriz' },
});
assert(!/id="ccBtnCoordDerivarDec"/.test(htmlObs) && /observaciones pendientes/i.test(htmlObs),
  'observado: Derivar oculto + motivo');

// Caso versión no vigente
const noVigente = evaluarAccionesCoordinador({
  id: 1,
  estado: 'FIRMADO_COORDINADOR',
  tiene_pdf_firmado: true,
  conformidad_coordinador: true,
  vigente: false,
});
assert(!noVigente.puedeDerivar && noVigente.faltantesDerivar.some((f) => /Versión vigente/i.test(f)),
  'no vigente: informa versión');

// Caso derivado (ya en DEC) — fuera de revisión Coord
const derivado = evaluarAccionesCoordinador({
  id: 1,
  estado: 'PENDIENTE_DEC',
  tiene_pdf_firmado: true,
  conformidad_coordinador: true,
  vigente: true,
});
assert(!derivado.enCoord && !derivado.puedeDerivar && !derivado.puedeObservar, 'derivado: sin acciones Coord');
assert(!enRevisionCoordinador({ estado: 'PENDIENTE_DEC' }), 'PENDIENTE_DEC no es revisión Coord');

// Modo Coordinador real
assert(isModoCoordinadorCm(userCoord, { estado: 'PENDIENTE_COORDINADOR' }), 'isModo Coord+pendiente');
assert(!isModoCoordinadorCm(userAdmin, { estado: 'PENDIENTE_COORDINADOR' }), 'Admin no es modo Coord operativo');

// Workflow transitions
assert(findTransicionRevision('OBSERVAR_COORDINADOR', 'PENDIENTE_COORDINADOR')?.responsable
  === RESPONSABLES_REVISION.ANALISTA, 'Observar → Analista');
assert(findTransicionRevision('DERIVAR_DEC', 'FIRMADO_COORDINADOR')?.to === 'PENDIENTE_DEC', 'Derivar → DEC');
assert(findTransicionRevision('CONFORMIDAD_COORDINADOR', 'PENDIENTE_COORDINADOR')?.to === 'FIRMADO_COORDINADOR',
  'Conformidad no auto-deriva');

// Modal no usa Admin para flujo operativo Coord
const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordModal.js'), 'utf8');
assert(/enRevisionCoordinador/.test(modal) && /adminSupervision/.test(modal), 'modal separa supervisión Admin');
assert(/renderPanelCoordinador/.test(modal), 'panel Coord en barra');

const ui = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordinador.js'), 'utf8');
assert(/faltantesDerivar|ccCoordDerivarBlocked/.test(ui), 'informa condición que bloquea Derivar');
assert(/puedeDerivar \?/.test(ui) || /g\.puedeDerivar/.test(ui), 'Derivar condicional');

const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO/.test(wf), 'Workflow intacto');

// No tocar expediente documental
const docs = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoExpedienteDocs.js'), 'utf8');
assert(/buildExpedienteDocumental/.test(docs), 'organización documental intacta (C1)');

void htmlSinFirma;
const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.5-C2: PASS\n');

/**
 * OD32 / RC87 — Estado vigente tras historial con observación + DERIVADO_CCP.
 * Regresión: no mostrar "C.C. observado..." cuando la última acción oficial es Derivado a CCP.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveEstadoActualExpediente,
  labelEstadoCuadroVigente,
  prioridadEstadoCuadro,
  esExpedienteDerivadoCcp,
} from '../shared/estadoExpedienteVigente.js';
import { buildEstadoVisual } from '../src/utils/estadoVisualPresenter.js';
import { labelEstadoExpedienteUnificado } from '../src/utils/cuadroComparativoUtils.js';
import {
  assertNoMutacionTrasDerivadoCcp,
  labelCuadroEstado,
} from '../server/lib/cuadroComparativo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC87 / OD32 estado final Derivado a CCP ===\n');

// Prioridad: DERIVADO_CCP > observación histórica
assert(
  prioridadEstadoCuadro('DERIVADO_CCP') > prioridadEstadoCuadro('APROBADO_DEC'),
  'prioridad DERIVADO_CCP > APROBADO_DEC',
);
assert(
  prioridadEstadoCuadro('APROBADO_DEC') > prioridadEstadoCuadro('OBSERVADO_COORDINADOR'),
  'prioridad APROBADO_DEC > OBSERVADO_COORDINADOR',
);
assert(
  prioridadEstadoCuadro('PENDIENTE_COORDINADOR') === prioridadEstadoCuadro('OBSERVADO_COORDINADOR'),
  'prioridad revisión CM = observado CM (situación, no estado global distinto)',
);

// Historial completo del caso de regresión
const historialRevision = [
  { tipo: 'CREAR', estado: 'CUADRO_BORRADOR' },
  { tipo: 'DERIVAR_COORDINADOR', estado: 'PENDIENTE_COORDINADOR' },
  { tipo: 'OBSERVAR_COORDINADOR', estado: 'OBSERVADO_COORDINADOR' },
  { tipo: 'SUBSANAR', estado: 'OBSERVADO_COORDINADOR', respuesta: 'Corregido' },
  { tipo: 'DERIVAR_COORDINADOR', estado: 'PENDIENTE_COORDINADOR' },
  { tipo: 'DERIVAR_DEC', estado: 'PENDIENTE_DEC' },
  { tipo: 'APROBAR_DEC', estado: 'APROBADO_DEC' },
  { tipo: 'DERIVAR_CCP', estado: 'DERIVADO_CCP' },
];

const rowStaleObs = {
  estado_cuadro: 'DERIVADO_CCP',
  estado: 'DERIVADO_CCP',
  solicitud_estado: 'EN_CCP',
  payload: {
    workflowSnapshot: {
      etapaActual: 'CCP',
      // Intencionalmente stale: observación histórica en snapshot
      revisionEstado: 'OBSERVADO_COORDINADOR',
      fechaEstadoActual: '2026-07-01T10:00:00.000Z',
    },
    observaciones: [
      {
        estado: 'pendiente',
        destino_submodulo: 'Cuadro Comparativo',
        motivo: 'C.C. observado por Coordinador CM',
      },
    ],
  },
  datos_json: {
    historial_revision: historialRevision,
    derivacion_ccp: {
      usuario: 'analista.demo',
      fecha: '2026-07-20T12:00:00.000Z',
      observacion: 'Derivación formal a CCP',
      responsable_nombre: 'Responsable CCP',
    },
  },
};

const vigente = resolveEstadoActualExpediente(rowStaleObs);
assert(vigente.code === 'DERIVADO_CCP', 'resolve → DERIVADO_CCP pese a revisionEstado OBSERVADO');
assert(vigente.label === 'Derivado a CCP', 'label vigente Derivado a CCP');
assert(vigente.derivadoCcp === true, 'flag derivadoCcp');
assert(esExpedienteDerivadoCcp(rowStaleObs), 'esExpedienteDerivadoCcp');

const visual = buildEstadoVisual(rowStaleObs);
assert(visual.textoPrincipal === 'Derivado a CCP', 'badge bandeja: Derivado a CCP');
assert(visual.badgeObservado === false, 'sin badge Observado histórico como principal');

assert(
  labelEstadoExpedienteUnificado(rowStaleObs) === 'Derivado a CCP',
  'labelEstadoExpedienteUnificado uniforme',
);
assert(labelCuadroEstado('DERIVADO_CCP') === 'Derivado a CCP', 'BE label DERIVADO_CCP');
assert(
  labelEstadoCuadroVigente('OBSERVADO_COORDINADOR') === 'C.C. en Coordinación CM - Observado'
    || labelEstadoCuadroVigente('OBSERVADO_COORDINADOR') === 'C.C. observado por Coordinador CM',
  'historial conserva etiqueta de observación',
);

// Solo workflow CCP (sin estado_cuadro) también fuerza Derivado a CCP
const soloWorkflow = {
  payload: { workflowSnapshot: { etapaActual: 'CCP', revisionEstado: 'OBSERVADO_DEC' } },
};
assert(
  resolveEstadoActualExpediente(soloWorkflow).label === 'Derivado a CCP',
  'workflow CCP fuerza Derivado a CCP',
);

// Bloqueo endpoint
let blocked = false;
let status = null;
try {
  assertNoMutacionTrasDerivadoCcp('DERIVADO_CCP', 'guardar borrador');
} catch (err) {
  blocked = true;
  status = err.status;
}
assert(blocked && status === 409, 'mutación tras DERIVADO_CCP → 409');

// UI: acciones ocultas / visibles (OD34: Recargar y bloque técnico CCP fuera)
const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoModal.js'), 'utf8');
assert(/setHide\('#ccBtnGuardar',\s*hideAnalista \|\| derivado/.test(modal), 'oculta Guardar si derivado');
assert(/setHide\('#ccBtnAdjudicar',\s*hideAnalista \|\| derivado/.test(modal), 'oculta Adjudicar si derivado');
assert(/setHide\('#ccBtnPreview8a'/.test(modal), 'oculta Previsualizar');
assert(/setHide\('#ccBtnGenerar8a'/.test(modal), 'oculta Generar Anexo');
assert(/setHide\('#ccBtnDerivarCoord'/.test(modal), 'oculta Derivar Coord');
assert(/setHide\('#ccBtnRecargar',\s*true\)/.test(modal), 'oculta Recargar (OD34)');
assert(/Cerrar/.test(modal), 'conserva Cerrar');
assert(/ccBtnVerFirmado/.test(modal) && /ccBtnDlFirmado/.test(modal), 'conserva Ver/Descargar firmado');

const ccp = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCcp.js'), 'utf8');
assert(/DERIVADO_CCP'\) return ''/.test(ccp) || /e === 'DERIVADO_CCP'\) return ''/.test(ccp),
  'sin panel técnico en DERIVADO_CCP (datos en historial)');
assert(/Derivar a CCP/.test(ccp), 'conserva Derivar a CCP pre-derivación');
assert(/Ver Firmas/.test(ccp), 'conserva Ver Firmas pre-derivación');
assert(!/ccBtnCcpDescargarFinal/.test(ccp), 'sin descarga dinámica Cuadro Final');

const beRev = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativoRevision.js'), 'utf8');
assert(/revisionEstado:\s*revEstado|DERIVADO_CCP/.test(beRev), 'BE actualiza revisionEstado al derivar CCP');

const shared = fs.readFileSync(path.join(root, 'shared/estadoExpedienteVigente.js'), 'utf8');
assert(/resolveEstadoActualExpediente/.test(shared), 'fuente única compartida');

// Historial de observación no se elimina del payload de prueba
assert(
  Array.isArray(rowStaleObs.datos_json.historial_revision)
  && rowStaleObs.datos_json.historial_revision.some((h) => h.tipo === 'OBSERVAR_COORDINADOR'),
  'historial conserva OBSERVAR_COORDINADOR',
);

const failed = tests.filter((t) => !t.ok);
console.log(failed.length ? `\n${failed.length} fallos` : '\nPASS RC87 / OD32');
process.exit(failed.length ? 1 : 0);

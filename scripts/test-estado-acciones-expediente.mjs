/**
 * Fase 1 — capa estadoAccionesExpediente (Registro / Evaluación).
 */
import {
  getEtapaActual,
  getEstadoCodigo,
  estaEnEtapa,
  estaEnEstado,
  yaSuperoEtapa,
  estaEnRegistroAccionable,
  estaEnEvaluacionAccionable,
  estaAprobadoEnEvaluacion,
  LEGADO_NEGOCIO_A_CODIGO,
} from '../src/utils/estadoAccionesExpediente.js';
import {
  registroMenuItems,
  registroHiddenActions,
  evalMenuItems,
  evalHiddenActions,
} from '../src/utils/bandejaActions.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function esc(s) {
  return String(s ?? '');
}

function actDisabled(html, act) {
  const m = html.match(new RegExp(`data-act-trigger="${act}"([^>]*)>`, 'i'));
  if (!m) throw new Error(`No se encontró act ${act} en HTML oculto`);
  return /\bdisabled\b/i.test(m[1]);
}

// Lectores
assert(getEtapaActual({ estado_actual: 'EVALUACION' }) === 'EVALUACION', 'etapa estado_actual');
assert(getEtapaActual({ estadoActual: 'DEC' }) === 'DEC', 'etapa estadoActual');
assert(getEtapaActual({ estadoVigente: { etapa: 'PROGRAMACION' } }) === 'PROGRAMACION', 'etapa vigente');

assert(getEstadoCodigo({ estado_codigo: 'REQUERIMIENTO_EN_EVALUACION' }) === 'REQUERIMIENTO_EN_EVALUACION', 'codigo');
assert(getEstadoCodigo({ estado_vigente: 'REQUERIMIENTO_EN_DEC' }) === 'REQUERIMIENTO_EN_DEC', 'vigente');
assert(getEstadoCodigo({ estadoVigente: { codigo: 'REQUERIMIENTO_REGISTRADO' } }) === 'REQUERIMIENTO_REGISTRADO', 'vigente.obj');

// --- Casos A–C: getEstadoCodigo prioridad + skip vacíos ---
const casoA = getEstadoCodigo({
  estado_codigo: '',
  estado_vigente: 'REQUERIMIENTO_EN_EVALUACION',
});
assert(casoA === 'REQUERIMIENTO_EN_EVALUACION', `A: esperado REQUERIMIENTO_EN_EVALUACION, obtuvo ${casoA}`);

const casoB = getEstadoCodigo({
  estado_codigo: '   ',
  estadoVigente: { codigo: 'REQUERIMIENTO_EN_DEC' },
});
assert(casoB === 'REQUERIMIENTO_EN_DEC', `B: esperado REQUERIMIENTO_EN_DEC, obtuvo ${casoB}`);

const casoC = getEstadoCodigo({
  estado_codigo: 'REQUERIMIENTO_EN_EVALUACION',
  estado: 'Aprobado',
});
assert(casoC === 'REQUERIMIENTO_EN_EVALUACION', `C: canónico prevalece, obtuvo ${casoC}`);

// null / undefined también se saltan
assert(
  getEstadoCodigo({ estado_codigo: null, estado_vigente: undefined, estado: 'Registrado' }) === 'REQUERIMIENTO_REGISTRADO',
  'skip null/undefined',
);

// --- Casos D–F: alias contextual Aprobado ---
const casoD = getEstadoCodigo({ estado_actual: 'EVALUACION', estado: 'Aprobado' });
assert(casoD === 'REQUERIMIENTO_APROBADO', `D: esperado REQUERIMIENTO_APROBADO, obtuvo ${casoD}`);

const casoE = getEstadoCodigo({ estado_actual: 'DEC', estado: 'Aprobado' });
assert(casoE === 'REQUERIMIENTO_EN_DEC', `E: esperado REQUERIMIENTO_EN_DEC, obtuvo ${casoE}`);

const casoF = getEstadoCodigo({ estado: 'Aprobado' });
assert(casoF === 'REQUERIMIENTO_APROBADO', `F: sin etapa → REQUERIMIENTO_APROBADO (no EN_DEC), obtuvo ${casoF}`);
assert(casoF !== 'REQUERIMIENTO_EN_DEC', 'F: no inferir EN_DEC sin etapa');

// Legado → canónico (solo en helper)
assert(getEstadoCodigo({ estado: 'En trámite de aprobación' }) === 'REQUERIMIENTO_EN_EVALUACION', 'legado trámite');
assert(getEstadoCodigo({ estado: 'En tramite de aprobación' }) === 'REQUERIMIENTO_EN_EVALUACION', 'legado tramite');
assert(getEstadoCodigo({ estado: 'Registrado' }) === 'REQUERIMIENTO_REGISTRADO', 'legado Registrado');

assert(Object.keys(LEGADO_NEGOCIO_A_CODIGO).length > 0, 'tabla legado');
assert(LEGADO_NEGOCIO_A_CODIGO.APROBADO === 'REQUERIMIENTO_APROBADO', 'tabla Aprobado default');

assert(estaEnEtapa({ estado_actual: 'REGISTRADO' }, 'REGISTRADO') === true, 'estaEnEtapa');
assert(estaEnEstado({ estado_codigo: 'REQUERIMIENTO_EN_EVALUACION' }, 'REQUERIMIENTO_EN_EVALUACION') === true, 'estaEnEstado');

// yaSuperoEtapa usa prioridad del catálogo (no orden manual)
assert(yaSuperoEtapa({
  estado_codigo: 'REQUERIMIENTO_EN_DEC',
  estado_actual: 'DEC',
}, 'EVALUACION') === true, 'yaSupero EVALUACION');
assert(yaSuperoEtapa({
  estado_codigo: 'REQUERIMIENTO_EN_EVALUACION',
  estado_actual: 'EVALUACION',
}, 'EVALUACION') === false, 'no supera propia etapa');
assert(yaSuperoEtapa({
  estado_codigo: 'REQUERIMIENTO_REGISTRADO',
}, 'ETAPA_INEXISTENTE_XYZ') === false, 'etapa desconocida → false');
assert(yaSuperoEtapa({
  estado_codigo: 'CODIGO_INEXISTENTE_XYZ',
}, 'EVALUACION') === false, 'código desconocido → false seguro');

// --- Registro ---
assert(estaEnRegistroAccionable({
  estado_codigo: 'REQUERIMIENTO_REGISTRADO',
  estado_actual: 'REGISTRADO',
}) === true, 'registro canónico');
assert(estaEnRegistroAccionable({
  estado_codigo: 'REQUERIMIENTO_EN_EVALUACION',
  estado_actual: 'EVALUACION',
}) === false, 'registro bloqueado EN_EVALUACION');
assert(estaEnRegistroAccionable({
  estado_codigo: 'REQUERIMIENTO_EN_DEC',
  estado_actual: 'DEC',
}) === false, 'registro bloqueado EN_DEC');

const regRow = { id: 1, estado: 'Registrado', estado_actual: 'REGISTRADO', estado_codigo: 'REQUERIMIENTO_REGISTRADO' };
const regOk = registroMenuItems(regRow);
assert(regOk.find((m) => m.act === 'approve')?.disabled === false, 'Registro Aprobar ON');
assert(regOk.find((m) => m.act === 'edit')?.disabled === false, 'Registro Editar ON');
assert(regOk.find((m) => m.act === 'delete')?.disabled === false, 'Registro Eliminar ON');
const regHtmlOk = registroHiddenActions(regRow, esc);
assert(!actDisabled(regHtmlOk, 'approve'), 'Registro hidden Aprobar ON');
assert(!actDisabled(regHtmlOk, 'edit'), 'Registro hidden Editar ON');
assert(!actDisabled(regHtmlOk, 'delete'), 'Registro hidden Eliminar ON');

const regBlocked = {
  id: 2,
  estado: 'REQUERIMIENTO_EN_EVALUACION',
  estado_codigo: 'REQUERIMIENTO_EN_EVALUACION',
  estado_actual: 'EVALUACION',
};
const regOff = registroMenuItems(regBlocked);
assert(regOff.find((m) => m.act === 'approve')?.disabled === true, 'Registro Aprobar OFF evaluación');
assert(regOff.find((m) => m.act === 'edit')?.disabled === true, 'Registro Editar OFF evaluación');
assert(regOff.find((m) => m.act === 'delete')?.disabled === true, 'Registro Eliminar OFF evaluación');
const regHtmlOff = registroHiddenActions(regBlocked, esc);
assert(actDisabled(regHtmlOff, 'approve'), 'Registro hidden Aprobar OFF');
assert(actDisabled(regHtmlOff, 'edit'), 'Registro hidden Editar OFF');
assert(actDisabled(regHtmlOff, 'delete'), 'Registro hidden Eliminar OFF');

const regDec = {
  id: 3,
  estado_codigo: 'REQUERIMIENTO_EN_DEC',
  estado_actual: 'DEC',
};
assert(registroMenuItems(regDec).find((m) => m.act === 'approve')?.disabled === true, 'Registro OFF en DEC');

// --- Evaluación ---
assert(estaEnEvaluacionAccionable({
  estado_codigo: 'REQUERIMIENTO_EN_EVALUACION',
  estado_actual: 'EVALUACION',
}) === true, 'eval canónico');
assert(estaEnEvaluacionAccionable({ estado: 'En trámite de aprobación' }) === true, 'eval legado');
assert(estaAprobadoEnEvaluacion({ estado_codigo: 'REQUERIMIENTO_APROBADO' }) === true, 'aprobado canónico');
assert(estaEnEvaluacionAccionable({
  estado_codigo: 'REQUERIMIENTO_APROBADO',
  estado_actual: 'EVALUACION',
}) === false, 'eval bloqueado si APROBADO');
assert(estaEnEvaluacionAccionable({
  estado_codigo: 'REQUERIMIENTO_EN_DEC',
  estado_actual: 'DEC',
}) === false, 'eval bloqueado en DEC');

const evRow = {
  id: 10,
  estado_codigo: 'REQUERIMIENTO_EN_EVALUACION',
  estado_actual: 'EVALUACION',
};
const ev = evalMenuItems(evRow);
assert(ev.find((m) => m.act === 'approve')?.disabled === false, 'Eval Aprobar ON');
assert(ev.find((m) => m.act === 'obs')?.disabled === false, 'Eval Obs ON');
const evHtml = evalHiddenActions(evRow, esc);
assert(!/\beval-approve\b[^>]*\bdisabled\b/i.test(evHtml), 'Eval hidden Aprobar ON');
assert(!/\beval-observar\b[^>]*\bdisabled\b/i.test(evHtml), 'Eval hidden Observar ON');

const evDoneHtml = evalHiddenActions({
  id: 11,
  estado_codigo: 'REQUERIMIENTO_APROBADO',
  estado_actual: 'EVALUACION',
}, esc);
assert(/\beval-approve\b[^>]*\bdisabled\b/i.test(evDoneHtml), 'Eval hidden Aprobar OFF tras aprobar');

const evDone = evalMenuItems({ id: 11, estado_codigo: 'REQUERIMIENTO_APROBADO', estado_actual: 'EVALUACION' });
assert(evDone.find((m) => m.act === 'approve')?.disabled === true, 'Eval Aprobar OFF tras aprobar');
const evDec = evalMenuItems({ id: 12, estado_codigo: 'REQUERIMIENTO_EN_DEC', estado_actual: 'DEC' });
assert(evDec.find((m) => m.act === 'approve')?.disabled === true, 'Eval Aprobar OFF en DEC');

console.log('OK test-estado-acciones-expediente');
console.log(JSON.stringify({
  A: casoA,
  B: casoB,
  C: casoC,
  D: casoD,
  E: casoE,
  F: casoF,
  F_decision: 'sin etapa + Aprobado → REQUERIMIENTO_APROBADO (nunca EN_DEC)',
}, null, 2));

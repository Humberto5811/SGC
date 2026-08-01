// Pruebas del contrato de actor del Workflow.
// Casos: actor anidado válido; actor plano compat; actor ausente;
// ruta /simular construye actor correctamente; ningún secreto ni header x-user-* en el resultado.
import { assert, summarize } from './workflowTestUtils.mjs';
import { simularTransicion } from '../server/lib/workflow/workflowSimulator.js';
import { validarTransicion } from '../server/lib/workflow/workflowValidator.js';
import { normalizarActor } from '../shared/workflow/workflowContract.js';

const baseSim = {
  tipo_contratacion: 'BIEN',
  etapa_actual: 'REGISTRO',
  evento: 'REQUERIMIENTO_ENVIADO_EVALUACION',
  documentos: [],
  metadata: { idempotency_key: 'sim:actor:1:abc12345' },
};

// 1. Actor anidado válido { id, rol } → permitido
const anidado = simularTransicion({ ...baseSim, actor: { id: 7, rol: 'USUARIO_AU' } });
assert(anidado.permitido === true, '1. actor anidado { id, rol } válido permite');

// 2. Actor plano compat (actor_id / actor_rol) → permitido
const plano = simularTransicion({ ...baseSim, actor_id: 7, actor_rol: 'USUARIO_AU' });
assert(plano.permitido === true, '2. actor plano compat (actor_id/actor_rol) permite');

// 3. Actor ausente → rechazado con mensaje claro
const ausente = simularTransicion({ ...baseSim });
assert(ausente.permitido === false, '3. actor ausente rechazado');
assert(ausente.errores.some((e) => /actor es obligatorio/.test(e)), '4. mensaje actor obligatorio');

// 5. Normalizador: canónico
const normAnidado = normalizarActor({ actor: { id: 1, rol: 'DEC' } });
assert(normAnidado.id === 1 && normAnidado.rol === 'DEC', '5. normalizador actor anidado');
const normPlano = normalizarActor({ actor_id: 2, actor_rol: 'AU' });
assert(normPlano.id === 2 && normPlano.rol === 'AU', '6. normalizador actor plano compat');
const normUser = normalizarActor({ actor: { id: 999, rol: 'HACKER' }, user: { id: 3, rol: 'ADMIN' } });
assert(normUser.id === 3 && normUser.rol === 'ADMIN', '7. req.user gana sobre actor del cliente');

// 8. /simular con req.user: actor del cliente NO se usa
const simConUser = simularTransicion({
  ...baseSim,
  actor: { id: 999, rol: 'HACKER' },
  user: { id: 3, rol: 'ADMIN' },
});
assert(simConUser.permitido === true, '8. /simular con req.user permite');

// 9-10. Sin secretos ni headers x-user-* en el resultado
const resAnidado = anidado;
const resultadoString = JSON.stringify(resAnidado);
assert(!/x-user-|Authorization|Bearer|token|secret|password/i.test(resultadoString), '9. resultado no expone headers/secrets');
assert(!('actor' in resAnidado) || resAnidado.actor === undefined || resAnidado.actor === null, '10. resultado no replica actor del cliente');

// 11. Validator directo con actor anidado
const val = validarTransicion({ tipo_contratacion: 'BIEN', etapa_actual: 'REGISTRO', evento: 'REQUERIMIENTO_ENVIADO_EVALUACION', actor: { id: 7, rol: 'USUARIO_AU' } });
assert(val.valido === true, '11. validator acepta actor anidado');
const valPlano = validarTransicion({ tipo_contratacion: 'BIEN', etapa_actual: 'REGISTRO', evento: 'REQUERIMIENTO_ENVIADO_EVALUACION', actor_id: 7, actor_rol: 'USUARIO_AU' });
assert(valPlano.valido === true, '12. validator acepta actor plano compat');

summarize('test-workflow-actor');
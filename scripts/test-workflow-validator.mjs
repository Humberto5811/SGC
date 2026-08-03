// Pruebas de validación pura: tipo, etapa, evento, transición, salto, viáticos, idempotency, actor, permiso.
import { assert, summarize } from './workflowTestUtils.mjs';
import { validarTransicion } from '../server/lib/workflow/workflowValidator.js';
import { TIPOS_CONTRATACION as T } from '../shared/workflow/tiposContratacion.js';

const base = {
  tipo_contratacion: T.BIEN,
  etapa_actual: 'REGISTRO',
  evento: 'REQUERIMIENTO_ENVIADO_EVALUACION',
  actor_rol: 'USUARIO_AU',
  permiso: 'evaluacion:enviar',
  idempotency_key: 'test:req:123:abc12345',
};

// Válido
const ok = validarTransicion(base);
assert(ok.valido && ok.transicion_permitida, '1. transición válida permitida');
assert(ok.transicion?.etapa_destino === 'EVALUACION', '2. destino desde matriz');

// Tipo inválido
const badTipo = validarTransicion({ ...base, tipo_contratacion: 'XX' });
assert(!badTipo.valido && badTipo.errores.some((e) => /tipo_contratacion inválido/.test(e)), '3. tipo inválido rechazado');

// Etapa inválida
const badEtapa = validarTransicion({ ...base, etapa_actual: 'NO_EXISTE' });
assert(!badEtapa.valido && badEtapa.errores.some((e) => /etapa_actual inválida/.test(e)), '4. etapa inválida rechazada');

// Evento desconocido
const badEvento = validarTransicion({ ...base, evento: 'EVENTO_FALSO' });
assert(!badEvento.valido && badEvento.errores.some((e) => /evento desconocido/.test(e)), '5. evento desconocido rechazado');

// Transición no existe (salto prohibido)
const saltar = validarTransicion({ ...base, etapa_actual: 'REGISTRO', evento: 'DEC_APROBADO' });
assert(!saltar.valido && saltar.errores.some((e) => /transición no existe/.test(e)), '6. salto prohibido (REGISTRO→DEC_APROBADO)');

// Viáticos desactivados
const via = validarTransicion({ tipo_contratacion: T.VIATICO_PASAJE_AEREO, etapa_actual: 'INVITACIONES', evento: 'VIATICO_APROBADO_INVITACIONES', actor_rol: 'ESPECIALISTA_CONTRATACIONES', idempotency_key: 'test:via:1:abc12345' });
assert(!via.valido && via.errores.some((e) => /no habilitado/.test(e)), '7. viático desactivado bloqueado');

// Viático habilitado con flag
const viaFlag = validarTransicion({ ...{ tipo_contratacion: T.VIATICO_PASAJE_AEREO, etapa_actual: 'INVITACIONES', evento: 'VIATICO_APROBADO_INVITACIONES', actor_rol: 'ESPECIALISTA_CONTRATACIONES', idempotency_key: 'test:via:2:abc12345' }, flags: { WORKFLOW_ENGINE_VIATICOS: true } });
assert(viaFlag.valido, '8. viático habilitado con flag permite');

// Idempotency inválida
const badIdem = validarTransicion({ ...base, idempotency_key: 'xx' });
assert(!badIdem.valido && badIdem.errores.some((e) => /idempotency_key inválida/.test(e)), '9. idempotency inválida');

// Actor ausente
const noActor = validarTransicion({ ...base, actor_rol: undefined, actor_id: undefined });
assert(!noActor.valido && noActor.errores.some((e) => /actor/.test(e)), '10. actor requerido');

// Permiso incorrecto
const badPermiso = validarTransicion({ ...base, permiso: 'otro:permiso' });
assert(!badPermiso.valido && badPermiso.errores.some((e) => /permiso incorrecto/.test(e)), '11. permiso incorrecto rechazado');

// Documento faltante
const faltaDoc = validarTransicion({ ...base, documentos: [], documentos_requeridos: ['adjunto_informe'] });
assert(!faltaDoc.valido && faltaDoc.documentos_faltantes.includes('adjunto_informe'), '12. documento faltante');

// Requisito faltante
const faltaReq = validarTransicion({ ...base, requisitos_cumplidos: [], requisitos_obligatorios: ['pedidos_sigamef'] });
assert(!faltaReq.valido && faltaReq.requisitos_faltantes.includes('pedidos_sigamef'), '13. requisito faltante');

summarize('test-workflow-validator');
/**
 * Workflow Validator — validación pura de transiciones.
 * Invocable sin BD; recibe todo el contexto por parámetro.
 *
 * Valida:
 * - tipo válido; etapa válida; evento existente;
 * - transición existente; tipo permitido; salto prohibido; etapa origen correcta;
 * - viáticos desactivados; idempotency_key válida; actor presente; permiso declarado.
 *
 * Diferencia: error bloqueante (errores), advertencia (advertencias),
 * requisito faltante (requisitos_faltantes), documento faltante (documentos_faltantes).
 *
 * No implementa guards SQL específicos de módulos productivos (fase futura).
 */
import {
  esTipoValido,
  esTipoHabilitado,
  getTipoMeta,
} from '../../../shared/workflow/tiposContratacion.js';
import {
  esEtapaValida,
  getEtapaMeta,
  esEtapaPermitidaParaTipo,
} from '../../../shared/workflow/etapas.js';
import { esEventoValido, getEventoMeta } from '../../../shared/workflow/eventos.js';
import {
  getTransition,
  getAllowedTransitions,
} from '../../../shared/workflow/transiciones.js';
import { normalizarActor } from '../../../shared/workflow/workflowContract.js';

/** Flags por defecto (seguros): viáticos y escritura desactivados. */
export const FEATURE_FLAGS_DEFAULT = Object.freeze({
  WORKFLOW_ENGINE_BASE: true,
  WORKFLOW_ENGINE_WRITE_ENABLED: false,
  WORKFLOW_ENGINE_INVITACIONES: false,
  WORKFLOW_ENGINE_RECEPCION: false,
  WORKFLOW_ENGINE_VALIDACIONES: false,
  WORKFLOW_ENGINE_CUADRO: false,
  WORKFLOW_ENGINE_REGISTRO: false,
  WORKFLOW_ENGINE_DEC: false,
  WORKFLOW_ENGINE_PROGRAMACION: false,
  WORKFLOW_ENGINE_COORDINACION_CM: false,
  WORKFLOW_ENGINE_ORDENES: false,
  WORKFLOW_ENGINE_VIATICOS: false,
});

function formatoIdempotencyKeyValida(key) {
  if (typeof key !== 'string' || !key.trim()) return false;
  // Formato recomendado: modulo:entidad:id:hash (letras, números, ':', '-', '_', '.')
  return /^[A-Za-z0-9:_\-.]{8,160}$/.test(key);
}

/**
 * Valida una transición de forma pura.
 *
 * @param {object} context
 * @param {string} context.tipo_contratacion
 * @param {string|null} context.etapa_actual  (null/'' para eventos de creación)
 * @param {string} context.evento
 * @param {string} [context.idempotency_key]
 * @param {string} [context.actor_id]
 * @param {string} [context.actor_rol]
 * @param {string} [context.permiso]
 * @param {string[]} [context.documentos]
 * @param {string[]} [context.requisitos_cumplidos]
 * @param {object} [context.flags]
 * @returns {{
 *   valido, errores, advertencias, requisitos_faltantes, documentos_faltantes,
 *   transicion_permitida, transicion: object|null
 * }}
 */
export function validarTransicion(context = {}) {
  const errores = [];
  const advertencias = [];
  const requisitosFaltantes = [];
  const documentosFaltantes = [];

  const tipo = String(context.tipo_contratacion || '').trim();
  const etapaActual = String(context.etapa_actual || '').trim().toUpperCase();
  const evento = String(context.evento || '').trim().toUpperCase();
  const flags = { ...FEATURE_FLAGS_DEFAULT, ...(context.flags || {}) };

  // 1. Tipo válido
  if (!tipo) errores.push('tipo_contratacion es obligatorio');
  else if (!esTipoValido(tipo)) errores.push(`tipo_contratacion inválido: ${tipo}`);

  // 2. Tipo no habilitado por defecto (viáticos): permitido SOLO si su flag está en on
  if (tipo && !esTipoHabilitado(tipo)) {
    const meta = getTipoMeta(tipo);
    const flag = meta?.flag || 'WORKFLOW_ENGINE_VIATICOS';
    if (flags[flag] === true) {
      advertencias.push(`tipo_contratacion ${tipo} habilitado vía ${flag}=on`);
    } else {
      errores.push(`tipo_contratacion no habilitado: ${tipo} (requiere ${flag}=on)`);
    }
  }

  // 3. Etapa válida
  if (etapaActual && !esEtapaValida(etapaActual)) {
    errores.push(`etapa_actual inválida: ${etapaActual}`);
  }

  // 4. Evento existe
  if (!evento) errores.push('evento es obligatorio');
  else if (!esEventoValido(evento)) errores.push(`evento desconocido: ${evento}`);

  // 5. Transición existente (matriz) — incluye eventos de creación (etapa vacía)
  let transicion = null;
  if (tipo && evento) {
    if (etapaActual) {
      transicion = getTransition({ tipoContratacion: tipo, etapaOrigen: etapaActual, eventoCodigo: evento });
    } else {
      // Origen vacío = creación
      transicion = getTransition({ tipoContratacion: tipo, etapaOrigen: '', eventoCodigo: evento });
    }
    if (!transicion && !etapaActual) {
      // Fallback adicional por si no hay transición de creación explícita
      transicion = getTransition({ tipoContratacion: tipo, etapaOrigen: 'REGISTRO', eventoCodigo: evento });
    }
    if (!transicion) {
      errores.push(`transición no existe para tipo=${tipo}, origen=${etapaActual || '(creación)'}, evento=${evento}`);
    }
  }

  // 6. Tipo permitido en la transición y etapa permitida para el tipo
  if (transicion) {
    if (transicion.feature_flag && flags[transicion.feature_flag] !== true) {
      errores.push(`evento bloqueado por feature flag: ${transicion.feature_flag} debe estar en on`);
    }
    const metaEtapa = getEtapaMeta(transicion.etapa_destino);
    if (metaEtapa && !esEtapaPermitidaParaTipo(transicion.etapa_destino, tipo)) {
      errores.push(`etapa destino ${transicion.etapa_destino} no permitida para tipo ${tipo}`);
    }
  }

  // 7. Salto prohibido: el cliente no envía destino; se valida que origen exista en la matriz
  if (etapaActual && transicion) {
    const permitidas = getAllowedTransitions({ tipoContratacion: tipo, etapaOrigen: etapaActual });
    const existe = permitidas.some((t) => t.evento_codigo === evento);
    if (!existe) {
      // Ya cubierto por error de transición inexistente; aquí solo advertencia si transición vino por creación
      advertencias.push('origen de creación usado para evento no-creación');
    }
  }

  // 8. Idempotency key
  if (context.idempotency_key && !formatoIdempotencyKeyValida(context.idempotency_key)) {
    errores.push('idempotency_key inválida (8-160 caracteres: alfanuméricos, ":": "-", "_", ".")');
  }

  // 9. Actor presente — formato canónico `actor: { id, rol }` o compat plano
  const actorNormalizado = normalizarActor(context);
  if (!actorNormalizado.id && !actorNormalizado.rol) {
    errores.push('actor es obligatorio ({ id, rol } o actor_id/actor_rol compat)');
  }

  // 10. Permiso declarado
  if (transicion && context.permiso && transicion.permiso !== context.permiso) {
    errores.push(`permiso incorrecto: se requiere ${transicion.permiso}`);
  }

  // 11. Documentos obligatorios (checklists declarativos, no SQL) — bloqueante
  const docs = Array.isArray(context.documentos) ? context.documentos : [];
  const docsRequ = (context.documentos_requeridos || []);
  for (const d of docsRequ) {
    if (!docs.some((x) => String(x).trim() === d)) documentosFaltantes.push(d);
  }
  if (documentosFaltantes.length) {
    errores.push(`documentos faltantes: ${documentosFaltantes.join(', ')}`);
  }

  // 12. Requisitos faltantes (checklists declarativos) — bloqueante
  const reqs = Array.isArray(context.requisitos_cumplidos) ? context.requisitos_cumplidos : [];
  const reqsRequ = (context.requisitos_obligatorios || []);
  for (const r of reqsRequ) {
    if (!reqs.some((x) => String(x).trim() === r)) requisitosFaltantes.push(r);
  }
  if (requisitosFaltantes.length) {
    errores.push(`requisitos faltantes: ${requisitosFaltantes.join(', ')}`);
  }

  // 13. Evento interno sin cambio de ubicación: origen == destino (guardar para lectura)
  if (transicion) {
    const evtMeta = getEventoMeta(evento);
    if (evtMeta && !evtMeta.cambiaUbicacion && transicion.cambiaUbicacion) {
      advertencias.push(`catálogo de eventos marca ${evento} sin cambio de ubicación, matriz lo marca con cambio`); // incoherencia interna
    }
  }

  const transicionPermitida = errores.length === 0;
  return {
    valido: transicionPermitida,
    errores,
    advertencias,
    requisitos_faltantes: requisitosFaltantes,
    documentos_faltantes: documentosFaltantes,
    transicion_permitida: transicionPermitida,
    transicion: transicionPermitida ? transicion : null,
  };
}

export default {
  validarTransicion,
  FEATURE_FLAGS_DEFAULT,
};
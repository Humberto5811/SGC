/**
 * RC8.17.8H5 — Observaciones desde Cont.Menores hacia tramos upstream permitidos.
 */
import {
  esDestinoObservacionDecSoportado,
  listarCandidatosObservacionDestino,
  mapDestinoSubmoduloAEtapaObservacion,
} from './candidatosObservacionDestino.js';

export const DESTINOS_OBSERVACION_CONT_MENORES = Object.freeze([
  'Registro de Requerimiento',
  'Registro de Requerimientos',
  'Evaluación de Requerimiento',
  'Evaluación de Requerimientos',
  'DEC',
  'Programación',
  'Programacion',
]);

export function esDestinoObservacionContMenoresSoportado(destinoSubmodulo = '') {
  return esDestinoObservacionDecSoportado(destinoSubmodulo);
}

export async function listarCandidatosObservacionContMenores({
  requerimientoId,
  destinoSubmodulo = '',
  search = '',
} = {}) {
  if (destinoSubmodulo && !esDestinoObservacionContMenoresSoportado(destinoSubmodulo)) {
    const err = new Error('Destino no permitido desde Cont.Menores');
    err.status = 400;
    err.code = 'DESTINO_OBSERVACION_NO_ELEGIBLE';
    throw err;
  }
  return listarCandidatosObservacionDestino({
    requerimientoId,
    destinoSubmodulo,
    search,
  });
}

export async function assertUsuarioDestinoObservacionContMenores({
  requerimientoId,
  destinoSubmodulo,
  usuarioDestinoId,
}) {
  const lista = await listarCandidatosObservacionContMenores({
    requerimientoId,
    destinoSubmodulo,
  });
  const uid = Number(usuarioDestinoId);
  const todos = [...(lista.recomendado ? [lista.recomendado] : []), ...(lista.candidatos || [])];
  const found = todos.find((c) => Number(c.id) === uid);
  if (!found) {
    const err = new Error('Usuario destino no elegible para la observación');
    err.status = 422;
    err.code = 'RESPONSABLE_OBSERVACION_INVALIDO';
    throw err;
  }
  return { ok: true, candidato: found, etapa: mapDestinoSubmoduloAEtapaObservacion(destinoSubmodulo) };
}

/**
 * RC8.6A.1 — Dueño único de persistencia de estado/responsable.
 *
 * Contrato:
 * - Toda escritura oficial de estado vigente + asignación pasa por aquí.
 * - Acepta `client` externo (misma tx); no abre segunda tx si ya hay client.
 * - domainMutator corre en la misma tx; si falla → rollback completo.
 * - Workflow Engine solo valida/resuelve; no persiste fuente única por su cuenta.
 */
import { getTransition } from '../../shared/workflow/transiciones.js';
import { getEtapaMeta } from '../../shared/workflow/etapas.js';
import { normalizarTipo } from '../../shared/workflow/tiposContratacion.js';
import { TIPO_RESPONSABLE } from '../../shared/resolvedorEstadoResponsable.js';
import { withTransaction } from './workflow/workflowTransaction.js';
import {
  getExistingEventByIdempotencyKey,
  tipoDeRequerimiento,
  etapaDeRequerimiento,
} from './workflow/workflowRepository.js';
import { insertWorkflowEvento, appendMovimiento, buildMovimientoEntry } from './workflow/workflowHistory.js';
import { getEstadoNegocioFromEtapa } from './trazabilidad.js';
import { isEventoTransicionPersona } from './workflowTransicionResponsable.js';
import {
  resolverResponsableSincero,
  buildEstadoLabels,
  getEstadoVigenteForUpdate,
  cerrarAsignacionActiva,
  crearAsignacion,
  upsertEstadoVigente,
  syncLegacyRequerimiento,
  mapEtapaDestinoBD,
  FUENTE_RESPONSABLE,
  ORIGEN_ESCRITURA_VIGENTE,
} from './expedienteEstadoPersistido.js';

/** Dueño único de persistencia (documentación / asserts). */
export const DUENO_PERSISTENCIA_ESTADO = 'transicionarExpediente';

function buildIdemKey(requerimientoId, evento, usuarioOrigenId, metadata = {}) {
  if (metadata.idempotency_key) return String(metadata.idempotency_key);
  if (metadata.client_request_id) {
    return `rc86a:${requerimientoId}:${evento}:crq:${String(metadata.client_request_id).slice(0, 80)}`;
  }
  const actor = usuarioOrigenId != null ? `:u${usuarioOrigenId}` : '';
  return `rc86a:${requerimientoId}:${evento}${actor}`;
}

/**
 * @param {object} args
 * @param {object|null} [args.client] — reutilizar tx externa (obligatorio para atomicidad multi-paso)
 * @param {Function|null} [args.domainMutator] — async (tx, ctx) => any ; misma tx
 */
export async function transicionarExpediente({
  requerimientoId,
  evento,
  usuarioOrigenId = null,
  usuarioDestinoId = null,
  unidadDestino = null,
  motivo = '',
  metadata = {},
  actorRol = 'SISTEMA',
  domainMutator = null,
  client = null,
  failAfterEstado = false,
  failAfterAsignacion = false,
  failTrazabilidad = false,
  failDomainMutator = false,
} = {}) {
  const rid = parseInt(requerimientoId, 10);
  if (!Number.isFinite(rid) || rid <= 0) {
    const err = new Error('requerimientoId inválido');
    err.code = 'INVALID_EXPEDIENTE';
    throw err;
  }
  const eventoCodigo = String(evento || '').trim().toUpperCase();
  if (!eventoCodigo) {
    const err = new Error('evento obligatorio');
    err.code = 'INVALID_EVENTO';
    throw err;
  }

  let usuarioDestinoIdNorm = usuarioDestinoId != null && Number.isFinite(Number(usuarioDestinoId))
    ? Number(usuarioDestinoId)
    : null;
  if (usuarioDestinoIdNorm == null && metadata?.usuario_destino_id != null
    && Number.isFinite(Number(metadata.usuario_destino_id))) {
    usuarioDestinoIdNorm = Number(metadata.usuario_destino_id);
  }
  if (isEventoTransicionPersona(eventoCodigo) && !usuarioDestinoIdNorm) {
    const err = new Error(`La transición ${eventoCodigo} requiere usuario_destino_id (persona responsable)`);
    err.code = 'TRANSICION_SIN_PERSONA';
    err.status = 400;
    throw err;
  }

  const idemKey = buildIdemKey(rid, eventoCodigo, usuarioOrigenId, metadata);

  return withTransaction(async (tx) => {
    const { rows: lockRows } = await tx.query(
      'SELECT * FROM requerimientos WHERE id = $1 FOR UPDATE',
      [rid],
    );
    if (!lockRows.length) {
      const err = new Error('Requerimiento no encontrado');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const row = lockRows[0];
    const estadoVigentePrevio = await getEstadoVigenteForUpdate(tx, rid);

    const previo = await getExistingEventByIdempotencyKey(idemKey, tx);
    if (previo) {
      const { rows: fresh } = await tx.query('SELECT * FROM requerimientos WHERE id = $1', [rid]);
      const { rows: evRows } = await tx.query(
        'SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1',
        [rid],
      );
      return {
        ok: true,
        idempotente: true,
        evento: previo,
        expediente: fresh[0] || row,
        estado_vigente: evRows[0] || null,
        dueno_persistencia: DUENO_PERSISTENCIA_ESTADO,
      };
    }

    const tipo = tipoDeRequerimiento(row) || normalizarTipo(metadata.tipo_contratacion) || '';
    // La etapa canónica prevalece sobre su proyección legacy (p. ej. varias
    // etapas de ejecución se proyectan como EN_EJECUCION).
    const etapaOrigen = String(
      estadoVigentePrevio?.etapa_codigo || etapaDeRequerimiento(row) || 'REGISTRO',
    ).toUpperCase();
    let transicion = getTransition({
      tipoContratacion: tipo,
      etapaOrigen,
      eventoCodigo,
    });
    if (!transicion && etapaOrigen === 'REGISTRO') {
      transicion = getTransition({ tipoContratacion: tipo, etapaOrigen: '', eventoCodigo });
    }
    // Alias legacy: ACTOS_PREPARATORIOS ↔ COORDINACION_CM
    if (!transicion && etapaOrigen === 'ACTOS_PREPARATORIOS') {
      transicion = getTransition({
        tipoContratacion: tipo,
        etapaOrigen: 'COORDINACION_CM',
        eventoCodigo,
      });
    }
    if (!transicion && (etapaOrigen === 'VALIDACION_USUARIO' || etapaOrigen === 'VALIDACION')) {
      transicion = getTransition({
        tipoContratacion: tipo,
        etapaOrigen: 'VALIDACIONES',
        eventoCodigo,
      });
    }
    if (!transicion && etapaOrigen === 'EN_EJECUCION') {
      transicion = getTransition({
        tipoContratacion: tipo,
        etapaOrigen: 'REGISTRO_ORDEN',
        eventoCodigo,
      });
    }
    if (!transicion) {
      const err = new Error(`Transición no permitida: ${tipo} ${etapaOrigen} ${eventoCodigo}`);
      err.code = 'TRANSITION_NOT_FOUND';
      throw err;
    }

    const etapaDestino = transicion.etapa_destino;
    const cambiaUbicacion = !!transicion.cambia_ubicacion;
    let etapaEfectiva = cambiaUbicacion ? etapaDestino : etapaOrigen;
    let metaEtapa = getEtapaMeta(etapaEfectiva) || getEtapaMeta('REGISTRO');
    const labels = buildEstadoLabels(
      etapaEfectiva,
      cambiaUbicacion ? etapaEfectiva : (row.estado || etapaEfectiva),
    );

    let resp = resolverResponsableSincero({
      usuarioDestinoId: usuarioDestinoIdNorm,
      unidadDestino: unidadDestino || transicion.responsable_destino || metaEtapa.responsableLabel,
      etapaCodigo: etapaEfectiva,
    });

    // RC8.17.2B-F1 — piloto Registro/Evaluación (focalizado, no global).
    let usuarioDestinoEfectivo = usuarioDestinoIdNorm;
    let metaTransicion = { ...(metadata || {}) };
    if (eventoCodigo === 'REQUERIMIENTO_REGISTRADO') {
      const { applyPilotCreacion, getPilotEstadoLabels, isPilotEvento } = await import('./pilotRegistroEvaluacion.js');
      const pilot = await applyPilotCreacion({
        resp,
        usuarioOrigenId,
        usuarioDestinoId: usuarioDestinoIdNorm,
        actorRol,
        row,
        unidadDestino: unidadDestino || metaEtapa.responsableLabel,
        etapaCodigo: etapaEfectiva,
        client: tx,
      });
      resp = pilot.resp;
      if (pilot.usuarioDestinoId != null) usuarioDestinoEfectivo = pilot.usuarioDestinoId;
      if (isPilotEvento(eventoCodigo)) {
        const pilotLabels = getPilotEstadoLabels();
        labels.estadoCodigo = pilotLabels.estadoCodigo;
        labels.estadoLabel = pilotLabels.estadoLabel;
      }
    } else if (eventoCodigo === 'REQUERIMIENTO_ENVIADO_EVALUACION') {
      const { applyPilotEnvioEvaluacion, getPilotEstadoLabels, isPilotEvento } = await import('./pilotRegistroEvaluacion.js');
      const pilot = await applyPilotEnvioEvaluacion({
        resp,
        usuarioDestinoId: usuarioDestinoIdNorm,
        unidadDestino: unidadDestino || metaEtapa.responsableLabel,
        requerimientoId: rid,
        row,
        etapaCodigo: etapaEfectiva,
        client: tx,
        metadata: metaTransicion,
      });
      resp = pilot.resp;
      if (pilot.resp?.responsableUsuarioId != null) {
        usuarioDestinoEfectivo = pilot.resp.responsableUsuarioId;
      }
      if (pilot.metaExtra && typeof pilot.metaExtra === 'object') {
        Object.assign(metaTransicion, pilot.metaExtra);
      }
      if (pilot.ambiguedad) {
        metaTransicion.pilot_director_ambiguo = pilot.ambiguedad;
      }
      if (isPilotEvento(eventoCodigo)) {
        const pilotLabels = getPilotEstadoLabels();
        labels.estadoCodigo = pilotLabels.estadoCodigo;
        labels.estadoLabel = pilotLabels.estadoLabel;
      }
    } else if (isEventoTransicionPersona(eventoCodigo)) {
      const { applyPilotTransicionPersona, getPilotEstadoLabelsForEvento } =
        await import('./workflowTransicionResponsable.js');
      metaTransicion.etapa_origen = etapaOrigen;
      metaTransicion.etapa_destino = etapaDestino;
      metaTransicion.evento = eventoCodigo;
      const pilot = await applyPilotTransicionPersona({
        resp,
        usuarioDestinoId: usuarioDestinoIdNorm,
        unidadDestino: unidadDestino || metaEtapa.responsableLabel,
        requerimientoId: rid,
        row,
        etapaCodigo: etapaEfectiva,
        eventoCodigo,
        client: tx,
        metadata: metaTransicion,
      });
      resp = pilot.resp;
      if (pilot.resp?.responsableUsuarioId != null) {
        usuarioDestinoEfectivo = pilot.resp.responsableUsuarioId;
      }
      if (pilot.metaExtra && typeof pilot.metaExtra === 'object') {
        Object.assign(metaTransicion, pilot.metaExtra);
      }
      if (pilot.ambiguedad?.ambiguo) {
        metaTransicion.pilot_responsable_ambiguo = pilot.ambiguedad;
      }
      const pilotLabels = getPilotEstadoLabelsForEvento(eventoCodigo);
      if (pilotLabels) {
        labels.estadoCodigo = pilotLabels.estadoCodigo;
        labels.estadoLabel = pilotLabels.estadoLabel;
      }
    } else if (eventoCodigo === 'EVALUACION_OBSERVADA') {
      const { applyPilotObservacionEvaluacionRegistro } = await import('./pilotRegistroEvaluacion.js');
      const pilotObs = applyPilotObservacionEvaluacionRegistro({
        resp,
        usuarioDestinoId: usuarioDestinoIdNorm,
        unidadDestino: unidadDestino || metaEtapa.responsableLabel,
        metadata: metaTransicion,
        etapaEfectiva,
        labels,
      });
      resp = pilotObs.resp;
      etapaEfectiva = pilotObs.etapaEfectiva;
      metaEtapa = getEtapaMeta(etapaEfectiva) || metaEtapa;
      Object.assign(labels, pilotObs.labels);
      metaTransicion = { ...metaTransicion, ...pilotObs.metaExtra };
      if (pilotObs.usuarioDestinoEfectivo != null) {
        usuarioDestinoEfectivo = pilotObs.usuarioDestinoEfectivo;
      }
    } else if (eventoCodigo === 'DEC_OBSERVADA') {
      const { applyPilotObservacionDecDestino } = await import('./workflowTransicionResponsable.js');
      metaTransicion.etapa_origen = etapaOrigen;
      metaTransicion.etapa_destino = metaTransicion.etapa_destino
        || metaTransicion.destino_etapa
        || etapaDestino;
      metaTransicion.evento = eventoCodigo;
      const pilotObs = applyPilotObservacionDecDestino({
        resp,
        usuarioDestinoId: usuarioDestinoIdNorm,
        unidadDestino: unidadDestino || metaEtapa.responsableLabel,
        metadata: metaTransicion,
        etapaEfectiva,
        labels,
      });
      resp = pilotObs.resp;
      etapaEfectiva = pilotObs.etapaEfectiva;
      metaEtapa = getEtapaMeta(etapaEfectiva) || metaEtapa;
      Object.assign(labels, pilotObs.labels);
      metaTransicion = { ...metaTransicion, ...pilotObs.metaExtra };
      if (pilotObs.usuarioDestinoEfectivo != null) {
        usuarioDestinoEfectivo = pilotObs.usuarioDestinoEfectivo;
      }
    } else if (eventoCodigo === 'OBSERVACION_SUBSANADA') {
      const { applyPilotObservacionSubsanada } = await import('./pilotRegistroEvaluacion.js');
      const pilotSub = await applyPilotObservacionSubsanada({
        resp,
        usuarioDestinoId: usuarioDestinoIdNorm,
        unidadDestino: unidadDestino || metaEtapa.responsableLabel,
        metadata: metaTransicion,
        etapaEfectiva,
        labels,
        row,
        requerimientoId: rid,
        client: tx,
      });
      resp = pilotSub.resp;
      etapaEfectiva = pilotSub.etapaEfectiva;
      metaEtapa = getEtapaMeta(etapaEfectiva) || metaEtapa;
      Object.assign(labels, pilotSub.labels);
      metaTransicion = { ...metaTransicion, ...pilotSub.metaExtra };
      if (pilotSub.usuarioDestinoEfectivo != null) {
        usuarioDestinoEfectivo = pilotSub.usuarioDestinoEfectivo;
      }
    }

    // 1. Mutación de dominio PRIMERO (misma tx) — si falla, nada se confirma
    let domainResults = null;
    if (failDomainMutator) {
      const err = new Error('Fallo simulado de domainMutator');
      err.code = 'TEST_FAIL_DOMAIN';
      throw err;
    }
    if (typeof domainMutator === 'function') {
      domainResults = await domainMutator(tx, {
        requerimientoId: rid,
        expediente_id: rid,
        transicion,
        row,
        evento: eventoCodigo,
        responsable: resp,
      });
    }

    // 2-3. Cerrar asignación + crear nueva (RC8.7.1 origen TRANSICION)
    const origenEscritura = ORIGEN_ESCRITURA_VIGENTE.TRANSICION;
    await cerrarAsignacionActiva(tx, rid, { origenEscritura });
    const asignacion = await crearAsignacion(tx, {
      requerimientoId: rid,
      etapaCodigo: etapaEfectiva,
      usuarioId: resp.responsableUsuarioId,
      unidadCodigo: resp.responsableUnidad,
      tipoResponsable: resp.responsableTipo,
      origenAsignacion: 'transicionarExpediente',
      asignadoPor: usuarioOrigenId != null ? String(usuarioOrigenId) : actorRol,
      motivo: motivo || null,
      origenEscritura,
    });
    if (failAfterAsignacion) {
      const err = new Error('Fallo simulado post-asignación');
      err.code = 'TEST_FAIL_ASIGNACION';
      throw err;
    }

    // 4. Estado vigente
    const estadoVigente = await upsertEstadoVigente(tx, {
      requerimientoId: rid,
      estadoCodigo: labels.estadoCodigo,
      estadoLabel: labels.estadoLabel,
      etapaCodigo: labels.etapaCodigo,
      etapaLabel: labels.etapaLabel,
      responsableTipo: resp.responsableTipo,
      responsableUsuarioId: resp.responsableUsuarioId,
      responsableUnidad: resp.responsableUnidad,
      responsableFuente: resp.responsableFuente,
      actualizadoPor: usuarioOrigenId != null ? String(usuarioOrigenId) : actorRol,
      metadata: {
        evento: eventoCodigo,
        motivo: motivo || null,
        etapa_origen: etapaOrigen,
        ...metaTransicion,
      },
      origenEscritura,
    });
    if (failAfterEstado) {
      const err = new Error('Fallo simulado post-estado');
      err.code = 'TEST_FAIL_ESTADO';
      throw err;
    }

    // 5. Legacy sync
    const pilotObsReg = metaTransicion.pilot_observacion_destino_registro === true;
    const pilotObsSub = metaTransicion.pilot_observacion_subsanada_retorno === true;
    const pilotCambiaUbicacion = cambiaUbicacion || pilotObsReg || pilotObsSub;
    const estadoNegocio = pilotCambiaUbicacion
      ? (getEstadoNegocioFromEtapa(mapEtapaDestinoBD(etapaEfectiva)) || labels.estadoLabel)
      : null;
    if (pilotCambiaUbicacion || usuarioDestinoEfectivo != null || unidadDestino) {
      await syncLegacyRequerimiento(tx, {
        requerimientoId: rid,
        etapaCodigo: etapaEfectiva,
        estadoNegocio: pilotCambiaUbicacion ? estadoNegocio : null,
        responsableTipo: resp.responsableTipo,
        responsableUsuarioId: resp.responsableUsuarioId,
        responsableUnidad: resp.responsableUnidad,
        subModuloLabel: metaEtapa.submoduloLabel,
      });
    }

    // 6. Trazabilidad
    if (failTrazabilidad) {
      const err = new Error('Fallo simulado de trazabilidad');
      err.code = 'TEST_FAIL_TRAZA';
      throw err;
    }
    const eventoRow = await insertWorkflowEvento(tx, {
      expediente_id: rid,
      tipo_contratacion: tipo || 'BIEN',
      evento_codigo: eventoCodigo,
      etapa_origen: etapaOrigen,
      etapa_destino: etapaEfectiva,
      actor_id: usuarioOrigenId != null ? Number(usuarioOrigenId) : null,
      actor_rol: actorRol || 'SISTEMA',
      responsable_destino: resp.responsableUsuarioId
        ? String(resp.responsableUsuarioId)
        : (resp.responsableUnidad || resp.responsableTipo),
      metadata: {
        ...(metadata || {}),
        motivo: motivo || null,
        responsable_tipo: resp.responsableTipo,
        responsable_fuente: resp.responsableFuente,
        cambia_ubicacion: cambiaUbicacion,
        domain_results: domainResults || null,
        rc86a: true,
        dueno_persistencia: DUENO_PERSISTENCIA_ESTADO,
      },
      idempotency_key: idemKey,
    });

    const entry = buildMovimientoEntry({
      accion: eventoCodigo,
      etapa: etapaEfectiva,
      usuario: actorRol || 'Sistema',
      responsable: resp.responsableUsuarioId
        ? String(resp.responsableUsuarioId)
        : (resp.responsableUnidad || 'Pendiente de asignación'),
      observacion: motivo || `Evento ${eventoCodigo}`,
      subModuloDestino: pilotCambiaUbicacion ? metaEtapa.submoduloCodigo : '',
    });
    await appendMovimiento(tx, rid, entry);

    const { rows: freshRows } = await tx.query('SELECT * FROM requerimientos WHERE id = $1', [rid]);

    return {
      ok: true,
      idempotente: false,
      evento: eventoRow,
      expediente: freshRows[0],
      estado_vigente: estadoVigente,
      asignacion,
      responsable: {
        tipo: resp.responsableTipo,
        usuarioId: resp.responsableUsuarioId,
        unidad: resp.responsableUnidad,
        fuente: resp.responsableFuente,
      },
      domain_results: domainResults,
      dueno_persistencia: DUENO_PERSISTENCIA_ESTADO,
      fuentes_prohibidas_usadas: {
        created_by: false,
        usuario_modificacion: false,
        centro: false,
        submodulo_como_persona: resp.responsableTipo === TIPO_RESPONSABLE.PERSONA
          && !resp.responsableUsuarioId,
      },
    };
  }, client);
}

/**
 * @deprecated RC8.6A.1 — no usar desde rutas productivas.
 * Solo compatibilidad puntual; el dueño es transicionarExpediente.
 */
export async function persistirEstadoDesdeTransicionMotor(client, {
  requerimientoId,
  etapaCodigo,
  usuarioDestinoId = null,
  unidadDestino = null,
  usuarioOrigenId = null,
  motivo = null,
  metadata = null,
}) {
  const resp = resolverResponsableSincero({
    usuarioDestinoId,
    unidadDestino,
    etapaCodigo,
  });
  const labels = buildEstadoLabels(etapaCodigo);
  const origenEscritura = ORIGEN_ESCRITURA_VIGENTE.TRANSICION;
  await cerrarAsignacionActiva(client, requerimientoId, { origenEscritura });
  const asignacion = await crearAsignacion(client, {
    requerimientoId,
    etapaCodigo,
    usuarioId: resp.responsableUsuarioId,
    unidadCodigo: resp.responsableUnidad,
    tipoResponsable: resp.responsableTipo,
    origenAsignacion: 'legacy_bridge',
    asignadoPor: usuarioOrigenId != null ? String(usuarioOrigenId) : 'SISTEMA',
    motivo,
    origenEscritura,
  });
  const estado = await upsertEstadoVigente(client, {
    requerimientoId,
    ...labels,
    responsableTipo: resp.responsableTipo,
    responsableUsuarioId: resp.responsableUsuarioId,
    responsableUnidad: resp.responsableUnidad,
    responsableFuente: resp.responsableFuente || FUENTE_RESPONSABLE.UNIDAD_ETAPA,
    actualizadoPor: usuarioOrigenId != null ? String(usuarioOrigenId) : 'SISTEMA',
    metadata,
    origenEscritura,
  });
  return { estado, asignacion, responsable: resp };
}

export default { transicionarExpediente, persistirEstadoDesdeTransicionMotor, DUENO_PERSISTENCIA_ESTADO };

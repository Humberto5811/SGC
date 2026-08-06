/**
 * Matriz canónica de transiciones del Workflow SGC.
 * Compartido BE/FE. Sin dependencias de BD.
 *
 * Cada transición:
 * { tipo_contratacion, etapa_origen, evento_codigo, etapa_destino,
 *   cambia_ubicacion, permiso, responsable_destino, guard_codigo, feature_flag }
 *
 * Reglas:
 * - El destino se obtiene EXCLUSIVAMENTE de esta matriz; el cliente nunca envía etapa_destino.
 * - REQUERIMIENTO_REGISTRADO: creación, destino REGISTRO, no deriva.
 * - ORDEN_NOTIFICADA permanece en REGISTRO_ORDEN.
 * - COTIZACIONES_INVALIDAS_DEVUELTAS: VALIDACIONES → INVITACIONES (B/S).
 * - VIATICO_PASAJE_AEREO está en la matriz pero con feature_flag WORKFLOW_ENGINE_VIATICOS.
 */

import { TIPOS_CONTRATACION } from './tiposContratacion.js';
import { ETAPAS } from './etapas.js';
import { EVENTOS } from './eventos.js';

const B = TIPOS_CONTRATACION.BIEN;
const S = TIPOS_CONTRATACION.SERVICIO;
const L = TIPOS_CONTRATACION.LOCACION;
const V = TIPOS_CONTRATACION.VIATICO_PASAJE_AEREO;

const R = ETAPAS.REGISTRO;
const EV = ETAPAS.EVALUACION;
const D = ETAPAS.DEC;
const P = ETAPAS.PROGRAMACION;
const CM = ETAPAS.COORDINACION_CM;
const I = ETAPAS.INVITACIONES;
const RC = ETAPAS.RECEPCION_COTIZACIONES;
const VAL = ETAPAS.VALIDACIONES;
const CUA = ETAPAS.CUADRO_COMPARATIVO;
const CCP = ETAPAS.CCP;
const RO = ETAPAS.REGISTRO_ORDEN;
const RB = ETAPAS.RECEPCION_BIENES;
const PE = ETAPAS.PRESENTACION_ENTREGABLES;
const DP = ETAPAS.DERIVACION_PAGO;
const FIN = ETAPAS.FINALIZADO;

/*
 * Formato compacto: [tipo, origen, evento, destino, cambiaUbicacion, permiso, responsableDestino, guardCodigo, featureFlag]
 */
const DEFS = [
  // ——— Tramo común B/S/L/V ———
  [B, null, 'REQUERIMIENTO_REGISTRADO', R, false, 'requerimiento:crear', 'USUARIO_AU', 'GUARD_REQUERIMIENTO_CREAR', null],
  [S, null, 'REQUERIMIENTO_REGISTRADO', R, false, 'requerimiento:crear', 'USUARIO_AU', 'GUARD_REQUERIMIENTO_CREAR', null],
  [L, null, 'REQUERIMIENTO_REGISTRADO', R, false, 'requerimiento:crear', 'USUARIO_AU', 'GUARD_REQUERIMIENTO_CREAR', null],
  [V, null, 'REQUERIMIENTO_REGISTRADO', R, false, 'requerimiento:crear', 'USUARIO_AU', 'GUARD_REQUERIMIENTO_CREAR', 'WORKFLOW_ENGINE_VIATICOS'],
  [B, R, 'REQUERIMIENTO_ENVIADO_EVALUACION', EV, true, 'evaluacion:enviar', 'DIRECTOR_GERENTE', 'GUARD_ENVIAR_EVALUACION', null],
  [S, R, 'REQUERIMIENTO_ENVIADO_EVALUACION', EV, true, 'evaluacion:enviar', 'DIRECTOR_GERENTE', 'GUARD_ENVIAR_EVALUACION', null],
  [L, R, 'REQUERIMIENTO_ENVIADO_EVALUACION', EV, true, 'evaluacion:enviar', 'DIRECTOR_GERENTE', 'GUARD_ENVIAR_EVALUACION', null],
  [V, R, 'REQUERIMIENTO_ENVIADO_EVALUACION', EV, true, 'evaluacion:enviar', 'DIRECTOR_GERENTE', 'GUARD_ENVIAR_EVALUACION', 'WORKFLOW_ENGINE_VIATICOS'],
  [B, EV, 'EVALUACION_APROBADA', D, true, 'evaluacion:aprobar', 'DEC', 'GUARD_APROBAR_EVALUACION', null],
  [S, EV, 'EVALUACION_APROBADA', D, true, 'evaluacion:aprobar', 'DEC', 'GUARD_APROBAR_EVALUACION', null],
  [L, EV, 'EVALUACION_APROBADA', D, true, 'evaluacion:aprobar', 'DEC', 'GUARD_APROBAR_EVALUACION', null],
  [V, EV, 'EVALUACION_APROBADA', D, true, 'evaluacion:aprobar', 'DEC', 'GUARD_APROBAR_EVALUACION', 'WORKFLOW_ENGINE_VIATICOS'],
  [B, EV, 'EVALUACION_OBSERVADA', EV, false, 'evaluacion:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_EVALUACION', null],
  [S, EV, 'EVALUACION_OBSERVADA', EV, false, 'evaluacion:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_EVALUACION', null],
  [L, EV, 'EVALUACION_OBSERVADA', EV, false, 'evaluacion:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_EVALUACION', null],
  [V, EV, 'EVALUACION_OBSERVADA', EV, false, 'evaluacion:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_EVALUACION', 'WORKFLOW_ENGINE_VIATICOS'],
  [B, D, 'DEC_APROBADO', P, true, 'dec:aprobar', 'PROGRAMADOR', 'GUARD_APROBAR_DEC', null],
  [S, D, 'DEC_APROBADO', P, true, 'dec:aprobar', 'PROGRAMADOR', 'GUARD_APROBAR_DEC', null],
  [L, D, 'DEC_APROBADO', P, true, 'dec:aprobar', 'PROGRAMADOR', 'GUARD_APROBAR_DEC', null],
  [V, D, 'DEC_APROBADO', P, true, 'dec:aprobar', 'PROGRAMADOR', 'GUARD_APROBAR_DEC', 'WORKFLOW_ENGINE_VIATICOS'],
  [B, D, 'DEC_OBSERVADA', D, false, 'dec:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_DEC', null],
  [S, D, 'DEC_OBSERVADA', D, false, 'dec:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_DEC', null],
  [L, D, 'DEC_OBSERVADA', D, false, 'dec:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_DEC', null],
  [V, D, 'DEC_OBSERVADA', D, false, 'dec:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_DEC', 'WORKFLOW_ENGINE_VIATICOS'],
  [B, P, 'PROGRAMACION_APROBADA', CM, true, 'programacion:aprobar', 'COORDINADOR_CM', 'GUARD_APROBAR_PROGRAMACION', null],
  [S, P, 'PROGRAMACION_APROBADA', CM, true, 'programacion:aprobar', 'COORDINADOR_CM', 'GUARD_APROBAR_PROGRAMACION', null],
  [L, P, 'PROGRAMACION_APROBADA', CM, true, 'programacion:aprobar', 'COORDINADOR_CM', 'GUARD_APROBAR_PROGRAMACION', null],
  [V, P, 'PROGRAMACION_APROBADA', CM, true, 'programacion:aprobar', 'COORDINADOR_CM', 'GUARD_APROBAR_PROGRAMACION', 'WORKFLOW_ENGINE_VIATICOS'],
  [B, P, 'PROGRAMACION_OBSERVADA', P, false, 'programacion:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_PROGRAMACION', null],
  [S, P, 'PROGRAMACION_OBSERVADA', P, false, 'programacion:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_PROGRAMACION', null],
  [L, P, 'PROGRAMACION_OBSERVADA', P, false, 'programacion:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_PROGRAMACION', null],
  [V, P, 'PROGRAMACION_OBSERVADA', P, false, 'programacion:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_PROGRAMACION', 'WORKFLOW_ENGINE_VIATICOS'],
  [B, CM, 'COORDINACION_CM_APROBADA', I, true, 'coordinacion:aprobar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_APROBAR_COORDINACION', null],
  [S, CM, 'COORDINACION_CM_APROBADA', I, true, 'coordinacion:aprobar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_APROBAR_COORDINACION', null],
  [L, CM, 'COORDINACION_CM_APROBADA', I, true, 'coordinacion:aprobar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_APROBAR_COORDINACION', null],
  [V, CM, 'COORDINACION_CM_APROBADA', I, true, 'coordinacion:aprobar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_APROBAR_COORDINACION', 'WORKFLOW_ENGINE_VIATICOS'],
  // Observación CM: no cambia ubicación; asigna quién debe subsanar (responsable destino).
  [B, CM, 'COORDINACION_CM_OBSERVADA', CM, false, 'coordinacion:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_COORDINACION', null],
  [S, CM, 'COORDINACION_CM_OBSERVADA', CM, false, 'coordinacion:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_COORDINACION', null],
  [L, CM, 'COORDINACION_CM_OBSERVADA', CM, false, 'coordinacion:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_COORDINACION', null],
  [V, CM, 'COORDINACION_CM_OBSERVADA', CM, false, 'coordinacion:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_COORDINACION', 'WORKFLOW_ENGINE_VIATICOS'],
  [B, CM, 'COORDINACION_CM_SUBSANADA', CM, false, 'coordinacion:subsanar', 'COORDINADOR_CM', 'GUARD_SUBSANAR_COORDINACION', null],
  [S, CM, 'COORDINACION_CM_SUBSANADA', CM, false, 'coordinacion:subsanar', 'COORDINADOR_CM', 'GUARD_SUBSANAR_COORDINACION', null],
  [L, CM, 'COORDINACION_CM_SUBSANADA', CM, false, 'coordinacion:subsanar', 'COORDINADOR_CM', 'GUARD_SUBSANAR_COORDINACION', null],
  [B, CM, 'COORDINACION_CM_ASIGNADA', CM, false, 'coordinacion:asignar', 'COORDINADOR_CM', 'GUARD_ASIGNAR_COORDINACION', null],
  [S, CM, 'COORDINACION_CM_ASIGNADA', CM, false, 'coordinacion:asignar', 'COORDINADOR_CM', 'GUARD_ASIGNAR_COORDINACION', null],
  [L, CM, 'COORDINACION_CM_ASIGNADA', CM, false, 'coordinacion:asignar', 'COORDINADOR_CM', 'GUARD_ASIGNAR_COORDINACION', null],

  // ——— Invitaciones / Recepción ———
  [B, I, 'SOLICITUD_COTIZACION_CREADA', I, false, 'invitaciones:crear_solicitud', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CREAR_SOLICITUD', null],
  [S, I, 'SOLICITUD_COTIZACION_CREADA', I, false, 'invitaciones:crear_solicitud', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CREAR_SOLICITUD', null],
  [L, I, 'SOLICITUD_COTIZACION_CREADA', I, false, 'invitaciones:crear_solicitud', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CREAR_SOLICITUD', null],
  [B, I, 'INVITACION_ENVIADA', I, false, 'invitaciones:enviar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ENVIAR_INVITACION', null],
  [S, I, 'INVITACION_ENVIADA', I, false, 'invitaciones:enviar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ENVIAR_INVITACION', null],
  [L, I, 'INVITACION_ENVIADA', I, false, 'invitaciones:enviar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ENVIAR_INVITACION', null],
  [B, I, 'REINVITACION_ENVIADA', I, false, 'invitaciones:reenviar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_REINVITAR', null],
  [S, I, 'REINVITACION_ENVIADA', I, false, 'invitaciones:reenviar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_REINVITAR', null],
  [L, I, 'REINVITACION_ENVIADA', I, false, 'invitaciones:reenviar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_REINVITAR', null],
  [B, I, 'INVITACIONES_OBSERVADA', I, false, 'invitaciones:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_INVITACIONES', null],
  [S, I, 'INVITACIONES_OBSERVADA', I, false, 'invitaciones:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_INVITACIONES', null],
  [L, I, 'INVITACIONES_OBSERVADA', I, false, 'invitaciones:observar', 'USUARIO_AU', 'GUARD_OBSERVAR_INVITACIONES', null],
  // Subsanación genérica (misma etapa; restaura responsable destino).
  [B, R, 'OBSERVACION_SUBSANADA', R, false, 'observacion:subsanar', 'DIRECTOR_GERENTE', 'GUARD_SUBSANAR_OBS', null],
  [S, R, 'OBSERVACION_SUBSANADA', R, false, 'observacion:subsanar', 'DIRECTOR_GERENTE', 'GUARD_SUBSANAR_OBS', null],
  [L, R, 'OBSERVACION_SUBSANADA', R, false, 'observacion:subsanar', 'DIRECTOR_GERENTE', 'GUARD_SUBSANAR_OBS', null],
  [B, EV, 'OBSERVACION_SUBSANADA', EV, false, 'observacion:subsanar', 'DIRECTOR_GERENTE', 'GUARD_SUBSANAR_OBS', null],
  [S, EV, 'OBSERVACION_SUBSANADA', EV, false, 'observacion:subsanar', 'DIRECTOR_GERENTE', 'GUARD_SUBSANAR_OBS', null],
  [L, EV, 'OBSERVACION_SUBSANADA', EV, false, 'observacion:subsanar', 'DIRECTOR_GERENTE', 'GUARD_SUBSANAR_OBS', null],
  [B, D, 'OBSERVACION_SUBSANADA', D, false, 'observacion:subsanar', 'DEC', 'GUARD_SUBSANAR_OBS', null],
  [S, D, 'OBSERVACION_SUBSANADA', D, false, 'observacion:subsanar', 'DEC', 'GUARD_SUBSANAR_OBS', null],
  [L, D, 'OBSERVACION_SUBSANADA', D, false, 'observacion:subsanar', 'DEC', 'GUARD_SUBSANAR_OBS', null],
  [B, P, 'OBSERVACION_SUBSANADA', P, false, 'observacion:subsanar', 'PROGRAMADOR', 'GUARD_SUBSANAR_OBS', null],
  [S, P, 'OBSERVACION_SUBSANADA', P, false, 'observacion:subsanar', 'PROGRAMADOR', 'GUARD_SUBSANAR_OBS', null],
  [L, P, 'OBSERVACION_SUBSANADA', P, false, 'observacion:subsanar', 'PROGRAMADOR', 'GUARD_SUBSANAR_OBS', null],
  [B, CM, 'OBSERVACION_SUBSANADA', CM, false, 'observacion:subsanar', 'COORDINADOR_CM', 'GUARD_SUBSANAR_OBS', null],
  [S, CM, 'OBSERVACION_SUBSANADA', CM, false, 'observacion:subsanar', 'COORDINADOR_CM', 'GUARD_SUBSANAR_OBS', null],
  [L, CM, 'OBSERVACION_SUBSANADA', CM, false, 'observacion:subsanar', 'COORDINADOR_CM', 'GUARD_SUBSANAR_OBS', null],
  [B, I, 'OBSERVACION_SUBSANADA', I, false, 'observacion:subsanar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_SUBSANAR_OBS', null],
  [S, I, 'OBSERVACION_SUBSANADA', I, false, 'observacion:subsanar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_SUBSANAR_OBS', null],
  [L, I, 'OBSERVACION_SUBSANADA', I, false, 'observacion:subsanar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_SUBSANAR_OBS', null],
  // Viático: sustento aprobado → CCP directo (NO habilitado productivamente).
  [V, I, 'VIATICO_APROBADO_INVITACIONES', CCP, true, 'viatico:aprobar', 'COMITE_CCP', 'GUARD_VIATICO_APROBADO', 'WORKFLOW_ENGINE_VIATICOS'],
  // COTIZACION_PRESENTADA: primera cotización mueve INVITACIONES→RECEPCION_COTIZACIONES (espejo abajo).
  [B, I, 'COTIZACION_PRESENTADA', RC, true, 'portal:presentar_cotizacion', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_COTIZACION_PRIMERA', null],
  [S, I, 'COTIZACION_PRESENTADA', RC, true, 'portal:presentar_cotizacion', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_COTIZACION_PRIMERA', null],
  [L, I, 'COTIZACION_PRESENTADA', RC, true, 'portal:presentar_cotizacion', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_COTIZACION_PRIMERA', null],
  [B, RC, 'COTIZACION_PRESENTADA', RC, false, 'portal:presentar_cotizacion', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_COTIZACION_POSTERIOR', null],
  [S, RC, 'COTIZACION_PRESENTADA', RC, false, 'portal:presentar_cotizacion', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_COTIZACION_POSTERIOR', null],
  [L, RC, 'COTIZACION_PRESENTADA', RC, false, 'portal:presentar_cotizacion', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_COTIZACION_POSTERIOR', null],
  // B/S: recepción → validaciones. LOCACION: recepción → CCP (interno).
  [B, RC, 'COTIZACIONES_DERIVADAS_VALIDACION', VAL, true, 'recepcion:cerrar', 'AREA_USUARIA', 'GUARD_DERIVAR_VALIDACION', null],
  [S, RC, 'COTIZACIONES_DERIVADAS_VALIDACION', VAL, true, 'recepcion:cerrar', 'AREA_USUARIA', 'GUARD_DERIVAR_VALIDACION', null],
  [L, RC, 'LOCACION_APROBADA_RECEPCION', CCP, true, 'recepcion:cerrar', 'COMITE_CCP', 'GUARD_LOCACION_APROBADA', null],
  // Devolución: todas las cotizaciones NO_APTO → Invitaciones (B/S).
  [B, VAL, 'COTIZACIONES_INVALIDAS_DEVUELTAS', I, true, 'validacion:devolver_todas', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_TODAS_INVALIDAS', null],
  [S, VAL, 'COTIZACIONES_INVALIDAS_DEVUELTAS', I, true, 'validacion:devolver_todas', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_TODAS_INVALIDAS', null],

  // ——— Validaciones / Cuadro / CCP ———
  [B, VAL, 'VALIDACION_COMPLETADA', CUA, true, 'validacion:aprobar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_VALIDACION_COMPLETADA', null],
  [S, VAL, 'VALIDACION_COMPLETADA', CUA, true, 'validacion:aprobar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_VALIDACION_COMPLETADA', null],
  [B, VAL, 'VALIDACION_DEVUELTA', VAL, false, 'validacion:devolver', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_VALIDACION_DEVUELTA', null],
  [S, VAL, 'VALIDACION_DEVUELTA', VAL, false, 'validacion:devolver', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_VALIDACION_DEVUELTA', null],
  [B, CUA, 'CUADRO_GENERADO', CUA, false, 'cuadro:generar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CUADRO_GENERADO', null],
  [S, CUA, 'CUADRO_GENERADO', CUA, false, 'cuadro:generar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CUADRO_GENERADO', null],
  [B, CUA, 'CUADRO_DERIVADO_COORDINACION', CUA, false, 'cuadro:derivar', 'COORDINADOR_CM', 'GUARD_CUADRO_DERIVAR_CM', null],
  [S, CUA, 'CUADRO_DERIVADO_COORDINACION', CUA, false, 'cuadro:derivar', 'COORDINADOR_CM', 'GUARD_CUADRO_DERIVAR_CM', null],
  [B, CUA, 'CUADRO_APROBADO_COORDINACION', CUA, false, 'cuadro:aprobar_cm', 'DEC', 'GUARD_CUADRO_APROBAR_CM', null],
  [S, CUA, 'CUADRO_APROBADO_COORDINACION', CUA, false, 'cuadro:aprobar_cm', 'DEC', 'GUARD_CUADRO_APROBAR_CM', null],
  [B, CUA, 'CUADRO_OBSERVADO_COORDINACION', CUA, false, 'cuadro:observar_cm', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CUADRO_OBSERVAR_CM', null],
  [S, CUA, 'CUADRO_OBSERVADO_COORDINACION', CUA, false, 'cuadro:observar_cm', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CUADRO_OBSERVAR_CM', null],
  [B, CUA, 'CUADRO_DERIVADO_DEC', CUA, false, 'cuadro:derivar_dec', 'DEC', 'GUARD_CUADRO_DERIVAR_DEC', null],
  [S, CUA, 'CUADRO_DERIVADO_DEC', CUA, false, 'cuadro:derivar_dec', 'DEC', 'GUARD_CUADRO_DERIVAR_DEC', null],
  [B, CUA, 'CUADRO_APROBADO_DEC', CCP, true, 'cuadro:aprobar_dec', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CUADRO_APROBAR_DEC', null],
  [S, CUA, 'CUADRO_APROBADO_DEC', CCP, true, 'cuadro:aprobar_dec', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CUADRO_APROBAR_DEC', null],
  [B, CUA, 'CUADRO_OBSERVADO_DEC', CUA, false, 'cuadro:observar_dec', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CUADRO_OBSERVAR_DEC', null],
  [S, CUA, 'CUADRO_OBSERVADO_DEC', CUA, false, 'cuadro:observar_dec', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CUADRO_OBSERVAR_DEC', null],
  [B, CCP, 'CCP_REGISTRADA', RO, true, 'ccp:cargar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CCP_REGISTRADA', null],
  [S, CCP, 'CCP_REGISTRADA', RO, true, 'ccp:cargar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CCP_REGISTRADA', null],
  [L, CCP, 'CCP_REGISTRADA', RO, true, 'ccp:cargar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CCP_REGISTRADA', null],
  [V, CCP, 'CCP_REGISTRADA', RO, true, 'ccp:cargar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_CCP_REGISTRADA', 'WORKFLOW_ENGINE_VIATICOS'],

  // ——— Órdenes ———
  [B, RO, 'ORDEN_REGISTRADA', RO, false, 'orden:registrar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_REGISTRADA', null],
  [S, RO, 'ORDEN_REGISTRADA', RO, false, 'orden:registrar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_REGISTRADA', null],
  [L, RO, 'ORDEN_REGISTRADA', RO, false, 'orden:registrar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_REGISTRADA', null],
  [V, RO, 'ORDEN_REGISTRADA', RO, false, 'orden:registrar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_REGISTRADA', 'WORKFLOW_ENGINE_VIATICOS'],
  [B, RO, 'ORDEN_NOTIFICADA', RO, false, 'orden:notificar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_NOTIFICADA', null],
  [S, RO, 'ORDEN_NOTIFICADA', RO, false, 'orden:notificar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_NOTIFICADA', null],
  [L, RO, 'ORDEN_NOTIFICADA', RO, false, 'orden:notificar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_NOTIFICADA', null],
  [V, RO, 'ORDEN_NOTIFICADA', RO, false, 'orden:notificar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_NOTIFICADA', 'WORKFLOW_ENGINE_VIATICOS'],
  [B, RO, 'ORDEN_CONFIRMADA_PROVEEDOR', RO, false, 'portal:confirmar_orden', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_CONFIRMADA', null],
  [S, RO, 'ORDEN_CONFIRMADA_PROVEEDOR', RO, false, 'portal:confirmar_orden', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_CONFIRMADA', null],
  [L, RO, 'ORDEN_CONFIRMADA_PROVEEDOR', RO, false, 'portal:confirmar_orden', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_CONFIRMADA', null],
  [V, RO, 'ORDEN_CONFIRMADA_PROVEEDOR', RO, false, 'portal:confirmar_orden', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_CONFIRMADA', 'WORKFLOW_ENGINE_VIATICOS'],
  // Derivación a ejecución por tipo.
  [B, RO, 'ORDEN_DERIVADA_EJECUCION', RB, true, 'orden:derivar_ejecucion', 'ALMACEN', 'GUARD_ORDEN_DERIVAR_EJECUCION', null],
  [S, RO, 'ORDEN_DERIVADA_EJECUCION', PE, true, 'orden:derivar_ejecucion', 'AREA_USUARIA', 'GUARD_ORDEN_DERIVAR_EJECUCION', null],
  [L, RO, 'ORDEN_DERIVADA_EJECUCION', PE, true, 'orden:derivar_ejecucion', 'AREA_USUARIA', 'GUARD_ORDEN_DERIVAR_EJECUCION', null],
  // Devolución/anulación/resolución de orden (interno).
  [B, RO, 'ORDEN_OBSERVADA', RO, false, 'orden:observar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_OBSERVADA', null],
  [S, RO, 'ORDEN_OBSERVADA', RO, false, 'orden:observar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_OBSERVADA', null],
  [L, RO, 'ORDEN_OBSERVADA', RO, false, 'orden:observar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_OBSERVADA', null],
  [B, RO, 'ORDEN_ANULADA', RO, false, 'orden:anular', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_ANULADA', null],
  [S, RO, 'ORDEN_ANULADA', RO, false, 'orden:anular', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_ANULADA', null],
  [L, RO, 'ORDEN_ANULADA', RO, false, 'orden:anular', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_ANULADA', null],
  [B, RO, 'ORDEN_RESUELTA', RO, false, 'orden:resolver', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_RESUELTA', null],
  [S, RO, 'ORDEN_RESUELTA', RO, false, 'orden:resolver', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_RESUELTA', null],
  [L, RO, 'ORDEN_RESUELTA', RO, false, 'orden:resolver', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_ORDEN_RESUELTA', null],

  // ——— Ejecución (internos, no cambian ubicación) ———
  [B, RB, 'ENTREGA_RECIBIDA', RB, false, 'recepcion_bienes:recibir', 'ALMACEN', 'GUARD_ENTREGA_RECIBIDA', null],
  [S, PE, 'ENTREGABLE_RECIBIDO', PE, false, 'entregables:recibir', 'AREA_USUARIA', 'GUARD_ENTREGABLE_RECIBIDO', null],
  [L, PE, 'ENTREGABLE_RECIBIDO', PE, false, 'entregables:recibir', 'AREA_USUARIA', 'GUARD_ENTREGABLE_RECIBIDO', null],
  [B, RB, 'CONFORMIDAD_REGISTRADA', RB, false, 'conformidad:registrar', 'AREA_USUARIA', 'GUARD_CONFORMIDAD_REGISTRADA', null],
  [S, PE, 'CONFORMIDAD_REGISTRADA', PE, false, 'conformidad:registrar', 'AREA_USUARIA', 'GUARD_CONFORMIDAD_REGISTRADA', null],
  [L, PE, 'CONFORMIDAD_REGISTRADA', PE, false, 'conformidad:registrar', 'AREA_USUARIA', 'GUARD_CONFORMIDAD_REGISTRADA', null],
  [S, PE, 'AMPLIACION_REGISTRADA', PE, false, 'orden:ampliar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_AMPLIACION_REGISTRADA', null],
  [L, PE, 'AMPLIACION_REGISTRADA', PE, false, 'orden:ampliar', 'ESPECIALISTA_CONTRATACIONES', 'GUARD_AMPLIACION_REGISTRADA', null],

  // ——— Pago / Finalización ———
  [B, RB, 'EXPEDIENTE_DERIVADO_PAGO', DP, true, 'pago:derivar', 'ANALISTA_PAGOS', 'GUARD_DERIVAR_PAGO', null],
  [S, PE, 'EXPEDIENTE_DERIVADO_PAGO', DP, true, 'pago:derivar', 'ANALISTA_PAGOS', 'GUARD_DERIVAR_PAGO', null],
  [L, PE, 'EXPEDIENTE_DERIVADO_PAGO', DP, true, 'pago:derivar', 'ANALISTA_PAGOS', 'GUARD_DERIVAR_PAGO', null],
  [B, DP, 'EXPEDIENTE_FINALIZADO', FIN, true, 'pago:confirmar', 'SISTEMA', 'GUARD_FINALIZAR', null],
  [S, DP, 'EXPEDIENTE_FINALIZADO', FIN, true, 'pago:confirmar', 'SISTEMA', 'GUARD_FINALIZAR', null],
  [L, DP, 'EXPEDIENTE_FINALIZADO', FIN, true, 'pago:confirmar', 'SISTEMA', 'GUARD_FINALIZAR', null],
];

/**
 * Construye transición inmutable desde definición compacta.
 */
function build(def) {
  return Object.freeze({
    tipo_contratacion: def[0],
    etapa_origen: def[1], // null = creación
    evento_codigo: def[2],
    etapa_destino: def[3],
    cambia_ubicacion: def[4],
    permiso: def[5],
    responsable_destino: def[6],
    guard_codigo: def[7],
    feature_flag: def[8] || null,
  });
}

export const TRANSICIONES = Object.freeze(DEFS.map(build));

/** Clave interna: tipo|origen|evento. */
function keyOf(tipo, origen, evento) {
  return `${tipo}|${origen === null || origen === undefined ? '' : origen}|${evento}`;
}

const BY_KEY = Object.freeze(
  TRANSICIONES.reduce((m, t) => {
    m[keyOf(t.tipo_contratacion, t.etapa_origen, t.evento_codigo)] = t;
    return m;
  }, Object.create(null)),
);

const BY_TIPO_ORIGEN = Object.freeze(
  TRANSICIONES.reduce((m, t) => {
    const k = `${t.tipo_contratacion}|${t.etapa_origen || ''}`;
    if (!m[k]) m[k] = [];
    m[k].push(t);
    return m;
  }, Object.create(null)),
);

/**
 * Devuelve la transición canónica o null.
 * El destino se obtiene exclusivamente de la matriz; el cliente nunca lo envía.
 */
export function getTransition({ tipoContratacion, etapaOrigen, eventoCodigo }) {
  const t = String(tipoContratacion || '').toUpperCase();
  const e = String(etapaOrigen || '').toUpperCase();
  const ev = String(eventoCodigo || '').toUpperCase();
  if (!t || !ev) return null;
  return BY_KEY[keyOf(t, e, ev)] || null;
}

/** Lista de transiciones válidas para un tipo desde una etapa. */
export function getAllowedTransitions({ tipoContratacion, etapaOrigen }) {
  const t = String(tipoContratacion || '').toUpperCase();
  const e = String(etapaOrigen || '').toUpperCase();
  const list = BY_TIPO_ORIGEN[`${t}|${e}`] || [];
  return list.slice();
}

/** True si la transición existe en la matriz (independiente de flags). */
export function isTransitionAllowed({ tipoContratacion, etapaOrigen, eventoCodigo }) {
  return getTransition({ tipoContratacion, etapaOrigen, eventoCodigo }) !== null;
}

/** True si la transición existe Y el feature flag está habilitado (o no exige flag). */
export function isTransitionEnabled({ tipoContratacion, etapaOrigen, eventoCodigo }, flags = {}) {
  const tr = getTransition({ tipoContratacion, etapaOrigen, eventoCodigo });
  if (!tr) return false;
  if (!tr.feature_flag) return true;
  return flags[tr.feature_flag] === true;
}

export default {
  TRANSICIONES,
  getTransition,
  getAllowedTransitions,
  isTransitionAllowed,
  isTransitionEnabled,
};
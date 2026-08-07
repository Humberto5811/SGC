/**
 * RC8.6A.2 / RC8.7.1 — Inventario de escrituras a estado/responsable.
 *
 * Clasificación:
 * A. Migrada a transicionarExpediente
 * B. Solo compatibilidad legacy dentro del servicio (dueño / sync oficial)
 * C. Histórica — bloqueada respecto a vigente confirmado (RC8.7.1)
 * D. Bootstrap controlado
 * E. Reconciliación autorizada (vía reconciliarEstadoResponsablePorEvidencia / F.3 / RC8.6C)
 *
 * Escritores autorizados de expediente_estado_vigente / expediente_asignaciones:
 *   1. transicionarExpediente()
 *   2. reconciliarEstadoResponsablePorEvidencia() (+ F.3 / RC8.6C con origenEscritura=RECONCILIACION)
 *
 * Backfill: solo si no existe fila vigente (044 WHERE NOT EXISTS / origen BACKFILL_VACIO).
 */
export const ESCRITURAS_DIRECTAS_RC86A = Object.freeze([
  {
    archivo: 'server/lib/expedienteTransicion.js#transicionarExpediente',
    funcion: 'transicionarExpediente',
    escritura: 'expediente_estado_vigente + asignaciones + syncLegacyRequerimiento',
    clasificacion: 'B',
    clase: 'B',
    nota: 'RC8.7.1 escritor autorizado #1 (origenEscritura=TRANSICION).',
  },
  {
    archivo: 'server/lib/reconciliarEstadoResponsablePorEvidencia.js',
    funcion: 'reconciliarEstadoResponsablePorEvidencia',
    escritura: 'delega a F.3 apply con origenEscritura=RECONCILIACION',
    clasificacion: 'E',
    clase: 'E',
    nota: 'RC8.7.1 escritor autorizado #2. Dry-run por defecto; apply con confirmación admin.',
  },
  {
    archivo: 'server/lib/reconciliarEtapaResponsableEjecucion.js#aplicar…',
    funcion: 'aplicarReconciliarEtapaResponsableEjecucion',
    escritura: 'vigente + asignaciones (origen RECONCILIACION)',
    clasificacion: 'E',
    clase: 'E',
    nota: 'Motor apply de la fachada RC8.7 / F.3.',
  },
  {
    archivo: 'server/lib/reconciliarAsignacionesExistentes.js',
    funcion: 'reconciliarAsignacionesExistentes',
    escritura: 'asignaciones + responsable vigente (no etapa/estado)',
    clasificacion: 'E',
    clase: 'E',
    nota: 'RC8.6C: solo con origenEscritura=RECONCILIACION; dry-run default.',
  },
  {
    archivo: 'server/lib/expedienteEstadoPersistido.js#syncLegacyRequerimiento',
    funcion: 'syncLegacyRequerimiento',
    escritura: 'UPDATE requerimientos SET estado_actual/sub_modulo/responsable',
    clasificacion: 'B',
    clase: 'B',
    nota: 'Solo invocado desde transición/reconciliación (compat columnas legacy).',
  },
  {
    archivo: 'server/lib/workflow/workflowEngine.js#executeTransition',
    funcion: 'executeTransition',
    escritura: 'delega a transicionarExpediente',
    clasificacion: 'B',
    clase: 'B',
    nota: 'Valida permiso/catálogo; no persiste fuente única por su cuenta.',
  },
  {
    archivo: 'server/lib/trazabilidad.js#registrarMovimiento',
    funcion: 'registrarMovimiento',
    escritura: 'historial_estados / historial_movimientos únicamente',
    clasificacion: 'B',
    clase: 'B',
    nota: 'RC8.6A.2: nunca escribe estado_actual ni responsable. Rechaza en development si recibe cambio de estado.',
  },
  {
    archivo: 'server/lib/trazabilidad.js#registrarSubsanacionDerivacion',
    funcion: 'registrarSubsanacionDerivacion',
    escritura: 'transicionarExpediente (OBSERVACION_SUBSANADA / COORDINACION_CM_SUBSANADA)',
    clasificacion: 'A',
    clase: 'A',
    nota: 'Migrada: restaura responsable vía dueño oficial.',
  },
  {
    archivo: 'server/lib/trazabilidad.js#inicializarTrazabilidad',
    funcion: 'inicializarTrazabilidad',
    escritura: 'historial + legacy bootstrap; NUNCA expediente_estado_vigente',
    clasificacion: 'C',
    clase: 'C',
    nota: 'RC8.7.1: si vigente confirmado, no pisa estado_actual/responsable desde REGISTRO.',
  },
  {
    archivo: 'server/lib/trazabilidad.js#rebuildAllHistorial',
    funcion: 'rebuildAllHistorial / backfillTrazabilidad',
    escritura: 'historial JSON; legacy alineado desde vigente si confirmado',
    clasificacion: 'C',
    clase: 'C',
    nota: 'RC8.7.1 bloqueado: no UPDATE expediente_estado_vigente ni asignaciones.',
  },
  {
    archivo: 'server/migrate.js#postMigrationMaintenance',
    funcion: 'postMigrationMaintenance',
    escritura: 'llama rebuildAllHistorial (seguro RC8.7.1)',
    clasificacion: 'C',
    clase: 'C',
    nota: 'No escribe vigente; migrate×N es idempotente respecto a fuente única.',
  },
  {
    archivo: 'server/lib/validacionesCotizacion.js',
    funcion: 'enviarValidacionUsuario / sync',
    escritura: 'transicionarExpediente vía cotizacionWorkflowSync',
    clasificacion: 'A',
    clase: 'A',
    nota: 'Migrada a transicionarExpediente.',
  },
  {
    archivo: 'server/lib/cuadroComparativoRevision.js',
    funcion: 'syncRevisionCuadro / derivar',
    escritura: 'transicionarExpediente CUADRO_*',
    clasificacion: 'A',
    clase: 'A',
    nota: 'Migrada a transicionarExpediente.',
  },
  {
    archivo: 'server/lib/actosPreparatorios.js#aprobarActosInvitaciones|derivarActos|observarActos|asignarAnalistaActos',
    funcion: 'aprobar/derivar/observar/asignar',
    escritura: 'COORDINACION_CM_* vía transicionarExpediente',
    clasificacion: 'A',
    clase: 'A',
    nota: 'Migrada. observarActos usa COORDINACION_CM_OBSERVADA (no soloHistorial).',
  },
  {
    archivo: 'server/lib/actosPreparatorios.js#bootstrapExpedientesActosPendientes',
    funcion: 'bootstrapExpedientesActosPendientes',
    escritura: 'PROGRAMACION_APROBADA con origen=BOOTSTRAP vía transicionarExpediente',
    clasificacion: 'D',
    clase: 'D',
    nota: 'Bootstrap administrativo idempotente; requiere force:true. syncExpedientesActosPendientes es no-op.',
  },
  {
    archivo: 'server/lib/ordenesContratacion.js#derivarAEjecucion',
    funcion: 'derivarAEjecucion',
    escritura: 'ORDEN_DERIVADA_EJECUCION vía transicionarExpediente',
    clasificacion: 'A',
    clase: 'A',
    nota: 'Migrada a transicionarExpediente.',
  },
  {
    archivo: 'server/routes/contrataciones.js#dec|programacion',
    funcion: 'aprobar/observar DEC y Programación',
    escritura: 'DEC_APROBADO / DEC_OBSERVADA / PROGRAMACION_* vía transicionarExpediente',
    clasificacion: 'A',
    clase: 'A',
    nota: 'Migrada a transicionarExpediente (legacyHandler y observar).',
  },
  {
    archivo: 'server/routes/programacion.js#paquetes/aprobar',
    funcion: 'aprobar paquete',
    escritura: 'PROGRAMACION_APROBADA vía transicionarExpediente',
    clasificacion: 'A',
    clase: 'A',
    nota: 'Migrada a transicionarExpediente.',
  },
  {
    archivo: 'server/lib/invitaciones.js',
    funcion: 'ensureInvitacionesEtapa / enviarInvitaciones / observarInvitaciones',
    escritura: 'COORDINACION_CM_APROBADA / INVITACION_ENVIADA / INVITACIONES_OBSERVADA vía transicionarExpediente',
    clasificacion: 'A',
    clase: 'A',
    nota: 'Migrada a transicionarExpediente.',
  },
  {
    archivo: 'server/routes/requerimientosEspecial.js',
    funcion: 'derivar / observar / aprobar-evaluacion',
    escritura: 'eventos canónicos vía transicionarExpediente',
    clasificacion: 'A',
    clase: 'A',
    nota: 'Legacy handlers migrados a transicionarExpediente.',
  },
  {
    archivo: 'server/lib/portalProveedores.js',
    funcion: 'enrich bandeja',
    escritura: 'ajuste en memoria estado_actual (no UPDATE)',
    clasificacion: 'B',
    clase: 'B',
    nota: 'Solo presentación en memoria; no persiste.',
  },
  {
    archivo: 'server/lib/derivarRecepcionCcp.js',
    funcion: 'derivarRecepcionACcp',
    escritura: 'transicionarExpediente + domainMutator',
    clasificacion: 'A',
    clase: 'A',
    nota: 'Migrada a transicionarExpediente en RC8.6A.1.',
  },
  {
    archivo: 'server/lib/cotizacionWorkflowSync.js',
    funcion: 'syncRequerimientosSolicitudWorkflow',
    escritura: 'transicionarExpediente',
    clasificacion: 'A',
    clase: 'A',
    nota: 'Migrada a transicionarExpediente.',
  },
  {
    archivo: 'server/routes/workflowMantenimiento.js',
    funcion: 'diagnóstico / dry-run / reconciliar',
    escritura: 'solo vía reconciliarEstadoResponsablePorEvidencia; no edición directa',
    clasificacion: 'E',
    clase: 'E',
    nota: 'Mantenimiento → Workflow SGC: no modifica estado directamente.',
  },
  {
    archivo: 'server/migrations/037_* / 040_*',
    funcion: 'migraciones legacy estado_actual',
    escritura: 'requerimientos.estado_actual (one-shot; no vigente)',
    clasificacion: 'C',
    clase: 'C',
    nota: 'Históricas. No tocan expediente_estado_vigente. Ya aplicadas = no-op en migrate.',
  },
  {
    archivo: 'server/migrations/044_expediente_estado_responsable_vigente.js',
    funcion: 'backfill vigente',
    escritura: 'INSERT … WHERE NOT EXISTS',
    clasificacion: 'C',
    clase: 'C',
    nota: 'RC8.7.1: nunca pisa vigente existente.',
  },
  {
    archivo: 'server/migrations/045_workflow_sgc_catalogos.js',
    funcion: 'catálogos workflow',
    escritura: 'solo tablas workflow_* / log',
    clasificacion: 'C',
    clase: 'C',
    nota: 'RC8.7.1: no altera expedientes ni vigente.',
  },
]);

/** Alias legacy para tests RC8.6A.1 */
export const clase = (e) => e.clasificacion || e.clase;

export default ESCRITURAS_DIRECTAS_RC86A;

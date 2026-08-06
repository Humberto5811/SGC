/**
 * RC8.6A.2 — Inventario de escrituras a estado/responsable.
 *
 * Clasificación:
 * A. Migrada a transicionarExpediente
 * B. Solo compatibilidad legacy dentro del servicio (dueño / sync oficial)
 * C. Histórica
 * D. Bootstrap controlado
 *
 * No debe quedar escritura productiva sin clasificar.
 */
export const ESCRITURAS_DIRECTAS_RC86A = Object.freeze([
  {
    archivo: 'server/lib/expedienteTransicion.js#transicionarExpediente',
    funcion: 'transicionarExpediente',
    escritura: 'expediente_estado_vigente + asignaciones + syncLegacyRequerimiento',
    clasificacion: 'B',
    clase: 'B',
    nota: 'Dueño único de persistencia RC8.6A.2.',
  },
  {
    archivo: 'server/lib/expedienteEstadoPersistido.js#syncLegacyRequerimiento',
    funcion: 'syncLegacyRequerimiento',
    escritura: 'UPDATE requerimientos SET estado_actual/sub_modulo/responsable',
    clasificacion: 'B',
    clase: 'B',
    nota: 'Solo invocado desde transicionarExpediente (compat columnas legacy).',
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
    escritura: 'estado_actual inicial si vacío',
    clasificacion: 'C',
    clase: 'C',
    nota: 'Histórica / bootstrap de creación; no es transición de flujo.',
  },
  {
    archivo: 'server/lib/trazabilidad.js#rebuildAllHistorial',
    funcion: 'rebuildAllHistorial / backfillTrazabilidad',
    escritura: 'reconstrucción masiva historial+estado',
    clasificacion: 'C',
    clase: 'C',
    nota: 'Herramienta administrativa one-shot.',
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
    archivo: 'server/migrations/037_* / 040_* / 013_* / 044_*',
    funcion: 'migraciones',
    escritura: 'estado_actual / backfill',
    clasificacion: 'C',
    clase: 'C',
    nota: 'Histórico / one-shot. 044 no aplica en VPS aún.',
  },
]);

/** Alias legacy para tests RC8.6A.1 */
export const clase = (e) => e.clasificacion || e.clase;

export default ESCRITURAS_DIRECTAS_RC86A;

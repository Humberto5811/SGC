/**
 * RC8.6A / RC8.6A.1 — Inventario de escrituras a estado/responsable.
 * A = debe migrar / migrado parcialmente
 * B = sync legacy o dueño canónico
 * C = histórica
 */
export const ESCRITURAS_DIRECTAS_RC86A = Object.freeze([
  {
    archivo: 'server/lib/expedienteTransicion.js#transicionarExpediente',
    campos: ['expediente_estado_vigente', 'expediente_asignaciones', 'estado_actual'],
    clase: 'B',
    nota: 'Dueño único de persistencia RC8.6A.1.',
  },
  {
    archivo: 'server/lib/workflow/workflowEngine.js#executeTransition',
    campos: ['delega a transicionarExpediente'],
    clase: 'B',
    nota: 'Valida permiso/catálogo; persiste solo vía transicionarExpediente (misma tx).',
  },
  {
    archivo: 'server/lib/trazabilidad.js#registrarMovimiento',
    campos: ['historial_*', 'estado_actual (legacy residual)'],
    clase: 'B',
    nota: 'Acepta { client, soloHistorial }. Sin sync best-effort a fuente única.',
  },
  {
    archivo: 'server/lib/derivarRecepcionCcp.js',
    campos: ['solicitudes_cotizacion', 'cotizaciones', 'transicionarExpediente'],
    clase: 'B',
    nota: 'Migrado: una sola tx (domainMutator + estado/asignación/traza).',
  },
  {
    archivo: 'server/lib/cotizacionWorkflowSync.js',
    campos: ['transicionarExpediente'],
    clase: 'B',
    nota: 'Migrado: sync usa transicionarExpediente + evento canónico.',
  },
  {
    archivo: 'server/lib/validacionesCotizacion.js',
    campos: ['sync + evento COTIZACIONES_* / VALIDACION_*'],
    clase: 'B',
    nota: 'Migrado: derive/devolver/cerrar pasan evento a sync.',
  },
  {
    archivo: 'server/lib/cuadroComparativoRevision.js / cuadroComparativo.js',
    campos: ['transicionarExpediente CUADRO_* / CUADRO_APROBADO_DEC'],
    clase: 'B',
    nota: 'Migrado: sync revisión y derivar CCP sin doble UPDATE.',
  },
  {
    archivo: 'server/lib/actosPreparatorios.js#aprobarActosInvitaciones|derivarActos',
    campos: ['COORDINACION_CM_APROBADA'],
    clase: 'B',
    nota: 'Migrado aprobar/derivar→Invitaciones. observarActos = soloHistorial.',
  },
  {
    archivo: 'server/lib/ordenesContratacion.js#derivarAEjecucion',
    campos: ['ORDEN_DERIVADA_EJECUCION'],
    clase: 'B',
    nota: 'Migrado: orden + expediente en misma tx.',
  },
  {
    archivo: 'server/lib/actosPreparatorios.js#syncExpedientesActosPendientes',
    campos: ['estado_actual=ACTOS_PREPARATORIOS'],
    clase: 'A',
    nota: 'Pendiente: bootstrap masivo aún escribe directo (compat bandeja).',
  },
  {
    archivo: 'server/routes/* (DEC/programación/invitaciones residuales)',
    campos: ['registrarMovimiento legacy'],
    clase: 'A',
    nota: 'Pendiente consolidar rutas no críticas del alcance RC8.6A.1.',
  },
  {
    archivo: 'server/migrations/037_* / 040_* / 013_* / 044_*',
    campos: ['estado_actual / backfill'],
    clase: 'C',
    nota: 'Histórico / one-shot. 044 no aplica en VPS aún.',
  },
]);

export default ESCRITURAS_DIRECTAS_RC86A;

/**
 * 038 — Sincerar expediente con cotizaciones ya presentadas.
 *
 * Condición exacta:
 *   existe cotización COTIZACION_PRESENTADA con fecha_presentacion NOT NULL
 *   ligada al requerimiento (solicitud_requerimientos o cot.requerimiento_id)
 *   AND estado_actual ∈ { NULL, '', REGISTRADO, INVITACIONES }
 *
 * Actualiza solo estado_actual + sub_modulo_actual (si vacío/desfasado).
 * No toca estado negocio, historial, documentos, responsable, updated_at.
 * Idempotente: tras 1.ª pasada estado_actual=RECEPCION_COTIZACIONES ⇒ 0 filas.
 */
export default `
DO $migration038$
DECLARE
  v_detectadas integer := 0;
  v_actualizadas integer := 0;
  v_codigos text := '';
BEGIN
  SELECT COUNT(*)::int,
         COALESCE(string_agg(r.codigo, ', ' ORDER BY r.id), '')
    INTO v_detectadas, v_codigos
    FROM requerimientos r
   WHERE EXISTS (
          SELECT 1
            FROM cotizaciones_proveedor cot
           WHERE cot.estado = 'COTIZACION_PRESENTADA'
             AND cot.fecha_presentacion IS NOT NULL
             AND (
                  cot.requerimiento_id = r.id
               OR EXISTS (
                    SELECT 1 FROM solicitud_requerimientos sr
                     WHERE sr.solicitud_id = cot.solicitud_id
                       AND sr.requerimiento_id = r.id
                  )
             )
         )
     AND (
          r.estado_actual IS NULL
       OR BTRIM(r.estado_actual) = ''
       OR UPPER(BTRIM(r.estado_actual)) IN ('REGISTRADO', 'INVITACIONES')
         );

  RAISE NOTICE '[038_sync_recepcion] filas_detectadas=% codigos=%',
    v_detectadas, NULLIF(v_codigos, '');

  UPDATE requerimientos r
     SET estado_actual = 'RECEPCION_COTIZACIONES',
         sub_modulo_actual = CASE
           WHEN COALESCE(BTRIM(r.sub_modulo_actual), '') = ''
             OR UPPER(BTRIM(r.sub_modulo_actual)) IN (
               'REGISTRADO', 'INVITACIONES', 'INVITACION', 'DEC', 'PROGRAMACION'
             )
           THEN 'Recepción de Cotizaciones'
           ELSE r.sub_modulo_actual
         END
   WHERE EXISTS (
          SELECT 1
            FROM cotizaciones_proveedor cot
           WHERE cot.estado = 'COTIZACION_PRESENTADA'
             AND cot.fecha_presentacion IS NOT NULL
             AND (
                  cot.requerimiento_id = r.id
               OR EXISTS (
                    SELECT 1 FROM solicitud_requerimientos sr
                     WHERE sr.solicitud_id = cot.solicitud_id
                       AND sr.requerimiento_id = r.id
                  )
             )
         )
     AND (
          r.estado_actual IS NULL
       OR BTRIM(r.estado_actual) = ''
       OR UPPER(BTRIM(r.estado_actual)) IN ('REGISTRADO', 'INVITACIONES')
         );

  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;
  RAISE NOTICE '[038_sync_recepcion] filas_actualizadas=%', v_actualizadas;
END
$migration038$;
`;

export function matchesMigration038(row = {}, hasCotizacionPresentada = false) {
  if (!hasCotizacionPresentada) return false;
  const etapa = String(row.estado_actual ?? '').trim().toUpperCase();
  return !etapa || etapa === 'REGISTRADO' || etapa === 'INVITACIONES';
}

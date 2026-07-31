/**
 * 037 — Sincerar ubicación post-aprobación DEC.
 *
 * Condición EXACTA (sin LIKE '%APROBADO%' ni regex amplias):
 *   estado ∈ { 'Aprobado DEC', 'APROBADO_DEC', 'REQUERIMIENTO_APROBADO_DEC' }
 *     (tras normalizar espacios → espacio único o guion bajo)
 *   AND estado_actual ∈ { NULL, '', 'DEC' }
 *
 * Actualiza solo:
 *   - estado_actual = 'PROGRAMACION'
 *   - sub_modulo_actual = 'Programación' si estaba vacío / DEC
 *
 * No toca: estado, historial, documentos, responsable, fechas de aprobación, payload.
 * Idempotente: tras la 1.ª ejecución estado_actual='PROGRAMACION' ⇒ 0 filas en re-ejecución.
 */
export default `
DO $migration037$
DECLARE
  v_detectadas integer := 0;
  v_actualizadas integer := 0;
  v_codigos text := '';
BEGIN
  -- Diagnóstico (solo id + codigo; sin datos sensibles)
  SELECT COUNT(*)::int,
         COALESCE(string_agg(codigo, ', ' ORDER BY id), '')
    INTO v_detectadas, v_codigos
    FROM requerimientos
   WHERE (
          UPPER(BTRIM(REGEXP_REPLACE(COALESCE(estado, ''), '[[:space:]]+', ' ', 'g'))) = 'APROBADO DEC'
       OR UPPER(BTRIM(REGEXP_REPLACE(COALESCE(estado, ''), '[[:space:]]+', '_', 'g'))) IN (
            'APROBADO_DEC',
            'REQUERIMIENTO_APROBADO_DEC'
          )
         )
     AND (
          estado_actual IS NULL
       OR BTRIM(estado_actual) = ''
       OR UPPER(BTRIM(estado_actual)) = 'DEC'
         );

  RAISE NOTICE '[037_sync_aprobado_dec] filas_detectadas=% codigos=%',
    v_detectadas, NULLIF(v_codigos, '');

  UPDATE requerimientos
     SET estado_actual = 'PROGRAMACION',
         sub_modulo_actual = CASE
           WHEN COALESCE(BTRIM(sub_modulo_actual), '') = ''
             OR UPPER(BTRIM(sub_modulo_actual)) IN ('DEC', 'EN DEC')
           THEN 'Programación'
           ELSE sub_modulo_actual
         END
   WHERE (
          UPPER(BTRIM(REGEXP_REPLACE(COALESCE(estado, ''), '[[:space:]]+', ' ', 'g'))) = 'APROBADO DEC'
       OR UPPER(BTRIM(REGEXP_REPLACE(COALESCE(estado, ''), '[[:space:]]+', '_', 'g'))) IN (
            'APROBADO_DEC',
            'REQUERIMIENTO_APROBADO_DEC'
          )
         )
     AND (
          estado_actual IS NULL
       OR BTRIM(estado_actual) = ''
       OR UPPER(BTRIM(estado_actual)) = 'DEC'
         );

  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;
  RAISE NOTICE '[037_sync_aprobado_dec] filas_actualizadas=%', v_actualizadas;
END
$migration037$;
`;

/** Predicado JS espejo del WHERE (para pruebas unitarias A–F). */
export function matchesMigration037(row = {}) {
  const estadoRaw = String(row.estado ?? '').trim();
  const estadoSpaced = estadoRaw.replace(/\s+/g, ' ').toUpperCase();
  const estadoUnder = estadoRaw.replace(/\s+/g, '_').toUpperCase();
  const estadoOk = estadoSpaced === 'APROBADO DEC'
    || estadoUnder === 'APROBADO_DEC'
    || estadoUnder === 'REQUERIMIENTO_APROBADO_DEC'
    || estadoSpaced === 'REQUERIMIENTO_APROBADO_DEC';

  const etapa = String(row.estado_actual ?? '').trim().toUpperCase();
  const etapaOk = !etapa || etapa === 'DEC';

  return estadoOk && etapaOk;
}

/** Campos que la migración escribe (documentación / tests). */
export const MIGRATION_037_UPDATES = Object.freeze([
  'estado_actual',
  'sub_modulo_actual',
]);

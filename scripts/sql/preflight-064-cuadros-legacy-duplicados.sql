-- RC8.17.8H6-C3-D10-A — Preflight READ-ONLY para migracion 064 (Cuadro Comparativo).
-- Solo SELECT. No UPDATE, INSERT ni DELETE.
--
-- Ejecutar en sgc_test (o el entorno objetivo) ANTES de npm run migrate.

-- =============================================================================
-- PRE-064 (obligatorio antes de aplicar la migracion)
-- =============================================================================
-- En esquema pre-064 la tabla cuadros_comparativos aun NO tiene:
--   invitacion_id, nro_invitacion, cotizacion_ancla_id
--
-- Esta consulta detecta mas de un cuadro activo (estado <> 'ANULADO') por
-- (solicitud_id, tipo). Es la condicion que debe cumplirse para que el futuro
-- indice legacy idx_cuadros_activo_solicitud_tipo (nro_invitacion IS NULL) pueda
-- crearse sin conflicto en filas existentes (todas quedaran con nro NULL al ADD COLUMN).
--
-- Resultado esperado en sgc_test (evidencia R3): 0 filas.
-- Ejemplo equivalente ejecutado en preflight real:
--
--   SELECT solicitud_id, tipo, COUNT(*)
--   FROM cuadros_comparativos
--   WHERE estado <> 'ANULADO'
--   GROUP BY solicitud_id, tipo
--   HAVING COUNT(*) > 1;
--

SELECT
  solicitud_id,
  tipo,
  COUNT(*) AS activos_por_sc_tipo,
  ARRAY_AGG(id ORDER BY id) AS cuadro_ids,
  ARRAY_AGG(estado ORDER BY id) AS estados
FROM cuadros_comparativos
WHERE estado <> 'ANULADO'
GROUP BY solicitud_id, tipo
HAVING COUNT(*) > 1
ORDER BY solicitud_id, tipo;

-- =============================================================================
-- POST-064 (opcional; ejecutar SOLO despues de aplicar la migracion 064)
-- =============================================================================
-- Requiere columna nro_invitacion. No ejecutar en esquema pre-064.

-- Duplicados activos legacy (sin agrupacion operativa):
-- violarian idx_cuadros_activo_solicitud_tipo_legacy
/*
SELECT
  solicitud_id,
  tipo,
  COUNT(*) AS activos_legacy,
  ARRAY_AGG(id ORDER BY id) AS cuadro_ids,
  ARRAY_AGG(estado ORDER BY id) AS estados
FROM cuadros_comparativos
WHERE nro_invitacion IS NULL
  AND estado <> 'ANULADO'
GROUP BY solicitud_id, tipo
HAVING COUNT(*) > 1
ORDER BY solicitud_id, tipo;
*/

-- Duplicados activos en el mismo contexto operativo (nro_invitacion resuelto):
-- violarian idx_cuadros_activo_solicitud_tipo_nro
/*
SELECT
  solicitud_id,
  tipo,
  nro_invitacion,
  COUNT(*) AS activos_mismo_contexto,
  ARRAY_AGG(id ORDER BY id) AS cuadro_ids
FROM cuadros_comparativos
WHERE nro_invitacion IS NOT NULL
  AND estado <> 'ANULADO'
GROUP BY solicitud_id, tipo, nro_invitacion
HAVING COUNT(*) > 1
ORDER BY solicitud_id, tipo, nro_invitacion;
*/

-- RC118 — Diagnóstico estado inicial de requerimientos (ejecutar en VPS / PostgreSQL)
-- NO ejecutar el bloque UPDATE sin revisar el SELECT previo.
-- Tablas reales: requerimientos, requerimiento_pedidos, pedidos_sigamef,
--   solicitud_requerimientos, cuadros_comparativos, paquete_requerimientos

-- =============================================================================
-- 1) Registro principal observado (ajustar codigo / id)
-- =============================================================================
SELECT
  r.id                    AS requerimiento_id,
  r.codigo                AS numero_requerimiento,
  r.tipo,
  EXTRACT(YEAR FROM r.created_at)::int AS anio,
  r.cmn,
  r.estado                AS estado_guardado,
  r.estado_actual         AS etapa_trazabilidad,
  r.sub_modulo_actual,
  r.responsable_actual,
  r.fecha_estado_actual,
  r.created_at,
  r.usuario_modificacion
FROM requerimientos r
WHERE r.codigo = 'REQ-00002'
   OR r.codigo ILIKE '%00002%'
ORDER BY r.id DESC;

-- =============================================================================
-- 2) Pedidos SIGAMEF vinculados (por requerimiento_id — correlación correcta)
-- =============================================================================
SELECT
  r.id AS requerimiento_id,
  r.codigo,
  r.tipo,
  p.id AS pedido_id,
  p.pedido_sigamef,
  p.nro_pedido,
  p.tipo AS pedido_tipo
FROM requerimientos r
JOIN requerimiento_pedidos rp ON rp.requerimiento_id = r.id
JOIN pedidos_sigamef p ON p.id = rp.pedido_sigamef_id
WHERE r.codigo = 'REQ-00002'
   OR p.pedido_sigamef = '071100446500'
ORDER BY r.id, p.id;

-- =============================================================================
-- 3) Historial de estados (JSONB en requerimientos)
-- =============================================================================
SELECT
  r.id,
  r.codigo,
  r.estado,
  r.estado_actual,
  r.historial_estados,
  jsonb_array_length(COALESCE(r.historial_estados, '[]'::jsonb)) AS n_eventos,
  r.historial_estados -> -1 AS ultimo_evento_historial
FROM requerimientos r
WHERE r.codigo = 'REQ-00002'
ORDER BY r.id DESC;

-- =============================================================================
-- 4) Paquetes / consolidación
-- =============================================================================
SELECT
  r.id AS requerimiento_id,
  r.codigo,
  pr.paquete_id
FROM requerimientos r
LEFT JOIN paquete_requerimientos pr ON pr.requerimiento_id = r.id
WHERE r.codigo = 'REQ-00002';

-- =============================================================================
-- 5) Relaciones con solicitudes / cuadros comparativos (¿contaminación?)
-- =============================================================================
SELECT
  r.id AS requerimiento_id,
  r.codigo,
  r.estado_actual,
  sr.solicitud_id,
  cc.id AS cuadro_id,
  cc.estado AS cuadro_estado,
  cc.version,
  cc.creado_at
FROM requerimientos r
LEFT JOIN solicitud_requerimientos sr ON sr.requerimiento_id = r.id
LEFT JOIN cuadros_comparativos cc ON cc.solicitud_id = sr.solicitud_id
WHERE r.codigo = 'REQ-00002'
ORDER BY r.id, cc.id;

-- =============================================================================
-- 6) Numeración coincidente (mismo código visible, distintos id / año)
-- =============================================================================
SELECT
  id,
  codigo,
  tipo,
  estado,
  estado_actual,
  created_at
FROM requerimientos
WHERE codigo = 'REQ-00002'
   OR codigo ILIKE '%REQ-00002%'
ORDER BY id;

-- =============================================================================
-- 7) ¿De dónde saldría “C.C. en elaboración”?
--    A) Columna estado / estado_actual
--    B) Historial
--    C) Cuadro vinculado
--    D) Solo frontend (resolvedor) — si A–C están limpios
-- =============================================================================
SELECT
  r.id,
  r.codigo,
  r.tipo,
  r.estado,
  r.estado_actual,
  CASE
    WHEN r.estado ILIKE '%cuadro%' OR r.estado ILIKE '%elaboraci%'
      OR r.estado ILIKE '%borrador%' OR r.estado ILIKE '%pendiente%'
      THEN 'posible_en_columna_estado'
    WHEN r.estado_actual = 'CUADRO_COMPARATIVO'
      THEN 'posible_en_estado_actual'
    WHEN EXISTS (
      SELECT 1
      FROM solicitud_requerimientos sr
      JOIN cuadros_comparativos cc ON cc.solicitud_id = sr.solicitud_id
      WHERE sr.requerimiento_id = r.id
    ) THEN 'posible_via_cuadro_relacionado'
    WHEN COALESCE(r.estado, '') = '' OR r.estado_actual = 'REGISTRADO'
      THEN 'probable_solo_frontend_fallback_historico'
    ELSE 'revisar_manual'
  END AS origen_hipotesis_cc_elaboracion
FROM requerimientos r
WHERE r.codigo = 'REQ-00002'
ORDER BY r.id DESC;

-- =============================================================================
-- 8) Candidatos inconsistentes (SELECT diagnóstico — no UPDATE aún)
--    Criterio: recién en REGISTRADO / sin solicitud-cuadro, pero estado negocio
--    sugiere cuadro o está vacío (Locador histórico).
-- =============================================================================
SELECT
  r.id,
  r.codigo,
  r.tipo,
  r.estado AS estado_guardado,
  r.estado_actual,
  r.created_at,
  (SELECT COUNT(*) FROM solicitud_requerimientos sr WHERE sr.requerimiento_id = r.id) AS n_solicitudes,
  (SELECT COUNT(*)
     FROM solicitud_requerimientos sr
     JOIN cuadros_comparativos cc ON cc.solicitud_id = sr.solicitud_id
    WHERE sr.requerimiento_id = r.id) AS n_cuadros
FROM requerimientos r
WHERE COALESCE(r.estado_actual, 'REGISTRADO') = 'REGISTRADO'
  AND (
    COALESCE(TRIM(r.estado), '') = ''
    OR r.estado ILIKE '%cuadro%'
    OR r.estado ILIKE '%elaboraci%'
    OR UPPER(REPLACE(TRIM(r.estado), ' ', '_')) IN (
      'PENDIENTE_ELABORAR', 'CUADRO_BORRADOR', 'BORRADOR', 'EN_ELABORACION', 'PENDIENTE'
    )
  )
ORDER BY r.id DESC
LIMIT 100;

-- =============================================================================
-- 9) UPDATE puntual propuesto (NO ejecutar automáticamente)
--    Solo tras validar el SELECT #8. Ajusta el filtro WHERE a ids concretos.
-- =============================================================================
/*
BEGIN;

UPDATE requerimientos r
SET
  estado = 'Registrado',
  updated_at = NOW()
WHERE r.id IN (
  -- Pegar IDs verificados del SELECT #8
  -- ejemplo: 123, 456
)
  AND COALESCE(r.estado_actual, 'REGISTRADO') = 'REGISTRADO'
  AND (
    COALESCE(TRIM(r.estado), '') = ''
    OR r.estado ILIKE '%cuadro%'
    OR r.estado ILIKE '%elaboraci%'
    OR UPPER(REPLACE(TRIM(r.estado), ' ', '_')) IN (
      'PENDIENTE_ELABORAR', 'CUADRO_BORRADOR', 'BORRADOR', 'EN_ELABORACION', 'PENDIENTE'
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM solicitud_requerimientos sr
    JOIN cuadros_comparativos cc ON cc.solicitud_id = sr.solicitud_id
    WHERE sr.requerimiento_id = r.id
  );

-- Verificar
SELECT id, codigo, tipo, estado, estado_actual FROM requerimientos WHERE id IN (/* ids */);

-- COMMIT;   -- solo si el SELECT de verificación es correcto
-- ROLLBACK; -- si algo no cuadra
*/

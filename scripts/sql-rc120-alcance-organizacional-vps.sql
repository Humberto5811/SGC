-- ============================================================
-- RC120 — Consultas de diagnóstico alcance organizacional (VPS)
-- Ejecutar en PostgreSQL del entorno SGC.
-- No inventa tablas: usa usuarios, areas, centros, requerimientos.
-- ============================================================

-- 1) Organización de William Vásquez (ajustar nombre/DNI si difiere)
SELECT u.id, u.dni, u.apellidos, u.nombres, u.rol, u.cargo,
       u.centro, u.area_id, u.codigo_centro_costo, u.alcance_datos,
       a.codigo AS area_codigo, a.nombre AS area_nombre, a.centro_id,
       c.codigo AS centro_codigo, c.nombre AS centro_nombre
FROM usuarios u
LEFT JOIN areas a ON u.area_id = a.id
LEFT JOIN centros c ON a.centro_id = c.id
WHERE u.apellidos ILIKE '%VASQUEZ%'
   OR u.nombres ILIKE '%WILLIAM%'
   OR (u.apellidos ILIKE '%VÁSQUEZ%' OR u.nombre ILIKE '%WILLIAM%VASQUEZ%')
ORDER BY u.id;

-- 2) Centros y centros de costo (áreas) de CNCC
SELECT c.id AS centro_id, c.codigo, c.nombre,
       a.id AS area_id, a.codigo AS centro_costo, a.nombre AS area_nombre
FROM centros c
LEFT JOIN areas a ON a.centro_id = c.id
WHERE UPPER(TRIM(c.codigo)) = 'CNCC'
ORDER BY a.codigo;

-- 3) Asignaciones personalizadas vigentes
SELECT *
FROM usuarios_alcance_asignaciones
WHERE vigente = TRUE AND eliminado_at IS NULL
ORDER BY usuario_id, id;

-- 4) Permisos funcionales del usuario (JSON)
SELECT id, dni, nombre, rol, cargo, permisos
FROM usuarios
WHERE apellidos ILIKE '%VASQUEZ%' OR nombre ILIKE '%WILLIAM%VASQUEZ%';

-- 5) Requerimientos con centro resuelto (join por nombre de área)
SELECT r.id, r.codigo, r.area, r.responsable, r.estado,
       a.id AS area_id, a.codigo AS centro_costo_codigo,
       c.id AS centro_id, c.codigo AS centro_codigo
FROM requerimientos r
LEFT JOIN areas a
  ON r.area = a.nombre
  OR UPPER(TRIM(a.codigo)) = UPPER(TRIM(r.area))
LEFT JOIN centros c ON a.centro_id = c.id
ORDER BY r.id DESC
LIMIT 100;

-- 6) Requerimientos FUERA de CNCC (candidatos a ocultar a usuario CNCC operativo)
SELECT r.id, r.codigo, r.area, c.codigo AS centro_codigo
FROM requerimientos r
LEFT JOIN areas a
  ON r.area = a.nombre
  OR UPPER(TRIM(a.codigo)) = UPPER(TRIM(r.area))
LEFT JOIN centros c ON a.centro_id = c.id
WHERE COALESCE(UPPER(TRIM(c.codigo)), '') <> 'CNCC'
ORDER BY r.id DESC
LIMIT 50;

-- 7) Requerimientos de CNCC
SELECT r.id, r.codigo, r.area, a.codigo AS centro_costo, c.codigo AS centro
FROM requerimientos r
LEFT JOIN areas a
  ON r.area = a.nombre
  OR UPPER(TRIM(a.codigo)) = UPPER(TRIM(r.area))
LEFT JOIN centros c ON a.centro_id = c.id
WHERE UPPER(TRIM(c.codigo)) = 'CNCC'
ORDER BY r.id;

-- 8) Históricos sin resolución de centro (área no matchea catálogo)
SELECT r.id, r.codigo, r.area
FROM requerimientos r
LEFT JOIN areas a
  ON r.area = a.nombre
  OR UPPER(TRIM(a.codigo)) = UPPER(TRIM(r.area))
WHERE a.id IS NULL
ORDER BY r.id DESC
LIMIT 50;

-- 9) Usuarios con centro inconsistente (texto vs area.centro_id)
SELECT u.id, u.nombre, u.centro AS centro_usuario,
       c.codigo AS centro_desde_area, u.area_id, u.codigo_centro_costo, u.alcance_datos
FROM usuarios u
LEFT JOIN areas a ON u.area_id = a.id
LEFT JOIN centros c ON a.centro_id = c.id
WHERE u.activo = TRUE
  AND COALESCE(NULLIF(TRIM(u.centro), ''), '') <> ''
  AND c.codigo IS NOT NULL
  AND UPPER(TRIM(u.centro)) <> UPPER(TRIM(c.codigo))
ORDER BY u.id;

-- 10) Correlativo institucional (máximo id / códigos REQ-)
SELECT MAX(id) AS max_id,
       COUNT(*) AS total_req,
       COUNT(DISTINCT codigo) AS codigos_distintos
FROM requerimientos;

SELECT id, codigo
FROM requerimientos
WHERE codigo IS NOT NULL
ORDER BY id
LIMIT 20;

-- 11) Matriz esperada (rellenar tras consultas 1/5/6/7)
-- | Usuario | Alcance | Centro | Centro costo | Requerimiento | Permitido |
-- |---------|---------|--------|--------------|---------------|-----------|
-- | William | CENTRO_COSTO o CENTRO | CNCC | (sus CC) | REQ de CNCC | SÍ |
-- | William | ... | CNCC | ... | REQ de otro centro | NO |
-- | Admin | INSTITUCIONAL | * | * | cualquiera | SÍ |
-- | DEC / Analista CM | TRANSVERSAL_FLUJO | * | * | por etapa/bandeja | SÍ (sin filtro org AU) |

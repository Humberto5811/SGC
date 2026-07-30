-- RC119 — Diagnóstico de permisos de usuario (PostgreSQL / VPS)
-- Fuente oficial: columna usuarios.permisos (JSONB). No hay tablas de permisos separadas.
-- Ajustar :username o el filtro WHERE según el usuario de prueba.

-- =============================================================================
-- 1) Usuario y permisos guardados
-- =============================================================================
SELECT
  id,
  username,
  dni,
  rol,
  activo,
  permisos,
  permisos -> 'modulos'     AS modulos,
  permisos -> 'submodulos'  AS submodulos,
  permisos -> 'actividades' AS actividades,
  permisos -> 'actividadesPorSubmodulo' AS actividades_por_submodulo
FROM usuarios
WHERE LOWER(username) = LOWER('USUARIO_PRUEBA')  -- <-- cambiar
   OR dni = 'DNI_PRUEBA'
ORDER BY id;

-- =============================================================================
-- 2) Expansión legible de módulos / submódulos
-- =============================================================================
SELECT
  u.id,
  u.username,
  u.rol,
  m.modulo,
  s.submodulo
FROM usuarios u
LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(u.permisos -> 'modulos', '[]'::jsonb)) AS m(modulo) ON TRUE
LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(u.permisos -> 'submodulos', '[]'::jsonb)) AS s(submodulo) ON TRUE
WHERE LOWER(u.username) = LOWER('USUARIO_PRUEBA')
ORDER BY m.modulo, s.submodulo;

-- =============================================================================
-- 3) Actividades por submódulo
-- =============================================================================
SELECT
  u.id,
  u.username,
  kv.key AS submodulo,
  kv.value AS actividades
FROM usuarios u
CROSS JOIN LATERAL jsonb_each(COALESCE(u.permisos -> 'actividadesPorSubmodulo', '{}'::jsonb)) AS kv(key, value)
WHERE LOWER(u.username) = LOWER('USUARIO_PRUEBA')
ORDER BY kv.key;

-- =============================================================================
-- 4) ¿Tiene grants explícitos? (causa raíz: menú filtraba por rol, no por JSON)
-- =============================================================================
SELECT
  id,
  username,
  rol,
  jsonb_array_length(COALESCE(permisos -> 'modulos', '[]'::jsonb)) AS n_modulos,
  jsonb_array_length(COALESCE(permisos -> 'submodulos', '[]'::jsonb)) AS n_submodulos,
  CASE
    WHEN jsonb_array_length(COALESCE(permisos -> 'modulos', '[]'::jsonb)) > 0
      OR jsonb_array_length(COALESCE(permisos -> 'submodulos', '[]'::jsonb)) > 0
    THEN 'tiene_permisos_json'
    ELSE 'sin_permisos_json_usar_plantilla_rol_o_vacio'
  END AS diagnostico
FROM usuarios
WHERE LOWER(username) = LOWER('USUARIO_PRUEBA');

-- =============================================================================
-- 5) Listado rápido de usuarios con grants (auditoría)
-- =============================================================================
SELECT
  id,
  username,
  rol,
  permisos -> 'modulos' AS modulos,
  jsonb_array_length(COALESCE(permisos -> 'submodulos', '[]'::jsonb)) AS n_submodulos
FROM usuarios
WHERE activo = TRUE
  AND (
    jsonb_array_length(COALESCE(permisos -> 'modulos', '[]'::jsonb)) > 0
    OR jsonb_array_length(COALESCE(permisos -> 'submodulos', '[]'::jsonb)) > 0
  )
ORDER BY id
LIMIT 50;

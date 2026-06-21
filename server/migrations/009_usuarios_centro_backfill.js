// Rellenar campo centro desde responsable del área vinculada
export default `
UPDATE usuarios u
SET centro = a.responsable, updated_at = NOW()
FROM areas a
WHERE u.area_id = a.id
  AND (u.centro IS NULL OR TRIM(u.centro) = '')
  AND a.responsable IS NOT NULL
  AND TRIM(a.responsable) <> '';
`;

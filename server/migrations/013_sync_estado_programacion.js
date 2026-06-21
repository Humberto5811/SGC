// Sincroniza columna estado cuando trazabilidad ya ubicó el expediente en Programación
export default `
UPDATE requerimientos
SET estado = 'En Programación', updated_at = NOW()
WHERE estado_actual = 'PROGRAMACION'
  AND estado IN ('En tramite de aprobación', 'Observado', 'Observado DEC');
`;

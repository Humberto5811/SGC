// Migración: Crear tabla glosas_servicios
// La definición de tabla ya está en schema.sql (idempotente),
// esta migración solo siembra el registro por defecto.

export default `
  INSERT INTO glosas_servicios (titulo, contenido, usuario_modificacion)
  SELECT '__FORMATO_SERVICIOS_DOC__', '{}', 'sistema'
  WHERE NOT EXISTS (
    SELECT 1 FROM glosas_servicios WHERE titulo = '__FORMATO_SERVICIOS_DOC__'
  );
`;
/**
 * Migración 053 — RC8.15.6F-3: múltiples PDFs vigentes por recepción.
 *
 * Elimina el índice único que limitaba a un solo documento vigente por recepción.
 * La vigencia lógica (retiro/reemplazo) se controla en aplicación.
 */
export default `
DROP INDEX IF EXISTS uq_entregable_recepcion_doc_vigente;
`;

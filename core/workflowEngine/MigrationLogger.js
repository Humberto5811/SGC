/**
 * Logs temporales de migración — consola únicamente (Fase 3A.2).
 * Desactivar con SGC_MIGRATION_LOG=0
 */
const ENABLED = process.env.SGC_MIGRATION_LOG !== '0';

export function isMigrationLogEnabled(override) {
  if (override === false) return false;
  if (override === true) return true;
  return ENABLED;
}

export function migrationLog(cadena, detalle = '', opts = {}) {
  if (!isMigrationLogEnabled(opts.enabled)) return;
  const msg = detalle ? `${cadena} → ${detalle}` : cadena;
  console.log(`[Migration] ${msg}`);
}

export function migrationWarn(mensaje, extra = null, opts = {}) {
  if (!isMigrationLogEnabled(opts.enabled)) return;
  if (extra != null) console.warn(`[Migration] ${mensaje}`, extra);
  else console.warn(`[Migration] ${mensaje}`);
}

export default { migrationLog, migrationWarn, isMigrationLogEnabled };

/**
 * Motor de importación universal — Registro de Datos (RC6).
 * Flujo: validar → transformar → normalizar → UPSERT → auditoría.
 * Nunca TRUNCATE. Nunca eliminar registros referenciados.
 */
import pool from '../db.js';

/**
 * @typedef {Object} ImportStats
 * @property {number} leidos
 * @property {number} insertados
 * @property {number} actualizados
 * @property {number} omitidos
 * @property {Array<{fila:number,error:string}>} errores
 * @property {number} duracion_ms
 */

/**
 * @param {import('pg').PoolClient} client
 * @param {Object} entry
 */
export async function logImportAudit(client, entry) {
  await client.query(`
    INSERT INTO importaciones_audit (
      catalogo, usuario, archivo, registros_leidos, insertados, actualizados,
      omitidos, errores_count, duracion_ms, detalle_errores
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `, [
    entry.catalogo || entry.table || 'desconocido',
    entry.usuario || 'Sistema',
    entry.archivo || '',
    entry.leidos || 0,
    entry.insertados || 0,
    entry.actualizados || 0,
    entry.omitidos || 0,
    (entry.errores || []).length,
    entry.duracion_ms || 0,
    JSON.stringify(entry.errores || []),
  ]);
}

function buildWhere(keys, startIdx = 1) {
  return keys.map((k, i) => `${k} = $${startIdx + i}`).join(' AND ');
}

/**
 * Ejecuta importación UPSERT fila a fila.
 * @param {Object} cfg
 * @param {string} cfg.table
 * @param {string} cfg.catalogo
 * @param {string[]} cfg.columns - columnas a insertar/actualizar (sin id)
 * @param {string[]} cfg.conflictKeys - claves naturales para detectar existencia
 * @param {Array<Object>} cfg.rows
 * @param {Function} [cfg.transform] - (rawRow, index) => object
 * @param {Function} [cfg.validate] - (row, index) => string|null error
 * @param {Function} cfg.coerce - (row) => object con todas las columnas
 * @param {string} [cfg.usuario]
 * @param {string} [cfg.archivo]
 * @returns {Promise<ImportStats>}
 */
export async function runUpsertImport(cfg) {
  const {
    table,
    catalogo = table,
    columns,
    conflictKeys,
    rows = [],
    transform,
    validate,
    coerce,
    usuario = 'Sistema',
    archivo = '',
  } = cfg;

  const stats = {
    leidos: rows.length,
    insertados: 0,
    actualizados: 0,
    omitidos: 0,
    errores: [],
    duracion_ms: 0,
  };

  if (!rows.length) {
    return stats;
  }

  const start = Date.now();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      try {
        let row = transform ? transform(raw, i) : { ...raw };
        if (validate) {
          const err = validate(row, i);
          if (err) {
            stats.omitidos += 1;
            stats.errores.push({ fila: i + 1, error: err });
            continue;
          }
        }

        const data = coerce(row);
        const keyValues = conflictKeys.map((k) => data[k]);
        if (keyValues.some((v) => v == null || String(v).trim() === '')) {
          stats.omitidos += 1;
          stats.errores.push({ fila: i + 1, error: `Clave natural incompleta (${conflictKeys.join(', ')})` });
          continue;
        }

        const where = buildWhere(conflictKeys);
        const { rows: existing } = await client.query(
          `SELECT id FROM ${table} WHERE ${where} LIMIT 1`,
          keyValues,
        );

        const payloadCols = columns.filter((c) => !conflictKeys.includes(c));
        if (existing.length) {
          const setParts = payloadCols.map((c, idx) => `${c} = $${idx + 2}`);
          const values = [
            existing[0].id,
            ...payloadCols.map((c) => data[c]),
          ];
          await client.query(
            `UPDATE ${table} SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $1`,
            values,
          );
          stats.actualizados += 1;
        } else {
          const insertCols = columns;
          const placeholders = insertCols.map((_, idx) => `$${idx + 1}`).join(', ');
          const values = insertCols.map((c) => data[c]);
          await client.query(
            `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${placeholders})`,
            values,
          );
          stats.insertados += 1;
        }
      } catch (err) {
        stats.errores.push({ fila: i + 1, error: err.message || 'Error al procesar fila' });
      }
    }

    stats.duracion_ms = Date.now() - start;
    await logImportAudit(client, { catalogo, table, usuario, archivo, ...stats });
    await client.query('COMMIT');
    return stats;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

export class ImportEngine {
  constructor(config) {
    this.config = config;
  }

  run(options) {
    return runUpsertImport({ ...this.config, ...options });
  }
}

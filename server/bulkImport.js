/**
 * Router factory para importación UPSERT (Registro de Datos).
 * Reemplaza el patrón TRUNCATE + INSERT masivo.
 */
import express from 'express';
import { runUpsertImport } from './lib/importEngine.js';

/**
 * @param {Object} cfg
 * @param {string} cfg.table
 * @param {string} cfg.catalogo
 * @param {string[]} cfg.columns
 * @param {string[]} cfg.conflictKeys
 * @param {Function} [cfg.transform]
 * @param {Function} [cfg.validate]
 * @param {Function} cfg.coerce
 */
export function importEngineRouter(cfg) {
  const router = express.Router();

  router.post('/import', async (req, res, next) => {
    try {
      const body = req.body || {};
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) {
        return res.status(400).json({ error: 'No se recibieron filas para importar.' });
      }

      const usuario = body.usuario || req.headers['x-usuario'] || 'Sistema';
      const archivo = body.archivo || body.fileName || '';

      const stats = await runUpsertImport({
        ...cfg,
        rows,
        usuario,
        archivo,
      });

      res.json({
        ok: true,
        ...stats,
        inserted: stats.insertados,
        updated: stats.actualizados,
        skipped: stats.omitidos,
        mode: 'upsert',
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/** @deprecated Use importEngineRouter — mantiene nombre por compatibilidad, sin TRUNCATE. */
export function bulkImportRouter(cfg) {
  return importEngineRouter(cfg);
}

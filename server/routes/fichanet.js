// Rutas de Ficha NET — importación UPSERT vía ImportEngine.
import express from 'express';
import { crudRouter } from '../crud.js';
import { importEngineRouter } from '../bulkImport.js';
import { query } from '../db.js';
import { cleanString, normalizeRowKeys, normalizeDateValue } from '../lib/importNormalize.js';

const COLUMNS = [
  'idfichanet', 'idcartcod', 'idcartcodigosiga', 'dscartnombre', 'dscclasdescripcion',
  'dscartpresentacion', 'dspesomolecular', 'dsporcentajepureza', 'dsformula', 'dsdensidad',
  'dsph', 'dstemperatura', 'idclase', 'dsclase', 'idsubclase', 'dssubclase',
  'dscartdocumentos', 'dscartcaracteristica', 'dscartfechavencimiento', 'stcartestado',
  'dscartobservaciones', 'dafechacreacion', 'dsusuariocrea', 'nu_version',
];

const DATE_COLS = new Set(['dscartfechavencimiento', 'dafechacreacion']);

const router = express.Router();

router.get('/por-codigo/:codigo', async (req, res, next) => {
  try {
    const codigo = String(req.params.codigo || '').trim();
    if (!codigo) return res.status(400).json({ error: 'Código requerido' });
    const { rows } = await query(
      `SELECT * FROM ficha_net WHERE TRIM(idcartcodigosiga) = $1 ORDER BY id DESC LIMIT 1`,
      [codigo],
    );
    if (!rows.length) return res.status(404).json({ error: 'Ficha NET no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.use('/', importEngineRouter({
  table: 'ficha_net',
  catalogo: 'ficha_net',
  columns: COLUMNS,
  conflictKeys: ['idcartcodigosiga'],
  transform: (raw) => normalizeRowKeys(raw),
  validate: (row) => (!cleanString(row.idcartcodigosiga) ? 'idcartcodigosiga requerido' : null),
  coerce: (row) => {
    const out = {};
    for (const c of COLUMNS) {
      const v = row[c];
      if (DATE_COLS.has(c)) out[c] = normalizeDateValue(v);
      else out[c] = cleanString(v);
    }
    return out;
  },
}));

router.use('/', crudRouter({
  table: 'ficha_net',
  columns: COLUMNS,
  searchCols: ['idfichanet', 'idcartcodigosiga', 'dscartnombre', 'dsclase'],
  orderBy: 'id',
}));

export default router;

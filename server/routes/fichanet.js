// Rutas de Ficha NET.
// Reutiliza el CRUD genérico (lista paginada + búsqueda) y añade:
//  - POST /import  : carga masiva por lotes (reemplazar o agregar)
//  - DELETE /      : vaciar la tabla
import express from 'express';
import { crudRouter } from '../crud.js';
import { bulkImportRouter } from '../bulkImport.js';
import { query } from '../db.js';

const COLUMNS = [
  'idfichanet', 'idcartcod', 'idcartcodigosiga', 'dscartnombre', 'dscclasdescripcion',
  'dscartpresentacion', 'dspesomolecular', 'dsporcentajepureza', 'dsformula', 'dsdensidad',
  'dsph', 'dstemperatura', 'idclase', 'dsclase', 'idsubclase', 'dssubclase',
  'dscartdocumentos', 'dscartcaracteristica', 'dscartfechavencimiento', 'stcartestado',
  'dscartobservaciones', 'dafechacreacion', 'dsusuariocrea', 'nu_version',
];

const router = express.Router();

// Búsqueda exacta por código SIGAMEF (idcartcodigosiga) — antes del CRUD /:id
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

// Bulk import + truncate via shared utility
router.use('/', bulkImportRouter({
  table: 'ficha_net',
  columns: COLUMNS,
}));

// CRUD genérico (GET lista/paginada, GET :id, POST, PUT, DELETE :id)
router.use('/', crudRouter({
  table: 'ficha_net',
  columns: COLUMNS,
  searchCols: ['idfichanet', 'idcartcodigosiga', 'dscartnombre', 'dsclase'],
  orderBy: 'id',
}));

export default router;

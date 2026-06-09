// Rutas de Ficha NET.
// Reutiliza el CRUD genérico (lista paginada + búsqueda) y añade:
//  - POST /import  : carga masiva por lotes (reemplazar o agregar)
//  - DELETE /      : vaciar la tabla
import express from 'express';
import { crudRouter } from '../crud.js';
import { bulkImportRouter } from '../bulkImport.js';

const COLUMNS = [
  'idfichanet', 'idcartcod', 'idcartcodigosiga', 'dscartnombre', 'dscclasdescripcion',
  'dscartpresentacion', 'dspesomolecular', 'dsporcentajepureza', 'dsformula', 'dsdensidad',
  'dsph', 'dstemperatura', 'idclase', 'dsclase', 'idsubclase', 'dssubclase',
  'dscartdocumentos', 'dscartcaracteristica', 'dscartfechavencimiento', 'stcartestado',
  'dscartobservaciones', 'dafechacreacion', 'dsusuariocrea', 'nu_version',
];

const router = express.Router();

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

// Rutas del Catálogo SIGAMEF.
// Reutiliza el CRUD genérico (lista paginada + búsqueda) y añade:
//  - POST /import  : carga masiva por lotes (reemplazar o agregar)
//  - DELETE /      : vaciar la tabla
import express from 'express';
import { crudRouter } from '../crud.js';
import { bulkImportRouter } from '../bulkImport.js';

const COLUMNS = [
  'tipo_bien', 'item_bien', 'nombre_item', 'unidad_medida', 'precio_unitario',
  'ficha_tecnica', 'acuerdo_marco', 'producto_controlado', 'ficha_homologada',
];

const router = express.Router();

// Bulk import + truncate via shared utility
router.use('/', bulkImportRouter({
  table: 'catalogo_sigamef',
  columns: COLUMNS,
  coerce: (r) => [
    r.tipo_bien ?? 'B',
    String(r.item_bien ?? ''),
    String(r.nombre_item ?? ''),
    r.unidad_medida ?? '',
    Number(r.precio_unitario) || 0,
    !!r.ficha_tecnica,
    !!r.acuerdo_marco,
    !!r.producto_controlado,
    !!r.ficha_homologada,
  ],
}));

// CRUD genérico (GET lista/paginada, GET :id, POST, PUT, DELETE :id)
router.use('/', crudRouter({
  table: 'catalogo_sigamef',
  columns: COLUMNS,
  searchCols: ['item_bien', 'nombre_item', 'tipo_bien', 'unidad_medida'],
  orderBy: 'id',
}));

export default router;

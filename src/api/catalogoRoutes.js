import express from 'express';
import {
  getAllCatalogo,
  getCatalogoById,
  createCatalogo,
  updateCatalogo,
  deleteCatalogo,
} from '../controllers/catalogoController.js';

const router = express.Router();

router.get('/', getAllCatalogo);
router.get('/:id', getCatalogoById);
router.post('/', createCatalogo);
router.put('/:id', updateCatalogo);
router.delete('/:id', deleteCatalogo);

export default router;

// Servicio de Catálogos IGAMEF
const CatalogosIGAMEF = require('../models/CatalogosIGAMEF');

class CatalogosIGAMEFService {
  // Obtener todos
  async getAll() {
    try {
      return await CatalogosIGAMEF.getAll();
    } catch (error) {
      console.error('Error al obtener catálogos:', error);
      throw new Error('No se pudieron obtener los catálogos');
    }
  }

  // Obtener activos
  async getActivos() {
    try {
      return await CatalogosIGAMEF.getActivos();
    } catch (error) {
      console.error('Error al obtener catálogos activos:', error);
      throw new Error('No se pudieron obtener los catálogos activos');
    }
  }

  // Obtener por ID
  async getById(id) {
    try {
      const catalogo = await CatalogosIGAMEF.getById(id);
      if (!catalogo) {
        throw new Error('Catálogo no encontrado');
      }
      return catalogo;
    } catch (error) {
      console.error('Error al obtener catálogo:', error);
      throw error;
    }
  }

  // Crear
  async create(data) {
    try {
      // Validar datos requeridos
      if (!data.codigo || !data.nombre) {
        throw new Error('El código y nombre son requeridos');
      }
      
      // Verificar si ya existe el código
      const existentes = await CatalogosIGAMEF.getAll();
      if (existentes.find(c => c.codigo === data.codigo)) {
        throw new Error('Ya existe un catálogo con ese código');
      }
      
      return await CatalogosIGAMEF.create(data);
    } catch (error) {
      console.error('Error al crear catálogo:', error);
      throw error;
    }
  }

  // Actualizar
  async update(id, data) {
    try {
      const existe = await CatalogosIGAMEF.getById(id);
      if (!existe) {
        throw new Error('Catálogo no encontrado');
      }
      return await CatalogosIGAMEF.update(id, data);
    } catch (error) {
      console.error('Error al actualizar catálogo:', error);
      throw error;
    }
  }

  // Eliminar
  async delete(id) {
    try {
      const existe = await CatalogosIGAMEF.getById(id);
      if (!existe) {
        throw new Error('Catálogo no encontrado');
      }
      return await CatalogosIGAMEF.delete(id);
    } catch (error) {
      console.error('Error al eliminar catálogo:', error);
      throw error;
    }
  }

  // Cambiar estado
  async toggleStatus(id, activo) {
    try {
      const existe = await CatalogosIGAMEF.getById(id);
      if (!existe) {
        throw new Error('Catálogo no encontrado');
      }
      return await CatalogosIGAMEF.toggleStatus(id, activo);
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      throw error;
    }
  }
}

module.exports = new CatalogosIGAMEFService();
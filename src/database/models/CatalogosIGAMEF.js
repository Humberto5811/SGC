// Modelo de datos para Catálogos IGAMEF
const db = require('../database/JS_db');

class CatalogosIGAMEF {
  // Obtener todos los catálogos
  static async getAll() {
    const result = await db.query(
      'SELECT * FROM catalogos_igamef ORDER BY orden ASC, nombre ASC'
    );
    return result.rows;
  }

  // Obtener solo los activos
  static async getActivos() {
    const result = await db.query(
      'SELECT * FROM catalogos_igamef WHERE activo = true ORDER BY orden ASC, nombre ASC'
    );
    return result.rows;
  }

  // Obtener por ID
  static async getById(id) {
    const result = await db.query(
      'SELECT * FROM catalogos_igamef WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  // Crear nuevo catálogo
  static async create(data) {
    const { codigo, nombre, descripcion, orden = 0 } = data;
    const result = await db.query(
      `INSERT INTO catalogos_igamef (codigo, nombre, descripcion, orden) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [codigo, nombre, descripcion, orden]
    );
    return result.rows[0];
  }

  // Actualizar catálogo
  static async update(id, data) {
    const { codigo, nombre, descripcion, activo, orden } = data;
    const result = await db.query(
      `UPDATE catalogos_igamef 
       SET codigo = $1, nombre = $2, descripcion = $3, activo = $4, orden = $5, updated_at = NOW()
       WHERE id = $6 
       RETURNING *`,
      [codigo, nombre, descripcion, activo, orden, id]
    );
    return result.rows[0];
  }

  // Eliminar (borrado físico)
  static async delete(id) {
    const result = await db.query(
      'DELETE FROM catalogos_igamef WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  // Cambiar estado (activar/desactivar)
  static async toggleStatus(id, activo) {
    const result = await db.query(
      'UPDATE catalogos_igamef SET activo = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [activo, id]
    );
    return result.rows[0];
  }
}

module.exports = CatalogosIGAMEF;
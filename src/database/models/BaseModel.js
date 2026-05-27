// src/database/models/BaseModel.js
import { query } from '../db.js';

class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
  }

  async findAll(conditions = {}, options = {}) {
    let sql = `SELECT * FROM ${this.tableName}`;
    const values = [];
    
    const whereClause = this.buildWhereClause(conditions, values);
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }
    
    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy} ${options.orderDir || 'ASC'}`;
    }
    
    if (options.limit) {
      sql += ` LIMIT $${values.length + 1}`;
      values.push(options.limit);
    }
    if (options.offset) {
      sql += ` OFFSET $${values.length + 1}`;
      values.push(options.offset);
    }
    
    const result = await query(sql, values);
    return result.rows;
  }

  async findById(id) {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = $1`;
    const result = await query(sql, [id]);
    return result.rows[0];
  }

  async create(data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    
    const sql = `
      INSERT INTO ${this.tableName} (${keys.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;
    
    const result = await query(sql, values);
    return result.rows[0];
  }

  async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
    
    const sql = `
      UPDATE ${this.tableName}
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await query(sql, [id, ...values]);
    return result.rows[0];
  }

  async delete(id, softDelete = true) {
    let sql;
    if (softDelete && await this.hasColumn('deleted_at')) {
      sql = `UPDATE ${this.tableName} SET deleted_at = NOW() WHERE id = $1 RETURNING *`;
    } else {
      sql = `DELETE FROM ${this.tableName} WHERE id = $1 RETURNING *`;
    }
    const result = await query(sql, [id]);
    return result.rows[0];
  }

  buildWhereClause(conditions, values) {
    const clauses = [];
    let index = values.length + 1;
    
    for (const [key, value] of Object.entries(conditions)) {
      clauses.push(`${key} = $${index}`);
      values.push(value);
      index++;
    }
    
    return clauses.join(' AND ');
  }

  async hasColumn(columnName) {
    const sql = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    `;
    const result = await query(sql, [this.tableName, columnName]);
    return result.rows.length > 0;
  }
}

export default BaseModel;
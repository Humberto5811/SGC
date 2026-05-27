// src/database/JS_db.js
import pkg from 'pg';
const { Pool } = pkg;
import connectionConfig from './connection.js';

const pool = new Pool(connectionConfig);

export default {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool: pool
};
// src/database/db.js
import pkg from 'pg';
import connectionConfig from './connection.js';

const { Pool } = pkg;

const pool = new Pool(connectionConfig);

// Probar conexión
pool.on('connect', () => {
  console.log('✅ Conectado a la base de datos exitosamente');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en la base de datos:', err);
});

// Exportar funciones para consultas
export const query = (text, params) => pool.query(text, params);
export const getClient = () => pool.connect();
export default pool;
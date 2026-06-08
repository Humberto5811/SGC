// Pool de conexiones a PostgreSQL.
// El pool reutiliza conexiones para soportar muchos usuarios concurrentes
// sin abrir una conexión nueva por cada request.
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// pg interpreta NUMERIC/BIGINT como string por defecto para no perder precisión.
// Para precio_unitario preferimos number en el JSON; lo parseamos en las queries.
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'sgc',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err.stack || err);
});

export async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    err.query = text;
    throw err;
  }
}

export async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  client.query = async (...args) => {
    try {
      return await originalQuery(...args);
    } catch (err) {
      err.query = typeof args[0] === 'string' ? args[0] : undefined;
      throw err;
    }
  };
  return client;
}

export default pool;

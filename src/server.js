// server.js
import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'postgres',        // tu usuario de PostgreSQL
  host: 'localhost',
  database: 'sgc',         // tu base de datos
  password: '1234',        // tu contraseña
  port: 5432,
});

const app = express();
app.use(express.json());

// Ruta raíz con HTML amigable
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Servidor SGC</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #f8f9fa; }
          h2 { color: #007bff; }
          ul { line-height: 1.8; }
          a { text-decoration: none; color: #007bff; }
        </style>
      </head>
      <body>
        <h2>✅ Servidor SGC activo</h2>
        <p>Usa las siguientes rutas para obtener datos:</p>
        <ul>
          <li><a href="/api/glosas">/api/glosas</a></li>
          <li><a href="/api/glosas-bienes">/api/glosas-bienes</a></li>
          <li><a href="/api/entregas">/api/entregas</a></li>
          <li><a href="/api/servicios">/api/servicios</a></li>
        </ul>
      </body>
    </html>
  `);
});

// Endpoint para listar glosas
app.get('/api/glosas', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM glosas_bienes ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('[Error en /api/glosas]', err);
    res.status(500).send('Error en el servidor');
  }
});

// Alias para compatibilidad con frontend
app.get('/api/glosas-bienes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM glosas_bienes ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('[Error en /api/glosas-bienes]', err);
    res.status(500).send('Error en el servidor');
  }
});

// Endpoint para listar entregas
app.get('/api/entregas', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM glosas_entregas ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('[Error en /api/entregas]', err);
    res.status(500).send('Error en el servidor');
  }
});

// Endpoint para listar servicios
app.get('/api/servicios', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM glosas_servicios ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('[Error en /api/servicios]', err);
    res.status(500).send('Error en el servidor');
  }
});

app.listen(3000, () => {
  console.log('🚀 Servidor backend en http://localhost:3000');
});

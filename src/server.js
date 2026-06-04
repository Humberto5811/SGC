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
// ============================================
// NUEVOS ENDPOINTS PARA REQUERIMIENTOS (solo agregar esto)
// ============================================

// Guardar requerimiento
app.post('/api/requerimientos', async (req, res) => {
  try {
    const { tipo, descripcion, codigo_sigamef, detalles, usuario_id } = req.body;
    
    // Generar número correlativo automático
    const correlativoResult = await pool.query(
      "SELECT COALESCE(MAX(CAST(correlativo AS INTEGER)), 0) + 1 as nuevo FROM requerimientos"
    );
    const nuevoCorrelativo = correlativoResult.rows[0].nuevo;
    const correlativoFormateado = nuevoCorrelativo.toString().padStart(5, '0');
    
    const result = await pool.query(
      `INSERT INTO requerimientos 
       (correlativo, tipo, descripcion, codigo_sigamef, usuario_id, fecha_creacion, estado) 
       VALUES ($1, $2, $3, $4, $5, NOW(), 'Pendiente') 
       RETURNING *`,
      [correlativoFormateado, tipo, descripcion, codigo_sigamef, usuario_id || 1]
    );
    
    if (detalles && detalles.length > 0) {
      for (const detalle of detalles) {
        await pool.query(
          `INSERT INTO requerimiento_detalles 
           (requerimiento_id, descripcion, cantidad, precio_unitario, subtotal) 
           VALUES ($1, $2, $3, $4, $5)`,
          [result.rows[0].id, detalle.descripcion, detalle.cantidad, detalle.precio_unitario, detalle.cantidad * detalle.precio_unitario]
        );
      }
    }
    
    res.status(201).json({ success: true, message: 'Guardado', correlativo: correlativoFormateado });
  } catch (err) {
    console.error('[Error POST requerimientos]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Listar requerimientos
app.get('/api/requerimientos', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, COALESCE(SUM(rd.cantidad * rd.precio_unitario), 0) as valor_total
       FROM requerimientos r
       LEFT JOIN requerimiento_detalles rd ON r.id = rd.requerimiento_id
       GROUP BY r.id ORDER BY r.id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[Error GET requerimientos]', err);
    res.status(500).json({ error: err.message });
  }
});

// Eliminar requerimiento
app.delete('/api/requerimientos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM requerimiento_detalles WHERE requerimiento_id = $1', [req.params.id]);
    await pool.query('DELETE FROM requerimientos WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Error DELETE requerimientos]', err);
    res.status(500).json({ error: err.message });
  }
});

// Editar requerimiento
app.put('/api/requerimientos/:id', async (req, res) => {
  try {
    const { tipo, descripcion, codigo_sigamef, detalles } = req.body;
    await pool.query('UPDATE requerimientos SET tipo=$1, descripcion=$2, codigo_sigamef=$3 WHERE id=$4', [tipo, descripcion, codigo_sigamef, req.params.id]);
    await pool.query('DELETE FROM requerimiento_detalles WHERE requerimiento_id = $1', [req.params.id]);
    if (detalles && detalles.length > 0) {
      for (const detalle of detalles) {
        await pool.query(`INSERT INTO requerimiento_detalles (requerimiento_id, descripcion, cantidad, precio_unitario, subtotal) VALUES ($1,$2,$3,$4,$5)`, [req.params.id, detalle.descripcion, detalle.cantidad, detalle.precio_unitario, detalle.cantidad * detalle.precio_unitario]);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Error PUT requerimientos]', err);
    res.status(500).json({ error: err.message });
  }
});
app.listen(3000, () => {
  console.log('🚀 Servidor backend en http://localhost:3000');
});

// server.js
import express from 'express';
import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();
const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'sgc',
  password: process.env.DB_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
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
          <li><a href="/api/carreras">/api/carreras</a></li>
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

// Endpoint para carreras profesionales (GET paginado + GET all)
app.get('/api/carreras', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '50', 10)));
    const offset = (page - 1) * pageSize;
    const search = (req.query.search || '').trim();

    let where = '';
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      where = `WHERE nombre_carrera ILIKE $1 OR tipo_carrera ILIKE $1`;
    }

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM carreras_profesionales ${where}`, params);
    const total = countResult.rows[0].total;

    params.push(pageSize);
    params.push(offset);
    const dataResult = await pool.query(
      `SELECT * FROM carreras_profesionales ${where} ORDER BY nombre_carrera ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ data: dataResult.rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (err) {
    console.error('[Error en /api/carreras]', err);
    res.status(500).json({ error: err.message });
  }
});

// CRUD endpoints para carreras
app.post('/api/carreras', async (req, res) => {
  try {
    const { nombre_carrera, tipo_carrera, estado } = req.body;
    const result = await pool.query(
      `INSERT INTO carreras_profesionales (nombre_carrera, tipo_carrera, estado) VALUES ($1, $2, $3) RETURNING *`,
      [nombre_carrera, tipo_carrera || 'Profesional', estado !== undefined ? estado : true]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[Error POST carreras]', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/carreras/:id', async (req, res) => {
  try {
    const { nombre_carrera, tipo_carrera, estado } = req.body;
    const sets = [];
    const vals = [];
    if (nombre_carrera !== undefined) { sets.push(`nombre_carrera = $${vals.length + 1}`); vals.push(nombre_carrera); }
    if (tipo_carrera !== undefined) { sets.push(`tipo_carrera = $${vals.length + 1}`); vals.push(tipo_carrera); }
    if (estado !== undefined) { sets.push(`estado = $${vals.length + 1}`); vals.push(estado); }
    sets.push(`updated_at = NOW()`);
    vals.push(req.params.id);
    const result = await pool.query(
      `UPDATE carreras_profesionales SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!result.rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Error PUT carreras]', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/carreras/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM carreras_profesionales WHERE id = $1 RETURNING *', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true, deleted: result.rows[0] });
  } catch (err) {
    console.error('[Error DELETE carreras]', err);
    res.status(500).json({ error: err.message });
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
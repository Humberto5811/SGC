// Servidor API SGC (Express + PostgreSQL)
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import pkg from 'pg';

import { runMigrations } from './migrate.js';
import { crudRouter } from './crud.js';
import authRouter from './routes/auth.js';
import catalogoRouter from './routes/catalogo.js';
import glosasRouter from './routes/glosas.js';
import glosasBienesRouter from './routes/glosasBienes.js';
import entidadRouter from './routes/entidad.js';
import fichanetRouter from './routes/fichanet.js';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'sgc',
  password: process.env.DB_PASS || '1234',
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(morgan('tiny'));

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Rutas principales
app.use('/api/auth', authRouter);
app.use('/api/catalogo', catalogoRouter);
app.use('/api/glosas', glosasRouter);
app.use('/api/glosas-bienes', glosasBienesRouter);
app.use('/api/entidad', entidadRouter);
app.use('/api/fichanet', fichanetRouter);

// Endpoints adicionales de glosas
app.get('/api/entregas', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM glosas_entregas ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('[Error en /api/entregas]', err);
    res.status(500).send('Error en el servidor');
  }
});

app.get('/api/servicios', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM glosas_servicios ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('[Error en /api/servicios]', err);
    res.status(500).send('Error en el servidor');
  }
});

// CRUD genéricos para submódulos simples
app.use('/api/fichas', crudRouter({
  table: 'fichas_tecnicas',
  columns: ['codigo', 'descripcion', 'unidad_medida', 'version', 'estado', 'observaciones'],
  searchCols: ['codigo', 'descripcion'],
}));
app.use('/api/configuracion', crudRouter({
  table: 'configuracion_doc',
  columns: ['objeto', 'nombre', 'descripcion', 'obligatorio', 'estado'],
  searchCols: ['objeto', 'nombre'],
}));
app.use('/api/metas', crudRouter({
  table: 'metas',
  columns: ['codigo', 'nombre', 'descripcion', 'estado'],
  searchCols: ['codigo', 'nombre'],
}));
app.use('/api/areas', crudRouter({
  table: 'areas',
  columns: ['codigo', 'nombre', 'responsable', 'estado'],
  searchCols: ['codigo', 'nombre', 'responsable'],
}));
app.use('/api/ordenes', crudRouter({
  table: 'ordenes',
  columns: ['numero', 'tipo', 'proveedor', 'ruc', 'monto', 'fecha', 'estado'],
  searchCols: ['numero', 'proveedor', 'ruc'],
}));
app.use('/api/siaf', crudRouter({
  table: 'siaf',
  columns: ['expediente', 'ciclo', 'fase', 'meta', 'clasificador', 'fuente_financ', 'monto', 'fecha', 'estado'],
  searchCols: ['expediente', 'meta', 'clasificador'],
}));
app.use('/api/logotipos', crudRouter({
  table: 'logotipos',
  columns: ['nombre', 'tipo', 'data_url', 'estado'],
  searchCols: ['nombre', 'tipo'],
}));

// Manejador de errores centralizado
app.use((err, _req, res, _next) => {
  console.error('[api] Error:', err.message);
  res.status(500).json({ error: 'Error interno del servidor', detail: err.message });
});

async function start() {
  try {
    await runMigrations();
  } catch (err) {
    console.error('[db] No se pudo aplicar migraciones:', err.message);
    console.error('     Verifica que PostgreSQL esté corriendo y las credenciales en .env');
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`[api] Servidor SGC escuchando en http://localhost:${PORT}`);
  });
}

start();

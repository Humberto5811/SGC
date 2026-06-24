// Servidor API SGC (Express + PostgreSQL)
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import pkg from 'pg';

import { runMigrations } from './migrate.js';
import { crudRouter } from './crud.js';
import authRouter from './routes/auth.js';
import catalogoRouter from './routes/catalogo.js';
import glosasRouter from './routes/glosas.js';
import glosasBienesRouter from './routes/glosasBienes.js';
import glosasServiciosRouter from './routes/glosasServicios.js';
import glosasLocadoresRouter from './routes/glosasLocadores.js';
import entidadRouter from './routes/entidad.js';
import fichanetRouter from './routes/fichanet.js';
import pedidosSigamefRouter from './routes/pedidosSigamef.js';
import adjuntosRouter from './routes/adjuntos.js';
import programacionRouter from './routes/programacion.js';
import usuariosRouter from './routes/usuarios.js';
import requerimientosEspecialRouter from './routes/requerimientosEspecial.js';
import { inicializarTrazabilidad, registrarMovimiento, inferAccion } from './lib/trazabilidad.js';
import { trazaFromObservacionEntry } from './lib/observacionDestino.js';

function extractObservacionTrazabilidad(payloadStr, estadoAnterior, estadoNuevo) {
  try {
    const p = JSON.parse(payloadStr || '{}');
    const obs = Array.isArray(p.observaciones) ? p.observaciones : [];
    if (/observ/i.test(String(estadoNuevo || ''))) {
      const last = obs[obs.length - 1];
      if (last?.motivo) return trazaFromObservacionEntry(last);
    }
    if (/tr[aá]mite/i.test(String(estadoNuevo || '')) && /observ/i.test(String(estadoAnterior || ''))) {
      for (let i = obs.length - 1; i >= 0; i -= 1) {
        if (obs[i].subsanacion) return trazaFromObservacionEntry(obs[i]);
      }
    }
  } catch (_) {}
  return '';
}
import contratacionesRouter from './routes/contrataciones.js';
import invitacionesRouter from './routes/invitaciones.js';
import portalRouter, { portalAnalistaRouter } from './routes/portal.js';
import requireAuth from './middleware/requireAuth.js';

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
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(helmet());
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://localhost:5177,http://localhost:5178,http://localhost:3000')
  .split(',')
  .map((o) => o.trim());
app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Origen no permitido por CORS'));
  },
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '100mb' }));
app.use(morgan('tiny'));

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Limitar intentos de login para prevenir fuerza bruta
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos. Intente de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==================== RUTAS PÚBLICAS ====================
app.use('/api/auth', loginLimiter, authRouter);
app.use('/api/portal', portalRouter);

// ==================== CARRERAS PROFESIONALES (RUTAS PÚBLICAS - SIN AUTENTICACIÓN) ====================

// GET /api/carreras - Listar carreras con paginación
app.get('/api/carreras', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 50, search = '' } = req.query;
    const offset = (page - 1) * pageSize;
    const searchTerm = `%${search}%`;
    
    let query = `
      SELECT id, nombre_carrera, tipo_carrera, estado, 
             created_at, updated_at 
      FROM carreras_profesionales 
      WHERE estado = true
    `;
    let countQuery = `SELECT COUNT(*) as total FROM carreras_profesionales WHERE estado = true`;
    let params = [];
    
    if (search) {
      query += ` AND (nombre_carrera ILIKE $1 OR tipo_carrera ILIKE $1)`;
      countQuery += ` AND (nombre_carrera ILIKE $1 OR tipo_carrera ILIKE $1)`;
      params.push(searchTerm);
    }
    
    query += ` ORDER BY nombre_carrera ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(pageSize), parseInt(offset));
    
    const result = await pool.query(query, params);
    const totalResult = await pool.query(countQuery, params.slice(0, search ? 1 : 0));
    
    res.json({
      data: result.rows,
      total: parseInt(totalResult.rows[0].total),
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (err) {
    console.error('Error GET /api/carreras:', err);
    next(err);
  }
});

// GET /api/carreras/:id - Obtener una carrera
app.get('/api/carreras/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM carreras_profesionales WHERE id = $1 AND estado = true',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Carrera no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/carreras - Crear nueva carrera
app.post('/api/carreras', async (req, res, next) => {
  try {
    const { nombre_carrera, tipo_carrera = 'Profesional' } = req.body;
    
    if (!nombre_carrera || nombre_carrera.trim() === '') {
      return res.status(400).json({ error: 'El nombre de la carrera es requerido' });
    }
    
    const result = await pool.query(
      'INSERT INTO carreras_profesionales (nombre_carrera, tipo_carrera) VALUES ($1, $2) RETURNING *',
      [nombre_carrera.trim(), tipo_carrera]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe una carrera con ese nombre' });
    }
    next(err);
  }
});

// PUT /api/carreras/:id - Actualizar carrera
app.put('/api/carreras/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre_carrera, tipo_carrera } = req.body;
    
    const result = await pool.query(
      `UPDATE carreras_profesionales 
       SET nombre_carrera = $1, tipo_carrera = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 AND estado = true 
       RETURNING *`,
      [nombre_carrera, tipo_carrera, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Carrera no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe una carrera con ese nombre' });
    }
    next(err);
  }
});

// DELETE /api/carreras/:id - Eliminar (soft delete)
app.delete('/api/carreras/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE carreras_profesionales SET estado = false WHERE id = $1 AND estado = true RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Carrera no encontrada' });
    }
    res.json({ message: 'Carrera eliminada correctamente' });
  } catch (err) {
    next(err);
  }
});

// POST /api/carreras/import - Importación masiva
app.post('/api/carreras/import', async (req, res, next) => {
  try {
    const { rows, mode = 'append' } = req.body;
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: 'No hay registros para importar.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (mode === 'replace') {
        await client.query('DELETE FROM carreras_profesionales');
      }
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const values = [];
        const placeholders = batch.map((r, idx) => {
          const nombre = String(r.nombre_carrera || r.nombre || '').trim();
          const tipo = String(r.tipo_carrera || r.tipo || 'Profesional').trim();
          if (!nombre) return null;
          values.push(nombre, tipo);
          const base = idx * 2;
          return `($${base + 1}, $${base + 2})`;
        }).filter(Boolean);
        if (placeholders.length) {
          await client.query(
            `INSERT INTO carreras_profesionales (nombre_carrera, tipo_carrera) VALUES ${placeholders.join(', ')} ON CONFLICT (nombre_carrera) DO NOTHING`,
            values
          );
          inserted += placeholders.length;
        }
      }
      await client.query('COMMIT');
      res.json({ success: true, inserted });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error POST /api/carreras/import:', err);
    next(err);
  }
});

// ==================== FIN CARRERAS PROFESIONALES ====================

// ==================== RUTAS PROTEGIDAS (requieren autenticación) ====================
app.use('/api', requireAuth);
app.use('/api/catalogo', catalogoRouter);
app.use('/api/glosas', glosasRouter);
app.use('/api/glosas-bienes', glosasBienesRouter);
app.use('/api/glosas-servicios', glosasServiciosRouter);
app.use('/api/glosas-locadores', glosasLocadoresRouter);
app.use('/api/entidad', entidadRouter);
app.use('/api/fichanet', fichanetRouter);
app.use('/api/pedidos-sigamef', pedidosSigamefRouter);
app.use('/api/programacion', programacionRouter);
app.use('/api/usuarios', usuariosRouter);

// Endpoints adicionales de glosas
app.get('/api/entregas', async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM glosas_entregas ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { next(err); }
});

app.get('/api/servicios', async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM glosas_servicios ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { next(err); }
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

// Rutas especiales para requerimientos ANTES del CRUD genérico
app.use('/api/requerimientos', requerimientosEspecialRouter);

// Contrataciones (DEC y Programación)
app.use('/api/contrataciones', contratacionesRouter);
app.use('/api/contrataciones/invitaciones', invitacionesRouter);
app.use('/api/contrataciones/portal-analista', portalAnalistaRouter);

app.use('/api/requerimientos', crudRouter({
  table: 'requerimientos',
  columns: ['tipo', 'codigo', 'cmn', 'denominacion', 'area', 'responsable', 'estado', 'payload', 'usuario_modificacion'],
  searchCols: ['codigo', 'denominacion', 'area', 'responsable', 'tipo'],
  orderBy: 'id DESC',
  afterCreate: async (row, body) => {
    await inicializarTrazabilidad(row.id, body.usuario_modificacion || 'Sistema');
  },
  afterUpdate: async (row, prev, body) => {
    if (body.estado && body.estado !== prev.estado) {
      const observacion = extractObservacionTrazabilidad(
        body.payload != null ? body.payload : prev.payload,
        prev.estado,
        body.estado,
      );
      await registrarMovimiento({
        requerimientoId: row.id,
        estadoNuevo: body.estado,
        usuario: body.usuario_modificacion || prev.usuario_modificacion || 'Sistema',
        accion: inferAccion(prev.estado, body.estado),
        observacion,
      });
    } else if (body.payload != null && String(body.payload) !== String(prev.payload || '')) {
      await registrarMovimiento({
        requerimientoId: row.id,
        estadoNuevo: row.estado || prev.estado,
        usuario: body.usuario_modificacion || prev.usuario_modificacion || 'Sistema',
        accion: 'editado',
        observacion: 'Actualización del expediente',
      });
    }
  },
}));

// Adjuntos
app.use('/api/adjuntos', adjuntosRouter);

// Manejador de errores centralizado
app.use((err, _req, res, _next) => {
  console.error('[api] Error:', err.stack || err);
  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(status).json({
    error: 'Error interno del servidor',
    ...(isProduction ? {} : { detail: err.message }),
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[process] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[process] Uncaught Exception:', err.stack || err);
  process.exit(1);
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
    console.log('[api] Invitaciones: validación cronograma v2 (consultas dentro del plazo de cotización)');
  });
}

start();
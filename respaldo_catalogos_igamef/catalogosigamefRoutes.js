// Rutas para Catálogos IGAMEF
const service = require('../services/catalogosigamefService');

async function catalogosigamefRoutes(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // GET /api/catalogos-igamef - Obtener todos
  if (pathname === '/api/catalogos-igamef' && method === 'GET') {
    try {
      const catalogos = await service.getAll();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: catalogos }));
      return true;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/catalogos-igamef/activos - Obtener solo activos
  if (pathname === '/api/catalogos-igamef/activos' && method === 'GET') {
    try {
      const catalogos = await service.getActivos();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: catalogos }));
      return true;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // GET /api/catalogos-igamef/:id - Obtener uno
  const getOneMatch = pathname.match(/^\/api\/catalogos-igamef\/(\d+)$/);
  if (getOneMatch && method === 'GET') {
    try {
      const id = parseInt(getOneMatch[1]);
      const catalogo = await service.getById(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: catalogo }));
      return true;
    } catch (error) {
      const status = error.message === 'Catálogo no encontrado' ? 404 : 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // POST /api/catalogos-igamef - Crear
  if (pathname === '/api/catalogos-igamef' && method === 'POST') {
    try {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const nuevo = await service.create(data);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: nuevo }));
        } catch (error) {
          const status = error.message.includes('requeridos') || error.message.includes('ya existe') ? 400 : 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return true;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // PUT /api/catalogos-igamef/:id - Actualizar
  const putMatch = pathname.match(/^\/api\/catalogos-igamef\/(\d+)$/);
  if (putMatch && method === 'PUT') {
    try {
      const id = parseInt(putMatch[1]);
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const actualizado = await service.update(id, data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: actualizado }));
        } catch (error) {
          const status = error.message === 'Catálogo no encontrado' ? 404 : 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return true;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // DELETE /api/catalogos-igamef/:id - Eliminar
  const deleteMatch = pathname.match(/^\/api\/catalogos-igamef\/(\d+)$/);
  if (deleteMatch && method === 'DELETE') {
    try {
      const id = parseInt(deleteMatch[1]);
      const eliminado = await service.delete(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: eliminado }));
      return true;
    } catch (error) {
      const status = error.message === 'Catálogo no encontrado' ? 404 : 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  // PATCH /api/catalogos-igamef/:id/toggle - Cambiar estado
  if (pathname.match(/^\/api\/catalogos-igamef\/\d+\/toggle$/) && method === 'PATCH') {
    const id = parseInt(pathname.split('/')[4]);
    try {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { activo } = JSON.parse(body);
          const actualizado = await service.toggleStatus(id, activo);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: actualizado }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return true;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  return false; // No manejó esta ruta
}

module.exports = catalogosigamefRoutes;
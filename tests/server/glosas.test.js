import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

const { query } = await import('../../server/db.js');
const routerMod = await import('../../server/routes/glosas.js');
const router = routerMod.default;

// Glosas router uses mergeParams, handlers have [validTipo, actualHandler]
function findHandler(router, method, path) {
  const layer = router.stack.find(
    (l) => l.route && l.route.methods[method] && l.route.path === path
  );
  if (!layer) throw new Error(`No handler for ${method.toUpperCase()} ${path}`);
  const stack = layer.route.stack;
  // Return a function that runs all middleware in sequence
  return async (req, res, next) => {
    let idx = 0;
    const runNext = async (err) => {
      if (err) return next(err);
      if (idx >= stack.length) return;
      const fn = stack[idx++].handle;
      await fn(req, res, runNext);
    };
    await runNext();
  };
}

function mockReq(overrides = {}) {
  return { query: {}, params: {}, body: {}, ...overrides };
}

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

describe('Glosas routes', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('validTipo middleware', () => {
    it('rejects invalid tipo', async () => {
      const handler = findHandler(router, 'get', '/:tipo');
      const req = mockReq({ params: { tipo: 'invalid' } });
      const res = mockRes();
      await handler(req, res, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('inválido');
    });
  });

  describe('GET /:tipo', () => {
    it('returns paginated glosas', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, tipo: 'bienes', codigo: 'B01' }] });

      const handler = findHandler(router, 'get', '/:tipo');
      const req = mockReq({ params: { tipo: 'bienes' } });
      const res = mockRes();
      await handler(req, res, vi.fn());

      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('applies search filter', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const handler = findHandler(router, 'get', '/:tipo');
      const req = mockReq({ params: { tipo: 'servicios' }, query: { search: 'test' } });
      const res = mockRes();
      await handler(req, res, vi.fn());

      const sql = query.mock.calls[0][0];
      expect(sql).toContain('ILIKE');
    });
  });

  describe('POST /:tipo', () => {
    it('creates a glosa', async () => {
      const created = { id: 1, tipo: 'bienes', codigo: 'B01', titulo: 'Test' };
      query.mockResolvedValueOnce({ rows: [created] });

      const handler = findHandler(router, 'post', '/:tipo');
      const req = mockReq({
        params: { tipo: 'bienes' },
        body: { codigo: 'B01', titulo: 'Test' },
      });
      const res = mockRes();
      await handler(req, res, vi.fn());

      expect(res.statusCode).toBe(201);
      expect(res.body.tipo).toBe('bienes');
      const sql = query.mock.calls[0][0];
      expect(sql).toContain('INSERT INTO glosas');
    });
  });

  describe('PUT /:tipo/:id', () => {
    it('updates a glosa', async () => {
      const updated = { id: 1, tipo: 'bienes', titulo: 'Updated' };
      query.mockResolvedValueOnce({ rows: [updated] });

      const handler = findHandler(router, 'put', '/:tipo/:id');
      const req = mockReq({
        params: { tipo: 'bienes', id: '1' },
        body: { titulo: 'Updated' },
      });
      const res = mockRes();
      await handler(req, res, vi.fn());

      expect(res.body.titulo).toBe('Updated');
    });

    it('returns 400 if no valid columns', async () => {
      const handler = findHandler(router, 'put', '/:tipo/:id');
      const req = mockReq({
        params: { tipo: 'bienes', id: '1' },
        body: { bad: 'x' },
      });
      const res = mockRes();
      await handler(req, res, vi.fn());

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 if not found', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const handler = findHandler(router, 'put', '/:tipo/:id');
      const req = mockReq({
        params: { tipo: 'bienes', id: '999' },
        body: { titulo: 'x' },
      });
      const res = mockRes();
      await handler(req, res, vi.fn());

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /:tipo/:id', () => {
    it('deletes a glosa', async () => {
      const deleted = { id: 1, tipo: 'bienes' };
      query.mockResolvedValueOnce({ rows: [deleted] });

      const handler = findHandler(router, 'delete', '/:tipo/:id');
      const req = mockReq({ params: { tipo: 'bienes', id: '1' } });
      const res = mockRes();
      await handler(req, res, vi.fn());

      expect(res.body.ok).toBe(true);
    });

    it('returns 404 if not found', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const handler = findHandler(router, 'delete', '/:tipo/:id');
      const req = mockReq({ params: { tipo: 'bienes', id: '999' } });
      const res = mockRes();
      await handler(req, res, vi.fn());

      expect(res.statusCode).toBe(404);
    });
  });
});

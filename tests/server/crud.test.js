import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing crudRouter
vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

const { query } = await import('../../server/db.js');
const { crudRouter } = await import('../../server/crud.js');

// Minimal Express mock helpers
function mockReq(overrides = {}) {
  return { query: {}, params: {}, body: {}, ...overrides };
}

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

function findHandler(router, method, pathPattern) {
  const layer = router.stack.find(
    (l) => l.route && l.route.methods[method] && l.route.path === pathPattern
  );
  if (!layer) throw new Error(`No handler for ${method.toUpperCase()} ${pathPattern}`);
  return layer.route.stack[0].handle;
}

describe('crudRouter', () => {
  const cfg = {
    table: 'items',
    columns: ['name', 'value'],
    searchCols: ['name'],
    orderBy: 'id',
  };
  let router;

  beforeEach(() => {
    vi.clearAllMocks();
    router = crudRouter(cfg);
  });

  describe('GET / (list)', () => {
    it('returns paginated data with defaults', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });

      const req = mockReq();
      const res = mockRes();
      const handler = findHandler(router, 'get', '/');
      await handler(req, res, vi.fn());

      expect(query).toHaveBeenCalledTimes(2);
      expect(res.body).toEqual({
        data: [{ id: 1 }, { id: 2 }],
        total: 2,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      });
    });

    it('applies search filter with ILIKE', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'test' }] });

      const req = mockReq({ query: { search: 'test', page: '1', pageSize: '10' } });
      const res = mockRes();
      const handler = findHandler(router, 'get', '/');
      await handler(req, res, vi.fn());

      const countCall = query.mock.calls[0];
      expect(countCall[0]).toContain('ILIKE');
      expect(countCall[1]).toContain('%test%');
      expect(res.body.total).toBe(1);
    });

    it('clamps page to minimum 1', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ query: { page: '-5' } });
      const res = mockRes();
      const handler = findHandler(router, 'get', '/');
      await handler(req, res, vi.fn());

      expect(res.body.page).toBe(1);
    });

    it('clamps pageSize between 1 and 500', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ query: { pageSize: '9999' } });
      const res = mockRes();
      const handler = findHandler(router, 'get', '/');
      await handler(req, res, vi.fn());

      expect(res.body.pageSize).toBe(500);
    });

    it('calls next on query error', async () => {
      const err = new Error('db error');
      query.mockRejectedValueOnce(err);

      const req = mockReq();
      const res = mockRes();
      const next = vi.fn();
      const handler = findHandler(router, 'get', '/');
      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('GET /:id', () => {
    it('returns a single record', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 5, name: 'item' }] });

      const req = mockReq({ params: { id: '5' } });
      const res = mockRes();
      const handler = findHandler(router, 'get', '/:id');
      await handler(req, res, vi.fn());

      expect(res.body).toEqual({ id: 5, name: 'item' });
    });

    it('returns 404 when not found', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ params: { id: '999' } });
      const res = mockRes();
      const handler = findHandler(router, 'get', '/:id');
      await handler(req, res, vi.fn());

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('No encontrado');
    });
  });

  describe('POST / (create)', () => {
    it('inserts a record with valid columns', async () => {
      const created = { id: 1, name: 'new', value: '42' };
      query.mockResolvedValueOnce({ rows: [created] });

      const req = mockReq({ body: { name: 'new', value: '42' } });
      const res = mockRes();
      const handler = findHandler(router, 'post', '/');
      await handler(req, res, vi.fn());

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(created);
      const sql = query.mock.calls[0][0];
      expect(sql).toContain('INSERT INTO items');
      expect(sql).toContain('RETURNING *');
    });

    it('ignores columns not in the whitelist', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'only' }] });

      const req = mockReq({ body: { name: 'only', hacked: 'DROP TABLE' } });
      const res = mockRes();
      const handler = findHandler(router, 'post', '/');
      await handler(req, res, vi.fn());

      const sql = query.mock.calls[0][0];
      expect(sql).not.toContain('hacked');
    });

    it('returns 400 if no valid columns', async () => {
      const req = mockReq({ body: { unknown: 'x' } });
      const res = mockRes();
      const handler = findHandler(router, 'post', '/');
      await handler(req, res, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Sin datos válidos');
    });
  });

  describe('PUT /:id (update)', () => {
    it('updates a record', async () => {
      const updated = { id: 1, name: 'updated' };
      query.mockResolvedValueOnce({ rows: [updated] });

      const req = mockReq({ params: { id: '1' }, body: { name: 'updated' } });
      const res = mockRes();
      const handler = findHandler(router, 'put', '/:id');
      await handler(req, res, vi.fn());

      expect(res.body).toEqual(updated);
      const sql = query.mock.calls[0][0];
      expect(sql).toContain('UPDATE items SET');
      expect(sql).toContain('updated_at = NOW()');
    });

    it('returns 400 if no valid columns', async () => {
      const req = mockReq({ params: { id: '1' }, body: { bad: 'x' } });
      const res = mockRes();
      const handler = findHandler(router, 'put', '/:id');
      await handler(req, res, vi.fn());

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 if record not found', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ params: { id: '999' }, body: { name: 'x' } });
      const res = mockRes();
      const handler = findHandler(router, 'put', '/:id');
      await handler(req, res, vi.fn());

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('deletes a record and returns it', async () => {
      const deleted = { id: 1, name: 'gone' };
      query.mockResolvedValueOnce({ rows: [deleted] });

      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();
      const handler = findHandler(router, 'delete', '/:id');
      await handler(req, res, vi.fn());

      expect(res.body).toEqual({ ok: true, deleted });
    });

    it('returns 404 if record not found', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ params: { id: '999' } });
      const res = mockRes();
      const handler = findHandler(router, 'delete', '/:id');
      await handler(req, res, vi.fn());

      expect(res.statusCode).toBe(404);
    });
  });
});

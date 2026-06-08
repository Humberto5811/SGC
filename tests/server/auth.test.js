import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

const { query } = await import('../../server/db.js');

// Import the router and dig out the POST /login handler
const routerMod = await import('../../server/routes/auth.js');
const router = routerMod.default;

function findHandler(router, method, path) {
  const layer = router.stack.find(
    (l) => l.route && l.route.methods[method] && l.route.path === path
  );
  if (!layer) throw new Error(`No handler for ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

function mockReq(body = {}) {
  return { body };
}

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

describe('POST /login', () => {
  let handler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = findHandler(router, 'post', '/login');
  });

  it('returns 400 when DNI is missing', async () => {
    const res = mockRes();
    await handler(mockReq({}), res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('DNI');
  });

  it('returns 401 when user not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = mockRes();
    await handler(mockReq({ dni: 'unknown' }), res, vi.fn());

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns user data on valid login without password (compat mode)', async () => {
    const user = { id: 1, dni: '12345', nombre: 'Test', rol: 'admin', email: 't@t.com', activo: true };
    query.mockResolvedValueOnce({ rows: [user] });

    const res = mockRes();
    await handler(mockReq({ dni: '12345' }), res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toEqual({
      id: 1,
      dni: '12345',
      nombre: 'Test',
      rol: 'admin',
      email: 't@t.com',
    });
  });

  it('returns 401 on wrong password', async () => {
    const hash = await bcrypt.hash('correct', 10);
    const user = { id: 1, dni: '12345', nombre: 'Test', rol: 'admin', email: 't@t.com', password_hash: hash };
    query.mockResolvedValueOnce({ rows: [user] });

    const res = mockRes();
    await handler(mockReq({ dni: '12345', password: 'wrong' }), res, vi.fn());

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns user data on correct password', async () => {
    const hash = await bcrypt.hash('secret', 10);
    const user = { id: 1, dni: '12345', nombre: 'Test', rol: 'admin', email: 't@t.com', password_hash: hash };
    query.mockResolvedValueOnce({ rows: [user] });

    const res = mockRes();
    await handler(mockReq({ dni: '12345', password: 'secret' }), res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.dni).toBe('12345');
    // password_hash must not leak to client
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('calls next on db error', async () => {
    const err = new Error('db fail');
    query.mockRejectedValueOnce(err);

    const res = mockRes();
    const next = vi.fn();
    await handler(mockReq({ dni: 'x' }), res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

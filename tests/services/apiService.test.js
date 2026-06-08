import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const { api } = await import('../../src/services/apiService.js');

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

describe('apiService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('api.get', () => {
    it('makes a GET request to /api + path', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));
      const data = await api.get('/items/1');
      expect(fetchMock).toHaveBeenCalledWith('/api/items/1', expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }));
      expect(data).toEqual({ id: 1 });
    });
  });

  describe('api.post', () => {
    it('sends JSON body with POST method', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));
      await api.post('/items', { name: 'test' });
      const [, opts] = fetchMock.mock.calls[0];
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ name: 'test' });
    });
  });

  describe('api.put', () => {
    it('sends JSON body with PUT method', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));
      await api.put('/items/1', { name: 'updated' });
      const [, opts] = fetchMock.mock.calls[0];
      expect(opts.method).toBe('PUT');
    });
  });

  describe('api.del', () => {
    it('sends DELETE method', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
      await api.del('/items/1');
      const [, opts] = fetchMock.mock.calls[0];
      expect(opts.method).toBe('DELETE');
    });
  });

  describe('api.list', () => {
    it('builds query params for pagination', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], total: 0 }));
      await api.list('items', { page: 2, pageSize: 10, search: 'test' });
      const url = fetchMock.mock.calls[0][0];
      expect(url).toContain('/api/items?');
      expect(url).toContain('page=2');
      expect(url).toContain('pageSize=10');
      expect(url).toContain('search=test');
    });

    it('uses defaults when no params given', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
      await api.list('items');
      const url = fetchMock.mock.calls[0][0];
      expect(url).toContain('page=1');
      expect(url).toContain('pageSize=50');
    });
  });

  describe('api.create / api.update / api.remove', () => {
    it('create posts to resource path', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));
      await api.create('items', { name: 'new' });
      expect(fetchMock.mock.calls[0][0]).toBe('/api/items');
    });

    it('update puts to resource/:id', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));
      await api.update('items', 1, { name: 'upd' });
      expect(fetchMock.mock.calls[0][0]).toBe('/api/items/1');
    });

    it('remove deletes resource/:id', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
      await api.remove('items', 1);
      expect(fetchMock.mock.calls[0][0]).toBe('/api/items/1');
    });
  });

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Not found' }, 404));
      await expect(api.get('/missing')).rejects.toThrow('Not found');
    });

    it('returns null on 204 No Content', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
      const result = await api.get('/no-content');
      expect(result).toBeNull();
    });
  });
});

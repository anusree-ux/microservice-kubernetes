jest.mock('pg', () => {
  const mPool = { query: jest.fn() };
  return { Pool: jest.fn(() => mPool) };
});

global.fetch = jest.fn();

const { app, pool } = require('../app');
const request = require('supertest');

describe('Order Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('returns 200 when DB is reachable', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /orders', () => {
    it('returns a list of orders', async () => {
      const mockOrders = [{ id: 1, user_id: 1, item: 'DevOps Handbook', price: 29.99 }];
      pool.query.mockResolvedValueOnce({ rows: mockOrders });
      const res = await request(app).get('/orders');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockOrders);
    });
  });

  describe('GET /orders/:id', () => {
    it('returns an order enriched with user data', async () => {
      const mockOrder = { id: 1, user_id: 1, item: 'Mug', price: 12.5 };
      const mockUser = { id: 1, name: 'Alex', email: 'alex@example.com' };
      pool.query.mockResolvedValueOnce({ rows: [mockOrder] });
      fetch.mockResolvedValueOnce({ ok: true, json: async () => mockUser });

      const res = await request(app).get('/orders/1');
      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(mockUser);
    });

    it('returns order with fallback when user-service is unreachable', async () => {
      const mockOrder = { id: 1, user_id: 1, item: 'Mug', price: 12.5 };
      pool.query.mockResolvedValueOnce({ rows: [mockOrder] });
      fetch.mockRejectedValueOnce(new Error('network error'));

      const res = await request(app).get('/orders/1');
      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({ error: 'Could not resolve user details' });
    });

    it('returns 404 when order not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/orders/999');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /orders', () => {
    it('creates an order and returns 201', async () => {
      const newOrder = { id: 3, user_id: 1, item: 'Sticker', price: 2.5 };
      pool.query.mockResolvedValueOnce({ rows: [newOrder] });
      const res = await request(app)
        .post('/orders')
        .send({ user_id: 1, item: 'Sticker', price: 2.5 });
      expect(res.status).toBe(201);
      expect(res.body).toEqual(newOrder);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app).post('/orders').send({ item: 'Sticker' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when user_id does not exist (FK violation)', async () => {
      pool.query.mockRejectedValueOnce({ code: '23503' });
      const res = await request(app)
        .post('/orders')
        .send({ user_id: 999, item: 'Sticker', price: 2.5 });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /orders/:id', () => {
    it('deletes an order and returns 204', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await request(app).delete('/orders/1');
      expect(res.status).toBe(204);
    });

    it('returns 404 when order does not exist', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).delete('/orders/999');
      expect(res.status).toBe(404);
    });
  });
});

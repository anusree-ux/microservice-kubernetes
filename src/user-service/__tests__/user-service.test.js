jest.mock('pg', () => {
  const mPool = { query: jest.fn() };
  return { Pool: jest.fn(() => mPool) };
});

const { app, pool } = require('../app');
const request = require('supertest');

describe('User Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('returns 200 and UP status when DB is reachable', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('UP');
    });

    it('returns 503 when DB is unreachable', async () => {
      pool.query.mockRejectedValueOnce(new Error('connection refused'));
      const res = await request(app).get('/health');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('DOWN');
    });
  });

  describe('GET /users', () => {
    it('returns a list of users', async () => {
      const mockUsers = [{ id: 1, name: 'Alex', email: 'alex@example.com' }];
      pool.query.mockResolvedValueOnce({ rows: mockUsers });
      const res = await request(app).get('/users');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockUsers);
    });
  });

  describe('GET /users/:id', () => {
    it('returns a single user when found', async () => {
      const mockUser = { id: 1, name: 'Alex', email: 'alex@example.com' };
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });
      const res = await request(app).get('/users/1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockUser);
    });

    it('returns 404 when user not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/users/999');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /users', () => {
    it('creates a user and returns 201', async () => {
      const newUser = { id: 2, name: 'Sam', email: 'sam@example.com' };
      pool.query.mockResolvedValueOnce({ rows: [newUser] });
      const res = await request(app)
        .post('/users')
        .send({ name: 'Sam', email: 'sam@example.com' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual(newUser);
    });

    it('returns 400 when name or email is missing', async () => {
      const res = await request(app).post('/users').send({ name: 'Sam' });
      expect(res.status).toBe(400);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('returns 409 when email already exists', async () => {
      pool.query.mockRejectedValueOnce({ code: '23505' });
      const res = await request(app)
        .post('/users')
        .send({ name: 'Dup', email: 'dup@example.com' });
      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /users/:id', () => {
    it('deletes a user and returns 204', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await request(app).delete('/users/1');
      expect(res.status).toBe(204);
    });

    it('returns 404 when user does not exist', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).delete('/users/999');
      expect(res.status).toBe(404);
    });

    it('returns 409 when user has existing orders (FK violation)', async () => {
      pool.query.mockRejectedValueOnce({ code: '23503' });
      const res = await request(app).delete('/users/1');
      expect(res.status).toBe(409);
    });
  });
});

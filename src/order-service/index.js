const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5002;

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:5001';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://appuser:apppassword@localhost:5432/appdb'
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'UP', service: 'order-service' });
  } catch (err) {
    res.status(503).json({ status: 'DOWN', service: 'order-service', error: err.message });
  }
});

app.get('/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, user_id, item, price FROM orders ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database query failed', details: err.message });
  }
});

app.get('/orders/:id', async (req, res) => {
  try {
    const orderResult = await pool.query('SELECT id, user_id, item, price FROM orders WHERE id = $1', [req.params.id]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];

    let userData = null;
    try {
      const userResponse = await fetch(`${USER_SERVICE_URL}/users/${order.user_id}`);
      userData = userResponse.ok ? await userResponse.json() : null;
    } catch (err) {
      // user-service unreachable — order still returned, just without enrichment
    }

    res.json({
      ...order,
      user: userData || { error: 'Could not resolve user details' }
    });
  } catch (err) {
    res.status(500).json({ error: 'Database query failed', details: err.message });
  }
});

// Create a new order
app.post('/orders', async (req, res) => {
  const { user_id, item, price } = req.body;
  if (!user_id || !item || price == null) {
    return res.status(400).json({ error: 'user_id, item, and price are required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO orders (user_id, item, price) VALUES ($1, $2, $3) RETURNING id, user_id, item, price',
      [user_id, item, price]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23503') { // foreign_key_violation — user_id doesn't exist
      return res.status(400).json({ error: 'Invalid user_id: user does not exist' });
    }
    res.status(500).json({ error: 'Database query failed', details: err.message });
  }
});

// Delete an order
app.delete('/orders/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Database query failed', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Order Service running on port ${PORT}`);
});

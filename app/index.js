const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Database connection pool using environment variables (injected via ConfigMap + Secret)
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max:      10,          // connection pool max size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Health check endpoint (used by Kubernetes liveness/readiness probes)
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'healthy', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', db: 'disconnected', error: err.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Product Catalog API',
    version: '1.0.0',
    pod: process.env.HOSTNAME,
    endpoints: ['/health', '/products', '/products/:id']
  });
});

// GET all products from database
app.get('/products', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, category, price, stock, description, created_at FROM products ORDER BY id'
    );
    res.json({
      success: true,
      count: result.rows.length,
      pod: process.env.HOSTNAME,
      data: result.rows
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET a single product by ID
app.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, name, category, price, stock, description, created_at FROM products WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, pod: process.env.HOSTNAME, data: result.rows[0] });
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Product Catalog API running on port ${PORT}`);
  console.log(`DB Host: ${process.env.DB_HOST}`);
  console.log(`Pod: ${process.env.HOSTNAME}`);
});

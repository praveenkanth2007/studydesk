const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});
pool.on('error', e => console.error('Idle DB client error:', e.message));
const query = (text, params) => pool.query(text, params);
// Runs fn(client) inside a transaction; commits on success, rolls back on any error.
async function tx(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const r = await fn(client); await client.query('COMMIT'); return r; }
  catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
  finally { client.release(); }
}
module.exports = { pool, query, tx };

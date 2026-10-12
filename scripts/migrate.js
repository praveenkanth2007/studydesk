require('../src/config/env');
const fs = require('fs'), path = require('path');
const { pool } = require('../src/config/db');
(async () => {
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));
    console.log('✔ Database schema is up to date.');
  } catch (e) { console.error('Migration failed:', e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();

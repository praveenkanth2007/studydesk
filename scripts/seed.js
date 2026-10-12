// DEVELOPMENT ONLY: creates demo users/teams/tasks. Do not run against a real production database.
require('../src/config/env');
const fs = require('fs'), path = require('path');
const { pool } = require('../src/config/db');
(async () => {
  try {
    const { rows } = await pool.query("SELECT count(*)::int c FROM users WHERE email LIKE '%@demo.neonflow.dev'");
    if (rows[0].c) return console.log('Seed data already present – nothing to do.');
    await pool.query(fs.readFileSync(path.join(__dirname, '../database/seed.sql'), 'utf8'));
    console.log('✔ Seed data inserted. Demo logins (password: Password123):\n  admin@demo.neonflow.dev\n  faculty@demo.neonflow.dev\n  asha@demo.neonflow.dev\n  ben@demo.neonflow.dev\n  chen@demo.neonflow.dev');
  } catch (e) { console.error('Seed failed:', e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();

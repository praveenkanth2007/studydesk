// Usage: npm run make-admin -- someone@college.edu
require('../src/config/env');
const { pool } = require('../src/config/db');
(async () => {
  const email = (process.argv[2] || '').toLowerCase();
  if (!email) { console.error('Usage: npm run make-admin -- user@example.com'); process.exit(1); }
  const r = await pool.query("UPDATE users SET role='admin', updated_at=now() WHERE lower(email)=$1", [email]);
  console.log(r.rowCount ? `✔ ${email} is now an administrator.` : 'No user with that email. Register first, then run this again.');
  await pool.end();
})();

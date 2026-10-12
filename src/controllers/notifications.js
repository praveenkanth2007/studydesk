const db = require('../config/db');
const { need } = require('../validators');
const { AppError, wrapAll } = require('../middleware/error');
async function list(req, res) {
  const [n, u] = await Promise.all([
    db.query('SELECT id,type,title,body,link,is_read,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 60', [req.user.id]),
    db.query('SELECT count(*)::int c FROM notifications WHERE user_id=$1 AND NOT is_read', [req.user.id]),
  ]);
  res.json({ notifications: n.rows, unread: u.rows[0].c });
}
async function read(req, res) {
  const r = await db.query('UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2', [need(req.params.id), req.user.id]);
  if (!r.rowCount) throw new AppError(404, 'Notification not found.');
  res.json({ ok: true });
}
async function readAll(req, res) { await db.query('UPDATE notifications SET is_read=true WHERE user_id=$1 AND NOT is_read', [req.user.id]); res.json({ ok: true }); }
async function remove(req, res) { await db.query('DELETE FROM notifications WHERE id=$1 AND user_id=$2', [need(req.params.id), req.user.id]); res.json({ ok: true }); }
module.exports = wrapAll({ list, read, readAll, remove });

const db = require('../config/db');
const { emitTo, getIO } = require('../socket/io');
// Inserts one notification per recipient and pushes it over Socket.IO. Call AFTER your transaction commits.
exports.notify = async (userIds, { type, title, body = '', link = '' }) => {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  const { rows } = await db.query(
    `INSERT INTO notifications(user_id,type,title,body,link) SELECT unnest($1::uuid[]),$2,$3,$4,$5
     RETURNING id,user_id,type,title,body,link,is_read,created_at`, [ids, type, title.slice(0, 150), body.slice(0, 500), link]);
  const io = getIO(); if (io) rows.forEach(n => io.to('user:' + n.user_id).emit('notification:new', n));
};
exports.logActivity = (userId, teamId, action, entityType, entityId, meta = {}) =>
  db.query('INSERT INTO activity_logs(user_id,team_id,action,entity_type,entity_id,meta) VALUES($1,$2,$3,$4,$5,$6)',
    [userId, teamId, action, entityType, entityId, meta]).catch(e => console.error('activity log failed:', e.message));
exports.emitTo = emitTo;

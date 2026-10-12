const db = require('../config/db');
const { V, need, isUuid } = require('../validators');
const { AppError, wrapAll } = require('../middleware/error');
const { channelCtx, isStaffRole, shareTeam } = require('../services/access');
const { notify } = require('../services/notify');
const { emitTo } = require('../socket/io');
const { like } = require('../services/utils');

const MSG = `SELECT m.id,m.channel_id,m.sender_id,m.recipient_id,m.parent_id,m.body,m.created_at,u.name AS sender_name,
  f.id AS file_id,f.original_name AS file_name,f.size_bytes AS file_size,
  (SELECT count(*)::int FROM messages r WHERE r.parent_id=m.id) AS reply_count
  FROM messages m JOIN users u ON u.id=m.sender_id LEFT JOIN shared_files f ON f.id=m.file_id`;
const one = async id => (await db.query(`${MSG} WHERE m.id=$1`, [id])).rows[0];
const markRead = (userId, ctx) => db.query('INSERT INTO read_receipts(user_id,context,last_read_at) VALUES($1,$2,now()) ON CONFLICT (user_id,context) DO UPDATE SET last_read_at=now()', [userId, ctx]);
async function checkFile(fileId, userId) {
  if (fileId && !(await db.query('SELECT 1 FROM shared_files WHERE id=$1 AND uploader_id=$2', [fileId, userId])).rowCount) throw new AppError(400, 'Attachment not found.', { file_id: 'Attachment not found.' });
}

async function overview(req, res) {
  const admin = req.user.role === 'admin';
  const [ch, dm] = await Promise.all([
    db.query(`SELECT c.id,c.name,c.kind,c.team_id,t.name AS team_name,
        (SELECT count(*)::int FROM messages m WHERE m.channel_id=c.id AND m.sender_id<>$1 AND m.created_at > COALESCE((SELECT last_read_at FROM read_receipts WHERE user_id=$1 AND context='c:'||c.id::text),(SELECT joined_at FROM team_members WHERE team_id=c.team_id AND user_id=$1))) AS unread
      FROM channels c JOIN teams t ON t.id=c.team_id
      WHERE ($2 OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=c.team_id AND tm.user_id=$1))
      ORDER BY t.name, (c.kind='announcements') DESC, (c.kind='general') DESC, c.name`, [req.user.id, admin]),
    db.query(`WITH d AS (SELECT CASE WHEN sender_id=$1 THEN recipient_id ELSE sender_id END AS other, body, created_at FROM messages WHERE recipient_id IS NOT NULL AND (sender_id=$1 OR recipient_id=$1))
      SELECT DISTINCT ON (d.other) d.other AS user_id, u.name, d.body AS last_body, d.created_at AS last_at,
        (SELECT count(*)::int FROM messages m WHERE m.sender_id=d.other AND m.recipient_id=$1 AND m.created_at > COALESCE((SELECT last_read_at FROM read_receipts WHERE user_id=$1 AND context='d:'||d.other::text),'epoch')) AS unread
      FROM d JOIN users u ON u.id=d.other ORDER BY d.other, d.created_at DESC`, [req.user.id]),
  ]);
  dm.rows.sort((a, b) => new Date(b.last_at) - new Date(a.last_at));
  res.json({ channels: ch.rows, dms: dm.rows, online: require('../socket').onlineIds() });
}
async function channelMessages(req, res) {
  const { channel, role } = await channelCtx(req.params.id, req.user);
  const p = [channel.id], w = ['m.channel_id=$1'], { before, q } = req.query;
  if (q) { p.push(like(q)); w.push(`m.body ILIKE $${p.length}`); } else w.push('m.parent_id IS NULL');
  if (before && !isNaN(Date.parse(before))) { p.push(new Date(before).toISOString()); w.push(`m.created_at < $${p.length}`); }
  const { rows } = await db.query(`${MSG} WHERE ${w.join(' AND ')} ORDER BY m.created_at DESC LIMIT 50`, p);
  if (!q) await markRead(req.user.id, 'c:' + channel.id);
  res.json({ channel, can_post: channel.kind !== 'announcements' || isStaffRole(role), messages: rows.reverse() });
}
async function threadMessages(req, res) {
  const parent = (await db.query('SELECT channel_id FROM messages WHERE id=$1 AND channel_id IS NOT NULL', [need(req.params.id)])).rows[0];
  if (!parent) throw new AppError(404, 'Message not found.');
  await channelCtx(parent.channel_id, req.user);
  const { rows } = await db.query(`${MSG} WHERE m.id=$1 OR m.parent_id=$1 ORDER BY m.created_at`, [req.params.id]);
  res.json({ messages: rows });
}
async function postChannel(req, res) {
  const { channel, role } = await channelCtx(req.params.id, req.user);
  const d = new V(req.body).str('body', { req: true, max: 4000, label: 'Message' }).uuid('parent_id').uuid('file_id').done();
  if (channel.kind === 'announcements' && !isStaffRole(role)) throw new AppError(403, 'Only team owners and faculty can post announcements.');
  if (d.parent_id && !(await db.query('SELECT 1 FROM messages WHERE id=$1 AND channel_id=$2 AND parent_id IS NULL', [d.parent_id, channel.id])).rowCount)
    throw new AppError(400, 'You can only reply to a message in this channel.');
  await checkFile(d.file_id, req.user.id);
  const id = (await db.query('INSERT INTO messages(channel_id,sender_id,parent_id,body,file_id) VALUES($1,$2,$3,$4,$5) RETURNING id', [channel.id, req.user.id, d.parent_id, d.body, d.file_id])).rows[0].id;
  const msg = await one(id);
  await markRead(req.user.id, 'c:' + channel.id);
  const members = (await db.query('SELECT user_id FROM team_members WHERE team_id=$1', [channel.team_id])).rows.map(r => r.user_id);
  emitTo([...members, req.user.id], 'message:new', { ...msg, team_id: channel.team_id });
  if (channel.kind === 'announcements' && !d.parent_id)
    await notify(members.filter(m => m !== req.user.id), { type: 'announcement', title: `Announcement in ${channel.team_name}`, body: d.body.slice(0, 160), link: '/teams.html?id=' + channel.team_id });
  res.status(201).json({ message: msg });
}
async function dmWith(req) {
  const other = need(req.params.userId);
  if (other === req.user.id) throw new AppError(400, 'You cannot message yourself.');
  const u = (await db.query('SELECT id,name,role FROM users WHERE id=$1', [other])).rows[0];
  if (!u || (req.user.role !== 'admin' && !(await shareTeam(req.user.id, other)))) throw new AppError(404, 'User not found.');
  return u;
}
async function dmMessages(req, res) {
  const u = await dmWith(req), p = [req.user.id, u.id], w = ['((m.sender_id=$1 AND m.recipient_id=$2) OR (m.sender_id=$2 AND m.recipient_id=$1))'], { before, q } = req.query;
  if (q) { p.push(like(q)); w.push(`m.body ILIKE $${p.length}`); }
  if (before && !isNaN(Date.parse(before))) { p.push(new Date(before).toISOString()); w.push(`m.created_at < $${p.length}`); }
  const { rows } = await db.query(`${MSG} WHERE ${w.join(' AND ')} ORDER BY m.created_at DESC LIMIT 50`, p);
  if (!q) await markRead(req.user.id, 'd:' + u.id);
  res.json({ user: u, messages: rows.reverse() });
}
async function postDm(req, res) {
  const u = await dmWith(req), d = new V(req.body).str('body', { req: true, max: 4000, label: 'Message' }).uuid('file_id').done();
  await checkFile(d.file_id, req.user.id);
  const id = (await db.query('INSERT INTO messages(sender_id,recipient_id,body,file_id) VALUES($1,$2,$3,$4) RETURNING id', [req.user.id, u.id, d.body, d.file_id])).rows[0].id;
  const msg = await one(id);
  await markRead(req.user.id, 'd:' + u.id);
  emitTo([req.user.id, u.id], 'message:new', msg);
  res.status(201).json({ message: msg });
}
async function read(req, res) {
  const c = String(req.body?.context || ''), m = /^([cd]):([0-9a-f-]{36})$/i.exec(c);
  if (!m || !isUuid(m[2])) throw new AppError(400, 'Invalid context.');
  if (m[1] === 'c') await channelCtx(m[2], req.user);
  await markRead(req.user.id, c);
  res.json({ ok: true });
}
module.exports = wrapAll({ overview, channelMessages, threadMessages, postChannel, dmMessages, postDm, read });

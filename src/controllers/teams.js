const crypto = require('crypto');
const db = require('../config/db');
const { V, need } = require('../validators');
const { AppError, wrapAll } = require('../middleware/error');
const { teamRole, needTeam, isStaffRole } = require('../services/access');
const { notify, logActivity } = require('../services/notify');
const { emitTo } = require('../socket/io');

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike characters
const genCode = () => Array.from({ length: 10 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join('');
async function uniqueCode() { for (let i = 0; i < 5; i++) { const c = genCode(); if (!(await db.query('SELECT 1 FROM teams WHERE invite_code=$1', [c])).rowCount) return c; } throw new Error('code generation failed'); }

async function list(req, res) {
  const admin = req.user.role === 'admin';
  const { rows } = await db.query(
    `SELECT t.id,t.name,t.description,t.kind,t.subject,t.created_at, ${admin ? "'admin'" : 'tm.role'} AS my_role,
       CASE WHEN ${admin ? 'true' : "tm.role IN ('owner','faculty')"} THEN t.invite_code END AS invite_code,
       (SELECT count(*)::int FROM team_members WHERE team_id=t.id) AS member_count,
       (SELECT max(m.created_at) FROM messages m JOIN channels c ON c.id=m.channel_id WHERE c.team_id=t.id) AS last_activity
     FROM teams t ${admin ? '' : 'JOIN team_members tm ON tm.team_id=t.id AND tm.user_id=$1'} ${admin ? 'WHERE $1::uuid IS NOT NULL' : ''}
     ORDER BY COALESCE((SELECT max(m.created_at) FROM messages m JOIN channels c ON c.id=m.channel_id WHERE c.team_id=t.id), t.created_at) DESC`, [req.user.id]);
  res.json({ teams: rows });
}
async function create(req, res) {
  const d = new V(req.body).str('name', { req: true, min: 2, max: 100, label: 'Name' }).str('description', { max: 500 }).str('subject', { max: 80 }).oneOf('kind', ['class', 'study_group'], 'study_group').done();
  if (d.kind === 'class' && !['faculty', 'admin'].includes(req.user.role)) throw new AppError(403, 'Only faculty can create classes.', { kind: 'Only faculty can create classes.' });
  const code = await uniqueCode();
  const team = await db.tx(async c => {
    const t = (await c.query('INSERT INTO teams(name,description,kind,subject,invite_code,owner_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [d.name, d.description, d.kind, d.subject, code, req.user.id])).rows[0];
    await c.query("INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,'owner')", [t.id, req.user.id]);
    await c.query("INSERT INTO channels(team_id,name,description,kind,created_by) VALUES($1,'General','Team-wide chat','general',$2),($1,'Announcements','Official announcements','announcements',$2)", [t.id, req.user.id]);
    return t;
  });
  logActivity(req.user.id, team.id, 'team.create', 'team', team.id);
  res.status(201).json({ team: { ...team, my_role: 'owner' } });
}
async function join(req, res) {
  const code = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) throw new AppError(400, 'Enter a valid invitation code.', { code: 'Enter a valid invitation code.' });
  const t = (await db.query('SELECT id,name,owner_id FROM teams WHERE invite_code=$1', [code])).rows[0];
  if (!t) throw new AppError(404, 'That invitation code is not valid.', { code: 'That invitation code is not valid.' });
  const role = req.user.role === 'faculty' ? 'faculty' : 'member';
  const ins = await db.query('INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [t.id, req.user.id, role]);
  if (!ins.rowCount) throw new AppError(409, 'You are already a member of this team.');
  logActivity(req.user.id, t.id, 'team.join', 'team', t.id);
  await notify([t.owner_id], { type: 'team', title: `${req.user.name} joined ${t.name}`, link: '/teams.html?id=' + t.id });
  res.json({ team: { id: t.id, name: t.name } });
}
async function getOne(req, res) {
  const role = await needTeam(need(req.params.id), req.user), staff = isStaffRole(role), id = req.params.id;
  const [team, members, channels, ann, asg] = await Promise.all([
    db.query('SELECT id,name,description,kind,subject,created_at,owner_id,invite_code FROM teams WHERE id=$1', [id]),
    db.query(`SELECT u.id,u.name,u.role AS account_role,u.department,tm.role,tm.joined_at ${staff ? ',u.email' : ''} FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=$1 ORDER BY (tm.role='owner') DESC, (tm.role='faculty') DESC, u.name`, [id]),
    db.query(`SELECT c.id,c.name,c.description,c.kind,
        (SELECT count(*)::int FROM messages m WHERE m.channel_id=c.id AND m.sender_id<>$2 AND m.created_at > COALESCE((SELECT last_read_at FROM read_receipts WHERE user_id=$2 AND context='c:'||c.id::text),(SELECT joined_at FROM team_members WHERE team_id=$1 AND user_id=$2))) AS unread
      FROM channels c WHERE c.team_id=$1 ORDER BY (c.kind='announcements') DESC, (c.kind='general') DESC, c.name`, [id, req.user.id]),
    db.query(`SELECT m.id,m.body,m.created_at,u.name AS sender_name FROM messages m JOIN channels c ON c.id=m.channel_id JOIN users u ON u.id=m.sender_id WHERE c.team_id=$1 AND c.kind='announcements' AND m.parent_id IS NULL ORDER BY m.created_at DESC LIMIT 10`, [id]),
    db.query('SELECT id,title,subject,priority,due_at FROM assignments WHERE team_id=$1 ORDER BY due_at DESC LIMIT 20', [id]),
  ]);
  const t = team.rows[0]; if (!staff) delete t.invite_code;
  res.json({ team: t, my_role: role, members: members.rows, channels: channels.rows, announcements: ann.rows, assignments: asg.rows });
}
async function sharedTasks(req, res) {
  await needTeam(need(req.params.id), req.user);
  const { rows } = await db.query(
    `SELECT t.id,t.title,t.status,t.priority,t.due_at,t.category,u.name AS owner_name,
       (SELECT count(*)::int FROM subtasks s WHERE s.task_id=t.id) AS subtask_total, (SELECT count(*)::int FROM subtasks s WHERE s.task_id=t.id AND s.done) AS subtask_done
     FROM personal_tasks t JOIN users u ON u.id=t.user_id WHERE t.shared_team_id=$1 ORDER BY t.due_at NULLS LAST LIMIT 200`, [req.params.id]);
  res.json({ tasks: rows });
}
async function addChannel(req, res) {
  await needTeam(need(req.params.id), req.user, true);
  const d = new V(req.body).str('name', { req: true, min: 2, max: 40, label: 'Channel name' }).str('description', { max: 200 }).done();
  try {
    const { rows } = await db.query("INSERT INTO channels(team_id,name,description,kind,created_by) VALUES($1,$2,$3,'subject',$4) RETURNING id,name,description,kind", [req.params.id, d.name, d.description, req.user.id]);
    res.status(201).json({ channel: { ...rows[0], unread: 0 } });
  } catch (e) { if (e.code === '23505') throw new AppError(409, 'A channel with that name already exists.', { name: 'A channel with that name already exists.' }); throw e; }
}
async function regenerateCode(req, res) {
  await needTeam(need(req.params.id), req.user, true);
  const code = await uniqueCode();
  await db.query('UPDATE teams SET invite_code=$2 WHERE id=$1', [req.params.id, code]);
  res.json({ invite_code: code });
}
async function inviteByEmail(req, res) {
  await needTeam(need(req.params.id), req.user, true);
  const d = new V(req.body).email().done();
  const u = (await db.query('SELECT id,name,role FROM users WHERE lower(email)=$1', [d.email])).rows[0];
  if (!u) throw new AppError(404, 'No registered user has that email. Share the invitation code instead.', { email: 'No registered user has that email.' });
  const team = (await db.query('SELECT name FROM teams WHERE id=$1', [req.params.id])).rows[0];
  const ins = await db.query('INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [req.params.id, u.id, u.role === 'faculty' ? 'faculty' : 'member']);
  if (!ins.rowCount) throw new AppError(409, `${u.name} is already in this team.`);
  logActivity(req.user.id, req.params.id, 'team.invite', 'user', u.id);
  await notify([u.id], { type: 'team', title: `You were added to ${team.name}`, body: `By ${req.user.name}`, link: '/teams.html?id=' + req.params.id });
  res.json({ member: { id: u.id, name: u.name } });
}
async function removeMember(req, res) {
  const role = await needTeam(need(req.params.id), req.user), target = need(req.params.userId), self = target === req.user.id;
  if (!self && !isStaffRole(role)) throw new AppError(403, 'Only team owners and faculty can remove members.');
  const m = (await db.query('SELECT role FROM team_members WHERE team_id=$1 AND user_id=$2', [req.params.id, target])).rows[0];
  if (!m) throw new AppError(404, 'Member not found.');
  if (m.role === 'owner') throw new AppError(400, 'The team owner cannot be removed. Delete the team instead.');
  await db.query('DELETE FROM team_members WHERE team_id=$1 AND user_id=$2', [req.params.id, target]);
  await db.query('UPDATE personal_tasks SET shared_team_id=NULL WHERE user_id=$1 AND shared_team_id=$2', [target, req.params.id]);
  await db.query('DELETE FROM assignment_recipients ar USING assignments a WHERE ar.assignment_id=a.id AND a.team_id=$1 AND ar.student_id=$2 AND ar.status IN (\'assigned\',\'in_progress\')', [req.params.id, target]);
  if (!self) await notify([target], { type: 'team', title: 'You were removed from a team' });
  res.json({ message: self ? 'You left the team.' : 'Member removed.' });
}
async function remove(req, res) {
  const role = await needTeam(need(req.params.id), req.user);
  if (!['owner', 'admin'].includes(role)) throw new AppError(403, 'Only the team owner can delete the team.');
  await db.query('DELETE FROM teams WHERE id=$1', [req.params.id]);
  res.json({ message: 'Team deleted.' });
}
module.exports = wrapAll({ list, create, join, getOne, sharedTasks, addChannel, regenerateCode, inviteByEmail, removeMember, remove });

const db = require('../config/db');
const { V, need } = require('../validators');
const { AppError, wrapAll } = require('../middleware/error');
const { tzOf, like } = require('../services/utils');
const { needTeam } = require('../services/access');
const { logActivity } = require('../services/notify');

const SEL = `SELECT t.*, (SELECT count(*)::int FROM subtasks s WHERE s.task_id=t.id) AS subtask_total,
  (SELECT count(*)::int FROM subtasks s WHERE s.task_id=t.id AND s.done) AS subtask_done,
  a.title AS assignment_title, tm.name AS shared_team_name
  FROM personal_tasks t LEFT JOIN assignments a ON a.id=t.assignment_id LEFT JOIN teams tm ON tm.id=t.shared_team_id`;

async function mineOr404(id, userId) {
  const r = await db.query(`${SEL} WHERE t.id=$1 AND t.user_id=$2`, [need(id), userId]);
  if (!r.rows[0]) throw new AppError(404, 'Task not found.');
  return r.rows[0];
}
function validate(body) {
  const v = new V(body);
  v.str('title', { req: true, max: 150, label: 'Title' }).str('description', { max: 2000 }).oneOf('priority', ['low', 'medium', 'high'], 'medium')
   .str('category', { max: 40 }).date('start_at').date('due_at').int('est_minutes', { min: 0, max: 10080, label: 'Estimate' })
   .int('actual_minutes', { min: 0, max: 10080, label: 'Time spent' }).str('notes', { max: 2000 }).uuid('assignment_id');
  const d = v.done();
  if (d.start_at && d.due_at && d.start_at > d.due_at) throw new AppError(400, 'Please fix the highlighted fields.', { due_at: 'Due date must be after the start date.' });
  return d;
}
async function checkAssignment(assignmentId, userId) {
  if (!assignmentId) return;
  const r = await db.query('SELECT 1 FROM assignment_recipients WHERE assignment_id=$1 AND student_id=$2', [assignmentId, userId]);
  if (!r.rowCount) throw new AppError(400, 'You can only link tasks to your own assignments.', { assignment_id: 'Invalid assignment.' });
}
async function list(req, res) {
  const p = [req.user.id], w = ['t.user_id=$1'], add = x => { p.push(x); return '$' + p.length; };
  const { status, priority, category, q, team_id, assignment_id, from, to, sort = 'due' } = req.query;
  if (status === 'overdue') w.push("(t.status<>'completed' AND t.due_at < now())");
  else if (status === 'open') w.push("t.status<>'completed'");
  else if (status === 'today') w.push(`timezone(${add(tzOf(req))},t.due_at)::date = timezone($${p.length},now())::date`);
  else if (['todo', 'in_progress', 'completed'].includes(status)) w.push(`t.status=${add(status)}`);
  if (['low', 'medium', 'high'].includes(priority)) w.push(`t.priority=${add(priority)}`);
  if (category) w.push(`t.category=${add(String(category))}`);
  if (team_id) w.push(`t.shared_team_id=${add(need(team_id))}`);
  if (assignment_id) w.push(`t.assignment_id=${add(need(assignment_id))}`);
  if (q) { const a = add(like(q)); w.push(`(t.title ILIKE ${a} OR t.description ILIKE ${a} OR t.category ILIKE ${a} OR t.notes ILIKE ${a})`); }
  if (from) { const t = Date.parse(from); if (!isNaN(t)) w.push(`t.due_at >= ${add(new Date(t).toISOString())}`); }
  if (to) { const t = Date.parse(to); if (!isNaN(t)) w.push(`t.due_at <= ${add(new Date(t).toISOString())}`); }
  const ORDER = { due: 't.due_at ASC NULLS LAST', priority: "CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.due_at NULLS LAST", created: 't.created_at DESC', title: 't.title ASC', manual: 't.position, t.created_at' }[sort] || 't.due_at ASC NULLS LAST';
  const [tasks, cats] = await Promise.all([
    db.query(`${SEL} WHERE ${w.join(' AND ')} ORDER BY ${ORDER}, t.id LIMIT 500`, p),
    db.query("SELECT DISTINCT category FROM personal_tasks WHERE user_id=$1 AND category<>'' ORDER BY category", [req.user.id]),
  ]);
  res.json({ tasks: tasks.rows, categories: cats.rows.map(r => r.category) });
}
async function getOne(req, res) {
  const task = await mineOr404(req.params.id, req.user.id);
  const subs = await db.query('SELECT id,title,done,position FROM subtasks WHERE task_id=$1 ORDER BY position, created_at', [task.id]);
  res.json({ task, subtasks: subs.rows });
}
async function create(req, res) {
  const d = validate(req.body); await checkAssignment(d.assignment_id, req.user.id);
  const status = new V(req.body).oneOf('status', ['todo', 'in_progress', 'completed'], 'todo').done().status;
  const { rows } = await db.query(
    `INSERT INTO personal_tasks(user_id,title,description,priority,category,status,start_at,due_at,est_minutes,actual_minutes,notes,assignment_id,position,completed_at)
     VALUES($1,$2,$3,$4,$5,$6::varchar,$7,$8,$9,$10,$11,$12,(SELECT COALESCE(max(position),0)+1000 FROM personal_tasks WHERE user_id=$1),CASE WHEN $6::varchar='completed' THEN now() END) RETURNING id`,
    [req.user.id, d.title, d.description, d.priority, d.category, status, d.start_at, d.due_at, d.est_minutes, d.actual_minutes, d.notes, d.assignment_id]);
  logActivity(req.user.id, null, 'task.create', 'task', rows[0].id);
  res.status(201).json({ task: await mineOr404(rows[0].id, req.user.id) });
}
async function update(req, res) {
  const cur = await mineOr404(req.params.id, req.user.id), d = validate(req.body);
  if (d.assignment_id !== cur.assignment_id) await checkAssignment(d.assignment_id, req.user.id);
  await db.query(
    `UPDATE personal_tasks SET title=$3,description=$4,priority=$5,category=$6,start_at=$7,due_at=$8,est_minutes=$9,actual_minutes=$10,notes=$11,assignment_id=$12,updated_at=now() WHERE id=$1 AND user_id=$2`,
    [cur.id, req.user.id, d.title, d.description, d.priority, d.category, d.start_at, d.due_at, d.est_minutes, d.actual_minutes, d.notes, d.assignment_id]);
  res.json({ task: await mineOr404(cur.id, req.user.id) });
}
async function setStatus(req, res) {
  const cur = await mineOr404(req.params.id, req.user.id);
  const d = new V(req.body).oneOf('status', ['todo', 'in_progress', 'completed']).done();
  const pos = Number.isFinite(Number(req.body.position)) ? Number(req.body.position) : cur.position;
  await db.query(`UPDATE personal_tasks SET status=$3::varchar, position=$4, completed_at=CASE WHEN $3::varchar='completed' THEN COALESCE(completed_at,now()) ELSE NULL END, updated_at=now() WHERE id=$1 AND user_id=$2`, [cur.id, req.user.id, d.status, pos]);
  if (d.status === 'completed' && cur.status !== 'completed') logActivity(req.user.id, null, 'task.complete', 'task', cur.id);
  res.json({ task: await mineOr404(cur.id, req.user.id) });
}
async function remove(req, res) {
  const r = await db.query('DELETE FROM personal_tasks WHERE id=$1 AND user_id=$2', [need(req.params.id), req.user.id]);
  if (!r.rowCount) throw new AppError(404, 'Task not found.');
  res.json({ message: 'Task deleted.' });
}
async function share(req, res) {
  const cur = await mineOr404(req.params.id, req.user.id), teamId = req.body?.team_id || null;
  if (teamId) await needTeam(need(teamId), req.user);
  await db.query('UPDATE personal_tasks SET shared_team_id=$3, updated_at=now() WHERE id=$1 AND user_id=$2', [cur.id, req.user.id, teamId]);
  res.json({ task: await mineOr404(cur.id, req.user.id) });
}
async function addSubtask(req, res) {
  const cur = await mineOr404(req.params.id, req.user.id), d = new V(req.body).str('title', { req: true, max: 150, label: 'Title' }).done();
  const { rows } = await db.query('INSERT INTO subtasks(task_id,title,position) VALUES($1,$2,(SELECT COALESCE(max(position),0)+1 FROM subtasks WHERE task_id=$1)) RETURNING id,title,done,position', [cur.id, d.title]);
  res.status(201).json({ subtask: rows[0] });
}
async function ownSubtask(id, userId) {
  const r = await db.query('SELECT s.id FROM subtasks s JOIN personal_tasks t ON t.id=s.task_id WHERE s.id=$1 AND t.user_id=$2', [need(id), userId]);
  if (!r.rowCount) throw new AppError(404, 'Subtask not found.');
}
async function patchSubtask(req, res) {
  await ownSubtask(req.params.sid, req.user.id);
  const b = req.body || {}, v = new V(b); if ('title' in b) v.str('title', { req: true, max: 150 }); if ('done' in b) v.bool('done'); const d = v.done();
  const { rows } = await db.query('UPDATE subtasks SET title=COALESCE($2,title), done=COALESCE($3,done) WHERE id=$1 RETURNING id,title,done,position', [req.params.sid, 'title' in b ? d.title : null, 'done' in b ? d.done : null]);
  res.json({ subtask: rows[0] });
}
async function removeSubtask(req, res) { await ownSubtask(req.params.sid, req.user.id); await db.query('DELETE FROM subtasks WHERE id=$1', [req.params.sid]); res.json({ message: 'Deleted.' }); }
module.exports = wrapAll({ list, getOne, create, update, setStatus, remove, share, addSubtask, patchSubtask, removeSubtask });

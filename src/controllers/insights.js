const db = require('../config/db');
const { wrapAll } = require('../middleware/error');
const { tzOf, like } = require('../services/utils');
const staffUser = u => ['faculty', 'admin'].includes(u.role);

async function dashboard(req, res) {
  const tz = tzOf(req), u = req.user.id, staff = staffUser(req.user);
  const [counts, upcoming, weekly, teams, events, extra] = await Promise.all([
    db.query(`SELECT count(*)::int total, count(*) FILTER (WHERE status<>'completed')::int open,
        count(*) FILTER (WHERE timezone($2,due_at)::date=timezone($2,now())::date)::int today_total,
        count(*) FILTER (WHERE timezone($2,due_at)::date=timezone($2,now())::date AND status='completed')::int today_done,
        count(*) FILTER (WHERE status='completed')::int completed_total,
        count(*) FILTER (WHERE completed_at IS NOT NULL AND timezone($2,completed_at)::date=timezone($2,now())::date)::int completed_today,
        count(*) FILTER (WHERE status<>'completed' AND due_at<now())::int overdue,
        count(*) FILTER (WHERE status='in_progress')::int in_progress
      FROM personal_tasks WHERE user_id=$1`, [u, tz]),
    db.query(`(SELECT 'task' AS kind,id,title,due_at,priority,category AS subject,status FROM personal_tasks WHERE user_id=$1 AND status<>'completed' AND due_at IS NOT NULL ORDER BY due_at LIMIT 8)
      UNION ALL (SELECT 'assignment',a.id,a.title,a.due_at,a.priority,a.subject,ar.status FROM assignment_recipients ar JOIN assignments a ON a.id=ar.assignment_id WHERE ar.student_id=$1 AND ar.status IN ('assigned','in_progress','returned') ORDER BY a.due_at LIMIT 8)
      ORDER BY due_at LIMIT 8`, [u]),
    db.query(`SELECT d::date AS date, to_char(d,'Dy') AS label,
        (SELECT count(*)::int FROM personal_tasks WHERE user_id=$1 AND completed_at IS NOT NULL AND timezone($2,completed_at)::date=d::date) AS completed,
        (SELECT count(*)::int FROM personal_tasks WHERE user_id=$1 AND timezone($2,created_at)::date=d::date) AS created
      FROM generate_series((timezone($2,now())::date-6)::timestamp,(timezone($2,now())::date)::timestamp,'1 day') d ORDER BY d`, [u, tz]),
    db.query(`SELECT t.id,t.name,t.kind,tm.role,(SELECT count(*)::int FROM team_members WHERE team_id=t.id) AS member_count,
        (SELECT max(m.created_at) FROM messages m JOIN channels c ON c.id=m.channel_id WHERE c.team_id=t.id) AS last_activity
      FROM teams t JOIN team_members tm ON tm.team_id=t.id AND tm.user_id=$1 ORDER BY last_activity DESC NULLS LAST, t.created_at DESC LIMIT 4`, [u]),
    db.query(`(SELECT 'assignment' AS kind,a.id,a.title,a.due_at AS at,a.subject FROM assignments a WHERE a.due_at BETWEEN now() AND now()+interval '7 days'
        AND (a.created_by=$1 OR EXISTS (SELECT 1 FROM assignment_recipients ar WHERE ar.assignment_id=a.id AND ar.student_id=$1)) ORDER BY a.due_at LIMIT 5)
      UNION ALL (SELECT 'task',id,title,start_at,category FROM personal_tasks WHERE user_id=$1 AND status<>'completed' AND start_at BETWEEN now() AND now()+interval '7 days' ORDER BY start_at LIMIT 5)
      ORDER BY at LIMIT 6`, [u]),
    staff ? db.query(`SELECT count(*)::int AS to_review FROM assignment_recipients ar JOIN assignments a ON a.id=ar.assignment_id WHERE ar.status IN ('submitted','under_review') AND (a.created_by=$1 OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=a.team_id AND tm.user_id=$1 AND tm.role IN ('owner','faculty')))`, [u])
          : Promise.resolve({ rows: [{}] }),
  ]);
  res.json({ counts: counts.rows[0], daily_goal: req.user.daily_goal, upcoming: upcoming.rows, weekly: weekly.rows, teams: teams.rows, events: events.rows, to_review: extra.rows[0].to_review ?? null });
}
async function calendar(req, res) {
  const from = Date.parse(req.query.from), to = Date.parse(req.query.to);
  const f = isNaN(from) ? new Date(Date.now() - 31 * 864e5) : new Date(from), t = isNaN(to) ? new Date(Date.now() + 62 * 864e5) : new Date(to);
  const u = req.user.id;
  const [tasks, asg] = await Promise.all([
    db.query("SELECT id,title,priority,status,due_at,category FROM personal_tasks WHERE user_id=$1 AND due_at BETWEEN $2 AND $3 ORDER BY due_at LIMIT 500", [u, f, t]),
    db.query(`SELECT a.id,a.title,a.priority,a.due_at,a.subject,${staffUser(req.user) ? "NULL::text" : 'ar.status'} AS status FROM assignments a
      ${staffUser(req.user) ? '' : 'JOIN assignment_recipients ar ON ar.assignment_id=a.id AND ar.student_id=$1'}
      WHERE a.due_at BETWEEN $2 AND $3 ${staffUser(req.user) ? 'AND (a.created_by=$1 OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=a.team_id AND tm.user_id=$1))' : ''} ORDER BY a.due_at LIMIT 300`, [u, f, t]),
  ]);
  res.json({ tasks: tasks.rows, assignments: asg.rows });
}
async function analytics(req, res) {
  const tz = tzOf(req), u = req.user.id, staff = staffUser(req.user);
  const [summary, weekly, est, subs, teams] = await Promise.all([
    db.query(`SELECT count(*)::int total, count(*) FILTER (WHERE status='completed')::int completed,
        count(*) FILTER (WHERE status<>'completed' AND due_at<now())::int overdue, count(*) FILTER (WHERE status<>'completed' AND (due_at IS NULL OR due_at>=now()))::int open,
        count(*) FILTER (WHERE status='completed' AND due_at IS NOT NULL AND completed_at<=due_at)::int on_time,
        count(*) FILTER (WHERE status='completed' AND due_at IS NOT NULL)::int completed_with_due
      FROM personal_tasks WHERE user_id=$1`, [u]),
    db.query(`SELECT to_char(w,'Mon DD') AS label,
        (SELECT count(*)::int FROM personal_tasks t WHERE t.user_id=$1 AND t.completed_at IS NOT NULL AND timezone($2,t.completed_at)>=w AND timezone($2,t.completed_at)<w+interval '7 days') AS completed,
        (SELECT count(*)::int FROM personal_tasks t WHERE t.user_id=$1 AND timezone($2,t.created_at)>=w AND timezone($2,t.created_at)<w+interval '7 days') AS created
      FROM generate_series(date_trunc('week',timezone($2,now()))-interval '7 weeks', date_trunc('week',timezone($2,now())), interval '1 week') w ORDER BY w`, [u, tz]),
    db.query(`SELECT COALESCE(NULLIF(category,''),'Uncategorized') AS category, round(COALESCE(sum(est_minutes),0)/60.0,1)::float AS est_hours, round(COALESCE(sum(actual_minutes),0)/60.0,1)::float AS actual_hours
      FROM personal_tasks WHERE user_id=$1 AND (est_minutes IS NOT NULL OR actual_minutes IS NOT NULL) GROUP BY 1 ORDER BY sum(COALESCE(est_minutes,0)) DESC LIMIT 8`, [u]),
    staff ? db.query(`SELECT a.title,s.submitted_at,s.is_late,s.marks,a.max_marks,u.name AS student FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN users u ON u.id=s.student_id
            WHERE a.created_by=$1 OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=a.team_id AND tm.user_id=$1 AND tm.role IN ('owner','faculty')) ORDER BY s.submitted_at DESC LIMIT 20`, [u])
          : db.query(`SELECT a.title,s.submitted_at,s.is_late,s.marks,a.max_marks,ar.status FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN assignment_recipients ar ON ar.assignment_id=a.id AND ar.student_id=s.student_id WHERE s.student_id=$1 ORDER BY s.submitted_at DESC LIMIT 20`, [u]),
    db.query(`SELECT t.id,t.name,
        (SELECT count(*)::int FROM assignments a WHERE a.team_id=t.id) AS assignments,
        (SELECT count(*)::int FROM assignment_recipients ar JOIN assignments a ON a.id=ar.assignment_id WHERE a.team_id=t.id) AS recipients,
        (SELECT count(*)::int FROM assignment_recipients ar JOIN assignments a ON a.id=ar.assignment_id WHERE a.team_id=t.id AND ar.status IN ('submitted','under_review','graded')) AS submitted,
        (SELECT count(*)::int FROM personal_tasks p WHERE p.shared_team_id=t.id) AS shared_tasks,
        (SELECT count(*)::int FROM personal_tasks p WHERE p.shared_team_id=t.id AND p.status='completed') AS shared_done
      FROM teams t JOIN team_members tm ON tm.team_id=t.id AND tm.user_id=$1 ORDER BY t.name`, [u]),
  ]);
  const s = summary.rows[0];
  res.json({ staff, summary: { ...s, completion_rate: s.total ? Math.round(s.completed / s.total * 100) : 0, on_time_rate: s.completed_with_due ? Math.round(s.on_time / s.completed_with_due * 100) : 0 },
    weekly: weekly.rows, estimates: est.rows, submissions: subs.rows, teams: teams.rows });
}
async function search(req, res) {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ tasks: [], assignments: [], teams: [], messages: [], files: [] });
  const u = req.user.id, l = like(q), admin = req.user.role === 'admin', staff = staffUser(req.user);
  const [tasks, asg, teams, msgs, files] = await Promise.all([
    db.query('SELECT id,title,status FROM personal_tasks WHERE user_id=$1 AND (title ILIKE $2 OR description ILIKE $2 OR category ILIKE $2) ORDER BY due_at NULLS LAST LIMIT 5', [u, l]),
    db.query(`SELECT a.id,a.title,a.subject FROM assignments a WHERE (a.title ILIKE $2 OR a.subject ILIKE $2 OR a.instructions ILIKE $2) AND ($3 OR ${staff ? 'a.created_by=$1 OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=a.team_id AND tm.user_id=$1)' : 'EXISTS (SELECT 1 FROM assignment_recipients ar WHERE ar.assignment_id=a.id AND ar.student_id=$1)'}) ORDER BY a.due_at DESC LIMIT 5`, [u, l, admin]),
    db.query('SELECT t.id,t.name FROM teams t WHERE t.name ILIKE $2 AND ($3 OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=t.id AND tm.user_id=$1)) LIMIT 5', [u, l, admin]),
    db.query(`SELECT m.id,m.body,m.channel_id,c.name AS channel_name FROM messages m JOIN channels c ON c.id=m.channel_id WHERE m.body ILIKE $2 AND ($3 OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=c.team_id AND tm.user_id=$1)) ORDER BY m.created_at DESC LIMIT 5`, [u, l, admin]),
    db.query("SELECT f.id,f.original_name FROM shared_files f WHERE f.original_name ILIKE $2 AND (f.uploader_id=$1 OR $3 OR (f.purpose IN ('team','chat') AND f.team_id IN (SELECT team_id FROM team_members WHERE user_id=$1))) LIMIT 5", [u, l, admin]),
  ]);
  res.json({ tasks: tasks.rows, assignments: asg.rows, teams: teams.rows, messages: msgs.rows.map(m => ({ ...m, body: m.body.slice(0, 90) })), files: files.rows });
}
async function badges(req, res) {
  const { rows } = await db.query(
    `SELECT (SELECT count(*)::int FROM notifications WHERE user_id=$1 AND NOT is_read) AS notifications,
      ((SELECT count(*)::int FROM messages m JOIN channels c ON c.id=m.channel_id JOIN team_members tm ON tm.team_id=c.team_id AND tm.user_id=$1
          WHERE m.sender_id<>$1 AND m.created_at > COALESCE((SELECT last_read_at FROM read_receipts WHERE user_id=$1 AND context='c:'||c.id::text), tm.joined_at))
       + (SELECT count(*)::int FROM messages m WHERE m.recipient_id=$1 AND m.created_at > COALESCE((SELECT last_read_at FROM read_receipts WHERE user_id=$1 AND context='d:'||m.sender_id::text),'epoch'))) AS chat`, [req.user.id]);
  res.json(rows[0]);
}
module.exports = wrapAll({ dashboard, calendar, analytics, search, badges });

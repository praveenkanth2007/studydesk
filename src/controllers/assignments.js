const db = require('../config/db');
const { V, need, isUuid } = require('../validators');
const { AppError, wrapAll } = require('../middleware/error');
const { needTeam, assignmentCtx } = require('../services/access');
const { notify, logActivity } = require('../services/notify');
const { emitTo } = require('../socket/io');

const isFaculty = u => ['faculty', 'admin'].includes(u.role);
async function list(req, res) {
  if (isFaculty(req.user)) {
    const admin = req.user.role === 'admin';
    const { rows } = await db.query(
      `SELECT a.id,a.title,a.subject,a.priority,a.due_at,a.max_marks,a.requires_submission,a.created_at,t.name AS team_name,a.team_id,
         (SELECT count(*)::int FROM assignment_recipients WHERE assignment_id=a.id) AS recipients,
         (SELECT count(*)::int FROM assignment_recipients WHERE assignment_id=a.id AND status IN ('submitted','under_review','graded')) AS submitted,
         (SELECT count(*)::int FROM assignment_recipients WHERE assignment_id=a.id AND status='graded') AS graded
       FROM assignments a JOIN teams t ON t.id=a.team_id
       WHERE $2 OR a.created_by=$1 OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=a.team_id AND tm.user_id=$1 AND tm.role IN ('owner','faculty'))
       ORDER BY a.due_at DESC LIMIT 300`, [req.user.id, admin]);
    return res.json({ view: 'staff', assignments: rows });
  }
  const { rows } = await db.query(
    `SELECT a.id,a.title,a.subject,a.priority,a.due_at,a.max_marks,a.requires_submission,a.created_at,t.name AS team_name,a.team_id,
       ar.status AS my_status,s.submitted_at,s.is_late,s.marks,s.feedback
     FROM assignment_recipients ar JOIN assignments a ON a.id=ar.assignment_id JOIN teams t ON t.id=a.team_id
     LEFT JOIN submissions s ON s.assignment_id=a.id AND s.student_id=ar.student_id WHERE ar.student_id=$1 ORDER BY a.due_at DESC LIMIT 300`, [req.user.id]);
  res.json({ view: 'student', assignments: rows });
}
async function create(req, res) {
  if (!isFaculty(req.user)) throw new AppError(403, 'Only faculty can create assignments.');
  const b = req.body || {}, v = new V(b);
  v.uuid('team_id', { req: true }).str('title', { req: true, max: 150, label: 'Title' }).str('instructions', { max: 10000 }).str('subject', { max: 80 })
   .oneOf('priority', ['low', 'medium', 'high'], 'medium').date('due_at', { req: true, label: 'Due date' }).bool('requires_submission', true).int('max_marks', { min: 1, max: 1000, def: 100, label: 'Maximum marks' });
  const d = v.done();
  await needTeam(d.team_id, req.user, true);
  const ids = Array.isArray(b.recipient_ids) ? [...new Set(b.recipient_ids)] : [];
  if (ids.some(i => !isUuid(i))) throw new AppError(400, 'Invalid recipients.', { recipient_ids: 'Invalid recipients.' });
  const fileIds = Array.isArray(b.file_ids) ? b.file_ids.filter(isUuid).slice(0, 10) : [];
  const out = await db.tx(async c => {
    const students = (await c.query("SELECT user_id FROM team_members WHERE team_id=$1 AND role='member'", [d.team_id])).rows.map(r => r.user_id);
    const targets = ids.length ? ids : students;
    if (ids.length && ids.some(i => !students.includes(i))) throw new AppError(400, 'Recipients must be students in this team.', { recipient_ids: 'Recipients must be students in this team.' });
    if (!targets.length) throw new AppError(400, 'This team has no students yet. Share the invitation code first.', { team_id: 'This team has no students yet.' });
    const a = (await c.query('INSERT INTO assignments(team_id,created_by,title,instructions,subject,priority,due_at,requires_submission,max_marks) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [d.team_id, req.user.id, d.title, d.instructions, d.subject, d.priority, d.due_at, d.requires_submission, d.max_marks])).rows[0];
    await c.query('INSERT INTO assignment_recipients(assignment_id,student_id) SELECT $1, unnest($2::uuid[])', [a.id, targets]);
    if (fileIds.length) await c.query("UPDATE shared_files SET assignment_id=$1 WHERE id=ANY($2::uuid[]) AND uploader_id=$3 AND purpose='assignment' AND team_id=$4", [a.id, fileIds, req.user.id, d.team_id]);
    return { a, targets };
  });
  logActivity(req.user.id, d.team_id, 'assignment.create', 'assignment', out.a.id, { title: d.title });
  await notify(out.targets, { type: 'assignment', title: `New assignment: ${d.title}`, body: `Due ${new Date(d.due_at).toUTCString().slice(0, 22)} UTC`, link: '/assignments.html?id=' + out.a.id });
  res.status(201).json({ assignment: out.a, recipients: out.targets.length });
}
async function getOne(req, res) {
  const { assignment: a, staff, recipient } = await assignmentCtx(req.params.id, req.user);
  const files = (await db.query("SELECT id,original_name,size_bytes FROM shared_files WHERE assignment_id=$1 AND purpose='assignment' ORDER BY created_at", [a.id])).rows;
  const creator = (await db.query('SELECT name FROM users WHERE id=$1', [a.created_by])).rows[0];
  const base = { assignment: { ...a, created_by_name: creator?.name }, files, staff };
  if (staff) {
    const recipients = (await db.query(
      `SELECT u.id,u.name,ar.status,s.submitted_at,s.is_late,s.marks,s.feedback,s.content,s.attempt,f.id AS file_id,f.original_name AS file_name
       FROM assignment_recipients ar JOIN users u ON u.id=ar.student_id LEFT JOIN submissions s ON s.assignment_id=ar.assignment_id AND s.student_id=ar.student_id
       LEFT JOIN shared_files f ON f.id=s.file_id WHERE ar.assignment_id=$1 ORDER BY u.name`, [a.id])).rows;
    return res.json({ ...base, recipients });
  }
  const [sub, tasks] = await Promise.all([
    db.query('SELECT s.content,s.submitted_at,s.is_late,s.attempt,s.marks,s.feedback,s.graded_at,f.id AS file_id,f.original_name AS file_name FROM submissions s LEFT JOIN shared_files f ON f.id=s.file_id WHERE s.assignment_id=$1 AND s.student_id=$2', [a.id, req.user.id]),
    db.query('SELECT id,title,status,due_at FROM personal_tasks WHERE assignment_id=$1 AND user_id=$2 ORDER BY due_at NULLS LAST', [a.id, req.user.id]),
  ]);
  res.json({ ...base, my_status: recipient.status, submission: sub.rows[0] || null, my_tasks: tasks.rows });
}
async function progress(req, res) {
  const { recipient, assignment } = await assignmentCtx(req.params.id, req.user);
  if (!recipient) throw new AppError(403, 'Only students can update their progress.');
  if (recipient.status !== 'assigned') throw new AppError(409, 'Progress can only be changed while the assignment is still new.');
  await db.query("UPDATE assignment_recipients SET status='in_progress', updated_at=now() WHERE assignment_id=$1 AND student_id=$2", [assignment.id, req.user.id]);
  res.json({ status: 'in_progress' });
}
async function submit(req, res) {
  const { assignment: a, recipient } = await assignmentCtx(req.params.id, req.user);
  if (!recipient) throw new AppError(403, 'Only students can submit work.');
  if (!a.requires_submission) throw new AppError(400, 'This assignment does not require a submission.');
  if (!['assigned', 'in_progress', 'returned'].includes(recipient.status)) throw new AppError(409, 'This work has already been submitted.');
  const d = new V(req.body).str('content', { max: 10000 }).uuid('file_id').done();
  if (!d.content && !d.file_id) throw new AppError(400, 'Add a file or write your answer before submitting.', { content: 'Add a file or write your answer.' });
  if (d.file_id && !(await db.query("SELECT 1 FROM shared_files WHERE id=$1 AND uploader_id=$2 AND purpose='submission' AND assignment_id=$3", [d.file_id, req.user.id, a.id])).rowCount)
    throw new AppError(400, 'Attachment not found.', { file_id: 'Attachment not found.' });
  const late = new Date() > new Date(a.due_at);
  await db.tx(async c => {
    await c.query(`INSERT INTO submissions(assignment_id,student_id,content,file_id,is_late) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT (assignment_id,student_id) DO UPDATE SET content=EXCLUDED.content,file_id=EXCLUDED.file_id,submitted_at=now(),is_late=EXCLUDED.is_late,attempt=submissions.attempt+1,marks=NULL,graded_at=NULL,graded_by=NULL`,
      [a.id, req.user.id, d.content, d.file_id, late]);
    await c.query("UPDATE assignment_recipients SET status='submitted', updated_at=now() WHERE assignment_id=$1 AND student_id=$2", [a.id, req.user.id]);
    await c.query("UPDATE personal_tasks SET status='completed', completed_at=COALESCE(completed_at,now()), updated_at=now() WHERE assignment_id=$1 AND user_id=$2 AND status<>'completed'", [a.id, req.user.id]);
  });
  logActivity(req.user.id, a.team_id, 'submission.create', 'assignment', a.id, { late });
  const staff = (await db.query("SELECT user_id FROM team_members WHERE team_id=$1 AND role IN ('owner','faculty')", [a.team_id])).rows.map(r => r.user_id);
  await notify(staff, { type: 'submission', title: `${req.user.name} submitted "${a.title}"`, body: late ? 'Submitted late' : 'Submitted on time', link: '/assignments.html?id=' + a.id });
  res.json({ status: 'submitted', is_late: late });
}
async function review(req, res) {
  const { assignment: a, staff } = await assignmentCtx(req.params.id, req.user);
  if (!staff) throw new AppError(403, 'Only faculty can review submissions.');
  const r = await db.query("UPDATE assignment_recipients SET status='under_review', updated_at=now() WHERE assignment_id=$1 AND student_id=$2 AND status='submitted'", [a.id, need(req.params.studentId)]);
  if (!r.rowCount) throw new AppError(409, 'Only submitted work can be moved to review.');
  await notify([req.params.studentId], { type: 'assignment', title: `"${a.title}" is under review`, link: '/assignments.html?id=' + a.id });
  res.json({ status: 'under_review' });
}
async function grade(req, res) {
  const { assignment: a, staff } = await assignmentCtx(req.params.id, req.user);
  if (!staff) throw new AppError(403, 'Only faculty can grade submissions.');
  const sid = need(req.params.studentId), v = new V(req.body).oneOf('action', ['grade', 'return']).str('feedback', { max: 4000 });
  const act = req.body?.action;
  if (act === 'return') v.str('feedback', { req: true, max: 4000, label: 'Feedback' });
  if (act === 'grade') {
    const m = Number(req.body.marks);
    if (req.body.marks === '' || req.body.marks == null || !isFinite(m) || m < 0 || m > a.max_marks) v.fail('marks', `Enter marks between 0 and ${a.max_marks}.`);
    v.o.marks = m;
  }
  const d = v.done();
  const cur = (await db.query('SELECT status FROM assignment_recipients WHERE assignment_id=$1 AND student_id=$2', [a.id, sid])).rows[0];
  if (!cur) throw new AppError(404, 'Student not found.');
  if (!['submitted', 'under_review', 'graded'].includes(cur.status)) throw new AppError(409, 'There is no submitted work to grade yet.');
  await db.tx(async c => {
    await c.query('UPDATE submissions SET feedback=$3, marks=$4, graded_by=$5, graded_at=now() WHERE assignment_id=$1 AND student_id=$2', [a.id, sid, d.feedback, d.action === 'grade' ? d.marks : null, req.user.id]);
    await c.query('UPDATE assignment_recipients SET status=$3, updated_at=now() WHERE assignment_id=$1 AND student_id=$2', [a.id, sid, d.action === 'grade' ? 'graded' : 'returned']);
  });
  logActivity(req.user.id, a.team_id, 'submission.' + d.action, 'assignment', a.id, { student: sid });
  await notify([sid], d.action === 'grade'
    ? { type: 'grade', title: `Graded: ${a.title}`, body: `You scored ${d.marks}/${a.max_marks}`, link: '/assignments.html?id=' + a.id }
    : { type: 'grade', title: `Returned for corrections: ${a.title}`, body: d.feedback.slice(0, 200), link: '/assignments.html?id=' + a.id });
  res.json({ status: d.action === 'grade' ? 'graded' : 'returned' });
}
async function remove(req, res) {
  const { assignment: a, staff } = await assignmentCtx(req.params.id, req.user);
  if (!staff) throw new AppError(403, 'Only faculty can delete assignments.');
  await db.query('DELETE FROM assignments WHERE id=$1', [a.id]);
  res.json({ message: 'Assignment deleted.' });
}
async function comments(req, res) {
  const { assignment: a } = await assignmentCtx(req.params.id, req.user);
  const { rows } = await db.query('SELECT c.id,c.parent_id,c.body,c.created_at,u.id AS user_id,u.name,u.role FROM comments c JOIN users u ON u.id=c.user_id WHERE c.assignment_id=$1 ORDER BY c.created_at', [a.id]);
  res.json({ comments: rows });
}
async function addComment(req, res) {
  const { assignment: a } = await assignmentCtx(req.params.id, req.user);
  const d = new V(req.body).str('body', { req: true, max: 2000, label: 'Comment' }).uuid('parent_id').done();
  if (d.parent_id && !(await db.query('SELECT 1 FROM comments WHERE id=$1 AND assignment_id=$2 AND parent_id IS NULL', [d.parent_id, a.id])).rowCount) throw new AppError(400, 'Invalid reply target.');
  const { rows } = await db.query('INSERT INTO comments(assignment_id,user_id,parent_id,body) VALUES($1,$2,$3,$4) RETURNING id,parent_id,body,created_at', [a.id, req.user.id, d.parent_id, d.body]);
  const c = { ...rows[0], user_id: req.user.id, name: req.user.name, role: req.user.role };
  const people = (await db.query("SELECT student_id AS id FROM assignment_recipients WHERE assignment_id=$1 UNION SELECT user_id FROM team_members WHERE team_id=$2 AND role IN ('owner','faculty')", [a.id, a.team_id])).rows.map(r => r.id);
  emitTo(people, 'comment:new', { assignment_id: a.id, comment: c });
  await notify(people.filter(p => p === a.created_by && p !== req.user.id), { type: 'comment', title: `${req.user.name} commented on "${a.title}"`, body: d.body.slice(0, 160), link: '/assignments.html?id=' + a.id });
  res.status(201).json({ comment: c });
}
module.exports = wrapAll({ list, create, getOne, progress, submit, review, grade, remove, comments, addComment });

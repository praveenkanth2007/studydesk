const multer = require('multer'), path = require('path'), fs = require('fs'), crypto = require('crypto');
const db = require('../config/db');
const { V, need } = require('../validators');
const { AppError, wrapAll } = require('../middleware/error');
const { needTeam, channelCtx, assignmentCtx, isStaffRole, teamRole } = require('../services/access');

const DIR = path.resolve(process.env.UPLOAD_DIR || './uploads'); fs.mkdirSync(DIR, { recursive: true });
const MAX = (Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024;
const EXT = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.csv', '.md', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.zip', '.py', '.js', '.java', '.c', '.cpp', '.sql']);
const upload = multer({
  storage: multer.diskStorage({ destination: DIR, filename: (req, f, cb) => cb(null, crypto.randomUUID() + path.extname(f.originalname).toLowerCase()) }),
  limits: { fileSize: MAX, files: 1 },
  fileFilter: (req, f, cb) => EXT.has(path.extname(f.originalname).toLowerCase()) ? cb(null, true) : cb(new AppError(400, 'That file type is not allowed.')),
}).single('file');

// A file is visible to: its uploader; team members (team/chat files); assignment recipients + staff (assignment files); staff only (submissions); admins.
const ACCESS = `(f.uploader_id=$1 OR $2
  OR (f.purpose IN ('team','chat') AND f.team_id IN (SELECT team_id FROM team_members WHERE user_id=$1))
  OR (f.purpose='assignment' AND (EXISTS (SELECT 1 FROM assignment_recipients ar WHERE ar.assignment_id=f.assignment_id AND ar.student_id=$1)
        OR f.team_id IN (SELECT team_id FROM team_members WHERE user_id=$1 AND role IN ('owner','faculty'))))
  OR EXISTS (SELECT 1 FROM messages m WHERE m.file_id=f.id AND (m.recipient_id=$1 OR m.sender_id=$1))
  OR (f.purpose='submission' AND f.team_id IN (SELECT team_id FROM team_members WHERE user_id=$1 AND role IN ('owner','faculty'))))`;
const cleanName = n => path.basename(String(n)).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').slice(0, 200) || 'file';

async function create(req, res) {
  const f = req.file; if (!f) throw new AppError(400, 'Choose a file to upload.');
  try {
    const d = new V(req.body).oneOf('purpose', ['team', 'chat', 'assignment', 'submission', 'personal'], 'personal').uuid('team_id').uuid('channel_id').uuid('assignment_id').done();
    let teamId = null, channelId = null, assignmentId = null;
    if (d.purpose === 'chat') { const { channel } = await channelCtx(d.channel_id, req.user); teamId = channel.team_id; channelId = channel.id; }
    else if (d.purpose === 'team') { await needTeam(need(d.team_id), req.user); teamId = d.team_id; }
    else if (d.purpose === 'assignment') {
      if (!['faculty', 'admin'].includes(req.user.role)) throw new AppError(403, 'Only faculty can attach files to assignments.');
      await needTeam(need(d.team_id), req.user, true); teamId = d.team_id; assignmentId = d.assignment_id;
      if (assignmentId) { const c = await assignmentCtx(assignmentId, req.user); if (!c.staff || c.assignment.team_id !== teamId) throw new AppError(403, 'Not allowed.'); }
    } else if (d.purpose === 'submission') {
      const c = await assignmentCtx(need(d.assignment_id), req.user);
      if (c.staff) throw new AppError(403, 'Only students can upload submissions.');
      teamId = c.assignment.team_id; assignmentId = c.assignment.id;
    }
    const { rows } = await db.query(
      `INSERT INTO shared_files(uploader_id,team_id,channel_id,assignment_id,purpose,original_name,stored_name,mime_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id,original_name,size_bytes,mime_type,purpose,team_id,created_at`,
      [req.user.id, teamId, channelId, assignmentId, d.purpose, cleanName(f.originalname), f.filename, f.mimetype || 'application/octet-stream', f.size]);
    res.status(201).json({ file: rows[0] });
  } catch (e) { fs.unlink(f.path, () => {}); throw e; }
}
async function list(req, res) {
  const p = [req.user.id, req.user.role === 'admin'], w = [ACCESS], { team_id, q } = req.query;
  if (team_id) { p.push(need(team_id)); w.push(`f.team_id=$${p.length}`); }
  if (q) { p.push('%' + String(q).slice(0, 80).replace(/[\\%_]/g, '\\$&') + '%'); w.push(`f.original_name ILIKE $${p.length}`); }
  const { rows } = await db.query(
    `SELECT f.id,f.original_name,f.size_bytes,f.mime_type,f.purpose,f.created_at,f.team_id,t.name AS team_name,u.name AS uploader_name,f.uploader_id
     FROM shared_files f JOIN users u ON u.id=f.uploader_id LEFT JOIN teams t ON t.id=f.team_id WHERE ${w.join(' AND ')} ORDER BY f.created_at DESC LIMIT 200`, p);
  res.json({ files: rows });
}
async function download(req, res) {
  const { rows } = await db.query(`SELECT f.* FROM shared_files f WHERE f.id=$3 AND ${ACCESS}`, [req.user.id, req.user.role === 'admin', need(req.params.id)]);
  const f = rows[0]; if (!f) throw new AppError(404, 'File not found.');
  const full = path.join(DIR, f.stored_name);
  if (!full.startsWith(DIR) || !fs.existsSync(full)) throw new AppError(404, 'File is no longer available.');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(full, f.original_name);
}
async function remove(req, res) {
  const f = (await db.query('SELECT * FROM shared_files WHERE id=$1', [need(req.params.id)])).rows[0];
  if (!f) throw new AppError(404, 'File not found.');
  let ok = f.uploader_id === req.user.id || req.user.role === 'admin';
  if (!ok && f.team_id && ['team', 'chat'].includes(f.purpose)) ok = isStaffRole(await teamRole(f.team_id, req.user));
  if (!ok) throw new AppError(403, 'You cannot delete this file.');
  await db.query('DELETE FROM shared_files WHERE id=$1', [f.id]);
  fs.unlink(path.join(DIR, f.stored_name), () => {});
  res.json({ message: 'File deleted.' });
}
module.exports = { upload, ...wrapAll({ create, list, download, remove }) };

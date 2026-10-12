const bcrypt = require('bcryptjs'), crypto = require('crypto');
const db = require('../config/db');
const { V } = require('../validators');
const { AppError, wrapAll } = require('../middleware/error');
const { setSession, clearSession, USER_COLS } = require('../middleware/auth');
const { shareTeam } = require('../services/access');
const { like } = require('../services/utils');
const DUMMY = bcrypt.hashSync('timing-equalizer', 12);
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

async function register(req, res) {
  const v = new V(req.body);
  v.str('name', { min: 2, max: 100, req: true, label: 'Full name' }).email().password().str('department', { max: 100 }).oneOf('role', ['student', 'faculty'], 'student');
  const d = v.done();
  if (d.role === 'faculty') {
    const code = process.env.FACULTY_SIGNUP_CODE;
    if (!code) throw new AppError(403, 'Faculty sign-up is disabled. Ask an administrator to create your account.', { role: 'Faculty sign-up is disabled.' });
    if (!safeEq(req.body.faculty_code || '', code)) throw new AppError(403, 'Invalid faculty access code.', { faculty_code: 'Invalid faculty access code.' });
  }
  if ((await db.query('SELECT 1 FROM users WHERE lower(email)=$1', [d.email])).rowCount)
    throw new AppError(409, 'An account with this email already exists.', { email: 'An account with this email already exists.' });
  const hash = await bcrypt.hash(d.password, 12);
  const { rows } = await db.query(`INSERT INTO users(name,email,password_hash,role,department) VALUES($1,$2,$3,$4,$5) RETURNING ${USER_COLS}`, [d.name, d.email, hash, d.role, d.department]);
  setSession(res, rows[0].id);
  res.status(201).json({ user: rows[0] });
}
async function login(req, res) {
  const v = new V(req.body); v.email();
  if (typeof req.body?.password !== 'string' || !req.body.password) v.fail('password', 'Enter your password.');
  const d = v.done();
  const { rows } = await db.query('SELECT * FROM users WHERE lower(email)=$1', [d.email]);
  const ok = await bcrypt.compare(req.body.password, rows[0]?.password_hash || DUMMY);
  if (!rows[0] || !ok) throw new AppError(401, 'Incorrect email or password.');
  const { password_hash, ...user } = rows[0];
  setSession(res, user.id);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department, theme: user.theme, daily_goal: user.daily_goal } });
}
const logout = (req, res) => { clearSession(res); res.json({ message: 'Signed out.' }); };
const me = (req, res) => res.json({ user: req.user });
async function profile(req, res) {
  const b = req.body || {}, v = new V(b), sets = [], p = [req.user.id];
  const add = (col, val) => { p.push(val); sets.push(`${col}=$${p.length}`); };
  if ('name' in b) { v.str('name', { min: 2, max: 100, req: true, label: 'Full name' }); }
  if ('department' in b) v.str('department', { max: 100 });
  if ('theme' in b) v.oneOf('theme', ['dark', 'light']);
  if ('daily_goal' in b) v.int('daily_goal', { min: 1, max: 20, label: 'Daily goal' });
  const d = v.done();
  for (const k of ['name', 'department', 'theme', 'daily_goal']) if (k in b) add(k, d[k]);
  if (!sets.length) throw new AppError(400, 'Nothing to update.');
  const { rows } = await db.query(`UPDATE users SET ${sets.join(',')}, updated_at=now() WHERE id=$1 RETURNING ${USER_COLS}`, p);
  res.json({ user: rows[0] });
}
async function password(req, res) {
  const v = new V(req.body); v.password('new_password');
  if (typeof req.body?.current_password !== 'string' || !req.body.current_password) v.fail('current_password', 'Enter your current password.');
  v.done();
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await bcrypt.compare(req.body.current_password, rows[0].password_hash)))
    throw new AppError(400, 'Current password is incorrect.', { current_password: 'Current password is incorrect.' });
  await db.query('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1', [req.user.id, await bcrypt.hash(req.body.new_password, 12)]);
  res.json({ message: 'Password changed.' });
}
// People the user can message / assign: anyone who shares a team (admins: everyone)
async function searchUsers(req, res) {
  const q = String(req.query.q || '').trim();
  const { rows } = await db.query(
    `SELECT u.id,u.name,u.role,u.department FROM users u WHERE u.id<>$1 AND ($2='' OR u.name ILIKE $3)
       AND ($4 OR EXISTS (SELECT 1 FROM team_members a JOIN team_members b ON a.team_id=b.team_id WHERE a.user_id=$1 AND b.user_id=u.id))
     ORDER BY u.name LIMIT 12`, [req.user.id, q, like(q), req.user.role === 'admin']);
  res.json({ users: rows });
}
async function adminUsers(req, res) {
  const { rows } = await db.query('SELECT id,name,email,role,department,created_at,last_seen_at FROM users ORDER BY created_at DESC LIMIT 200');
  res.json({ users: rows });
}
async function adminSetRole(req, res) {
  const d = new V(req.body).oneOf('role', ['student', 'faculty', 'admin']).done();
  if (req.params.id === req.user.id) throw new AppError(400, 'You cannot change your own role.');
  const r = await db.query('UPDATE users SET role=$2, updated_at=now() WHERE id=$1 RETURNING id,name,email,role', [req.params.id, d.role]);
  if (!r.rowCount) throw new AppError(404, 'User not found.');
  res.json({ user: r.rows[0] });
}
module.exports = wrapAll({ register, login, logout, me, profile, password, searchUsers, adminUsers, adminSetRole });

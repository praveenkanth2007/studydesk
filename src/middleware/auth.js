const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { AppError } = require('./error');
const COOKIE = 'nf_token';
const DAYS = Number(process.env.SESSION_DAYS) || 7;
const cookieOpts = () => ({ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: DAYS * 864e5, path: '/' });
const sign = id => jwt.sign({ sub: id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: DAYS + 'd' });
const setSession = (res, id) => res.cookie(COOKIE, sign(id), cookieOpts());
const clearSession = res => res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });
const USER_COLS = 'id,name,email,role,department,theme,daily_goal,created_at';
async function userFromToken(token) {
  if (!token) return null;
  try {
    const { sub } = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const { rows } = await db.query(`SELECT ${USER_COLS} FROM users WHERE id=$1`, [sub]);
    return rows[0] || null;
  } catch { return null; }
}
const requireAuth = async (req, res, next) => {
  try {
    const user = await userFromToken(req.cookies?.[COOKIE]);
    if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
    req.user = user; next();
  } catch (e) { next(e); }
};
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new AppError(403, 'You do not have permission to do that.'));
module.exports = { COOKIE, setSession, clearSession, requireAuth, requireRole, userFromToken, USER_COLS };

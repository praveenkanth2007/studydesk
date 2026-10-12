const rateLimit = require('express-rate-limit');
const mk = (windowMs, limit, message) => rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: message } });
exports.authLimiter = mk(15 * 60e3, 30, 'Too many attempts. Please wait a few minutes and try again.');
exports.joinLimiter = mk(15 * 60e3, 20, 'Too many invitation-code attempts. Please wait and try again.');
exports.uploadLimiter = mk(15 * 60e3, 80, 'Too many uploads. Please wait a few minutes.');
exports.aiLimiter = mk(10 * 60e3, 40, 'You are asking the assistant too quickly. Please wait a moment.');
exports.apiLimiter = mk(15 * 60e3, 2000, 'Too many requests. Please slow down.');
// Cookie auth + SameSite=Lax already blocks cross-site POSTs; this adds an explicit Origin check for state-changing calls.
exports.sameOrigin = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const o = req.headers.origin;
  if (!o) return next();
  const allowed = (process.env.CLIENT_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  try { if (new URL(o).host === req.headers.host || allowed.includes(o)) return next(); } catch { /* fallthrough */ }
  res.status(403).json({ error: 'Cross-site request blocked.' });
};

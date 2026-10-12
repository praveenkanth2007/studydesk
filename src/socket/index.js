const { Server } = require('socket.io'), cookie = require('cookie');
const db = require('../config/db');
const { COOKIE, userFromToken } = require('../middleware/auth');
const { setIO } = require('./io');
const online = new Map(); // userId -> number of open sockets
exports.onlineIds = () => [...online.keys()];
exports.init = server => {
  const allowed = (process.env.CLIENT_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const io = new Server(server, { cors: allowed.length ? { origin: allowed, credentials: true } : undefined });
  io.use(async (socket, next) => {
    const user = await userFromToken(cookie.parse(socket.handshake.headers.cookie || '')[COOKIE]);
    if (!user) return next(new Error('unauthorized'));
    socket.user = user; next();
  });
  io.on('connection', socket => {
    const id = socket.user.id;
    socket.join('user:' + id); // every real-time event is delivered to per-user rooms after server-side authorization
    const n = (online.get(id) || 0) + 1; online.set(id, n);
    if (n === 1) io.emit('presence', { user_id: id, online: true });
    socket.emit('presence:list', exports.onlineIds());
    socket.on('disconnect', () => {
      const left = (online.get(id) || 1) - 1;
      if (left <= 0) { online.delete(id); io.emit('presence', { user_id: id, online: false }); db.query('UPDATE users SET last_seen_at=now() WHERE id=$1', [id]).catch(() => {}); }
      else online.set(id, left);
    });
  });
  setIO(io); return io;
};

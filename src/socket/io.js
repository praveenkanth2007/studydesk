let io = null;
exports.setIO = i => { io = i; };
exports.getIO = () => io;
exports.emitTo = (userIds, event, payload) => { if (!io) return; [...new Set(userIds)].forEach(id => io.to('user:' + id).emit(event, payload)); };

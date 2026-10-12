const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const S = require('../middleware/security');
const A = require('../controllers/auth'), T = require('../controllers/tasks'), Tm = require('../controllers/teams'), C = require('../controllers/chat'),
  As = require('../controllers/assignments'), F = require('../controllers/files'), N = require('../controllers/notifications'),
  I = require('../controllers/insights'), AI = require('../controllers/ai');

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.post('/auth/register', S.authLimiter, A.register);
router.post('/auth/login', S.authLimiter, A.login);
router.post('/auth/logout', A.logout);

router.use(requireAuth); // everything below needs a valid session cookie
router.get('/auth/me', A.me);
router.put('/auth/profile', A.profile);
router.put('/auth/password', S.authLimiter, A.password);
router.get('/users/search', A.searchUsers);
router.get('/admin/users', requireRole('admin'), A.adminUsers);
router.patch('/admin/users/:id/role', requireRole('admin'), A.adminSetRole);

router.get('/tasks', T.list); router.post('/tasks', T.create);
router.patch('/subtasks/:sid', T.patchSubtask); router.delete('/subtasks/:sid', T.removeSubtask);
router.get('/tasks/:id', T.getOne); router.put('/tasks/:id', T.update); router.delete('/tasks/:id', T.remove);
router.patch('/tasks/:id/status', T.setStatus); router.put('/tasks/:id/share', T.share); router.post('/tasks/:id/subtasks', T.addSubtask);

router.get('/teams', Tm.list); router.post('/teams', Tm.create); router.post('/teams/join', S.joinLimiter, Tm.join);
router.get('/teams/:id', Tm.getOne); router.delete('/teams/:id', Tm.remove); router.get('/teams/:id/tasks', Tm.sharedTasks);
router.post('/teams/:id/channels', Tm.addChannel); router.post('/teams/:id/invite-code', Tm.regenerateCode);
router.post('/teams/:id/invite', Tm.inviteByEmail); router.delete('/teams/:id/members/:userId', Tm.removeMember);

router.get('/chat/overview', C.overview); router.post('/chat/read', C.read);
router.get('/channels/:id/messages', C.channelMessages); router.post('/channels/:id/messages', C.postChannel);
router.get('/messages/:id/thread', C.threadMessages);
router.get('/dm/:userId/messages', C.dmMessages); router.post('/dm/:userId/messages', C.postDm);

router.get('/assignments', As.list); router.post('/assignments', As.create);
router.get('/assignments/:id', As.getOne); router.delete('/assignments/:id', As.remove);
router.patch('/assignments/:id/progress', As.progress); router.post('/assignments/:id/submit', As.submit);
router.post('/assignments/:id/students/:studentId/review', As.review); router.post('/assignments/:id/students/:studentId/grade', As.grade);
router.get('/assignments/:id/comments', As.comments); router.post('/assignments/:id/comments', As.addComment);

router.post('/files', S.uploadLimiter, F.upload, F.create); router.get('/files', F.list);
router.get('/files/:id/download', F.download); router.delete('/files/:id', F.remove);

router.get('/notifications', N.list); router.patch('/notifications/read-all', N.readAll);
router.patch('/notifications/:id/read', N.read); router.delete('/notifications/:id', N.remove);

router.get('/dashboard', I.dashboard); router.get('/calendar', I.calendar); router.get('/analytics', I.analytics);
router.get('/search', I.search); router.get('/badges', I.badges);

router.get('/ai/status', AI.status); router.use('/ai', S.aiLimiter);
router.get('/ai/schedule', AI.schedule); router.get('/ai/next', AI.next); router.get('/ai/conflicts', AI.conflicts); router.get('/ai/report', AI.report);
router.post('/ai/summarize', AI.summarize); router.post('/ai/breakdown', AI.breakdown); router.post('/ai/chat', AI.chat);
module.exports = router;

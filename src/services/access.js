const db = require('../config/db');
const { AppError } = require('../middleware/error');
const { isUuid } = require('../validators');
const STAFF = ['owner', 'faculty', 'admin'];
const isStaffRole = r => STAFF.includes(r);
// Returns the user's role in the team ('owner'|'faculty'|'member'|'admin') or null if they have no access.
async function teamRole(teamId, user) {
  if (!isUuid(teamId)) return null;
  if (user.role === 'admin') { const t = await db.query('SELECT 1 FROM teams WHERE id=$1', [teamId]); return t.rowCount ? 'admin' : null; }
  const r = await db.query('SELECT role FROM team_members WHERE team_id=$1 AND user_id=$2', [teamId, user.id]);
  return r.rows[0]?.role || null;
}
async function needTeam(teamId, user, staff = false) {
  const role = await teamRole(teamId, user);
  if (!role) throw new AppError(404, 'Team not found.');
  if (staff && !isStaffRole(role)) throw new AppError(403, 'Only team owners and faculty can do that.');
  return role;
}
async function channelCtx(channelId, user) {
  if (!isUuid(channelId)) throw new AppError(404, 'Channel not found.');
  const { rows } = await db.query('SELECT c.*, t.name AS team_name FROM channels c JOIN teams t ON t.id=c.team_id WHERE c.id=$1', [channelId]);
  if (!rows[0]) throw new AppError(404, 'Channel not found.');
  const role = await teamRole(rows[0].team_id, user);
  if (!role) throw new AppError(404, 'Channel not found.');
  return { channel: rows[0], role };
}
// Access to an assignment: staff of the owning team, or a recipient.
async function assignmentCtx(id, user) {
  if (!isUuid(id)) throw new AppError(404, 'Assignment not found.');
  const { rows } = await db.query('SELECT a.*, t.name AS team_name FROM assignments a JOIN teams t ON t.id=a.team_id WHERE a.id=$1', [id]);
  const a = rows[0]; if (!a) throw new AppError(404, 'Assignment not found.');
  const role = await teamRole(a.team_id, user);
  const staff = !!role && isStaffRole(role) && ['faculty', 'admin'].includes(user.role);
  let recipient = null;
  if (!staff) {
    const r = await db.query('SELECT * FROM assignment_recipients WHERE assignment_id=$1 AND student_id=$2', [id, user.id]);
    recipient = r.rows[0] || null;
    if (!recipient) throw new AppError(404, 'Assignment not found.');
  }
  return { assignment: a, staff, recipient, role };
}
async function shareTeam(a, b) {
  const r = await db.query('SELECT 1 FROM team_members x JOIN team_members y ON x.team_id=y.team_id WHERE x.user_id=$1 AND y.user_id=$2 LIMIT 1', [a, b]);
  return r.rowCount > 0;
}
module.exports = { teamRole, needTeam, channelCtx, assignmentCtx, shareTeam, isStaffRole };

const { V } = require('../validators');
const { AppError, wrapAll } = require('../middleware/error');
const ai = require('../services/ai');
const db = require('../config/db');
const { assignmentCtx } = require('../services/access');
const { tzOf } = require('../services/utils');

const status = (req, res) => res.json({ provider: process.env.ANTHROPIC_API_KEY ? 'claude' : 'rules' });
async function schedule(req, res) { const h = Math.min(12, Math.max(1, Number(req.query.hours) || 4)); res.json(await ai.schedule(req.user.id, tzOf(req), h, 3)); }
const next = async (req, res) => res.json(await ai.nextTask(req.user.id));
const conflicts = async (req, res) => res.json(await ai.conflicts(req.user.id, tzOf(req)));
const report = async (req, res) => res.json(await ai.report(req.user.id, tzOf(req)));
async function summarize(req, res) {
  const d = new V(req.body).uuid('assignment_id', { req: true }).done(); const { assignment: a } = await assignmentCtx(d.assignment_id, req.user);
  res.json({ title: a.title, ...ai.summarize(a.instructions, a.due_at) });
}
async function breakdown(req, res) {
  const d = new V(req.body).uuid('assignment_id', { req: true }).bool('apply').done(); const { assignment: a, recipient } = await assignmentCtx(d.assignment_id, req.user);
  const steps = ai.breakdown(a.instructions, a.due_at);
  if (!d.apply) return res.json({ title: a.title, steps, applied: false });
  if (!recipient) throw new AppError(403, 'Only students can create tasks from an assignment.');
  const created = await db.tx(async c => {
    const out = [];
    for (const [i, s] of steps.entries()) {
      const r = await c.query(`INSERT INTO personal_tasks(user_id,title,description,priority,category,due_at,est_minutes,assignment_id,position)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,(SELECT COALESCE(max(position),0)+1000 FROM personal_tasks WHERE user_id=$1)) RETURNING id,title`, [req.user.id, s.title.slice(0, 150), `Step ${i + 1} for “${a.title}”`, a.priority, a.subject.slice(0, 40), s.due_at, s.est_minutes, a.id]);
      out.push(r.rows[0]);
    }
    return out;
  });
  res.status(201).json({ title: a.title, steps, applied: true, created: created.length });
}
async function chat(req, res) {
  const d = new V(req.body).str('message', { req: true, max: 600, label: 'Message' }).done(), tz = tzOf(req), m = d.message.toLowerCase();
  const wants = { schedule: /schedul|plan my|timetable|study plan/.test(m), next: /next|what should|start with|prioriti/.test(m), conflicts: /conflict|overload|busy|clash|too much/.test(m), report: /report|progress|how am i|summary|week/.test(m) };
  const ctx = {};
  if (wants.next || !Object.values(wants).some(Boolean)) ctx.next = await ai.nextTask(req.user.id);
  if (wants.schedule) ctx.schedule = await ai.schedule(req.user.id, tz);
  if (wants.conflicts) ctx.conflicts = await ai.conflicts(req.user.id, tz);
  if (wants.report) ctx.report = await ai.report(req.user.id, tz);
  const llm = await ai.askClaude('You are NeonFlow\'s study assistant for college students. Answer briefly and concretely using ONLY the JSON data provided about the student\'s real tasks. If data is missing, say so.', `Student question: ${d.message}\n\nData:\n${JSON.stringify(ctx).slice(0, 6000)}`);
  if (llm) return res.json({ reply: llm, source: 'claude', data: ctx });
  const parts = [];
  if (ctx.next) parts.push(ctx.next.task ? `Work on "${ctx.next.task.title}" next — ${ctx.next.task.reasons.join(', ')}.` : ctx.next.message);
  if (ctx.schedule) parts.push(ctx.schedule.slots.length ? `I scheduled ${ctx.schedule.slots.length} study block(s) over the next 3 days. ${ctx.schedule.tip}` : 'You have no open tasks to schedule.');
  if (ctx.conflicts) parts.push(ctx.conflicts.overloaded_days ? `${ctx.conflicts.overloaded_days} day(s) look overloaded in the next two weeks.` : 'No overloaded days in the next two weeks.', ctx.conflicts.overdue.length ? `${ctx.conflicts.overdue.length} task(s) are overdue.` : '');
  if (ctx.report) parts.push(ctx.report.summary);
  res.json({ reply: parts.filter(Boolean).join(' '), source: 'rules', data: ctx });
}
module.exports = wrapAll({ status, schedule, next, conflicts, report, summarize, breakdown, chat });

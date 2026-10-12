// Study-assistant logic. Everything is computed from the student's real data; an LLM is optional.
const db = require('../config/db');
const PRI = { high: 30, medium: 15, low: 5 };
const dayKey = (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

async function openTasks(userId) {
  return (await db.query("SELECT id,title,priority,category,due_at,est_minutes,status,assignment_id FROM personal_tasks WHERE user_id=$1 AND status<>'completed'", [userId])).rows;
}
function score(t, now = Date.now()) {
  let s = PRI[t.priority] || 10; const why = [`${t.priority} priority`];
  if (t.due_at) {
    const hrs = (new Date(t.due_at) - now) / 36e5;
    if (hrs < 0) { s += 60 + Math.min(40, (-hrs / 24) * 5); why.unshift(`overdue by ${Math.ceil(-hrs / 24) || 1} day(s)`); }
    else { s += 50 / (1 + hrs / 24); why.push(hrs < 24 ? 'due within 24 hours' : `due in ${Math.round(hrs / 24)} day(s)`); }
  } else why.push('no deadline set');
  if (t.status === 'in_progress') { s += 10; why.push('already in progress'); }
  if (t.est_minutes && t.est_minutes <= 30) { s += 5; why.push('quick win (≤30 min)'); }
  return { s, why };
}
async function nextTask(userId) {
  const ranked = (await openTasks(userId)).map(t => ({ ...t, ...score(t) })).sort((a, b) => b.s - a.s);
  if (!ranked.length) return { task: null, alternatives: [], message: 'You have no open tasks. Add one or enjoy the free time!' };
  const top = ranked[0];
  return { task: { id: top.id, title: top.title, due_at: top.due_at, priority: top.priority, reasons: top.why }, alternatives: ranked.slice(1, 4).map(t => ({ id: t.id, title: t.title, due_at: t.due_at, priority: t.priority })) };
}
async function schedule(userId, tz, hours = 4, days = 3) {
  const cap = Math.round(hours * 60), today = dayKey(new Date(), tz);
  const tasks = (await openTasks(userId)).sort((a, b) => (a.due_at ? +new Date(a.due_at) : 9e15) - (b.due_at ? +new Date(b.due_at) : 9e15) || (PRI[b.priority] - PRI[a.priority]));
  const slots = []; let day = 0, used = 0, left = tasks.length;
  const queue = tasks.map(t => ({ t, rem: t.est_minutes || 60 }));
  while (queue.length && day < days) {
    const q = queue[0], take = Math.min(q.rem, cap - used);
    if (take <= 0) { day++; used = 0; continue; }
    const date = addDays(today, day), start = 9 * 60 + used;
    const late = q.t.due_at && dayKey(new Date(q.t.due_at), tz) < date;
    slots.push({ date, start: hm(start), end: hm(start + take), minutes: take, task_id: q.t.id, title: q.t.title, due_at: q.t.due_at, late_risk: !!late });
    used += take; q.rem -= take; if (q.rem <= 0) { queue.shift(); left--; }
    if (used >= cap) { day++; used = 0; }
  }
  return { hours_per_day: hours, slots, unscheduled: queue.map(q => ({ id: q.t.id, title: q.t.title })), tip: slots.some(s => s.late_risk) ? 'Some tasks are scheduled after their deadline. Consider more study hours or moving deadlines.' : 'Your schedule fits before every deadline.' };
}
async function conflicts(userId, tz) {
  const [tasks, asg] = await Promise.all([openTasks(userId),
    db.query("SELECT a.id,a.title,a.due_at FROM assignment_recipients ar JOIN assignments a ON a.id=ar.assignment_id WHERE ar.student_id=$1 AND ar.status IN ('assigned','in_progress','returned')", [userId])]);
  const today = dayKey(new Date(), tz), end = addDays(today, 14), by = {}, overdue = [];
  for (const t of tasks) { if (!t.due_at) continue; const k = dayKey(new Date(t.due_at), tz); if (new Date(t.due_at) < new Date()) { overdue.push({ id: t.id, title: t.title, due_at: t.due_at }); continue; } if (k <= end) (by[k] ||= { items: [], minutes: 0, deadlines: 0 }, by[k].items.push({ kind: 'task', title: t.title }), by[k].minutes += t.est_minutes || 60); }
  for (const a of asg.rows) { const k = dayKey(new Date(a.due_at), tz); if (k >= today && k <= end) (by[k] ||= { items: [], minutes: 0, deadlines: 0 }, by[k].items.push({ kind: 'assignment', title: a.title }), by[k].deadlines++); }
  const days = Object.entries(by).sort().map(([date, v]) => {
    const reasons = []; if (v.minutes > 360) reasons.push(`${(v.minutes / 60).toFixed(1)} hours of work due`); if (v.items.length >= 3) reasons.push(`${v.items.length} deadlines on one day`);
    return { date, items: v.items, minutes: v.minutes, overloaded: reasons.length > 0, reasons };
  });
  return { days, overdue, overloaded_days: days.filter(d => d.overloaded).length };
}
const STEP_WORDS = /\b(design|identify|convert|normalize|write|implement|create|include|submit|compare|explain|justify|analy[sz]e|solve|complete|prepare|research|draw|list|describe|build|test|calculate|answer)\b/i;
function sentences(text) { return String(text).split(/\n+|(?<=[.!?])\s+/).map(s => s.replace(/^[\s\-*•\d.)]+/, '').trim()).filter(s => s.length > 8); }
function summarize(text, dueAt) {
  const ss = sentences(text), words = String(text).split(/\s+/).filter(Boolean).length;
  const key = ss.filter(s => /\b(must|should|required|include|submit|deadline|marks?|format|word|pages?|minimum|maximum|late|deduct)/i.test(s) || STEP_WORDS.test(s)).slice(0, 6);
  return { word_count: words, key_points: key.length ? key : ss.slice(0, 4), deliverables: ss.filter(s => /\b(submit|upload|pdf|report|file|include|attach)\b/i.test(s)).slice(0, 3), due_at: dueAt, reading_minutes: Math.max(1, Math.round(words / 200)) };
}
function breakdown(text, dueAt) {
  const actions = sentences(text).filter(s => STEP_WORDS.test(s) && !/^submit/i.test(s)).slice(0, 6).map(s => s.replace(/\.$/, '').slice(0, 140));
  const steps = [{ title: 'Read the instructions and note requirements', est: 20 }, ...actions.map(a => ({ title: a, est: 60 })), { title: 'Review work against the requirements', est: 30 }, { title: 'Proofread and submit', est: 20 }];
  const now = Date.now(), end = new Date(dueAt).getTime() - 4 * 36e5, span = Math.max(end - now, 36e5);
  return steps.map((s, i) => ({ title: s.title, est_minutes: s.est, due_at: new Date(now + span * ((i + 1) / steps.length)).toISOString() }));
}
async function report(userId, tz) {
  const [r, cat, days] = await Promise.all([
    db.query(`SELECT count(*) FILTER (WHERE created_at>now()-interval '7 days')::int created, count(*) FILTER (WHERE completed_at>now()-interval '7 days')::int completed,
        count(*) FILTER (WHERE status<>'completed' AND due_at<now())::int overdue, COALESCE(sum(actual_minutes) FILTER (WHERE completed_at>now()-interval '7 days'),0)::int minutes,
        count(*) FILTER (WHERE completed_at>now()-interval '7 days' AND due_at IS NOT NULL AND completed_at<=due_at)::int on_time,
        count(*) FILTER (WHERE completed_at>now()-interval '7 days' AND due_at IS NOT NULL)::int with_due FROM personal_tasks WHERE user_id=$1`, [userId]),
    db.query("SELECT category,count(*)::int c FROM personal_tasks WHERE user_id=$1 AND completed_at>now()-interval '7 days' AND category<>'' GROUP BY 1 ORDER BY c DESC LIMIT 1", [userId]),
    db.query("SELECT DISTINCT timezone($2,completed_at)::date AS d FROM personal_tasks WHERE user_id=$1 AND completed_at IS NOT NULL ORDER BY d DESC LIMIT 60", [userId, tz]),
  ]);
  const s = r.rows[0]; let streak = 0, cur = dayKey(new Date(), tz); const have = new Set(days.rows.map(x => typeof x.d === 'string' ? x.d : dayKey(x.d, 'UTC')));
  if (!have.has(cur)) cur = addDays(cur, -1);
  while (have.has(cur)) { streak++; cur = addDays(cur, -1); }
  const onTime = s.with_due ? Math.round(s.on_time / s.with_due * 100) : null;
  const lines = [`This week you created ${s.created} task(s) and completed ${s.completed}.`, s.overdue ? `${s.overdue} task(s) are overdue — start there.` : 'Nothing is overdue. Great discipline!',
    onTime !== null ? `${onTime}% of completed tasks were finished on time.` : null, s.minutes ? `You logged about ${(s.minutes / 60).toFixed(1)} hours of focused work.` : null,
    cat.rows[0] ? `Most progress was in ${cat.rows[0].category}.` : null, streak ? `Current streak: ${streak} day(s) with a completed task.` : 'Complete a task today to start a streak.'].filter(Boolean);
  return { created: s.created, completed: s.completed, overdue: s.overdue, hours: +(s.minutes / 60).toFixed(1), on_time_rate: onTime, top_category: cat.rows[0]?.category || null, streak, summary: lines.join(' ') };
}
async function askClaude(system, prompt) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) return null;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-sonnet-4-6', max_tokens: 700, system, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) { console.error('AI provider error', r.status); return null; }
    const j = await r.json(); return j.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || null;
  } catch (e) { console.error('AI provider failed:', e.message); return null; } finally { clearTimeout(timer); }
}
module.exports = { nextTask, schedule, conflicts, summarize, breakdown, report, askClaude, score };

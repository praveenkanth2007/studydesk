NF.start(async (main, me) => {
  const S = { view: localStorage.getItem('nf_tview') || 'kanban', q: '', status: '', priority: '', category: '', team_id: '', sort: 'manual', month: new Date(), week: new Date() };
  let tasks = [], cats = [], teams = [], goal = { done: 0, goal: me.daily_goal };
  const qs = () => '/tasks?' + new URLSearchParams(Object.entries({ q: S.q, status: S.status, priority: S.priority, category: S.category, team_id: S.team_id, sort: S.sort }).filter(([, v]) => v)).toString();
  async function load() { const [t, d, tm] = await Promise.all([api(qs()), api('/dashboard'), teams.length ? { teams } : api('/teams')]); tasks = t.tasks; cats = t.categories; teams = tm.teams; goal = { done: d.counts.completed_today, goal: d.daily_goal }; }
  const card = t => { const od = isOverdue(t), cd = t.due_at ? countdown(t.due_at, t.status === 'completed') : null;
    return `<div class="tcard ${od ? 'overdue' : ''}" draggable="true" data-id="${t.id}"><div class="ttl">${esc(t.title)}</div><div class="meta">${prioBadge(t.priority)}${t.category ? `<span class="badge">${esc(t.category)}</span>` : ''}${t.shared_team_name ? `<span class="badge b-vio" title="Shared with team">${ic('team', 12)}${esc(t.shared_team_name)}</span>` : ''}</div>
    <div class="meta">${cd ? `<span class="badge b-${cd.cls}">${ic('clock', 12)}${cd.text}</span>` : '<span>No due date</span>'}${t.subtask_total ? `<span>${ic('check', 12)} ${t.subtask_done}/${t.subtask_total}</span>` : ''}${t.assignment_title ? `<span class="badge b-submitted">${ic('assign', 12)}Assignment</span>` : ''}</div></div>`; };
  const row = t => { const cd = t.due_at ? countdown(t.due_at, t.status === 'completed') : null;
    return `<div class="li ${t.status === 'completed' ? 'done' : ''}" data-id="${t.id}"><button class="chk ${t.status === 'completed' ? 'on' : ''}" data-chk="${t.id}" aria-label="Toggle complete">${ic('check', 14)}</button><div class="body"><div class="ttl">${esc(t.title)}</div><div class="meta">${prioBadge(t.priority)}${statusBadge(t.status)}${t.category ? `<span class="badge">${esc(t.category)}</span>` : ''}${cd ? `<span class="badge b-${cd.cls}">${ic('clock', 12)}${cd.text}</span>` : ''}${t.subtask_total ? `<span>${t.subtask_done}/${t.subtask_total} done</span>` : ''}</div></div></div>`; };
  function body() {
    if (!tasks.length) return `<div class="card">${empty('tasks', S.q || S.status || S.priority || S.category || S.team_id ? 'No matching tasks' : 'No tasks yet', S.q || S.status ? 'Try changing or clearing the filters.' : 'Create your first task to start organizing your work.', '<button class="btn pri" id="new2">' + ic('plus', 16) + 'New task</button>')}</div>`;
    if (S.view === 'kanban') return `<div class="kb">${[['todo', 'To Do'], ['in_progress', 'In Progress'], ['completed', 'Completed']].map(([k, n]) => { const l = tasks.filter(t => t.status === k); return `<div class="col" data-col="${k}"><h3><span>${n}</span><span class="badge">${l.length}</span></h3>${l.map(card).join('') || '<p class="hint" style="padding:8px">Drop tasks here</p>'}</div>`; }).join('')}</div>`;
    if (S.view === 'list') return `<div class="card" style="padding:8px">${tasks.map(row).join('')}</div>`;
    if (S.view === 'calendar') return `<div class="card"><div class="ct" style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><h3 style="flex:1">${S.month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3><button class="ib" data-mnav="-1" aria-label="Previous">${ic('chevL')}</button><button class="btn sm" data-mnav="0">Today</button><button class="ib" data-mnav="1" aria-label="Next">${ic('chevR')}</button></div><div id="mcal"></div></div>`;
    const start = new Date(S.week); start.setDate(start.getDate() - start.getDay()); start.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; }), un = tasks.filter(t => !t.due_at && t.status !== 'completed');
    return `<div class="card mb"><div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><h3 style="flex:1">Week of ${fDate(start, { month: 'short', day: 'numeric', year: 'numeric' })}</h3><button class="ib" data-wnav="-1" aria-label="Previous week">${ic('chevL')}</button><button class="btn sm" data-wnav="0">This week</button><button class="ib" data-wnav="1" aria-label="Next week">${ic('chevR')}</button></div>
    <div class="wk">${days.map(d => `<div class="day ${ymd(d) === ymd(new Date()) ? 'today' : ''}"><h4>${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</h4>${tasks.filter(t => t.due_at && ymd(t.due_at) === ymd(d)).map(t => `<button class="ev ${t.priority} ${t.status === 'completed' ? 'dn' : ''}" data-id="${t.id}" style="margin-bottom:4px;white-space:normal">${esc(t.title)}</button>`).join('') || '<small class="hint">Free day</small>'}</div>`).join('')}</div></div>
    ${un.length ? `<div class="card"><div class="ch"><h3>Unscheduled</h3><small>No due date</small></div>${un.map(row).join('')}</div>` : ''}`;
  }
  function paint() {
    main.innerHTML = `<div class="ph"><div><h1>My Tasks</h1><p>Daily goal: <b>${goal.done}/${goal.goal}</b> completed today</p><div class="bar" style="width:220px;margin-top:6px"><i style="width:${Math.min(100, goal.done / goal.goal * 100)}%"></i></div></div><div class="acts"><button class="btn pri" id="new">${ic('plus', 16)}New task</button></div></div>
    <div class="tools"><div class="search">${ic('search')}<input type="search" id="q" placeholder="Search tasks" value="${esc(S.q)}" aria-label="Search tasks"></div>
    <select data-f="status" aria-label="Status"><option value="">All statuses</option>${[['todo', 'To do'], ['in_progress', 'In progress'], ['completed', 'Completed'], ['overdue', 'Overdue'], ['today', 'Due today']].map(([v, n]) => `<option value="${v}" ${S.status === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <select data-f="priority" aria-label="Priority"><option value="">Any priority</option>${['high', 'medium', 'low'].map(p => `<option ${S.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
    <select data-f="category" aria-label="Subject"><option value="">All subjects</option>${cats.map(c => `<option ${S.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select data-f="team_id" aria-label="Team"><option value="">All teams</option>${teams.map(t => `<option value="${t.id}" ${S.team_id === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
    <select data-f="sort" aria-label="Sort"><option value="manual">Manual order</option><option value="due" ${S.sort === 'due' ? 'selected' : ''}>Due date</option><option value="priority" ${S.sort === 'priority' ? 'selected' : ''}>Priority</option><option value="created" ${S.sort === 'created' ? 'selected' : ''}>Newest</option><option value="title" ${S.sort === 'title' ? 'selected' : ''}>Title</option></select></div>
    <div class="tabs" role="tablist">${[['kanban', 'Kanban', 'kanban'], ['list', 'List', 'list'], ['calendar', 'Calendar', 'cal'], ['week', 'Weekly planner', 'clock']].map(([v, n, i]) => `<button class="${S.view === v ? 'on' : ''}" data-view="${v}" role="tab">${ic(i, 15)} ${n}</button>`).join('')}</div><div id="tbody">${body()}</div>`;
    mount();
  }
  function mount() {
    $('#new').onclick = $('#new2')?.onclick ? $('#new2').onclick : () => openTaskForm(null, {}, reload); const n2 = $('#new2'); if (n2) n2.onclick = () => openTaskForm(null, {}, reload);
    if (S.view === 'calendar' && $('#mcal')) renderMonth($('#mcal'), { date: S.month, items: tasks.filter(t => t.due_at).map(t => ({ kind: 'task', id: t.id, title: t.title, at: t.due_at, priority: t.priority, done: t.status === 'completed' })), onItem: (k, id) => openTaskDetail(id, reload), onDay: day => openTaskForm(null, { due_at: new Date(day + 'T17:00').toISOString() }, reload) });
    if (S.view === 'kanban') bindDnd();
  }
  const reload = async () => { try { await load(); paint(); } catch (e) { fail(e); } };
  function bindDnd() {
    let drag = null;
    $$('.tcard').forEach(c => { c.ondragstart = e => { drag = c; c.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.dataset.id); }; c.ondragend = () => { c.classList.remove('drag'); $$('.col').forEach(x => x.classList.remove('over')); }; });
    $$('.col').forEach(col => {
      col.ondragover = e => { e.preventDefault(); col.classList.add('over'); }; col.ondragleave = e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); };
      col.ondrop = async e => {
        e.preventDefault(); col.classList.remove('over'); if (!drag) return; const id = drag.dataset.id, status = col.dataset.col, t = tasks.find(x => x.id === id);
        const others = tasks.filter(x => x.status === status && x.id !== id).sort((a, b) => a.position - b.position);
        const after = $$('.tcard:not(.drag)', col).find(c => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2), idx = after ? others.findIndex(x => x.id === after.dataset.id) : others.length;
        const prev = others[idx - 1]?.position, next = others[idx]?.position; const position = prev != null && next != null ? (prev + next) / 2 : prev != null ? prev + 1000 : next != null ? next - 1000 : 1000;
        const old = { status: t.status, position: t.position }; t.status = status; t.position = position; paint();
        try { await api(`/tasks/${id}/status`, { method: 'PATCH', body: { status, position } }); if (old.status !== status) { toast(status === 'completed' ? 'Task completed 🎉' : 'Task moved'); load().then(paint); } }
        catch (x) { t.status = old.status; t.position = old.position; paint(); fail(x); }
      };
    });
  }
  main.addEventListener('click', async e => {
    const chk = e.target.closest('[data-chk]');
    if (chk) { e.stopPropagation(); const t = tasks.find(x => x.id === chk.dataset.chk), s = t.status === 'completed' ? 'todo' : 'completed'; try { await api(`/tasks/${t.id}/status`, { method: 'PATCH', body: { status: s } }); if (s === 'completed') toast('Task completed 🎉'); reload(); } catch (x) { fail(x); } return; }
    const v = e.target.closest('[data-view]'); if (v) { S.view = v.dataset.view; localStorage.setItem('nf_tview', S.view); return paint(); }
    const mn = e.target.closest('[data-mnav]'); if (mn) { S.month = mn.dataset.mnav === '0' ? new Date() : new Date(S.month.getFullYear(), S.month.getMonth() + +mn.dataset.mnav, 1); return paint(); }
    const wn = e.target.closest('[data-wnav]'); if (wn) { const d = wn.dataset.wnav === '0' ? new Date() : new Date(S.week); if (wn.dataset.wnav !== '0') d.setDate(d.getDate() + 7 * +wn.dataset.wnav); S.week = d; return paint(); }
    const it = e.target.closest('[data-id]'); if (it && !e.target.closest('[data-col] > h3')) openTaskDetail(it.dataset.id, reload);
  });
  main.addEventListener('change', e => { const f = e.target.dataset.f; if (f) { S[f] = e.target.value; reload(); } });
  main.addEventListener('input', debounce(e => { if (e.target.id === 'q') { S.q = e.target.value; load().then(() => { $('#tbody').innerHTML = body(); mount(); }).catch(fail); } }, 250));
  await load(); paint();
  const p = new URLSearchParams(location.search); if (p.get('open')) openTaskDetail(p.get('open'), reload);
});

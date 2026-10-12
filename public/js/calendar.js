NF.start(async (main) => {
  const S = { view: 'month', date: new Date() };
  let items = [];
  const range = () => { const d = S.date; return S.view === 'month' ? [new Date(d.getFullYear(), d.getMonth(), -7), new Date(d.getFullYear(), d.getMonth() + 1, 14)] : [new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7), new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14)]; };
  async function load() { const [f, t] = range(); const r = await api(`/calendar?from=${f.toISOString()}&to=${t.toISOString()}`);
    items = [...r.tasks.map(x => ({ kind: 'task', id: x.id, title: x.title, at: x.due_at, priority: x.priority, done: x.status === 'completed' })), ...r.assignments.map(x => ({ kind: 'assignment', id: x.id, title: x.title, at: x.due_at, priority: x.priority, done: ['submitted', 'under_review', 'graded'].includes(x.status) }))]; }
  const open = (k, id) => k === 'task' ? openTaskDetail(id, reload) : location.href = '/assignments.html?id=' + id;
  const addAt = day => openTaskForm(null, { due_at: new Date(day + 'T17:00').toISOString() }, reload);
  function paint() {
    const d = S.date, title = S.view === 'month' ? d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : `Week of ${fDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()), { month: 'short', day: 'numeric' })}`;
    main.innerHTML = `<div class="ph"><div><h1>My Calendar</h1><p>Tasks and assignment deadlines in one place.</p></div><div class="acts"><button class="btn pri" id="add">${ic('plus', 16)}New task</button></div></div>
    <div class="card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap"><h3 style="flex:1;font-size:18px;min-width:150px">${title}</h3><button class="ib" data-nav="-1" aria-label="Previous">${ic('chevL')}</button><button class="btn sm" data-nav="0">Today</button><button class="ib" data-nav="1" aria-label="Next">${ic('chevR')}</button>
    <div class="tabs" style="margin:0;border:0">${['month', 'week'].map(v => `<button class="${S.view === v ? 'on' : ''}" data-view="${v}">${cap(v)}</button>`).join('')}</div></div>
    <div id="cv"></div><div class="meta" style="margin-top:12px"><span class="badge b-high">High</span><span class="badge b-medium">Medium</span><span class="badge b-low">Low</span><span class="badge b-vio">Assignment</span></div></div>`;
    if (S.view === 'month') renderMonth($('#cv'), { date: d, items, onItem: open, onDay: addAt });
    else { const st = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()); $('#cv').innerHTML = `<div class="wk">${Array.from({ length: 7 }, (_, i) => { const x = new Date(st); x.setDate(st.getDate() + i); const k = ymd(x); return `<div class="day ${k === ymd(new Date()) ? 'today' : ''}"><h4>${x.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</h4>${items.filter(i => ymd(i.at) === k).map(i => `<button class="ev ${i.kind === 'assignment' ? 'asg' : i.priority} ${i.done ? 'dn' : ''}" data-item="${i.kind}:${i.id}" style="margin-bottom:4px;white-space:normal">${fTime(i.at)} ${esc(i.title)}</button>`).join('') || '<small class="hint">Free</small>'}<button class="btn ghost sm" data-addday="${k}" style="margin-top:6px">${ic('plus', 13)}Add</button></div>`; }).join('')}</div>`;
      $('#cv').onclick = e => { const it = e.target.closest('[data-item]'); if (it) { const [k, id] = it.dataset.item.split(':'); return open(k, id); } const a = e.target.closest('[data-addday]'); if (a) addAt(a.dataset.addday); }; }
    $('#add').onclick = () => openTaskForm(null, {}, reload);
  }
  const reload = async () => { try { await load(); paint(); } catch (e) { fail(e); } };
  main.addEventListener('click', async e => {
    const n = e.target.closest('[data-nav]'); if (n) { const k = +n.dataset.nav, d = new Date(S.date); if (!k) S.date = new Date(); else { S.view === 'month' ? d.setMonth(d.getMonth() + k, 1) : d.setDate(d.getDate() + 7 * k); S.date = d; } return reload(); }
    const v = e.target.closest('[data-view]'); if (v) { S.view = v.dataset.view; reload(); }
  });
  await load(); paint();
});

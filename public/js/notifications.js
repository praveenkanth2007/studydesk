NF.start(async (main) => {
  let list = [], filter = 'all';
  const paint = () => { const l = filter === 'unread' ? list.filter(n => !n.is_read) : list;
    main.innerHTML = `<div class="ph"><div><h1>Notifications</h1><p>Deadlines, grades, announcements and team activity.</p></div><div class="acts"><button class="btn" id="all">${ic('check', 16)}Mark all as read</button></div></div>
    <div class="tabs"><button class="${filter === 'all' ? 'on' : ''}" data-f="all">All</button><button class="${filter === 'unread' ? 'on' : ''}" data-f="unread">Unread</button></div>
    <div class="card" style="padding:6px">${l.length ? l.map(n => `<a class="ni ${n.is_read ? '' : 'unread'}" href="${esc(n.link || '#')}" data-nid="${n.id}" style="border-radius:10px"><span class="nic">${ic(nIcon(n.type), 16)}</span><div style="flex:1"><b>${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ''}<small>${ago(n.created_at)}</small></div><button class="ib" data-del="${n.id}" aria-label="Dismiss">${ic('x', 15)}</button></a>`).join('') : empty('bell', filter === 'unread' ? 'No unread notifications' : 'You’re all caught up', 'New assignments, grades and announcements will show up here.')}</div>`; };
  const load = async () => { list = (await api('/notifications')).notifications; paint(); };
  main.addEventListener('click', async e => {
    const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; return paint(); }
    if (e.target.closest('#all')) { await api('/notifications/read-all', { method: 'PATCH' }); list.forEach(n => n.is_read = true); NF.badges.notifications = 0; paintBadges(); return paint(); }
    const d = e.target.closest('[data-del]'); if (d) { e.preventDefault(); await api('/notifications/' + d.dataset.del, { method: 'DELETE' }); list = list.filter(n => n.id !== d.dataset.del); return paint(); }
    const a = e.target.closest('[data-nid]'); if (a) api('/notifications/' + a.dataset.nid + '/read', { method: 'PATCH' }).catch(() => {});
  });
  NF.on('notification:new', load); await load();
});

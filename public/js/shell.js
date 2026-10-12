/* App shell: auth guard, sidebar, top bar, search, notifications, real-time connection. */
const NAV = [['dashboard', 'Dashboard', 'home'], ['tasks', 'My Tasks', 'tasks'], ['calendar', 'My Calendar', 'cal'], ['assignments', 'Assignments', 'assign'], ['teams', 'Teams & Channels', 'team'], ['chat', 'Chat', 'chat'], ['files', 'Shared Files', 'file'], ['notifications', 'Notifications', 'bell'], ['ai', 'AI Study Assistant', 'bot'], ['analytics', 'Analytics', 'chart'], ['settings', 'Settings', 'settings']];
const NF = {
  me: null, socket: null, online: new Set(), _h: {},
  on(ev, fn) { (this._h[ev] ||= []).push(fn); }, fire(ev, ...a) { (this._h[ev] || []).forEach(f => f(...a)); },
  isStaff: () => ['faculty', 'admin'].includes(NF.me.role),
  applyTheme(t) { document.documentElement.dataset.theme = t; localStorage.setItem('nf_theme', t); },
  async setBadges() { try { const b = await api('/badges'); NF.badges = b; paintBadges(); } catch { /* ignore */ } },
  async start(fn) {
    const page = document.body.dataset.page;
    try { NF.me = (await api('/auth/me')).user; } catch (e) { if (e.status !== 401) $('#app').innerHTML = errState(e); return; }
    NF.applyTheme(NF.me.theme); buildShell(page);
    const main = $('#page'); main.innerHTML = skeleton(4, 110);
    try { await fn(main, NF.me); } catch (e) { console.error(e); main.innerHTML = errState(e); $('#retry')?.addEventListener('click', () => location.reload()); }
    connect(); NF.setBadges(); loadNotifs();
  },
};
function paintBadges() {
  const b = NF.badges || {}; const set = (id, n) => { const el = $(`#nav-${id} .bd`); if (el) { el.textContent = n > 99 ? '99+' : n; el.hidden = !n; } };
  set('chat', b.chat); set('notifications', b.notifications);
  const d = $('#bell-dot'); if (d) { d.hidden = !b.notifications; d.textContent = b.notifications > 9 ? '9+' : b.notifications; }
  document.title = (b.notifications || b.chat ? `(${(b.notifications || 0) + (b.chat || 0)}) ` : '') + document.title.replace(/^\(\d+\)\s/, '');
}
function buildShell(page) {
  const u = NF.me, collapsed = localStorage.getItem('nf_collapsed') === '1';
  $('#app').innerHTML = `<div class="app ${collapsed ? 'collapsed' : ''}" id="shell">
  <aside class="side" id="side" aria-label="Main navigation"><div class="brand"><i>${ic('zap', 18)}</i><span>NeonFlow</span></div>
   <nav class="nav">${NAV.map(([k, t, i]) => `<a href="/${k}.html" id="nav-${k}" class="${k === page ? 'on' : ''}" ${k === page ? 'aria-current="page"' : ''}>${ic(i)}<span>${t}</span>${k === 'chat' || k === 'notifications' ? '<b class="bd" hidden></b>' : ''}</a>`).join('')}</nav>
   <div class="ucard">${avatar(u.name)}<div><b>${esc(u.name)}</b><small>${esc(u.role)}</small></div></div></aside>
  <div class="ov" id="ov"></div>
  <div class="main"><header class="top">
   <button class="ib" id="menu-btn" aria-label="Toggle menu">${ic('menu')}</button>
   <div class="search">${ic('search')}<input type="search" id="gs" placeholder="Search tasks, assignments, teams, messages…" autocomplete="off" aria-label="Global search"><div class="sres" id="sres"></div></div>
   <span class="sp"></span>
   <div class="rel"><button class="btn pri sm" id="qc-btn">${ic('plus', 15)}<span class="hide-m">Create</span></button><div class="menu" id="qc-menu">
     <button data-qc="task">${ic('tasks')}New task</button>${NF.isStaff() ? `<button data-qc="assignment">${ic('assign')}New assignment</button>` : ''}<button data-qc="team">${ic('team')}New team</button><button data-qc="join">${ic('link')}Join with code</button></div></div>
   <div class="rel"><button class="ib" id="bell" aria-label="Notifications">${ic('bell')}<span class="dot" id="bell-dot" hidden></span></button><div class="menu npanel" id="npanel"></div></div>
   <div class="rel"><button class="ib" id="pm-btn" aria-label="Profile menu" style="width:auto;padding:0 4px">${avatar(u.name, 'sm')}</button><div class="menu" id="pmenu"><div style="padding:8px 12px"><b>${esc(u.name)}</b><div class="hint">${esc(u.email)}</div></div><hr><a href="/settings.html">${ic('settings')}Settings</a><button id="theme-btn">${ic(u.theme === 'dark' ? 'sun' : 'moon')}<span>${u.theme === 'dark' ? 'Light' : 'Dark'} theme</span></button><hr><button id="logout">${ic('logout')}Sign out</button></div></div>
  </header><main id="page"></main></div></div>`;
  const shell = $('#shell'), side = $('#side'), ov = $('#ov');
  const drawer = on => { side.classList.toggle('on', on); ov.classList.toggle('on', on); document.body.classList.toggle('lock', on); };
  $('#menu-btn').onclick = () => { if (innerWidth <= 900) drawer(!side.classList.contains('on')); else { shell.classList.toggle('collapsed'); localStorage.setItem('nf_collapsed', shell.classList.contains('collapsed') ? '1' : '0'); } };
  ov.onclick = () => drawer(false); $$('.nav a').forEach(a => a.addEventListener('click', () => drawer(false)));
  const menus = { 'qc-btn': 'qc-menu', bell: 'npanel', 'pm-btn': 'pmenu' };
  document.addEventListener('click', e => {
    for (const [b, m] of Object.entries(menus)) { const btn = $('#' + b), menu = $('#' + m); if (btn.contains(e.target)) { const on = !menu.classList.contains('on'); $$('.menu').forEach(x => x.classList.remove('on')); menu.classList.toggle('on', on); if (b === 'bell' && on) openBell(); return; } if (!menu.contains(e.target)) menu.classList.remove('on'); }
    if (!e.target.closest('.search')) $('#sres').classList.remove('on');
  });
  $('#qc-menu').onclick = e => { const k = e.target.closest('[data-qc]')?.dataset.qc; if (!k) return; $('#qc-menu').classList.remove('on');
    if (k === 'task') openTaskForm(null, {}, () => { if (['dashboard', 'tasks', 'calendar'].includes(page)) location.reload(); else toast('Task created'); });
    else location.href = k === 'assignment' ? '/assignments.html?new=1' : k === 'team' ? '/teams.html?new=1' : '/teams.html?join=1'; };
  $('#theme-btn').onclick = async () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; NF.applyTheme(t); NF.me.theme = t; $('#theme-btn').innerHTML = `${ic(t === 'dark' ? 'sun' : 'moon')}<span>${t === 'dark' ? 'Light' : 'Dark'} theme</span>`; try { await api('/auth/profile', { method: 'PUT', body: { theme: t } }); } catch (e) { fail(e); } };
  $('#logout').onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ } location.href = '/login.html'; };
  const gs = $('#gs'), sres = $('#sres');
  gs.addEventListener('input', debounce(async () => {
    const q = gs.value.trim(); if (q.length < 2) return sres.classList.remove('on');
    try {
      const r = await api('/search?q=' + encodeURIComponent(q)), sec = (t, arr, f) => arr.length ? `<h5>${t}</h5>` + arr.map(f).join('') : '';
      const html = sec('Tasks', r.tasks, x => `<a href="/tasks.html?open=${x.id}">${ic('tasks', 14)} ${esc(x.title)}</a>`) + sec('Assignments', r.assignments, x => `<a href="/assignments.html?id=${x.id}">${ic('assign', 14)} ${esc(x.title)}</a>`) + sec('Teams', r.teams, x => `<a href="/teams.html?id=${x.id}">${ic('team', 14)} ${esc(x.name)}</a>`) + sec('Messages', r.messages, x => `<a href="/chat.html?channel=${x.channel_id}&q=${encodeURIComponent(q)}">${ic('chat', 14)} #${esc(x.channel_name)} · ${esc(x.body)}</a>`) + sec('Files', r.files, x => `<a href="/api/files/${x.id}/download">${ic('file', 14)} ${esc(x.original_name)}</a>`);
      sres.innerHTML = html || `<div class="empty" style="padding:18px">No results for “${esc(q)}”.</div>`; sres.classList.add('on');
    } catch (e) { fail(e); }
  }, 300));
}
async function loadNotifs() { try { const d = await api('/notifications'); NF.notifs = d.notifications; NF.badges = { ...(NF.badges || {}), notifications: d.unread }; paintBadges(); } catch { /* ignore */ } }
const nIcon = t => ({ assignment: 'assign', grade: 'check', submission: 'upload', announcement: 'bell', team: 'team', comment: 'chat' }[t] || 'bell');
const notifItem = n => `<a class="ni ${n.is_read ? '' : 'unread'}" href="${esc(n.link || '#')}" data-nid="${n.id}"><span class="nic">${ic(nIcon(n.type), 16)}</span><div><b>${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ''}<small>${ago(n.created_at)}</small></div></a>`;
async function openBell() {
  const p = $('#npanel'); p.innerHTML = skeleton(1, 80);
  try {
    const d = await api('/notifications'); NF.notifs = d.notifications;
    p.innerHTML = `<div style="display:flex;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--line)"><b>Notifications</b><button class="btn ghost sm" id="mark-all">Mark all read</button></div>${d.notifications.length ? d.notifications.slice(0, 8).map(notifItem).join('') + '<a class="ni" href="/notifications.html" style="justify-content:center">View all</a>' : empty('bell', 'You’re all caught up', 'Deadlines, grades and announcements appear here.')}`;
    $('#mark-all', p)?.addEventListener('click', async e => { e.stopPropagation(); await api('/notifications/read-all', { method: 'PATCH' }); NF.badges.notifications = 0; paintBadges(); $$('.ni.unread', p).forEach(n => n.classList.remove('unread')); });
    p.onclick = e => { const a = e.target.closest('[data-nid]'); if (a) api('/notifications/' + a.dataset.nid + '/read', { method: 'PATCH' }).catch(() => {}); };
  } catch (e) { p.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
function connect() {
  if (typeof io === 'undefined') return;
  const s = NF.socket = io({ transports: ['websocket', 'polling'] });
  s.on('presence:list', ids => { NF.online = new Set(ids); NF.fire('presence'); });
  s.on('presence', p => { p.online ? NF.online.add(p.user_id) : NF.online.delete(p.user_id); NF.fire('presence', p); });
  s.on('notification:new', n => { toast(n.title, 'info'); NF.badges = { ...(NF.badges || {}), notifications: (NF.badges?.notifications || 0) + 1 }; paintBadges(); NF.fire('notification:new', n); });
  s.on('message:new', m => { if (m.sender_id !== NF.me.id && document.body.dataset.page !== 'chat') { NF.badges = { ...(NF.badges || {}), chat: (NF.badges?.chat || 0) + 1 }; paintBadges(); } NF.fire('message:new', m); });
  s.on('comment:new', c => NF.fire('comment:new', c));
}

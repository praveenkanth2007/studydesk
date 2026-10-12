NF.start(async (main, me) => {
  const P = new URLSearchParams(location.search);
  let ov = { channels: [], dms: [] }, cur = null, msgs = [], thread = null, pendingFile = null, seen = new Set();
  main.innerHTML = `<div class="ph" style="margin-bottom:14px"><div><h1>Chat</h1><p>Team channels and direct messages, delivered in real time.</p></div><div class="acts"><button class="btn pri" id="newdm">${ic('plus', 16)}New message</button></div></div>
  <div class="chat list" id="chat"><div class="cl" id="cl"></div><div class="cm"><div class="cmh" id="cmh"></div><div class="msgs" id="msgs"></div><div class="comp" id="comp"></div></div><div class="th" id="th"></div></div>`;
  const online = id => NF.online.has(id);
  const msgHtml = (m, inThread) => `<div class="msg" data-mid="${m.id}">${avatar(m.sender_name, 'sm')}<div class="mb2"><div class="who">${esc(m.sender_name)}<small>${fDT(m.created_at)}</small></div><div class="txt">${esc(m.body)}</div>${m.file_id ? fileChip(m.file_id, m.file_name, m.file_size) : ''}${!inThread && cur?.type === 'channel' && !m.parent_id ? `<div class="ma"><button data-thread="${m.id}">${ic('reply', 13)} ${m.reply_count ? m.reply_count + ' repl' + (m.reply_count > 1 ? 'ies' : 'y') : 'Reply'}</button></div>` : ''}</div></div>`;
  function paintList() {
    const teams = {}; ov.channels.forEach(c => (teams[c.team_name] ||= []).push(c));
    $('#cl').innerHTML = (Object.keys(teams).length ? Object.entries(teams).map(([t, cs]) => `<h5>${esc(t)}</h5>${cs.map(c => `<button class="cli ${cur?.type === 'channel' && cur.id === c.id ? 'on' : ''}" data-ch="${c.id}">${ic(c.kind === 'announcements' ? 'bell' : 'chat', 15)}<span class="n"># ${esc(c.name)}</span>${c.unread ? `<span class="bd">${c.unread}</span>` : ''}</button>`).join('')}`).join('') : '<p class="hint" style="padding:10px">Join a team to see its channels.</p>')
      + `<h5>Direct messages</h5>${ov.dms.map(d => `<button class="cli ${cur?.type === 'dm' && cur.id === d.user_id ? 'on' : ''}" data-dm="${d.user_id}"><span class="od ${online(d.user_id) ? 'on' : ''}"></span><span class="n">${esc(d.name)}</span>${d.unread ? `<span class="bd">${d.unread}</span>` : ''}</button>`).join('') || '<p class="hint" style="padding:6px 10px">No conversations yet.</p>'}`;
  }
  const refreshOv = async () => { ov = await api('/chat/overview'); NF.online = new Set(ov.online); paintList(); NF.setBadges(); };
  function paintMsgs(scroll = true) { const el = $('#msgs'); el.innerHTML = (msgs.length >= 50 && !cur.q ? '<button class="btn ghost sm" id="older" style="align-self:center">Load earlier messages</button>' : '') + (msgs.length ? msgs.map(m => msgHtml(m)).join('') : empty('chat', cur.q ? 'No messages match' : 'No messages yet', cur.q ? 'Try a different search.' : 'Say hello and start the conversation.')); if (scroll) el.scrollTop = el.scrollHeight; }
  function paintHead() {
    $('#cmh').innerHTML = `<button class="ib" id="back" aria-label="Back to conversations" style="display:${innerWidth <= 900 ? 'grid' : 'none'}">${ic('chevL')}</button><b>${cur.type === 'channel' ? `# ${esc(cur.name)} <small class="hint">${esc(cur.team_name)}</small>` : `<span class="od ${online(cur.id) ? 'on' : ''}" style="display:inline-block;margin-right:6px"></span>${esc(cur.name)}`}</b><div class="search" style="max-width:220px;flex:none"><input type="search" id="msq" placeholder="Search messages" value="${esc(cur.q || '')}" aria-label="Search messages" style="height:34px"></div>`;
    $('#comp').innerHTML = cur.can_post === false ? '<span class="hint" style="padding:6px">Only owners and faculty can post in this channel.</span>' : `<button class="ib" id="att" aria-label="Attach file">${ic('clip')}</button><input type="file" id="fi" hidden><div style="flex:1;min-width:0"><div id="pf"></div><textarea id="mt" placeholder="Message ${cur.type === 'channel' ? '#' + esc(cur.name) : esc(cur.name)}" rows="1" maxlength="4000" aria-label="Message"></textarea></div><button class="btn pri" id="send" aria-label="Send">${ic('send', 16)}</button>`;
  }
  async function open(type, id, q = '') {
    thread = null; $('#chat').classList.remove('thread', 'list'); pendingFile = null; $('#msgs').innerHTML = skeleton(3, 50);
    try {
      const r = type === 'channel' ? await api(`/channels/${id}/messages${q ? '?q=' + encodeURIComponent(q) : ''}`) : await api(`/dm/${id}/messages${q ? '?q=' + encodeURIComponent(q) : ''}`);
      cur = type === 'channel' ? { type, id, name: r.channel.name, team_name: r.channel.team_name, can_post: r.can_post, q } : { type, id, name: r.user.name, q }; msgs = r.messages; seen = new Set(msgs.map(m => m.id));
      paintHead(); paintMsgs(); const c = (type === 'channel' ? ov.channels.find(x => x.id === id) : ov.dms.find(x => x.user_id === id)); if (c) c.unread = 0; paintList(); if (!q) NF.setBadges(); history.replaceState(null, '', `/chat.html?${type === 'channel' ? 'channel' : 'dm'}=${id}`);
    } catch (e) { $('#msgs').innerHTML = errState(e); }
  }
  async function send() {
    const t = $('#mt'), body = t.value.trim(); if (!body && !pendingFile) return; const b = $('#send'); setLoading(b, true);
    try { const url = cur.type === 'channel' ? `/channels/${cur.id}/messages` : `/dm/${cur.id}/messages`; const r = await api(url, { method: 'POST', body: { body: body || '📎 ' + pendingFile.original_name, file_id: pendingFile?.id } }); t.value = ''; t.style.height = '42px'; pendingFile = null; $('#pf').innerHTML = ''; if (!seen.has(r.message.id)) addMsg(r.message); } catch (e) { fail(e); } setLoading(b, false); t.focus();
  }
  function addMsg(m) { seen.add(m.id); msgs.push(m); const el = $('#msgs'), atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 120; if (msgs.length === 1) paintMsgs(); else el.insertAdjacentHTML('beforeend', msgHtml(m)); if (atEnd || m.sender_id === me.id) el.scrollTop = el.scrollHeight; }
  async function openThread(id) {
    try { const r = await api(`/messages/${id}/thread`); thread = { id, msgs: r.messages }; $('#chat').classList.add('thread'); paintThread(); } catch (e) { fail(e); }
  }
  function paintThread() { $('#th').innerHTML = `<div class="cmh"><b>Thread</b><button class="ib" id="cth" aria-label="Close thread">${ic('x')}</button></div><div class="msgs" id="tm">${thread.msgs.map(m => msgHtml(m, true)).join('')}</div><div class="comp"><textarea id="tt" placeholder="Reply…" rows="1" maxlength="4000" aria-label="Reply" style="height:42px"></textarea><button class="btn pri" id="tsend" aria-label="Send reply">${ic('send', 16)}</button></div>`; const t = $('#tm'); t.scrollTop = t.scrollHeight; }
  main.addEventListener('click', async e => {
    const ch = e.target.closest('[data-ch]'); if (ch) return open('channel', ch.dataset.ch);
    const dm = e.target.closest('[data-dm]'); if (dm) return open('dm', dm.dataset.dm);
    if (e.target.closest('#back')) { $('#chat').classList.add('list'); return; }
    const th = e.target.closest('[data-thread]'); if (th) return openThread(th.dataset.thread);
    if (e.target.closest('#cth')) { thread = null; $('#chat').classList.remove('thread'); return; }
    if (e.target.closest('#send')) return send();
    if (e.target.closest('#att')) return $('#fi').click();
    if (e.target.closest('#older')) { try { const r = cur.type === 'channel' ? await api(`/channels/${cur.id}/messages?before=${encodeURIComponent(msgs[0].created_at)}`) : await api(`/dm/${cur.id}/messages?before=${encodeURIComponent(msgs[0].created_at)}`); r.messages.forEach(m => seen.add(m.id)); msgs = [...r.messages, ...msgs]; paintMsgs(false); } catch (x) { fail(x); } return; }
    if (e.target.closest('#tsend')) { const t = $('#tt'), body = t.value.trim(); if (!body) return; try { const r = await api(`/channels/${cur.id}/messages`, { method: 'POST', body: { body, parent_id: thread.id } }); t.value = ''; if (!thread.msgs.some(m => m.id === r.message.id)) thread.msgs.push(r.message); paintThread(); } catch (x) { fail(x); } }
    if (e.target.closest('#newdm')) modal({ title: 'New message', body: '<div class="field"><input type="search" id="ps" placeholder="Search people in your teams" aria-label="Search people"></div><div id="pr"></div>', onMount: root => { const run = async () => { try { const r = await api('/users/search?q=' + encodeURIComponent($('#ps', root).value)); $('#pr', root).innerHTML = r.users.map(u => `<div class="li" data-pick="${u.id}">${avatar(u.name)}<div class="body"><div class="ttl">${esc(u.name)}</div><div class="meta">${esc(u.role)} ${esc(u.department)}</div></div></div>`).join('') || '<p class="hint">No people found. You can message people who share a team with you.</p>'; } catch (x) { fail(x); } }; $('#ps', root).oninput = debounce(run, 250); run(); root.addEventListener('click', ev => { const p = ev.target.closest('[data-pick]'); if (p) { closeModal(); open('dm', p.dataset.pick); } }); } });
  });
  main.addEventListener('change', async e => { if (e.target.id === 'fi' && e.target.files[0]) { try { pendingFile = await uploadFile(e.target.files[0], cur.type === 'channel' ? { purpose: 'chat', channel_id: cur.id } : { purpose: 'personal' }); $('#pf').innerHTML = fileChip(pendingFile.id, pendingFile.original_name, pendingFile.size_bytes); } catch (x) { fail(x); } } });
  main.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'mt') { e.preventDefault(); send(); } if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'tt') { e.preventDefault(); $('#tsend').click(); } });
  main.addEventListener('input', debounce(e => { if (e.target.id === 'msq' && cur) open(cur.type, cur.id, e.target.value.trim()); }, 300));
  main.addEventListener('input', e => { if (e.target.id === 'mt' || e.target.id === 'tt') { e.target.style.height = '42px'; e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px'; } });
  let rt; NF.on('message:new', m => {
    const mineCh = cur?.type === 'channel' && m.channel_id === cur.id, other = m.sender_id === me.id ? m.recipient_id : m.sender_id, mineDm = cur?.type === 'dm' && !m.channel_id && other === cur.id;
    if (mineCh && m.parent_id) { const p = msgs.find(x => x.id === m.parent_id); if (p && !seen.has(m.id)) { p.reply_count = (p.reply_count || 0) + 1; seen.add(m.id); paintMsgs(false); } if (thread?.id === m.parent_id && !thread.msgs.some(x => x.id === m.id)) { thread.msgs.push(m); paintThread(); } }
    else if ((mineCh || mineDm) && !seen.has(m.id)) { addMsg(m); if (mineDm && !ov.dms.some(d => d.user_id === cur.id)) refreshOv(); if (m.sender_id !== me.id) api('/chat/read', { method: 'POST', body: { context: (mineCh ? 'c:' : 'd:') + cur.id } }).catch(() => {}); }
    else if (m.sender_id !== me.id) { clearTimeout(rt); rt = setTimeout(refreshOv, 300); } else clearTimeout(rt), rt = setTimeout(refreshOv, 300);
  });
  NF.on('presence', () => { paintList(); if (cur?.type === 'dm') paintHead(); });
  await refreshOv();
  const ch = P.get('channel'), dm = P.get('dm');
  if (ch) await open('channel', ch, P.get('q') || ''); else if (dm) await open('dm', dm);
  else { const first = ov.channels.find(c => c.kind === 'general') || ov.channels[0]; if (innerWidth > 900 && first) await open('channel', first.id); else { $('#msgs').innerHTML = empty('chat', 'Select a conversation', 'Pick a channel or direct message to start chatting.'); $('#cmh').innerHTML = '<b>Messages</b>'; } }
});

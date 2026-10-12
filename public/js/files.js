NF.start(async (main, me) => {
  let files = [], teams = [], S = { team: '', q: '' };
  const load = async () => { const [f, t] = await Promise.all([api('/files?' + new URLSearchParams(Object.entries({ team_id: S.team, q: S.q }).filter(([, v]) => v))), teams.length ? { teams } : api('/teams')]); files = f.files; teams = t.teams; };
  const paint = () => {
    main.innerHTML = `<div class="ph"><div><h1>Shared Files</h1><p>Files from your teams, assignments and personal uploads.</p></div><div class="acts"><button class="btn pri" id="up">${ic('upload', 16)}Upload file</button></div></div>
    <div class="tools"><div class="search">${ic('search')}<input type="search" id="q" value="${esc(S.q)}" placeholder="Search files" aria-label="Search files"></div><select id="tf" aria-label="Team"><option value="">All sources</option>${teams.map(t => `<option value="${t.id}" ${S.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
    <div class="card" style="padding:8px" id="fl">${list()}</div>`;
  };
  const list = () => files.length ? files.map(f => `<div class="li" style="cursor:default"><span class="nic" style="width:38px;height:38px;border-radius:10px;background:rgba(139,92,246,.18);color:var(--violet);display:grid;place-items:center">${ic('file', 18)}</span><div class="body"><div class="ttl">${esc(f.original_name)}</div><div class="meta"><span class="badge">${label(f.purpose)}</span>${f.team_name ? esc(f.team_name) + ' · ' : ''}${esc(f.uploader_name)} · ${fSize(f.size_bytes)} · ${fDate(f.created_at)}</div></div><a class="btn sm" href="/api/files/${f.id}/download">${ic('download', 14)}Download</a>${f.uploader_id === me.id || me.role === 'admin' ? `<button class="btn sm ghost" data-del="${f.id}" aria-label="Delete">${ic('trash', 14)}</button>` : ''}</div>`).join('') : empty('file', 'No files yet', 'Upload documents, slides or notes to share with your team.', '<button class="btn pri" id="up2">Upload a file</button>');
  const upload = () => modal({ title: 'Upload file', body: `<form id="uf"><div class="field"><label for="uf_file">File</label><input id="uf_file" type="file" name="file"><span class="hint">Max 10 MB. Documents, images, archives and source files are allowed.</span></div><div class="field"><label for="uf_team">Share with</label><select id="uf_team" name="team_id"><option value="">Only me (personal)</option>${teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div></form>`, footer: '<button class="btn" data-close>Cancel</button><button class="btn pri" id="uf-go">Upload</button>',
    onMount: root => { $('#uf-go', root).onclick = async () => { const f = $('#uf_file', root).files[0], t = $('#uf_team', root).value; if (!f) return toast('Choose a file first.', 'error'); const b = $('#uf-go', root); setLoading(b, true);
      try { await uploadFile(f, { purpose: t ? 'team' : 'personal', team_id: t }); closeModal(); toast('File uploaded'); await load(); paint(); } catch (x) { setLoading(b, false); fail(x); } }; } });
  main.addEventListener('click', async e => {
    if (e.target.closest('#up,#up2')) return upload();
    const d = e.target.closest('[data-del]'); if (d && await confirmBox('Delete file?', 'This file will be removed for everyone.')) { try { await api('/files/' + d.dataset.del, { method: 'DELETE' }); toast('File deleted'); await load(); paint(); } catch (x) { fail(x); } }
  });
  main.addEventListener('change', async e => { if (e.target.id === 'tf') { S.team = e.target.value; await load(); paint(); } });
  main.addEventListener('input', debounce(async e => { if (e.target.id === 'q') { S.q = e.target.value; await load(); $('#fl').innerHTML = list(); } }, 250));
  await load(); paint();
});

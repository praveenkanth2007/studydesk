NF.start(async (main, me) => {
  const paint = async () => {
    let users = []; if (me.role === 'admin') { try { users = (await api('/admin/users')).users; } catch { /* ignore */ } }
    main.innerHTML = `<div class="ph"><div><h1>Settings</h1><p>Manage your profile, appearance and security.</p></div></div>
    <div class="grid g2 mb"><form class="card" id="pf" novalidate><div class="ch"><h3>Profile</h3><span class="badge b-vio">${esc(me.role)}</span></div>
     <div class="field"><label for="f_name">Full name</label><input id="f_name" name="name" type="text" value="${esc(me.name)}"></div>
     <div class="field"><label>Email</label><input type="email" value="${esc(me.email)}" disabled></div>
     <div class="row2"><div class="field"><label for="f_department">Department</label><input id="f_department" name="department" type="text" value="${esc(me.department)}"></div><div class="field"><label for="f_daily_goal">Daily task goal</label><input id="f_daily_goal" name="daily_goal" type="number" min="1" max="20" value="${me.daily_goal}"></div></div>
     <button class="btn pri" type="submit">Save profile</button></form>
    <div style="display:grid;gap:16px;align-content:start"><div class="card"><div class="ch"><h3>Appearance</h3></div><div class="seg">${['dark', 'light'].map(t => `<label><input type="radio" name="theme" value="${t}" ${document.documentElement.dataset.theme === t ? 'checked' : ''}><span>${t} theme</span></label>`).join('')}</div></div>
    <form class="card" id="pw" novalidate><div class="ch"><h3>Change password</h3></div><div class="field"><label for="f_current_password">Current password</label><input id="f_current_password" name="current_password" type="password" autocomplete="current-password"></div><div class="row2"><div class="field"><label for="f_new_password">New password</label><input id="f_new_password" name="new_password" type="password" autocomplete="new-password"></div><div class="field"><label for="f_confirm">Confirm</label><input id="f_confirm" name="confirm" type="password" autocomplete="new-password"></div></div><button class="btn pri" type="submit">Update password</button></form></div></div>
    ${me.role === 'admin' ? `<div class="card"><div class="ch"><h3>Administration — users</h3><small>${users.length} accounts</small></div><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="text-align:left;color:var(--mu)"><th style="padding:8px">Name</th><th>Email</th><th>Role</th></tr></thead><tbody>${users.map(u => `<tr style="border-top:1px solid var(--line)"><td style="padding:8px">${esc(u.name)}</td><td>${esc(u.email)}</td><td><select data-role="${u.id}" ${u.id === me.id ? 'disabled' : ''} style="height:34px;width:130px">${['student', 'faculty', 'admin'].map(r => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    $('#pf').onsubmit = async e => { e.preventDefault(); const f = e.target, btn = $('button', f), d = Object.fromEntries(new FormData(f)); setLoading(btn, true);
      try { const r = await api('/auth/profile', { method: 'PUT', body: { name: d.name, department: d.department, daily_goal: d.daily_goal } }); Object.assign(me, r.user); toast('Profile saved'); } catch (x) { x.fields ? showErrors(f, x.fields) : fail(x); } setLoading(btn, false); };
    $('#pw').onsubmit = async e => { e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)); if (d.new_password !== d.confirm) return showErrors(f, { confirm: 'Passwords do not match.' }); const btn = $('button', f); setLoading(btn, true);
      try { await api('/auth/password', { method: 'PUT', body: { current_password: d.current_password, new_password: d.new_password } }); f.reset(); showErrors(f, {}); toast('Password updated'); } catch (x) { x.fields ? showErrors(f, x.fields) : fail(x); } setLoading(btn, false); };
    main.onchange = async e => {
      if (e.target.name === 'theme') { NF.applyTheme(e.target.value); try { await api('/auth/profile', { method: 'PUT', body: { theme: e.target.value } }); toast('Theme saved'); } catch (x) { fail(x); } }
      const r = e.target.dataset.role; if (r) { try { await api(`/admin/users/${r}/role`, { method: 'PATCH', body: { role: e.target.value } }); toast('Role updated'); } catch (x) { fail(x); paint(); } }
    };
  };
  await paint();
});

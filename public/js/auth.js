/* Login + register pages */
(async () => {
  const page = document.body.dataset.page, t = localStorage.getItem('nf_theme'); if (t) document.documentElement.dataset.theme = t;
  try { await api('/auth/me'); return location.replace('/dashboard.html'); } catch { /* not signed in */ }
  const hero = `<section class="hero"><div class="brand"><i>${ic('zap', 18)}</i><span>NeonFlow</span></div><div><h2>Plan smarter. Collaborate in real time.</h2><p>Tasks, assignments, team chat and an AI study assistant — all in one workspace for your college.</p><ul><li>${ic('tasks')}Kanban boards, checklists and weekly planner</li><li>${ic('team')}Classes, study groups and role-based access</li><li>${ic('chat')}Live chat, threads and file sharing</li><li>${ic('shield')}Private by default, secured end to end</li></ul></div><small class="hint">© NeonFlow</small></section>`;
  const f = (n, l, type = 'text', a = '') => `<div class="field"><label for="f_${n}">${l}</label><input id="f_${n}" name="${n}" type="${type}" ${a}></div>`;
  const brand = `<div class="brand"><i>${ic('zap', 18)}</i><span>NeonFlow</span></div>`;
  if (page === 'login') {
    const exp = new URLSearchParams(location.search).get('expired');
    $('#app').innerHTML = `<div class="auth">${hero}<section class="formside"><div class="fbox">${brand}<h1>Welcome back</h1><p class="subt">Sign in to continue to your workspace.</p>${exp ? '<div class="banner">Your session has expired. Please sign in again.</div>' : ''}<form id="f" novalidate><div class="banner" id="bn" hidden></div>${f('email', 'Email', 'email', 'autocomplete="email"')}${f('password', 'Password', 'password', 'autocomplete="current-password"')}<button class="btn pri block" type="submit">Sign in</button></form><p class="alt">New here? <a href="/register.html">Create an account</a></p></div></section></div>`;
    $('#f').onsubmit = async e => { e.preventDefault(); const form = e.target, btn = $('button', form); $('#bn').hidden = true; setLoading(btn, true);
      try { await api('/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); location.href = '/dashboard.html'; }
      catch (x) { setLoading(btn, false); if (x.fields) showErrors(form, x.fields); else { $('#bn').textContent = x.message; $('#bn').hidden = false; } } };
  } else {
    $('#app').innerHTML = `<div class="auth">${hero}<section class="formside"><div class="fbox">${brand}<h1>Create your account</h1><p class="subt">Join your classes and start collaborating.</p><form id="f" novalidate><div class="banner" id="bn" hidden></div>${f('name', 'Full name', 'text', 'autocomplete="name"')}${f('email', 'Email', 'email', 'autocomplete="email"')}
    <div class="row2"><div class="field"><label for="f_role">I am a</label><select id="f_role" name="role"><option value="student">Student</option><option value="faculty">Faculty</option></select></div>${f('department', 'Department', 'text', 'placeholder="e.g. Computer Science"')}</div>
    <div id="fc" hidden>${f('faculty_code', 'Faculty access code', 'password', 'autocomplete="off"')}</div>${f('password', 'Password', 'password', 'autocomplete="new-password"')}${f('confirm', 'Confirm password', 'password', 'autocomplete="new-password"')}<button class="btn pri block" type="submit">Create account</button></form><p class="alt">Already registered? <a href="/login.html">Sign in</a></p></div></section></div>`;
    $('#f_role').onchange = e => { $('#fc').hidden = e.target.value !== 'faculty'; };
    $('#f').onsubmit = async e => { e.preventDefault(); const form = e.target, btn = $('button[type=submit]', form), d = Object.fromEntries(new FormData(form)); $('#bn').hidden = true;
      if (d.password !== d.confirm) return showErrors(form, { confirm: 'Passwords do not match.' });
      setLoading(btn, true); try { await api('/auth/register', { method: 'POST', body: d }); location.href = '/dashboard.html'; }
      catch (x) { setLoading(btn, false); if (x.fields) showErrors(form, x.fields); else { $('#bn').textContent = x.message; $('#bn').hidden = false; } } };
  }
})();

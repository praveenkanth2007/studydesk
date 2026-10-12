/* Shared task form + detail dialog (used by dashboard, tasks, calendar, quick-create). */
async function openTaskForm(task, defaults = {}, done) {
  let cats = []; try { cats = (await api('/tasks?status=open')).categories; } catch { /* ignore */ }
  const t = task || { priority: 'medium', ...defaults };
  modal({ title: task ? 'Edit task' : 'New task', body: `<form id="tf" novalidate>
    <div class="field"><label for="f_title">Title</label><input id="f_title" name="title" type="text" maxlength="150" value="${esc(t.title)}" placeholder="e.g. Finish DBMS assignment"></div>
    <div class="field"><label for="f_description">Description</label><textarea id="f_description" name="description" maxlength="2000">${esc(t.description)}</textarea></div>
    <div class="row2"><div class="field"><span class="lbl">Priority</span><div class="seg">${['low', 'medium', 'high'].map(p => `<label><input type="radio" name="priority" value="${p}" ${t.priority === p ? 'checked' : ''}><span>${p}</span></label>`).join('')}</div></div>
    <div class="field"><label for="f_category">Category / subject</label><input id="f_category" name="category" type="text" list="cats" maxlength="40" value="${esc(t.category)}"><datalist id="cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div></div>
    <div class="row2"><div class="field"><label for="f_start_at">Start</label><input id="f_start_at" name="start_at" type="datetime-local" value="${toLocalInput(t.start_at)}"></div>
    <div class="field"><label for="f_due_at">Due</label><input id="f_due_at" name="due_at" type="datetime-local" value="${toLocalInput(t.due_at)}"></div></div>
    <div class="row2"><div class="field"><label for="f_est_minutes">Estimated minutes</label><input id="f_est_minutes" name="est_minutes" type="number" min="0" max="10080" value="${t.est_minutes ?? ''}"></div>
    <div class="field"><label for="f_actual_minutes">Time spent (minutes)</label><input id="f_actual_minutes" name="actual_minutes" type="number" min="0" max="10080" value="${t.actual_minutes ?? ''}"></div></div>
    <div class="field"><label for="f_notes">Personal notes (private)</label><textarea id="f_notes" name="notes" maxlength="2000">${esc(t.notes)}</textarea></div></form>`,
  footer: `<button class="btn" data-close>Cancel</button><button class="btn pri" id="tf-save">${task ? 'Save changes' : 'Create task'}</button>`,
  onMount: root => {
    const form = $('#tf', root), save = $('#tf-save', root);
    form.addEventListener('submit', e => { e.preventDefault(); save.click(); });
    save.onclick = async () => {
      const f = Object.fromEntries(new FormData(form)); const body = { ...f, start_at: fromLocalInput(f.start_at), due_at: fromLocalInput(f.due_at), assignment_id: t.assignment_id || null };
      setLoading(save, true);
      try { const r = task ? await api('/tasks/' + task.id, { method: 'PUT', body }) : await api('/tasks', { method: 'POST', body }); closeModal(); toast(task ? 'Task updated' : 'Task created'); done?.(r.task); }
      catch (e) { setLoading(save, false); if (e.fields) showErrors(form, e.fields); else fail(e); }
    };
  } });
}
async function openTaskDetail(id, onChange) {
  let d; try { d = await api('/tasks/' + id); } catch (e) { return fail(e); }
  let teams = []; try { teams = (await api('/teams')).teams; } catch { /* ignore */ }
  const t = d.task, cd = t.due_at ? countdown(t.due_at, t.status === 'completed') : null;
  const subsHtml = () => `${d.subtasks.map(s => `<div class="sub ${s.done ? 'd' : ''}"><input type="checkbox" data-sub="${s.id}" ${s.done ? 'checked' : ''} aria-label="Toggle subtask"><span style="flex:1">${esc(s.title)}</span><button class="ib" data-delsub="${s.id}" aria-label="Delete subtask" style="width:30px;height:30px">${ic('trash', 15)}</button></div>`).join('') || '<p class="hint">No checklist items yet.</p>'}`;
  modal({ title: t.title, wide: true, body: `<div class="meta" style="margin:0 0 14px">${prioBadge(t.priority)}${statusBadge(t.status)}${cd ? `<span class="badge b-${cd.cls}">${ic('clock', 12)}${cd.text}</span>` : ''}${t.assignment_title ? `<span class="badge b-vio">${ic('assign', 12)}${esc(t.assignment_title)}</span>` : ''}</div>
  <dl class="dl"><dt>Description</dt><dd>${esc(t.description) || '—'}</dd><dt>Category</dt><dd>${esc(t.category) || '—'}</dd><dt>Start</dt><dd>${fDT(t.start_at)}</dd><dt>Due</dt><dd>${fDT(t.due_at)}</dd><dt>Estimate</dt><dd>${t.est_minutes != null ? t.est_minutes + ' min' : '—'}</dd><dt>Time spent</dt><dd>${t.actual_minutes != null ? t.actual_minutes + ' min' : '—'}</dd><dt>Notes</dt><dd>${esc(t.notes) || '—'}</dd>
  <dt>Status</dt><dd><select id="td-status" style="max-width:200px">${['todo', 'in_progress', 'completed'].map(s => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select></dd>
  <dt>Visibility</dt><dd><select id="td-share" style="max-width:260px"><option value="">Private (only me)</option>${teams.map(x => `<option value="${x.id}" ${t.shared_team_id === x.id ? 'selected' : ''}>Shared with ${esc(x.name)}</option>`).join('')}</select><div class="hint">Shared tasks show title, status and due date to the team — never your notes.</div></dd></dl>
  <h4 style="margin:18px 0 6px">Checklist</h4><div id="td-subs">${subsHtml()}</div><div style="display:flex;gap:8px;margin-top:8px"><input type="text" id="td-newsub" placeholder="Add a checklist item" maxlength="150"><button class="btn" id="td-addsub">Add</button></div>`,
  footer: `<button class="btn dng" id="td-del">${ic('trash', 15)}Delete</button><button class="btn" id="td-edit">${ic('edit', 15)}Edit</button><button class="btn pri" data-close>Done</button>`,
  onMount: root => {
    const refreshSubs = () => { $('#td-subs', root).innerHTML = subsHtml(); };
    $('#td-status', root).onchange = async e => { try { await api(`/tasks/${id}/status`, { method: 'PATCH', body: { status: e.target.value } }); toast('Status updated'); onChange?.(); } catch (x) { fail(x); } };
    $('#td-share', root).onchange = async e => { try { await api(`/tasks/${id}/share`, { method: 'PUT', body: { team_id: e.target.value || null } }); toast(e.target.value ? 'Shared with team' : 'Task is private again'); onChange?.(); } catch (x) { fail(x); } };
    const add = async () => { const i = $('#td-newsub', root), v = i.value.trim(); if (!v) return; try { const r = await api(`/tasks/${id}/subtasks`, { method: 'POST', body: { title: v } }); d.subtasks.push(r.subtask); i.value = ''; refreshSubs(); onChange?.(); } catch (x) { fail(x); } };
    $('#td-addsub', root).onclick = add; $('#td-newsub', root).onkeydown = e => { if (e.key === 'Enter') add(); };
    $('#td-subs', root).onclick = async e => {
      const del = e.target.closest('[data-delsub]'); if (del) { try { await api('/subtasks/' + del.dataset.delsub, { method: 'DELETE' }); d.subtasks = d.subtasks.filter(s => s.id !== del.dataset.delsub); refreshSubs(); onChange?.(); } catch (x) { fail(x); } }
      const cb = e.target.closest('[data-sub]'); if (cb) { try { await api('/subtasks/' + cb.dataset.sub, { method: 'PATCH', body: { done: cb.checked } }); d.subtasks.find(s => s.id === cb.dataset.sub).done = cb.checked; refreshSubs(); onChange?.(); } catch (x) { cb.checked = !cb.checked; fail(x); } }
    };
    $('#td-edit', root).onclick = () => { closeModal(); openTaskForm(t, {}, () => onChange?.()); };
    $('#td-del', root).onclick = async () => { closeModal(); if (await confirmBox('Delete this task?', `“${t.title}” and its checklist will be permanently deleted.`)) { try { await api('/tasks/' + id, { method: 'DELETE' }); toast('Task deleted'); onChange?.(); } catch (x) { fail(x); } } };
  } });
}

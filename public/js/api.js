/* NeonFlow shared helpers: DOM, API client, icons, UI primitives, calendar. No inline handlers (strict CSP). */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
const label = s => cap(String(s || '').replace(/_/g, ' '));
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const IC = { home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>', tasks: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>', cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', assign: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3h6v3H9zM9 12h6M9 16h4"/>', team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 3-5.5 6.5-5.5S15.5 16.4 15.5 20"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.5 0 4.5 1.4 4.5 4"/>', chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/>', file: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>', bot: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>', chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>', plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>', check: '<path d="M20 6L9 17l-5-5"/>', edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>', clip: '<path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>', download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>', upload: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>', menu: '<path d="M3 6h18M3 12h18M3 18h18"/>', chevL: '<path d="M15 18l-6-6 6-6"/>', chevR: '<path d="M9 18l6-6-6-6"/>', flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', alert: '<path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>', logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>', reply: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>', link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>', kanban: '<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="8" rx="1"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>', refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', collapse: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>' };
const ic = (n, s) => `<svg class="i" viewBox="0 0 24 24"${s ? ` style="font-size:${s}px"` : ''} aria-hidden="true">${IC[n] || ''}</svg>`;
const avatar = (name, cls = '') => { const h = [...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % 360; return `<div class="av ${cls}" style="background:linear-gradient(135deg,hsl(${h} 75% 55%),hsl(${(h + 50) % 360} 80% 55%))">${esc(String(name).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</div>`; };
/* dates */
const fDate = (d, o = { month: 'short', day: 'numeric' }) => d ? new Date(d).toLocaleDateString(undefined, o) : '—';
const fTime = d => d ? new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
const fDT = d => d ? `${fDate(d)}, ${fTime(d)}` : '—';
const ago = s => { const m = Math.round((Date.now() - new Date(s)) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : fDate(s); };
const ymd = d => { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const toLocalInput = d => { if (!d) return ''; const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
const fromLocalInput = v => v ? new Date(v).toISOString() : null;
function countdown(due, done) {
  if (done) return { text: 'Done', cls: 'completed' };
  const ms = new Date(due) - Date.now(), a = Math.abs(ms), m = Math.round(a / 6e4), h = Math.round(a / 36e5), d = Math.floor(a / 864e5);
  const t = m < 60 ? m + ' min' : h < 48 ? h + ' hr' : d + ' days';
  return ms < 0 ? { text: `Overdue by ${t}`, cls: 'overdue' } : { text: `Due in ${t}`, cls: ms < 864e5 ? 'medium' : 'low' };
}
const fSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
/* API client (cookie session; server enforces all authorization) */
async function api(path, { method = 'GET', body, form } = {}) {
  const sep = path.includes('?') ? '&' : '?';
  let r;
  try { r = await fetch('/api' + path + (method === 'GET' ? `${sep}tz=${encodeURIComponent(TZ)}` : ''), { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: form || (body ? JSON.stringify(body) : undefined) }); }
  catch { throw Object.assign(new Error('You appear to be offline. Check your connection and try again.'), { net: true }); }
  let d = null; try { d = await r.json(); } catch { /* empty */ }
  if (!r.ok) {
    const e = new Error(d?.error || 'Something went wrong. Please try again.'); e.status = r.status; e.fields = d?.fields;
    if (r.status === 401 && !/login|register/.test(location.pathname)) location.href = '/login.html?expired=1';
    throw e;
  }
  return d;
}
async function uploadFile(file, meta) { const fd = new FormData(); fd.append('file', file); Object.entries(meta).forEach(([k, v]) => v && fd.append(k, v)); return (await api('/files', { method: 'POST', form: fd })).file; }
/* UI primitives */
function toast(msg, type = 'ok') { const e = document.createElement('div'); e.className = 'toast ' + (type === 'ok' ? '' : type); e.innerHTML = `${ic(type === 'error' ? 'alert' : 'check', 16)}<span>${esc(msg)}</span>`; $('#toasts').append(e); setTimeout(() => { e.style.transition = '.3s'; e.style.opacity = 0; setTimeout(() => e.remove(), 300); }, 3600); }
const fail = x => { if (x?.status !== 401) toast(x?.message || 'Something went wrong.', 'error'); };
let _close = null;
function modal({ title, body, footer = '', wide = false, onMount }) {
  const root = $('#modal-root'); root.innerHTML = `<div class="mod ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="mh"><h3>${esc(title)}</h3><button class="ib" data-close aria-label="Close">${ic('x')}</button></div><div class="mbody">${body}</div>${footer ? `<div class="mf">${footer}</div>` : ''}</div>`;
  root.classList.add('on'); document.body.classList.add('lock');
  _close = () => { root.classList.remove('on'); root.innerHTML = ''; document.body.classList.remove('lock'); _close = null; };
  root.onclick = e => { if (e.target === root || e.target.closest('[data-close]')) _close?.(); };
  if (onMount) onMount(root, _close); setTimeout(() => $('input:not([type=radio]):not([type=checkbox]),textarea', root)?.focus(), 40);
  return _close;
}
const closeModal = () => _close?.();
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
const confirmBox = (title, msg, okLabel = 'Delete') => new Promise(res => {
  modal({ title, body: `<p class="hint" style="font-size:14px">${esc(msg)}</p>`, footer: `<button class="btn" data-close>Cancel</button><button class="btn dng" id="cb-ok">${esc(okLabel)}</button>`, onMount: (r) => { $('#cb-ok', r).onclick = () => { closeModal(); res(true); }; r.addEventListener('click', e => { if (e.target === r || e.target.closest('[data-close]')) res(false); }); } });
});
const skeleton = (n = 3, h = 90) => `<div class="grid ${n > 1 ? 'g' + Math.min(n, 3) : ''}">${Array.from({ length: n }, () => `<div class="sk" style="height:${h}px"></div>`).join('')}</div>`;
const empty = (icon, title, text, btn = '') => `<div class="empty"><div class="eic">${ic(icon)}</div><h4>${esc(title)}</h4><p>${esc(text)}</p>${btn}</div>`;
const errState = (x, retryId = 'retry') => `<div class="card">${empty('alert', x?.net ? 'You are offline' : 'We couldn’t load this', x?.message || 'Please try again.', `<button class="btn pri" id="${retryId}">Try again</button>`)}</div>`;
function showErrors(form, fields = {}) {
  $$('.err', form).forEach(e => e.remove()); $$('.bad', form).forEach(e => e.classList.remove('bad')); let first = null;
  for (const [k, m] of Object.entries(fields)) { const el = form.elements[k]; if (!el) continue; el.classList.add('bad'); const s = document.createElement('small'); s.className = 'err'; s.textContent = m; (el.closest('.field') || el.parentElement).append(s); first ||= el; }
  first?.focus(); return !Object.keys(fields).length;
}
function setLoading(btn, on) { if (!btn) return; btn.disabled = on; btn.classList.toggle('ld', on); }
const fileChip = (f, name, size) => `<a class="file" href="/api/files/${f}/download">${ic('file', 15)}<span>${esc(name)}</span>${size ? `<small class="hint">${fSize(size)}</small>` : ''}</a>`;
const prioBadge = p => `<span class="badge b-${p}">${ic('flag', 12)}${cap(p)}</span>`;
const statusBadge = s => `<span class="badge b-${s}">${label(s)}</span>`;
/* Month calendar used by the Calendar page and the Tasks calendar view */
function renderMonth(el, { date, items, onDay, onItem }) {
  const cur = new Date(date), first = new Date(cur.getFullYear(), cur.getMonth(), 1), start = new Date(first); start.setDate(1 - first.getDay());
  const by = {}; items.forEach(i => (by[ymd(i.at)] ||= []).push(i));
  let h = '<div class="cal">' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="h">${d}</div>`).join('');
  for (let n = 0; n < 42; n++) {
    const d = new Date(start); d.setDate(start.getDate() + n); const k = ymd(d), list = by[k] || [];
    h += `<div class="cell ${d.getMonth() !== cur.getMonth() ? 'o' : ''} ${k === ymd(new Date()) ? 'td' : ''}" data-day="${k}" tabindex="0"><span class="d">${d.getDate()}</span>${list.slice(0, 3).map(i => `<button class="ev ${i.kind === 'assignment' ? 'asg' : i.priority} ${i.done ? 'dn' : ''}" data-item="${i.kind}:${i.id}" title="${esc(i.title)}">${esc(i.title)}</button>`).join('')}${list.length > 3 ? `<small class="hint">+${list.length - 3} more</small>` : ''}</div>`;
  }
  el.innerHTML = h + '</div>';
  el.onclick = e => { const it = e.target.closest('[data-item]'); if (it) { const [k, id] = it.dataset.item.split(':'); return onItem?.(k, id); } const c = e.target.closest('[data-day]'); if (c) onDay?.(c.dataset.day); };
}
/* Chart.js helpers (theme-aware) */
const cv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function chartBase() { if (window.Chart) { Chart.defaults.color = cv('--mu'); Chart.defaults.borderColor = 'rgba(148,163,184,.14)'; Chart.defaults.font.family = 'Inter, system-ui, sans-serif'; } }
const mkChart = (el, cfg) => { chartBase(); if (el._c) el._c.destroy(); cfg.options = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 } } }, ...cfg.options }; return (el._c = new Chart(el, cfg)); };
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const isOverdue = t => t.status !== 'completed' && t.due_at && new Date(t.due_at) < new Date();

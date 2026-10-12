const { AppError } = require('../middleware/error');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isUuid = v => typeof v === 'string' && UUID.test(v);
class V {
  constructor(b) { this.b = b && typeof b === 'object' ? b : {}; this.f = {}; this.o = {}; }
  str(k, { min = 0, max = 255, req = false, label = k } = {}) {
    let v = this.b[k]; v = v == null ? '' : String(v).trim();
    if (!v) { if (req) this.f[k] = `${label} is required.`; }
    else if (v.length < min) this.f[k] = `${label} must be at least ${min} characters.`;
    else if (v.length > max) this.f[k] = `${label} must be at most ${max} characters.`;
    this.o[k] = v; return this;
  }
  email(k = 'email') {
    const v = String(this.b[k] ?? '').trim().toLowerCase();
    if (!EMAIL.test(v) || v.length > 255) this.f[k] = 'Enter a valid email address.';
    this.o[k] = v; return this;
  }
  password(k = 'password') {
    const v = this.b[k];
    if (typeof v !== 'string' || v.length < 8 || v.length > 72 || !/[a-z]/i.test(v) || !/\d/.test(v)) this.f[k] = 'Use 8–72 characters with at least one letter and one number.';
    this.o[k] = v; return this;
  }
  oneOf(k, list, def) {
    let v = this.b[k]; if (v == null || v === '') v = def;
    if (!list.includes(v)) this.f[k] = `Choose one of: ${list.join(', ')}.`;
    this.o[k] = v; return this;
  }
  int(k, { min = 0, max = 1e9, def = null, label = k } = {}) {
    const raw = this.b[k];
    if (raw == null || raw === '') this.o[k] = def;
    else { const n = Number(raw); if (!Number.isInteger(n) || n < min || n > max) this.f[k] = `${label} must be a whole number between ${min} and ${max}.`; this.o[k] = n; }
    return this;
  }
  date(k, { req = false, label = k } = {}) {
    const raw = this.b[k];
    if (raw == null || raw === '') { if (req) this.f[k] = `${label} is required.`; this.o[k] = null; }
    else { const t = Date.parse(raw); if (isNaN(t)) this.f[k] = 'Enter a valid date.'; else this.o[k] = new Date(t).toISOString(); }
    return this;
  }
  uuid(k, { req = false } = {}) {
    const v = this.b[k];
    if (v == null || v === '') { if (req) this.f[k] = 'This field is required.'; this.o[k] = null; }
    else if (!isUuid(v)) this.f[k] = 'Invalid selection.'; else this.o[k] = v;
    return this;
  }
  bool(k, def = false) { const v = this.b[k]; this.o[k] = v === undefined ? def : (v === true || v === 'true'); return this; }
  fail(k, m) { this.f[k] = m; return this; }
  done() { if (Object.keys(this.f).length) throw new AppError(400, 'Please fix the highlighted fields.', this.f); return this.o; }
}
exports.V = V; exports.isUuid = isUuid;
exports.need = id => { if (!isUuid(id)) throw new AppError(404, 'Not found.'); return id; };

exports.tzOf = req => { try { const z = String(req.query.tz || 'UTC'); new Intl.DateTimeFormat('en', { timeZone: z }); return z; } catch { return 'UTC'; } };
exports.like = s => '%' + String(s).slice(0, 100).replace(/[\\%_]/g, '\\$&') + '%';
